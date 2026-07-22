// [P1] 법인카드 승인내역 API
const express = require("express");
const { db } = require("../store");
const router = express.Router();

// GET /api/transactions?status=unmatched  → 카드승인내역 목록
router.get("/", (req, res) => {
  const { status } = req.query;
  let list = db.transactions;
  if (status) list = list.filter((t) => t.status === status);
  res.json(list);
});

// PATCH /api/transactions/:id  → 상태/매칭/계정과목 갱신 (매칭엔진·프론트가 사용)
router.patch("/:id", (req, res) => {
  const tx = db.transactions.find((t) => t.id === req.params.id);
  if (!tx) return res.status(404).json({ error: "transaction not found" });
  // 허용 필드만 반영
  const { status, category, matchedReceiptId } = req.body;
  if (status !== undefined) tx.status = status;
  if (category !== undefined) tx.category = category;
  if (matchedReceiptId !== undefined) tx.matchedReceiptId = matchedReceiptId;
  res.json(tx);
});

module.exports = router;
