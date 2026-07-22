// [P1] 참조 데이터 API: 전결규정 / 예산 / 환율 / 계정과목
const express = require("express");
const { db } = require("../store");
const router = express.Router();

// GET /api/approval-rules  → 전결규정 (매칭엔진 P4가 전결라인 계산에 사용)
router.get("/approval-rules", (req, res) => {
  res.json(db.approvalRules);
});

// GET /api/budgets?userId=u_me  → 복지비 잔여 한도
// (호환 shim — Budget 엔티티는 sot/02에서 Preset(usage)으로 흡수됨. 기존 호출자를 위해 Preset에서 계산해 준다)
router.get("/budgets", (req, res) => {
  const { userId } = req.query;
  const curMonth = new Date().toISOString().slice(0, 7); // 이번 달 (YYYY-MM)
  const list = db.presets
    .filter((p) => p.type !== "TRIP" && p.active !== false)
    .filter((p) => !userId || (p.assignees || []).includes(userId))
    .map((p) => {
      const usage = p.usage || {};
      const period = p.rules.limitPeriod;
      // 월 한도(복지비 등)는 "이번 달 사용액"으로 잔여를 계산한다 — 전체 누적이 아님 (#5).
      // total 등 그 외 기간은 누적(usedKRW) 그대로.
      const used = period === "monthly"
        ? ((usage.byMonth && usage.byMonth[curMonth]) || 0)
        : (usage.usedKRW || 0);
      const limit = p.rules.limitKRW || 0;
      return {
        category: (p.rules.allowedAccountCodes || [])[0] || p.id,
        userId: (p.assignees || [])[0] || "u_me",
        limitKRW: limit,
        limitPeriod: period,
        month: period === "monthly" ? curMonth : undefined,
        usedKRW: used,
        remainingKRW: limit - used,
        presetId: p.id,
        name: p.name,
      };
    });
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

// GET /api/travel-policy — 국내·해외 출장비 지급 기준
router.get("/travel-policy", (req, res) => {
  res.json(db.travelPolicy);
});

module.exports = router;
