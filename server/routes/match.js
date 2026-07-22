// [P4] 매칭 + 전표 초안 생성 엔진
// ─────────────────────────────────────────────────────────────
// 매칭 규칙 (docs/02-API-CONTRACT.md §3):
//   금액 일치(±1%: 60점, 환산 오차 ±3%: 45점) + 일시 근접(±30분: 30점, ±24h: 15점) + 가맹점 유사도(10점)
//   score ≥ 70 자동매칭 / 40~70 확인 필요 / < 40 미매칭
const express = require("express");
const { db } = require("../store");
const router = express.Router();

/* 가맹점명 정규화: 공백/특수문자 제거 + 대문자 (예: "폴 바셋 광화문점" ≈ "폴바셋광화문예금보험공사점") */
const norm = (s) => String(s || "").toUpperCase().replace(/[\s*\-_.,()]/g, "");

function merchantScore(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y || x.includes(y) || y.includes(x)) return 10;
  for (let len = Math.min(x.length, y.length, 8); len >= 3; len--) {   // 공통 부분문자열(3자 이상)
    for (let i = 0; i + len <= x.length; i++) {
      if (y.includes(x.slice(i, i + len))) return len >= 5 ? 9 : 7;
    }
  }
  return 0;
}

function scorePair(receipt, tx) {
  const o = receipt.ocr || {};
  let s = 0;
  // 금액 60점 — 원화 환산 기준으로 비교
  const raw = Number(o.amount) || 0;
  const amtKRW = o.currency && o.currency !== "KRW" ? raw * (db.fx[o.currency] || 1) : raw;
  const diff = Math.abs(amtKRW - tx.amountKRW) / Math.max(tx.amountKRW, 1);
  if (diff === 0) s += 60;
  else if (diff <= 0.01) s += 58;
  else if (diff <= 0.03) s += 45;
  // 일시 근접 30점 / 15점
  if (o.paidAt && tx.approvedAt) {
    const gap = Math.abs(new Date(o.paidAt) - new Date(tx.approvedAt));
    if (gap <= 30 * 60e3) s += 30;
    else if (gap <= 24 * 3600e3) s += 15;
  }
  // 가맹점 유사도 10점
  s += merchantScore(o.merchant, tx.merchant);
  return s;
}

// POST /api/match  body: { receiptIds:[...] }  (생략 시 아직 미매칭인 영수증 전체)
router.post("/match", (req, res) => {
  const ids = req.body && req.body.receiptIds;
  const receipts = db.receipts.filter((r) => (ids ? ids.includes(r.id) : !r.matchedTxId));
  const results = receipts.map((r) => {
    let best = null;
    for (const tx of db.transactions) {
      if (tx.status === "vouchered") continue;                           // 이미 전표 처리된 거래 제외
      if (tx.matchedReceiptId && tx.matchedReceiptId !== r.id) continue; // 남의 영수증과 매칭된 거래 제외
      const score = scorePair(r, tx);
      if (!best || score > best.score) best = { txId: tx.id, score };
    }
    const score = best ? best.score : 0;
    const status = score >= 70 ? "auto" : score >= 40 ? "confirm" : "unmatched";
    if (status === "auto") {  // 자동매칭은 즉시 확정 반영
      const tx = db.transactions.find((t) => t.id === best.txId);
      tx.status = "matched";
      tx.matchedReceiptId = r.id;
      r.matchedTxId = tx.id;
    }
    return { receiptId: r.id, txId: status === "unmatched" ? null : best.txId, score, status };
  });
  res.json(results);
});

