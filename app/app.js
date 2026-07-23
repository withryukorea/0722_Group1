import { ACCOUNT_OPTIONS, APP_CONFIG } from './config.js';
import {
  checkHealth,
  confirmReceipt,
  listReceipts,
  listPresets,
  uploadReceipt,
  createPreset,
  assignReceipts,
  deletePreset,
} from './api.js';

const root = document.querySelector('#screen-root');
const toast = document.querySelector('#toast');
const cameraInput = document.querySelector('#receipt-camera');
const galleryInput = document.querySelector('#receipt-gallery');
const connectionLabel = document.querySelector('#connection-label');
const connectionDot = document.querySelector('.connection-dot');
const bottomNav = document.querySelector('#bottom-nav');
const settingsButton = document.querySelector('#reset-button');
const headerSub = document.querySelector('#header-sub');

const state = {
  route: 'setup',
  tripPreset: null,
  presets: [],
  transactions: [],
  receipts: [],
  file: null,
  localImageUrl: '',
  receipt: null,
  uploadError: '',
  mode: 'checking',
  receiptFilter: 'all',
};

const HEADER_COPY = {
  dashboard: '영수증 사진 한 장으로 정산 끝',
  capture: '촬영 · 자동 크롭 · OCR · 정산단위 추천',
  receipts: '촬영한 영수증과 카드 매칭 현황',
  transactions: '법인카드 승인내역과 증빙 연결',
  setup: '정산단위 만들기 · 영수증 담기·빼기',
};

const CATEGORY_META = {
  travel: { name: '출장비', color: '#EA002C' },
  ai: { name: 'AI Tool 구독', color: '#D96414' },
  meal: { name: '식대·간식', color: '#0E9F6E' },
  transport: { name: '교통', color: '#2563EB' },
  etc: { name: '일반경비', color: '#8B5CF6' },
};

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const won = (value) => `${Number(value || 0).toLocaleString('ko-KR')}원`;
const now = new Date();
const reportingMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const reportingMonthLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
const shortDate = (value) => value ? new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(new Date(value)) : '-';
const dateTime = (value) => value
  ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '-';

function setMode(mode) {
  state.mode = mode;
  connectionDot.classList.toggle('is-live', mode === 'live');
  connectionDot.classList.toggle('is-demo', mode !== 'live');
  connectionLabel.textContent = mode === 'live'
    ? '서버 연결'
    : mode === 'offline'
      ? '서버 연결 실패'
      : '연결 확인 중';
}

function modeBadge() {
  return state.mode === 'live'
    ? '<span class="mode-badge live">실제 API</span>'
    : '<span class="mode-badge">서버 연결 필요</span>';
}

function renderNav(route = state.route, focused = false) {
  bottomNav.hidden = focused;
  headerSub.textContent = HEADER_COPY[route] || HEADER_COPY.dashboard;
  bottomNav.querySelectorAll('[data-route]').forEach((button) => {
    button.classList.toggle('active', button.dataset.route === route);
  });
}

function progress(current) {
  const steps = [['capture', '1', '촬영'], ['review', '2', '확인'], ['saved', '3', '저장']];
  const activeIndex = Math.max(0, steps.findIndex(([key]) => key === current));
  return `<ol class="progress" aria-label="정산 진행 단계">
    ${steps.map(([, no, label], index) => `<li class="${index <= activeIndex ? 'active' : ''} ${index < activeIndex ? 'done' : ''}">
      <span>${index < activeIndex ? '✓' : no}</span><b>${label}</b>
    </li>`).join('')}
  </ol>`;
}

function tripDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function tripView(preset = state.tripPreset) {
  const meta = preset?.meta || {};
  const startDate = preset?.period?.start || meta.startDate;
  const endDate = preset?.period?.end || meta.endDate;
  const days = meta.days || tripDays(startDate, endDate);
  const dailyCap = Number(preset?.rules?.limitKRW || 0);
  return {
    destination: meta.destination || String(preset?.name || '출장').replace(/\s*출장$/, ''),
    tripType: meta.tripType || (preset?.rules?.matchKeywords?.includes('JPY') ? 'overseas' : 'domestic'),
    members: Number(meta.members || 1), startDate, endDate, days,
    dailyCapPerPersonKRW: Number(meta.dailyCapPerPersonKRW || dailyCap),
    dailyCapKRW: Number(meta.dailyCapKRW || dailyCap),
    totalCapKRW: dailyCap * days,
  };
}

function spentAmount() {
  return Number(state.tripPreset?.usage?.usedKRW || 0);
}

function statusMeta(status) {
  if (status === 'vouchered' || status === 'settled') return ['정산완료', 'settled'];
  if (status === 'matched') return ['매칭완료', 'matched'];
  return ['영수증 필요', 'needed'];
}

function categoryKey(item = {}) {
  const raw = `${item.merchant || ''} ${item.accountCode || ''}`;
  if (/ANTHROPIC|OPENAI|CLAUDE|CHATGPT|AI/i.test(raw)) return 'ai';
  if (/택시|철도|KTX|항공|공항|메트로|지하철|교통/i.test(raw)) return 'transport';
  if (/출장|HOTEL|호텔|숙박/i.test(raw)) return 'travel';
  if (/카페|커피|식당|치킨|식대|간식|폴바셋/i.test(raw)) return 'meal';
  return 'etc';
}

