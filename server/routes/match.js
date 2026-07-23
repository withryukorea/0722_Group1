// [P4] 매칭 + 전표 초안 생성 엔진
// ─────────────────────────────────────────────────────────────
// 매칭 규칙 (docs/02-API-CONTRACT.md §3):
//   금액: 정확일치 60점 / ±1% 58점 / 환산오차 ±3% 45점  +  일시: ±30분 30점 / ±24h 15점  +  가맹점 유사도 10점
//   score ≥ 70 자동매칭 / 40~70 확인 필요 / < 40 미매칭
const express = require("express");
const { db, recomputeUsage } = require("../store");
const { resolveApprovalLine, PROFILE } = require("./presets");
const router = express.Router();

/* 환율 조회 — fx.json이 {rates:{...}} 구조든 평면 맵이든 동작 */
function fxRateOf(cur) {
  const t = db.fx && db.fx.rates ? db.fx.rates : db.fx || {};
  return t[cur] || 1;
}


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
  const amtKRW = o.currency && o.currency !== "KRW" ? raw * (fxRateOf(o.currency)) : raw;
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
    let status = score >= 70 ? "auto" : score >= 40 ? "confirm" : "unmatched";
    if (status === "auto") {  // 자동매칭은 즉시 확정 반영
      const tx = db.transactions.find((t) => t.id === best.txId);
      // 영수증이 이미 다른 거래에 물려 있으면(재매칭) 먼저 그 거래를 풀어준다 — 좀비 링크 방지
      if (r.matchedTxId && r.matchedTxId !== tx.id) {
        const prev = db.transactions.find((t) => t.id === r.matchedTxId);
        if (prev && prev.status === "vouchered") {
          // 이미 전표 처리된 거래는 건드리지 않고 기존 매칭 유지 (이중 정산 차단)
          return { receiptId: r.id, txId: r.matchedTxId, score, status: "locked" };
        }
        if (prev && prev.matchedReceiptId === r.id) {
          prev.status = "unmatched";
          prev.matchedReceiptId = null;
        }
      }
      tx.status = "matched";
      tx.matchedReceiptId = r.id;
      r.matchedTxId = tx.id;
    }
    return { receiptId: r.id, txId: status === "unmatched" ? null : best.txId, score, status };
  });
  recomputeUsage(db); // 자동매칭으로 사용 확정된 영수증을 usage 에 반영
  res.json(results);
});

