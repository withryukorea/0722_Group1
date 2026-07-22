/* ============================================================
   PC 웹 설정 — 모바일 app/config.js 와 동일 철학
   - 이 화면은 "모바일웹과 동일한 데이터"를 같은 서버에서 읽는다.
   - 같은 Express 서버(:4000 / Render)가 pc/ 를 /pc 로 서빙하므로
     API 는 same-origin 상대경로로 호출한다(배포·로컬 모두 동작).
   - file:// 로 직접 열었을 때만 로컬 서버(:4000)를 절대경로로 가리킨다.
   ============================================================ */
window.PC_CONFIG = (function () {
  const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
  return {
    // same-origin('') 이면 /api/... 상대호출 → pc를 서빙하는 서버로 감
    apiBase: isHttp ? '' : 'http://localhost:4000',
    requestTimeoutMs: 8000,
    demoFallback: true, // API 실패 시 데모 시드로 폴백 (데모 100% 재현)
    // 영수증 원본 이미지 폴백 경로(데모 시드 전용): pc/ 기준 상대경로
    demoImageBase: '../data_sample/images/',
  };
})();
