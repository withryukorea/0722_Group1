// [P1] 전표 접수/조회 API
const express = require("express");
const { db, nextVoucherId, recomputeUsage } = require("../store");
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
    approvalLineDetail: body.approvalLineDetail || null, // { draft, reviewers[], approve } — 문서함 표시용
    status: "submitted",
    submittedAt: new Date().toISOString(),
  };
  db.vouchers.push(voucher);

  // 전표에 포함된 거래는 vouchered 로 표시
  for (const line of voucher.lines) {
    const tx = db.transactions.find((t) => t.id === line.txId);
    if (tx) tx.status = "vouchered";
  }

  // Preset 사용량은 "실제 상태"에서 다시 계산 — 매칭 영수증 + 현금성 라인을 usage 단일 소스로 집계.
  // (증분 합산 대신 재집계 → 이미 매칭돼 집계된 영수증을 상신해도 이중 차감되지 않음)
  recomputeUsage(db);

  res.status(201).json(voucher);
});

// PATCH /api/vouchers/:id — [v2] 결재 처리 (모바일·PC 문서함 공용)
// body: { action: "approve" | "reject", comment? }
router.patch("/:id", (req, res) => {
  const v = db.vouchers.find((x) => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: "VOUCHER_NOT_FOUND", id: req.params.id });
  const { action, comment } = req.body || {};
  if (action !== "approve" && action !== "reject") {
    return res.status(400).json({ error: "INVALID_ACTION", hint: 'action은 "approve" 또는 "reject" 여야 합니다' });
  }
  if (v.status !== "submitted") {
    return res.status(409).json({ error: "INVALID_STATUS", status: v.status, hint: "결재 대기(submitted) 전표만 처리할 수 있습니다" });
  }

  if (action === "approve") {
    v.status = "approved";
    v.approvedAt = new Date().toISOString();
  } else {
    v.status = "rejected";
    v.rejectedAt = new Date().toISOString();
    v.rejectComment = comment || null;
    // 반려된 전표의 거래는 다시 정산 가능 상태로 되돌린다 (수정 후 재상신 경로)
    for (const line of v.lines || []) {
      const tx = db.transactions.find((t) => t.id === line.txId);
      if (tx && tx.status === "vouchered") tx.status = tx.matchedReceiptId ? "matched" : "unmatched";
    }
  }
  recomputeUsage(db);
  res.json(v);
});

module.exports = router;
