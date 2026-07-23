// server/.env 최소 로더 (dotenv 의존성 없이)
// - 로컬: server/.env 를 읽어 process.env 에 주입 → 실 OCR 키가 런타임에 잡힘.
// - 배포(Render 등): .env 파일이 없어도 조용히 통과하고, 대시보드에 설정한 실제 환경변수를 그대로 사용.
// - 이미 설정된 환경변수는 절대 덮어쓰지 않는다(배포 대시보드 값 우선).
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, ".env");
try {
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line) || !line.trim()) continue; // 주석·빈 줄 무시
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1); // 감싼 따옴표 제거
    }
    if (process.env[key] === undefined) process.env[key] = val; // 기존값(배포 env) 우선
  }
} catch (e) {
  // .env 없음(배포 등) → 실제 환경변수로만 동작. 조용히 통과.
}
