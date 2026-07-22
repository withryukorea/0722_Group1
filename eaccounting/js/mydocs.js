/* 나의 문서함 화면
   - 결재문서/기안문서 화면을 실제 e-Accounting 구조에 맞춰 구분
   - 기존 목데이터와 GET /api/vouchers 접수 전표를 함께 표시 */
(function () {
  const VIEW_ALIASES = { all: 'approval-all', pending: 'approval-pending', completed: 'approval-completed' };
  const VIEW_CONFIG = {
    'approval-all': { scope: 'approval', title: '전체조회', active: '결재문서>전체조회', breadcrumb: ['메뉴', '나의 문서함', '결재문서', '전체조회'] },
    'approval-pending': { scope: 'approval', title: '결재할문서', active: '결재문서>결재할문서', breadcrumb: ['메뉴', '나의 문서함', '결재문서', '결재할문서'], progress: '결재중' },
    'approval-completed': { scope: 'approval', title: '완료된문서', active: '결재문서>완료된문서', breadcrumb: ['메뉴', '나의 문서함', '결재문서', '완료된문서'], progress: '결재완료' },
    'drafted-all': { scope: 'drafted', title: '전체조회', active: '기안문서>전체조회', breadcrumb: ['메뉴', '나의 문서함', '기안문서', '전체조회'] },
    'drafted-progress': { scope: 'drafted', title: '진행중문서', active: '기안문서>진행문서', breadcrumb: ['메뉴', '나의 문서함', '기안문서', '진행중문서'], progress: '결재중' },
    'drafted-completed': { scope: 'drafted', title: '완료된문서', active: '기안문서>완료된문서', breadcrumb: ['메뉴', '나의 문서함', '기안문서', '완료된문서'], progress: '결재완료' },
    withdrawn: { scope: 'drafted', title: '철회문서', active: '기안문서>철회문서', breadcrumb: ['메뉴', '나의 문서함', '기안문서', '철회문서'], progress: '철회' },
    temporary: { scope: 'drafted', title: '임시저장문서', active: '임시저장문서', breadcrumb: ['메뉴', '나의 문서함', '임시저장문서'], progress: '임시저장' },
  };

  const requestedView = new URLSearchParams(location.search).get('view') || 'approval-all';
  const viewKey = VIEW_ALIASES[requestedView] || (VIEW_CONFIG[requestedView] ? requestedView : 'approval-all');
  const config = VIEW_CONFIG[viewKey];
  const currentUser = (typeof EACC !== 'undefined' && EACC.user && EACC.user.name) || '홍길동';
  const currentDept = (typeof EACC !== 'undefined' && EACC.user && EACC.user.dept) || '전력사업기획팀';
  const companyName = 'SKㅇㅇ 주식회사';
  const $ = (selector) => document.querySelector(selector);
  const state = { all: [], view: [], loading: false };

  const approvalMocks = Array.isArray(APPROVAL_DOCS) ? APPROVAL_DOCS.map(normalizeMock) : [];
  const draftedMocks = typeof DRAFT_DOCS !== 'undefined' && Array.isArray(DRAFT_DOCS)
    ? DRAFT_DOCS.map(normalizeMock)
    : approvalMocks.filter((document) => document.drafter === currentUser);

  renderChrome({ top: '나의 문서함', active: config.active, breadcrumb: config.breadcrumb });
  configurePage();
  renderTableFrame();
  wireEvents();
  resetFilters(false);
  loadDocuments();

  function normalizeMock(document, index) {
    return {
      ...document,
      source: 'mock',
      hold: document.hold || '',
      title: document.title || document.vendor || `${document.type || '전표'} ${document.docNo || index + 1}`,
      approvalLine: document.approvalLine || document.approver || '',
    };
  }

  function normalizeVoucher(voucher, index) {
    const submittedDate = toDisplayDate(voucher.submittedAt);
    const statusMap = {
      draft: ['임시저장', '기안전표'], submitted: ['결재중', '기안전표'],
      approved: ['결재완료', '확정전표'], rejected: ['반려', '기안전표'], withdrawn: ['철회', '기안전표'],
    };
    const mapped = statusMap[voucher.status] || ['결재중', '기안전표'];
    const descriptions = Array.isArray(voucher.lines) ? voucher.lines.map((line) => line.description).filter(Boolean) : [];
    return {
      source: 'live', hold: 'NEW', type: '법인카드전표', title: voucher.title || '영수증 자동 정산 전표',
      docNo: String(voucher.id || `신규-${index + 1}`), postDate: submittedDate, evidDate: submittedDate,
      draftDate: submittedDate, payDate: '', drafter: voucher.drafter || currentUser, dept: voucher.dept || currentDept,
      approvalLine: Array.isArray(voucher.approvalLine) && voucher.approvalLine.length ? voucher.approvalLine.join(' → ') : '자동 전결라인',
      progress: mapped[0], slipState: mapped[1], amount: voucher.totalKRW || 0,
      vendor: voucher.vendor || descriptions[0] || voucher.title || '-', company: voucher.company || companyName,
    };
  }

  async function loadDocuments() {
    if (state.loading) return;
    state.loading = true;
    $('#sync-status').textContent = '서버에서 접수 전표를 확인하고 있습니다.';
    try {
      const vouchers = await fetchVouchers();
      const liveDocs = vouchers.map(normalizeVoucher).reverse();
      const mocks = config.scope === 'drafted' ? draftedMocks : approvalMocks;
      const liveIds = new Set(liveDocs.map((document) => document.docNo));
      state.all = [...liveDocs, ...mocks.filter((document) => !liveIds.has(document.docNo))];
      $('#sync-status').textContent = `서버 연결됨. 모바일 상신 전표 ${liveDocs.length}건을 표시합니다.`;
    } catch (error) {
      state.all = (config.scope === 'drafted' ? draftedMocks : approvalMocks).slice();
      $('#sync-status').textContent = '서버에 연결할 수 없어 시연용 문서를 표시합니다.';
    } finally {
      state.loading = false;
      applyFilters();
    }
  }

  async function fetchVouchers() {
    const url = location.protocol === 'file:' ? 'http://localhost:4000/api/vouchers' : '/api/vouchers';
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error('INVALID_VOUCHER_LIST');
    return payload;
  }

  function configurePage() {
    document.title = `e-Accounting - ${config.scope === 'drafted' ? '기안문서' : '결재문서'} ${config.title}`;
    $('#view-title').textContent = config.title;
    $('#f-person-label').textContent = config.scope === 'drafted' ? '결재자' : '작성자';
    $('#btn-approve').hidden = config.scope !== 'approval';
    $('#btn-reject').hidden = config.scope !== 'approval';
    $('#btn-withdraw').hidden = config.scope !== 'drafted';
    wireSidebarLinks();
  }

  function wireSidebarLinks() {
    const groups = [...document.querySelectorAll('.snb li')];
    const approval = groups.find((item) => item.querySelector('.snb-item')?.textContent.includes('결재문서'));
    const drafted = groups.find((item) => item.querySelector('.snb-item')?.textContent.includes('기안문서'));
    const approvalViews = ['approval-all', 'approval-pending', 'approval-completed'];
    const draftedViews = ['drafted-all', 'drafted-progress', 'drafted-completed', 'withdrawn'];
    if (approval) [...approval.querySelectorAll('.snb-sub a')].forEach((link, index) => {
      if (approvalViews[index]) link.href = `mydocs-all.html?view=${approvalViews[index]}`;
    });
    if (drafted) [...drafted.querySelectorAll('.snb-sub a')].forEach((link, index) => {
      if (draftedViews[index]) link.href = `mydocs-all.html?view=${draftedViews[index]}`;
    });
    const temporary = [...document.querySelectorAll('.snb-item')].find((link) => link.textContent.includes('임시저장문서'));
    if (temporary) temporary.href = 'mydocs-all.html?view=temporary';
  }

  function renderTableFrame() {
    const approval = config.scope === 'approval';
    const table = $('#doc-table');
    table.classList.add(approval ? 'approval' : 'drafted');
    $('#doc-colgroup').innerHTML = approval
      ? '<col style="width:44px"><col style="width:36px"><col style="width:44px"><col style="width:170px"><col style="width:112px"><col style="width:88px"><col style="width:88px"><col style="width:88px"><col style="width:88px"><col style="width:70px"><col style="width:104px"><col style="width:150px"><col style="width:82px"><col style="width:82px"><col style="width:120px"><col style="width:140px"><col style="width:180px">'
      : '<col style="width:44px"><col style="width:36px"><col style="width:190px"><col style="width:120px"><col style="width:92px"><col style="width:92px"><col style="width:92px"><col style="width:92px"><col style="width:150px"><col style="width:84px"><col style="width:88px"><col style="width:120px"><col style="width:160px"><col style="width:190px">';
    $('#doc-head').innerHTML = approval
      ? '<tr><th>No.</th><th><input type="checkbox" id="chk-all" aria-label="현재 목록 전체 선택"></th><th>보류</th><th>전표유형</th><th>전표번호</th><th>전기일자</th><th>증빙일자</th><th>기안일자</th><th>지급일자</th><th>기안자</th><th>부서</th><th>결재자</th><th>진행상태</th><th>전표상태</th><th>금액</th><th>업체명</th><th>회사</th></tr>'
      : '<tr><th>No.</th><th><input type="checkbox" id="chk-all" aria-label="현재 목록 전체 선택"></th><th>전표유형</th><th>전표번호</th><th>전기일자</th><th>증빙일자</th><th>기안일자</th><th>지급일자</th><th>결재자</th><th>진행상태</th><th>전표상태</th><th>금액</th><th>업체명</th><th>회사</th></tr>';
  }

  function wireEvents() {
    $('#btn-search').addEventListener('click', applyFilters);
    $('#btn-reset').addEventListener('click', () => resetFilters(true));
    $('#btn-approve').addEventListener('click', () => processSelected('결재완료'));
    $('#btn-reject').addEventListener('click', () => processSelected('반려'));
    $('#btn-withdraw').addEventListener('click', () => processSelected('철회'));
    $('#btn-attachment').addEventListener('click', () => showToast('데모 버전에서는 첨부파일 다운로드를 지원하지 않습니다.'));
    $('#btn-export').addEventListener('click', () => showToast('데모 버전에서는 엑셀다운로드를 지원하지 않습니다.'));
    $('#chk-all').addEventListener('change', (event) => {
      document.querySelectorAll('.row-chk').forEach((checkbox) => { checkbox.checked = event.target.checked; });
    });
    $('#doc-body').addEventListener('click', (event) => {
      const link = event.target.closest('.voucher-preview-link');
      if (!link) return;
      event.preventDefault();
      window.open(link.href, 'voucherDraftPreview', 'width=1320,height=900,scrollbars=yes,resizable=yes');
    });
    window.addEventListener('message', (event) => {
      if (event.origin === location.origin && event.data?.type === 'voucher-submitted') loadDocuments();
    });
    document.querySelectorAll('.mydocs-filter input, .mydocs-filter select').forEach((control) => {
      control.addEventListener('keydown', (event) => { if (event.key === 'Enter') applyFilters(); });
    });
  }

  function resetFilters(render) {
    const today = new Date();
    const from = new Date(today);
    from.setFullYear(today.getFullYear() - 1);
    $('#f-date-kind').value = 'draftDate';
    $('#f-date-from').value = toInputDate(from);
    $('#f-date-to').value = toInputDate(today);
    ['#f-title', '#f-type', '#f-progress', '#f-slip-state', '#f-docno', '#f-person', '#f-company', '#f-vendor']
      .forEach((selector) => { $(selector).value = ''; });
    if (render) applyFilters();
  }

  function applyFilters() {
    const dateKind = $('#f-date-kind').value;
    const dateFrom = $('#f-date-from').value;
    const dateTo = $('#f-date-to').value;
    const title = normalizeText($('#f-title').value);
    const type = $('#f-type').value;
    const progress = $('#f-progress').value;
    const slipState = $('#f-slip-state').value;
    const docNo = normalizeText($('#f-docno').value);
    const person = normalizeText($('#f-person').value);
    const company = $('#f-company').value;
    const vendor = normalizeText($('#f-vendor').value);

    state.view = state.all.filter((document) => {
      const targetDate = toInputDate(document[dateKind]);
      const personValue = config.scope === 'drafted' ? document.approvalLine : document.drafter;
      return (!config.progress || document.progress === config.progress)
        && (!dateFrom || !targetDate || targetDate >= dateFrom)
        && (!dateTo || !targetDate || targetDate <= dateTo)
        && (!title || normalizeText(document.title).includes(title))
        && (!type || document.type === type)
        && (!progress || document.progress === progress)
        && (!slipState || document.slipState === slipState)
        && (!docNo || normalizeText(document.docNo).includes(docNo))
        && (!person || normalizeText(personValue).includes(person))
        && (!company || document.company === company)
        && (!vendor || normalizeText(document.vendor).includes(vendor));
    });
    renderRows();
  }

  function renderRows() {
    const approval = config.scope === 'approval';
    const body = $('#doc-body');
    const colspan = approval ? 17 : 14;
    if (!state.view.length) {
      body.innerHTML = `<tr class="empty-pad"><td colspan="${colspan}">조건에 맞는 문서가 없습니다.</td></tr>`;
    } else {
      body.innerHTML = state.view.map((document, index) => approval ? approvalRow(document, index) : draftedRow(document, index)).join('');
    }
    $('#total').textContent = state.view.length;
    $('#chk-all').checked = false;
  }

  function approvalRow(document, index) {
    return `<tr class="${document.source === 'live' ? 'live-row' : ''}">
      <td>${index + 1}</td><td><input type="checkbox" class="row-chk" value="${escapeHtml(document.docNo)}" aria-label="${escapeHtml(document.docNo)} 선택"></td>
      <td class="${document.source === 'live' ? 'new-mark' : ''}">${escapeHtml(document.hold)}</td><td class="l">${escapeHtml(document.type)}</td><td>${documentNumber(document)}</td>
      <td>${escapeHtml(document.postDate)}</td><td>${escapeHtml(document.evidDate)}</td><td>${escapeHtml(document.draftDate)}</td><td>${escapeHtml(document.payDate)}</td>
      <td>${escapeHtml(document.drafter)}</td><td>${escapeHtml(document.dept)}</td><td class="approval-line" title="${escapeHtml(document.approvalLine)}">${escapeHtml(document.approvalLine)}</td>
      <td class="${progressClass(document.progress)}">${escapeHtml(document.progress)}</td><td>${escapeHtml(document.slipState)}</td><td class="r">${formatAmount(document.amount)}</td>
      <td class="l">${escapeHtml(document.vendor)}</td><td class="l">${escapeHtml(document.company)}</td></tr>`;
  }

  function draftedRow(document, index) {
    return `<tr class="${document.source === 'live' ? 'live-row' : ''}">
      <td>${index + 1}</td><td><input type="checkbox" class="row-chk" value="${escapeHtml(document.docNo)}" aria-label="${escapeHtml(document.docNo)} 선택"></td>
      <td class="l">${escapeHtml(document.type)}</td><td>${documentNumber(document)}</td><td>${escapeHtml(document.postDate)}</td><td>${escapeHtml(document.evidDate)}</td>
      <td>${escapeHtml(document.draftDate)}</td><td>${escapeHtml(document.payDate)}</td><td class="approval-line" title="${escapeHtml(document.approvalLine)}">${escapeHtml(document.approvalLine)}</td>
      <td class="${progressClass(document.progress)}">${escapeHtml(document.progress)}</td><td>${escapeHtml(document.slipState)}</td><td class="r">${formatAmount(document.amount)}</td>
      <td class="l">${escapeHtml(document.vendor)}</td><td class="l">${escapeHtml(document.company)}</td></tr>`;
  }

  function processSelected(nextProgress) {
    const checked = [...document.querySelectorAll('.row-chk:checked')].map((checkbox) => checkbox.value);
    if (!checked.length) { showToast('처리할 문서를 먼저 선택해 주세요.'); return; }
    state.all.forEach((document) => {
      if (!checked.includes(document.docNo)) return;
      document.progress = nextProgress;
      if (nextProgress === '결재완료') document.slipState = '확정전표';
    });
    applyFilters();
    showToast(`${checked.length}건이 [${nextProgress}] 처리되었습니다.`);
  }

  function documentNumber(document) {
    const number = escapeHtml(document.docNo);
    if (document.source !== 'live') return number;
    const href = `voucher-preview.html?voucherId=${encodeURIComponent(document.docNo)}`;
    return `<a class="voucher-preview-link" href="${href}">${number}</a>`;
  }

  let toastTimer;
  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function progressClass(progress) {
    if (progress === '결재완료') return 'state-completed';
    if (progress === '결재중') return 'state-pending';
    if (progress === '반려' || progress === '철회') return 'state-rejected';
    return '';
  }

  function formatAmount(amount) { return amount === '' || amount == null ? '' : Number(amount).toLocaleString('ko-KR'); }
  function normalizeText(value) { return String(value || '').trim().toLocaleLowerCase('ko-KR'); }
  function toDisplayDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return toInputDate(date).replaceAll('-', '.');
    return String(value).slice(0, 10).replaceAll('-', '.');
  }
  function toInputDate(value) {
    if (!value) return '';
    if (value instanceof Date) {
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    return String(value).slice(0, 10).replaceAll('.', '-');
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }
})();
