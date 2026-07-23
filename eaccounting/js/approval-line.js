/* ============================================================
   결재선 변경 팝업 (공용 컴포넌트)
   - 사용: 결재선 변경 버튼에서 openApprovalLine() 호출
   - 적용 시: 화면의 table.appr(기안/검토x3/승인)을 채우고
     window._apvLine 에 저장 → 각 화면 submit이 이 값을 우선 사용
   ============================================================ */
const APV_DEFAULT_LINE = [{ type: '승인', name: '김현준 기술위원', dept: '전력사업기획팀' }];
window._apvLine = null;          // 적용된 수동 결재선 (null이면 화면의 자동 규칙 사용)

let _apvDraft = [];              // 팝업 안에서 편집 중인 결재선
let _apvTeam = '전력사업기획팀'; // 현재 선택된 팀
let _apvOpenSet = new Set(['SKㅇㅇ', '사장', '전력사업본부', '전력사업기획실']);  // 펼친 노드

function openApprovalLine() {
  apvInject();
  _apvDraft = (window._apvLine || APV_DEFAULT_LINE).map(x => ({ ...x }));
  apvRenderTree();
  apvSelectTeam(_apvTeam);
  apvRenderLine();
  document.getElementById('apv-modal').style.display = 'flex';
}
function apvClose() { document.getElementById('apv-modal').style.display = 'none'; }

/* ── 모달 DOM 주입 (1회) ── */
function apvInject() {
  if (document.getElementById('apv-modal')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
  <div class="modal-back" id="apv-modal" style="display:none;">
    <div class="modal apv">
      <div class="apv-head">
        <span class="apv-title">결재선 변경</span>
        <span class="apv-badge">ⓘ 기안자는 자동으로 추가됩니다.</span>
        <span class="apv-hsearch"><input id="apv-q" placeholder="구성원 검색" oninput="apvRenderMembers()"> 🔍</span>
        <span class="apv-x" onclick="apvClose()">✕</span>
      </div>
      <div class="apv-body">
        <div class="apv-left">
          <div class="apv-comp">${ORG_COMPANY}</div>
          <div class="apv-dsearch"><input id="apv-dq" placeholder="부서 검색" oninput="apvRenderTree()"> 🔍</div>
          <div class="apv-tree" id="apv-tree"></div>
        </div>
        <div class="apv-mid">
          <div class="apv-tabs">
            <span class="apv-tab on" id="apv-tab-team" onclick="apvSelectTeam(_apvTeam)">전력사업기획팀</span>
            <span class="apv-tab" id="apv-tab-my" onclick="apvShowMyTab()">나의 결재선</span>
            <span class="apv-cnt">총 <b id="apv-cnt">0</b></span>
          </div>
          <div class="apv-members" id="apv-members"></div>
        </div>
        <div class="apv-right">
          <div class="apv-rhead">결재선</div>
          <button class="btn btn-line apv-reset" onclick="apvReset()">초기화(정산상태)</button>
          <div class="apv-line" id="apv-line"></div>
          <button class="btn btn-line apv-savemy" onclick="apvSaveMy()">나의 결재선 등록</button>
        </div>
      </div>
      <div class="apv-foot">
        <button class="btn btn-dark" onclick="apvApply()">적용</button>
        <button class="btn btn-line" onclick="apvClose()">취소</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);
}

/* ── 좌: 조직도 트리 ── */
function apvRenderTree() {
  const q = (document.getElementById('apv-dq')?.value || '').trim();
  const box = document.getElementById('apv-tree');
  if (q) {  // 부서 검색: 일치하는 팀만 평면 목록으로
    box.innerHTML = orgLeafTeams().filter(t => t.includes(q)).map(t =>
      `<div class="apv-node leaf ${t === _apvTeam ? 'sel' : ''}" style="padding-left:10px;" onclick="apvSelectTeam('${t}')">${t}</div>`
    ).join('') || '<div class="apv-none">검색 결과가 없습니다.</div>';
    return;
  }
  const html = (node, depth) => {
    const kids = node.children || [];
    const open = _apvOpenSet.has(node.name);
    let s = '';
    if (kids.length) {
      s += `<div class="apv-node" style="padding-left:${depth * 14}px;" onclick="apvToggle('${node.name}')">
              <span class="tg">${open ? '−' : '+'}</span> ${node.name}</div>`;
      if (open) s += kids.map(c => html(c, depth + 1)).join('');
    } else {
      s += `<div class="apv-node leaf ${node.name === _apvTeam ? 'sel' : ''}" style="padding-left:${depth * 14 + 16}px;"
              onclick="apvSelectTeam('${node.name.replace(/'/g, "\\'")}')">${node.name}</div>`;
    }
    return s;
  };
  box.innerHTML = html(ORG_TREE, 0);
}
function apvToggle(name) {
  _apvOpenSet.has(name) ? _apvOpenSet.delete(name) : _apvOpenSet.add(name);
  apvRenderTree();
}

