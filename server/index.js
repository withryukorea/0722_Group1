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

// [P3/P4/P5] 각 담당이 해당 파일을 채우면 바로 동작 (지금은 501 스텁)
app.use("/api/receipts", require("./routes/receipts")); // P3
app.use("/api", require("./routes/match")); // P4 (/api/match, /api/vouchers/preview)
app.use("/api/trips", require("./routes/trips")); // P5

// 데모 리셋: POST /api/reset → 시드 초기값으로 복구
app.post("/api/reset", (req, res) => {
  reset();
  res.json({ ok: true });
});

// ── 가짜 e-Accounting 화면 (정적 파일) ─────────────────────────
// 프론트는 저장소 루트의 eaccounting/ 폴더(공용 디자인 시스템 공유)를 서빙한다.
//   /                    → index.html (메인 대시보드)
//   /card-settlement.html → 법인카드 정산 (GET /api/transactions 연동)
//   /mydocs-all.html      → 나의 문서함 전체조회
app.use("/", express.static(path.join(__dirname, "..", "eaccounting")));

app.listen(PORT, () => {
  console.log(`\n  가짜 e-Accounting 서버 실행 중`);
  console.log(`  ├ 메인 화면 : http://localhost:${PORT}/`);
  console.log(`  ├ 법인카드  : http://localhost:${PORT}/card-settlement.html`);
  console.log(`  └ API 예시  : http://localhost:${PORT}/api/transactions\n`);
});
