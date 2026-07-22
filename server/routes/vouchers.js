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

  // ── 라인 검증: 빈 전표·존재하지 않는 거래/영수증 참조는 상신 자체를 거부한다 ──
  // (현금 지출 등 txId 없는 라인은 허용 — txId/receiptId 가 "있는데 가짜"인 경우만 400)
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return res.status(400).json({ error: "EMPTY_LINES", hint: "전표에는 1개 이상의 정산 라인이 필요합니다." });
  }
  const unknownTx = body.lines
    .map((l) => l.txId)
    .filter((id) => id && !db.transactions.some((t) => t.id === id));
  if (unknownTx.length) {
    return res.status(400).json({ error: "UNKNOWN_TX", txIds: unknownTx, hint: "존재하지 않는 카드거래를 참조한 라인이 있습니다." });
  }
  const unknownReceipt = body.lines
    .map((l) => l.receiptId)
    .filter((id) => id && !db.receipts.some((r) => r.id === id));
  if (unknownReceipt.length) {
    return res.status(400).json({ error: "UNKNOWN_RECEIPT", receiptIds: unknownReceipt, hint: "존재하지 않는 영수증을 참조한 라인이 있습니다." });
  }

  // 중복 상신 방지: 이미 전표 처리(vouchered)된 거래는 다시 상신 불가
  const dupTx = body.lines
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
    if (!p.usage) p.usage = { usedKRW: 0, byDay: {}, byAccountCode: {} };
    if (!p.usage.byDay) p.usage.byDay = {};
    if (!p.usage.byAccountCode) p.usage.byAccountCode = {};
    const amount = line.amountKRW || 0;
    p.usage.usedKRW += amount;
    const day = (receipt && receipt.serviceDate) || voucher.submittedAt.slice(0, 10);
    p.usage.byDay[day] = (p.usage.byDay[day] || 0) + amount;
    // TRIP 대시보드는 비목별 누적으로 표시 (sot/02 usage.byAccountCode)
    const acct = line.accountCode || (receipt && receipt.accountCode) || "UNSPECIFIED";
    p.usage.byAccountCode[acct] = (p.usage.byAccountCode[acct] || 0) + amount;
  }

  res.status(201).json(voucher);
});

module.exports = router;