/* 계정과목 자동분류 — 우선순위 규칙 + accounts.json examples 키워드 */
const CLASSIFY_RULES = [
  [/ANTHROPIC|OPENAI|CLAUDE|CHATGPT|GITHUB|CURSOR/i, "WELFARE_AI"],
  [/문고|서점|YES24/i, "WELFARE_BOOK"],
  [/택시|메트로|지하철|철도|공항|스카이라이너|항공|교통/i, "TRAVEL_TRANSPORT"],
  [/호텔|HOTEL|료칸/i, "TRAVEL_LODGING"],
  [/커피|카페|폴바셋|STARBUCKS|베이커리|편의점|GS25|\bCU\b|간식/i, "SNACK"],
];
function classify(tx) {
  const raw = `${tx.merchant} ${tx.biz || ""}`;
  const byCode = (code) => db.accounts.find((a) => a.code === code);
  for (const [re, code] of CLASSIFY_RULES) {
    if (re.test(raw)) {
      // 해외(출장 중) 간식·커피는 출장-식대로 본다
      if (code === "SNACK" && tx.currency !== "KRW") return byCode("TRAVEL_MEAL") || byCode(code);
      return byCode(code);
    }
  }
  // 식사류: 해외(출장)면 출장-식대, 국내면 회식성(복지-기타)
  if (/식당|스시|이자카야|라멘|치킨|주점|음식/i.test(raw)) {
    return byCode(tx.currency !== "KRW" ? "TRAVEL_MEAL" : "WELFARE_ETC");
  }
  // 그 외: accounts.json examples 키워드
  const hay = norm(raw);
  for (const acc of db.accounts) {
    for (const ex of acc.examples || []) {
      if (norm(ex) && hay.includes(norm(ex))) return acc;
    }
  }
  return byCode("WELFARE_ETC") || db.accounts[0];
}

/* 전결라인 — 지배 카테고리(합계 최대) 기준, 총액이 들어가는 첫 규칙 (approval-rules.json) */
function approvalLineFor(lines, totalKRW) {
  const sums = {};
  lines.forEach((l) => { sums[l.accountCode] = (sums[l.accountCode] || 0) + l.amountKRW; });
  const domCat = Object.entries(sums).sort((a, b) => b[1] - a[1]).map(([c]) => c)[0];
  const rules = db.approvalRules
    .filter((r) => r.category === domCat)
    .sort((a, b) => a.maxKRW - b.maxKRW);
  const rule = rules.find((r) => totalKRW <= r.maxKRW) || rules[rules.length - 1];
  return rule ? rule.approvers : ["김아무개 팀장"];
}

/* 부가세 분리 — 면세(교통)·해외/구독 건은 부가세 없음, 그 외 공급가액 = ceil(금액/1.1) */
const NO_VAT = /택시|메트로|공항|철도|스카이라이너|ANTHROPIC|OPENAI|CLAUDE|CHATGPT|SUB/i;

// POST /api/vouchers/preview  body: { matches:[{receiptId,txId}] } 또는 { receiptIds:[...] }
router.post("/vouchers/preview", (req, res) => {
  let pairs = req.body && req.body.matches;
  if (!pairs && req.body && req.body.receiptIds) {
    pairs = req.body.receiptIds.map((rid) => ({
      receiptId: rid,
      txId: (db.receipts.find((r) => r.id === rid) || {}).matchedTxId,
    }));
  }
  pairs = (pairs || []).filter((p) => p && p.txId);
  if (!pairs.length) {
    return res.status(400).json({ error: "NO_MATCHES", hint: "matches:[{receiptId,txId}] 또는 매칭된 receiptIds 를 보내주세요" });
  }

  const lines = pairs.map((p) => {
    const tx = db.transactions.find((t) => t.id === p.txId);
    const acc = classify(tx);
    const vatFree = tx.currency !== "KRW" || NO_VAT.test(tx.merchant + (tx.biz || ""));
    const supply = vatFree ? tx.amountKRW : Math.ceil(tx.amountKRW / 1.1);
    return {
      txId: tx.id,
      receiptId: p.receiptId,
      accountCode: acc.code,
      accountName: acc.name,
      amountKRW: tx.amountKRW,
      supplyKRW: supply,
      vatKRW: tx.amountKRW - supply,
      description: `${tx.merchant} · ${acc.name}`,
    };
  });
  const totalKRW = lines.reduce((s, l) => s + l.amountKRW, 0);
  const first = db.transactions.find((t) => t.id === lines[0].txId);
  res.json({
    title: `법인카드 정산 (${first.merchant}${lines.length > 1 ? ` 외 ${lines.length - 1}건` : ""})`,
    lines,
    totalKRW,
    approvalLine: approvalLineFor(lines, totalKRW),
    status: "draft",
  });
});

module.exports = router;
