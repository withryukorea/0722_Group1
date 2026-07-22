// [v2] 간편정산 대시보드 집계 API — GET /api/stats
// ─────────────────────────────────────────────────────────────
// 영수증(receipts)을 계정과목·월별로 집계해 대시보드 차트(도넛·월별 추이)가
// 데모 목데이터 대신 실데이터로 그려지게 한다. 읽기 전용 — store 를 변경하지 않는다.
// 계정 판정 우선순위: ① 사용자가 확정한 receipt.accountCode
//                    ② receipt.presetId 의 허용 비목(1개일 때)
//                    ③ 매칭된 카드거래를 match.js classify() 로 자동분류
//                    ④ 그 외 UNCLASSIFIED(미분류)
const express = require("express");
const { db } = require("../store");
const { classify } = require("./match");

const router = express.Router();

function accountOf(r) {
  if (r.accountCode) return r.accountCode;
  if (r.presetId) {
    const p = db.presets.find((x) => x.id === r.presetId);
    const codes = (p && p.rules && p.rules.allowedAccountCodes) || [];
    if (codes.length === 1) return codes[0];
  }
  if (r.matchedTxId) {
    const tx = db.transactions.find((t) => t.id === r.matchedTxId);
    if (tx) {
      const acc = classify(tx);
      if (acc) return acc.code;
    }
  }
  return "UNCLASSIFIED";
}

router.get("/", (req, res) => {
  const receipts = db.receipts || [];
  const accName = (code) => {
    if (code === "UNCLASSIFIED") return "미분류";
    const a = db.accounts.find((x) => x.code === code);
    return a ? a.name : code;
  };

  const byAccount = {}; // code → { totalKRW, count }
  const byMonth = {};   // "2026-07" → { totalKRW, byAccount: { code: n } }
  let totalKRW = 0, matched = 0;

  for (const r of receipts) {
    const amt = r.amountKRW || 0;
    const code = accountOf(r);
    const month = (((r.ocr || {}).paidAt || r.createdAt || "")).slice(0, 7) || "unknown";
    totalKRW += amt;
    if (r.matchedTxId) matched++;
    (byAccount[code] = byAccount[code] || { totalKRW: 0, count: 0 });
    byAccount[code].totalKRW += amt;
    byAccount[code].count++;
    (byMonth[month] = byMonth[month] || { totalKRW: 0, byAccount: {} });
    byMonth[month].totalKRW += amt;
    byMonth[month].byAccount[code] = (byMonth[month].byAccount[code] || 0) + amt;
  }

  const vouchers = db.vouchers || [];
  res.json({
    totalKRW,
    count: receipts.length,
    matched,
    unmatched: receipts.length - matched,
    byAccount: Object.entries(byAccount)
      .map(([code, v]) => ({ code, name: accName(code), ...v }))
      .sort((a, b) => b.totalKRW - a.totalKRW),
    byMonth: Object.entries(byMonth)
      .filter(([m]) => m !== "unknown")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v })),
    vouchers: {
      count: vouchers.length,
      totalKRW: vouchers.reduce((s, v) => s + (v.totalKRW || 0), 0),
    },
    presets: (db.presets || []).map((p) => ({
      id: p.id, name: p.name, type: p.type,
      usedKRW: (p.usage && p.usage.usedKRW) || 0,
      limitKRW: (p.rules && p.rules.limitKRW) || null,
    })),
  });
});

module.exports = router;
