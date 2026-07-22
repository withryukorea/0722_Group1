// [P1 확장] Preset — 출장·특수정산 규정의 배포 단위 (sot/02·05)
// 관리자 콘솔의 Preset 작성(RECURRING/CAMPAIGN)과 모바일 "출장모드 시작"(TRIP)이 같은 API를 쓴다.
// 저장이 곧 배포 — 별도 안내 단계 없음.
const express = require("express");
const { db, nextPresetId } = require("../store");
const router = express.Router();

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

/* Preset 생성 공용 로직 (POST /api/presets 와 구 /api/trips 별칭이 함께 사용) */
function createPreset(b) {
  const rules = b.rules || {};
  // TRIP 편의: 인당한도 × 인원 → 일일 한도 자동 계산
  if (b.type === "TRIP" && !rules.limitKRW && b.perPersonKRW) {
    rules.limitKRW = b.perPersonKRW * (b.members || 1);
    rules.limitPeriod = rules.limitPeriod || "daily";
  }
  const preset = {
    id: b.id || nextPresetId(),
    name: b.name || "이름 없는 Preset",
    type: b.type || "RECURRING",            // TRIP | RECURRING | CAMPAIGN
    source: b.source || (b.type === "TRIP" ? "trip_request" : "admin"),
    assignees: b.assignees || ["u_me"],
    period: b.period || (b.startDate ? { start: b.startDate, end: b.endDate || b.startDate } : null),
    active: true,
    meta: b.meta || (b.destination ? { destination: b.destination, country: b.country || "KR", members: b.members || 1 } : undefined),
    rules: {
      allowedAccountCodes: rules.allowedAccountCodes || ["WELFARE_ETC"],
      limitKRW: rules.limitKRW || 0,
      limitPeriod: rules.limitPeriod || "total",
      approvalLine: rules.approvalLine || ["김아무개 팀장"],
      descriptionTemplate: rules.descriptionTemplate || "{merchant}",
      matchKeywords: rules.matchKeywords || [],
      requireItemized: !!rules.requireItemized,
    },
    usage: { usedKRW: 0, byDay: {} },
  };
  db.presets.push(preset);
  return preset;
}

// POST /api/presets — 관리자 작성(RECURRING/CAMPAIGN) 또는 출장모드 시작(TRIP)
router.post("/", (req, res) => {
  res.status(201).json(createPreset(req.body || {}));
});

// PATCH /api/presets/:id — 수정/비활성화 (active:false)
router.patch("/:id", (req, res) => {
  const p = db.presets.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: "preset not found" });
  const b = req.body || {};
  for (const key of ["name", "type", "period", "active", "assignees", "meta"]) {
    if (b[key] !== undefined) p[key] = b[key];
  }
  if (b.rules) Object.assign(p.rules, b.rules);
  res.json(p);
});

/* ── 영수증 → Preset 자동추천 (sot/02: 단순 문자열 포함 수준, 최종 선택은 항상 사용자) ── */
function suggestPreset(ocr, serviceDate) {
  const hay = `${ocr.merchant || ""} ${ocr.currency || ""}`.toUpperCase();
  const day = serviceDate || (ocr.paidAt || "").slice(0, 10);
  const active = db.presets.filter((p) => p.active !== false);
  // 1순위: 기간이 맞는 TRIP
  const trip = active.find((p) => p.type === "TRIP" && p.period && day && p.period.start <= day && day <= p.period.end);
  if (trip) return trip.id;
  // 2순위: matchKeywords 부분일치
  const kw = active.find((p) => (p.rules.matchKeywords || []).some((k) => k && hay.includes(k.toUpperCase())));
  return kw ? kw.id : null;
}

/* ── 구 /api/trips 호환 별칭 — sot/05에서 trips 삭제, 기존 화면(해외출장비 등) 안 깨지게 유지 ── */
const tripsAlias = express.Router();
const toTripShape = (p) => ({
  id: p.id,
  destination: (p.meta && p.meta.destination) || p.name,
  country: (p.meta && p.meta.country) || "KR",
  startDate: p.period ? p.period.start : null,
  endDate: p.period ? p.period.end : null,
  members: (p.meta && p.meta.members) || 1,
  dailyCapKRW: p.rules.limitKRW,
  spentByDay: p.usage.byDay,
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
    perPersonKRW: b.dailyCapPerPersonKRW || 100000,
    startDate: b.startDate,
    endDate: b.endDate,
    rules: { allowedAccountCodes: ["TRAVEL_MEAL", "TRAVEL_TRANSPORT", "TRAVEL_LODGING"] },
  });
  res.status(201).json(toTripShape(preset));
});

module.exports = router;
module.exports.tripsAlias = tripsAlias;
module.exports.suggestPreset = suggestPreset;
