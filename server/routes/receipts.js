// [P3] 영수증 업로드 → OCR → Receipt JSON 반환
// ─────────────────────────────────────────────────────────────
// 실제 OCR API 없이도 데모가 100% 재현되도록 WoZ 폴백을 사용한다:
//   fixtures/receipts-ocr/ 의 사전매핑 결과(데모 영수증 7종, 카드거래 tx_001~007과 1:1)
// 앱은 폴백이든 실제 OCR이든 동일한 Receipt JSON을 받는다 (docs/04 §4).
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { db, nextReceiptId } = require("../store");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 15 * 1024 * 1024 } });

const WOZ_DIR = path.join(__dirname, "..", "..", "fixtures", "receipts-ocr");
const WOZ_INDEX = JSON.parse(fs.readFileSync(path.join(WOZ_DIR, "index.json"), "utf-8")).receipts;
const wozData = (file) => JSON.parse(fs.readFileSync(path.join(WOZ_DIR, file), "utf-8"));

/* WoZ 폴백 선택: ① body.key/query.key 로 지정  ② 아직 안 쓴 데모 영수증 중 첫 번째 */
function pickWoz(key) {
  if (key) return WOZ_INDEX.find((w) => w.key === key) || null;
  const used = new Set(db.receipts.map((r) => r.wozKey).filter(Boolean));
  return WOZ_INDEX.find((w) => !used.has(w.key)) || null;
}

// POST /api/receipts — multipart(image) 또는 JSON { key, tripId }
router.post("/", upload.single("image"), (req, res) => {
  const id = nextReceiptId();
  // TODO(P3 여유 시): 여기서 실제 Vision OCR 호출 → 실패하면 아래 WoZ 폴백 그대로 사용
  const woz = pickWoz((req.body && req.body.key) || req.query.key);
  const ocr = woz
    ? wozData(woz.file).ocr
    : { merchant: "", amount: 0, currency: "KRW", paidAt: null, items: [], confidence: 0.3 };

  const receipt = {
    id,
    imageUrl: req.file ? `/uploads/${req.file.filename}` : `/api/receipts/${id}/image`,
    croppedUrl: req.file ? `/uploads/${req.file.filename}` : `/api/receipts/${id}/image`,
    ocr,
    matchedTxId: null,
    tripId: (req.body && req.body.tripId) || null,
    wozKey: woz ? woz.key : null,
    uploadedFile: req.file ? req.file.filename : null,
    createdAt: new Date().toISOString(),
  };
  db.receipts.push(receipt);
  res.status(201).json(receipt);
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
