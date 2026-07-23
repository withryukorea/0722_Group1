/* 조직도 목데이터 — 실제 조직 구조의 '결'만 유지, 특정성 제거(익명화) */
const ORG_COMPANY = 'SKㅇㅇ 주식회사';

const ORG_TREE = {
  name: 'SKㅇㅇ', children: [
    { name: '사장', children: [
      { name: 'ㅇㅇ Lab' },
      { name: 'AX추진담당' },
      { name: '전력사업본부', children: [
        { name: '전력사업운영실', children: [
          { name: '전력운영AX팀' }, { name: '전력수급1팀' }, { name: '전력수급2팀' }, { name: 'ㅇㅇ발전소' }] },
        { name: '전력사업기획실', children: [
          { name: '전력사업기획팀' }, { name: '전력사업추진팀' }, { name: '전력미래기술팀' }] },
        { name: '전력사업개발실', children: [
          { name: '전력사업개발1팀' }, { name: '전력사업개발2팀' }, { name: 'ㅇㅇPJT TF' }] },
      ] },
      { name: 'LNG사업본부', children: [
        { name: 'LNG사업운영실', children: [
          { name: 'LNG최적화팀' }, { name: 'LNG운영전략팀' }, { name: 'LNG Infra팀' }, { name: 'PT. ㅇㅇ Nusantara' }] },
        { name: 'LNG사업기획실', children: [
          { name: 'LNG AX전략팀' }, { name: 'LNG사업기획팀' }] },
        { name: 'Upstream사업실', children: [
          { name: 'Upstream기술팀' }, { name: 'Low-Carbon사업팀' }] },
        { name: 'ㅇㅇ Energy International' }, { name: 'ㅇㅇ Australia' }, { name: 'LNG ㅇㅇ, Inc.' }, { name: 'ㅇㅇ China' },
      ] },
      { name: 'Global/재생E사업본부', children: [{ name: '재생E사업팀' }, { name: 'Global사업팀' }] },
      { name: '신에너지사업본부', children: [{ name: '수소사업팀' }, { name: '신에너지기획팀' }] },
      { name: '도시가스사업본부', children: [{ name: '도시가스운영팀' }, { name: '도시가스기획팀' }] },
      { name: '경영지원본부', children: [
        { name: '경영기획실', children: [
          { name: '전략기획팀' }, { name: '경영분석팀' }, { name: '투자관리팀' }, { name: 'CISO' }] },
        { name: 'O/I추진실', children: [{ name: 'O/I혁신팀' }] },
        { name: 'SHE팀' },
      ] },
      { name: '기업문화실', children: [
        { name: '기업문화AX팀' }, { name: 'HR1팀' },
        { name: 'HR2팀', children: [{ name: 'HR서비스센터' }] },
        { name: '기업문화부' }] },
      { name: 'SKㅇㅇ America' },
      { name: 'Global사업전략담당' },
      { name: 'T-TF' },
      { name: '본사부', children: [{ name: '총무팀' }, { name: '재무팀' }] },
      { name: '고문(비상근)' },
    ] },
  ],
};

/* 팀별 구성원 — 기안자 소속팀은 고정, 나머지 팀은 결정적(해시 기반) 생성 */
const ORG_MEMBERS_FIXED = {
  'Upstream기술팀': [
    { name: '김현준', role: '기술위원', grade: 'Manager' },
    { name: '박한별',   role: '팀원', grade: 'Manager' },
    { name: '정성훈',   role: '팀원', grade: 'Manager', me: true },   // 기안자(나) · 사번 A0674
    { name: '김두리',   role: '팀원', grade: 'Manager' },
    { name: '남세움',   role: '팀원', grade: 'Manager' },
  ],
};
const ORG_NAME_POOL = ['이몽룡', '성춘향', '임꺽정', '장보고', '신사임', '강감찬', '김유신', '서희랑', '최무선', '박제상', '정몽주', '한석봉'];

function orgMembers(team) {
  if (ORG_MEMBERS_FIXED[team]) return ORG_MEMBERS_FIXED[team];
  let h = 0;
  for (const ch of team) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const count = 3 + (h % 3);
  const list = [{ name: ORG_NAME_POOL[h % ORG_NAME_POOL.length], role: '팀장', grade: 'Manager' }];
  for (let i = 1; i < count; i++) {
    list.push({ name: ORG_NAME_POOL[(h + i * 5) % ORG_NAME_POOL.length], role: '팀원', grade: 'Manager' });
  }
  return list;
}

/* 조직도에서 팀(말단) 이름 전체 목록 */
function orgLeafTeams(node = ORG_TREE, acc = []) {
  if (!node.children || !node.children.length) { acc.push(node.name); return acc; }
  node.children.forEach(c => orgLeafTeams(c, acc));
  return acc;
}
