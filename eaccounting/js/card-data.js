/* 법인카드 정산 목데이터 (Total 7건) — 실제 화면 캡쳐 기준
   진행상태: 미정산 → (전표작성 후) 정산완료 */
const CARD_TXNS = [
  { no: 1, useDate: '2026.07.21', payAt: '2026.07.21 12:24:31', merchant: '폴바셋광화문예금보험공사점', biz: '커피숍',        amount: 20500,  owner: '정성훈', dept: 'Upstream기술팀', cardNo: '4025961080293059', apprNo: '00045125', status: '미정산', registrant: '' },
  { no: 2, useDate: '2026.07.20', payAt: '2026.07.20 21:41:32', merchant: '둘둘치킨종로1가점',           biz: '일반주점',      amount: 64000,  owner: '정성훈', dept: 'Upstream기술팀', cardNo: '4025961080293059', apprNo: '00528952', status: '미정산', registrant: '' },
  { no: 3, useDate: '2026.07.19', payAt: '2026.07.19 08:33:24', merchant: 'ANTHROPIC* CLAUDE SUB',      biz: '컴퓨터소프트웨어', amount: 167435, owner: '정성훈', dept: 'Upstream기술팀', cardNo: '4025961080293059', apprNo: '153578',   status: '미정산', registrant: '' },
  { no: 4, useDate: '2026.07.16', payAt: '2026.07.16 02:58:44', merchant: '카카오_택시9',               biz: '택시',          amount: 34500,  owner: '정성훈', dept: 'Upstream기술팀', cardNo: '4025961080293059', apprNo: '00279355', status: '미정산', registrant: '' },
  { no: 5, useDate: '2026.07.16', payAt: '2026.07.16 02:58:42', merchant: '카카오_택시9',               biz: '택시',          amount: 5000,   owner: '정성훈', dept: 'Upstream기술팀', cardNo: '4025961080293059', apprNo: '00443612', status: '미정산', registrant: '' },
  { no: 6, useDate: '2026.07.16', payAt: '2026.07.16 15:57:35', merchant: '오피스디포코리아',           biz: '기타사무용품',   amount: 58650,  owner: '정성훈', dept: 'Upstream기술팀', cardNo: '4025961080293059', apprNo: '00564890', status: '미정산', registrant: '' },
  { no: 7, useDate: '2026.07.10', payAt: '2026.07.10 09:02:39', merchant: 'OPENAI *CHATGPT SUBSCR',    biz: '컴퓨터소프트웨어', amount: 162612, owner: '정성훈', dept: 'Upstream기술팀', cardNo: '4025961080293059', apprNo: '038232',   status: '미정산', registrant: '' },
];
