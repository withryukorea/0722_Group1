# 시제품#2: E-acc 통합 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시제품#1("찍으면 끝")의 PC 4화면·모바일 4화면을 E-acc(eaccounting/) 안으로 머지해, 하나의 서버(:4000)·하나의 DB로 동작하는 "새로운 E-acc" 초기 통합 버전을 만든다.

**Architecture:** PC는 E-acc 채름(renderChrome) 안에 신규 톱메뉴 "간편정산" + `quick-*.html` 4장으로 포팅. 모바일은 `eaccounting/m/`에 별도 창(전용 채름)으로 편입 — 같은 서버가 정적 서빙(`/m/`), 같은 `/api/*` 사용.

> 2026-07-23 변경: 아래 초기 계획의 자동 데모키·SKD 폴백 단계는 폐기됐다. 실제 영수증·금액 화면은 API/OCR 실패를 샘플 성공으로 바꾸지 않는다. 기존 데모는 별도 `/api/receipts/demo`를 사용자가 선택할 때만 유지하며 `sot/05_api.md` 계약을 따른다.

**Tech Stack:** 정적 HTML/CSS/JS (빌드 없음), Express :4000 (수정 없음), Preset 엔진 API (`/api/receipts`, `/api/match`, `/api/vouchers`, `/api/presets`).

**Spec:** [docs/superpowers/specs/2026-07-22-eacc-v2-integration-design.md](../specs/2026-07-22-eacc-v2-integration-design.md)

**검증 원칙:** 테스트 스위트 없음(프로젝트 관례). 각 태스크는 ①서버 부팅 ②`curl`/브라우저로 해당 화면·API 확인 ③커밋. 서버 실행: `cd server; npm start` (이미 떠 있으면 재사용).

**소유권 규칙:** `js/layout.js`는 추가만(기존 키 불변). `css/common.css` 수정 금지. `server/` 수정 금지.

---

### Task 1: 공유 브리지 자산 (quick.css · quick-data.js · layout.js 메뉴)

**Files:**
- Create: `eaccounting/css/quick.css` — 시제품#1 콘텐츠 스타일(sk-theme.css + pc.css의 .card/.badge/.chip/.dropzone/.grid/.pipeline/.preset-why 등)을 E-acc 콘텐츠 영역용으로 이식. `.topbar`/페이지 배경 등 채름 관련 규칙은 제외(E-acc 채름이 대체). 색 토큰은 sk-theme 값을 유지하되 `--sk-red`는 common.css의 SK 레드와 동일 계열 확인.
- Create: `eaccounting/js/quick-data.js` — `design/components/data.js` 전체 복사(`window.SKD`). 수정 2가지: ① `imgUrl()` 등 이미지 경로가 `../../data_sample/…` 기준이면 `data_sample/…`(eaccounting 루트 서빙 기준 `/data_sample`은 서버가 서빙 안 하므로) → **이미지 폴백은 null 허용**으로 완화, ② 파일 첫 줄 주석에 원본 경로 명시.
- Modify: `eaccounting/js/layout.js:16-24` (topLinks), `:26-60` (sidebars) — **추가만**.

- [ ] **Step 1: layout.js에 간편정산 메뉴 추가**

`EACC.topLinks`의 `'법인카드'` 항목 **앞**에 추가:

```js
'간편정산': 'quick-upload.html',
```

`EACC.sidebars`에 추가:

```js
'간편정산': {
  title: '간편정산', titleIcon: '⚡',
  items: [
    { label: '영수증 업로드', icon: '📸', href: 'quick-upload.html' },
    { label: '자동매칭', icon: '🔗', href: 'quick-match.html' },
    { label: '정산·전표 생성', icon: '🧾', href: 'quick-settlement.html' },
    { label: '분석 대시보드', icon: '📊', href: 'quick-dashboard.html' },
    { label: '모바일에서 촬영', icon: '📱', href: 'm/index.html' },
  ],
},
```

