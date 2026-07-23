/* 모바일 AXE-acc 공통 크롬(헤더 + 하단 탭바) — 원본: design/components/mobile.js (시제품#1)
   각 화면에서 SKM.chrome("home"|"capture"|"receipts"|"schedule", sub) 호출.
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
      <ellipse cx="36" cy="18" rx="13" ry="7" transform="rotate(18 36 18)" fill="#FFD3A6" opacity=".95"/>
    </svg>`;

  const ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
    receipts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12v20l-2-1.5L14 22l-2-1.5L10 22l-2-1.5L6 22z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>',
    docs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/></svg>',
    schedule: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>'
  };

  function chrome(active, sub) {
    const D = window.SKD;
    document.querySelector(".app-head").innerHTML = `
      <div class="row1">
        <span class="sk-logo brand" style="color:#fff">${WING}<span>AX e-ACC <em style="color:#FFE2C7">모바일</em></span></span>
        <div class="who">${D.USER.name} · ${D.USER.team}<br>${D.TODAY.replace(/-/g, ".")} 기준</div>
      </div>
      ${sub ? `<div class="sub">${sub}</div>` : ""}`;

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

  /* 그룹 배지/도트 색 */
  function groupDot(g) {
    const G = window.SKD.GROUPS[g];
    return `<span class="cat"><i style="background:${G.hex}"></i>${G.name}</span>`;
  }

  return { chrome, groupDot, ICONS, WING };
})();