/* ── 중: 구성원 목록 ── */
function apvSelectTeam(team) {
  _apvTeam = team;
  document.getElementById('apv-tab-team').textContent = team;
  document.getElementById('apv-tab-team').classList.add('on');
  document.getElementById('apv-tab-my').classList.remove('on');
  apvRenderTree();
  apvRenderMembers();
}
function apvRenderMembers() {
  const q = (document.getElementById('apv-q')?.value || '').trim();
  const members = orgMembers(_apvTeam).filter(m => !q || m.name.includes(q));
  document.getElementById('apv-cnt').textContent = members.length;
  const inLine = name => _apvDraft.some(x => x.name === name);
  document.getElementById('apv-members').innerHTML = `
    <table class="apv-tbl">
      <tr><th style="width:40px;">No.</th><th>성명</th><th style="width:64px;">직책</th>
          <th style="width:90px;">직위</th><th>직무</th><th style="width:70px;">추가</th></tr>
      ${members.map((m, i) => {
        const full = `${m.name} ${m.role}`;
        const btn = m.me || inLine(full) ? '' :
          `<button class="apv-add" onclick="apvAdd('${m.name}','${m.role}')">추가</button>`;
        return `<tr><td>${i + 1}</td><td>${m.name}</td><td>${m.role}</td><td>${m.grade}</td><td></td><td>${btn}</td></tr>`;
      }).join('')}
    </table>`;
}
function apvShowMyTab() {
  document.getElementById('apv-tab-team').classList.remove('on');
  document.getElementById('apv-tab-my').classList.add('on');
  const saved = JSON.parse(localStorage.getItem('eacc_my_line') || 'null');
  document.getElementById('apv-cnt').textContent = saved ? saved.length : 0;
  document.getElementById('apv-members').innerHTML = saved ? `
    <div class="apv-myline">
      ${saved.map(x => `<div class="apv-item"><span class="h">≡</span><span class="t">${x.type}</span><b>${x.name}</b></div>`).join('')}
      <button class="btn btn-dark" style="margin-top:12px;" onclick="apvUseMy()">이 결재선 사용</button>
    </div>` :
    '<div class="apv-none">등록된 나의 결재선이 없습니다.<br>결재선을 구성한 뒤 [나의 결재선 등록]을 눌러 저장하세요.</div>';
}
function apvUseMy() {
  const saved = JSON.parse(localStorage.getItem('eacc_my_line') || 'null');
  if (saved) { _apvDraft = saved.map(x => ({ ...x })); apvRenderLine(); apvSelectTeam(_apvTeam); }
}

/* ── 우: 결재선 편집 ── */
function apvAdd(name, role) {
  const full = `${name} ${role}`;
  const hasApprover = _apvDraft.some(x => x.type === '승인');
  const entry = { type: hasApprover ? '검토' : '승인', name: full, dept: _apvTeam };
  if (entry.type === '검토') {
    if (_apvDraft.filter(x => x.type === '검토').length >= 3) { alert('검토자는 최대 3명까지 지정할 수 있습니다.'); return; }
    const ai = _apvDraft.findIndex(x => x.type === '승인');
    _apvDraft.splice(ai === -1 ? _apvDraft.length : ai, 0, entry);
  } else {
    _apvDraft.push(entry);
  }
  apvRenderLine(); apvRenderMembers();
}
function apvRemove(i) { _apvDraft.splice(i, 1); apvRenderLine(); apvRenderMembers(); }
function apvReset() { _apvDraft = APV_DEFAULT_LINE.map(x => ({ ...x })); apvRenderLine(); apvRenderMembers(); }
function apvSaveMy() {
  localStorage.setItem('eacc_my_line', JSON.stringify(_apvDraft));
  alert('나의 결재선으로 등록되었습니다.');
}
function apvRenderLine() {
  document.getElementById('apv-line').innerHTML = _apvDraft.map((x, i) => `
    <div class="apv-item">
      <span class="h">≡</span><span class="t">${x.type}</span><b>${x.name}</b>
      <span class="rm" onclick="apvRemove(${i})">⊗</span>
    </div>`).join('') || '<div class="apv-none">결재선이 비어 있습니다.<br>구성원을 [추가]하세요.</div>';
}

/* ── 적용 ── */
function apvApply() {
  if (!_apvDraft.some(x => x.type === '승인')) { alert('승인자가 필요합니다. 구성원을 추가해 주세요.'); return; }
  window._apvLine = _apvDraft.map(x => ({ ...x }));
  apvApplyToTable(window._apvLine);
  apvClose();
}
function apvApplyToTable(line) {
  const tbl = document.querySelector('table.appr');
  if (!tbl || tbl.rows.length < 2) return;
  const cells = tbl.rows[1].cells;   // [기안, 검토1, 검토2, 검토3, 승인]
  const revs = line.filter(x => x.type === '검토');
  const appr = line.find(x => x.type === '승인');
  for (let i = 1; i <= 3; i++) {
    cells[i].innerHTML = revs[i - 1] ? `${revs[i - 1].dept}<br><b>${revs[i - 1].name}</b>` : '';
  }
  cells[4].innerHTML = appr ? `${appr.dept}<br><b>${appr.name}</b>` : '';
}

/* 수동 결재선(적용된 경우)의 이름 배열 — 각 화면 submit에서 사용 */
function apvLineNames() {
  return window._apvLine ? window._apvLine.map(x => x.name) : null;
}

/* 미리보기 편의: ?apv=1 이면 로드 직후 팝업 자동 오픈 (스크린샷/시연용) */
if (new URLSearchParams(location.search).get('apv')) {
  window.addEventListener('load', () => setTimeout(openApprovalLine, 100));
}
