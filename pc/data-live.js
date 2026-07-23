/* ============================================================
   찍으면 끝 — PC 웹 데이터 어댑터 (LIVE)
   ------------------------------------------------------------
   목적: 이 화면은 "모바일웹과 동일한 데이터"를 같은 서버에서 읽는다.
   - 원본 목업(design/)의 window.SKD 와 100% 같은 인터페이스를 제공하되,
     RECEIPTS/CARD_TX/TRIPS/BUDGETS 를 라이브 API(GET /api/*)에서 채운다.
   - API 실패 시 데모 시드로 폴백(app/api.js 의 demoFallback 과 동일 철학).
   - 화면 인라인 스크립트는 `SKD.load().then(render)` 로 데이터 로드 후 렌더.

   설계 메모:
   - 라이브 receipt 는 accountCode/status 가 미확정일 수 있으므로,
     어댑터가 프리셋·키워드·출장기간으로 category/tripId/status 를 파생한다.
     (서버 match/preview 단계 로직의 경량 프런트 재현 — 화면 표시 전용)
   - category 는 항상 CATEGORIES 에 존재하는 코드로 보장(화면 크래시 방지).
   ============================================================ */
window.SKD = (function () {
  const CFG = window.PC_CONFIG;
  const API = window.PC_API;
  const TODAY = "2026-07-22";

  const USER = { name: "홍길동", team: "전력사업기획팀", office: "서울 종로 (SK서린빌딩)" };

  const GROUPS = {
    domestic: { name: "국내출장", hex: "#EA002C" },
    ai:       { name: "AI구독",   hex: "#2563EB" },
    foreign:  { name: "해외출장", hex: "#D96414" },
    general:  { name: "일반",     hex: "#0E9F6E" }
  };
  const GROUP_ORDER = ["domestic", "ai", "foreign", "general"];

  /* 계정과목 → 세부비목(sub). TRAVEL_*는 출장유형에 따라 국내/해외 그룹 결정 */
  const CATEGORIES = {
    TRAVEL_MEAL:      { name: "출장-식대",   sub: "식음료비",   group: "trip" },
    TRAVEL_TRANSPORT: { name: "출장-교통",   sub: "교통비",     group: "trip" },
    TRAVEL_LODGING:   { name: "출장-숙박",   sub: "숙박비",     group: "trip" },
    WELFARE_AI:       { name: "복지-AI구독", sub: "구독료",     group: "ai" },
    WELFARE_BOOK:     { name: "복지-도서",   sub: "도서비",     group: "general" },
    WELFARE_ETC:      { name: "복지-기타",   sub: "복지비",     group: "general" },
    SNACK:            { name: "간식비",      sub: "의욕관리비", group: "general" },
    SGA_MEETING:      { name: "경상회의비",  sub: "경상회의비", group: "general" },
    SGA_POSTAGE:      { name: "판관비-우편", sub: "판관비",     group: "general" }
  };
  const FALLBACK_CAT = "SNACK"; // 미분류 시 안전 기본값(항상 CATEGORIES 에 존재)

  const AI_PRESETS = [
    { id: "diy100",   name: "DIY100 예산 정산", capKRW: 1000000, note: "연 한도 1,000,000원 (VAT별도) · DIY100 예산 차감" },
    { id: "dept",     name: "부서 운영비 정산", capKRW: 150000,  note: "월 한도 · 팀장 승인 필요" },
    { id: "research", name: "연구개발비 정산",  capKRW: 500000,  note: "과제 예산 · 증빙 인보이스 필수" }
  ];
  const RULES = [
    { t: "출장 판정", d: "편도 30km 이상 AND 행정구역 변경 — 둘 다 충족해야 출장. 아니면 외근(일반경비)" },
    { t: "기간 규칙", d: "등록된 출장 기간 내 결제는 장소 불문 전부 출장비 (시작일·종료일 포함)" },
    { t: "사전결제", d: "철도·항공은 탑승일, 숙박은 투숙일 기준으로 기간 판정 (카드 매칭은 승인일)" },
    { t: "환율", d: "USD 1,500원 고정 (데모). 원본 통화 보존, 환산액(amountKRW)으로 집계·한도 차감" }
  ];
  const AI_POLICY = {
    budgetDept: "전력사업기획팀", account: "복지-AI구독 (DIY100)", reviewer: "현업검토 · 이대리",
    memo: (tool, who) => `[AI구독료] ${tool}_${who}`
  };

  /* ---- 라이브에서 채워지는 데이터 (in-place 갱신: 참조 유지) ---- */
  const RECEIPTS = [];
  const CARD_TX = [];
  const TRIPS = [];
  const BUDGETS = [];
  const PRESETS = [];        // 원본 프리셋(정산단위) 배열 — TRIP 포함 전체
  const PRESETS_BY_ID = {};  // id → preset (in-place 갱신)

  /* ================= 헬퍼 (순수함수 — 원본 data.js 이관) ================= */
  const fmt = (n) => Math.round(n).toLocaleString("ko-KR");
  const krw = (n) => "₩" + fmt(n);
  const money = (r) => r.currency === "KRW" ? krw(r.amount)
    : (r.currency === "USD" ? "$" + Number(r.amount).toFixed(2) : "¥" + fmt(r.amount));
  const dateShort = (iso) => { const d = iso.slice(0, 10).split("-"); return `${d[0].slice(2)}.${d[1]}.${d[2]}`; };
  const dt = (iso) => dateShort(iso) + (iso.length > 10 ? " " + iso.slice(11, 16) : "");

  function tripDays(t) { return Math.round((new Date(t.endDate) - new Date(t.startDate)) / 86400000) + 1; }
  function tripCap(t) { return t.type === "domestic" ? t.mealCapPerDayKRW * tripDays(t) : t.dailyCapKRW * tripDays(t); }
  function tripSpent(t) {
    return RECEIPTS.filter(r => r.tripId === t.id && r.status !== "duplicate")
      .filter(r => t.type === "domestic" ? r.category === "TRAVEL_MEAL" : true)
      .reduce((s, r) => s + r.amountKRW, 0);
  }
  function tripAll(t) {
    return RECEIPTS.filter(r => r.tripId === t.id && r.status !== "duplicate").reduce((s, r) => s + r.amountKRW, 0);
  }
  const catOf = (code) => CATEGORIES[code] || CATEGORIES[FALLBACK_CAT];
  function groupOf(r) {
    const g = catOf(r.category).group;
    if (g !== "trip") return g;
    const t = TRIPS.find(x => x.id === r.tripId);
    return t ? (t.type === "foreign" ? "foreign" : "domestic") : "domestic";
  }
  const subOf = (r) => catOf(r.category).sub;
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

  function imgUrl(name) {
    if (!name) return null;
    // 라이브 이미지(API 절대/상대 URL)면 그대로, 데모 파일명이면 data_sample 경로
    if (/^https?:\/\//.test(name) || name.startsWith("/")) return name;
    return CFG.demoImageBase + encodeURIComponent(name);
  }

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
  function matchBasis(r, tx) {
    if (!tx) return null;
    if (r.approvalNo && tx.approvalNo === r.approvalNo) return { label: "승인번호 일치 " + r.approvalNo, rank: 1 };
    if (r.cardLast4 && tx.cardLast4 === r.cardLast4) return { label: "금액+일시+카드 ****" + r.cardLast4, rank: 2 };
    return { label: "금액+일시 근접 (승인번호 미인식 → 폴백)", rank: 3 };
  }
  function candidatesFor(r) {
    return CARD_TX.filter(t => Math.abs(t.amountKRW - r.amountKRW) <= r.amountKRW * 0.03)
      .sort((a, b) => Math.abs(a.amountKRW - r.amountKRW) - Math.abs(b.amountKRW - r.amountKRW));
  }
  function vatInfo(r) {
    const v = r.vat;
    if (!v) return null;
    const cur = (n) => r.currency === "KRW" ? krw(n) : (r.currency === "USD" ? "$" + Number(n).toFixed(2) : "¥" + fmt(n));
    if (v.basis === "exempt")  return { text: "면세 — 부가세 없음", badge: "면세", warn: false };
    if (v.basis === "missing") return { text: "부가세 미표기 — 확인 필요", badge: "확인 필요", warn: true };
    if (v.supply == null || v.vat == null) return { text: "부가세 정보 미확정", badge: "확인 필요", warn: true };
    const t = `공급가액 ${cur(v.supply)} + 부가세 ${cur(v.vat)}`;
    if (v.basis === "reverse") return { text: t + " (합계÷11 역산)", badge: "역산 · 오차 가능", warn: !!v.needCheck };
    return { text: t, badge: "영수증 표기", warn: !!v.needCheck };
  }

  /* ================= 라이브 → SKD shape 매핑 ================= */
  const AI_KWS = ["ANTHROPIC", "OPENAI", "CLAUDE", "CHATGPT", "GITHUB", "CURSOR", "GPT"];
  const TRANSPORT_KWS = ["KTX", "철도", "택시", "TAXI", "카카오_택시", "항공", "AIR", "RAIL"];
  const BOOK_KWS = ["문고", "서점", "YES24", "알라딘", "교보"];

  function classifyCategory(rc, presetsById) {
    if (rc.accountCode && CATEGORIES[rc.accountCode]) return rc.accountCode;
    const ps = rc.presetId && presetsById[rc.presetId];
    if (ps && ps.rules && ps.rules.allowedAccountCodes && ps.rules.allowedAccountCodes[0]) {
      const c = ps.rules.allowedAccountCodes[0];
      if (CATEGORIES[c]) return c;
    }
    const m = (rc.ocr && rc.ocr.merchant || "").toUpperCase();
    // RECURRING 프리셋 키워드 매칭
    for (const p of Object.values(presetsById)) {
      if (p.type === "TRIP") continue;
      const kws = (p.rules && p.rules.matchKeywords) || [];
      if (kws.some(k => m.includes(String(k).toUpperCase())) && p.rules.allowedAccountCodes[0] && CATEGORIES[p.rules.allowedAccountCodes[0]])
        return p.rules.allowedAccountCodes[0];
    }
    if (AI_KWS.some(k => m.includes(k))) return "WELFARE_AI";
    if (TRANSPORT_KWS.some(k => m.includes(k.toUpperCase()))) return "TRAVEL_TRANSPORT";
    if (BOOK_KWS.some(k => m.includes(k.toUpperCase()))) return "WELFARE_BOOK";
    return FALLBACK_CAT;
  }

  function findTripFor(rc, trips) {
    if (rc.presetId) { const t = trips.find(x => x.id === rc.presetId); if (t) return t.id; }
    const d = rc.serviceDate || (rc.ocr && rc.ocr.paidAt || "").slice(0, 10);
    if (!d) return null;
    const t = trips.find(x => d >= x.startDate && d <= x.endDate);
    return t ? t.id : null;
  }

  function mapVat(rc) {
    const v = rc.vat || {};
    if (v.confirmed != null) {
      const vat = Number(v.confirmed);
      return { supply: Math.max(0, rc.amountKRW - vat), vat, basis: "stated" };
    }
    if (v.extracted != null) return { vat: Number(v.extracted), basis: "reverse", needCheck: true };
    return { basis: "missing", needCheck: true };
  }

  function mapReceipt(rc, presetsById, trips) {
    const ocr = rc.ocr || {};
    const category = classifyCategory(rc, presetsById);
    const tripId = findTripFor(rc, trips);
    const dup = (rc.checks || []).some(c => (c.code || c.type || c) === "DUPLICATE_DOCUMENT");
    const status = dup ? "duplicate" : (rc.matchedTxId ? "matched" : "review");
    const img = rc.imageUrl ? ((API.activeBase || CFG.apiBase) + rc.imageUrl) : null;
    return {
      id: rc.id,
      merchant: ocr.merchant || rc.id,
      amount: ocr.amount != null ? ocr.amount : rc.amountKRW,
      currency: ocr.currency || "KRW",
      fxRate: rc.fxRate != null ? rc.fxRate : 1,
      amountKRW: rc.amountKRW != null ? rc.amountKRW : (ocr.amount || 0),
      paidAt: ocr.paidAt || (rc.createdAt || TODAY),
      serviceDate: rc.serviceDate || (ocr.paidAt || "").slice(0, 10) || TODAY,
      category,
      tripId,
      source: category === "WELFARE_AI" ? "pdf" : "photo",
      img,
      status,
      presetId: rc.presetId || null, // 정산단위(세트) 소속 — 담기/빼기 대상
      matchedTxId: rc.matchedTxId || null,
      approvalNo: null, // 2차 패스에서 매칭 tx의 승인번호 연결
      cardLast4: ocr.cardLast4 || null,
      vat: mapVat(rc),
      items: ocr.items || [],
      why: "라이브 서버 데이터 — 프리셋·키워드·출장기간으로 자동 분류"
    };
  }

  function mapTx(t) {
    const foreign = t.currency && t.currency !== "KRW";
    return {
      id: t.id,
      merchant: t.merchant,
      amountKRW: t.amountKRW != null ? t.amountKRW : t.amount,
      approvedAt: t.approvedAt,
      receiptId: null, // 2차 패스
      score: 0,        // 2차 패스
      approvalNo: t.apprNo || null,
      cardLast4: t.cardLast4 || null,
      biz: t.biz || null,
      fx: foreign ? (t.currency === "USD" ? "$" + Number(t.amount).toFixed(2) : "¥" + fmt(t.amount)) : undefined
    };
  }

  function mapTrip(p) {
    const meta = p.meta || {};
    const country = meta.country || (meta.destination === "도쿄" ? "JP" : "KR");
    const type = country === "KR" ? "domestic" : "foreign";
    const period = p.period || {};
    const start = period.start || TODAY, end = period.end || TODAY;
    const members = meta.members || 1;
    const limit = (p.rules && p.rules.limitKRW) || 0;
    const status = TODAY < start ? "planned" : TODAY > end ? "done" : "active";
    const base = {
      id: p.id, type, title: p.name, destination: meta.destination || p.name,
      members, startDate: start, endDate: end,
      route: meta.route || [], country, status
    };
    if (type === "domestic") {
      base.mealCapPerDayKRW = limit || 35000;
      base.capNote = `국내 일일 식대 ${fmt(base.mealCapPerDayKRW)}원 (VAT별도) × 일수`;
    } else {
      base.dailyCapKRW = limit || 200000;
      base.dailyCapPerPersonKRW = Math.round(base.dailyCapKRW / Math.max(1, members));
      base.capNote = `해외 일일 Cap ${fmt(base.dailyCapPerPersonKRW)}원/인 × ${members}명 (환율 반영)`;
    }
    return base;
  }

  function mapBudget(b) {
    return { category: b.category, label: b.name || b.category, limitKRW: b.limitKRW, usedKRW: b.usedKRW, vatNote: b.category === "WELFARE_AI" ? "VAT별도" : undefined };
  }

  /* ================= 데모 시드 (폴백 + 업로드 스토리텔링) ================= */
  function demoReceipts() {
    const R = [
      { id: "r_paris",  merchant: "파리크라상 서울역점", amount: 10300, currency: "KRW", fxRate: 1, amountKRW: 10300, paidAt: "2026-04-15T07:47", serviceDate: "2026-04-15", category: "TRAVEL_MEAL", tripId: "trip_busan", source: "photo", img: "서울역사파리크로와상영수증.jpg", status: "matched", why: "결제일이 출장 기간(4/15) 내 → 출장-식대. 11분 뒤 부산행 KTX 탑승", approvalNo: "84231907", vat: { supply: 9364, vat: 936, basis: "stated" } },
      { id: "r_ktx1", merchant: "한국철도공사 KTX 015 서울→부산", amount: 59800, currency: "KRW", fxRate: 1, amountKRW: 59800, paidAt: "2026-04-09T00:00", serviceDate: "2026-04-15", category: "TRAVEL_TRANSPORT", tripId: "trip_busan", source: "photo", img: "ktx영수증_서울부산.jpg", status: "matched", why: "사전결제(철도)는 결제일이 아닌 탑승일(4/15) 기준으로 출장 기간 판정", approvalNo: "00351509", vat: { supply: 54364, vat: 5436, basis: "stated" } },
      { id: "r_gukbap", merchant: "백세촌24시순대돼지국밥", amount: 12000, currency: "KRW", fxRate: 1, amountKRW: 12000, paidAt: "2026-04-15T12:47", serviceDate: "2026-04-15", category: "TRAVEL_MEAL", tripId: "trip_busan", source: "photo", img: null, status: "matched", why: "출장 기간 내 식사 → 출장-식대 (삼성페이·법인카드 승인정보로 매칭)", approvalNo: "30125478", vat: { supply: 10909, vat: 1091, basis: "stated" }, industryMismatch: true, evidenceAttached: true },
      { id: "r_ktx2", merchant: "한국철도공사 KTX 062 울산→서울", amount: 53500, currency: "KRW", fxRate: 1, amountKRW: 53500, paidAt: "2026-04-13T00:00", serviceDate: "2026-04-15", category: "TRAVEL_TRANSPORT", tripId: "trip_busan", source: "photo", img: null, status: "matched", why: "귀환편(울산→서울) — 복수 지역 경로 출장. 탑승일 기준 판정", approvalNo: "00417732", vat: { supply: 48637, vat: 4863, basis: "stated" } },
      { id: "r_story", merchant: "StoryWay 부산역점", amount: 14400, currency: "KRW", fxRate: 1, amountKRW: 14400, paidAt: "2025-06-18T16:02", serviceDate: "2025-06-18", category: "TRAVEL_MEAL", tripId: null, source: "photo", img: "부산역(KTX역)스토리웨이편의점영수증.jpg", status: "review", why: "부산 390km·행정구역 변경 — 출장 일정 미등록 건, 확인 필요", approvalNo: null, vat: { supply: 13091, vat: 1309, basis: "reverse", needCheck: true } },
      { id: "r_pluto", merchant: "플루토커피 (부산 기장)", amount: 14000, currency: "KRW", fxRate: 1, amountKRW: 14000, paidAt: "2025-07-02T12:49", serviceDate: "2025-07-02", category: "TRAVEL_MEAL", tripId: null, source: "photo", img: "플루토커피카페영수증.jpg", status: "review", why: "부산 기장 400km — 출장 일정 미등록 건, 확인 필요", approvalNo: null, vat: { supply: 12727, vat: 1273, basis: "stated" } },
      { id: "r_herman", merchant: "카페 헤르만의정원 D타워점", amount: 17400, currency: "KRW", fxRate: 1, amountKRW: 17400, paidAt: "2026-03-06T12:58", serviceDate: "2026-03-06", category: "SNACK", tripId: null, source: "photo", img: "카페헤르만의정원영수증.jpg", status: "matched", why: "근무지(종로 0.2km) — 거리 30km 미달 → 일반 간식비", approvalNo: "19402211", vat: { supply: 15818, vat: 1582, basis: "reverse", needCheck: true } },
      { id: "r_sbux", merchant: "스타벅스 광화문점 (팀 회의)", amount: 26000, currency: "KRW", fxRate: 1, amountKRW: 26000, paidAt: "2026-07-16T14:10", serviceDate: "2026-07-16", category: "SGA_MEETING", tripId: null, source: "photo", img: null, status: "matched", why: "근무지 인근 · 회의 목적 → 일반 > 경상회의비", approvalNo: "55023918", vat: { supply: 23636, vat: 2364, basis: "stated" } },
      { id: "r_post", merchant: "광화문우체국 (등기)", amount: 4110, currency: "KRW", fxRate: 1, amountKRW: 4110, paidAt: "2026-07-02T15:34", serviceDate: "2026-07-02", category: "SGA_POSTAGE", tripId: null, source: "photo", img: "우체국등기영수증.jpg", status: "review", why: "판관비-우편 — 계정과목 코드 신설 필요 건", approvalNo: null, vat: { supply: 4110, vat: 0, basis: "exempt" } },
      { id: "r_gpt", merchant: "OpenAI (ChatGPT 구독)", amount: 22.0, currency: "USD", fxRate: 1500, amountKRW: 33000, paidAt: "2026-07-09T00:00", serviceDate: "2026-07-09", category: "WELFARE_AI", tripId: null, source: "pdf", img: null, status: "matched", why: "프리셋: OpenAI/Anthropic 가맹점 → 복지-AI구독. USD×1,500 환산", approvalNo: null, cardLast4: "9112", vat: { supply: 20.0, vat: 2.0, basis: "stated" } },
      { id: "r_gpt_inv", merchant: "OpenAI 인보이스 (TUNC0J2S-0014)", amount: 22.0, currency: "USD", fxRate: 1500, amountKRW: 33000, paidAt: "2026-07-09T00:00", serviceDate: "2026-07-09", category: "WELFARE_AI", tripId: null, source: "pdf", img: null, status: "duplicate", dupOf: "r_gpt", why: "같은 결제건의 청구서 — invoiceNo 기준 중복 감지, 전표 제외" },
      { id: "r_claude", merchant: "Anthropic (Claude 구독)", amount: 110.0, currency: "USD", fxRate: 1500, amountKRW: 165000, paidAt: "2026-07-05T00:00", serviceDate: "2026-07-05", category: "WELFARE_AI", tripId: null, source: "pdf", img: null, status: "matched", why: "프리셋: AI구독. 2페이지 PDF(빈 페이지 처리) 케이스", approvalNo: null, vat: { basis: "missing", needCheck: true } },
      { id: "r_claude_inv", merchant: "Anthropic 인보이스 (6IBKFSKM-0006)", amount: 110.0, currency: "USD", fxRate: 1500, amountKRW: 165000, paidAt: "2026-07-05T00:00", serviceDate: "2026-07-05", category: "WELFARE_AI", tripId: null, source: "pdf", img: null, status: "duplicate", dupOf: "r_claude", why: "같은 결제건의 청구서 — 중복 감지, 전표 제외" },
      { id: "r_sushi", merchant: "스시로 신주쿠점 (スシロー)", amount: 8800, currency: "JPY", fxRate: 9.0, amountKRW: 79200, paidAt: "2026-07-21T19:32", serviceDate: "2026-07-21", category: "TRAVEL_MEAL", tripId: "trip_tokyo", source: "photo", img: null, status: "matched", why: "해외출장(도쿄 7/20–7/23) 기간 내 → 해외출장비. ¥8,800 × 9.0 = ₩79,200", approvalNo: "71038845", vat: { supply: 8000, vat: 800, basis: "stated" } }
    ];
    return R;
  }
  function demoCardTx() {
    return [
      { id: "tx_01", merchant: "한국철도공사", amountKRW: 59800, approvedAt: "2026-04-09T09:12", receiptId: "r_ktx1", score: 95, approvalNo: "00351509" },
      { id: "tx_02", merchant: "한국철도공사", amountKRW: 53500, approvedAt: "2026-04-13T18:40", receiptId: "r_ktx2", score: 92, approvalNo: "00417732" },
      { id: "tx_03", merchant: "파리크라상 서울역", amountKRW: 10300, approvedAt: "2026-04-15T07:47", receiptId: "r_paris", score: 98, approvalNo: "84231907" },
      { id: "tx_04", merchant: "백세촌순대돼지국밥", amountKRW: 12000, approvedAt: "2026-04-15T12:47", receiptId: "r_gukbap", score: 97, approvalNo: "30125478" },
      { id: "tx_05", merchant: "OPENAI *CHATGPT", amountKRW: 33000, approvedAt: "2026-07-09T13:05", receiptId: "r_gpt", score: 90, fx: "$22.00", cardLast4: "9112" },
      { id: "tx_06", merchant: "ANTHROPIC PBC", amountKRW: 165000, approvedAt: "2026-07-05T10:22", receiptId: "r_claude", score: 91, fx: "$110.00" },
      { id: "tx_07", merchant: "SUSHIRO SHINJUKU", amountKRW: 79200, approvedAt: "2026-07-21T19:32", receiptId: "r_sushi", score: 88, fx: "¥8,800", approvalNo: "71038845" },
      { id: "tx_08", merchant: "광화문우체국", amountKRW: 4110, approvedAt: "2026-07-02T15:34", receiptId: "r_post", score: 82 },
      { id: "tx_09", merchant: "헤르만의정원", amountKRW: 17400, approvedAt: "2026-03-06T12:58", receiptId: "r_herman", score: 96, approvalNo: "19402211" },
      { id: "tx_10", merchant: "스토리웨이 부산역", amountKRW: 14400, approvedAt: "2025-06-18T16:02", receiptId: "r_story", score: 55 },
      { id: "tx_11", merchant: "플루토커피", amountKRW: 14000, approvedAt: "2025-07-02T12:49", receiptId: "r_pluto", score: 58 },
      { id: "tx_12", merchant: "GS25 광화문점", amountKRW: 8700, approvedAt: "2026-07-18T21:03", receiptId: null, score: 0 },
      { id: "tx_13", merchant: "교보문고 광화문", amountKRW: 28000, approvedAt: "2026-07-15T12:11", receiptId: null, score: 0 },
      { id: "tx_14", merchant: "스타벅스 광화문점", amountKRW: 26000, approvedAt: "2026-07-16T14:10", receiptId: "r_sbux", score: 94, approvalNo: "55023918" }
    ];
  }
  function demoTrips() {
    return [
      { id: "trip_busan", type: "domestic", title: "부산·울산 당일 출장", route: ["서울", "부산", "울산", "서울"], country: "KR", startDate: "2026-04-15", endDate: "2026-04-15", members: 1, mealCapPerDayKRW: 35000, capNote: "국내 일일 식대 35,000원 (VAT별도) × 일수", status: "done" },
      { id: "trip_daejeon", type: "domestic", title: "대전 연구원 방문", route: ["서울", "대전", "서울"], country: "KR", startDate: "2026-07-28", endDate: "2026-07-29", members: 1, mealCapPerDayKRW: 35000, capNote: "국내 일일 식대 35,000원 (VAT별도) × 일수", status: "planned" },
      { id: "trip_tokyo", type: "foreign", title: "도쿄 파트너사 미팅", route: ["서울", "도쿄", "서울"], country: "JP", startDate: "2026-07-20", endDate: "2026-07-23", members: 2, dailyCapPerPersonKRW: 100000, dailyCapKRW: 200000, capNote: "해외 일일 Cap 100,000원/인 × 2명 (환율 반영)", status: "active" }
    ];
  }
  function demoBudgets() {
    return [
      { category: "WELFARE_AI", label: "AI구독 · DIY100 예산", limitKRW: 1000000, usedKRW: 318000, vatNote: "VAT별도" },
      { category: "WELFARE_BOOK", label: "복지비 · 도서", limitKRW: 200000, usedKRW: 33000 },
      { category: "WELFARE_ETC", label: "복지비 · 기타", limitKRW: 100000, usedKRW: 0 }
    ];
  }

  function fill(arr, items) { arr.length = 0; items.forEach(x => arr.push(x)); }
  function fillObj(obj, entries) { for (const k in obj) delete obj[k]; Object.assign(obj, entries); }
  function presetName(id) { const p = PRESETS_BY_ID[id]; return p ? p.name : (id || ""); }

  /* ================= load(): 라이브 로드(폴백) ================= */
  let MODE = "loading";
  let _err = null;
  let _promise = null;

  async function load() {
    if (_promise) return _promise;
    _promise = (async () => {
      try {
        const [rc, tx, ps, bg] = await Promise.all([
          API.request("/api/receipts"),
          API.request("/api/transactions"),
          API.request("/api/presets"),
          API.request("/api/budgets?userId=u_me").catch(() => []),
        ]);
        const presetsById = {}; (ps || []).forEach(p => presetsById[p.id] = p);
        const trips = (ps || []).filter(p => p.type === "TRIP").map(mapTrip);
        const receipts = (rc || []).map(r => mapReceipt(r, presetsById, trips));
        const cards = (tx || []).map(mapTx);
        fill(PRESETS, ps || []);
        fillObj(PRESETS_BY_ID, presetsById);
        // 2차 패스: receipt.matchedTxId ↔ card 연결 + 승인번호 이식
        receipts.forEach(r => {
          if (r.matchedTxId) {
            const c = cards.find(x => x.id === r.matchedTxId);
            if (c) { c.receiptId = r.id; c.score = 90; if (!r.approvalNo) r.approvalNo = c.approvalNo; }
          }
        });
        fill(TRIPS, trips);
        fill(RECEIPTS, receipts);
        fill(CARD_TX, cards);
        fill(BUDGETS, (bg && bg.length ? bg.map(mapBudget) : demoBudgets()));
        MODE = "live";
      } catch (e) {
        _err = e;
        fill(TRIPS, demoTrips());
        fill(RECEIPTS, demoReceipts());
        fill(CARD_TX, demoCardTx());
        fill(BUDGETS, demoBudgets());
        fill(PRESETS, []);        // 오프라인 데모: 서버 프리셋 없음(사용자 정산단위 기능 비활성)
        fillObj(PRESETS_BY_ID, {});
        MODE = "demo";
      }
      return { mode: MODE, error: _err };
    })();
    return _promise;
  }

  /* 뮤테이션(담기/빼기/생성/삭제) 후 최신 상태 재조회 — 메모이즈된 promise 무효화 */
  function reload() { _promise = null; return load(); }

  /* 상단바에 라이브/데모 배지 표시 (SKP.chrome 이후 호출) */
  function mountBadge() {
    const host = document.querySelector(".topbar .tb-user");
    const live = MODE === "live";
    if (host) {
      const b = document.createElement("span");
      b.className = "badge " + (live ? "ok" : "warn");
      b.style.cssText = "margin-left:8px;font-size:10.5px;vertical-align:middle";
      b.title = live
        ? "공유 서버(라이브) 데이터 · " + (API.activeBase || "현재 주소")
        : "서버 연결 실패 — 데모 시드로 표시 중";
      b.textContent = live ? "● 라이브 공유" : "● 데모(오프라인)";
      host.appendChild(b);
    }

    if (!live) {
      const page = document.querySelector(".page");
      if (!page || page.querySelector(".data-mode-alert")) return;
      const alert = document.createElement("div");
      alert.className = "data-mode-alert";
      const localHelp = location.hostname === "localhost" || location.hostname === "127.0.0.1"
        ? " 서버를 실행한 뒤 http://localhost:4000/pc/에서 열어 주세요."
        : " 공유 서버 주소 설정을 확인해 주세요.";
      alert.innerHTML = "<strong>데모 데이터 표시 중</strong> — 공유 서버에 연결되지 않아 이 금액은 모바일과 동기화되지 않습니다." + localHelp;
      page.insertBefore(alert, page.firstChild);
      console.warn("[PC] 공유 서버 연결 실패. 데모 데이터로 전환했습니다.", _err);
    }
  }

  /* 데모 스토리텔링용(업로드 화면 칩): 라이브에 없으면 데모 시드에서 조회 */
  const _demoIndex = {};
  demoReceipts().forEach(r => _demoIndex[r.id] = r);
  function sampleReceipt(id) {
    return RECEIPTS.find(r => r.id === id) || _demoIndex[id] || null;
  }

  return {
    TODAY, USER, GROUPS, GROUP_ORDER, CATEGORIES, RULES, AI_PRESETS, AI_POLICY,
    TRIPS, RECEIPTS, CARD_TX, BUDGETS, PRESETS, PRESETS_BY_ID,
    fmt, krw, money, dateShort, dt, tripDays, tripCap, tripSpent, tripAll,
    groupOf, subOf, groupTotals, activeTrip, valid, imgUrl, attachTip,
    matchBasis, candidatesFor, vatInfo, presetName,
    load, reload, mountBadge, sampleReceipt, get MODE() { return MODE; }
  };
})();