function isDuplicateReceipt(receipt) {
  return receipt.status === 'duplicate'
    || (receipt.checks || []).some((check) => check.type === 'DUPLICATE_DOCUMENT');
}

function receiptAmountKRW(receipt) {
  if (receipt.amountKRW !== undefined && receipt.amountKRW !== null) return Number(receipt.amountKRW || 0);
  return receipt.ocr?.currency === 'KRW' ? Number(receipt.ocr?.amount || 0) : 0;
}

function validReceipts() {
  return state.receipts.filter((receipt) => !isDuplicateReceipt(receipt));
}

function receiptMetrics() {
  const valid = validReceipts();
  const monthly = valid.filter((receipt) => String(receipt.ocr?.paidAt || receipt.createdAt || '').startsWith(reportingMonth));
  return {
    valid,
    monthly,
    allTotal: valid.reduce((total, receipt) => total + receiptAmountKRW(receipt), 0),
    monthTotal: monthly.reduce((total, receipt) => total + receiptAmountKRW(receipt), 0),
    duplicateCount: state.receipts.length - valid.length,
  };
}

function categorySummary(receipts = validReceipts()) {
  return receipts.reduce((summary, receipt) => {
    const key = categoryKey({ merchant: receipt.ocr?.merchant, accountCode: receipt.accountCode });
    summary[key] = (summary[key] || 0) + receiptAmountKRW(receipt);
    return summary;
  }, {});
}

function receiptVisual(preferCropped = false) {
  const serverImage = preferCropped && state.receipt?.croppedUrl
    ? (state.receipt.croppedUrl.startsWith('http') ? state.receipt.croppedUrl : `${APP_CONFIG.apiBase}${state.receipt.croppedUrl}`)
    : '';
  const imageUrl = serverImage || state.localImageUrl;
  if (imageUrl) return `<img class="receipt-image" src="${escapeHtml(imageUrl)}" alt="${preferCropped ? '자동 크롭된 영수증' : '선택한 영수증 사진'}">`;
  return '<div class="receipt-paper" aria-label="영수증 이미지 없음"><b>영수증 이미지 없음</b><span>사진을 다시 선택해 주세요.</span></div>';
}

function screenTripSetup() {
  state.route = 'setup';
  renderNav('setup');
  const tripPresets = state.presets.filter((preset) => preset.type === 'TRIP');
  const userPresets = state.presets.filter((preset) => preset.type !== 'TRIP');
  const receiptCount = (id) => validReceipts().filter((r) => r.presetId === id).length;
  root.innerHTML = `
    <section class="schedule-screen">
      <div class="page-heading-mobile schedule-heading"><div><span class="eyebrow">정산단위 관리</span><h1>정산단위를 만들고 영수증을 담으세요</h1><p>세트로 묶은 영수증은 PC E-Accounting 정산·전표에서 그대로 이어집니다.</p></div>${modeBadge()}</div>
      <button class="button primary full" type="button" data-action="new-preset">+ 새 정산단위 만들기</button>
      ${tripPresets.length
        ? `<div class="section-label"><b>출장 정산단위</b><span>${tripPresets.length}건</span></div><div class="schedule-list">${tripPresets.map((preset, index) => scheduleTripCard(preset, index)).join('')}</div>`
        : ''}
      <div class="section-label"><b>일반 정산단위</b><span>${userPresets.length}개</span></div>
      ${userPresets.length
        ? `<div class="preset-list">${userPresets.map((preset) => settleUnitCard(preset, receiptCount(preset.id))).join('')}</div>`
        : '<div class="schedule-empty"><b>아직 만든 정산단위가 없습니다.</b><span>위의 “새 정산단위 만들기”로 세트를 추가하세요.</span></div>'}
      <button class="button secondary full" type="button" data-route="capture">일반 영수증 촬영</button>
    </section>`;
}

function settleUnitCard(preset, count) {
  const used = Number(preset.usage?.usedKRW || 0);
  const limit = Number(preset.rules?.limitKRW || 0);
  const rate = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const codes = (preset.rules?.allowedAccountCodes || []).map((code) => accountName(code)).join(', ');
  return `<article class="preset-card manage">
    <div><b>🧩 ${escapeHtml(preset.name)}</b><span class="preset-type">${preset.source === 'admin' ? '월 한도' : '내 세트'}</span></div>
    <small>${escapeHtml(codes || '자동 분류')} · 영수증 ${count}건</small>
    ${limit
      ? `<div class="preset-progress"><i style="width:${rate}%"></i></div><p><strong>사용 ${won(used)}</strong><span>잔여 ${won(Math.max(0, limit - used))}</span></p>`
      : `<p><strong>사용 ${won(used)}</strong><span>한도 없음</span></p>`}
    <div class="button-row card-actions">
      <button class="button secondary" type="button" data-action="manage-preset" data-preset-id="${escapeHtml(preset.id)}">영수증 담기·빼기</button>
      <button class="button ghost" type="button" data-action="delete-preset" data-preset-id="${escapeHtml(preset.id)}">삭제</button>
    </div>
  </article>`;
}

