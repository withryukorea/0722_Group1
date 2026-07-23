// [P3] 영수증 업로드 → OCR → Receipt JSON 반환
// ─────────────────────────────────────────────────────────────
// 실제 OCR API 없이도 데모가 100% 재현되도록 WoZ 폴백을 사용한다:
//   fixtures/receipts-ocr/ 의 사전매핑 결과(데모 영수증 7종, 카드거래 tx_001~007과 1:1)
// 앱은 폴백이든 실제 OCR이든 동일한 Receipt JSON을 받는다 (docs/04 §4).
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { db, nextReceiptId, recomputeUsage } = require("../store");
const { suggestPreset } = require("./presets");

const router = express.Router();

/* 환율 조회 — fx.json이 {rates:{...}} 구조든 평면 맵이든 동작 */
function fxRateOf(cur) {
  const t = db.fx && db.fx.rates ? db.fx.rates : db.fx || {};
  return t[cur] || 1;
}


const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 15 * 1024 * 1024 } });

const WOZ_DIR = path.join(__dirname, "..", "..", "fixtures", "receipts-ocr");
const WOZ_INDEX = JSON.parse(fs.readFileSync(path.join(WOZ_DIR, "index.json"), "utf-8")).receipts;
const wozData = (file) => JSON.parse(fs.readFileSync(path.join(WOZ_DIR, file), "utf-8"));

/* WoZ 폴백 선택:
 *   ① body.key/query.key 로 지정하면 그대로
 *   ② 아직 안 쓴 데모 영수증 중, "기대 매칭 거래(expectedTxId)가 아직 미매칭"인 것을 우선 고른다.
 *      (시드 영수증이 이미 tx_001/003/007 을 매칭 소비한 상태라, 예전엔 첫 업로드가 coffee→tx_001 로
 *       잡혀 매칭에 실패했다. 소비된 거래를 겨냥하는 WoZ 는 건너뛰어 첫 업로드가 바로 매칭되게 한다 — #8) */
function pickWoz(key) {
  if (key) return WOZ_INDEX.find((w) => w.key === key) || null;
  const used = new Set(db.receipts.map((r) => r.wozKey).filter(Boolean));
  const txFree = (txId) => {
    const tx = db.transactions.find((t) => t.id === txId);
    return tx && tx.status === "unmatched"; // 아직 아무 영수증과도 안 물린 거래
  };
  return (
    WOZ_INDEX.find((w) => !used.has(w.key) && txFree(w.expectedTxId)) || // 미사용 + 매칭 가능한 거래 겨냥
    WOZ_INDEX.find((w) => !used.has(w.key)) ||                            // 폴백: 남은 게 겹쳐도 아무거나
    null
  );
}

/* ── 실 OCR (Letsur AI Gateway, server/.env) — 실패 시 WoZ 폴백 (sot: 서버 OCR + WoZ) ── */
const OCR_PROMPT = `영수증 이미지에서 다음 정보를 JSON으로만 답하세요(설명 금지):
{"merchant":"가맹점명","amount":숫자,"currency":"KRW|USD|JPY","paidAt":"ISO8601(+09:00, 결제/승인 일시. 예매성 결제도 승인일)","serviceDate":"YYYY-MM-DD(탑승/투숙 등 실제 이용일, 없으면 null)","vat":숫자또는null,"invoiceNo":"문서번호 또는 null","items":[{"name":"품목","amount":숫자}],"confidence":0~1}`;

