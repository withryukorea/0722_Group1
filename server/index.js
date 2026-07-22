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
app.post("/api/reset", (req, res) => {
  reset();
  res.json({ ok: true });
});

// ── 업로드된 영수증 이미지 (P3) ───────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── 직원용 이어카운팅 화면 (배포 데모 홈) ─────────────────────
// 루트(/)와 /eaccounting 양쪽에서 서빙 → 배포 홈 URL 및 절대경로 링크 모두 동작
app.use("/", express.static(path.join(__dirname, "..", "eaccounting")));
app.use("/eaccounting", express.static(path.join(__dirname, "..", "eaccounting")));

// ── 관리자 웹화면 (정적 파일) → /admin ────────────────────────
app.use("/admin", express.static(path.join(__dirname, "public")));

// ── PC 웹(분석·정산 대시보드) → /pc ───────────────────────────
// 모바일 웹과 "동일한 데이터"를 같은 서버 API(same-origin)로 읽는 독립 페이지.
app.use("/pc", express.static(path.join(__dirname, "..", "pc")));

app.listen(PORT, () => {
  console.log(`\n  가짜 E-Accounting 서버 실행 중`);
  console.log(`  ├ 직원용 화면 : http://localhost:${PORT}/`);
  console.log(`  ├ PC 웹       : http://localhost:${PORT}/pc/`);
  console.log(`  ├ 관리자 화면 : http://localhost:${PORT}/admin/`);
  console.log(`  └ API 예시    : http://localhost:${PORT}/api/transactions\n`);
});
