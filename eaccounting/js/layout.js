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
  user: { name: '유상욱', dept: '전력사업기획팀' },

  // 상단 메뉴 → 파일명 매핑 (다른 툴이 만드는 화면과 합칠 때 여기만 고치면 됨)
  topLinks: {
    '법인카드': 'card-settlement.html',
    '전불/출장비': '#',
    '매입': '#',
    '매출': '#',
    '결산전표': '#',
    '거래처/고객관리': '#',
    '나의 문서함': 'mydocs-all.html',
  },

  sidebars: {
    '법인카드': {
      title: '법인카드', titleIcon: '💳',
      items: [
        { label: '법인카드 정산', icon: '💳', href: 'card-settlement.html' },
        { label: '사적사용분 정산', icon: '💳', children: [
          { label: '사적사용분-법인카드정산' }, { label: '사적사용분-입금 정산' }] },
        { label: '법인카드 관리', icon: '💳', children: [
          { label: '신규신청' }, { label: '변경/해지' }, { label: '공용카드 신청' }, { label: '신청서 진행 현황' }] },
        { label: '법인카드 정산이력', icon: '🧾' },
        { label: '예산조회', icon: '📊' },
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

function renderChrome(opts) {
  const topMenu = Object.keys(EACC.topLinks);

  const gnb = document.getElementById('gnb');
  if (gnb) {
    gnb.outerHTML = `
    <header class="gnb">
      <a class="logo" href="index.html">
        <span class="sk">SK</span>
        <span class="sub">이노베이션<br>E&amp;S</span>
        <span class="sys">e-Accounting System</span>
      </a>
      <nav>${topMenu.map(m =>
        `<a class="top-item${m === opts.top ? ' active' : ''}" href="${EACC.topLinks[m]}">${m}</a>`
      ).join('<span class="sep"></span>')}</nav>
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
}
