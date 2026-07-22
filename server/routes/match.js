// [P4] 매칭 + 전표 초안 생성 엔진
// ─────────────────────────────────────────────────────────────
// 담당(P4)이 여기를 구현하세요. 지금은 501(미구현)을 반환합니다.
//
// 참고: 참조 데이터는 require("../store").db 로 바로 읽을 수 있습니다.
//   db.transactions  카드내역
//   db.approvalRules 전결규정   db.accounts 계정과목   db.fx 환율
//
// 구현할 것 (02-API-CONTRACT.md 3장 매칭 규칙 참고):
//   POST /api/match           body: { receiptIds:[...] }
//     → [{ receiptId, txId, score }]  (금액 60 + 일시 근접 30 + 가맹점 유사 10)
//   POST /api/vouchers/preview  body: { matches:[...] }
//     → 계정과목 자동분류 + 전결라인 자동결정된 전표 초안(Voucher, status:"draft")
//   (완성된 전표 상신은 P1의 POST /api/vouchers 로 보냅니다)
const express = require("express");
const router = express.Router();

router.post("/match", (req, res) => {
  res.status(501).json({ error: "NOT_IMPLEMENTED", owner: "P4", hint: "server/routes/match.js 를 구현하세요" });
});

router.post("/vouchers/preview", (req, res) => {
  res.status(501).json({ error: "NOT_IMPLEMENTED", owner: "P4", hint: "server/routes/match.js 의 preview 를 구현하세요" });
});

module.exports = router;
