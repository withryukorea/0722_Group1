import { APP_CONFIG } from './config.js';

export class ApiError extends Error {
  constructor(message, status = 0, code = '', details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), APP_CONFIG.requestTimeoutMs);
  const headers = new Headers(options.headers || {});
  const isForm = options.body instanceof FormData;
  if (options.body && !isForm && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(`${APP_CONFIG.apiBase}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
      body: options.body && !isForm && typeof options.body !== 'string'
        ? JSON.stringify(options.body)
        : options.body,
    });
    if (!response.ok) {
      const details = await response.json().catch(() => null);
      throw new ApiError(
        details?.message || `API ${response.status}`,
        response.status,
        details?.error || '',
        details,
      );
    }
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new ApiError('서버 응답 시간이 초과되었습니다.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function runWithFallback(task, fallback) {
  try {
    return { data: await task(), mode: 'live' };
  } catch (error) {
    // 읽기 실패도 샘플 데이터로 바꾸지 않는다. 화면에는 빈 상태와 연결 오류만 전달한다.
    return { data: fallback(), mode: 'offline', error };
  }
}
async function runWrite(task) {
  return { data: await task(), mode: 'live', persisted: true };
}

export async function checkHealth() {
  return runWithFallback(
    () => request('/api/transactions'),
    () => [],
  );
}

export async function listPresets() {
  return runWithFallback(
    () => request('/api/presets?active=true'),
    () => [],
  );
}

export async function listReceipts() {
  return runWithFallback(
    () => request('/api/receipts'),
    () => [],
  );
}

// 정산단위(프리셋) 신규 생성 — 이름만 받고 서버가 나머지 기본값을 채운다.
export async function createPreset({ name }) {
  return runWrite(() => request('/api/presets', {
    method: 'POST',
    body: { name, type: 'RECURRING', rules: { allowedAccountCodes: ['WELFARE_ETC'] } },
  }));
}

// 영수증 여러 건을 한 정산단위에 담거나(presetId) 세트에서 빼기(presetId=null).
export async function assignReceipts(ids, presetId) {
  return runWrite(() => request('/api/receipts/bulk', {
    method: 'PATCH',
    body: { ids, presetId },
  }));
}

// 정산단위 삭제 — 딸린 영수증은 서버에서 소속만 해제된다(상신된 건은 409).
export async function deletePreset(id) {
  return runWrite(() => request(`/api/presets/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

export async function uploadReceipt(file) {
  const form = new FormData();
  form.append('image', file, file.name);
  form.append('source', 'mobile');
  return runWrite(async () => {
    const receipt = await request('/api/receipts', { method: 'POST', body: form });
    if (receipt.ocrMode !== 'real') {
      throw new ApiError('실제 OCR 결과가 아니어서 저장하지 않았습니다.', 502, 'NON_REAL_OCR');
    }
    return receipt;
  });
}

export async function confirmReceipt(receipt, selection) {
  const payload = {
    presetId: selection.presetId || null,
    accountCode: selection.accountCode || null,
    vat: { confirmed: Number(selection.vatConfirmed || 0) },
    ocr: receipt.ocr,
    source: 'mobile',
  };
  const saved = await request(`/api/receipts/${encodeURIComponent(receipt.id)}`, { method: 'PATCH', body: payload });
  const samePaidAt = new Date(saved.ocr?.paidAt).getTime() === new Date(payload.ocr?.paidAt).getTime();
  const persisted = saved.presetId === payload.presetId
    && saved.accountCode === payload.accountCode
    && Number(saved.vat?.confirmed || 0) === Number(payload.vat.confirmed || 0)
    && saved.ocr?.merchant === payload.ocr?.merchant
    && Number(saved.ocr?.amount) === Number(payload.ocr?.amount)
    && saved.ocr?.currency === payload.ocr?.currency
    && samePaidAt;
  if (!persisted) {
    throw new ApiError('서버가 수정한 OCR·정산 정보를 완전히 저장하지 않았습니다.', 409);
  }
  return { data: saved, mode: 'live', persisted: true };
}
