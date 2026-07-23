/* ============================================================
   공용 레이아웃 렌더러 (상단 헤더 GNB + 좌측 사이드바 SNB + 브레드크럼)
   사용법: 각 화면 HTML에서
     <div id="gnb"></div>
     <div class="layout"><aside id="snb" class="snb"></aside><main class="content">...</main></div>
     <script src="js/layout.js"></script>
     <script> renderChrome({ top:'나의 문서함', active:'결재문서>전체조회',
                             breadcrumb:['메뉴','나의 문서함','결재문서','전체조회'] }); </script>
   다른 화면(메인/법인카드 등) 파일명이 정해지면 EACC.topLinks 만 수정하면 된다.
   ============================================================ */

const EACC = {
  user: { name: '정성훈', empNo: 'A0674', dept: 'Upstream기술팀', office: 'Upstream사업실' },

  // 상단 메뉴 → 파일명 매핑 (다른 툴이 만드는 화면과 합칠 때 여기만 고치면 됨)
  topLinks: {
    '간편정산': 'quick-upload.html',
    '법인카드': 'card-settlement.html',
    '전불/출장비': 'travel-foreign.html',
    '매입': '#',
    '매출': '#',
    '결산전표': '#',
    '거래처/고객관리': '#',
    '나의 문서함': 'mydocs-all.html',
  },

  sidebars: {
    '간편정산': {
      title: '간편정산', titleIcon: '⚡',
      items: [
        { label: '영수증 업로드', icon: '📸', href: 'quick-upload.html' },
        { label: '자동매칭', icon: '🔗', href: 'quick-match.html' },
        { label: '정산·전표 생성', icon: '🧾', href: 'quick-settlement.html' },
        { label: '분석 대시보드', icon: '📊', href: 'quick-dashboard.html' },
        { label: '정산 단위/일정 설정', icon: '🎛️', href: 'quick-presets.html' },
        { label: '모바일에서 촬영', icon: '📱', href: 'quick-mobile.html' },
      ],
    },
    '법인카드': {
      title: '법인카드', titleIcon: '💳',
      items: [
        { label: '법인카드 정산', icon: '💳', href: 'card-settlement.html' },
        { label: '사적사용분 정산', icon: '💳', children: [
          { label: '사적사용분-법인카드정산' }, { label: '사적사용분-입금 정산' }] },
        { label: '법인카드 관리', icon: '💳', children: [
          { label: '신규신청' }, { label: '변경/해지' }, { label: '공용카드 신청' }, { label: '신청서 진행 현황' }] },
        { label: '법인카드 정산이력', icon: '🧾' },
        { label: '예산조회', icon: '📊', href: 'budget-view.html' },
      ],
    },
    '전불/출장비': {
      title: '전불/출장비', titleIcon: '🧳',
      items: [
        { label: '전불 신청', icon: '📄' },
        { label: '전불 정산', icon: '🧾' },
        { label: '국내출장비 정산', icon: '🚄', href: 'travel-domestic.html' },
        { label: '해외출장비 정산', icon: '✈️', href: 'travel-foreign.html' },
      ],
    },
    '나의 문서함': {
      title: '나의 문서함', titleIcon: '🗂️',
      items: [
        { label: '결재문서', icon: '📑', children: [
          { label: '전체조회', href: 'mydocs-all.html' }, { label: '결재할문서' }, { label: '완료된문서' }] },
        { label: '기안문서', icon: '📑', children: [
          { label: '전체조회' }, { label: '진행문서' }, { label: '완료된문서' }, { label: '철회문서' }] },
        { label: '임시저장문서', icon: '📝' },
        { label: '결재선', icon: '👥', children: [
          { label: '나의 결재선' }, { label: '대결자 지정' }] },
      ],
    },
  },
};

/* API 헬퍼 — 서버(P1)로 서빙 중이면 같은 오리진 /api 사용, file:// 로 직접 열었으면
   localhost:4000 을 시도, 둘 다 실패하면 null 반환 → 각 화면은 내장 목데이터로 폴백.
   (서버가 죽어도 시연이 멈추지 않게 하는 안전장치) */