- [ ] **Step 2: quick-data.js 생성** — `design/components/data.js` 복사 후 위 수정 적용
- [ ] **Step 3: quick.css 생성** — sk-theme.css(토큰·배지·칩·카드)과 pc.css(그리드·드롭존·파이프라인·테이블 보조) 중 콘텐츠 규칙만 이식, 셀렉터는 원본 클래스명 유지(포팅 화면 마크업 재사용 위해)
- [ ] **Step 4: 검증** — `cd server; npm start` 후 `http://localhost:4000/mydocs-all.html` 열어 GNB에 "간편정산" 메뉴·드롭다운 5항목 확인 (링크 404는 아직 정상)
- [ ] **Step 5: Commit** — `feat(v2): 간편정산 메뉴 + quick 브리지 자산(css/data)`

### Task 2: quick-upload.html (영수증 업로드)

**Files:**
- Create: `eaccounting/quick-upload.html` — 셸은 `mydocs-all.html` 패턴, 콘텐츠는 `design/screens/pc/upload.html:13-61`(마크업) + `:65-183`(스크립트) 이식

- [ ] **Step 1: 셸 작성** — head는 `css/common.css` + `css/quick.css`, body는 `#gnb`/`.layout`/`#snb`/`main.content` 구조, 하단:

```html
<script src="js/layout.js"></script>
<script src="js/quick-data.js"></script>
<script>
renderChrome({ top:'간편정산', active:'영수증 업로드',
               breadcrumb:['메뉴','간편정산','영수증 업로드'] });
</script>
```

- [ ] **Step 2: 콘텐츠 이식** — 원본 `.page` 내부를 `main.content`로 이동, `SKP.chrome("upload")` 호출 제거(→ renderChrome), `href="expenses.html"` → `quick-match.html`
- [ ] **Step 3: 실 API 연결** — 실제 이미지 multipart 업로드만 허용하고 `ocrMode:"real"`을 검증:

```js
async function enqueueReal(file) {
  const fd = new FormData();
  fd.append('image', file);
  const r = await fetch('/api/receipts', { method:'POST', body:fd });
  const body = await r.json();
  if (!r.ok || body.ocrMode !== 'real') throw new Error(body.message || 'OCR 실패');
  return body;
}
```

실패 시 Receipt·업로드 파일을 저장하지 않고 오류와 재시도만 표시한다.
- [ ] **Step 4: 검증** — 실제 이미지 multipart 업로드 → `ocrMode:"real"`·가맹점·금액 확인 → `GET /api/receipts` 최신 행과 대시보드 통계에 같은 값 확인
- [ ] **Step 5: Commit** — `fix(v2): 간편정산 실제 OCR 전용 업로드`

### Task 3: quick-match.html (자동매칭 / 사용내역)

**Files:**
- Create: `eaccounting/quick-match.html` — 원본 `design/screens/pc/expenses.html` 이식

- [ ] **Step 1: 셸 작성** — Task 2와 동일 패턴, `renderChrome({ top:'간편정산', active:'자동매칭', breadcrumb:['메뉴','간편정산','자동매칭'] })`
- [ ] **Step 2: 콘텐츠 이식** — 원본 목록/필터 마크업 유지, 내부 링크 보정(`settlement.html`→`quick-settlement.html`, `upload.html`→`quick-upload.html`)
- [ ] **Step 3: 실 API 연결** — 로드 시:

```js
async function loadReceipts() {
  const list = await eaccApi('/api/receipts');           // GET
  const rows = list && list.length ? list : SKD.RECEIPTS; // 폴백
  render(rows);
  if (list && list.length) {
    const m = await eaccApi('/api/match', { body:{ receiptIds: list.map(r=>r.id) } });
    if (m) paintScores(m); // score≥70 자동, 40~70 확인 필요, <40 미매칭 배지
  }
}
```

