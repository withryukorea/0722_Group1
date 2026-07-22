// [P1] 전표 접수/조회 API
const express = require("express");
const { db, nextVoucherId } = require("../store");
const router = express.Router();

// GET /api/vouchers  → 접수된 전표 목록 (관리자 화면용)
router.get("/", (req, res) => {
  res.json(db.vouchers);
});

// POST /api/vouchers  → 전표 상신
// body: 02-API-CONTRACT.md 의 Voucher 형태 (approvalLine 포함해서 넘어옴)
router.post("/", (req, res) => {
  const body = req.body || {};
  const voucher = {
    id: nextVoucherId(),
    title: body.title || "제목 없는 전표",
    lines: Array.isArray(body.lines) ? body.lines : [],
    totalKRW:
      body.totalKRW ??
      (Array.isArray(body.lines)
        ? body.lines.reduce((s, l) => s + (l.amountKRW || 0), 0)
        : 0),
    approvalLine: body.approvalLine || [],
    status: "submitted",
    submittedAt: new Date().toISOString(),
  };
  db.vouchers.push(voucher);

  // 전표에 포함된 거래는 vouchered 로 표시
  for (const line of voucher.lines) {
    const tx = db.transactions.find((t) => t.id === line.txId);
    if (tx) tx.status = "vouchered";
  }

  res.status(201).json(voucher);
});

module.exports = router;
