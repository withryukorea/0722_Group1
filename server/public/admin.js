// 관리자 화면 — 카드내역과 접수 전표를 주기적으로 불러와 렌더링한다.
// 데모 중 모바일에서 전표를 상신하면 몇 초 뒤 여기 자동으로 나타난다.

const won = (n) => "₩" + Number(n || 0).toLocaleString("ko-KR");
const el = (id) => document.getElementById(id);

function statusLabel(s) {
  return { unmatched: "미매칭", matched: "매칭됨", vouchered: "전표완료" }[s] || s;
}

function txRow(t) {
  const orig =
    t.currency && t.currency !== "KRW"
      ? `<div class="orig">${t.currency} ${Number(t.amount).toLocaleString()}</div>`
      : "";
  const when = new Date(t.approvedAt).toLocaleString("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  return `
    <div class="row">
      <div>
        <div class="merchant">${t.merchant}</div>
        <div class="meta">${when} · 카드 ****${t.cardLast4}</div>
      </div>
      <div class="amt">
        <div class="krw">${won(t.amountKRW)}</div>
        ${orig}
      </div>
      <span class="badge ${t.status}">${statusLabel(t.status)}</span>
    </div>`;
}

function approvalHtml(line) {
  if (!line || !line.length) return "";
  const steps = line
    .map((name) => `<span class="step">${name}</span>`)
    .join('<span class="arrow">→</span>');
  return `<div class="approval"><span class="sub" style="color:var(--muted);font-size:12px">결재선</span> ${steps}</div>`;
}

function voucherCard(v) {
  const lines = (v.lines || [])
    .map((l) => `<div class="vline">· ${l.description || l.accountCode || ""} — ${won(l.amountKRW)}</div>`)
    .join("");
  const when = v.submittedAt
    ? new Date(v.submittedAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";
  return `
    <div class="voucher">
      <div class="vtop">
        <span class="vtitle">${v.title}</span>
        <span class="badge vouchered">${v.status}</span>
        <span class="vtotal">${won(v.totalKRW)}</span>
      </div>
      <div class="meta" style="color:var(--muted);font-size:12px;margin-top:4px">${v.id} · 상신 ${when}</div>
      ${lines}
      ${approvalHtml(v.approvalLine)}
    </div>`;
}

async function refresh() {
  try {
    const [txs, vchs] = await Promise.all([
      fetch("/api/transactions").then((r) => r.json()),
      fetch("/api/vouchers").then((r) => r.json()),
    ]);

    el("txCount").textContent = `${txs.length}건`;
    el("txList").innerHTML = txs.length
      ? txs.map(txRow).join("")
      : `<div class="empty">승인내역이 없습니다</div>`;

    el("vchCount").textContent = `${vchs.length}건`;
    el("vchList").innerHTML = vchs.length
      ? vchs.map(voucherCard).join("")
      : `<div class="empty">아직 접수된 전표가 없습니다.<br/>모바일 앱에서 전표를 상신하면 여기에 표시됩니다.</div>`;
  } catch (e) {
    el("vchList").innerHTML = `<div class="empty">서버 연결 실패: ${e.message}</div>`;
  }
}

async function resetDemo() {
  await fetch("/api/reset", { method: "POST" });
  refresh();
}

function tick() {
  el("clock").textContent = new Date().toLocaleTimeString("ko-KR");
}

setInterval(refresh, 3000); // 3초마다 자동 새로고침 (데모용)
setInterval(tick, 1000);
refresh();
tick();
