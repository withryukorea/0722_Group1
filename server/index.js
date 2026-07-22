// 가짜 E-Accounting 서버 (P1)
// 실행: npm install → npm start  (기본 포트 4000)
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

// ── 모바일웹 PWA → /app ───────────────────────────────────────
// 같은 서버에서 서빙되므로 앱의 apiBase가 자동으로 같은 오리진을 가리킨다 (배포 URL 하나로 전 화면 접근)
app.use("/app", express.static(path.join(__dirname, "..", "app")));

// ── 데모 혼선 방지: PC 정적 목업(시안)은 하드코딩 데모 data.js 로만 그려져
//    라이브 API와 무관한 가짜 숫자(예: ₩488,710)를 "실데이터처럼" 보여준다.
//    라이브 /pc/ 로 302 리다이렉트해 "모바일 ≠ PC 사용총액" 착오를 원천 차단한다.
//    (디자인 원본은 로컬 `node design/serve.js` 또는 design/html/*.html 스냅샷으로 계속 열람 가능)
app.use("/design/screens/pc", (req, res) => res.redirect(302, "/pc/"));

// ── PC웹 화면 (design/ — 개발 진행 중 시안 포함) → /design ────
app.use("/design", express.static(path.join(__dirname, "..", "design")));
app.use("/data_sample", express.static(path.join(__dirname, "..", "data_sample"))); // 시안이 참조하는 샘플 이미지

// ── 메인 접속 포털 (꼬리 없는 루트 URL) ───────────────────────
// 루트(/)는 3개 접속링크(이어카운팅·모바일웹·PC웹)만 있는 랜딩 페이지.
// 실제 화면은 각자 꼬리 URL(/eaccounting, /app, /pc)로 분리해 서빙한다.
app.use("/", express.static(path.join(__dirname, "..", "landing")));

// ── 직원용 이어카운팅 화면 → /eaccounting ─────────────────────
// (eaccounting 내부 링크는 모두 상대경로라 이 서브패스에서 그대로 동작)
app.use("/eaccounting", express.static(path.join(__dirname, "..", "eaccounting")));

// ── 관리자 웹화면 (정적 파일) → /admin ────────────────────────
app.use("/admin", express.static(path.join(__dirname, "public")));

// ── PC 웹(분석·정산 대시보드) → /pc ───────────────────────────
// 모바일 웹과 "동일한 데이터"를 같은 서버 API(same-origin)로 읽는 독립 페이지.
app.use("/pc", express.static(path.join(__dirname, "..", "pc")));

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
  console.log(`  ├ 메인 포털   : http://localhost:${PORT}/          ← 접속링크 3개`);
  console.log(`  ├ 이어카운팅  : http://localhost:${PORT}/eaccounting/`);
  console.log(`  ├ 모바일웹    : http://localhost:${PORT}/app/`);
  console.log(`  ├ PC 웹(라이브): http://localhost:${PORT}/pc/  ← 실데이터, 모바일과 동일`);
  console.log(`  ├ 관리자 화면 : http://localhost:${PORT}/admin/`);
  console.log(`  └ API 예시    : http://localhost:${PORT}/api/transactions\n`);
});
