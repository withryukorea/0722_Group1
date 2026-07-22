// [P5] 출장 등록 / 조회 (일일 한도 Cap 계산)
// ─────────────────────────────────────────────────────────────
// 담당(P5)이 여기를 구현하세요. 지금은 501(미구현)을 반환합니다.
//
// 환율은 require("../store").db.fx 로 읽어 환산에 사용하세요.
//
// 구현할 것 (02-API-CONTRACT.md Trip 엔티티 참고):
//   POST /api/trips   body: { destination, country, startDate, endDate, members, dailyCapPerPersonKRW }
//     → dailyCapKRW = dailyCapPerPersonKRW * members 계산해서 Trip 저장/반환
//   GET  /api/trips/:id → Trip 조회 (spentByDay 포함, 잔여 Cap 계산 가능)
const express = require("express");
const router = express.Router();

router.post("/", (req, res) => {
  res.status(501).json({ error: "NOT_IMPLEMENTED", owner: "P5", hint: "server/routes/trips.js 를 구현하세요" });
});

router.get("/:id", (req, res) => {
  res.status(501).json({ error: "NOT_IMPLEMENTED", owner: "P5", hint: "server/routes/trips.js 를 구현하세요" });
});

module.exports = router;
