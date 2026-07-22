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
  // 중복 상신 방지: 이미 전표 처리(vouchered)된 거래는 다시 상신 불가
  const dupTx = (Array.isArray(body.lines) ? body.lines : [])
    .map((l) => l.txId)
    .filter((id) => id && db.transactions.some((t) => t.id === id && t.status === "vouchered"));
  if (dupTx.length) {
    return res.status(409).json({ error: "DUPLICATE_SUBMISSION", txIds: dupTx, hint: "이미 전표가 상신된 카드내역입니다." });
  }
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

  // Preset 사용량 차감: submitted 전표만 합산 (초안 합산 금지 — 이중 차감 방지)
  for (const line of voucher.lines) {
    const receipt = line.receiptId ? db.receipts.find((r) => r.id === line.receiptId) : null;
    const presetId = line.presetId || (receipt && receipt.presetId);
    if (!presetId) continue;
    const p = db.presets.find((x) => x.id === presetId);
    if (!p) continue;
    p.usage.usedKRW += line.amountKRW || 0;
    const day = (receipt && receipt.serviceDate) || voucher.submittedAt.slice(0, 10);
    p.usage.byDay[day] = (p.usage.byDay[day] || 0) + (line.amountKRW || 0);
  }

  res.status(201).json(voucher);
});

module.exports = router;
