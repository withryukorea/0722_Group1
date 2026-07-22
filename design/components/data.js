/* ============================================================
   찍으면 끝 — 화면용 샘플 데이터 (data_sample/ · fixtures/ 기반)
   - 영수증: data_sample/expected/*.json 10건 + 계약서 예시(스시로) 1건
   - 환율: 데모 규칙 USD 1,500 고정 · JPY 9.0 (data_sample/README)
   - 오늘 날짜(데모 기준): 2026-07-22
   ============================================================ */
window.SKD = (function () {
  const TODAY = "2026-07-22";

  const USER = { name: "홍길동", team: "전력사업기획팀", office: "서울 종로 (SK서린빌딩)" };

  /* 대분류(그룹) — 도넛 세그먼트 순서는 검증된 인접 순서(red·blue·orange·green) 고정 */
  const GROUPS = {
    domestic: { name: "국내출장",  hex: "#EA002C" },
    ai:       { name: "AI구독",    hex: "#2563EB" },
    foreign:  { name: "해외출장",  hex: "#D96414" },
    general:  { name: "일반",      hex: "#0E9F6E" }
  };
  const GROUP_ORDER = ["domestic", "ai", "foreign", "general"];

  /* 계정과목 → 세부비목(sub) 매핑. TRAVEL_*는 출장 유형에 따라 국내/해외 그룹 결정 */
  const CATEGORIES = {
    TRAVEL_MEAL:      { name: "출장-식대",   sub: "식음료비",   group: "trip" },
    TRAVEL_TRANSPORT: { name: "출장-교통",   sub: "교통비",     group: "trip" },
    TRAVEL_LODGING:   { name: "출장-숙박",   sub: "숙박비",     group: "trip" },
    WELFARE_AI:       { name: "복지-AI구독", sub: "구독료",     group: "ai" },
    WELFARE_BOOK:     { name: "복지-도서",   sub: "도서비",     group: "general" },
    SNACK:            { name: "간식비",      sub: "의욕관리비", group: "general" },
    SGA_MEETING:      { name: "경상회의비",  sub: "경상회의비", group: "general" },
    SGA_POSTAGE:      { name: "판관비-우편", sub: "판관비",     group: "general" }
  };

  /* ---- 일정(출장) — 유형별 최대 2건 사전 등록, 건별로 정산 분리 ---- */
  const TRIP_MAX_PER_TYPE = 2;
  const TRIPS = [
    {
      id: "trip_busan", type: "domestic", title: "부산·울산 당일 출장",
      route: ["서울", "부산", "울산", "서울"], country: "KR",
      startDate: "2026-04-15", endDate: "2026-04-15", members: 1,
      mealCapPerDayKRW: 35000, capNote: "국내 일일 식대 35,000원 (VAT별도) × 일수",
      status: "done"
    },
    {
      id: "trip_daejeon", type: "domestic", title: "대전 연구원 방문",
      route: ["서울", "대전", "서울"], country: "KR",
      startDate: "2026-07-28", endDate: "2026-07-29", members: 1,
      mealCapPerDayKRW: 35000, capNote: "국내 일일 식대 35,000원 (VAT별도) × 일수",
      status: "planned"
    },
    {
      id: "trip_tokyo", type: "foreign", title: "도쿄 파트너사 미팅",
      route: ["서울", "도쿄", "서울"], country: "JP",
      startDate: "2026-07-20", endDate: "2026-07-23", members: 2,
      dailyCapPerPersonKRW: 100000, dailyCapKRW: 200000,
      capNote: "해외 일일 Cap 100,000원/인 × 2명 (환율 반영)",
      status: "active"
    }
  ];

  /* ---- 영수증 (환산: amountKRW = round(amount × fxRate)) ---- */
  const RECEIPTS = [
    { id: "r_paris",  merchant: "파리크라상 서울역점", amount: 10300, currency: "KRW", fxRate: 1, amountKRW: 10300,
      paidAt: "2026-04-15T07:47", serviceDate: "2026-04-15", category: "TRAVEL_MEAL", tripId: "trip_busan",
      source: "photo", img: "서울역사파리크로와상영수증.jpg", status: "matched",
      why: "결제일이 출장 기간(4/15) 내 → 출장-식대. 11분 뒤 부산행 KTX 탑승" },
    { id: "r_ktx1", merchant: "한국철도공사 KTX 015 서울→부산", amount: 59800, currency: "KRW", fxRate: 1, amountKRW: 59800,
      paidAt: "2026-04-09T00:00", serviceDate: "2026-04-15", category: "TRAVEL_TRANSPORT", tripId: "trip_busan",
      source: "photo", img: "ktx영수증_서울부산.jpg", status: "matched",
      why: "사전결제(철도)는 결제일이 아닌 탑승일(4/15) 기준으로 출장 기간 판정" },
    { id: "r_gukbap", merchant: "백세촌24시순대돼지국밥", amount: 12000, currency: "KRW", fxRate: 1, amountKRW: 12000,
      paidAt: "2026-04-15T12:47", serviceDate: "2026-04-15", category: "TRAVEL_MEAL", tripId: "trip_busan",
      source: "photo", img: null, status: "matched",
      why: "출장 기간 내 식사 → 출장-식대 (삼성페이·법인카드 승인정보로 매칭)" },
    { id: "r_ktx2", merchant: "한국철도공사 KTX 062 울산→서울", amount: 53500, currency: "KRW", fxRate: 1, amountKRW: 53500,
      paidAt: "2026-04-13T00:00", serviceDate: "2026-04-15", category: "TRAVEL_TRANSPORT", tripId: "trip_busan",
      source: "photo", img: null, status: "matched",
      why: "귀환편(울산→서울) — 복수 지역 경로 출장. 탑승일 기준 판정" },
    { id: "r_story", merchant: "StoryWay 부산역점", amount: 14400, currency: "KRW", fxRate: 1, amountKRW: 14400,
      paidAt: "2025-06-18T16:02", serviceDate: "2025-06-18", category: "TRAVEL_MEAL", tripId: null,
      source: "photo", img: "부산역(KTX역)스토리웨이편의점영수증.jpg", status: "review",
      why: "부산 390km·행정구역 변경 — 출장 일정 미등록 건, 확인 필요" },
    { id: "r_pluto", merchant: "플루토커피 (부산 기장)", amount: 14000, currency: "KRW", fxRate: 1, amountKRW: 14000,
      paidAt: "2025-07-02T12:49", serviceDate: "2025-07-02", category: "TRAVEL_MEAL", tripId: null,
      source: "photo", img: "플루토커피카페영수증.jpg", status: "review",
      why: "부산 기장 400km — 출장 일정 미등록 건, 확인 필요" },
    { id: "r_herman", merchant: "카페 헤르만의정원 D타워점", amount: 17400, currency: "KRW", fxRate: 1, amountKRW: 17400,
      paidAt: "2026-03-06T12:58", serviceDate: "2026-03-06", category: "SNACK", tripId: null,
      source: "photo", img: "카페헤르만의정원영수증.jpg", status: "matched",
      why: "근무지(종로 0.2km) — 거리 30km 미달 → 일반 간식비" },
    { id: "r_sbux", merchant: "스타벅스 광화문점 (팀 회의)", amount: 26000, currency: "KRW", fxRate: 1, amountKRW: 26000,
      paidAt: "2026-07-16T14:10", serviceDate: "2026-07-16", category: "SGA_MEETING", tripId: null,
      source: "photo", img: null, status: "matched",
      why: "근무지 인근 · 회의 목적 → 일반 > 경상회의비" },
    { id: "r_post", merchant: "광화문우체국 (등기)", amount: 4110, currency: "KRW", fxRate: 1, amountKRW: 4110,
      paidAt: "2026-07-02T15:34", serviceDate: "2026-07-02", category: "SGA_POSTAGE", tripId: null,
      source: "photo", img: "우체국등기영수증.jpg", status: "review",
      why: "판관비-우편 — 계정과목 코드 신설 필요 건" },
    { id: "r_gpt", merchant: "OpenAI (ChatGPT 구독)", amount: 22.0, currency: "USD", fxRate: 1500, amountKRW: 33000,
      paidAt: "2026-07-09T00:00", serviceDate: "2026-07-09", category: "WELFARE_AI", tripId: null,
      source: "pdf", img: null, status: "matched",
      why: "프리셋: OpenAI/Anthropic 가맹점 → 복지-AI구독. USD×1,500 환산" },
    { id: "r_gpt_inv", merchant: "OpenAI 인보이스 (TUNC0J2S-0014)", amount: 22.0, currency: "USD", fxRate: 1500, amountKRW: 33000,
      paidAt: "2026-07-09T00:00", serviceDate: "2026-07-09", category: "WELFARE_AI", tripId: null,
      source: "pdf", img: null, status: "duplicate", dupOf: "r_gpt",
      why: "같은 결제건의 청구서 — invoiceNo 기준 중복 감지, 전표 제외" },
    { id: "r_claude", merchant: "Anthropic (Claude 구독)", amount: 110.0, currency: "USD", fxRate: 1500, amountKRW: 165000,
      paidAt: "2026-07-05T00:00", serviceDate: "2026-07-05", category: "WELFARE_AI", tripId: null,
      source: "pdf", img: null, status: "matched",
      why: "프리셋: AI구독. 2페이지 PDF(빈 페이지 처리) 케이스" },
    { id: "r_claude_inv", merchant: "Anthropic 인보이스 (6IBKFSKM-0006)", amount: 110.0, currency: "USD", fxRate: 1500, amountKRW: 165000,
      paidAt: "2026-07-05T00:00", serviceDate: "2026-07-05", category: "WELFARE_AI", tripId: null,
      source: "pdf", img: null, status: "duplicate", dupOf: "r_claude",
      why: "같은 결제건의 청구서 — 중복 감지, 전표 제외" },
    { id: "r_sushi", merchant: "스시로 신주쿠점 (スシロー)", amount: 8800, currency: "JPY", fxRate: 9.0, amountKRW: 79200,
      paidAt: "2026-07-21T19:32", serviceDate: "2026-07-21", category: "TRAVEL_MEAL", tripId: "trip_tokyo",
      source: "photo", img: null, status: "matched",
      why: "해외출장(도쿄 7/20–7/23) 기간 내 → 해외출장비. ¥8,800 × 9.0 = ₩79,200" }
  ];

  /* ---- 영수증 부가 정보: 승인번호(매칭 1순위 키) · 부가세 · 예외 플래그 ----
     vat.basis: stated(표기) | reverse(역산 합계÷11, 오차 가능) | exempt(면세) | missing(미표기)
     industryMismatch: 업종 미스매치(페이·전자상거래 등) → 반려 대신 "증빙 첨부 요청" */
  const RECEIPT_EXTRA = {
    r_paris:  { approvalNo: "84231907", vat: { supply: 9364,  vat: 936,  basis: "stated" } },
    r_ktx1:   { approvalNo: "00351509", vat: { supply: 54364, vat: 5436, basis: "stated" } },
    r_gukbap: { approvalNo: "30125478", vat: { supply: 10909, vat: 1091, basis: "stated" },
                industryMismatch: true, evidenceAttached: true },
    r_ktx2:   { approvalNo: "00417732", vat: { supply: 48637, vat: 4863, basis: "stated" } },
    r_story:  { approvalNo: null,       vat: { supply: 13091, vat: 1309, basis: "reverse", needCheck: true } },
    r_pluto:  { approvalNo: null,       vat: { supply: 12727, vat: 1273, basis: "stated" } },
    r_herman: { approvalNo: "19402211", vat: { supply: 15818, vat: 1582, basis: "reverse", needCheck: true } },
    r_sbux:   { approvalNo: "55023918", vat: { supply: 23636, vat: 2364, basis: "stated" } },
    r_post:   { approvalNo: null,       vat: { supply: 4110,  vat: 0,    basis: "exempt" } },
    r_gpt:    { approvalNo: null, cardLast4: "9112", vat: { supply: 20.0, vat: 2.0, basis: "stated" } },
    r_claude: { approvalNo: null,       vat: { basis: "missing", needCheck: true } },
    r_sushi:  { approvalNo: "71038845", vat: { supply: 8000, vat: 800, basis: "stated" } }
  };
  RECEIPTS.forEach(r => Object.assign(r, RECEIPT_EXTRA[r.id] || {}));

  /* ---- 예산 (fixtures/budgets.json 기반 · AI구독은 기본 제도 DIY100 상한 적용) ---- */
  const BUDGETS = [
    { category: "WELFARE_AI",   label: "AI구독 · DIY100 예산", limitKRW: 1000000, usedKRW: 318000, vatNote: "VAT별도" },
    { category: "WELFARE_BOOK", label: "복지비 · 도서",        limitKRW: 200000,  usedKRW: 33000 },
    { category: "WELFARE_ETC",  label: "복지비 · 기타",        limitKRW: 100000,  usedKRW: 0 }
  ];

  /* ---- AI Tool 제도별 상한 프리셋 (정산 제도에 따라 상한이 다름 · 기본: DIY100) ---- */
  const AI_PRESETS = [
    { id: "diy100",   name: "DIY100 예산 정산",  capKRW: 1000000, note: "연 한도 1,000,000원 (VAT별도) · DIY100 예산 차감" },
    { id: "dept",     name: "부서 운영비 정산",  capKRW: 150000,  note: "월 한도 · 팀장 승인 필요" },
    { id: "research", name: "연구개발비 정산",   capKRW: 500000,  note: "과제 예산 · 증빙 인보이스 필수" }
  ];

  /* ---- 법인카드 승인내역 (정산 매칭용) ---- */
  const CARD_TX = [
    { id: "tx_01", merchant: "한국철도공사",       amountKRW: 59800,  approvedAt: "2026-04-09T09:12", receiptId: "r_ktx1",  score: 95 },
    { id: "tx_02", merchant: "한국철도공사",       amountKRW: 53500,  approvedAt: "2026-04-13T18:40", receiptId: "r_ktx2",  score: 92 },
    { id: "tx_03", merchant: "파리크라상 서울역",  amountKRW: 10300,  approvedAt: "2026-04-15T07:47", receiptId: "r_paris", score: 98 },
    { id: "tx_04", merchant: "백세촌순대돼지국밥", amountKRW: 12000,  approvedAt: "2026-04-15T12:47", receiptId: "r_gukbap", score: 97 },
    { id: "tx_05", merchant: "OPENAI *CHATGPT",    amountKRW: 33000,  approvedAt: "2026-07-09T13:05", receiptId: "r_gpt",   score: 90, fx: "$22.00" },
    { id: "tx_06", merchant: "ANTHROPIC PBC",      amountKRW: 165000, approvedAt: "2026-07-05T10:22", receiptId: "r_claude", score: 91, fx: "$110.00" },
    { id: "tx_07", merchant: "SUSHIRO SHINJUKU",   amountKRW: 79200,  approvedAt: "2026-07-21T19:32", receiptId: "r_sushi", score: 88, fx: "¥8,800" },
    { id: "tx_08", merchant: "광화문우체국",       amountKRW: 4110,   approvedAt: "2026-07-02T15:34", receiptId: "r_post",  score: 82 },
    { id: "tx_09", merchant: "헤르만의정원",       amountKRW: 17400,  approvedAt: "2026-03-06T12:58", receiptId: "r_herman", score: 96 },
    { id: "tx_10", merchant: "스토리웨이 부산역",  amountKRW: 14400,  approvedAt: "2025-06-18T16:02", receiptId: "r_story", score: 55 },
    { id: "tx_11", merchant: "플루토커피",         amountKRW: 14000,  approvedAt: "2025-07-02T12:49", receiptId: "r_pluto", score: 58 },
    { id: "tx_12", merchant: "GS25 광화문점",      amountKRW: 8700,   approvedAt: "2026-07-18T21:03", receiptId: null,      score: 0 },
    { id: "tx_13", merchant: "교보문고 광화문",    amountKRW: 28000,  approvedAt: "2026-07-15T12:11", receiptId: null,      score: 0 },
    { id: "tx_14", merchant: "스타벅스 광화문점",  amountKRW: 26000,  approvedAt: "2026-07-16T14:10", receiptId: "r_sbux",  score: 94 }
  ];
  /* 카드사 데이터의 승인번호/카드뒷자리 (승인번호가 매칭 1순위 키) */
  const TX_EXTRA = {
    tx_01: { approvalNo: "00351509" }, tx_02: { approvalNo: "00417732" },
    tx_03: { approvalNo: "84231907" }, tx_04: { approvalNo: "30125478" },
    tx_05: { cardLast4: "9112" },      tx_07: { approvalNo: "71038845" },
    tx_09: { approvalNo: "19402211" }, tx_14: { approvalNo: "55023918" }
  };
  CARD_TX.forEach(t => Object.assign(t, TX_EXTRA[t.id] || {}));

  /* 매칭 근거: 승인번호 일치 > 금액+일시+카드뒷자리 > 금액+일시 폴백 */
  function matchBasis(r, tx) {
    if (!tx) return null;
    if (r.approvalNo && tx.approvalNo === r.approvalNo) return { label: "승인번호 일치 " + r.approvalNo, rank: 1 };
    if (r.cardLast4 && tx.cardLast4 === r.cardLast4) return { label: "금액+일시+카드 ****" + r.cardLast4, rank: 2 };
    return { label: "금액+일시 근접 (승인번호 미인식 → 폴백)", rank: 3 };
  }

  /* 수동 매칭 후보: 금액 ±3% 승인내역 (모호 매칭 해소용) */
  function candidatesFor(r) {
    return CARD_TX.filter(t => Math.abs(t.amountKRW - r.amountKRW) <= r.amountKRW * 0.03)
      .sort((a, b) => Math.abs(a.amountKRW - r.amountKRW) - Math.abs(b.amountKRW - r.amountKRW));
  }

  /* 부가세 표기 라벨 */
  function vatInfo(r) {
    const v = r.vat;
    if (!v) return null;
    const cur = (n) => r.currency === "KRW" ? krw(n) : (r.currency === "USD" ? "$" + n.toFixed(2) : "¥" + fmt(n));
    if (v.basis === "exempt")  return { text: "면세 — 부가세 없음", badge: "면세", warn: false };
    if (v.basis === "missing") return { text: "부가세 미표기 — 확인 필요", badge: "확인 필요", warn: true };
    const t = `공급가액 ${cur(v.supply)} + 부가세 ${cur(v.vat)}`;
    if (v.basis === "reverse") return { text: t + " (합계÷11 역산)", badge: "역산 · 오차 가능", warn: !!v.needCheck };
    return { text: t, badge: "영수증 표기", warn: !!v.needCheck };
  }

  /* ---- 분류 판정 가이드라인 (data_sample/README 확정 규칙 — 화면 노출용) ---- */
  const RULES = [
    { t: "출장 판정", d: "편도 30km 이상 AND 행정구역 변경 — 둘 다 충족해야 출장. 아니면 외근(일반경비)" },
    { t: "기간 규칙", d: "등록된 출장 기간 내 결제는 장소 불문 전부 출장비 (시작일·종료일 포함)" },
    { t: "사전결제", d: "철도·항공은 탑승일, 숙박은 투숙일 기준으로 기간 판정 (카드 매칭은 승인일)" },
    { t: "환율", d: "USD 1,500원 고정 (데모). 원본 통화 보존, 환산액(amountKRW)으로 집계·한도 차감" }
  ];

  /* ---------------- 헬퍼 ---------------- */
  const fmt = (n) => Math.round(n).toLocaleString("ko-KR");
  const krw = (n) => "₩" + fmt(n);
  const money = (r) => r.currency === "KRW" ? krw(r.amount)
    : (r.currency === "USD" ? "$" + r.amount.toFixed(2) : "¥" + fmt(r.amount));
  const dateShort = (iso) => { const d = iso.slice(0, 10).split("-"); return `${d[0].slice(2)}.${d[1]}.${d[2]}`; };
  const dt = (iso) => dateShort(iso) + (iso.length > 10 ? " " + iso.slice(11, 16) : "");

  function tripDays(t) {
    return Math.round((new Date(t.endDate) - new Date(t.startDate)) / 86400000) + 1;
  }
  /* 출장 식대/Cap 총한도: 국내 = 35,000×일수, 해외 = 일일Cap×일수 */
  function tripCap(t) {
    return t.type === "domestic" ? t.mealCapPerDayKRW * tripDays(t) : t.dailyCapKRW * tripDays(t);
  }
  /* 출장 한도 차감 대상: 국내는 식대만(교통·숙박은 실비), 해외는 전 항목 */
  function tripSpent(t) {
    return RECEIPTS.filter(r => r.tripId === t.id && r.status !== "duplicate")
      .filter(r => t.type === "domestic" ? r.category === "TRAVEL_MEAL" : true)
      .reduce((s, r) => s + r.amountKRW, 0);
  }
  function tripAll(t) {
    return RECEIPTS.filter(r => r.tripId === t.id && r.status !== "duplicate")
      .reduce((s, r) => s + r.amountKRW, 0);
  }
  /* 대분류 판정: TRAVEL_*는 연결된 출장 유형으로, 미연결 TRAVEL은 국내 추정 */
  function groupOf(r) {
    const g = CATEGORIES[r.category].group;
    if (g !== "trip") return g;
    const t = TRIPS.find(x => x.id === r.tripId);
    return t ? (t.type === "foreign" ? "foreign" : "domestic") : "domestic";
  }
  const subOf = (r) => CATEGORIES[r.category].sub;
  /* 그룹 → {sub: 금액} 집계 */
  function groupTotals(list) {
    const out = {};
    GROUP_ORDER.forEach(g => out[g] = { total: 0, subs: {} });
    (list || valid()).forEach(r => {
      const g = groupOf(r), s = subOf(r);
      out[g].total += r.amountKRW;
      out[g].subs[s] = (out[g].subs[s] || 0) + r.amountKRW;
    });
    return out;
  }
  const activeTrip = () => TRIPS.find(t => t.status === "active") || null;
  const valid = () => RECEIPTS.filter(r => r.status !== "duplicate");

  function imgUrl(name) { return name ? "/data_sample/images/" + encodeURIComponent(name) : null; }

  /* 차트 툴팁 */
  function attachTip() {
    let tip = document.querySelector(".viz-tip");
    if (!tip) { tip = document.createElement("div"); tip.className = "viz-tip"; document.body.appendChild(tip); }
    return {
      show(html, x, y) {
        tip.innerHTML = html; tip.style.display = "block";
        const w = tip.offsetWidth, vw = window.innerWidth;
        tip.style.left = Math.min(x + 14, vw - w - 10) + "px";
        tip.style.top = (y + 14) + "px";
      },
      hide() { tip.style.display = "none"; }
    };
  }

  /* AI구독료 정책 템플릿 (자동 강제 세팅 금지 — 사람이 버튼을 눌러야 적용) */
  const AI_POLICY = {
    budgetDept: "전력사업기획팀", account: "복지-AI구독 (DIY100)",
    reviewer: "현업검토 · 이대리",
    memo: (tool, who) => `[AI구독료] ${tool}_${who}`
  };

  return { TODAY, USER, CATEGORIES, GROUPS, GROUP_ORDER, TRIPS, TRIP_MAX_PER_TYPE, RECEIPTS, BUDGETS,
    AI_PRESETS, AI_POLICY, CARD_TX, RULES, fmt, krw, money, dateShort, dt,
    tripDays, tripCap, tripSpent, tripAll, groupOf, subOf, groupTotals, activeTrip, valid, imgUrl, attachTip,
    matchBasis, candidatesFor, vatInfo };
})();
