/* ============================================================
   PC 웹 설정 — 모바일 app/config.js 와 동일 철학
   - 이 화면은 "모바일웹과 동일한 데이터"를 같은 서버에서 읽는다.
   - 같은 Express 서버(:4000 / Render)가 pc/ 를 /pc 로 서빙하면
     API 는 same-origin 상대경로로 호출한다.
   - Live Server처럼 PC 화면만 별도 로컬 포트에서 열면, same-origin 404 뒤
     실제 공유 서버(:4000)로 한 번 더 연결한다.
   - 배포 주소가 분리된 경우 PC_RUNTIME_CONFIG.apiBase 로 주입할 수 있다.
   ============================================================ */
window.PC_CONFIG = (function () {
  const runtime = window.PC_RUNTIME_CONFIG || {};
  const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const defaultBase = isHttp ? '' : 'http://localhost:4000';
  const localFallbackBase = isHttp && isLocal && location.port !== '4000'
    ? 'http://localhost:4000'
    : '';

  return {
    // same-origin('') 이면 /api/... 상대호출 → pc를 서빙하는 서버로 감
    apiBase: runtime.apiBase !== undefined ? runtime.apiBase : defaultBase,
    localFallbackBase: runtime.localFallbackBase !== undefined
      ? runtime.localFallbackBase
      : localFallbackBase,
    // Render 콜드스타트 + Vision OCR 시간을 함께 기다린다. 서버 OCR 자체 제한은 30초.
    requestTimeoutMs: runtime.requestTimeoutMs || 70000,
    // 레거시 화면 자산 경로. API 연결 실패 시 데이터 폴백에는 사용하지 않는다.
    demoImageBase: '../data_sample/images/',
  };
})();
