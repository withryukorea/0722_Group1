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
  budgets: readJSON("budgets.json"),
  fx: readJSON("fx.json"),
  accounts: readJSON("accounts.json"),
};

const db = {
  transactions: JSON.parse(JSON.stringify(initial.transactions)),
  approvalRules: initial.approvalRules,
  budgets: JSON.parse(JSON.stringify(initial.budgets)),
  fx: initial.fx,
  accounts: initial.accounts,
  vouchers: [], // 상신된 전표가 여기 쌓인다 (관리자 화면이 이걸 보여줌)
  _voucherSeq: 1,
};

// 전표 id 생성기 (vch_001, vch_002 ...)
function nextVoucherId() {
  const id = "vch_" + String(db._voucherSeq).padStart(3, "0");
  db._voucherSeq += 1;
  return id;
}

// 데모 중 처음부터 다시 하고 싶을 때 사용 (관리자 화면의 리셋 버튼)
function reset() {
  db.transactions = JSON.parse(JSON.stringify(initial.transactions));
  db.budgets = JSON.parse(JSON.stringify(initial.budgets));
  db.vouchers = [];
  db._voucherSeq = 1;
}

module.exports = { db, nextVoucherId, reset };