function screenPresetPicker(presetId) {
  const preset = state.presets.find((p) => p.id === presetId);
  if (!preset) { screenTripSetup(); return; }
  renderNav('setup', true);
  const receipts = validReceipts();
  const rows = receipts.map((r) => {
    const ocr = r.ocr || {};
    const inThis = r.presetId === preset.id;
    const other = r.presetId && r.presetId !== preset.id ? state.presets.find((p) => p.id === r.presetId) : null;
    const where = inThis ? '이 세트에 담김' : (other ? `다른 세트 · ${escapeHtml(other.name)}` : '미배정');
    return `<label class="picker-row"><input type="checkbox" name="rcpt" value="${escapeHtml(r.id)}" ${inThis ? 'checked' : ''}><div><b>${escapeHtml(ocr.merchant || '영수증')}</b><small>${dateTime(ocr.paidAt)} · ${won(receiptAmountKRW(r))} · ${where}</small></div></label>`;
  }).join('');
  root.innerHTML = `<section class="list-screen">
    <div class="page-heading-mobile"><span class="eyebrow">🧩 ${escapeHtml(preset.name)}</span><h1>영수증 담기 · 빼기</h1><p>체크하면 이 정산단위로 담기고, 해제하면 빠집니다. 영수증 1건은 1개 정산단위에만 속합니다.</p></div>
    <form id="picker-form" class="picker-list">${receipts.length ? rows : '<div class="empty-state small">촬영한 영수증이 없습니다.</div>'}</form>
    <div class="button-row"><button class="button primary" type="button" data-action="picker-save" data-preset-id="${escapeHtml(preset.id)}">저장</button><button class="button secondary" type="button" data-action="picker-cancel">취소</button></div>
  </section>`;
}

