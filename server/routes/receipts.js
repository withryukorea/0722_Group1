// [P3] 영수증 업로드 → OCR → Receipt JSON 반환
// ─────────────────────────────────────────────────────────────
// 하이브리드 OCR (2026-07-23):
//   · 실제 이미지 업로드(multipart image) → Vision OCR(ocr.js). 성공한 인식만 저장,
//     키 미설정·인식 실패 시 저장하지 않고 정직한 오류 반환 (WoZ 폴백 금지) — Codex real-OCR 반영
//   · 데모 샘플칩(JSON {key}, 이미지 없음) → fixtures/receipts-ocr WoZ 픽스처(데모 9종 — tx_001~007 7종
//     + data_sample 실물 2종 tx_305/tx_307). 실물 샘플 사진이 있으면 그걸 증빙으로 사용. 데모 재현용 유지
//   · 시드 영수증(rcpt_101~)도 그대로 보존 — "새 영수증만 실 OCR, 기존 데모·기록은 유지"
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { db, nextReceiptId, recomputeUsage } = require("../store");
const { suggestPreset } = require("./presets");
const { recognizeReceipt } = require("../ocr");
const persistence = require("../persistence");

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

/* WoZ 항목의 imageUrl이 실제 존재하는 정적 파일(실물 샘플 사진 등)을 가리키면 그 사진을 증빙으로 쓴다.
 * 파일이 없으면 null → 기존 SVG 증빙(/api/receipts/:id/image) 폴백 그대로라 기존 7종 동작은 불변. */
const WOZ_IMG_ROOTS = { "/data_sample/": path.join(__dirname, "..", ".."), "/uploads/": path.join(__dirname, "..") };
function wozImageUrl(woz) {
  const url = woz && wozData(woz.file).imageUrl;
  if (!url) return null;
  for (const [prefix, root] of Object.entries(WOZ_IMG_ROOTS)) {
    if (url.startsWith(prefix) && fs.existsSync(path.join(root, decodeURIComponent(url)))) return url;
  }
  return null;
}

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

