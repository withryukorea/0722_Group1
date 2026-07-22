# Mock e-Accounting (가짜 이어카운팅)

정적 HTML/CSS/JS — 빌드 없이 브라우저에서 파일을 바로 열면 동작합니다.

## 현재 화면 분담

| 화면 | 파일 | 담당 |
|------|------|------|
| 메인(접속 화면) | `index.html` (예정) | 다른 툴 |
| 법인카드 > 법인카드 정산 | `card-settlement.html` (예정) | 다른 툴 |
| 나의 문서함 > 결재문서 > 전체조회 | `mydocs-all.html` | Claude ✅ |

## 공용 파일 (충돌 방지를 위해 소유자만 수정)

- `css/common.css` — 디자인 시스템(색/헤더/사이드바/버튼/테이블/필터). 소유: Claude
- `js/layout.js` — 상단 헤더(GNB)·사이드바(SNB)·브레드크럼 렌더러. 소유: Claude

## 새 화면 추가하는 법 (3단계)

1. `mydocs-all.html`을 복사해서 새 파일 생성
2. `<main class="content">` 안의 내용만 교체
3. 하단 `renderChrome({...})` 호출의 `top`(상단 메뉴명) / `active`(사이드바 활성 항목) / `breadcrumb`만 수정
   - 사이드바 구성이 새로운 메뉴면 `js/layout.js`의 `EACC.sidebars`에 항목 추가

## 다른 툴이 만든 화면과 합칠 때

1. 파일을 이 폴더(`eaccounting/`)에 넣는다 (예: `index.html`, `card-settlement.html`)
2. `js/layout.js`의 `EACC.topLinks`에서 파일명만 맞춰준다 → 모든 화면의 상단 메뉴 링크가 한 번에 연결됨
3. (권장) 다른 툴에게 "`eaccounting/css/common.css`의 클래스를 사용해서 만들어줘"라고 요청하면 화면 톤이 자동으로 통일됨

## 디자인 토큰 (css/common.css 상단 :root)

- 헤더 남색 `--navy: #262b40` / 포인트 핑크 `--pink: #ee3d6d` / 본문 배경 `--bg: #eef0f4`
- 활성 상단 메뉴: `.top-item.active` (핑크 칩) / 조회 버튼: `.btn-search` / 목록: `table.grid`