function scheduleTripCard(preset, index) {
  const trip = tripView(preset);
  const used = Number(preset.usage?.usedKRW || 0);
  const cap = Number(trip.totalCapKRW || 0);
  const rate = cap ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const active = preset.id === state.tripPreset?.id;
  return `<article class="schedule-card ${trip.tripType === 'overseas' ? 'foreign' : ''}">
    <div class="schedule-card-head"><div><b>${trip.tripType === 'overseas' ? '✈' : '🚄'} ${escapeHtml(preset.name)}</b><span>${shortDate(trip.startDate)} – ${shortDate(trip.endDate)} · ${trip.days}일 · ${trip.members}명</span></div><em>${active ? '진행중' : `일정 #${index + 1}`}</em></div>
    <p>${escapeHtml(trip.destination)} · ${trip.tripType === 'overseas' ? '해외출장' : '국내출장'} 기준</p>
    <div class="gauge-row"><span>사용 ${won(used)}</span><b>${won(cap)}</b></div><div class="gauge-track"><i style="width:${rate}%"></i></div>
    <div class="gauge-foot"><span>${won(trip.dailyCapPerPersonKRW)}/인 × ${trip.members}명 × ${trip.days}일</span><strong>잔여 ${won(Math.max(0, cap - used))}</strong></div>
    <button class="button secondary full trip-select" type="button" data-action="select-trip" data-preset-id="${escapeHtml(preset.id)}">${active ? '선택됨' : '이 정산단위 사용'}</button>
  </article>`;
}

function transactionRow(item, compact = false) {
  const [label, kind] = statusMeta(item.status);
  return `<article class="transaction-row ${compact ? 'compact' : ''}">
    <span class="merchant-icon" aria-hidden="true">${escapeHtml(item.merchant.slice(0, 1))}</span>
    <div><b>${escapeHtml(item.merchant)}</b><small>${dateTime(item.approvedAt)} · •••• ${escapeHtml(item.cardLast4 || String(item.cardNo || '').slice(-4))}</small></div>
    <div class="transaction-amount"><strong>${won(item.amountKRW)}</strong><span class="status ${kind}">${label}</span></div>
  </article>`;
}

function screenDashboard() {
  state.route = 'dashboard';
  renderNav('dashboard');
  const metrics = receiptMetrics();
  const metricSourceLabel = state.mode === 'live' ? '라이브 증빙 기준' : '서버 연결 필요';
  if (!state.tripPreset) {
    const recentRows = state.receipts.length
      ? state.receipts.slice(0, 4).map(receiptRow).join('')
      : state.transactions.slice(0, 4).map((item) => transactionRow(item, true)).join('');
    root.innerHTML = `<section class="dashboard-screen">
      <article class="design-hero"><span class="hero-label">${reportingMonthLabel} 사용 총액</span><strong>${won(metrics.monthTotal)}</strong><p>영수증 ${metrics.monthly.length}건 · 중복 ${metrics.duplicateCount}건 제외 · ${metricSourceLabel}</p><div class="hero-trip"><div><span>배정된 출장 정산단위</span><b>없음</b></div><small><span>일반 경비 영수증은 바로 저장할 수 있습니다.</span></small></div></article>
      <button class="dashboard-capture" type="button" data-route="capture"><span class="mini-camera" aria-hidden="true"></span><div><b>영수증 촬영하기</b><small>자동 크롭·OCR 확인 후 서버에 저장</small></div><strong>→</strong></button>
      <div class="section-label"><b>배정된 정산단위</b><button type="button" data-route="setup">확인하기 ›</button></div>
      <div class="preset-list">${state.presets.map(presetCard).join('') || '<div class="empty-state small">배정된 정산단위가 없습니다.</div>'}</div>
      <div class="section-label"><b>${state.receipts.length ? '최근 영수증' : '최근 카드 승인내역'}</b><button type="button" data-route="${state.receipts.length ? 'receipts' : 'transactions'}">전체보기 ›</button></div>
      <div class="recent-card">${recentRows || '<div class="empty-state small">최근 내역이 없습니다.</div>'}</div>
      <button class="settle-button" type="button" data-action="eaccounting"><span>PC</span><b>E-Accounting에서 계속</b><small>카드 매칭·전표작성·상신은 PC에서 진행합니다</small></button>
    </section>`;
    return;
  }
  const spent = spentAmount();
  const trip = tripView();
  const cap = Number(trip.totalCapKRW);
  const rate = cap ? Math.round((spent / cap) * 100) : 0;
  const categories = categorySummary(metrics.valid);
  const recentRows = state.receipts.length
    ? state.receipts.slice(0, 4).map(receiptRow).join('')
    : state.transactions.slice(0, 4).map((item) => transactionRow(item, true)).join('');
  root.innerHTML = `
    <section class="dashboard-screen">
      <article class="design-hero">
        <span class="hero-label">${reportingMonthLabel} 사용 총액</span>
        <strong>${won(metrics.monthTotal)}</strong>
        <p>영수증 ${metrics.monthly.length}건 · 중복 ${metrics.duplicateCount}건 제외 · ${metricSourceLabel}</p>
        <div class="hero-trip"><div><span>✈ ${escapeHtml(state.tripPreset.name)} · 잔여 한도</span><b>${won(Math.max(0, cap - spent))}</b></div><div class="gauge-track"><i style="width:${Math.min(rate, 100)}%"></i></div><small><span>사용 ${won(spent)}</span><span>${shortDate(trip.startDate)}–${shortDate(trip.endDate)} · ${trip.members}명</span></small></div>
      </article>
      <button class="dashboard-capture" type="button" data-route="capture"><span class="mini-camera" aria-hidden="true"></span><div><b>영수증 촬영하기</b><small>자동 크롭·OCR 확인 후 서버에 저장</small></div><strong>→</strong></button>
      <div class="section-label"><b>카테고리별 사용 현황</b><span>전체 누적</span></div>
      <div class="category-card">${Object.entries(categories).sort((a, b) => b[1] - a[1]).map(([key, total]) => categoryUsageRow(key, total, metrics.allTotal)).join('')}</div>
      <div class="section-label"><b>출장비 기준 대비 사용</b><span>읽기 전용</span></div>
      <article class="trip-usage-card"><div class="trip-usage-head"><div><b>${trip.tripType === 'overseas' ? '✈' : '🚄'} ${escapeHtml(state.tripPreset.name)}</b><span>${shortDate(trip.startDate)}–${shortDate(trip.endDate)} · ${trip.days}일</span></div><em>${rate > 100 ? '기준 초과' : '기준 이내'}</em></div><div class="gauge-row"><span>누적 사용</span><b>${won(spent)} / ${won(cap)}</b></div><div class="gauge-track"><i style="width:${Math.min(rate, 100)}%"></i></div><div class="gauge-foot"><span>${won(trip.dailyCapPerPersonKRW)}/인 × ${trip.members}명</span><strong>잔여 ${won(Math.max(0, cap - spent))}</strong></div></article>
      <div class="section-label"><b>배정된 정산단위</b><span>${state.presets.length}개 활성</span></div>
      <div class="preset-list">${state.presets.map(presetCard).join('')}</div>
      <div class="section-label"><b>${state.receipts.length ? '최근 영수증' : '최근 카드 승인내역'}</b><button type="button" data-route="${state.receipts.length ? 'receipts' : 'transactions'}">전체보기 ›</button></div>
      <div class="recent-card">${recentRows || '<div class="empty-state small">최근 내역이 없습니다.</div>'}</div>
      <button class="settle-button" type="button" data-action="eaccounting"><span>PC</span><b>E-Accounting에서 계속</b><small>카드 매칭·전표작성·상신은 PC에서 진행합니다</small></button>
    </section>`;
}

function categoryUsageRow(key, total, grandTotal) {
  const category = CATEGORY_META[key] || CATEGORY_META.etc;
  const rate = grandTotal ? Math.round((total / grandTotal) * 100) : 0;
  return `<div class="category-row"><div><span><i style="background:${category.color}"></i>${category.name}</span><b>${won(total)}</b></div><div class="gauge-track"><i style="width:${rate}%;background:${category.color}"></i></div><small>${rate}% · 자동 분류 누적</small></div>`;
}

function presetCard(preset) {
  const isTrip = preset.type === 'TRIP';
  const days = isTrip ? tripDays(preset.period.start, preset.period.end) : 1;
  const limit = Number(preset.rules?.limitKRW || 0) * (isTrip && preset.rules?.limitPeriod === 'daily' ? days : 1);
  const used = Number(preset.usage?.usedKRW || 0);
  const rate = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return `<article class="preset-card"><div><b>${escapeHtml(preset.name)}</b><span class="preset-type ${isTrip ? 'trip' : ''}">${isTrip ? 'TRIP' : '월 한도'}</span></div><small>${isTrip ? `${shortDate(preset.period.start)} – ${shortDate(preset.period.end)} · 비목별 현황` : (preset.rules?.allowedAccountCodes || []).join(', ')}</small><div class="preset-progress"><i style="width:${rate}%"></i></div><p><strong>사용 ${won(used)}</strong><span>잔여 ${won(Math.max(0, limit - used))}</span></p></article>`;
}

function screenTransactions() {
  state.route = 'transactions';
  renderNav('transactions');
  const needed = state.transactions.filter((item) => !['matched', 'vouchered', 'settled'].includes(item.status)).length;
  root.innerHTML = `<section class="list-screen"><div class="page-heading-mobile"><span class="eyebrow">법인카드</span><h1>거래 내역</h1><p>영수증이 필요한 거래 ${needed}건</p></div><div class="filter-chips"><button class="active">전체 ${state.transactions.length}</button><button>영수증 필요 ${needed}</button><button>매칭 완료 ${state.transactions.length - needed}</button></div><div class="transaction-list full-list">${state.transactions.map((item) => transactionRow(item)).join('')}</div></section>`;
}

function receiptThumbnail(receipt) {
  const source = receipt?.croppedUrl || receipt?.imageUrl || '';
  if (!source) return '<span class="receipt-placeholder" aria-hidden="true">영수증</span>';
  const url = source.startsWith('http') ? source : `${APP_CONFIG.apiBase}${source}`;
  return `<img class="receipt-image" src="${escapeHtml(url)}" alt="">`;
}

function receiptRow(receipt) {
  const ocr = receipt.ocr || {};
  const key = categoryKey({ merchant: ocr.merchant, accountCode: receipt.accountCode });
  const category = CATEGORY_META[key];
  const dup = isDuplicateReceipt(receipt);
  const foreign = ocr.currency && ocr.currency !== 'KRW';
  const statusClass = dup ? 'dup' : (receipt.matchedTxId ? 'matched' : 'needed');
  const statusText = dup ? '중복' : (receipt.matchedTxId ? '매칭완료' : '확인 필요');
  // 금액은 원화 환산액을 대표로 보여주고, 외화 영수증은 원문 통화를 함께 표기한다.
  const amount = `${won(receiptAmountKRW(receipt))}${foreign ? `<small>${escapeHtml(ocr.currency)} ${Number(ocr.amount || 0).toLocaleString('ko-KR')}</small>` : ''}`;
  return `<article class="receipt-row${dup ? ' is-dup' : ''}"><div class="receipt-mini">${receipt.id === state.receipt?.id ? receiptVisual() : receiptThumbnail(receipt)}</div><div><b>${escapeHtml(ocr.merchant || '분석 중인 영수증')}</b><small><i style="background:${category.color}"></i>${category.name} · ${dateTime(ocr.paidAt)}</small><span class="status ${statusClass}">${statusText}</span></div><strong>${amount}</strong></article>`;
}

function screenReceipts() {
  state.route = 'receipts';
  renderNav('receipts');
  const filters = [['all', '전체'], ['review', '확인 필요'], ['matched', '매칭 완료'], ['travel', '출장비'], ['ai', 'AI Tool']];
  const visible = state.receipts.filter((receipt) => {
    if (state.receiptFilter === 'all') return true;
    if (state.receiptFilter === 'review') return !receipt.matchedTxId;
    if (state.receiptFilter === 'matched') return Boolean(receipt.matchedTxId);
    return categoryKey({ merchant: receipt.ocr?.merchant, accountCode: receipt.accountCode }) === state.receiptFilter;
  });
  // 합산은 원화 환산액(receiptAmountKRW) 기준 + 중복 문서는 제외한다(집계 일관성).
  const total = visible.reduce((sum, receipt) => isDuplicateReceipt(receipt) ? sum : sum + receiptAmountKRW(receipt), 0);
  const dupCount = visible.filter(isDuplicateReceipt).length;
  root.innerHTML = `<section class="list-screen receipt-screen"><div class="page-heading-mobile"><span class="eyebrow">증빙 보관함</span><h1>촬영한 영수증</h1><p>원본·크롭본·OCR 결과와 카드 매칭 상태를 함께 보관합니다.</p></div><div class="filter-chips sticky-filters">${filters.map(([key, label]) => `<button class="${state.receiptFilter === key ? 'active' : ''}" type="button" data-receipt-filter="${key}">${label}</button>`).join('')}</div><article class="receipt-total"><span>${filters.find(([key]) => key === state.receiptFilter)?.[1]} ${visible.length}건${dupCount ? ` · 중복 ${dupCount}건 제외` : ''}</span><b>${won(total)}</b></article>${visible.length ? `<div class="section-label"><b>2026년 7월</b><span>${visible.length}건</span></div><div class="receipt-list receipt-card">${visible.map(receiptRow).join('')}</div>` : '<div class="empty-state"><span class="empty-receipt" aria-hidden="true"></span><h2>해당 조건의 영수증이 없어요</h2><p>새 영수증을 촬영하면 자동으로 분류됩니다.</p><button class="button primary" data-route="capture">영수증 촬영</button></div>'}<div class="section-label"><b>카드 매칭이 필요하신가요?</b><button type="button" data-route="transactions">승인내역 보기 ›</button></div></section>`;
}

function screenCapture() {
  state.route = 'capture';
  renderNav('capture');
  const error = state.uploadError
    ? `<div class="evidence-warning ocr-error"><b>인식 실패 · 저장되지 않았습니다</b><span>${escapeHtml(state.uploadError)}</span></div>`
    : '';
  root.innerHTML = `<section class="hero-screen capture-screen">${progress('capture')}<div class="capture-heading"><span class="eyebrow">${escapeHtml(state.tripPreset?.name || '일반 경비 증빙')}</span><h1>영수증을 프레임에<br>맞춰주세요</h1><p>촬영 후 자동 크롭 → OCR → 정산단위 추천이 이어집니다.</p></div>${error}<button class="camera-stage" type="button" data-action="camera" aria-label="영수증 촬영"><span class="camera-guide"><i></i><i></i><i></i><i></i></span><span class="camera-stage-copy"><b>영수증 전체가 보이게 촬영하세요</b><small>빛 반사와 그림자를 피하면 더 정확합니다</small></span></button><div class="capture-controls"><button class="capture-side" type="button" data-action="gallery"><span aria-hidden="true">▧</span><b>갤러리</b></button><button class="shutter" type="button" data-action="camera" aria-label="촬영"><span class="camera-icon" aria-hidden="true"></span></button><span></span></div><div class="trust-note"><span aria-hidden="true">✓</span><p><b>실제 OCR 성공 결과만 저장됩니다.</b><br>가맹점·금액을 인식하지 못하면 임의 샘플 대신 재촬영을 안내합니다.</p></div></section>`;
}

function screenProcessing(label = '영수증을 읽고 있어요') {
  renderNav(state.route, true);
  root.innerHTML = `<section class="center-screen" aria-busy="true">${progress('review')}<div class="scan-preview">${receiptVisual()}<span class="scan-line"></span></div><div class="loader-dots" aria-hidden="true"><i></i><i></i><i></i></div><h1>${escapeHtml(label)}</h1><p>가맹점, 금액, 날짜와 카테고리를 분석하고 있습니다.</p></section>`;
}

function screenCropConfirm() {
  renderNav('capture', true);
  root.innerHTML = `<section class="content-screen crop-screen">${progress('review')}<div class="section-heading"><div><span class="eyebrow">자동 크롭 완료</span><h1>영수증 영역을 확인해주세요</h1></div>${modeBadge()}</div><div class="crop-frame">${receiptVisual(true)}<span>원본은 서버에 안전하게 보존됩니다</span></div><div class="button-row crop-actions"><button class="button primary" type="button" data-action="crop-confirm">이대로 사용</button><button class="button secondary" type="button" data-action="recrop">다시 촬영</button></div><p class="helper-copy">크롭이 어긋났을 때만 다시 촬영하세요. 파싱은 확인된 이미지로 진행됩니다.</p></section>`;
}

function accountName(code) {
  return ACCOUNT_OPTIONS.find((item) => item.code === code)?.name || code;
}

function updateAccountChips(form) {
  const target = form.querySelector('#account-choice');
  const presetId = new FormData(form).get('presetId');
  const preset = state.presets.find((item) => item.id === presetId);
  const codes = preset?.rules?.allowedAccountCodes || [];
  if (!codes.length) {
    target.innerHTML = '<span class="auto-classify-note">정산단위 없음 · 서버 자동분류를 사용합니다</span>';
    return;
  }
  target.innerHTML = codes.map((code, index) => `<label class="choice-chip"><input type="radio" name="accountCode" value="${escapeHtml(code)}" ${index === 0 ? 'checked' : ''}><span>${escapeHtml(accountName(code))}</span></label>`).join('');
}

function screenReview() {
  renderNav('capture', true);
  const ocr = state.receipt.ocr;
  const suggestedId = state.receipt.suggestedPresetId || state.tripPreset?.id;
  const checks = state.receipt.checks || [];
  root.innerHTML = `<section class="content-screen">${progress('review')}<div class="section-heading"><div><span class="eyebrow">OCR 확인 · 정산단위 선택</span><h1>서버에 저장할 내용을 확인해주세요</h1></div>${modeBadge()}</div><div class="receipt-summary">${receiptVisual()}<div><span>인식 신뢰도</span><b>${Math.round((ocr.confidence || 0.9) * 100)}%</b><small>원본·크롭본이 함께 보존됩니다</small></div></div><form class="form-card review-form" id="ocr-form"><label>가맹점<input name="merchant" value="${escapeHtml(ocr.merchant)}" required></label><div class="form-grid"><label>결제금액<div class="input-unit"><input name="amount" inputmode="numeric" value="${escapeHtml(ocr.amount)}" required><span>${escapeHtml(ocr.currency || 'KRW')}</span></div></label><label>통화<select name="currency"><option ${ocr.currency === 'KRW' ? 'selected' : ''}>KRW</option><option ${ocr.currency === 'JPY' ? 'selected' : ''}>JPY</option><option ${ocr.currency === 'USD' ? 'selected' : ''}>USD</option></select></label></div><label>결제일시<input name="paidAt" type="datetime-local" value="${escapeHtml(String(ocr.paidAt || '').slice(0, 16))}" required></label><fieldset class="choice-field"><legend>정산단위 <small>자동추천은 강조해 표시</small></legend><div class="choice-list">${state.presets.map((preset) => `<label class="choice-chip ${preset.id === suggestedId ? 'suggested' : ''}"><input type="radio" name="presetId" value="${escapeHtml(preset.id)}" ${preset.id === suggestedId ? 'checked' : ''}><span>${preset.id === suggestedId ? '✓ ' : ''}${escapeHtml(preset.name)}</span></label>`).join('')}<label class="choice-chip"><input type="radio" name="presetId" value=""><span>일반 결제</span></label></div></fieldset><fieldset class="choice-field"><legend>비목 <small>선택한 정산단위에서 허용된 항목만 표시</small></legend><div class="choice-list" id="account-choice"></div></fieldset><label>부가세 확인 <small class="optional-label">선택 확인</small><div class="input-unit"><input name="vatConfirmed" inputmode="numeric" value="${escapeHtml(state.receipt.vat?.extracted || 0)}"><span>원</span></div></label>${checks.map((check) => `<div class="evidence-warning"><b>⚠ ${escapeHtml(check.message)}</b><span>경고가 있어도 저장할 수 있습니다.</span></div>`).join('')}</form><button class="button primary full" type="button" data-action="save-receipt">확인하고 저장 <span>→</span></button><button class="text-button" type="button" data-action="crop-back">크롭 이미지 다시 확인</button></section>`;
  const form = document.querySelector('#ocr-form');
  form.addEventListener('change', (event) => { if (event.target.name === 'presetId') updateAccountChips(form); });
  updateAccountChips(form);
}

function screenReceiptSaved(persisted) {
  renderNav('dashboard', true);
  const preset = state.presets.find((item) => item.id === state.receipt.presetId);
  root.innerHTML = `<section class="complete-screen"><div class="complete-symbol" aria-hidden="true">${persisted ? '✓' : 'i'}</div><span class="eyebrow">${persisted ? '증빙 저장 완료' : '샘플 미리보기'}</span><h1>${persisted ? '영수증이 서버에 저장됐어요' : '화면 흐름을 확인했어요'}</h1><p>${persisted ? '카드 매칭·전표작성·첨부·상신은 E-Accounting에서 이어서 진행합니다.' : '샘플 데이터는 서버에 저장되지 않습니다. 실제 사진을 촬영해 저장해주세요.'}</p><article class="result-ticket"><span>${persisted ? '영수증 ID' : '샘플 ID'}</span><b>${escapeHtml(state.receipt.id)}</b><small>${escapeHtml(preset?.name || '일반 결제')} · ${won(state.receipt.ocr?.amount)} · 증빙 1건</small></article>${persisted ? `<a class="button primary full link-button" href="${escapeHtml(APP_CONFIG.eAccountingUrl)}">E-Accounting에서 계속 <span>→</span></a>` : '<button class="button primary full" type="button" data-route="capture">실제 영수증 촬영</button>'}<button class="button secondary full" type="button" data-route="dashboard">홈으로</button></section>`;
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

// 쓰기(생성/담기/삭제) 실패 메시지: 연결 문제면 안내를 우선한다.
function writeErrorMessage(error, fallback) {
  if (!error || !error.status) return '서버 연결을 확인해주세요. 정산단위 변경은 서버 연결이 필요합니다.';
  return fallback;
}

// 뮤테이션 후 최신 상태 재조회(영수증 소속·프리셋 usage 동시 반영).
async function reloadPresetsAndReceipts() {
  const [receipts, presets] = await Promise.all([listReceipts(), listPresets()]);
  state.receipts = receipts.data;
  state.presets = presets.data;
  setMode(presets.mode === 'live' ? 'live' : 'offline');
  if (state.tripPreset) state.tripPreset = state.presets.find((p) => p.id === state.tripPreset.id) || null;
}

// 픽커 체크 상태를 담기/빼기 배치로 환산해 저장한다.
async function savePickerSelection(presetId) {
  const form = document.querySelector('#picker-form');
  if (!form) return;
  const checked = new Set([...form.querySelectorAll('input[name="rcpt"]:checked')].map((input) => input.value));
  const candidates = validReceipts();
  const toAdd = candidates.filter((r) => checked.has(r.id) && r.presetId !== presetId).map((r) => r.id);
  const toRemove = candidates.filter((r) => !checked.has(r.id) && r.presetId === presetId).map((r) => r.id);
  if (!toAdd.length && !toRemove.length) { screenTripSetup(); return; }
  const button = document.querySelector('[data-action="picker-save"]');
  if (button) { button.disabled = true; button.textContent = '저장 중…'; }
  try {
    if (toAdd.length) await assignReceipts(toAdd, presetId);
    if (toRemove.length) await assignReceipts(toRemove, null);
    await reloadPresetsAndReceipts();
    notify(`담기 ${toAdd.length}건 · 빼기 ${toRemove.length}건을 저장했습니다.`);
    screenTripSetup();
  } catch (error) {
    if (button) { button.disabled = false; button.textContent = '저장'; }
    notify(writeErrorMessage(error, '변경 내용을 저장하지 못했습니다.'));
  }
}

function updateReceiptFromForm() {
  const form = document.querySelector('#ocr-form');
  if (!form?.reportValidity()) return false;
  const values = new FormData(form);
  state.receipt.ocr = { ...state.receipt.ocr, merchant: values.get('merchant').trim(), amount: Number(values.get('amount')), currency: values.get('currency'), paidAt: new Date(values.get('paidAt')).toISOString() };
  return true;
}

async function useFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) return notify('이미지 파일을 선택해주세요.');
  if (file.size > 12 * 1024 * 1024) return notify('12MB 이하의 사진을 선택해주세요.');
  if (state.localImageUrl) URL.revokeObjectURL(state.localImageUrl);
  state.file = file;
  state.uploadError = '';
  state.localImageUrl = URL.createObjectURL(file);
  screenProcessing();
  try {
    const response = await uploadReceipt(file);
    state.receipt = response.data;
    if (!state.receipt.suggestedPresetId) state.receipt.suggestedPresetId = state.tripPreset?.id || null;
    state.receipts = [state.receipt, ...state.receipts.filter((item) => item.id !== state.receipt.id)];
    setMode(response.mode);
    screenCropConfirm();
  } catch (error) {
    setMode('checking');
    state.uploadError = error?.message || '영수증을 인식하지 못했습니다. 사진을 다시 촬영해 주세요.';
    screenCapture();
    notify(state.uploadError);
  }
}

async function saveReceipt() {
  if (!updateReceiptFromForm()) return;
  const form = document.querySelector('#ocr-form');
  const values = new FormData(form);
  const selection = {
    presetId: values.get('presetId'),
    accountCode: values.get('accountCode'),
    vatConfirmed: values.get('vatConfirmed'),
  };
  const button = document.querySelector('[data-action="save-receipt"]');
  button.disabled = true;
  button.textContent = '서버에 저장 중…';
  try {
    const confirmed = await confirmReceipt(state.receipt, selection);
    state.receipt = confirmed.data;
    setMode(confirmed.mode);
    state.receipts = [state.receipt, ...state.receipts.filter((item) => item.id !== state.receipt.id)];
    screenReceiptSaved(confirmed.persisted);
  } catch (error) {
    button.disabled = false;
    button.innerHTML = '확인하고 저장 <span>→</span>';
    notify('변경 내용을 저장하지 못했습니다. 서버 연결을 확인하고 다시 시도해주세요.');
  }
}

function navigate(route) {
  history.replaceState(null, '', `#${route}`);
  if (route === 'setup') screenTripSetup();
  if (route === 'dashboard') screenDashboard();
  if (route === 'transactions') screenTransactions();
  if (route === 'receipts') screenReceipts();
  if (route === 'capture') screenCapture();
  root.focus({ preventScroll: true });
  scrollTo({ top: 0, behavior: 'smooth' });
}