// POST /api/match/confirm  body: { receiptId, txId }  — 낮은 점수 건의 수동 확정 / txId:null 이면 매칭 해제
// (sot/02 매칭 흐름: 자동 매칭 + 낮은 점수 건만 수동 확정, 증빙 추가·해제)
router.post("/match/confirm", (req, res) => {
  const { receiptId, txId } = req.body || {};
  const r = db.receipts.find((x) => x.id === receiptId);
  if (!r) return res.status(404).json({ error: "RECEIPT_NOT_FOUND", receiptId });

  // 이미 전표 처리(vouchered)된 거래에 물려 있는 영수증은 해제·재연결 모두 거부한다.
  // (기존 release() 는 이 경우 조용히 건너뛰고 r.matchedTxId 만 갈아끼워 → 전표는 남고 링크만 떨어지는 이중 정산 경로가 생겼음)
  if (r.matchedTxId) {
    const cur = db.transactions.find((t) => t.id === r.matchedTxId);
    if (cur && cur.status === "vouchered") {
      return res.status(409).json({ error: "RECEIPT_ALREADY_VOUCHERED", receiptId, txId: cur.id, hint: "이미 전표가 상신된 영수증입니다. 전표를 먼저 취소/반려하세요." });
    }
  }

  const release = () => { // 영수증이 물고 있던 기존 거래를 풀어준다
    if (!r.matchedTxId) return;
    const prev = db.transactions.find((t) => t.id === r.matchedTxId);
    if (prev && prev.matchedReceiptId === r.id && prev.status !== "vouchered") {
      prev.status = "unmatched";
      prev.matchedReceiptId = null;
    }
  };

  if (txId === null || txId === undefined) { // 매칭 해제
    release();
    r.matchedTxId = null;
    recomputeUsage(db);
    return res.json({ receiptId, txId: null, status: "unlinked" });
  }

  const tx = db.transactions.find((t) => t.id === txId);
  if (!tx) return res.status(400).json({ error: "UNKNOWN_TX", txId, hint: "존재하지 않는 카드거래입니다" });
  if (tx.status === "vouchered") {
    return res.status(409).json({ error: "TX_ALREADY_VOUCHERED", txId, hint: "이미 전표 처리된 거래입니다" });
  }
  if (tx.matchedReceiptId && tx.matchedReceiptId !== r.id) {
    return res.status(409).json({ error: "TX_ALREADY_MATCHED", txId, matchedReceiptId: tx.matchedReceiptId, hint: "다른 영수증과 매칭된 거래입니다. 먼저 해제하세요" });
  }

  release();
  tx.status = "matched";
  tx.matchedReceiptId = r.id;
  r.matchedTxId = tx.id;
  recomputeUsage(db);
  res.json({ receiptId, txId, status: "confirmed" });
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
  return rule ? rule.approvers : ["김현준 기술위원"];
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

  // ── 존재 검증: 없는 거래/영수증을 참조하면 500 대신 400 으로 명확히 거부한다 ──
  const badTx = pairs.filter((p) => !db.transactions.some((t) => t.id === p.txId)).map((p) => p.txId);
  if (badTx.length) {
    return res.status(400).json({ error: "UNKNOWN_TX", txIds: badTx, hint: "존재하지 않는 카드거래를 참조했습니다." });
  }
  const badReceipt = pairs.filter((p) => p.receiptId && !db.receipts.some((r) => r.id === p.receiptId)).map((p) => p.receiptId);
  if (badReceipt.length) {
    return res.status(400).json({ error: "UNKNOWN_RECEIPT", receiptIds: badReceipt, hint: "존재하지 않는 영수증을 참조했습니다." });
  }
  // ── 관계 검증: 영수증이 이미 "다른" 거래와 매칭돼 있으면 그 짝으로 전표를 만들 수 없다 (교차 정산 방지) ──
  const mismatched = pairs
    .map((p) => ({ p, r: db.receipts.find((r) => r.id === p.receiptId) }))
    .filter(({ p, r }) => r && r.matchedTxId && r.matchedTxId !== p.txId);
  if (mismatched.length) {
    return res.status(409).json({
      error: "RECEIPT_TX_MISMATCH",
      pairs: mismatched.map(({ p, r }) => ({ receiptId: p.receiptId, txId: p.txId, matchedTxId: r.matchedTxId })),
      hint: "영수증이 다른 카드거래와 매칭돼 있습니다. 매칭을 먼저 확정/해제하세요.",
    });
  }

  // 적요양식 치환: {merchant}/{n}/{date} + [이름]·[직급]=프로필, [월]=결제월 (sot/02 descriptionTemplate)
  // {merchant} 는 카드사 원문("폴바셋광화문예금보험공사점")이 아니라 OCR 정제 가맹점명("폴 바셋 광화문점")을 우선 사용 (A6)
  const fillTemplate = (tpl, tx, receipt) =>
    (tpl || "{merchant}")
      .replaceAll("{merchant}", (receipt && receipt.ocr && receipt.ocr.merchant) || tx.merchant)
      .replaceAll("{n}", "1")
      .replaceAll("{date}", (tx.approvedAt || "").slice(0, 10))
      .replaceAll("[이름]", PROFILE.name).replaceAll("[직급]", PROFILE.rank)
      .replaceAll("[월]", String(Number((tx.approvedAt || "").slice(5, 7)) || ""));

  const lines = pairs.map((p) => {
    const tx = db.transactions.find((t) => t.id === p.txId);
    const receipt = db.receipts.find((r) => r.id === p.receiptId);
    // Preset 지정 건: Preset의 비목(사용자 확정)·적요 템플릿 사용 (sot/02 전표 생성 흐름)
    const preset = receipt && receipt.presetId
      ? db.presets.find((x) => x.id === receipt.presetId && x.active !== false)
      : null;
    let acc;
    if (preset) {
      const codes = preset.rules.allowedAccountCodes || [];
      const code = receipt.accountCode || (codes.length === 1 ? codes[0] : null);
      acc = db.accounts.find((a) => a.code === code) || classify(tx);
    } else {
      acc = classify(tx);
    }
    // 실계정코드: Preset 지정값(출장은 국내/해외 여비교통비로 고정) → accounts.json 기본 매핑
    const realCode = (preset && preset.rules.realAccountCode) || acc.realCode || null;
    const realName = preset && preset.rules.realAccountCode && preset.rules.realAccountCode !== acc.realCode
      ? REAL_ACCOUNT_NAMES[preset.rules.realAccountCode] || acc.realName
      : acc.realName;
    const vatFree = tx.currency !== "KRW" || NO_VAT.test(tx.merchant + (tx.biz || ""));
    const supply = vatFree ? tx.amountKRW : Math.ceil(tx.amountKRW / 1.1);
    // 사용자가 부가세를 확정(vat.confirmed)했으면 그 값을 우선
    const vatConfirmed = receipt && receipt.vat && receipt.vat.confirmed != null ? receipt.vat.confirmed : null;
    return {
      txId: tx.id,
      receiptId: p.receiptId,
      presetId: preset ? preset.id : null,
      accountCode: acc.code,
      accountName: acc.name,
      accountRealCode: realCode,
      accountDisplay: realCode ? `[${realCode}]${realName || ""}` : acc.name, // 이어카운팅 계정과목 입력칸 형식
      costCenter: (preset && preset.rules.costCenter) || PROFILE.costCenter,
      amountKRW: tx.amountKRW,
      supplyKRW: vatConfirmed != null ? tx.amountKRW - vatConfirmed : supply,
      vatKRW: vatConfirmed != null ? vatConfirmed : tx.amountKRW - supply,
      serviceDate: (receipt && receipt.serviceDate) || (tx.approvedAt || "").slice(0, 10),
      description: preset
        ? fillTemplate(preset.rules.descriptionTemplate, tx, receipt)
        : `${(receipt && receipt.ocr && receipt.ocr.merchant) || tx.merchant} · ${acc.name}`,
    };
  });
  const totalKRW = lines.reduce((s, l) => s + l.amountKRW, 0);

  // 전결라인: Preset 지정 건이 있으면 지배 Preset(합계 최대)의 양식을 해석, 없으면 전결규정 fallback
  const presetSums = {};
  lines.forEach((l) => { if (l.presetId) presetSums[l.presetId] = (presetSums[l.presetId] || 0) + l.amountKRW; });
  const domPresetId = Object.entries(presetSums).sort((a, b) => b[1] - a[1]).map(([id]) => id)[0];
  const domPreset = domPresetId ? db.presets.find((x) => x.id === domPresetId) : null;
  let approvalLine, approvalLineDetail;
  if (domPreset && domPreset.rules.approvalLineTemplate) {
    approvalLineDetail = resolveApprovalLine(domPreset.rules.approvalLineTemplate); // $DRAFTER/$SUPERIOR 해석
    approvalLine = approvalLineDetail.flat;
  } else if (domPreset) {
    approvalLine = domPreset.rules.approvalLine;
    approvalLineDetail = { draft: `${PROFILE.name} ${PROFILE.rank}`, reviewers: approvalLine.slice(0, -1), approve: approvalLine[approvalLine.length - 1] };
  } else {
    approvalLine = approvalLineFor(lines, totalKRW);
    approvalLineDetail = { draft: `${PROFILE.name} ${PROFILE.rank}`, reviewers: approvalLine.slice(0, -1), approve: approvalLine[approvalLine.length - 1] };
  }

  // Preset 한도 경고 (차단 없음 — 경고만).
  //   daily(TRIP) = 일자별 / monthly(복지비) = 결제월별 / total = 기간 무제한 누적
  //   usage 는 이미 "매칭 확정 영수증"을 반영하고 있으므로, 이번 전표에서 "새로 늘어나는 분"만 더해 이중계상을 막는다.
  //   (현금성 라인·아직 미매칭 영수증 = 신규 / 이미 매칭된 영수증 = usage 에 이미 포함 → 0)
  const warnings = [];
  const incrementalOf = (l) => {
    if (!l.receiptId) return l.amountKRW;
    const r = db.receipts.find((x) => x.id === l.receiptId);
    return r && r.matchedTxId ? 0 : l.amountKRW;
  };
  for (const pid of Object.keys(presetSums)) {
    const p = db.presets.find((x) => x.id === pid);
    if (!p || !p.rules.limitKRW) continue;
    const period = p.rules.limitPeriod;
    const myLines = lines.filter((l) => l.presetId === pid);
    if (period === "daily") {
      const inc = {};
      myLines.forEach((l) => { const d = l.serviceDate || "unknown"; inc[d] = (inc[d] || 0) + incrementalOf(l); });
      for (const day of Object.keys(inc)) {
        const after = ((p.usage.byDay && p.usage.byDay[day]) || 0) + inc[day];
        if (after > p.rules.limitKRW) {
          warnings.push({ type: "PRESET_DAILY_LIMIT_EXCEEDED", presetId: pid, day, message: `${p.name} ${day} 일일 한도 초과: ${after.toLocaleString("ko-KR")} / ${p.rules.limitKRW.toLocaleString("ko-KR")}원` });
        }
      }
    } else if (period === "monthly") {
      const inc = {};
      myLines.forEach((l) => { const m = String(l.serviceDate || "").slice(0, 7) || "unknown"; inc[m] = (inc[m] || 0) + incrementalOf(l); });
      for (const month of Object.keys(inc)) {
        const after = ((p.usage.byMonth && p.usage.byMonth[month]) || 0) + inc[month];
        if (after > p.rules.limitKRW) {
          warnings.push({ type: "PRESET_MONTHLY_LIMIT_EXCEEDED", presetId: pid, month, message: `${p.name} ${month} 월 한도 초과: ${after.toLocaleString("ko-KR")} / ${p.rules.limitKRW.toLocaleString("ko-KR")}원` });
        }
      }
    } else {
      const incSum = myLines.reduce((s, l) => s + incrementalOf(l), 0);
      const after = (p.usage.usedKRW || 0) + incSum;
      if (after > p.rules.limitKRW) {
        warnings.push({ type: "PRESET_LIMIT_EXCEEDED", presetId: pid, message: `${p.name} 한도 초과: ${after.toLocaleString("ko-KR")} / ${p.rules.limitKRW.toLocaleString("ko-KR")}원` });
      }
    }
  }

  // A3: 영수증이 지정한 Preset 이 비활성/삭제됐는데도 전표를 만들면, 그 라인은 조용히 일반분류로 처리된다.
  //     사용자가 눈치채도록 경고를 띄운다 (차단은 안 함).
  for (const p of pairs) {
    const r = db.receipts.find((x) => x.id === p.receiptId);
    if (r && r.presetId && !db.presets.find((x) => x.id === r.presetId && x.active !== false)) {
      warnings.push({ type: "PRESET_INACTIVE", receiptId: r.id, presetId: r.presetId, message: `지정한 정산단위(${r.presetId})가 비활성 상태입니다 — 일반 분류로 처리됩니다. 확인해주세요.` });
    }
  }

  const first = db.transactions.find((t) => t.id === lines[0].txId);
  res.json({
    title: domPreset
      ? `${domPreset.name} (${first.merchant}${lines.length > 1 ? ` 외 ${lines.length - 1}건` : ""})`
      : `법인카드 정산 (${first.merchant}${lines.length > 1 ? ` 외 ${lines.length - 1}건` : ""})`,
    lines,
    totalKRW,
    costCenter: (domPreset && domPreset.rules.costCenter) || PROFILE.costCenter,
    approvalLine,
    approvalLineDetail, // { draft, reviewers[], approve } — 이어카운팅 결재선 표에 그대로 전개
    warnings,
    status: "draft",
  });
});

/* Preset이 출장용 실계정코드를 override 할 때의 표시명 (accounts.json 기본 매핑에 없는 코드만) */
const REAL_ACCOUNT_NAMES = {
  "706101": "여비교통비-국내출장",
  "706102": "여비교통비-해외출장",
  "706201": "여비교통비-시내교통",
};

module.exports = router;
module.exports.classify = classify; // [v2] /api/stats 집계에서 재사용 (간편정산 대시보드)
