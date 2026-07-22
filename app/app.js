import { ACCOUNT_OPTIONS, APP_CONFIG } from './config.js';
import {
  checkHealth,
  confirmReceipt,
  createTripPreset,
  demoReceipt,
  listReceipts,
  listPresets,
  matchReceipt,
  previewVoucher,
  submitVoucher,
  uploadReceipt,
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
  match: null,
  transaction: null,
  voucher: null,
  result: null,
  mode: 'checking',
  receiptFilter: 'all',
};

const HEADER_COPY = {
  dashboard: '영수증 사진 한 장으로 정산 끝',
  capture: '촬영 · 자동 크롭 · OCR · Preset 추천',
  receipts: '촬영한 영수증과 카드 매칭 현황',
  transactions: '법인카드 승인내역과 증빙 연결',
  setup: '국내·해외 출장 일정과 한도 관리',
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
const shortDate = (value) => value ? new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(new Date(value)) : '-';
const dateTime = (value) => value
  ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '-';

function setMode(mode) {
  state.mode = mode;
  connectionDot.classList.toggle('is-live', mode === 'live');
  connectionDot.classList.toggle('is-demo', mode === 'demo');
  connectionLabel.textContent = mode === 'live'
    ? '서버 연결'
    : mode === 'demo'
      ? '데모 모드'
      : '연결 확인 중';
}

function modeBadge() {
  return state.mode === 'live'
    ? '<span class="mode-badge live">실제 API</span>'
    : '<span class="mode-badge">데모 폴백</span>';
}

function renderNav(route = state.route, focused = false) {
  bottomNav.hidden = !state.tripPreset || focused;
  headerSub.textContent = HEADER_COPY[route] || HEADER_COPY.dashboard;
  bottomNav.querySelectorAll('[data-route]').forEach((button) => {
    button.classList.toggle('active', button.dataset.route === route);
  });
}

function progress(current) {
  const steps = [['capture', '1', '촬영'], ['review', '2', '확인'], ['voucher', '3', '전표']];
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

function categorySummary() {
  return state.transactions.reduce((summary, item) => {
    const key = categoryKey(item);
    summary[key] = (summary[key] || 0) + Number(item.amountKRW || 0);
    return summary;
  }, {});
}

function receiptVisual(preferCropped = false) {
  const serverImage = preferCropped && state.receipt?.croppedUrl
    ? (state.receipt.croppedUrl.startsWith('http') ? state.receipt.croppedUrl : `${APP_CONFIG.apiBase}${state.receipt.croppedUrl}`)
    : '';
  const imageUrl = serverImage || state.localImageUrl;
  if (imageUrl) return `<img class="receipt-image" src="${escapeHtml(imageUrl)}" alt="${preferCropped ? '자동 크롭된 영수증' : '선택한 영수증 사진'}">`;
  return `<div class="receipt-paper" aria-label="샘플 영수증"><b>PAUL BASSETT</b><span>2026.07.21 12:24</span><i></i><span>회의 음료</span><strong>₩ 20,500</strong></div>`;
}

function screenTripSetup() {
  state.route = 'setup';
  renderNav('setup');
  const trip = state.tripPreset ? tripView() : { destination: '부산', tripType: 'domestic', members: 1, startDate: '2026-07-21', endDate: '2026-07-23' };
  const tripPresets = state.presets.filter((preset) => preset.type === 'TRIP');
  root.innerHTML = `
    <section class="schedule-screen">
      <div class="page-heading-mobile schedule-heading"><div><span class="eyebrow">출장 일정 관리</span><h1>일정을 미리 등록해두세요</h1><p>기간 내 결제를 출장비로 분류하고 한도를 자동 계산합니다.</p></div>${modeBadge()}</div>
      ${tripPresets.length ? `<div class="section-label"><b>등록된 출장 일정</b><span>${tripPresets.length}건</span></div><div class="schedule-list">${tripPresets.map((preset, index) => scheduleTripCard(preset, index)).join('')}</div>` : '<div class="schedule-empty"><b>등록된 출장 일정이 없습니다.</b><span>첫 일정을 등록하면 홈 대시보드가 열립니다.</span></div>'}
      <div class="section-label"><b>새 출장 일정 등록</b><span>Preset으로 저장</span></div>
      <form class="trip-form schedule-form" id="trip-form">
        <fieldset class="segment-field"><legend>출장 구분</legend><label><input type="radio" name="tripType" value="domestic" ${trip.tripType !== 'overseas' ? 'checked' : ''}><span>국내 출장<small>일 30,000원</small></span></label><label><input type="radio" name="tripType" value="overseas" ${trip.tripType === 'overseas' ? 'checked' : ''}><span>해외 출장<small>일 80,000원</small></span></label></fieldset>
        <label>출장명·목적지<input name="destination" value="${escapeHtml(trip.destination)}" placeholder="예: 부산·울산 현장 방문" required><small>여러 지역이면 이동 순서대로 입력하세요.</small></label>
        <div class="form-grid"><label>시작일<input type="date" name="startDate" value="${trip.startDate}" required></label><label>종료일<input type="date" name="endDate" value="${trip.endDate}" required></label></div>
        <label>출장 인원<input type="number" name="members" min="1" max="20" value="${trip.members || 1}" required></label>
        <div class="cap-preview" id="cap-preview"></div>
        <button class="button primary full" type="submit">일정 등록하기 <span>→</span></button>
      </form>
      <article class="schedule-tip"><b>일정을 등록하면</b><ul><li>기간 내 카드 결제가 출장 Preset으로 추천됩니다.</li><li>국내·해외 기준과 인원에 맞춰 잔여 한도가 표시됩니다.</li><li>영수증 저장 전 Preset과 비목은 사용자가 최종 확정합니다.</li></ul></article>
    </section>`;
  const form = document.querySelector('#trip-form');
  const updateCap = () => {
    const values = new FormData(form);
    const daily = values.get('tripType') === 'overseas' ? 80000 : 30000;
    const days = tripDays(values.get('startDate'), values.get('endDate'));
    const members = Number(values.get('members') || 1);
    document.querySelector('#cap-preview').innerHTML = `<span>예상 출장여비 한도</span><b>${won(daily * members * days)}</b><small>${won(daily)} × ${members}명 × ${days}일</small>`;
  };
  form.addEventListener('input', updateCap);
  form.addEventListener('submit', saveTrip);
  updateCap();
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
  </article>`;
}

async function saveTrip(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form));
  if (values.endDate < values.startDate) {
    notify('종료일은 시작일보다 빠를 수 없습니다.');
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = '출장 한도 계산 중…';
  const response = await createTripPreset(values);
  setMode(response.mode);
  state.tripPreset = response.data;
  state.presets = [response.data, ...state.presets.filter((item) => item.id !== response.data.id)];
  navigate('dashboard');
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
  const spent = spentAmount();
  const trip = tripView();
  const cap = Number(trip.totalCapKRW);
  const rate = cap ? Math.round((spent / cap) * 100) : 0;
  const matched = state.transactions.filter((item) => ['matched', 'vouchered', 'settled'].includes(item.status)).length;
  const monthTotal = state.transactions.reduce((total, item) => total + Number(item.amountKRW || 0), 0);
  const categories = categorySummary();
  const recentRows = state.receipts.length
    ? state.receipts.slice(0, 4).map(receiptRow).join('')
    : state.transactions.slice(0, 4).map((item) => transactionRow(item, true)).join('');
  root.innerHTML = `
    <section class="dashboard-screen">
      <article class="design-hero">
        <span class="hero-label">2026년 7월 사용 총액</span>
        <strong>${won(monthTotal)}</strong>
        <p>법인카드 ${state.transactions.length}건 · 영수증 ${state.receipts.length}건 · ${matched}건 매칭</p>
        <div class="hero-trip"><div><span>✈ ${escapeHtml(state.tripPreset.name)} · 잔여 한도</span><b>${won(Math.max(0, cap - spent))}</b></div><div class="gauge-track"><i style="width:${Math.min(rate, 100)}%"></i></div><small><span>사용 ${won(spent)}</span><span>${shortDate(trip.startDate)}–${shortDate(trip.endDate)} · ${trip.members}명</span></small></div>
      </article>
      <button class="dashboard-capture" type="button" data-route="capture"><span class="mini-camera" aria-hidden="true"></span><div><b>영수증 촬영하기</b><small>자동 크롭·OCR·Preset 추천까지 한 번에</small></div><strong>→</strong></button>
      <div class="section-label"><b>카테고리별 사용 현황</b><span>전체 누적</span></div>
      <div class="category-card">${Object.entries(categories).sort((a, b) => b[1] - a[1]).map(([key, total]) => categoryUsageRow(key, total, monthTotal)).join('')}</div>
      <div class="section-label"><b>출장비 기준 대비 사용</b><span>읽기 전용</span></div>
      <article class="trip-usage-card"><div class="trip-usage-head"><div><b>${trip.tripType === 'overseas' ? '✈' : '🚄'} ${escapeHtml(state.tripPreset.name)}</b><span>${shortDate(trip.startDate)}–${shortDate(trip.endDate)} · ${trip.days}일</span></div><em>${rate > 100 ? '기준 초과' : '기준 이내'}</em></div><div class="gauge-row"><span>누적 사용</span><b>${won(spent)} / ${won(cap)}</b></div><div class="gauge-track"><i style="width:${Math.min(rate, 100)}%"></i></div><div class="gauge-foot"><span>${won(trip.dailyCapPerPersonKRW)}/인 × ${trip.members}명</span><strong>잔여 ${won(Math.max(0, cap - spent))}</strong></div></article>
      <div class="section-label"><b>배정된 Preset</b><span>${state.presets.length}개 활성</span></div>
      <div class="preset-list">${state.presets.map(presetCard).join('')}</div>
      <div class="section-label"><b>${state.receipts.length ? '최근 영수증' : '최근 카드 승인내역'}</b><button type="button" data-route="${state.receipts.length ? 'receipts' : 'transactions'}">전체보기 ›</button></div>
      <div class="recent-card">${recentRows || '<div class="empty-state small">최근 내역이 없습니다.</div>'}</div>
      <button class="settle-button" type="button" data-action="settle"><span>출장끝</span><b>e-Accounting 전송</b><small>${matched ? `${matched}건의 연결된 거래를 확인합니다` : '영수증을 먼저 연결해주세요'}</small></button>
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
  return `<article class="receipt-row"><div class="receipt-mini">${receipt.id === state.receipt?.id ? receiptVisual() : receiptThumbnail(receipt)}</div><div><b>${escapeHtml(ocr.merchant || '분석 중인 영수증')}</b><small><i style="background:${category.color}"></i>${category.name} · ${dateTime(ocr.paidAt)}</small><span class="status ${receipt.matchedTxId ? 'matched' : 'needed'}">${receipt.matchedTxId ? '매칭완료' : '확인 필요'}</span></div><strong>${won(ocr.amount)}</strong></article>`;
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
  const total = visible.reduce((sum, receipt) => sum + Number(receipt.ocr?.amount || 0), 0);
  root.innerHTML = `<section class="list-screen receipt-screen"><div class="page-heading-mobile"><span class="eyebrow">증빙 보관함</span><h1>촬영한 영수증</h1><p>원본·크롭본·OCR 결과와 카드 매칭 상태를 함께 보관합니다.</p></div><div class="filter-chips sticky-filters">${filters.map(([key, label]) => `<button class="${state.receiptFilter === key ? 'active' : ''}" type="button" data-receipt-filter="${key}">${label}</button>`).join('')}</div><article class="receipt-total"><span>${filters.find(([key]) => key === state.receiptFilter)?.[1]} ${visible.length}건</span><b>${won(total)}</b></article>${visible.length ? `<div class="section-label"><b>2026년 7월</b><span>${visible.length}건</span></div><div class="receipt-list receipt-card">${visible.map(receiptRow).join('')}</div>` : '<div class="empty-state"><span class="empty-receipt" aria-hidden="true"></span><h2>해당 조건의 영수증이 없어요</h2><p>새 영수증을 촬영하면 자동으로 분류됩니다.</p><button class="button primary" data-route="capture">영수증 촬영</button></div>'}<div class="section-label"><b>카드 매칭이 필요하신가요?</b><button type="button" data-route="transactions">승인내역 보기 ›</button></div></section>`;
}

function screenCapture() {
  state.route = 'capture';
  renderNav('capture');
  root.innerHTML = `<section class="hero-screen capture-screen">${progress('capture')}<div class="capture-heading"><span class="eyebrow">${escapeHtml(state.tripPreset.name)}</span><h1>영수증을 프레임에<br>맞춰주세요</h1><p>촬영 후 자동 크롭 → OCR → Preset 추천이 이어집니다.</p></div><button class="camera-stage" type="button" data-action="camera" aria-label="영수증 촬영"><span class="camera-guide"><i></i><i></i><i></i><i></i></span><span class="camera-stage-copy"><b>영수증 전체가 보이게 촬영하세요</b><small>빛 반사와 그림자를 피하면 더 정확합니다</small></span></button><div class="capture-controls"><button class="capture-side" type="button" data-action="gallery"><span aria-hidden="true">▧</span><b>갤러리</b></button><button class="shutter" type="button" data-action="camera" aria-label="촬영"><span class="camera-icon" aria-hidden="true"></span></button><button class="capture-side" type="button" data-action="sample"><span aria-hidden="true">▤</span><b>샘플</b></button></div><div class="trust-note"><span aria-hidden="true">✓</span><p><b>추천은 자동 적용되지 않습니다.</b><br>OCR 결과·Preset·비목·부가세는 저장 전 직접 확정합니다.</p></div></section>`;
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
    target.innerHTML = '<span class="auto-classify-note">Preset 없음 · 서버 자동분류를 사용합니다</span>';
    return;
  }
  target.innerHTML = codes.map((code, index) => `<label class="choice-chip"><input type="radio" name="accountCode" value="${escapeHtml(code)}" ${index === 0 ? 'checked' : ''}><span>${escapeHtml(accountName(code))}</span></label>`).join('');
}

function screenReview() {
  renderNav('capture', true);
  const ocr = state.receipt.ocr;
  const suggestedId = state.receipt.suggestedPresetId || state.tripPreset?.id;
  const checks = state.receipt.checks || [];
  root.innerHTML = `<section class="content-screen">${progress('review')}<div class="section-heading"><div><span class="eyebrow">파싱 확인 · Preset 선택</span><h1>저장할 내용을 확인해주세요</h1></div>${modeBadge()}</div><div class="receipt-summary">${receiptVisual()}<div><span>인식 신뢰도</span><b>${Math.round((ocr.confidence || 0.9) * 100)}%</b><small>원본·크롭본이 함께 보존됩니다</small></div></div><form class="form-card review-form" id="ocr-form"><label>가맹점<input name="merchant" value="${escapeHtml(ocr.merchant)}" required></label><div class="form-grid"><label>결제금액<div class="input-unit"><input name="amount" inputmode="numeric" value="${escapeHtml(ocr.amount)}" required><span>${escapeHtml(ocr.currency || 'KRW')}</span></div></label><label>통화<select name="currency"><option ${ocr.currency === 'KRW' ? 'selected' : ''}>KRW</option><option ${ocr.currency === 'JPY' ? 'selected' : ''}>JPY</option><option ${ocr.currency === 'USD' ? 'selected' : ''}>USD</option></select></label></div><label>결제일시<input name="paidAt" type="datetime-local" value="${escapeHtml(String(ocr.paidAt).slice(0, 16))}" required></label><fieldset class="choice-field"><legend>Preset <small>자동추천은 파란색으로 표시</small></legend><div class="choice-list">${state.presets.map((preset) => `<label class="choice-chip ${preset.id === suggestedId ? 'suggested' : ''}"><input type="radio" name="presetId" value="${escapeHtml(preset.id)}" ${preset.id === suggestedId ? 'checked' : ''}><span>${preset.id === suggestedId ? '✓ ' : ''}${escapeHtml(preset.name)}</span></label>`).join('')}<label class="choice-chip"><input type="radio" name="presetId" value=""><span>일반 결제</span></label></div></fieldset><fieldset class="choice-field"><legend>비목 <small>선택한 Preset에서 허용된 항목만 표시</small></legend><div class="choice-list" id="account-choice"></div></fieldset><label>부가세 확인 <small class="optional-label">선택 확인</small><div class="input-unit"><input name="vatConfirmed" inputmode="numeric" value="${escapeHtml(state.receipt.vat?.extracted || 0)}"><span>원</span></div></label>${checks.map((check) => `<div class="evidence-warning"><b>⚠ ${escapeHtml(check.message)}</b><span>경고가 있어도 저장할 수 있습니다.</span></div>`).join('')}</form><button class="button primary full" type="button" data-action="save-receipt">확정하고 자동 정산 <span>→</span></button><button class="text-button" type="button" data-action="crop-back">크롭 이미지 다시 확인</button></section>`;
  const form = document.querySelector('#ocr-form');
  form.addEventListener('change', (event) => { if (event.target.name === 'presetId') updateAccountChips(form); });
  updateAccountChips(form);
}

function screenMatch() {
  renderNav('capture', true);
  const tx = state.transaction;
  const score = state.match.score;
  const needsConfirm = state.match.status === 'confirm' || score < 70;
  root.innerHTML = `<section class="content-screen">${progress('review')}<div class="success-mark ${needsConfirm ? 'attention' : ''}" aria-hidden="true">${needsConfirm ? '?' : '✓'}</div><div class="section-heading centered"><div><span class="eyebrow">${needsConfirm ? '수동 확인 필요' : '카드내역 자동 매칭'}</span><h1>${needsConfirm ? '이 거래가 맞는지 확인해주세요' : '가장 가까운 내역을 찾았어요'}</h1></div></div><article class="match-card"><div class="match-score"><span>매칭 점수</span><b>${score}<small>점</small></b></div><div class="match-main"><span>${dateTime(tx.approvedAt)}</span><h2>${escapeHtml(tx.merchant)}</h2><strong>${won(tx.amountKRW)}</strong></div><dl><div><dt>승인번호</dt><dd>${escapeHtml(tx.apprNo || tx.approvalNo || '-')}</dd></div><div><dt>카드번호</dt><dd>•••• ${escapeHtml(tx.cardLast4 || String(tx.cardNo || '').slice(-4))}</dd></div></dl></article><div class="compare-note"><span aria-hidden="true">◎</span><p>${needsConfirm ? '후보가 모호해 사용자의 확인이 필요합니다.' : '영수증의 금액과 시간이 카드 승인내역과 일치합니다.'}</p></div><button class="button primary full" type="button" data-action="preview">${needsConfirm ? '이 거래가 맞아요' : '이 내역으로 전표 만들기'} <span>→</span></button><button class="text-button" type="button" data-action="review">OCR 내용 다시 보기</button></section>`;
}

function screenVoucher() {
  renderNav('capture', true);
  const voucher = state.voucher;
  const line = voucher.lines[0];
  const preset = state.presets.find((item) => item.id === state.receipt.presetId);
  root.innerHTML = `<section class="content-screen">${progress('voucher')}<div class="section-heading"><div><span class="eyebrow">자동 정산 완료</span><h1>전송 전에 마지막으로 확인해주세요</h1></div>${modeBadge()}</div><article class="voucher-total"><span>전표 합계</span><strong>${won(voucher.totalKRW)}</strong><small>${escapeHtml(voucher.title)}</small></article><div class="form-card compact auto-filled-card"><div><span>적용 Preset</span><b>${escapeHtml(preset?.name || '일반 결제')}</b></div><div><span>비목(계정)</span><b>${escapeHtml(line.accountName || accountName(line.accountCode))}</b></div><div><span>적요</span><b>${escapeHtml(line.description)}</b></div><div class="attachment-row"><div class="attachment-thumb">${receiptVisual()}</div><div><span>증빙파일</span><b>원본·크롭본 연결 완료</b><small>receiptId · ${escapeHtml(line.receiptId)}</small></div><span class="linked">자동</span></div></div><div class="approval-card"><span>Preset 전결라인 자동 전개</span><div class="approval-flow"><i>기안</i><b>홍길동</b><em>→</em><i>승인</i><b>${escapeHtml(voucher.approvalLine.join(' → '))}</b></div></div><button class="button primary full" type="button" data-action="submit">확인하고 상신 <span>→</span></button><button class="text-button" type="button" data-action="review">Preset 선택 다시 보기</button></section>`;
}

function screenComplete() {
  renderNav('dashboard', true);
  const result = state.result;
  const isDemo = result.status === 'demo';
  root.innerHTML = `<section class="complete-screen"><div class="complete-symbol" aria-hidden="true">✓</div><span class="eyebrow">${isDemo ? '데모 흐름 완료' : '정산 전송 완료'}</span><h1>${isDemo ? '연결 준비가 끝났어요' : '전표가 접수됐어요'}</h1><p>${isDemo ? '서버가 연결되면 같은 화면에서 실제 전표로 전송됩니다.' : 'E-Accounting 나의 문서함에서 전표와 영수증을 확인할 수 있습니다.'}</p><article class="result-ticket"><span>전표번호</span><b>${escapeHtml(result.id)}</b><small>${won(result.totalKRW)} · 증빙 1건</small></article><a class="button primary full link-button" href="${escapeHtml(APP_CONFIG.eAccountingUrl)}">E-Accounting에서 확인 <span>→</span></a><button class="button secondary full" type="button" data-route="dashboard">출장 대시보드로</button></section>`;
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove('show'), 2600);
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
  state.localImageUrl = URL.createObjectURL(file);
  screenProcessing();
  const response = await uploadReceipt(file);
  state.receipt = response.data;
  if (!state.receipt.suggestedPresetId) state.receipt.suggestedPresetId = state.tripPreset?.id || null;
  state.receipts = [state.receipt, ...state.receipts.filter((item) => item.id !== state.receipt.id)];
  setMode(response.mode);
  screenCropConfirm();
}

