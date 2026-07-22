// 인메모리 데이터 저장소 (P1)
// fixtures/ 의 JSON을 읽어 메모리에 올리고, 서버가 도는 동안 여기서 상태를 관리한다.
// DB 없음 — 서버를 재시작하면 fixtures 초기값으로 되돌아간다 (해커톤엔 이게 편하다).

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

const db = {
  transactions: JSON.parse(JSON.stringify(initial.transactions)),
  approvalRules: initial.approvalRules,
  presets: JSON.parse(JSON.stringify(initial.presets)),
  fx: initial.fx,
  accounts: initial.accounts,
  travelPolicy: initial.travelPolicy,
  vouchers: [], // 상신된 전표가 여기 쌓인다 (관리자 화면이 이걸 보여줌)
  receipts: JSON.parse(JSON.stringify(initial.receiptsSeed)), // 시드 영수증으로 시작 + 업로드분이 뒤에 쌓인다
  _voucherSeq: 1,
  _receiptSeq: seedSeqStart, // 시드 다음 번호부터 (rcpt_101~110 이후 → rcpt_111)
  _presetSeq: 1,
};

// 전표 id 생성기 (vch_001, vch_002 ...)
function nextVoucherId() {
  const id = "vch_" + String(db._voucherSeq).padStart(3, "0");
  db._voucherSeq += 1;
  return id;
}

// 영수증 id 생성기 (rcpt_101, rcpt_102 ... — WoZ 고정 데이터(rcpt_001~007)와 겹치지 않게 101부터)
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
  db.transactions = JSON.parse(JSON.stringify(initial.transactions));
  db.presets = JSON.parse(JSON.stringify(initial.presets));
  db.vouchers = [];
  db.receipts = JSON.parse(JSON.stringify(initial.receiptsSeed));
  db._voucherSeq = 1;
  db._receiptSeq = seedSeqStart;
  db._presetSeq = 1;
}

module.exports = { db, nextVoucherId, nextReceiptId, nextPresetId, reset };
