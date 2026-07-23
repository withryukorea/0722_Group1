/* 계정과목 목록 (실제 예산 엑셀 기준: 계정 / 계정명 / 계획원가(예산)) */
const ACCOUNTS = [
  { code: '705914', name: '복리후생-차량지원비',     budget: 7200000 },
  { code: '716150', name: '무형자산상각비-기타',     budget: 259192000 },
  { code: '723105', name: '교육훈련비-DIY100',       budget: 5554226 },
  { code: '506903', name: '용역수익-관계사',         budget: 0 },
  { code: '931101', name: '퇴직급여-순이자원가_IF18', budget: 0 },
  { code: '719101', name: '보험료-화재',             budget: 0 },
  { code: '735901', name: '회의비-경상회의비',       budget: 8013600 },
  { code: '743950', name: '기타판매비와관리비',      budget: 3040000 },
  { code: '705910', name: '복리후생-의료관리비',     budget: 9600000 },
  { code: '705918', name: '복리후생-음료대',         budget: 1280000 },
  { code: '705926', name: '복리후생비-팀활동지원비', budget: 600000 },
  { code: '705907', name: '복리후생-포상비',         budget: 500000 },
  { code: '706101', name: '여비교통비-국내출장',     budget: 6000000 },
  { code: '706102', name: '여비교통비-해외출장',     budget: 8000000 },
  { code: '706201', name: '여비교통비-시내교통',     budget: 6000000 },
  { code: '707103', name: '통신비-우편료',           budget: 150000 },
  { code: '710201', name: '도서-해외정기간행물',     budget: 150000 },
  { code: '710202', name: '도서-국내정기간행물',     budget: 150000 },
  { code: '710203', name: '도서-일반도서구입비',     budget: 300000 },
  { code: '710404', name: '인쇄제본-기타',           budget: 150000 },
  { code: '710301', name: '소모품비-사무용품',       budget: 300000 },
  { code: '710902', name: '소모품비-기타',           budget: 300000 },
  { code: '723102', name: '교육훈련비-사외',         budget: 393646 },
  { code: '709701', name: '세금과공과-협회비',       budget: 1500000 },
  { code: '726350', name: '수수료-기타',             budget: 3600000 },
  { code: '734102', name: '접대비-1만초과',          budget: 5670000 },
  { code: '726306', name: '수수료-자문용역',         budget: 19000000 },
  { code: '726312', name: '수수료-기술용역',         budget: 7926000000 },
];

/* 예산부서 목록 — 화면 표기: [코드]부서명 */
const BUDGET_DEPTS = [
  { code: 'AQ131', name: 'Upstream기술팀' },
  { code: 'AQ132', name: '전력수급2팀' },
  { code: 'AQ133', name: '전력사업운영실' },
];

const acctByCode = code => ACCOUNTS.find(a => a.code === code);
const fmtAcct = code => { const a = acctByCode(code); return a ? `[${a.code}]${a.name}` : ''; };
const fmtDept = code => { const d = BUDGET_DEPTS.find(d => d.code === code); return d ? `[${d.code}]${d.name}` : ''; };
/* "[735901]회의비-경상회의비" → "경상회의비" (적요 자동생성용) */
const acctShort = acctStr => (acctStr.split('-').pop() || acctStr).trim();
/* "[735901]회의비-..." → "735901" */
const acctCode = acctStr => (acctStr.match(/\[(\d+)\]/) || [])[1] || '';

/* 업종 → 계정과목 자동 추천 */
const ACCT_SUGGEST_MAP = [
  [/커피숍|편의점|베이커리/, '705918'],   // 복리후생-음료대
  [/일반주점|일반음식점|식당/, '735901'], // 회의비-경상회의비
  [/택시|교통/, '706201'],               // 여비교통비-시내교통
  [/컴퓨터소프트웨어/, '743950'],        // 기타판매비와관리비
  [/사무용품/, '710301'],
  [/서적|도서/, '710203'],
];
function suggestAcctCode(biz) {
  const hit = ACCT_SUGGEST_MAP.find(([re]) => re.test(biz));
  return hit ? hit[1] : '743950';
}