async function useSample() {
  state.receipt = { ...demoReceipt(), suggestedPresetId: state.tripPreset?.id || null };
  state.localImageUrl = '';
  state.receipts = [state.receipt, ...state.receipts.filter((item) => item.id !== state.receipt.id)];
  setMode('demo');
  screenProcessing('샘플 영수증을 준비하고 있어요');
  await new Promise((resolve) => setTimeout(resolve, 450));
  screenCropConfirm();
}

async function saveReceiptAndMatch() {
  if (!updateReceiptFromForm()) return;
  const form = document.querySelector('#ocr-form');
  const values = new FormData(form);
  const selection = {
    presetId: values.get('presetId'),
    accountCode: values.get('accountCode'),
    vatConfirmed: values.get('vatConfirmed'),
  };
  const confirmed = await confirmReceipt(state.receipt, selection);
  state.receipt = confirmed.data;
  setMode(confirmed.mode);
  state.receipts = [state.receipt, ...state.receipts.filter((item) => item.id !== state.receipt.id)];
  screenProcessing('카드 승인내역을 찾고 있어요');
  const response = await matchReceipt(state.receipt);
  state.match = response.data.match;
  state.transaction = response.data.transaction;
  setMode(response.mode);
  if (!state.match || !state.transaction) {
    notify('자동 매칭되지 않았습니다. 카드내역에서 직접 선택해주세요.');
    screenTransactions();
    return;
  }
  screenMatch();
}