/* 실패한 업로드 파일 정리 + OCR 실패 응답 (저장하지 않음 — 성공 위장 금지) */
function removeUpload(file) {
  if (!file || !file.path) return;
  try { fs.unlinkSync(file.path); } catch (e) { /* best-effort */ }
}
function failOcr(res, result, files) {
  (files || []).forEach(removeUpload);
  const error = result.error || {};
  return res.status(error.status || 502).json({
    error: error.code || "OCR_FAILED",
    message: error.message || "영수증을 인식하지 못했습니다.",
    providerStatus: error.providerStatus,
    ocrMode: "failed",
    saved: false,
  });
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

// POST /api/receipts
//   · multipart image(+cropped) → 실제 Vision OCR(ocr.js). 성공한 인식만 저장, 실패는 오류 반환(폴백 금지).
//   · JSON { key }(이미지 없음) → WoZ 데모 픽스처(연출용 샘플칩·데모 재현). 유지.
router.post("/", upload.fields([{ name: "image", maxCount: 1 }, { name: "cropped", maxCount: 1 }]), async (req, res) => {
  const original = req.files && req.files.image ? req.files.image[0] : null;
  const cropped = req.files && req.files.cropped ? req.files.cropped[0] : null;
  const demoKey = (req.body && req.body.key) || req.query.key;

  let ocr, woz = null, ocrMode;
  if (original) {
    // 실제 이미지 업로드 → 실 OCR. 성공 인식만 저장, 실패는 저장하지 않고 정직한 오류(WoZ 폴백 금지).
    const result = await recognizeReceipt((cropped || original).path, (cropped || original).mimetype);
    if (!result.ok) return failOcr(res, result, [original, cropped]);
    ocr = result.ocr;
    ocrMode = "real";
  } else {
    // 이미지 없이 온 요청 = 데모 샘플칩({key}) — WoZ 픽스처로 데모 재현. (실 업로드 아님)
    if (!demoKey) {
      removeUpload(cropped);
      return res.status(400).json({
        error: "IMAGE_REQUIRED",
        message: "실제 OCR용 이미지 또는 명시적인 데모 key가 필요합니다.",
        ocrMode: "failed", saved: false,
      });
    }
    woz = pickWoz(demoKey);
    if (!woz) {
      removeUpload(cropped);
      return res.status(400).json({
        error: "INVALID_DEMO_KEY",
        message: "등록되지 않은 데모 key입니다.",
        ocrMode: "failed", saved: false,
      });
    }
    ocr = wozData(woz.file).ocr;
    ocrMode = "woz";
  }

  const id = nextReceiptId();
  let storedFiles = null;
  if (original && persistence.isCloudEnabled()) {
    try {
      const storedOriginal = await persistence.uploadReceiptFile(id, "original", original);
      const storedCropped = cropped
        ? await persistence.uploadReceiptFile(id, "cropped", cropped)
        : storedOriginal;
      storedFiles = {
        originalPath: storedOriginal.path,
        originalContentType: storedOriginal.contentType,
        croppedPath: storedCropped.path,
        croppedContentType: storedCropped.contentType,
      };
      removeUpload(original);
      if (cropped) removeUpload(cropped);
    } catch (error) {
      removeUpload(original);
      removeUpload(cropped);
      return res.status(503).json({
        error: "STORAGE_UPLOAD_FAILED",
        message: "영수증 이미지를 영구 저장하지 못했습니다.",
        detail: error.message || String(error),
        ocrMode: "failed",
        saved: false,
      });
    }
  }
  const serviceDate = (req.body && req.body.serviceDate) || ocr.serviceDate || (ocr.paidAt || "").slice(0, 10) || null;
  const wozImg = !original && woz ? wozImageUrl(woz) : null; // 업로드 없이 데모키로 만든 건은 실물 샘플 사진을 증빙으로
  const receipt = {
    id,
    ocrMode,                                 // real(실 OCR 인식) | woz(데모 샘플)
    source: (req.body && req.body.source) === "pc" ? "pc" : "mobile", // mobile(촬영) | pc(이어카운팅 업로드)
    imageUrl: storedFiles ? `/api/receipts/${id}/image?variant=original`
      : original ? `/uploads/${original.filename}` : wozImg || `/api/receipts/${id}/image`,
    croppedUrl: storedFiles ? `/api/receipts/${id}/image?variant=cropped`
      : cropped ? `/uploads/${cropped.filename}`
      : original ? `/uploads/${original.filename}` : wozImg || `/api/receipts/${id}/image`,
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
    uploadedFile: original && !storedFiles ? original.filename : null,
    croppedFile: cropped && !storedFiles ? cropped.filename : null,
    storage: storedFiles,
    createdAt: new Date().toISOString(),
  };
  db.receipts.push(receipt);
  res.status(201).json(receipt);
});

// GET /api/receipts/ocr-status — 비밀값 없이 실 OCR 설정 여부만 (반드시 "/:id" 보다 먼저 등록)
router.get("/ocr-status", (req, res) => {
  res.json({
    configured: Boolean(process.env.LETSUR_API_KEY), // 실 OCR 키 설정 여부
    model: process.env.OCR_MODEL || "gpt-4o",
    demoKeyFallback: true,      // 데모 샘플 key({key}) 경로는 WoZ로 유지됨
    actualUploadFallback: false, // 실 이미지 업로드는 WoZ로 폴백하지 않음(정직한 실패)
  });
});

// POST /api/receipts/:id/crop — 재크롭(파일 교체) 또는 크롭 실패 시 원본 사용 확정 (sot/02 유입 흐름 4단계)
// multipart(cropped) → 크롭본 교체 / JSON { useOriginal: true } → 원본으로 폴백
router.post("/:id/crop", upload.single("cropped"), async (req, res) => {
  const r = db.receipts.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "receipt not found" });
  if (req.file) {
    if (persistence.isCloudEnabled()) {
      try {
        const stored = await persistence.uploadReceiptFile(r.id, "cropped", req.file);
        r.storage = {
          ...(r.storage || {}),
          croppedPath: stored.path,
          croppedContentType: stored.contentType,
        };
        r.croppedFile = null;
        r.croppedUrl = `/api/receipts/${r.id}/image?variant=cropped`;
        removeUpload(req.file);
      } catch (error) {
        removeUpload(req.file);
        return res.status(503).json({ error: "STORAGE_UPLOAD_FAILED", message: "크롭 이미지를 영구 저장하지 못했습니다.", saved: false });
      }
    } else {
      r.croppedFile = req.file.filename;
      r.croppedUrl = `/uploads/${req.file.filename}`;
    }
    r.crop = { status: "manual", updatedAt: new Date().toISOString() };
  } else if (req.body && req.body.useOriginal) {
    r.croppedFile = null;
    if (r.storage && r.storage.originalPath) {
      r.storage.croppedPath = r.storage.originalPath;
      r.storage.croppedContentType = r.storage.originalContentType;
    }
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
// no-store: 증빙 미리보기는 캐시에 남기지 않는다 (reference/RECEIPT_PROCESSING_BACKEND_REFERENCE 체크리스트 5)
router.get("/:id/image", async (req, res, next) => {
  const r = db.receipts.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: "receipt not found" });
  res.set("Cache-Control", "no-store");
  if (r.storage && r.storage.originalPath) {
    try {
      const variant = req.query.variant === "cropped" ? "cropped" : "original";
      const objectPath = variant === "cropped"
        ? r.storage.croppedPath || r.storage.originalPath
        : r.storage.originalPath;
      const file = await persistence.downloadReceiptFile(objectPath);
      res.type(file.contentType);
      return res.send(file.buffer);
    } catch (error) {
      return next(error);
    }
  }
  if (r.uploadedFile && fs.existsSync(path.join(UPLOAD_DIR, r.uploadedFile))) {
    return res.sendFile(path.join(UPLOAD_DIR, r.uploadedFile));
  }

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
