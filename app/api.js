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
      rules: { allowedAccountCodes: ['WELFARE_AI'], limitKRW: 300000, limitPeriod: 'monthly', approvalLine: ['이아무개 팀원', '오아무개 팀장', '김아무개 기술위원'], descriptionTemplate: '[이름][직급]_[월]월 AI Frontier', matchKeywords: ['ANTHROPIC', 'OPENAI', 'AI Frontier'] },
      usage: { usedKRW: 120000, byDay: {} },
    },
    {
      id: 'ps_books', name: '복지-도서', type: 'RECURRING', source: 'admin', active: true,
      rules: { allowedAccountCodes: ['WELFARE_BOOK'], limitKRW: 200000, limitPeriod: 'monthly', approvalLine: ['김아무개 팀장'], descriptionTemplate: '도서구입 {merchant}', matchKeywords: ['문고', '서점'] },
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

export async function createTripPreset(input) {
  const perPerson = input.tripType === 'overseas' ? 80000 : 30000;
  const start = new Date(`${input.startDate}T00:00:00`);
  const end = new Date(`${input.endDate}T00:00:00`);
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const dailyCap = perPerson * Number(input.members || 1);
  const payload = {
    name: `${input.destination} 출장`,
    type: 'TRIP',
    source: 'trip_request',
    assignees: ['u_me'],
    period: { start: input.startDate, end: input.endDate },
    active: true,
    rules: {
      allowedAccountCodes: ['TRAVEL_MEAL', 'TRAVEL_TRANSPORT', 'TRAVEL_LODGING'],
      limitKRW: dailyCap,
      limitPeriod: 'daily',
      approvalLine: ['김아무개 팀장'],
      descriptionTemplate: `${input.destination}출장 {merchant} ${input.members}인`,
      matchKeywords: [input.destination, input.tripType === 'overseas' ? 'JPY' : 'KRW'],
      requireItemized: false,
    },
    usage: { usedKRW: 0, byDay: {} },
  };
  return runWithFallback(
    () => request('/api/presets', { method: 'POST', body: payload }),
    () => ({
      id: 'ps_trip_demo_001',
      ...payload,
      meta: { ...input, days, dailyCapPerPersonKRW: perPerson, dailyCapKRW: dailyCap },
    }),
  );
}

export async function listReceipts() {
  return runWithFallback(
    () => request('/api/receipts'),
    () => [],
  );
}

export async function uploadReceipt(file) {
  const form = new FormData();
  form.append('image', file, file.name);
  return runWithFallback(
    () => request('/api/receipts', { method: 'POST', body: form }),
    demoReceipt,
  );
}

export async function confirmReceipt(receipt, selection) {
  const payload = {
    presetId: selection.presetId || null,
    accountCode: selection.accountCode || null,
    vat: { confirmed: Number(selection.vatConfirmed || 0) },
  };
  return runWithFallback(
    () => request(`/api/receipts/${encodeURIComponent(receipt.id)}`, { method: 'PATCH', body: payload }),
    () => ({ ...receipt, ...payload, vat: { ...(receipt.vat || {}), ...payload.vat }, _presetConfirmedLocally: true }),
  );
}

export async function matchReceipt(receipt) {
  return runWithFallback(
    async () => {
      const matches = await request('/api/match', {
        method: 'POST',
        body: { receiptIds: [receipt.id] },
      });
      const transactions = await request('/api/transactions');
      const match = matches[0];
      return {
        match,
        transaction: transactions.find((item) => item.id === match?.txId) || null,
      };
    },
    () => ({
      match: { receiptId: receipt.id, txId: 'tx_001', score: 96 },
      transaction: {
        id: 'tx_001',
        merchant: '폴바셋광화문예금보험공사점',
        amountKRW: 20500,
        approvedAt: '2026-07-21T12:24:31+09:00',
        approvalNo: '00045125',
        cardNo: '4025961080293059',
      },
    }),
  );
}

export async function previewVoucher(match, receipt, preset) {
  const fallback = () => ({
    title: '법인카드전표 (현업완결)',
    lines: [{
      txId: match.txId,
      receiptId: receipt.id,
      accountCode: receipt.accountCode || 'SNACK',
      amountKRW: Number(receipt.ocr.amount),
      description: preset?.rules?.descriptionTemplate
        ? preset.rules.descriptionTemplate.replace('{merchant}', receipt.ocr.merchant).replace('{n}', '1')
        : `${receipt.ocr.merchant} · 자동 정산`,
    }],
    totalKRW: Number(receipt.ocr.amount),
    approvalLine: preset?.rules?.approvalLine || ['김아무개 팀장'],
    status: 'draft',
  });
  if (receipt._presetConfirmedLocally) {
    return { data: fallback(), mode: 'demo', error: new ApiError('PRESET_API_NOT_READY', 501) };
  }
  return runWithFallback(
    () => request('/api/vouchers/preview', {
      method: 'POST',
      body: { matches: [match] },
    }),
    fallback,
  );
}

export async function submitVoucher(voucher) {
  return runWithFallback(
    () => request('/api/vouchers', { method: 'POST', body: voucher }),
    () => ({
      ...voucher,
      id: 'DEMO-VCH-001',
      status: 'demo',
      submittedAt: new Date().toISOString(),
    }),
  );
}