async function createVoucher() {
  screenProcessing('계정과목과 결재라인을 만들고 있어요');
  const preset = state.presets.find((item) => item.id === state.receipt.presetId);
  const response = await previewVoucher(state.match, state.receipt, preset);
  state.voucher = response.data;
  setMode(response.mode);
  const tx = state.transactions.find((item) => item.id === state.match.txId);
  if (tx) tx.status = 'matched';
  state.receipt.matchedTxId = state.match.txId;
  screenVoucher();
}

async function sendVoucher() {
  const button = document.querySelector('[data-action="submit"]');
  button.disabled = true;
  button.textContent = '전송 중…';
  const response = await submitVoucher(state.voucher);
  state.result = response.data;
  setMode(response.mode);
  const tx = state.transactions.find((item) => item.id === state.match.txId);
  if (tx) tx.status = response.mode === 'live' ? 'vouchered' : 'matched';
  const preset = state.presets.find((item) => item.id === state.receipt.presetId);
  if (preset) preset.usage.usedKRW = Number(preset.usage?.usedKRW || 0) + Number(state.voucher.totalKRW || 0);
  screenComplete();
}

function navigate(route) {
  if (!state.tripPreset && route !== 'setup') route = 'setup';
  history.replaceState(null, '', `#${route}`);
  if (route === 'setup') screenTripSetup();
  if (route === 'dashboard') screenDashboard();
  if (route === 'transactions') screenTransactions();
  if (route === 'receipts') screenReceipts();
  if (route === 'capture') screenCapture();
  root.focus({ preventScroll: true });
  scrollTo({ top: 0, behavior: 'smooth' });
}

function settleTrip() {
  const linked = state.transactions.filter((item) => ['matched', 'vouchered', 'settled'].includes(item.status));
  if (!linked.length) return notify('먼저 영수증을 촬영해 카드내역과 연결해주세요.');
  if (state.result) location.href = APP_CONFIG.eAccountingUrl;
  else navigate('receipts');
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
  if (action === 'camera') cameraInput.click();
  if (action === 'gallery') galleryInput.click();
  if (action === 'sample') await useSample();
  if (action === 'crop-confirm') screenReview();
  if (action === 'crop-back') screenCropConfirm();
  if (action === 'recrop') cameraInput.click();
  if (action === 'save-receipt') await saveReceiptAndMatch();
  if (action === 'preview') await createVoucher();
  if (action === 'submit') await sendVoucher();
  if (action === 'review') screenReview();
  if (action === 'settle') settleTrip();
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
  setMode(transactions.mode === 'live' ? 'live' : 'demo');
  if (state.tripPreset) navigate('dashboard');
  else screenTripSetup();
}

init();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}