root.addEventListener('click', async (event) => {
  const receiptFilter = event.target.closest('[data-receipt-filter]')?.dataset.receiptFilter;
  if (receiptFilter) {
    state.receiptFilter = receiptFilter;
    screenReceipts();
    return;
  }
  const route = event.target.closest('[data-route]')?.dataset.route;
  if (route) return navigate(route);
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'select-trip') {
    const presetId = event.target.closest('[data-preset-id]')?.dataset.presetId;
    state.tripPreset = state.presets.find((item) => item.id === presetId) || null;
    navigate('dashboard');
    return;
  }
  if (action === 'new-preset') {
    const name = (prompt('새 정산단위 이름을 입력하세요') || '').trim();
    if (!name) return;
    try {
      await createPreset({ name });
      await reloadPresetsAndReceipts();
      notify(`정산단위 “${name}”을 만들었습니다.`);
      screenTripSetup();
    } catch (error) {
      notify(writeErrorMessage(error, '정산단위를 만들지 못했습니다.'));
    }
    return;
  }
  if (action === 'manage-preset') {
    const presetId = event.target.closest('[data-preset-id]')?.dataset.presetId;
    screenPresetPicker(presetId);
    return;
  }
  if (action === 'delete-preset') {
    const presetId = event.target.closest('[data-preset-id]')?.dataset.presetId;
    const preset = state.presets.find((item) => item.id === presetId);
    if (!preset) return;
    if (!confirm(`“${preset.name}” 정산단위를 삭제할까요? 담긴 영수증은 소속만 해제됩니다.`)) return;
    try {
      await deletePreset(presetId);
      await reloadPresetsAndReceipts();
      notify(`“${preset.name}”을 삭제했습니다.`);
      screenTripSetup();
    } catch (error) {
      if (error.status === 409) notify('이미 전표로 상신된 영수증이 있어 삭제할 수 없습니다.');
      else notify(writeErrorMessage(error, '정산단위를 삭제하지 못했습니다.'));
    }
    return;
  }
  if (action === 'picker-save') {
    const presetId = event.target.closest('[data-preset-id]')?.dataset.presetId;
    await savePickerSelection(presetId);
    return;
  }
  if (action === 'picker-cancel') { screenTripSetup(); return; }
  if (action === 'camera') cameraInput.click();
  if (action === 'gallery') galleryInput.click();
  if (action === 'crop-confirm') screenReview();
  if (action === 'crop-back') screenCropConfirm();
  if (action === 'recrop') cameraInput.click();
  if (action === 'save-receipt') await saveReceipt();
  if (action === 'eaccounting') location.href = APP_CONFIG.eAccountingUrl;
});

bottomNav.addEventListener('click', (event) => {
  const route = event.target.closest('[data-route]')?.dataset.route;
  if (route) navigate(route);
});
cameraInput.addEventListener('change', () => useFile(cameraInput.files[0]));
galleryInput.addEventListener('change', () => useFile(galleryInput.files[0]));
settingsButton.addEventListener('click', screenTripSetup);
document.querySelector('#home-link').addEventListener('click', (event) => { event.preventDefault(); navigate('dashboard'); });
window.addEventListener('hashchange', () => navigate(location.hash.slice(1) || 'dashboard'));

async function init() {
  const [transactions, receipts, presets] = await Promise.all([checkHealth(), listReceipts(), listPresets()]);
  state.transactions = transactions.data;
  state.receipts = receipts.data;
  state.presets = presets.data;
  state.tripPreset = state.presets.find((item) => item.type === 'TRIP' && item.active) || null;
  setMode([transactions, receipts, presets].every((result) => result.mode === 'live') ? 'live' : 'offline');
  navigate(location.hash.slice(1) || 'dashboard');
}

init();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}
