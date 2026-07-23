// 가짜 E-Accounting 서버 (P1)
// 실행: npm install → npm start  (기본 포트 4000)
require("./loadenv"); // server/.env → process.env (실 OCR 키 로딩). 반드시 다른 require보다 먼저.
const express = require("express");
const cors = require("cors");
const path = require("path");
const { reset } = require("./store");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors()); // 모바일 웹앱(다른 포트)에서 호출 가능하게
app.use(express.json({ limit: "10mb" }));

// ── 라우트 등록 ────────────────────────────────────────────────
// [P1] 이미 구현됨
app.use("/api/transactions", require("./routes/transactions"));
app.use("/api/vouchers", require("./routes/vouchers"));
app.use("/api", require("./routes/reference")); // approval-rules, budgets, fx, accounts

app.use("/api/receipts", require("./routes/receipts")); // P3 (실 OCR + WoZ 폴백)
app.use("/api", require("./routes/match")); // P4 (/api/match, /api/vouchers/preview)
app.use("/api/presets", require("./routes/presets")); // Preset 엔진 (sot/05)
app.use("/api/trips", require("./routes/presets").tripsAlias); // 구 trips 호환 별칭 → TRIP Preset
app.use("/api/stats", require("./routes/stats")); // [v2] 간편정산 대시보드 집계 (읽기 전용)

// 데모 리셋: POST /api/reset → 시드 초기값으로 복구
// 배포처럼 아무나 못 지우게 하려면 환경변수 RESET_TOKEN 설정 → 헤더 x-reset-token 또는 body.token 일치 요구.
// (미설정 시 기존처럼 무인증 허용 — 로컬 데모 편의. 공개 배포에는 RESET_TOKEN 설정 권장)
app.post("/api/reset", (req, res) => {
  const need = process.env.RESET_TOKEN;
  if (need) {
    const got = req.get("x-reset-token") || (req.body && req.body.token);
    if (got !== need) return res.status(403).json({ error: "FORBIDDEN", hint: "reset 토큰이 필요합니다 (x-reset-token)" });
  }
  reset();
  res.json({ ok: true });
});

// 매칭되지 않은 /api/* 요청은 HTML(정적 폴백) 대신 JSON 404 로 명확히 응답한다
// (모든 실제 /api 라우트는 위에서 이미 등록됨 — 여기 오면 없는 엔드포인트)
app.use("/api", (req, res) => {
  res.status(404).json({ error: "NOT_FOUND", method: req.method, path: req.originalUrl });
});

// ── 업로드된 영수증 이미지 (P3) ───────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── [v2 통합] 모바일 단일화 — 구 /app(찍으면 끝 PWA)은 이어카운팅 모바일 /eaccounting/m/ 로 흡수 ──
//    두 벌이던 모바일을 하나로 통합. PWA(설치·오프라인) 자산은 /eaccounting/m/ 로 이관됨.
//    옛 링크·설치본이 깨지지 않도록 /app/* → /eaccounting/m/ 로 302 리다이렉트한다.
app.use("/app", (req, res) => res.redirect(302, "/eaccounting/m/"));

// ── [v2 전면개편] 별도 PC웹 폐지 — 이어카운팅 "간편정산" 하위메뉴로 흡수 ──
//    구 /pc/* 화면(업로드·매칭·정산·대시보드)은 이제 eaccounting/quick-*.html 로 통합됐다.
//    옛 링크·북마크가 깨지지 않도록 대응 화면으로 302 리다이렉트한다. "별도 PC웹은 더 이상 존재하지 않는다".
const QUICK_REDIRECT = [
  [/^\/upload/i, "/eaccounting/quick-upload.html"],
  [/^\/expenses|^\/match/i, "/eaccounting/quick-match.html"],
  [/^\/settlement/i, "/eaccounting/quick-settlement.html"],
];
function toQuick(req, res) {
  const sub = req.path || "/";
  const hit = QUICK_REDIRECT.find(([re]) => re.test(sub));
  res.redirect(302, hit ? hit[1] : "/eaccounting/quick-dashboard.html"); // 기본(/pc, /pc/index) → 분석 대시보드
}
app.use("/pc", toQuick);
app.use("/design/screens/pc", toQuick);

// ── PC웹 시안(design/) → /design ──────────────────────────────
app.use("/design", express.static(path.join(__dirname, "..", "design")));
app.use("/data_sample", express.static(path.join(__dirname, "..", "data_sample"))); // 시안이 참조하는 샘플 이미지

// ── 메인 접속 포털 (꼬리 없는 루트 URL) ───────────────────────
// 루트(/)는 접속링크(이어카운팅·모바일)만 있는 랜딩 페이지. PC웹 카드는 폐지(간편정산으로 흡수).
app.use("/", express.static(path.join(__dirname, "..", "landing")));

// ── 직원용 이어카운팅 화면 → /eaccounting ─────────────────────
// (eaccounting 내부 링크는 모두 상대경로라 이 서브패스에서 그대로 동작)
app.use("/eaccounting", express.static(path.join(__dirname, "..", "eaccounting")));

// ── 관리자 웹화면 (정적 파일) → /admin ────────────────────────
app.use("/admin", express.static(path.join(__dirname, "public")));

// (구 /pc 정적 서빙은 위에서 간편정산 리다이렉트로 대체됨 — 별도 PC웹 폐지)

// ── 전역 에러 핸들러 (4-arg) ──────────────────────────────────
// 라우트에서 던진 예외·multer 업로드 오류 등이 여기로 모인다.
// 없으면 Express 기본 HTML 오류페이지가 나가 API 소비자(fetch)가 JSON 파싱에 실패한다.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[error]", req.method, req.originalUrl, "-", (err && err.message) || err);
  if (res.headersSent) return next(err);
  const status = (err && (err.status || err.statusCode)) || 500;
  res.status(status).json({ error: err && err.code ? err.code : "SERVER_ERROR", message: (err && err.message) || "internal error" });
});

app.listen(PORT, () => {
  console.log(`\n  가짜 E-Accounting 서버 실행 중`);
  console.log(`  ├ 메인 포털   : http://localhost:${PORT}/          ← 접속링크 2개`);
  console.log(`  ├ 이어카운팅  : http://localhost:${PORT}/eaccounting/   (간편정산 메뉴 포함 — 구 PC웹 흡수)`);
<<<<<<< HEAD
  console.log(`  ├ 모바일 촬영 : http://localhost:${PORT}/eaccounting/m/`);
  console.log(`  ├ 모바일웹    : http://localhost:${PORT}/app/`);
  console.log(`  ├ 관리자 화면 : http://localhost:${PORT}/admin/`);
  console.log(`  ├ 구 PC웹     : http://localhost:${PORT}/pc/  → 간편정산으로 리다이렉트 (별도 PC웹 폐지)`);
=======
  console.log(`  ├ 모바일      : http://localhost:${PORT}/eaccounting/m/   (설치형 PWA — 구 /app 흡수)`);
  console.log(`  ├ 관리자 화면 : http://localhost:${PORT}/admin/`);
  console.log(`  ├ 구 PC웹     : http://localhost:${PORT}/pc/   → 간편정산으로 리다이렉트 (별도 PC웹 폐지)`);
  console.log(`  ├ 구 모바일   : http://localhost:${PORT}/app/  → /eaccounting/m/ 로 리다이렉트 (모바일 단일화)`);
>>>>>>> 5f33e1cf8204590bc343426f61c7803eaef9d3e9
  console.log(`  └ API 예시    : http://localhost:${PORT}/api/transactions\n`);
});
