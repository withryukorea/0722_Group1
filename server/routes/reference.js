// [P1] 참조 데이터 API: 전결규정 / 예산 / 환율 / 계정과목
const express = require("express");
const { db } = require("../store");
const router = express.Router();

// GET /api/approval-rules  → 전결규정 (매칭엔진 P4가 전결라인 계산에 사용)
router.get("/approval-rules", (req, res) => {
  res.json(db.approvalRules);
});

// GET /api/budgets?userId=u_me  → 복지비 잔여 한도
router.get("/budgets", (req, res) => {
  const { userId } = req.query;
  let list = db.budgets;
  if (userId) list = list.filter((b) => b.userId === userId);
  res.json(list);
});

// GET /api/fx  → 환율 고정 테이블 (출장모드 P5가 환산에 사용)
router.get("/fx", (req, res) => {
  res.json(db.fx);
});

// GET /api/accounts  → 계정과목 코드표
router.get("/accounts", (req, res) => {
  res.json(db.accounts);
});

module.exports = router;
