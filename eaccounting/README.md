# Mock e-Accounting 직원용 화면 (가짜 이어카운팅)

정적 HTML/CSS/JS. **서버(P1)와 통합되어 있고, 서버 없이도 단독 동작합니다.**

## 실행 (두 가지 모드)

| 모드 | 방법 | 데이터 |
|------|------|--------|
| **통합 모드 (권장, 시연용)** | `cd server && npm install && npm start` → http://localhost:4000/eaccounting/ | 서버 API(`/api/...`) 실데이터. 전표작성 → 실제 상신 → 나의 문서함/관리자 화면에 반영 |
| 단독 모드 (개발/백업용) | HTML 파일을 브라우저로 바로 열기 | 내장 목데이터(js/*-data.js)로 폴백 |

화면이 열릴 때 `/api/...` → `localhost:4000` 순으로 시도하고, 둘 다 실패하면 자동으로 내장 목데이터를 씁니다 (`js/layout.js`의 `eaccApi`). **시연 중 서버가 죽어도 화면은 계속 뜹니다.**

## 화면 목록

| 화면 | 파일 | API 연동 |
|------|------|----------|
| 메인(접속 화면) | `index.html` | 미정산 건수 카운트 |
| 법인카드 > 법인카드 정산 | `card-settlement.html` | 카드내역 조회(GET /api/transactions), 전표작성 및 미리보기 |
| 나의 문서함 > 결재/기안문서 조회 | `mydocs-all.html` | 상신된 전표 조회(GET /api/vouchers), 검색·결재 데모 |
| 법인카드전표 미리보기(기안) 팝업 | `voucher-preview.html` | 카드내역·상세정산·기안(POST /api/vouchers) 연동 |

## 역할 구분 (server/public 관리자 화면과의 관계)

- **`eaccounting/` (여기)** = 직원이 보는 "진짜 이어카운팅처럼 생긴" 화면 — 데모의 회사 시스템 역할
- **`server/public/` (P1)** = 관리자/데모 컨트롤 화면 — 데모 리셋 버튼, 접수 전표 확인용
- 같은 서버(:4000)가 둘 다 서빙하고 같은 API 데이터를 본다. 중복 아님.

## 공용 파일 (소유자만 수정)

- `css/common.css` — 디자인 시스템(색/헤더/사이드바/버튼/테이블/필터)
- `js/layout.js` — 상단 헤더(GNB)·사이드바(SNB)·브레드크럼 렌더러 + `eaccApi` 헬퍼
- `css/mydocs.css` — 나의 문서함 전용 반응형·상태 UI. 소유: Codex
- `css/voucher-preview.css` — 전표 미리보기 팝업 전용 UI. 소유: Codex
- `js/mydocs.js` — 문서함 API 연동·검색·결재 데모 로직. 소유: Codex
- `js/voucher-preview.js` — 카드·정산 라인 렌더링과 전표 기안 로직. 소유: Codex

## 새 화면 추가하는 법 (3단계)

1. `mydocs-all.html`을 복사해서 새 파일 생성
2. `<main class="content">` 안의 내용만 교체
3. 하단 `renderChrome({...})` 호출의 `top`(상단 메뉴명) / `active`(사이드바 활성 항목) / `breadcrumb`만 수정
   - 사이드바 구성이 새로운 메뉴면 `js/layout.js`의 `EACC.sidebars`에 항목 추가
   - 데이터가 필요하면 `await eaccApi('/api/...')` 사용 (실패 시 폴백 목데이터 준비 권장)

## 디자인 토큰 (css/common.css 상단 :root)

- 헤더 남색 `--navy: #262b40` / 포인트 핑크 `--pink: #ee3d6d` / 본문 배경 `--bg: #eef0f4`
- 활성 상단 메뉴: `.top-item.active` (핑크 칩) / 조회 버튼: `.btn-search` / 목록: `table.grid`
