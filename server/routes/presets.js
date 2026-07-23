// [P1 확장] Preset(정산단위) — 출장·특수정산 규정의 배포 단위 (sot/02·05)
// 관리자 콘솔의 Preset 작성(RECURRING/CAMPAIGN)과 이어카운팅 "국내출장 직접 생성"(TRIP)이 같은 API를 쓴다.
// 저장이 곧 배포 — 별도 안내 단계 없음. 해외출장 TRIP은 품의 자동생성을 seed 로 시뮬레이트.
const express = require("express");
const { db, nextPresetId, recomputeUsage } = require("../store");
const router = express.Router();

/* 환율 조회 — fx.json이 {rates:{...}} 구조든 평면 맵이든 동작 */
function fxRateOf(cur) {
  const t = db.fx && db.fx.rates ? db.fx.rates : db.fx || {};
  return t[cur] || 1;
}

/* ── 상신자 프로필 (단일 사용자 u_me 하드코딩 — sot/05 Auth Model) ──
 * 직급은 전원 "매니저" (sot/02). $SUPERIOR 는 직급이 아니라 조직도·직책 기준:
 * 내 팀의 팀장 → 소속 실의 실장 → 본부장 순 (eaccounting/js/org-data.js 조직트리와 동일 인물) */
const PROFILE = {
  userId: "u_me",
  name: "홍길동",
  rank: "매니저",
  team: "전력사업기획팀",
  costCenter: "AQ131",
  superiors: ["김아무개 팀장", "박아무개 실장"], // 차상위 → 차차상위
};

/* 전결라인 양식($DRAFTER/$SUPERIOR/$SUPERIOR2) → 실제 이름으로 해석
 * 반환: { draft, reviewers[], approve, flat[] } — flat 은 구 approvalLine(승인자 나열) 호환용 */
function resolveApprovalLine(tpl, profile = PROFILE) {
  const t = tpl || { draft: "$DRAFTER", reviewers: [], approve: "$SUPERIOR" };
  const resolveOne = (v) => {
    if (v === "$DRAFTER") return `${profile.name} ${profile.rank}`;
    if (v === "$SUPERIOR") return profile.superiors[0];
    if (v === "$SUPERIOR2") return profile.superiors[1] || profile.superiors[0];
    return v; // 지정 검토자(고정 이름)는 그대로
  };
  const draft = resolveOne(t.draft || "$DRAFTER");
  const reviewers = (t.reviewers || []).map(resolveOne);
  const approve = resolveOne(t.approve || "$SUPERIOR");
  return { draft, reviewers, approve, flat: [...reviewers, approve] };
}

// GET /api/presets?active=true — 활성 Preset 목록 (리뷰 화면 선택지 + 관리자 콘솔 공용)
router.get("/", (req, res) => {
  let list = db.presets;
  if (req.query.active === "true") list = list.filter((p) => p.active !== false);
  if (req.query.type) list = list.filter((p) => p.type === req.query.type);
  res.json(list);
});

router.get("/:id", (req, res) => {
  const p = db.presets.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "preset not found" });
  res.json(p);
});

/* ── TRIP 기본 한도 = 출장비 지급기준(fixtures/travel-policy.json) ──
 * 직원은 목적지·기간(·직급·인원)만 입력하면 일당·숙박 기준으로 1인 일일 한도가 자동 계산된다.
 * 명시적으로 perPersonKRW/limitKRW 를 준 경우엔 그 값이 우선 (policy 는 기본값 채움 + 근거 표시용) */
function policyDailyCap(country, rank, nights) {
  const pol = db.travelPolicy;
  if (!pol) return null;
  const r = rank || "TEAM_MEMBER";
  if (!country || country === "KR") {
    const perDiem = (pol.domestic.perDiem.rates[r] ?? pol.domestic.perDiem.rates.TEAM_MEMBER) || 0;
    const lodging = nights > 0 ? (pol.domestic.lodging.rates[r] ?? pol.domestic.lodging.rates.TEAM_MEMBER) || 0 : 0;
    return {
      region: "KR", rank: r, currency: "KRW", fxRate: 1,
      perDiem, lodging, dailyCapPerPersonKRW: perDiem + lodging,
    };
  }
  const region = pol.foreign.regions[country] ? country : "OTHER";
  const cur = pol.foreign.regions[region].currency;
  const rate = fxRateOf(cur);
  const perDiem = (pol.foreign.perDiem.rates[r] || {})[region] ?? (pol.foreign.perDiem.rates.TEAM_MEMBER || {})[region] ?? 0;
  const lodging = nights > 0 ? ((pol.foreign.lodging.rates[r] || {})[region] ?? (pol.foreign.lodging.rates.TEAM_MEMBER || {})[region] ?? 0) : 0;
  return {
    region, rank: r, currency: cur, fxRate: rate,
    perDiem, lodging, dailyCapPerPersonKRW: Math.round((perDiem + lodging) * rate),
  };
}

