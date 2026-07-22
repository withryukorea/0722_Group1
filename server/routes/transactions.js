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
const ALLOWED_STATUS = ["unmatched", "matched", "vouchered"];
router.patch("/:id", (req, res) => {
  const tx = db.transactions.find((t) => t.id === req.params.id);
  if (!tx) return res.status(404).json({ error: "transaction not found" });
  // 허용 필드만 반영 (임의 status 문자열·존재하지 않는 영수증 참조 방지)
  const { status, category, matchedReceiptId } = req.body || {};
  if (status !== undefined) {
    if (!ALLOWED_STATUS.includes(status)) {
      return res.status(400).json({ error: "INVALID_STATUS", status, allowed: ALLOWED_STATUS });
    }
    tx.status = status;
  }
  if (category !== undefined) tx.category = category;
  if (matchedReceiptId !== undefined) {
    if (matchedReceiptId !== null && !db.receipts.some((r) => r.id === matchedReceiptId)) {
      return res.status(400).json({ error: "UNKNOWN_RECEIPT", matchedReceiptId });
    }
    tx.matchedReceiptId = matchedReceiptId;
  }
  res.json(tx);
});

module.exports = router;