async function realOcr(filePath, mimetype) {
  const key = process.env.LETSUR_API_KEY;
  if (!key || typeof fetch !== "function") return null;
  try {
    const b64 = fs.readFileSync(filePath).toString("base64");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const resp = await fetch(`${process.env.LETSUR_BASE_URL || "https://gw.letsur.ai"}/v1/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OCR_MODEL || "gpt-4o",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: OCR_PROMPT },
            { type: "image_url", image_url: { url: `data:${mimetype || "image/jpeg"};base64,${b64}` } },
          ],
        }],
      }),
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || "";
    const json = text.match(/\{[\s\S]*\}/);
    return json ? JSON.parse(json[0]) : null;
  } catch (e) {
    return null; // 어떤 실패든 WoZ 폴백으로
  }
}

/* 환율 반영: 원본 통화 보존 + 결제 시점 환율/원화 환산액을 함께 저장 (data_sample 환율 규칙) */
function fxFields(ocr) {
  const cur = ocr.currency || "KRW";
  const rate = cur === "KRW" ? 1 : fxRateOf(cur);
  return { fxRate: rate, amountKRW: Math.round((Number(ocr.amount) || 0) * rate) };
}

/* 적격증빙·부가세·중복문서 경고 (경고만, 상신 차단 없음 — sot Non-Goals) */
function buildChecks(ocr, receiptId) {
  const checks = [];
  const itemized = /편의점|마트|슈퍼|GS25|\bCU\b|스토리웨이|STORYWAY/i.test(ocr.merchant || "");
  if (itemized && !(ocr.items || []).length) {
    checks.push({ type: "ITEMIZED_REQUIRED", status: "warn", message: "편의점·마트 결제 — 품목 상세내역 증빙 필요" });
  }
  if ((ocr.confidence ?? 1) < 0.9) {
    checks.push({ type: "VAT_CHECK", status: "info", message: "OCR 신뢰도 낮음 — 부가세 확인 필요" });
  }
  if (ocr.invoiceNo) {
    const dup = db.receipts.find((r) => r.id !== receiptId && r.ocr && r.ocr.invoiceNo === ocr.invoiceNo);
    if (dup) checks.push({ type: "DUPLICATE_DOCUMENT", status: "warn", message: `같은 문서번호(${ocr.invoiceNo})의 영수증/인보이스가 이미 등록됨 (${dup.id}) — 중복 전표 주의` });
  }
  return checks;
}

// POST /api/receipts — multipart(image[, cropped]) 또는 JSON { key, tripId, serviceDate, source }
// 원본(image)은 항상 보존, 크롭본(cropped)은 별도 파일 — 없으면 원본을 그대로 크롭본으로 사용 (sot/02 유입 흐름 3단계)
router.post("/", upload.fields([{ name: "image", maxCount: 1 }, { name: "cropped", maxCount: 1 }]), async (req, res) => {
  const id = nextReceiptId();
  const original = req.files && req.files.image ? req.files.image[0] : null;
  const cropped = req.files && req.files.cropped ? req.files.cropped[0] : null;
  // 1) 실 OCR (키가 있고 이미지가 올라온 경우 — 크롭본 우선) → 2) WoZ 폴백
  const ocrTarget = cropped || original;
  let ocr = ocrTarget ? await realOcr(ocrTarget.path, ocrTarget.mimetype) : null;
  let woz = null;
  if (!ocr) {
    woz = pickWoz((req.body && req.body.key) || req.query.key);
    ocr = woz
      ? wozData(woz.file).ocr
      : { merchant: "", amount: 0, currency: "KRW", paidAt: null, items: [], confidence: 0.3 };
  }

  const serviceDate = (req.body && req.body.serviceDate) || ocr.serviceDate || (ocr.paidAt || "").slice(0, 10) || null;
  const receipt = {
    id,
    source: (req.body && req.body.source) === "pc" ? "pc" : "mobile", // mobile(촬영) | pc(이어카운팅 업로드)
    imageUrl: original ? `/uploads/${original.filename}` : `/api/receipts/${id}/image`,
    croppedUrl: cropped ? `/uploads/${cropped.filename}`
      : original ? `/uploads/${original.filename}` : `/api/receipts/${id}/image`,
    crop: { status: cropped ? "auto" : "original", updatedAt: new Date().toISOString() }, // auto|manual|original
    ocr,
    ...fxFields(ocr),                       // fxRate, amountKRW — 화면·한도차감은 amountKRW 사용
    serviceDate,                            // 출장 기간 판정용 (매칭은 paidAt)
    vat: { extracted: ocr.vat ?? null, confirmed: null },
    checks: buildChecks(ocr, id),
    suggestedPresetId: suggestPreset(ocr, serviceDate),  // 자동추천 — 최종 선택은 항상 사용자
    presetId: null,
    accountCode: null,
    matchedTxId: null,
    tripId: (req.body && req.body.tripId) || null,
    wozKey: woz ? woz.key : null,
    uploadedFile: original ? original.filename : null,
    croppedFile: cropped ? cropped.filename : null,
    createdAt: new Date().toISOString(),
  };
  db.receipts.push(receipt);
  res.status(201).json(receipt);
});

// POST /api/receipts/:id/crop — 재크롭(파일 교체) 또는 크롭 실패 시 원본 사용 확정 (sot/02 유입 흐름 4단계)
// multipart(cropped) → 크롭본 교체 / JSON { useOriginal: true } → 원본으로 폴백
router.post("/:id/crop", upload.single("cropped"), (req, res) => {
  const r = db.receipts.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "receipt not found" });
  if (req.file) {
    r.croppedFile = req.file.filename;
    r.croppedUrl = `/uploads/${req.file.filename}`;
    r.crop = { status: "manual", updatedAt: new Date().toISOString() };
  } else if (req.body && req.body.useOriginal) {
    r.croppedFile = null;
    r.croppedUrl = r.imageUrl;
    r.crop = { status: "original", updatedAt: new Date().toISOString() };
  } else {
    return res.status(400).json({ error: "NO_CROP_INPUT", hint: "multipart 'cropped' 파일 또는 { useOriginal: true } 를 보내주세요" });
  }
  res.json(r);
});

// PATCH /api/receipts/bulk — 여러 영수증을 한 번에 정산단위(Preset)에 담기/빼기 (세트 편집·가감)
// body: { ids: string[], presetId: string|null }  presetId=null 이면 소속 해제
// ※ 반드시 "/:id" 라우트보다 먼저 등록해야 한다 (안 그러면 /bulk 가 :id="bulk" 로 잡힘)
router.patch("/bulk", (req, res) => {
  const b = req.body || {};
  const ids = Array.isArray(b.ids) ? b.ids : [];
  if (!ids.length) return res.status(400).json({ error: "EMPTY_IDS", hint: "ids 배열에 영수증 1개 이상이 필요합니다." });

  let preset = null;
  if (b.presetId != null) {
    preset = db.presets.find((x) => x.id === b.presetId && x.active !== false);
    if (!preset) return res.status(400).json({ error: "INVALID_PRESET", hint: "활성 Preset이 아닙니다" });
  }

  const updated = [];
  const missing = [];
  for (const id of ids) {
    const r = db.receipts.find((x) => x.id === id);
    if (!r) { missing.push(id); continue; }
    if (b.presetId == null) {
      r.presetId = null; // 세트에서 빼기 — accountCode 는 유지
    } else {
      r.presetId = preset.id;
      // 허용 비목이 1개뿐인 프리셋이면 자동 세팅 (기존 단건 PATCH 와 동일 규칙, 이미 값 있으면 유지)
      if ((preset.rules.allowedAccountCodes || []).length === 1 && !r.accountCode) {
        r.accountCode = preset.rules.allowedAccountCodes[0];
      }
    }
    updated.push(r);
  }

  recomputeUsage(db); // 소속 변경분을 usage 단일 소스에서 즉시 재집계 (매칭된 영수증만 반영)
  res.json({ updated: updated.length, presetId: b.presetId ?? null, missing, receipts: updated });
});

// PATCH /api/receipts/:id — 사용자가 OCR 파싱값 수정·Preset·비목·부가세를 확정 (sot/05, 유입 흐름 6단계)
router.patch("/:id", (req, res) => {
  const r = db.receipts.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "receipt not found" });
  const b = req.body || {};

  // OCR 부분 수정 (예: { ocr: { amount: 9000, merchant: "..." } }) → 환산액·경고·자동추천 재계산
  if (b.ocr && typeof b.ocr === "object") {
    Object.assign(r.ocr, b.ocr);
    const fx = fxFields(r.ocr);
    r.fxRate = fx.fxRate;
    r.amountKRW = fx.amountKRW;
    if (b.ocr.vat !== undefined) r.vat.extracted = b.ocr.vat;
    if (b.ocr.serviceDate && b.serviceDate === undefined) r.serviceDate = b.ocr.serviceDate;
    r.checks = buildChecks(r.ocr, r.id);
    r.suggestedPresetId = suggestPreset(r.ocr, r.serviceDate); // 추천만 갱신 — 사용자가 고른 presetId 는 유지
  }

  if (b.presetId !== undefined) {
    if (b.presetId === null) {
      r.presetId = null; // 일반 결제(Preset 없음)로 변경
    } else {
      const p = db.presets.find((x) => x.id === b.presetId && x.active !== false);
      if (!p) return res.status(400).json({ error: "INVALID_PRESET", hint: "활성 Preset이 아닙니다" });
      r.presetId = p.id;
      // 허용 비목이 1개면 자동 세팅 (리뷰 화면에서 비목 선택 단계 생략)
      if ((p.rules.allowedAccountCodes || []).length === 1 && !b.accountCode) {
        r.accountCode = p.rules.allowedAccountCodes[0];
      }
    }
  }
  if (b.accountCode !== undefined) {
    if (r.presetId) {
      const p = db.presets.find((x) => x.id === r.presetId);
      if (p && !(p.rules.allowedAccountCodes || []).includes(b.accountCode)) {
        return res.status(400).json({ error: "ACCOUNT_NOT_ALLOWED", allowed: p.rules.allowedAccountCodes });
      }
    }
    r.accountCode = b.accountCode;
  }
  if (b.vat !== undefined) r.vat = { ...r.vat, confirmed: typeof b.vat === "object" ? b.vat.confirmed : b.vat };
  if (b.serviceDate !== undefined) r.serviceDate = b.serviceDate;
  if (b.tripId !== undefined) r.tripId = b.tripId;
  if (b.source === "mobile" || b.source === "pc") r.source = b.source;
  // 소속(presetId)이나 비목(accountCode)이 바뀌면 usage 를 재집계 (bulk 와 동일 단일 소스 유지)
  if (b.presetId !== undefined || b.accountCode !== undefined) recomputeUsage(db);
  res.json(r);
});

// GET /api/receipts — 전체 목록 / GET /api/receipts/:id — 단건
router.get("/", (req, res) => res.json(db.receipts));
router.get("/:id", (req, res) => {
  const r = db.receipts.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "receipt not found" });
  res.json(r);
});

// GET /api/receipts/:id/image — 업로드 원본이 있으면 그 파일, 없으면(WoZ) OCR 값으로 그린 영수증 이미지(SVG)
// → 이어카운팅 문서함/전표 화면에서 '증빙 열람'이 항상 동작하게 하는 장치
router.get("/:id/image", (req, res) => {
  const r = db.receipts.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "receipt not found" });
  if (r.uploadedFile) return res.sendFile(path.join(UPLOAD_DIR, r.uploadedFile));

  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const o = r.ocr || {};
  const items = o.items || [];
  const h = 300 + items.length * 26;
  const itemRows = items.map((it, i) =>
    `<text x="28" y="${196 + i * 26}" font-size="13" fill="#333">${esc(it.name)}</text>
     <text x="292" y="${196 + i * 26}" font-size="13" fill="#333" text-anchor="end">${(it.amount || 0).toLocaleString("ko-KR")}</text>`
  ).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="${h}" font-family="sans-serif">
    <rect width="320" height="${h}" fill="#fff" stroke="#c9cfd8" stroke-dasharray="5 3"/>
    <text x="160" y="44" font-size="17" font-weight="bold" text-anchor="middle" fill="#222">${esc(o.merchant)}</text>
    <text x="160" y="68" font-size="12" text-anchor="middle" fill="#777">${esc(o.paidAt || "")}</text>
    <text x="160" y="92" font-size="11" text-anchor="middle" fill="#aaa">[ 데모 영수증 · ${esc(r.id)} ]</text>
    <line x1="20" y1="110" x2="300" y2="110" stroke="#ddd"/>
    <text x="28" y="140" font-size="13" fill="#555">품목</text>
    <text x="292" y="140" font-size="13" fill="#555" text-anchor="end">금액</text>
    <line x1="20" y1="156" x2="300" y2="156" stroke="#eee"/>
    ${itemRows}
    <line x1="20" y1="${h - 84}" x2="300" y2="${h - 84}" stroke="#ddd"/>
    <text x="28" y="${h - 52}" font-size="15" font-weight="bold" fill="#111">합계</text>
    <text x="292" y="${h - 52}" font-size="16" font-weight="bold" fill="#111" text-anchor="end">${(o.amount || 0).toLocaleString("ko-KR")} ${esc(o.currency || "KRW")}</text>
    <text x="160" y="${h - 20}" font-size="10" text-anchor="middle" fill="#bbb">OCR confidence ${o.confidence ?? "-"}</text>
  </svg>`;
  res.type("image/svg+xml").send(svg);
});

module.exports = router;