/* Preset 생성 공용 로직 (POST /api/presets 와 구 /api/trips 별칭이 함께 사용) */
function createPreset(b) {
  const rules = b.rules || {};
  const isTrip = b.type === "TRIP";
  const period = b.period || (b.startDate ? { start: b.startDate, end: b.endDate || b.startDate } : null);

  // TRIP 한도: ① 명시값 → ② 인당한도 × 인원 → ③ 출장비 지급기준(travel-policy) 자동
  let policyBasis = null;
  if (isTrip && period) {
    const nights = Math.max(0, (new Date(period.end) - new Date(period.start)) / 86400e3);
    policyBasis = policyDailyCap(b.country, b.rank, nights);
  }
  if (isTrip && !rules.limitKRW) {
    const perPerson = b.perPersonKRW || (policyBasis && policyBasis.dailyCapPerPersonKRW) || 100000;
    rules.limitKRW = perPerson * (b.members || 1);
    rules.limitPeriod = rules.limitPeriod || "daily";
  }

  const tpl = rules.approvalLineTemplate || { draft: "$DRAFTER", reviewers: [], approve: "$SUPERIOR" };
  const preset = {
    id: b.id || nextPresetId(),
    name: b.name || "이름 없는 Preset",
    type: b.type || "RECURRING",            // TRIP | RECURRING | CAMPAIGN
    source: b.source || (isTrip ? "employee" : "admin"), // trip_request(품의, seed) | employee | admin
    assignees: b.assignees || ["u_me"],
    target: b.target || { scope: "company", teams: [], users: [] },
    limitBasis: b.limitBasis || (isTrip ? "shared" : "perPerson"),
    period,
    active: true,
    meta: {
      ...(b.meta || {}),
      ...(b.destination ? { destination: b.destination, country: b.country || "KR", members: b.members || 1 } : {}),
      ...(b.rank ? { rank: b.rank } : {}),
      ...(policyBasis ? { policyBasis } : {}),
    },
    rules: {
      allowedAccountCodes: rules.allowedAccountCodes || (isTrip ? ["TRAVEL_MEAL", "TRAVEL_TRANSPORT", "TRAVEL_LODGING"] : ["WELFARE_ETC"]),
      realAccountCode: rules.realAccountCode || (isTrip ? ((b.country || "KR") === "KR" ? "706101" : "706102") : undefined),
      costCenter: rules.costCenter || PROFILE.costCenter,
      limitKRW: rules.limitKRW || 0,
      limitPeriod: rules.limitPeriod || "total",
      approvalLineTemplate: tpl,
      approvalLine: rules.approvalLine || resolveApprovalLine(tpl).flat, // 구 소비자 호환 (해석 결과 고정 저장)
      descriptionTemplate: rules.descriptionTemplate || "{merchant}",
      matchKeywords: rules.matchKeywords || [],
      requireItemized: !!rules.requireItemized,
    },
    usage: { usedKRW: 0, byDay: {}, byAccountCode: {} },
  };
  if (Object.keys(preset.meta).length === 0) delete preset.meta;
  db.presets.push(preset);
  return preset;
}

// POST /api/presets — 관리자 배포(RECURRING/CAMPAIGN) 또는 직원 국내출장 생성(TRIP, 표준 기본값 자동)
router.post("/", (req, res) => {
  const b = req.body || {};
  if (b.id && db.presets.some((p) => p.id === b.id)) {
    return res.status(409).json({ error: "PRESET_ID_EXISTS", id: b.id, hint: "이미 존재하는 Preset id 입니다. id 를 비우면 자동 부여됩니다." });
  }
  res.status(201).json(createPreset(b));
});

// PATCH /api/presets/:id — 수정/비활성화 (active:false)
router.patch("/:id", (req, res) => {
  const p = db.presets.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "preset not found" });
  const b = req.body || {};
  for (const key of ["name", "type", "period", "active", "assignees", "meta", "target", "limitBasis", "source"]) {
    if (b[key] !== undefined) p[key] = b[key];
  }
  if (b.rules) {
    Object.assign(p.rules, b.rules);
    // 양식이 바뀌면 호환용 approvalLine 도 다시 해석
    if (b.rules.approvalLineTemplate && !b.rules.approvalLine) {
      p.rules.approvalLine = resolveApprovalLine(b.rules.approvalLineTemplate).flat;
    }
  }
  res.json(p);
});

