(function () {
  const DEFAULT_IDS = ['tx_001', 'tx_002', 'tx_003', 'tx_004', 'tx_005', 'tx_007'];
  const TAXABLE_IDS = new Set(['tx_001', 'tx_002']);
  const EXPENSE_ACCOUNT = '[735901]회의비-경상회의비';
  const VAT_ACCOUNT = '[416101]부가가치세-매입';
  const CARD_ACCOUNT = '[410902]미지급비용-신용카드';
  const BUDGET_DEPT = '[AQ131]전력사업기획팀';
  const params = new URLSearchParams(location.search);
  const requestedVoucherId = params.get('voucherId');
  const requestedIds = (params.get('txIds') || '').split(',').filter(Boolean);

  const state = {
    transactions: [],
    voucher: null,
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
    { id: 'tx_001', usedDate: '2026-07-21', approvedAt: '2026-07-21T12:24:31+09:00', merchant: '폴바셋광화문예금보험공사점', industry: '커피숍', amount: 20500, amountKRW: 20500, owner: '홍길동', dept: '전력사업기획팀' },
    { id: 'tx_002', usedDate: '2026-07-20', approvedAt: '2026-07-20T21:41:32+09:00', merchant: '둘둘치킨종로1가점', industry: '일반주점', amount: 64000, amountKRW: 64000, owner: '홍길동', dept: '전력사업기획팀' },
    { id: 'tx_003', usedDate: '2026-07-19', approvedAt: '2026-07-19T08:33:24+09:00', merchant: 'ANTHROPIC* CLAUDE SUB', industry: '컴퓨터소프트웨어매장', amount: 167435, amountKRW: 167435, owner: '홍길동', dept: '전력사업기획팀' },
    { id: 'tx_004', usedDate: '2026-07-16', approvedAt: '2026-07-16T02:58:44+09:00', merchant: '카카오_택시9', industry: '택시', amount: 34500, amountKRW: 34500, owner: '홍길동', dept: '전력사업기획팀' },
    { id: 'tx_005', usedDate: '2026-07-16', approvedAt: '2026-07-16T02:58:42+09:00', merchant: '카카오_택시9', industry: '택시', amount: 5000, amountKRW: 5000, owner: '홍길동', dept: '전력사업기획팀' },
    { id: 'tx_006', usedDate: '2026-07-16', approvedAt: '2026-07-16T15:57:35+09:00', merchant: '오피스디포코리아', industry: '기타사무용품', amount: 58650, amountKRW: 58650, owner: '홍길동', dept: '전력사업기획팀' },
    { id: 'tx_007', usedDate: '2026-07-10', approvedAt: '2026-07-10T09:02:39+09:00', merchant: 'OPENAI *CHATGPT SUBSCR', industry: '컴퓨터소프트웨어매장', amount: 162612, amountKRW: 162612, owner: '홍길동', dept: '전력사업기획팀' },
  ];

  document.querySelector('#btn-draft').addEventListener('click', submitVoucher);
  document.querySelector('#btn-toggle-settlement').addEventListener('click', toggleSettlement);
  initialize();

  async function initialize() {
    if (requestedVoucherId) {
      state.voucher = await loadVoucher(requestedVoucherId);
    }

    const idsFromVoucher = state.voucher && Array.isArray(state.voucher.lines)
      ? state.voucher.lines.map((line) => line.txId).filter(Boolean)
      : [];
    const selectedIds = idsFromVoucher.length ? idsFromVoucher : (requestedIds.length ? requestedIds : DEFAULT_IDS);
    const allTransactions = await loadTransactions();
    state.transactions = selectedIds
      .map((id) => allTransactions.find((transaction) => transaction.id === id))
      .filter(Boolean);

    if (!state.transactions.length) {
      state.transactions = fallbackTransactions.filter((transaction) => DEFAULT_IDS.includes(transaction.id));
    }

    renderHeader();
    renderVoucherInfo();
    renderCardDetails();
    renderSettlement();
  }

  async function loadTransactions() {
    try {
      const result = await requestJson('/api/transactions');
      return Array.isArray(result) ? result : fallbackTransactions;
    } catch (error) {
      return fallbackTransactions;
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

  function renderHeader() {
    const title = state.voucher?.title || '법인카드전표 (현업완결)';
    document.querySelector('#voucher-title').textContent = title;
    document.title = `미리보기(기안) - ${title}`;
    const finalApprover = Array.isArray(state.voucher?.approvalLine) && state.voucher.approvalLine.length
      ? state.voucher.approvalLine[state.voucher.approvalLine.length - 1]
      : '김예섬 팀장';
    document.querySelector('#final-approver').textContent = finalApprover;

    if (state.voucher) {
      const button = document.querySelector('#btn-draft');
      button.textContent = '기안 완료';
      button.disabled = true;
    }
  }

  function renderVoucherInfo() {
    const dates = state.transactions.map((transaction) => transaction.usedDate).filter(Boolean).sort();
    const evidenceDate = dates[0] || '2026-07-10';
    document.querySelector('#evidence-date').textContent = toDotDate(evidenceDate);
    document.querySelector('#posting-date').textContent = toDotDate(evidenceDate);
    document.querySelector('#fiscal-year').textContent = evidenceDate.slice(0, 4);
    document.querySelector('#fiscal-month').textContent = evidenceDate.slice(5, 7);
  }

  function renderCardDetails() {
    const body = document.querySelector('#card-detail-body');
    body.innerHTML = state.transactions.map((transaction) => {
      const meta = merchantMeta[transaction.id] || { taxKind: '일반과세자', address: '', foreign: '' };
      const taxable = TAXABLE_IDS.has(transaction.id);
      const gross = Number(transaction.amountKRW ?? transaction.amount ?? 0);
      const displayedAmount = taxable ? Math.ceil(gross / 1.1) : gross;
      const number = transactionNumber(transaction.id);
      const memo = `${toDotDate(transaction.usedDate)}_경상회의비`;
      return `<tr>
        <td rowspan="2" class="center">${number}</td>
        <td rowspan="2" class="center">${formatDateTime(transaction.approvedAt)}</td>
        <td rowspan="2" class="right">${formatAmount(displayedAmount)}</td>
        <td rowspan="2" class="right">${escapeHtml(meta.foreign)}</td>
        <td rowspan="2">${escapeHtml(transaction.merchant)}</td>
        <td class="sub-cell">${escapeHtml(transaction.industry)}</td>
        <td class="sub-cell">${escapeHtml(meta.taxKind)}</td>
        <td rowspan="2">${BUDGET_DEPT}</td>
        <td rowspan="2">${EXPENSE_ACCOUNT}</td>
        <td rowspan="2" class="center">${escapeHtml(transaction.owner || '홍길동')}</td>
        <td rowspan="2" class="center">${taxable ? '有' : '無'}</td>
        <td rowspan="2">${memo}</td>
      </tr><tr><td colspan="2" class="sub-cell">${escapeHtml(meta.address)}</td></tr>`;
    }).join('');
  }

  function renderSettlement() {
    const lines = [];
    state.transactions.forEach((transaction) => {
      const gross = Number(transaction.amountKRW ?? transaction.amount ?? 0);
      const taxable = TAXABLE_IDS.has(transaction.id);
      const net = taxable ? Math.ceil(gross / 1.1) : gross;
      const vat = taxable ? gross - net : 0;
      const memo = `${toDotDate(transaction.usedDate)}_경상회의비`;

      lines.push({ account: EXPENSE_ACCOUNT, debit: net, credit: '', budget: '전력사업기획팀', memo });
      if (vat) lines.push({ account: VAT_ACCOUNT, debit: vat, credit: '', budget: '', memo });
      lines.push({ account: CARD_ACCOUNT, debit: '', credit: -gross, budget: '', memo });
    });

    document.querySelector('#settlement-body').innerHTML = lines.map((line, index) => `<tr>
      <td class="center">${index + 1}</td><td>${line.account}</td>
      <td class="right">${line.debit === '' ? '' : formatAmount(line.debit)}</td>
      <td class="right">${line.credit === '' ? '' : formatAmount(line.credit)}</td>
      <td>${line.budget}</td><td>${line.memo}</td>
    </tr>`).join('');
  }

  async function submitVoucher() {
    if (state.voucher || state.submitting) return;
    state.submitting = true;
    const button = document.querySelector('#btn-draft');
    button.disabled = true;
    button.textContent = '기안 중…';

    const body = {
      title: '법인카드전표 (현업완결)',
      lines: state.transactions.map((transaction) => ({
        txId: transaction.id,
        accountCode: 'ENTERTAIN',
        amountKRW: Number(transaction.amountKRW ?? transaction.amount ?? 0),
        description: `${transaction.merchant} · 경상회의비`,
      })),
      totalKRW: state.transactions.reduce((sum, transaction) => sum + Number(transaction.amountKRW ?? transaction.amount ?? 0), 0),
      approvalLine: ['김예섬 팀장'],
      draftOpinion: document.querySelector('#draft-opinion').value.trim(),
    };

    try {
      state.voucher = await requestJson('/api/vouchers', { method: 'POST', body });
      button.textContent = '기안 완료';
      showToast(`전표가 기안되었습니다. 전표번호: ${state.voucher.id}`);
      if (window.opener) window.opener.postMessage({ type: 'voucher-submitted', voucherId: state.voucher.id }, location.origin);
    } catch (error) {
      button.disabled = false;
      button.textContent = '기안';
      showToast('서버에 연결할 수 없어 기안하지 못했습니다. 서버 상태를 확인해 주세요.');
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

  async function requestJson(path, options = {}) {
    const base = location.protocol === 'file:' ? 'http://localhost:4000' : '';
    const request = { method: options.method || 'GET', cache: 'no-store', headers: {} };
    if (options.body) {
      request.headers['Content-Type'] = 'application/json';
      request.body = JSON.stringify(options.body);
    }
    const response = await fetch(base + path, request);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  let toastTimer;
  function showToast(message) {
    const toast = document.querySelector('#preview-toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
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
