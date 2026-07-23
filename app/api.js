import { APP_CONFIG } from './config.js';

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
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
    if (!response.ok) throw new ApiError(`API ${response.status}`, response.status);
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
    if (!APP_CONFIG.demoFallback) throw error;
    return { data: fallback(), mode: 'demo', error };
  }
}
async function runWrite(task) {
  return { data: await task(), mode: 'live', persisted: true };
}

export function demoReceipt() {
  return {
    id: 'rcpt_demo_001',
    imageUrl: '',
    croppedUrl: '',
    suggestedPresetId: null,
    presetId: null,
    accountCode: null,
    vat: { extracted: 1863, confirmed: null },
    checks: [],
    ocr: {
      merchant: '폴바셋광화문예금보험공사점',
      amount: 20500,
      currency: 'KRW',
      paidAt: '2026-07-21T12:24:31+09:00',
      cardLast4: '3059',
      confidence: 0.96,
      items: [{ name: '회의 음료', amount: 20500 }],
    },
  };
}

export async function checkHealth() {
  return runWithFallback(
    () => request('/api/transactions'),
    demoTransactions,
  );
}

export function demoTransactions() {
  return [
    { id: 'tx_001', cardLast4: '3059', merchant: '폴바셋광화문예금보험공사점', amountKRW: 20500, approvedAt: '2026-07-21T12:24:31+09:00', apprNo: '00045125', status: 'unmatched' },
    { id: 'tx_002', cardLast4: '3059', merchant: '둘둘치킨종로1가점', amountKRW: 64000, approvedAt: '2026-07-20T21:41:32+09:00', apprNo: '00528952', status: 'unmatched' },
    { id: 'tx_003', cardLast4: '3059', merchant: 'ANTHROPIC* CLAUDE SUB', amountKRW: 167435, approvedAt: '2026-07-19T08:33:24+09:00', apprNo: '153578', status: 'unmatched' },
    { id: 'tx_004', cardLast4: '3059', merchant: '카카오_택시9', amountKRW: 34500, approvedAt: '2026-07-16T02:58:44+09:00', apprNo: '00279355', status: 'unmatched' },
    { id: 'tx_005', cardLast4: '3059', merchant: '카카오_택시9', amountKRW: 5000, approvedAt: '2026-07-16T02:58:42+09:00', apprNo: '00443612', status: 'unmatched' },
    { id: 'tx_006', cardLast4: '3059', merchant: '오피스디포코리아', amountKRW: 58650, approvedAt: '2026-07-16T15:57:35+09:00', apprNo: '00564890', status: 'unmatched' },
    { id: 'tx_007', cardLast4: '3059', merchant: 'OPENAI *CHATGPT SUBSCR', amountKRW: 162612, approvedAt: '2026-07-10T09:02:39+09:00', apprNo: '038232', status: 'unmatched' },
  ];
}

export function demoPresets() {
  return [
    {
      id: 'ps_ai_frontier', name: 'AI Frontier 교육', type: 'RECURRING', source: 'admin', active: true,
      rules: { allowedAccountCodes: ['WELFARE_AI'], limitKRW: 300000, limitPeriod: 'monthly', approvalLine: ['이아무개 팀원', '오아무개 팀장', '김현준 기술위원'], descriptionTemplate: '[이름][직급]_[월]월 AI Frontier', matchKeywords: ['ANTHROPIC', 'OPENAI', 'AI Frontier'] },
      usage: { usedKRW: 120000, byDay: {} },
    },
    {
      id: 'ps_books', name: '복지-도서', type: 'RECURRING', source: 'admin', active: true,
      rules: { allowedAccountCodes: ['WELFARE_BOOK'], limitKRW: 200000, limitPeriod: 'monthly', approvalLine: ['김현준 기술위원'], descriptionTemplate: '도서구입 {merchant}', matchKeywords: ['문고', '서점'] },
      usage: { usedKRW: 33000, byDay: {} },
    },
  ];
}

export async function listPresets() {
  return runWithFallback(
    () => request('/api/presets?active=true'),
    demoPresets,
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
  return runWrite(() => request('/api/receipts', { method: 'POST', body: form }));
}

export async function confirmReceipt(receipt, selection) {
  const payload = {
    presetId: selection.presetId || null,
    accountCode: selection.accountCode || null,
    vat: { confirmed: Number(selection.vatConfirmed || 0) },
    ocr: receipt.ocr,
    source: 'mobile',
  };
  if (receipt.id?.startsWith('rcpt_demo_')) {
    return {
      data: { ...receipt, ...payload, vat: { ...(receipt.vat || {}), ...payload.vat } },
      mode: 'demo',
      persisted: false,
    };
  }
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
