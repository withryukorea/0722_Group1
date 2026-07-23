/* AXE_Acc M 공통 크롬(네이비 헤더 + 햄버거 드로어 + 하단 탭바)
   레이아웃·용어는 ref/screens/mobile-eacc/ (기존 사내 모바일 E-acc) 참고:
   ☰ + 중앙 타이틀 + 홈 아이콘, 드로어 메뉴(사용자/회사 + 업무 메뉴 + 시스템문의).
   각 화면에서 SKM.chrome("home"|"capture"|"receipts"|"docs"|"schedule", sub) 호출.
   PC AXE-acc(:4000 루트)와 같은 서버·같은 DB, 창(뷰)만 모바일 전용. */

/* ── PWA 배선 (구 /app 의 설치·오프라인 자산을 v2 모바일로 이관) ──
   모든 m/ 화면이 이 파일을 로드하므로 여기 한 곳에서 매니페스트 링크·테마색·설치메타를
   <head>에 주입하고 서비스워커를 등록한다 (http/https 서빙 시에만 — file:// 데모는 제외). */
(function installPWA() {
  const head = document.head;
  if (head && !document.querySelector('link[rel="manifest"]')) {
    const add = (tag, attrs) => { const el = document.createElement(tag); Object.assign(el, attrs); head.appendChild(el); };
    add("link", { rel: "manifest", href: "manifest.webmanifest" });
    add("meta", { name: "theme-color", content: "#EA002C" });
    add("link", { rel: "apple-touch-icon", href: "icon.svg" });
    add("meta", { name: "apple-mobile-web-app-capable", content: "yes" });
    add("meta", { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" });
    add("meta", { name: "apple-mobile-web-app-title", content: "AXE-acc" });
  }
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js", { scope: "./" }).catch(() => { /* 등록 실패해도 화면은 정상 동작 */ });
    });
  }
})();

window.SKM = (function () {
  const WING = `
    <svg width="26" height="20" viewBox="0 0 52 40" aria-hidden="true">
      <ellipse cx="18" cy="20" rx="16" ry="9" transform="rotate(-24 18 20)" fill="#fff" opacity=".95"/>
      <ellipse cx="36" cy="18" rx="13" ry="7" transform="rotate(18 36 18)" fill="#f79ab7" opacity=".95"/>
    </svg>`;

  const ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
    cameraLine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
    receipts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12v20l-2-1.5L14 22l-2-1.5L10 22l-2-1.5L6 22z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>',
    docs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/></svg>',
    schedule: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>',
    person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 11.5-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8L13 3.9a3.7 3.7 0 0 1 5.2 5.2l-8.3 8.3a1.8 1.8 0 0 1-2.6-2.6L15 7"/></svg>'
  };

  /* 드로어 메뉴 — ref 02(Home·법인카드·결재문서함·대결자 지정·첨부파일·설정)를
     AXE_Acc M 화면 구성에 맞게 매핑. key는 chrome(active)와 대응 */
  const MENU = [
    { key: "home",     icon: "home",       label: "Home",            href: "index.html" },
    { key: "receipts", icon: "card",       label: "법인카드",         href: "receipts.html?f=cards" },
    { key: "docs",     icon: "docs",       label: "결재문서함",       href: "docs.html" },
    { key: "deputy",   icon: "person",     label: "대결자 지정",      pc: "PC AXE-acc › 나의 문서함 › 결재선 › 대결자 지정에서 설정할 수 있습니다." },
    { key: "attach",   icon: "clip",       label: "영수증 첨부파일",  href: "receipts.html" },
    { key: "capture",  icon: "cameraLine", label: "영수증 촬영·등록", href: "capture.html", sub: true },
    { key: "receipts2",icon: "receipts",   label: "영수증 조회",      href: "receipts.html", sub: true },
    { key: "schedule", icon: "schedule",   label: "출장 일정·예산",   href: "schedule.html" },
    { key: "settings", icon: "gear",       label: "설정",            pc: "설정은 PC AXE-acc에서 제공됩니다." }
  ];

  function chrome(active, sub) {
    const D = window.SKD;
    const app = document.querySelector(".app");

    document.querySelector(".app-head").innerHTML = `
      <div class="row1">
        <button class="h-icon" id="mMenuBtn" aria-label="메뉴 열기">${ICONS.menu}</button>
        <a class="h-title" href="index.html">AXE_Acc <em>M</em></a>
        <a class="h-icon" href="index.html" aria-label="홈으로">${ICONS.home}</a>
      </div>
      ${sub ? `<div class="sub">${sub}</div>` : ""}`;

    /* 햄버거 드로어 (ref 02) — 프레임 안에 넣어 데스크톱 미리보기에서도 안 벗어나게 */
    let back = app.querySelector(".drawer-back");
    if (!back) {
      back = document.createElement("div");
      back.className = "drawer-back";
      back.innerHTML = `
        <aside class="drawer" role="navigation">
          <div class="d-head">
            <div class="d-name">${D.USER.name}</div>
            <div class="d-comp">에스케이ㅇㅇ 주식회사 · ${D.USER.team}</div>
          </div>
          <nav class="d-menu">
            ${MENU.map(m => `
              <a href="${m.href || "#"}" data-key="${m.key}" class="${m.sub ? "sub " : ""}${activeKey(active) === m.key ? "on" : ""}"
                 ${m.pc ? `data-pc="${m.pc}"` : ""}>${ICONS[m.icon]}${m.label}</a>`).join("")}
          </nav>
          <div class="d-foot">
            <button class="btn-sysq" type="button">시스템문의</button>
            <span class="tel">02-****-**** · 정산 문의는 재무팀</span>
          </div>
        </aside>`;
      app.appendChild(back);
      back.addEventListener("click", (e) => {
        if (e.target === back) back.classList.remove("open");
        const a = e.target.closest("a[data-pc]");
        if (a) { e.preventDefault(); alert(a.dataset.pc); }
      });
      back.querySelector(".btn-sysq").onclick = () =>
        alert("시스템문의: 02-****-**** (데모)\n영수증·정산 문의는 PC AXE-acc › 간편정산을 이용하세요.");
    }
    document.getElementById("mMenuBtn").onclick = () => back.classList.add("open");

    const tabs = [
      ["home", "index.html", "홈"],
      ["receipts", "receipts.html", "영수증"],
      ["capture", "capture.html", "촬영"],
      ["docs", "docs.html", "문서함"],
      ["schedule", "schedule.html", "일정"]
    ];
    document.querySelector(".tabbar").innerHTML = tabs.map(([k, href, label]) => {
      if (k === "capture")
        return `<a href="${href}" class="${active === k ? "on" : ""}"><span class="cam-fab">${ICONS.camera}</span>${label}</a>`;
      return `<a href="${href}" class="${active === k ? "on" : ""}">${ICONS[k]}${label}</a>`;
    }).join("");
  }

  /* 탭 active → 드로어 강조 항목 매핑 */
  function activeKey(active) {
    return { home: "home", receipts: "receipts", capture: "capture", docs: "docs", schedule: "schedule" }[active] || "";
  }

  /* 그룹 배지/도트 색 */
  function groupDot(g) {
    const G = window.SKD.GROUPS[g];
    return `<span class="cat"><i style="background:${G.hex}"></i>${G.name}</span>`;
  }

  return { chrome, groupDot, ICONS, WING };
})();
