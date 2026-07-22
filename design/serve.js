/* 간단 정적 서버 — 사용법: node design/serve.js <port> <redirect>
   저장소 루트를 서빙 (design/ 화면 + data_sample/ 이미지 접근용)
   예) node design/serve.js 5173 /design/screens/mobile/   ← 모바일
       node design/serve.js 5174 /design/screens/pc/       ← PC        */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.argv[2] || 5173);
const REDIRECT = process.argv[3] || "/design/screens/mobile/";
const ROOT = path.resolve(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".svg": "image/svg+xml", ".pdf": "application/pdf", ".ico": "image/x-icon"
};

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch { res.writeHead(400); return res.end("bad request"); }

  if (p === "/") { res.writeHead(302, { Location: REDIRECT }); return res.end(); }
  if (p.endsWith("/")) p += "index.html";

  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }

  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("404: " + p); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`[serve] http://localhost:${PORT}  → ${REDIRECT}`));
