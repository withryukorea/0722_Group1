/* ============================================================
   PC 웹 API 클라이언트 (thin) — data-live.js 가 사용
   모바일 app/api.js 의 request/runWithFallback 와 같은 계약.
   ============================================================ */
window.PC_API = (function () {
  const CFG = window.PC_CONFIG;

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CFG.requestTimeoutMs);
    const headers = new Headers(options.headers || {});
    const isForm = options.body instanceof FormData;
    if (options.body && !isForm && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    try {
      const res = await fetch(`${CFG.apiBase}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
        body: options.body && !isForm && typeof options.body !== 'string'
          ? JSON.stringify(options.body)
          : options.body,
      });
      if (!res.ok) throw new Error(`API ${res.status} ${path}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // 전표 상신 — PC에서 정리한 정산 데이터를 공유 서버(→ E-Accounting)로 씀
  async function submitVoucher(voucher) {
    return request('/api/vouchers', { method: 'POST', body: voucher });
  }

  return { request, submitVoucher };
})();
