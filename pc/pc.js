/* PC 공통 크롬(상단 바) — SKP.chrome("dashboard"|"expenses"|"upload"|"settlement") */
window.SKP = (function () {
  const WING = `
    <svg width="30" height="22" viewBox="0 0 52 40" aria-hidden="true">
      <ellipse cx="18" cy="20" rx="16" ry="9" transform="rotate(-24 18 20)" fill="#EA002C" opacity=".92"/>
      <ellipse cx="36" cy="18" rx="13" ry="7" transform="rotate(18 36 18)" fill="#F47725" opacity=".92"/>
    </svg>`;

  function chrome(active) {
    const D = window.SKD;
    const menus = [
      ["dashboard", "index.html", "분석 대시보드"],
      ["expenses", "expenses.html", "사용내역"],
      ["upload", "upload.html", "영수증 업로드"],
      ["settlement", "settlement.html", "정산·전표"]
    ];
    document.querySelector(".topbar").innerHTML = `
      <div class="tb-in">
        <a href="index.html" class="sk-logo" title="대시보드로 이동" style="text-decoration:none;color:inherit;cursor:pointer">${WING}<span class="brand">찍으면 <em>끝</em> <span style="font-weight:600;color:var(--ink-3);font-size:12px">| SK 출장·경비 자동정산</span></span></a>
        <nav>${menus.map(([k, href, label]) =>
          `<a href="${href}" class="${active === k ? "on" : ""}">${label}</a>`).join("")}</nav>
        <div class="tb-user">${D.USER.name} · ${D.USER.team}<br>${D.TODAY.replace(/-/g, ".")} 기준</div>
        <div class="tb-avatar">홍</div>
      </div>
      <div class="gradbar"></div>`;
  }

  return { chrome, WING };
})();