Receipt 확장 필드 노출: `suggestedPresetId`(추천 프리셋명), `checks[]`(경고 배지), `vat`, `amountKRW`.
- [ ] **Step 4: 검증** — 업로드 화면에서 칩 2~3개 등록 → 자동매칭 화면에서 해당 건 + score 배지 표시 확인. `curl localhost:4000/api/receipts`로 교차 확인
- [ ] **Step 5: Commit** — `feat(v2): 간편정산 자동매칭 화면 (match API + score 배지)`

### Task 4: quick-settlement.html (정산·전표 생성)

**Files:**
- Create: `eaccounting/quick-settlement.html` — 원본 `design/screens/pc/settlement.html` 이식

- [ ] **Step 1: 셸 작성** — `active:'정산·전표 생성'`
- [ ] **Step 2: 콘텐츠 이식 + 링크 보정**
- [ ] **Step 3: 실 API 연결** — 전표 미리보기·상신:

```js
async function previewVoucher(receiptIds) {
  return await eaccApi('/api/vouchers/preview', { body:{ receiptIds } });
}
async function submitVoucher(draft) {
  const v = await eaccApi('/api/vouchers', { body: draft });
  if (v) toast(`전표 ${v.id || ''} 상신 완료 — 나의 문서함에서 확인하세요`);
  location.href = 'mydocs-all.html'; // 통합 데모 포인트
}
```

- [ ] **Step 4: 검증** — 매칭된 영수증으로 미리보기 → 상신 → `mydocs-all.html` 목록에 새 전표 등장 확인 (`curl localhost:4000/api/vouchers`)
- [ ] **Step 5: Commit** — `feat(v2): 간편정산 정산·전표 생성 (vouchers API → 나의 문서함 연동)`

### Task 5: quick-dashboard.html (분석 대시보드)

**Files:**
- Create: `eaccounting/quick-dashboard.html` — 원본 `design/screens/pc/index.html` 이식

- [ ] **Step 1: 셸 작성** — `active:'분석 대시보드'`
- [ ] **Step 2: 콘텐츠 이식** — 통계 위젯은 SKD 기반 유지, 로드 시 `GET /api/receipts`·`GET /api/transactions` 성공하면 실데이터로 집계 교체(건수·합계·매칭율), 실패 시 SKD 폴백
- [ ] **Step 3: 검증** — 화면 진입 시 카드 수치가 서버 데이터(업로드한 건수 반영)와 일치하는지 확인
- [ ] **Step 4: Commit** — `feat(v2): 간편정산 분석 대시보드`

### Task 6: 모바일 셸 (eaccounting/m/ 공통)

**Files:**
- Create: `eaccounting/m/css/mobile.css` — `design/components/mobile.css` + `sk-theme.css` 토큰 병합 복사
- Create: `eaccounting/m/js/m-chrome.js` — `design/components/mobile.js` 복사 후 리브랜딩
- Create: `eaccounting/m/js/quick-data.js` 대신 **`../js/quick-data.js` 재사용** (경로 참조)

- [ ] **Step 1: mobile.css 이식** — 원본 그대로 + sk-theme 토큰 인라인(모바일은 sk-theme.css를 별도 링크했으므로 병합), 클래스명 유지
- [ ] **Step 2: m-chrome.js 작성** — `SKM.chrome()` 브랜드 텍스트 교체:

```js
<span class="sk-logo brand" style="color:#fff">${WING}<span>SK e-Accounting <em style="color:#FFE2C7">모바일</em></span></span>
```

