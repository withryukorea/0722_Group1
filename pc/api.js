/* ============================================================
   PC 웹 API 클라이언트 (thin) — data-live.js 가 사용
   모바일 app/api.js 의 request/runWithFallback 와 같은 계약.
   ============================================================ */
window.PC_API = (function () {
  const CFG = window.PC_CONFIG;
  let activeBase = CFG.apiBase;

  async function requestFrom(base, path, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CFG.requestTimeoutMs);
    const headers = new Headers(options.headers || {});
    const isForm = options.body instanceof FormData;
    if (options.body && !isForm && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    try {
      const res = await fetch(`${base}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
        body: options.body && !isForm && typeof options.body !== 'string'
          ? JSON.stringify(options.body)
          : options.body,
      });
      if (!res.ok) {
        const error = new Error(`API ${res.status} ${path}`);
        error.status = res.status;
        error.apiBase = base;
        throw error;
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function canRetry(error, options) {
    // 정적 Live Server의 /api 응답(404/405)은 쓰기 요청도 실제 서버로 재시도해도 안전하다.
    if (error && (error.status === 404 || error.status === 405)) return true;
    const method = String(options.method || 'GET').toUpperCase();
    // 응답 유실 시 중복 저장을 피하기 위해 네트워크 오류 재시도는 읽기 요청만 허용한다.
    return method === 'GET' || method === 'HEAD';
  }

  async function request(path, options = {}) {
    const bases = [activeBase];
    if (CFG.localFallbackBase && !bases.includes(CFG.localFallbackBase)) {
      bases.push(CFG.localFallbackBase);
    }

    let lastError;
    for (let i = 0; i < bases.length; i += 1) {
      const base = bases[i];
      try {
        const result = await requestFrom(base, path, options);
        activeBase = base;
        return result;
      } catch (error) {
        lastError = error;
        const hasNext = i < bases.length - 1;
        if (!hasNext || !canRetry(error, options)) break;
      }
    }
    throw lastError;
  }

  // 전표 상신 — PC에서 정리한 정산 데이터를 공유 서버(→ E-Accounting)로 씀
  async function submitVoucher(voucher) {
    return request('/api/vouchers', { method: 'POST', body: voucher });
  }

  // 영수증 업로드(유입) — 파일을 image 필드로, 출처를 source=pc 로 실제 전송.
  // 성공 시 서버가 저장한 receipt(JSON)를 반환. 실패(4xx/5xx·네트워크·타임아웃)는 throw.
  async function uploadReceipt(file, source) {
    const form = new FormData();
    form.append('image', file);
    form.append('source', source || 'pc');
    return request('/api/receipts', { method: 'POST', body: form });
  }

  return {
    request,
    submitVoucher,
    uploadReceipt,
    get activeBase() { return activeBase; },
  };
})();
