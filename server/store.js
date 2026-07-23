// 런타임 상태 저장소 (P1)
// fixtures/ 의 JSON을 메모리에 올려 기존 동기식 라우트 계약을 유지한다.
// Supabase가 설정된 배포에서는 시작 시 app_state를 복원하고 성공한 쓰기를 영구 저장한다.
// Supabase가 없는 로컬 개발만 서버 재시작 시 fixtures 초기값으로 돌아간다.

const fs = require("fs");
const path = require("path");

const FIX = path.join(__dirname, "..", "fixtures");
const readJSON = (name) => JSON.parse(fs.readFileSync(path.join(FIX, name), "utf-8"));

// 매번 fixtures 원본을 깊은 복사해서 로드 (원본 파일은 건드리지 않음)
const initial = {
  transactions: readJSON("transactions.json"),
  approvalRules: readJSON("approval-rules.json"),
  presets: readJSON("presets.json"),
  fx: readJSON("fx.json"),
  accounts: readJSON("accounts.json"),
  travelPolicy: readJSON("travel-policy.json"),
  // 데모 시드 영수증: 서버 부팅 즉시 모바일웹·PC웹이 "동일한 영수증"을 공유하도록 미리 채운다.
  // 카드거래(matchedTxId)·정산단위(presetId)와 연결돼 있어 매칭/한도/분류가 처음부터 채워진 상태로 보인다.
  receiptsSeed: readJSON("receipts-seed.json"),
};

// 시드 영수증 id(rcpt_101~)와 런타임 업로드 id가 겹치지 않도록 시퀀스 시작값을 계산
const seedSeqStart = initial.receiptsSeed.length + 1;

// 시드 영수증의 matchedTxId 를 거래 쪽에도 반영해 양방향 링크를 맞춘다
// (시드만 matched 이고 거래는 unmatched 인 단방향 상태 방지 — 매칭/전표 화면이 서로 다른 상태를 보게 됨)
function linkSeedMatches(target) {
  for (const r of target.receipts) {
    if (!r.matchedTxId) continue;
    const tx = target.transactions.find((t) => t.id === r.matchedTxId);
    if (tx && tx.status !== "vouchered") {
      tx.status = "matched";
      tx.matchedReceiptId = r.id;
    }
  }
}

// Preset usage 필드 보정 — 구 스키마 fixtures 가 남아 있어도 byDay/byMonth/byAccountCode 접근이 안전하도록
function normalizePresets(target) {
  for (const p of target.presets) {
    if (!p.usage) p.usage = { usedKRW: 0 };
    if (!p.usage.byDay) p.usage.byDay = {};
    if (!p.usage.byMonth) p.usage.byMonth = {};
    if (!p.usage.byAccountCode) p.usage.byAccountCode = {};
  }
}

// Preset 사용액(usage)을 "실제 상태"에서 항상 다시 계산한다 — usage 단일 소스.
// 시드 presets.json 의 usedKRW 는 실제 매칭 영수증과 어긋날 수 있어(모바일=시드값 vs PC=재집계값 불일치),
// 부팅·리셋·매칭·전표 변경 때마다 이 함수로 재집계해 모든 화면이 같은 숫자를 보게 한다.
//   집계 대상 = ① 그 Preset 에 배정되고 카드거래에 매칭된 영수증(r.presetId + r.matchedTxId)
//              ② 영수증 없는 현금성 전표 라인(line.presetId, receiptId 없음)
//   집계 키   = serviceDate 기준 byDay / byMonth(YYYY-MM) / byAccountCode + 총액 usedKRW
function recomputeUsage(target) {
  for (const p of target.presets) {
    p.usage = { usedKRW: 0, byDay: {}, byMonth: {}, byAccountCode: {} };
  }
  const byId = new Map(target.presets.map((p) => [p.id, p]));
  const add = (presetId, amount, day, acct) => {
    const p = byId.get(presetId);
    if (!p || !amount) return;
    p.usage.usedKRW += amount;
    if (day) {
      p.usage.byDay[day] = (p.usage.byDay[day] || 0) + amount;
      const m = String(day).slice(0, 7);
      p.usage.byMonth[m] = (p.usage.byMonth[m] || 0) + amount;
    }
    if (acct) p.usage.byAccountCode[acct] = (p.usage.byAccountCode[acct] || 0) + amount;
  };
  // ① 매칭된(=사용 확정) 영수증
  for (const r of target.receipts) {
    if (!r.presetId || !r.matchedTxId) continue;
    const day = r.serviceDate || (r.ocr && r.ocr.paidAt ? String(r.ocr.paidAt).slice(0, 10) : null);
    add(r.presetId, r.amountKRW || 0, day, r.accountCode);
  }
  // ② 현금성 전표 라인 (영수증 없는 라인만 — 영수증 라인은 ①에서 이미 집계됨 → 이중계상 방지)
  for (const v of target.vouchers) {
    if (v.status === "rejected") continue; // [v2] 반려 전표는 usage에서 제외 (재상신 시 재집계)
    for (const l of v.lines || []) {
      if (l.receiptId || !l.presetId) continue;
      const day = l.serviceDate || (v.submittedAt ? String(v.submittedAt).slice(0, 10) : null);
      add(l.presetId, l.amountKRW || 0, day, l.accountCode);
    }
  }
}