async function eaccApi(path, options) {
  const bases = location.protocol === 'file:'
    ? ['http://localhost:4000']
    : ['', 'http://localhost:4000'];
  for (const base of bases) {
    try {
      const res = await fetch(base + path, options && {
        method: options.method || 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options.body),
      });
      if (res.ok) return await res.json();
    } catch (e) { /* 다음 후보 시도 */ }
  }
  return null;
}

/* 쓰기용 API 헬퍼 — eaccApi와 달리 실패를 숨기지 않는다 (상신 등 쓰기는 성공 위장 금지).
   반환: { ok, status, data } — 서버가 응답하면 4xx여도 그대로 전달, 네트워크 불통이면 status 0 */
async function eaccApiTry(path, options) {
  const bases = location.protocol === 'file:'
    ? ['http://localhost:4000']
    : ['', 'http://localhost:4000'];
  for (const base of bases) {
    try {
      const res = await fetch(base + path, {
        method: (options && options.method) || 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options && options.body),
      });
      let data = null;
      try { data = await res.json(); } catch (e) { /* 본문 없는 응답 */ }
      return { ok: res.ok, status: res.status, data }; // 서버가 응답했으면 재시도 없이 결과 그대로
    } catch (e) { /* 네트워크 실패 — 다음 후보 시도 */ }
  }
  return { ok: false, status: 0, data: null };
}

function renderChrome(opts) {
  const topMenu = Object.keys(EACC.topLinks);

  const gnb = document.getElementById('gnb');
  if (gnb) {
    gnb.outerHTML = `
    <header class="gnb">
      <a class="logo" href="index.html">
        <span class="sk">SK</span>
        <span class="sub">ㅇㅇ컴퍼니<br>E&amp;S</span>
        <span class="sys">AXE-acc · e-Accounting</span>
      </a>
      <nav>${topMenu.map(m => {
        const sb = EACC.sidebars[m];
        const drop = sb ? `<div class="top-drop">${sb.items.map(it => {
          const href = it.href || (it.children && (it.children.find(c => c.href) || {}).href) || '#';
          return `<a href="${href}"><span class="di">${it.icon || ''}</span>${it.label}</a>`;
        }).join('')}</div>` : '';
        return `<span class="top-wrap" data-menu="${m}">
          <a class="top-item${m === opts.top ? ' active' : ''}" href="${EACC.topLinks[m]}">${m}</a>${drop}</span>`;
      }).join('<span class="sep"></span>')}</nav>
      <div class="util"><span class="star">☆</span><span class="lang">🇰🇷 KOR ▾</span></div>
    </header>`;
  }

  const snb = document.getElementById('snb');
  const sb = EACC.sidebars[opts.sidebar || opts.top];
  if (snb && sb) {
    const active = opts.active || '';
    snb.innerHTML = `
      <div class="snb-title"><span>${sb.titleIcon}</span> ${sb.title}</div>
      <ul>${sb.items.map(it => {
        const isActive = active === it.label || active.startsWith(it.label + '>');
        let html = `<li><a class="snb-item${isActive ? ' active' : ''}" href="${it.href || '#'}">
            <span><span class="ico">${it.icon || ''}</span>${it.label}</span>
            ${it.children ? '<span class="caret">⌃</span>' : ''}</a>`;
        if (it.children) {
          html += `<div class="snb-sub">${it.children.map(c =>
            `<a class="${active === it.label + '>' + c.label ? 'active' : ''}" href="${c.href || '#'}">${c.label}</a>`
          ).join('')}</div>`;
        }
        return html + '</li>';
      }).join('')}</ul>`;
  }

  const bc = document.getElementById('breadcrumb');
  if (bc && opts.breadcrumb) {
    bc.innerHTML = '🏠 › ' + opts.breadcrumb.join(' › ');
  }

  // 미리보기 편의: ?drop=메뉴명 이면 해당 드롭다운을 열어둔 채 표시 (스크린샷/시연용)
  const dropParam = new URLSearchParams(location.search).get('drop');
  if (dropParam) {
    document.querySelectorAll('.top-wrap').forEach(w => {
      if (w.dataset.menu === dropParam) w.classList.add('open');
    });
  }
}