// DELETE /api/presets/:id — 정산단위 하드 삭제 (딸린 영수증 소속 해제 + usage 재집계)
// 가드: 이 프리셋 소속 영수증 중 이미 전표 상신(vouchered)된 게 있으면 삭제 불가 → 비활성화(PATCH active:false) 유도
router.delete("/:id", (req, res) => {
  const idx = db.presets.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "preset not found" });

  const vouchered = db.receipts.some((r) => {
    if (r.presetId !== req.params.id || !r.matchedTxId) return false;
    const tx = db.transactions.find((t) => t.id === r.matchedTxId);
    return tx && tx.status === "vouchered";
  });
  if (vouchered) {
    return res.status(409).json({ error: "PRESET_IN_USE", hint: "이미 전표가 상신된 영수증이 포함된 정산단위입니다. 삭제 대신 비활성화(active:false)만 가능합니다." });
  }

  let unassigned = 0;
  for (const r of db.receipts) {
    if (r.presetId === req.params.id) { r.presetId = null; unassigned += 1; } // accountCode 는 유지
  }
  db.presets.splice(idx, 1);
  recomputeUsage(db);
  res.json({ ok: true, id: req.params.id, unassigned });
});

/* ── 영수증 → Preset 자동추천 (sot/02: 단순 문자열 포함 수준, 최종 선택은 항상 사용자) ──
 * 우선순위를 "특정 규정 > 기간이 맞는 출장 > 나머지 키워드" 로 둔다.
 * (기간만으로 TRIP 을 무조건 1순위로 잡으면, 출장 기간 중 결제한 AI구독·도서 같은
 *  전혀 다른 성격의 지출까지 전부 출장비로 추천돼 오탐이 커진다 — #7) */
function suggestPreset(ocr, serviceDate) {
  const hay = `${ocr.merchant || ""} ${ocr.currency || ""}`.toUpperCase();
  const day = serviceDate || (ocr.paidAt || "").slice(0, 10);
  const active = db.presets.filter((p) => p.active !== false);
  const kwMatch = (p) => (p.rules.matchKeywords || []).some((k) => k && hay.includes(k.toUpperCase()));

  // 1순위: 특정 규정(RECURRING/CAMPAIGN)의 키워드 일치 — 구독·캠페인은 출장 기간과 무관하게 성격이 분명하다
  const specific = active.find((p) => p.type !== "TRIP" && kwMatch(p));
  if (specific) return specific.id;

  // 2순위: 기간이 맞는 TRIP — 단, "여행성 신호"가 있을 때만 (키워드 일치 or 해당 국가 통화의 해외결제)
  const isTravelSignal = (p) => {
    const kws = p.rules.matchKeywords || [];
    if (kws.length === 0) return true;                 // 키워드 미설정 TRIP 은 기간만으로 추천
    if (kwMatch(p)) return true;                       // 목적지·교통수단 등 키워드 일치
    const country = p.meta && p.meta.country;
    if (country && country !== "KR" && ocr.currency && ocr.currency !== "KRW") return true; // 해외출장 + 외화결제
    return false;
  };
  const trip = active.find(
    (p) => p.type === "TRIP" && p.period && day && p.period.start <= day && day <= p.period.end && isTravelSignal(p)
  );
  if (trip) return trip.id;

  // 3순위: 남은 키워드 일치 (TRIP 포함)
  const any = active.find(kwMatch);
  return any ? any.id : null;
}

/* ── 구 /api/trips 호환 별칭 — sot/05에서 trips 삭제, 기존 화면(해외출장비 등) 안 깨지게 유지 ── */
const tripsAlias = express.Router();
const toTripShape = (p) => ({
  id: p.id,
  name: p.name,
  destination: (p.meta && p.meta.destination) || p.name,
  purpose: (p.meta && p.meta.purpose) || null,
  country: (p.meta && p.meta.country) || "KR",
  startDate: p.period ? p.period.start : null,
  endDate: p.period ? p.period.end : null,
  members: (p.meta && p.meta.members) || 1,
  rank: (p.meta && p.meta.rank) || null,
  dailyCapKRW: p.rules.limitKRW,
  spentByDay: p.usage.byDay,
  policyBasis: (p.meta && p.meta.policyBasis) || null,
});
tripsAlias.get("/", (req, res) => {
  res.json(db.presets.filter((p) => p.type === "TRIP" && p.active !== false).map(toTripShape));
});
tripsAlias.get("/:id", (req, res) => {
  const p = db.presets.find((x) => x.id === req.params.id && x.type === "TRIP");
  if (!p) return res.status(404).json({ error: "trip not found" });
  res.json(toTripShape(p));
});
tripsAlias.post("/", (req, res) => {
  const b = req.body || {};
  const preset = createPreset({
    type: "TRIP",
    name: `${b.destination || "출장"} 출장`,
    destination: b.destination,
    country: b.country,
    members: b.members || 1,
    rank: b.rank,
    perPersonKRW: b.dailyCapPerPersonKRW, // 미지정 시 travel-policy 기준 자동
    startDate: b.startDate,
    endDate: b.endDate,
    rules: b.rules || {},
  });
  res.status(201).json(toTripShape(preset));
});

module.exports = router;
module.exports.tripsAlias = tripsAlias;
module.exports.suggestPreset = suggestPreset;
module.exports.resolveApprovalLine = resolveApprovalLine;
module.exports.PROFILE = PROFILE;