탭 4개(홈/촬영/영수증/일정) 유지, href는 동일 폴더 상대경로. eaccApi는 `../js/layout.js` 로드로 확보(renderChrome은 #gnb 없으면 no-op이므로 안전).
- [ ] **Step 3: 검증** — 아직 화면 없음: `curl -I localhost:4000/m/css/mobile.css` → 200 확인
- [ ] **Step 4: Commit** — `feat(v2): E-acc 모바일 셸 (m/ 채름·스타일, 같은 서버 서빙)`

### Task 7: 모바일 촬영·홈 (m/capture.html, m/index.html)

**Files:**
- Create: `eaccounting/m/capture.html` — 원본 `design/screens/mobile/capture.html` 이식
- Create: `eaccounting/m/index.html` — 원본 `design/screens/mobile/index.html` 이식

- [ ] **Step 1: capture 이식** — 스크립트/CSS 경로를 `css/mobile.css`, `js/m-chrome.js`, `../js/quick-data.js`, `../js/layout.js`로 교체. `SKM.chrome("capture", …)` 유지
- [ ] **Step 2: capture 실 API** — 촬영/선택된 파일을 multipart로:

```js
async function uploadShot(file) {
  const fd = new FormData(); fd.append('image', file);
  try {
    const res = await fetch('/api/receipts', { method:'POST', body: fd });
    if (res.ok) return showOcr(await res.json());
  } catch (e) {}
  showOcr(null); // 폴백: 기존 데모 시뮬레이션
}
```

결과 화면에 "정산·전표는 PC E-acc에서 진행하세요" 안내 문구 추가 (모바일에 전표 기능 없음 — 스펙).
- [ ] **Step 3: index(홈) 이식** — 요약 카운트를 `GET /api/receipts` 실데이터 우선으로, 촬영 바로가기 유지
- [ ] **Step 4: 검증** — 모바일 뷰포트(DevTools)로 `/m/` 진입 → 촬영 → 데모키 폴백 경로/실업로드 경로 각각 결과 표시 확인 → PC 자동매칭 화면에 같은 건 등장(같은 DB 증명)
- [ ] **Step 5: Commit** — `feat(v2): 모바일 홈·촬영 (multipart 업로드 → 같은 DB)`

### Task 8: 모바일 영수증함·일정 (m/receipts.html, m/schedule.html)

**Files:**
- Create: `eaccounting/m/receipts.html` — 원본 이식 + `GET /api/receipts` 우선(매칭 상태 배지 포함)
- Create: `eaccounting/m/schedule.html` — 원본 이식, **조회 위주 간소화**: `GET /api/presets`에서 TRIP 프리셋만 카드로 표시, 편집성 UI 제거

- [ ] **Step 1: receipts 이식·연결**
- [ ] **Step 2: schedule 이식·간소화**
- [ ] **Step 3: 검증** — 업로드한 영수증이 영수증함에 상태와 함께 뜨는지, 일정에 TRIP 프리셋(도쿄·부산)이 뜨는지 확인
- [ ] **Step 4: Commit** — `feat(v2): 모바일 영수증함·일정 (모바일 필요 기능만)`

### Task 9: 통합 검증 + 푸시

- [ ] **Step 1: 데모 시나리오 E2E** — `POST /api/reset` 후: ① /m/ 촬영(coffee) → ② PC 자동매칭 확인 → ③ 정산·전표 상신 → ④ 나의 문서함에서 전표+증빙 확인. 각 단계 스크린 확인
- [ ] **Step 2: 기존 화면 무손상 확인** — index/card-settlement/travel-*/voucher-create/mydocs-all 정상 렌더(간편정산 메뉴 추가 외 변화 없음)
- [ ] **Step 3: 푸시** — `git pull origin Main_2200_v2 --rebase` 후 `git push origin Main_2200_v2` (main 푸시 금지)

---

## Self-Review 체크

- 스펙 커버리지: PC 4화면(T2-5)·모바일 4화면(T6-8)·간편정산 메뉴(T1)·같은 DB 다른 창(T6-8 검증)·나의 문서함 연동(T4)·공유파일 추가만(T1 규칙)·브랜치 전략(T9) — 전부 태스크 존재. E-acc index 배너는 스펙에서 "(선택)" → 제외(YAGNI).
- 플레이스홀더: 없음 (이식 태스크는 원본 파일 정확 경로 + 변경분 코드 명시 방식).
- 명명 일관성: quick-upload/match/settlement/dashboard.html, m/, quick-data.js, quick.css — 태스크 간 일치.
