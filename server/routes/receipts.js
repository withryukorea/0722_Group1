// [P3] 영수증 업로드 → 자동크롭 → OCR → Receipt JSON 반환
// ─────────────────────────────────────────────────────────────
// 담당(P3)이 여기를 구현하세요. 지금은 501(미구현)을 반환합니다.
//
// 구현할 것 (02-API-CONTRACT.md 참고):
//   POST /api/receipts  (multipart, 이미지 파일)
//     → 이미지 저장 → (자동크롭) → Vision LLM 호출로 OCR
//     → Receipt 객체 반환 { id, imageUrl, croppedUrl, ocr:{merchant,amount,currency,paidAt,...} }
//   ※ 데모 영수증은 fixtures/receipts-ocr/ 에 기대 결과를 캐시해두고 재사용하면 데모가 안정적입니다.
//   ※ 파일 업로드가 필요하면 multer 패키지를 server/package.json 에 추가하세요.
const express = require("express");
const router = express.Router();

router.post("/", (req, res) => {
  res.status(501).json({ error: "NOT_IMPLEMENTED", owner: "P3", hint: "server/routes/receipts.js 를 구현하세요" });
});

module.exports = router;
