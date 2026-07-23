# 시제품버전#2 설계: "찍으면 끝"을 머지한 새로운 E-acc

2026-07-22 · 작성: ramiremilife-a (+ Claude) · 작업 브랜치: `Main_2200_v2`

> 2026-07-23 운영 보정: 실제 영수증 업로드는 `ocrMode:"real"` 성공 건만 저장한다. API/OCR 실패 시 데모키·SKD 내장 데이터로 전환하지 않으며 오류/빈 상태를 표시한다. 상세 계약은 `sot/05_api.md`가 우선한다.

## 배경

시제품#1까지는 "찍으면 끝"(design/)과 Mock E-Accounting(eaccounting/)을 별개 솔루션으로 개발했다.
프로젝트 컨셉이 **"새로운 E-acc 만들기(E-acc 개선 과제)"**로 바뀌어, 두 결과물을 하나의 E-acc로 통합한다.

## 확정된 결정사항

| 결정 | 내용 |
|---|---|
| 베이스 | **E-acc(eaccounting/)의 채름·디자인 시스템**을 기준으로 시제품#1 컨셉을 머지 |
| 모바일 | **같은 DB(:4000 서버), 다른 창** — PC 화면 축소판이 아니라 모바일에 필요한 기능만 탑재 |
| 메뉴 배치 | GNB에 **신규 톱메뉴 "간편정산"** 추가 (기존 메뉴 구조 변경 없음) |
| 백엔드 | main의 **Preset 엔진**(4181954)을 Main_2200_v2에 머지해 그대로 사용 (완료: f92daea 시점) |

## 아키텍처

```
              하나의 서버 · 하나의 인메모리 DB (Express :4000)
                    /api/receipts · /api/match · /api/vouchers · /api/presets
                          ▲                              ▲
   ┌──────────────────────┴──────┐        ┌──────────────┴──────────────┐
   │ 모바일 E-acc  /m/           │        │ PC E-acc  /                 │
   │ (별도 창, 촬영·확인 중심)   │        │ (기존 채름 + 간편정산 메뉴) │
   │ 홈·촬영·영수증함·일정       │        │ 업로드·매칭·정산전표·대시보드│
   └─────────────────────────────┘        └─────────────────────────────┘
```

- 서버는 `eaccounting/`를 루트(`/`)로 정적 서빙 중이므로 `eaccounting/m/`은 **서버 수정 없이** `/m/`으로 서빙된다.
- 모바일에서 올린 영수증과 PC에서 보는 영수증은 같은 store — "같은 DB, 다른 창".

## PC 화면 4종 (design/screens/pc → eaccounting/)

`mydocs-all.html` 복사 → `<main class="content">` 교체 → `renderChrome()` 인자 갱신 (CLAUDE.md 규칙).

| 원본 (시제품#1) | 새 파일 | 사이드바 메뉴 | 핵심 API |
|---|---|---|---|
| pc/upload.html | quick-upload.html | 📸 영수증 업로드 | POST /api/receipts (multipart 이미지, 실제 OCR 전용) |
| pc/expenses.html | quick-match.html | 🔗 자동매칭 | GET /api/receipts, POST /api/match, PATCH /api/receipts/:id |
| pc/settlement.html | quick-settlement.html | 🧾 정산·전표 생성 | POST /api/vouchers/preview, POST /api/vouchers |
| pc/index.html | quick-dashboard.html | 📊 분석 대시보드 | GET /api/receipts·transactions·presets |

- 생성된 전표는 기존 `/api/vouchers`로 접수 → **나의 문서함(mydocs-all)에서 그대로 조회**된다 (통합 데모 포인트).
- Receipt의 `suggestedPresetId`·`checks[]`·`vat` 등 Preset 엔진 확장 필드를 매칭 화면에서 노출한다.

## 모바일 화면 4종 (design/screens/mobile → eaccounting/m/)

"SK e-Accounting 모바일"로 리브랜딩. 모바일 필요 기능만:

| 화면 | 기능 (모바일 한정) |
|---|---|
| m/index.html 홈 | 오늘 요약, 촬영 바로가기, 매칭 상태 알림 |
| m/capture.html 촬영 | 카메라 캡처(`<input capture>`) → POST /api/receipts → OCR 결과 확인 |
| m/receipts.html 영수증함 | 내 영수증 목록 + 매칭/전표 상태 |
| m/schedule.html 일정 | 출장(TRIP Preset) 일정 조회 위주로 간소화 |

- 전표 생성·상신은 모바일에 넣지 않고 "PC E-acc에서 진행" 안내만 표시.
- 스타일: 시제품#1 `mobile.css` 기반을 `m/` 아래로 가져오되 컬러 토큰을 E-acc(common.css)와 통일.

## 공유 파일(P1 소유) 변경 정책 — 추가만, 수정 없음

- `js/layout.js`: `EACC.topLinks`에 `'간편정산'` 항목 + `EACC.sidebars['간편정산']` 추가. 기존 항목 불변.
- `css/common.css`: 수정 금지. 신규 스타일은 `css/quick.css`(PC)·`m/mobile.css`(모바일)로 분리.
- `server/`: 수정 불필요 (정적 서빙이 m/을 이미 커버). 필요해지면 최소 추가 후 팀 공유.

## 데모 시나리오 (검증 기준)

1. 모바일(/m/)에서 영수증 촬영 → OCR 결과 확인
2. PC 간편정산 > 자동매칭에서 카드내역과 매칭 확인 (score·Preset 추천 표시)
3. 정산·전표 생성 → 상신
4. 나의 문서함에서 전표·증빙(📎) 확인

검증: `cd server && npm start` 부팅 후 위 4단계 수동 확인. (테스트 스위트 없음 — 프로젝트 관례)

## 브랜치 전략

- 작업·푸시는 `Main_2200_v2`로만 (main 푸시 금지). 푸시 전 pull.
- main의 신규 커밋은 수시로 Main_2200_v2에 머지(이번: 88a72b0→f92daea ff). 최종적으로 동료가 Main_2200_v2 → main 머지백 예정.

## 범위 제외 (YAGNI)

- `design/` 폴더 삭제·수정 (v1 보존용으로 동결)
- 로그인/권한, 실 OCR 키 주입, E-acc 기존 화면 리디자인
- 모바일에서의 전표 생성/상신 기능