// 참조 데이터도 깊은 복사한다 — 실수로 런타임에 변형돼도 reset() 이 fixtures 원본으로 되돌릴 수 있게 (상태 오염 방지)
const clone = (v) => JSON.parse(JSON.stringify(v));
const db = {
  transactions: clone(initial.transactions),
  approvalRules: clone(initial.approvalRules),
  presets: clone(initial.presets),
  fx: clone(initial.fx),
  accounts: clone(initial.accounts),
  travelPolicy: clone(initial.travelPolicy),
  vouchers: [], // 상신된 전표가 여기 쌓인다 (관리자 화면이 이걸 보여줌)
  receipts: clone(initial.receiptsSeed), // 시드 영수증으로 시작 + 업로드분이 뒤에 쌓인다
  _voucherSeq: 1,
  _receiptSeq: seedSeqStart, // 시드 다음 번호부터 (rcpt_101~110 이후 → rcpt_111)
  _presetSeq: 1,
};
linkSeedMatches(db);
normalizePresets(db);
recomputeUsage(db); // 시드 usedKRW 를 실제 매칭 영수증 기준으로 다시 계산 (모바일·PC 숫자 일치)

// 전표 id 생성기 (vch_001, vch_002 ...)
function nextVoucherId() {
  const id = "vch_" + String(db._voucherSeq).padStart(3, "0");
  db._voucherSeq += 1;
  return id;
}

// 영수증 id 생성기 — 초기 시드 ID와 겹치지 않도록 다음 번호부터 발급
function nextReceiptId() {
  const id = "rcpt_" + String(100 + db._receiptSeq).padStart(3, "0");
  db._receiptSeq += 1;
  return id;
}

// Preset id 생성기 (ps_001, ps_002 ...)
function nextPresetId() {
  const id = "ps_" + String(db._presetSeq).padStart(3, "0");
  db._presetSeq += 1;
  return id;
}

// 데모 중 처음부터 다시 하고 싶을 때 사용 (관리자 화면의 리셋 버튼)
function reset() {
  db.transactions = clone(initial.transactions);
  db.approvalRules = clone(initial.approvalRules);
  db.presets = clone(initial.presets);
  db.fx = clone(initial.fx);
  db.accounts = clone(initial.accounts);
  db.travelPolicy = clone(initial.travelPolicy);
  db.vouchers = [];
  db.receipts = clone(initial.receiptsSeed);
  db._voucherSeq = 1;
  db._receiptSeq = seedSeqStart;
  db._presetSeq = 1;
  linkSeedMatches(db);
  normalizePresets(db);
  recomputeUsage(db);
}

// Supabase app_state 스냅샷을 같은 db 객체에 복원한다.
// 라우트가 db 참조를 모듈 로딩 시 잡고 있으므로 객체 자체를 교체하지 않고 필드만 갱신한다.
function replaceState(saved) {
  if (!saved || typeof saved !== "object") throw new Error("invalid app_state snapshot");
  const arrayKeys = ["transactions", "approvalRules", "presets", "accounts", "vouchers", "receipts"];
  for (const key of arrayKeys) {
    if (Array.isArray(saved[key])) db[key] = clone(saved[key]);
  }
  for (const key of ["fx", "travelPolicy"]) {
    if (saved[key] && typeof saved[key] === "object") db[key] = clone(saved[key]);
  }

  const maxNumber = (items, prefix) => items.reduce((max, item) => {
    const match = String(item.id || "").match(new RegExp(`^${prefix}(\\d+)$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  db._voucherSeq = Number(saved._voucherSeq) || maxNumber(db.vouchers, "vch_") + 1 || 1;
  db._receiptSeq = Number(saved._receiptSeq) || Math.max(seedSeqStart, maxNumber(db.receipts, "rcpt_") - 99);
  db._presetSeq = Number(saved._presetSeq) || maxNumber(db.presets, "ps_") + 1 || 1;

  linkSeedMatches(db);
  normalizePresets(db);
  recomputeUsage(db);
}

module.exports = { db, nextVoucherId, nextReceiptId, nextPresetId, reset, recomputeUsage, replaceState };
