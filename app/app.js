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
    ? '실제 서버 연결됨'
    : mode === 'demo'
      ? '안전한 데모 데이터 사용 중'
      : '서버 연결 확인 중';
}

function modeBadge() {
  return state.mode === 'live'
    ? '<span class="mode-badge live">실제 API</span>'
    : '<span class="mode-badge">데모 폴백</span>';
}

function renderNav(route = state.route, focused = false) {
  bottomNav.hidden = !state.tripPreset || focused;
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
  root.innerHTML = `
    <section class="setup-screen">
      <div class="setup-visual"><span class="map-pin" aria-hidden="true"></span><small>출장 영수증 자동 정산</small><h1>출장 정보를<br>먼저 알려주세요</h1><p>기간과 장소를 기준으로 사용 가능한 출장여비를 계산합니다.</p></div>
      <form class="trip-form" id="trip-form">
        <fieldset class="segment-field"><legend>출장 구분</legend><label><input type="radio" name="tripType" value="domestic" ${trip.tripType !== 'overseas' ? 'checked' : ''}><span>국내 출장<small>일 30,000원</small></span></label><label><input type="radio" name="tripType" value="overseas" ${trip.tripType === 'overseas' ? 'checked' : ''}><span>해외 출장<small>일 80,000원</small></span></label></fieldset>
        <label>출장 장소<input name="destination" value="${escapeHtml(trip.destination)}" placeholder="예: 부산" required></label>
        <div class="form-grid"><label>시작일<input type="date" name="startDate" value="${trip.startDate}" required></label><label>종료일<input type="date" name="endDate" value="${trip.endDate}" required></label></div>
        <label>출장 인원<input type="number" name="members" min="1" max="20" value="${trip.members || 1}" required></label>
        <div class="cap-preview" id="cap-preview"></div>
        <button class="button primary full" type="submit">출장 시작하기 <span>→</span></button>
      </form>
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
  root.innerHTML = `
    <section class="dashboard-screen">
      <div class="trip-heading"><div><span class="eyebrow">내 정산 현황</span><h1>${escapeHtml(state.tripPreset.name)}</h1><p>${shortDate(trip.startDate)} – ${shortDate(trip.endDate)} · ${trip.days}일 · ${trip.members}명</p></div>${modeBadge()}</div>
      <article class="budget-hero">
        <div class="budget-top"><span>출장여비 소진율</span><b>${Math.min(rate, 999)}<small>%</small></b></div>
        <div class="budget-track"><i style="width:${Math.min(rate, 100)}%"></i></div>
        <div class="budget-values"><div><span>사용금액</span><strong>${won(spent)}</strong></div><div><span>남은 한도</span><strong>${won(Math.max(0, cap - spent))}</strong></div></div>
      </article>
      <div class="metric-grid"><article><span>일당 한도</span><b>${won(trip.dailyCapKRW)}</b><small>${won(trip.dailyCapPerPersonKRW)} × ${trip.members}명</small></article><article><span>매칭 현황</span><b>${matched}<em> / ${state.transactions.length}</em></b><small>영수증 연결 완료</small></article></div>
      <button class="dashboard-capture" type="button" data-route="capture"><span class="mini-camera" aria-hidden="true"></span><div><b>영수증 촬영하기</b><small>사진을 찍으면 자동으로 분석해요</small></div><strong>→</strong></button>
      <div class="list-heading"><h2>배정된 Preset</h2><span class="readonly-label">읽기 전용</span></div>
      <div class="preset-list">${state.presets.map(presetCard).join('')}</div>
      <div class="list-heading"><h2>최근 카드내역</h2><button type="button" data-route="transactions">전체보기</button></div>
      <div class="transaction-list">${state.transactions.slice(0, 3).map((item) => transactionRow(item, true)).join('') || '<div class="empty-state small">카드내역을 불러오는 중입니다.</div>'}</div>
      <button class="settle-button" type="button" data-action="settle"><span>출장끝</span><b>e-Accounting 전송</b><small>${matched ? `${matched}건의 연결된 거래를 확인합니다` : '영수증을 먼저 연결해주세요'}</small></button>
    </section>`;
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

function receiptRow(receipt) {
  const ocr = receipt.ocr || {};
  return `<article class="receipt-row"><div class="receipt-mini">${receipt.id === state.receipt?.id ? receiptVisual() : '<span>영수증</span>'}</div><div><b>${escapeHtml(ocr.merchant || '분석 중인 영수증')}</b><small>${dateTime(ocr.paidAt)} · ${escapeHtml(receipt.id)}</small><span class="status ${receipt.matchedTxId ? 'matched' : 'needed'}">${receipt.matchedTxId ? '매칭완료' : '확인 필요'}</span></div><strong>${won(ocr.amount)}</strong></article>`;
}

function screenReceipts() {
  state.route = 'receipts';
  renderNav('receipts');
  root.innerHTML = `<section class="list-screen"><div class="page-heading-mobile"><span class="eyebrow">증빙 보관함</span><h1>촬영한 영수증</h1><p>원본과 OCR 결과를 함께 보관합니다.</p></div>${state.receipts.length ? `<div class="receipt-list">${state.receipts.map(receiptRow).join('')}</div>` : '<div class="empty-state"><span class="empty-receipt" aria-hidden="true"></span><h2>아직 촬영한 영수증이 없어요</h2><p>출장 중 받은 영수증을 바로 찍어두세요.</p><button class="button primary" data-route="capture">첫 영수증 촬영</button></div>'}</section>`;
}

function screenCapture() {
  state.route = 'capture';
  renderNav('capture');
  root.innerHTML = `<section class="hero-screen">${progress('capture')}<div class="eyebrow">${escapeHtml(state.tripPreset.name)} · 영수증 자동 정산</div><h1>영수증을 찍으면<br><em>Preset을 추천해드려요.</em></h1><p class="lead">원본은 보존하고 자동 크롭·OCR 후 적용할 Preset과 비목만 확인합니다.</p><button class="capture-card" type="button" data-action="camera"><span class="camera-orbit" aria-hidden="true"><span class="camera-icon"></span></span><b>영수증 촬영하기</b><small>휴대폰 뒷면 카메라를 사용합니다</small></button><div class="button-row"><button class="button secondary" type="button" data-action="gallery">사진에서 선택</button><button class="button ghost" type="button" data-action="sample">샘플로 체험</button></div><div class="trust-note"><span aria-hidden="true">✓</span><p><b>추천은 참고용입니다.</b><br>Preset과 비목은 저장 전에 사용자가 직접 확정합니다.</p></div></section>`;
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
