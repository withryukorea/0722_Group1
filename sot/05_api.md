# 5. API

## Auth Model

- 인증 없음 — 단일 사용자(`u_me`) 하드코딩. 이번 PoC 범위 밖 (`01_project_purpose.md` Non-Goals).
- Mock E-Accounting API 서버: `http://localhost:4000`.

## 두 가지 "매칭"의 구분

이 시스템엔 서로 다른 매칭이 두 개 있다. 혼동하지 않도록 API 설계에서도 분리한다.

| | 대상 | 엔드포인트 | 확정 주체 |
|---|---|---|---|
| 거래 매칭 (기존) | 영수증 ↔ 카드승인내역 | `POST /api/match` | 자동 스코어링 + 낮은 점수만 사용자 확인 |
| Preset 지정 (신규) | 영수증 ↔ Preset | `PATCH /api/receipts/:id` | 항상 사용자 (자동추천은 참고용) |

## 변경 요약 (docs/02-API-CONTRACT.md 대비)

| 변경 | 내용 |
|---|---|
| 삭제 | `POST/GET /api/trips` — `type=TRIP` Preset 생성으로 대체 |
| 삭제 | `GET /api/budgets` — `type=RECURRING` Preset의 `usage`로 대체 |
| 추가 | `POST /api/presets` — 관리자 작성(RECURRING/CAMPAIGN) 및 모바일 "출장모드 시작"(TRIP) 공용 |
| 추가 | `GET /api/presets?active=true` — 리뷰 화면 선택지 목록 + 관리자 콘솔 목록 공용 |
| 추가 | `PATCH /api/presets/:id` — 비활성화/수정 |
| 변경 | `POST /api/receipts` 응답에 `suggestedPresetId`, `checks[]` 추가 |
| 추가 | `PATCH /api/receipts/:id` — 사용자가 `presetId`·`accountCode` 확정, `vat.confirmed` 저장 |
| 변경 | `POST /api/vouchers/preview` — `receipt.presetId` 있으면 그 Preset 규칙 사용, 없으면 기존 P4 자동분류 + fallback |
| 유지 | `/api/transactions`, `/api/match`, `/api/vouchers`, `/api/fx`, `/api/approval-rules` |

## REST API 전체 (:4000)

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/transactions?status=unmatched` | 카드승인내역 목록 (기존 유지) |
| PATCH | `/api/transactions/:id` | 상태/매칭 갱신 (기존 유지) |
| POST | `/api/receipts` (multipart) | 영수증 업로드 → 크롭(원본/파생 분리)+OCR, `suggestedPresetId`·`checks[]` 포함해 반환 |
| PATCH | `/api/receipts/:id` | 사용자가 `presetId`·`accountCode`·`vat.confirmed` 확정 |
| POST | `/api/match` | body: `{receiptIds[]}` → 거래 매칭 결과 `[{receiptId, txId, score}]` |
| POST | `/api/vouchers/preview` | 매칭된 건들로 전표 초안 생성 (Preset 규칙 반영) |
| POST | `/api/vouchers` | 전표 상신 → status=submitted, Preset usage 차감 반영 |
| GET | `/api/vouchers` | 전표 목록 (관리자 화면용) |
| GET | `/api/approval-rules` | 전결규정 (Preset 없는 건의 fallback 전용) |
| POST | `/api/presets` | Preset 생성 (관리자 작성 또는 출장모드 시작) |
| GET | `/api/presets?active=true` | 활성 Preset 목록 |
| PATCH | `/api/presets/:id` | Preset 수정/비활성화 |
| GET | `/api/accounts` | 계정과목 코드표 (기존 유지) |
| GET | `/api/fx` | 환율 테이블 (기존 유지) |

## Frontend Routes

| Route | 대상 | 화면 |
|---|---|---|
| `/` (모바일) | 직원 | 출장모드 시작, 촬영, 리뷰(Preset/비목/부가세/적격증빙), 정산하기, 전표 검토·상신 |
| `/` (server/public, PC) | 관리자 | 카드내역 · 접수전표 · **Preset 탭(신규)** |
