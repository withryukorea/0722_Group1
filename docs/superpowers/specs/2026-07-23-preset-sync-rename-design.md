# 정산단위 데이터 동기화 + "정산 단위/일정 설정" 명칭 변경 — 설계

날짜: 2026-07-23 · 승인: 사용자 (반영 방식 = 서버 우선+데모 폴백, 대전 출장 시드 추가 = 예)

## 배경

정산단위 설정(quick-presets.html)에서 저장한 내용은 서버 `/api/presets`(in-memory,
`fixtures/presets.json` 시드)에 반영되며, 대부분의 화면(업로드·매칭·전표·법인카드·예산·모바일
일정/예산·대시보드 "한도·프리셋" 게이지)은 이미 이 API를 읽는다.

**미반영 지점** — 서버가 켜져 있어도 내장 데모 데이터(`quick-data.js`의 `SKD.TRIPS`)를 그리는 곳:

1. `eaccounting/quick-dashboard.html` 하단 "출장 게이지" 카드 (주석: "데모 기준 유지")
2. `eaccounting/m/index.html` 하단 "출장비 기준 대비 사용" 위젯

또한 데모 TRIPS에 있던 "대전 연구원 방문(2026-07-28~29, 예정)"이 서버 시드에 없어
실데이터 화면에는 예정 일정이 보이지 않는다.

## 결정 사항

### 1. 출장 게이지 2곳 서버 우선 전환

- 서버 연결 시: `/api/presets?type=TRIP&active=true` 로 TRIP 정산단위를 받아
  이름·기간·상태 배지(예정/진행중/완료, `SKD.TODAY` 기준)·`usage.usedKRW / rules.limitKRW`
  게이지를 렌더. 예정 출장도 표시(일정 설정 개념에 부합).
- 서버 미연결 시: 기존 데모 렌더(D.TRIPS) 그대로 폴백 — 기능 제거 없음(추가-only).
- 다른 화면들이 이미 쓰는 "서버 우선 + 폴백" 패턴과 동일.

### 2. 명칭 변경 "정산단위 설정" → "정산 단위/일정 설정"

- `eaccounting/js/layout.js` 간편정산 SNB 라벨
- `eaccounting/quick-presets.html` `<title>`·페이지 제목(h2)·`renderChrome` active/breadcrumb·서버 미연결 안내문
- SNB 라벨과 renderChrome active 는 정확히 일치해야 메뉴 하이라이트 유지.
- 데이터 객체 명칭("정산단위")은 그대로 둔다 — 화면/메뉴 이름만 변경.

### 3. 대전 연구원 방문 TRIP 시드 추가 (fixtures/presets.json)

- `ps_daejeon_trip`, 2026-07-28~29, KR, 1명, source "employee".
- 일당 한도 155,000원 = 국내 일당 35,000 + 숙박 120,000 (travel-policy TEAM_MEMBER,
  1박 기준 — 서버 `policyDailyCap` 산식과 동일).
- matchKeywords ["대전"] → 기간 내 대전 결제 건 자동 추천.

## 범위 제외 (YAGNI)

- m/index "카테고리별 사용 현황" 위젯: 영수증 기반이며 화면에 "데모 데이터 기준" 라벨이 이미
  있음 — 정산단위 정보가 아니므로 이번 범위에서 제외.
- 폴백 경로에서만 D.TRIPS 를 쓰는 화면(quick-settlement, m/schedule, m/receipts,
  quick-match 상세)은 이미 올바른 구조 — 변경 없음.
- API/스키마 변경 없음 → docs/02-API-CONTRACT.md 수정 불필요.

## 검증

서버 부팅(`cd server && npm start`) → `GET /api/presets` 에 대전 출장 포함 6건 확인 →
quick-dashboard.html / m/index.html / quick-presets.html 200 응답 및 스크립트 오류 없는지 확인.
