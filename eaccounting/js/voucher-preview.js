(function () {
  const DEFAULT_IDS = ['tx_001', 'tx_002', 'tx_003', 'tx_004', 'tx_005', 'tx_007'];
  // 표준 상대계정(대변=신용카드 미지급, 부가세=매입). 비용계정(차변)은 절대 하드코딩하지 않고
  // 서버 /api/vouchers/preview(정산단위/자동분류) 또는 상신된 전표 라인에서 그대로 받아 표시한다. (#1)
  const VAT_ACCOUNT = '[416101]부가가치세-매입';
  const CARD_ACCOUNT = '[410902]미지급비용-신용카드';
  const DEPT_NAME = { AQ131: 'Upstream기술팀', AQ132: '전력수급2팀', AQ133: '전력사업운영실' };
  const DEPT_OF = { '김현준 기술위원': 'Upstream기술팀', '박아무개 실장': 'Upstream사업실', '최아무개 매니저': '경영기획실', '김예섬 팀장': 'Upstream기술팀' };
  const params = new URLSearchParams(location.search);
  const requestedVoucherId = params.get('voucherId');
  const requestedIds = (params.get('txIds') || '').split(',').filter(Boolean);

  const state = {
    voucher: null,      // ?voucherId → 상신완료 전표 열람(VIEW)
    preview: null,      // ?txIds → 서버 미리보기 응답(DRAFT)
    rows: [],           // 화면 렌더 모델 (거래 표시정보 + 계정/금액/적요)
    submitting: false,
  };

  const merchantMeta = {
    tx_001: { taxKind: '일반과세자', address: '서울 중구 청계천로30 1층 (다동 예금보험공사)', foreign: '' },
    tx_002: { taxKind: '일반과세자', address: '서울 종로구 종로5길13 (청진동 삼공빌딩)', foreign: '' },
    tx_003: { taxKind: '해외사업자', address: 'United States ANTHROPIC.COM', foreign: '110.00(USD)' },
    tx_004: { taxKind: '일반과세자', address: '서울 중구 다동39 한미빌딩 10~11층', foreign: '' },
    tx_005: { taxKind: '일반과세자', address: '서울 중구 다동39 한미빌딩 10~11층', foreign: '' },
    tx_006: { taxKind: '일반과세자', address: '서울 중구 세종대로 사무용품점', foreign: '' },
    tx_007: { taxKind: '해외사업자', address: 'United States OPENAI.COM', foreign: '' },
  };

  const fallbackTransactions = [
    { id: 'tx_001', usedDate: '2026-07-21', approvedAt: '2026-07-21T12:24:31+09:00', merchant: '폴바셋광화문예금보험공사점', industry: '커피숍', amount: 20500, amountKRW: 20500, owner: '정성훈', dept: 'Upstream기술팀' },
    { id: 'tx_002', usedDate: '2026-07-20', approvedAt: '2026-07-20T21:41:32+09:00', merchant: '둘둘치킨종로1가점', industry: '일반주점', amount: 64000, amountKRW: 64000, owner: '정성훈', dept: 'Upstream기술팀' },
    { id: 'tx_003', usedDate: '2026-07-19', approvedAt: '2026-07-19T08:33:24+09:00', merchant: 'ANTHROPIC* CLAUDE SUB', industry: '컴퓨터소프트웨어매장', amount: 167435, amountKRW: 167435, owner: '정성훈', dept: 'Upstream기술팀' },
    { id: 'tx_004', usedDate: '2026-07-16', approvedAt: '2026-07-16T02:58:44+09:00', merchant: '카카오_택시9', industry: '택시', amount: 34500, amountKRW: 34500, owner: '정성훈', dept: 'Upstream기술팀' },
    { id: 'tx_005', usedDate: '2026-07-16', approvedAt: '2026-07-16T02:58:42+09:00', merchant: '카카오_택시9', industry: '택시', amount: 5000, amountKRW: 5000, owner: '정성훈', dept: 'Upstream기술팀' },
    { id: 'tx_006', usedDate: '2026-07-16', approvedAt: '2026-07-16T15:57:35+09:00', merchant: '오피스디포코리아', industry: '기타사무용품', amount: 58650, amountKRW: 58650, owner: '정성훈', dept: 'Upstream기술팀' },
    { id: 'tx_007', usedDate: '2026-07-10', approvedAt: '2026-07-10T09:02:39+09:00', merchant: 'OPENAI *CHATGPT SUBSCR', industry: '컴퓨터소프트웨어매장', amount: 162612, amountKRW: 162612, owner: '정성훈', dept: 'Upstream기술팀' },
  ];

  document.querySelector('#btn-draft').addEventListener('click', submitVoucher);
  document.querySelector('#btn-toggle-settlement').addEventListener('click', toggleSettlement);
  initialize();

  async function initialize() {
    const allTransactions = await loadTransactions();
    const txById = new Map(allTransactions.map((t) => [t.id, t]));

    if (requestedVoucherId) {
      // ── VIEW: 이미 상신된 전표 열람 → 저장된 라인(계정·적요·부가세)을 그대로 표시 ──
      state.voucher = await loadVoucher(requestedVoucherId);
      state.rows = state.voucher ? rowsFromVoucher(state.voucher, txById) : [];
    } else {
      // ── DRAFT: 카드내역 선택 미리보기 → 서버가 정산단위/자동분류로 계정·적요·결재선을 결정 ──
      const selectedIds = requestedIds.length ? requestedIds : DEFAULT_IDS;
      const receiptByTx = await loadReceiptMap();
      const matches = selectedIds
        .filter((id) => txById.has(id))
        .map((id) => (receiptByTx.has(id) ? { txId: id, receiptId: receiptByTx.get(id).id } : { txId: id }));
      state.preview = await loadPreview(matches);
      state.rows = state.preview ? rowsFromPreview(state.preview, txById) : [];
    }

    renderHeader();
    renderApproval();
    renderWarnings();
    renderVoucherInfo();
    renderCardDetails();
    renderSettlement();
  }

  // ── 데이터 로드 ────────────────────────────────────────────────
  async function loadTransactions() {
    try {
      const result = await requestJson('/api/transactions');
      return Array.isArray(result) && result.length ? result : fallbackTransactions;
    } catch (error) {
      return fallbackTransactions;
    }
  }

  async function loadReceiptMap() {
    try {
      const receipts = await requestJson('/api/receipts');
      const map = new Map();
      if (Array.isArray(receipts)) receipts.filter((r) => r.matchedTxId).forEach((r) => map.set(r.matchedTxId, r));
      return map;
    } catch (error) {
      return new Map();
    }
  }

  async function loadPreview(matches) {
    if (!matches.length) return null;
    try {
      return await requestJson('/api/vouchers/preview', { method: 'POST', body: { matches } });
    } catch (error) {
      return null; // 미리보기 실패 → 하드코딩 대체 없이 "불러오지 못함"으로 정직하게 표시
    }
  }

  async function loadVoucher(id) {
    try {
      const vouchers = await requestJson('/api/vouchers');
      return Array.isArray(vouchers) ? vouchers.find((voucher) => String(voucher.id) === String(id)) || null : null;
    } catch (error) {
      return null;
    }
  }

  // ── 렌더 모델 빌드 ─────────────────────────────────────────────
  function displayMeta(txId, tx) {
    const meta = merchantMeta[txId] || {};
    return {
      merchant: (tx && tx.merchant) || '',
      industry: (tx && tx.industry) || '',
      approvedAt: (tx && tx.approvedAt) || '',
      usedDate: (tx && tx.usedDate) || '',
      owner: (tx && tx.owner) || '정성훈',
      taxKind: meta.taxKind || '일반과세자',
      address: meta.address || '',
      foreign: meta.foreign || '',
    };
  }

  function rowsFromPreview(preview, txById) {
    return (preview.lines || []).map((pl) => {
      const tx = txById.get(pl.txId);
      const m = displayMeta(pl.txId, tx);
      return {
        txId: pl.txId,
        receiptId: pl.receiptId || null,
        presetId: pl.presetId || null,
        accountCode: pl.accountCode,
        accountDisplay: pl.accountDisplay || pl.accountName || pl.accountCode || '',
        costCenter: pl.costCenter,
        amountKRW: Number(pl.amountKRW || 0),
        supplyKRW: Number(pl.supplyKRW != null ? pl.supplyKRW : pl.amountKRW || 0),
        vatKRW: Number(pl.vatKRW || 0),
        description: pl.description || m.merchant,
        serviceDate: pl.serviceDate || (m.approvedAt || '').slice(0, 10) || m.usedDate,
        ...m,
      };
    });
  }

  function rowsFromVoucher(voucher, txById) {
    return (voucher.lines || []).map((l) => {
      const tx = txById.get(l.txId);
      const m = displayMeta(l.txId, tx);
      const amountKRW = Number(l.amountKRW || 0);
      const supplyKRW = Number(l.supplyKRW != null ? l.supplyKRW : amountKRW);
      const vatKRW = Number(l.vatKRW != null ? l.vatKRW : Math.max(0, amountKRW - supplyKRW));
      return {
        txId: l.txId,
        receiptId: l.receiptId || null,
        presetId: l.presetId || null,
        accountCode: l.accountCode,
        accountDisplay: l.accountDisplay || l.accountCode || '',
        costCenter: (String(l.costCenter || '').match(/\w+/) || [])[0] || null,
        amountKRW,
        supplyKRW,
        vatKRW,
        description: l.description || m.merchant,
        serviceDate: l.serviceDate || (m.approvedAt || '').slice(0, 10) || m.usedDate,
        ...m,
      };
    });
  }

  function budgetLabel(costCenter) {
    if (!costCenter) return 'Upstream기술팀';
    const code = String(costCenter).replace(/[[\]]/g, '');
    return DEPT_NAME[code] ? `[${code}]${DEPT_NAME[code]}` : `[${code}]`;
  }

  // ── 렌더 ───────────────────────────────────────────────────────
  function renderHeader() {
    const title = (state.voucher && state.voucher.title)
      || (state.preview && state.preview.title)
      || '법인카드전표 (현업완결)';
    document.querySelector('#voucher-title').textContent = title;
    document.title = `미리보기(기안) - ${title}`;

    const button = document.querySelector('#btn-draft');
    if (state.voucher) {
      // 이미 상신된 전표 열람 → 재상신 불가
      button.textContent = '기안 완료';
      button.disabled = true;
    } else if (!state.rows.length) {
      // 미리보기를 불러오지 못함 → 성공 위장 금지: 상신 비활성
      button.textContent = '기안 불가';
      button.disabled = true;
    } else {
      button.textContent = '기안';
      button.disabled = false;
    }
  }

  function renderApproval() {
    const source = state.voucher || state.preview || {};
    const detail = source.approvalLineDetail;
    const flat = Array.isArray(source.approvalLine) ? source.approvalLine : [];
    const approve = (detail && detail.approve) || (flat.length ? flat[flat.length - 1] : '김예섬 팀장');
    document.querySelector('#final-approver').textContent = approve;

    const reviewers = (detail && Array.isArray(detail.reviewers)) ? detail.reviewers : flat.slice(0, -1);
    const empties = [...document.querySelectorAll('.approval-empty')];
    reviewers.slice(0, empties.length).forEach((name, i) => {
      const cell = empties[i];
      cell.classList.remove('approval-empty');
      cell.classList.add('approval-person');
      cell.innerHTML = `<span>${escapeHtml(DEPT_OF[name] || 'Upstream기술팀')}</span><strong>${escapeHtml(name)}</strong>`;
    });
  }

  function renderWarnings() {
    const warnings = (state.preview && Array.isArray(state.preview.warnings)) ? state.preview.warnings : [];
    let banner = document.querySelector('#preview-warn');
    if (!warnings.length) {
      if (banner) banner.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'preview-warn';
      banner.setAttribute('role', 'alert');
      banner.style.cssText = 'margin:0 0 16px; padding:11px 14px; border:1px solid #eb3d77; border-radius:7px; background:#fdeef4; color:#b4245c; font-size:13.5px; line-height:1.5;';
      const content = document.querySelector('.preview-content');
      content.insertBefore(banner, content.firstChild);
    }
    banner.innerHTML = `⚠ ${warnings.map((w) => escapeHtml(w.message)).join('<br>')}`;
  }

  function renderVoucherInfo() {
    const dates = state.rows.map((row) => row.serviceDate).filter(Boolean).sort();
    const evidenceDate = dates[0] || '2026-07-10';
    document.querySelector('#evidence-date').textContent = toDotDate(evidenceDate);
    document.querySelector('#posting-date').textContent = toDotDate(evidenceDate);
    document.querySelector('#fiscal-year').textContent = evidenceDate.slice(0, 4);
    document.querySelector('#fiscal-month').textContent = evidenceDate.slice(5, 7);
  }

  function renderCardDetails() {
    const body = document.querySelector('#card-detail-body');
    if (!state.rows.length) {
      const msg = state.voucher ? '전표 라인을 불러오지 못했습니다.' : '서버 미리보기를 불러오지 못했습니다. 서버(:4000) 상태를 확인해 주세요.';
      body.innerHTML = `<tr><td colspan="12" class="loading-cell">${msg}</td></tr>`;
      return;
    }
    body.innerHTML = state.rows.map((row) => {
      const number = transactionNumber(row.txId);
      // 금액 칸은 공급가액(부가세 분리 후) — 서버가 계산한 값을 그대로 사용
      return `<tr>
        <td rowspan="2" class="center">${number}</td>
        <td rowspan="2" class="center">${formatDateTime(row.approvedAt)}</td>
        <td rowspan="2" class="right">${formatAmount(row.supplyKRW)}</td>
        <td rowspan="2" class="right">${escapeHtml(row.foreign)}</td>
        <td rowspan="2">${escapeHtml(row.merchant)}</td>
        <td class="sub-cell">${escapeHtml(row.industry)}</td>
        <td class="sub-cell">${escapeHtml(row.taxKind)}</td>
        <td rowspan="2">${escapeHtml(budgetLabel(row.costCenter))}</td>
        <td rowspan="2">${escapeHtml(row.accountDisplay)}</td>
        <td rowspan="2" class="center">${escapeHtml(row.owner)}</td>
        <td rowspan="2" class="center">${row.vatKRW > 0 ? '有' : '無'}</td>
        <td rowspan="2">${escapeHtml(row.description)}</td>
      </tr><tr><td colspan="2" class="sub-cell">${escapeHtml(row.address)}</td></tr>`;
    }).join('');
  }

  function renderSettlement() {
    const lines = [];
    state.rows.forEach((row) => {
      lines.push({ account: row.accountDisplay, debit: row.supplyKRW, credit: '', budget: budgetLabel(row.costCenter), memo: row.description });
      if (row.vatKRW > 0) lines.push({ account: VAT_ACCOUNT, debit: row.vatKRW, credit: '', budget: '', memo: row.description });
      lines.push({ account: CARD_ACCOUNT, debit: '', credit: -row.amountKRW, budget: '', memo: row.description });
    });

    document.querySelector('#settlement-body').innerHTML = lines.map((line, index) => `<tr>
      <td class="center">${index + 1}</td><td>${escapeHtml(line.account)}</td>
      <td class="right">${line.debit === '' ? '' : formatAmount(line.debit)}</td>
      <td class="right">${line.credit === '' ? '' : formatAmount(line.credit)}</td>
      <td>${escapeHtml(line.budget)}</td><td>${escapeHtml(line.memo)}</td>
    </tr>`).join('');
  }

  // ── 상신 (DRAFT 전용) ─────────────────────────────────────────
  async function submitVoucher() {
    if (state.voucher || state.submitting || !state.rows.length || !state.preview) return;

    // 한도 경고가 있으면 상신 전 확인 (경고만 — 차단 아님)
    const warnings = state.preview.warnings || [];
    if (warnings.length && !confirm(`한도 경고가 있습니다:\n${warnings.map((w) => w.message).join('\n')}\n\n그래도 기안할까요?`)) {
      return;
    }

    state.submitting = true;
    const button = document.querySelector('#btn-draft');
    button.disabled = true;
    button.textContent = '기안 중…';

    const body = {
      title: state.preview.title || '법인카드전표 (현업완결)',
      lines: state.rows.map((row) => ({
        txId: row.txId,
        receiptId: row.receiptId || null,
        presetId: row.presetId || null,
        accountCode: row.accountCode,
        accountDisplay: row.accountDisplay,
        costCenter: row.costCenter || null,
        amountKRW: row.amountKRW,
        supplyKRW: row.supplyKRW,
        vatKRW: row.vatKRW,
        description: row.description,
      })),
      totalKRW: state.preview.totalKRW != null
        ? state.preview.totalKRW
        : state.rows.reduce((sum, row) => sum + row.amountKRW, 0),
      approvalLine: state.preview.approvalLine || ['김예섬 팀장'],
      approvalLineDetail: state.preview.approvalLineDetail || undefined,
      draftOpinion: document.querySelector('#draft-opinion').value.trim(),
    };

    try {
      const response = await fetchJson('/api/vouchers', { method: 'POST', body });
      if (!response.ok) {
        button.disabled = false;
        button.textContent = '기안';
        if (response.status === 409) {
          const ids = (response.data && response.data.txIds) || [];
          showToast(`이미 전표가 상신된 카드내역이 포함되어 있습니다${ids.length ? ` (${ids.join(', ')})` : ''}.`);
        } else {
          showToast(`기안에 실패했습니다: ${(response.data && (response.data.hint || response.data.error)) || 'HTTP ' + response.status}`);
        }
        return;
      }
      state.voucher = response.data;
      button.textContent = '기안 완료';
      showToast(`전표가 기안되었습니다. 전표번호: ${state.voucher.id}`);
      if (window.opener) window.opener.postMessage({ type: 'voucher-submitted', voucherId: state.voucher.id }, location.origin);
    } catch (error) {
      button.disabled = false;
      button.textContent = '기안';
      showToast('서버에 연결할 수 없어 기안하지 못했습니다. 서버(:4000) 상태를 확인해 주세요.');
    } finally {
      state.submitting = false;
    }
  }

  function toggleSettlement() {
    const button = document.querySelector('#btn-toggle-settlement');
    const panel = document.querySelector('#settlement-panel');
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    panel.hidden = expanded;
  }

  // ── HTTP ───────────────────────────────────────────────────────
  function apiBase() {
    return location.protocol === 'file:' ? 'http://localhost:4000' : '';
  }
  async function requestJson(path, options = {}) {
    const request = { method: options.method || 'GET', cache: 'no-store', headers: {} };
    if (options.body) {
      request.headers['Content-Type'] = 'application/json';
      request.body = JSON.stringify(options.body);
    }
    const response = await fetch(apiBase() + path, request);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
  // 상신은 실패(4xx/409)도 사유를 봐야 하므로 throw 하지 않고 {ok,status,data} 로 돌려준다
  async function fetchJson(path, options = {}) {
    const request = { method: options.method || 'GET', cache: 'no-store', headers: {} };
    if (options.body) {
      request.headers['Content-Type'] = 'application/json';
      request.body = JSON.stringify(options.body);
    }
    const response = await fetch(apiBase() + path, request);
    let data = null;
    try { data = await response.json(); } catch (error) { data = null; }
    return { ok: response.ok, status: response.status, data };
  }

  let toastTimer;
  function showToast(message) {
    const toast = document.querySelector('#preview-toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
  }

  function transactionNumber(id) {
    const parsed = Number(String(id || '').split('_').pop());
    return Number.isNaN(parsed) ? '' : parsed;
  }
  function formatAmount(value) { return Number(value || 0).toLocaleString('ko-KR'); }
  function toDotDate(value) { return String(value || '').slice(0, 10).replaceAll('-', '.'); }
  function formatDateTime(value) {
    if (!value) return '';
    const datePart = String(value).slice(0, 10);
    const timePart = String(value).slice(11, 19);
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const day = new Date(`${datePart}T00:00:00`).getDay();
    return `${toDotDate(datePart)}<br>${timePart}<br>(${weekdays[day]})`;
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }
})();
