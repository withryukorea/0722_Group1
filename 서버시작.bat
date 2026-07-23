@echo off
chcp 65001 >nul
REM ── E-Accounting 서버 원클릭 (재)시작 ─────────────────────────
REM 1) 포트 4000을 점유한 기존 프로세스가 있으면 종료
REM 2) 서버를 터미널과 분리된 백그라운드로 시작 (창 닫아도 안 죽음)
REM 3) Edge로 http://localhost:4000/ 열기
REM 로그: %TEMP%\eacc-server.log / eacc-server-error.log

echo [1/3] 포트 4000 기존 프로세스 정리...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

echo [2/3] 서버 백그라운드 시작...
powershell -NoProfile -Command "Start-Process -FilePath node -ArgumentList 'index.js' -WorkingDirectory '%~dp0server' -WindowStyle Hidden -RedirectStandardOutput \"$env:TEMP\eacc-server.log\" -RedirectStandardError \"$env:TEMP\eacc-server-error.log\""

timeout /t 2 /nobreak >nul

echo [3/3] Edge 열기...
start msedge http://localhost:4000/

echo.
echo 완료. 페이지가 안 뜨면 이 파일을 한 번 더 실행하세요.
timeout /t 3 >nul
