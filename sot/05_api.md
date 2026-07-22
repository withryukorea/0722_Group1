# 5. API

## Auth Model

- 인증 없음 — 단일 사용자(`u_me`) 하드코딩. 이번 PoC 범위 밖 (`01_project_purpose.md` Non-Goals).
- Mock E-Accounting API 서버: `http://localhost:4000`.

## 두 가지 "매칭"의 구분

이 시스템엔 서로 다른 매칭이 두 개 있다. 혼동하지 않도록 API 설계에서도 분리한다.

| | 대상 | 엔드포인트 | 확정 주체 |
|---|---|---|---|
| 거래 매칭 (기존) | 영수증 ↔ 카드승인내역 | `POST /api/match` | 자동 스코어링 + 낮은 점수만 사용자 확인 |
| 정산단위 지정 (신규) | 영수증 ↔ 정산단위 | `PATCH /api/receipts/:id` | 항상 사용자 (자동추천은 참고용) |

## 변경 요약 (docs/02-API-CONTRACT.md 대비)

| 변경 | 내용 |
|---|---|
| 삭제 | `POST/GET /api/trips` — `type=TRIP` 정산단위 생성으로 대체 |
| 삭제 | `GET /api/budgets` — `type=RECURRING` 정산단위의 `usage`로 대체 |
| 추가 | `POST /api/presets` — 이어카운팅 전용: 관리자 배포(RECURRING/CAMPAIGN)·직원 국내출장 생성(TRIP, 표준 기본값). 해외출장 TRIP은 품의 자동생성을 seed로 시뮬레이트. **모바일에서는 호출하지 않음** |
| 추가 | `GET /api/presets?active=true` — 모바일 리뷰 선택지·대시보드 + 이어카운팅 목록 공용 |
| 추가 | `PATCH /api/presets/:id` — 비활성화/수정 |
| 변경 | `POST /api/receipts` 응답에 `suggestedPresetId`, `checks[]` 추가 |
| 추가 | `PATCH /api/receipts/:id` — 사용자가 `presetId`·`accountCode` 확정, `vat.confirmed` 저장 |
| 변경 | `POST /api/vouchers/preview` — `receipt.presetId` 있으면 그 정산단위 규칙 사용, 없으면 기존 P4 자동분류 + fallback |
| 유지 | `/api/transactions`, `/api/match`, `/api/vouchers`, `/api/fx`, `/api/approval-rules` |

## REST API 전체 (:4000)

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/transactions?status=unmatched` | 카드승인내역 목록 (기존 유지) |
| PATCH | `/api/transactions/:id` | 상태/매칭 갱신 (기존 유지) |
| POST | `/api/receipts` (multipart) | 영수증 업로드(모바일 촬영 + 이어카운팅 PC 파일 공용) → 크롭(원본/파생 분리)+OCR, `suggestedPresetId`·`checks[]` 포함해 반환 |
| PATCH | `/api/receipts/:id` | 사용자가 `presetId`·`accountCode`·`vat.confirmed` 확정 |
| POST | `/api/match` | body: `{receiptIds[]}` → 거래 매칭 결과 `[{receiptId, txId, score}]` |
| POST | `/api/vouchers/preview` | 매칭된 건들로 전표 초안 생성 (정산단위 규칙 반영) |
| POST | `/api/vouchers` | 전표 상신 → status=submitted, 정산단위 usage 차감 반영 |
| GET | `/api/vouchers` | 전표 목록 (관리자 화면용) |
| GET | `/api/approval-rules` | 전결규정 (정산단위 없는 건의 fallback 전용) |
| POST | `/api/presets` | 정산단위 생성 (이어카운팅 전용 — 관리자 배포 / 직원 국내출장) |
| GET | `/api/presets?active=true` | 활성 정산단위 목록 |
| PATCH | `/api/presets/:id` | 정산단위 수정/비활성화 |
| GET | `/api/accounts` | 계정과목 코드표 (기존 유지) |
| GET | `/api/fx` | 환율 테이블 (기존 유지) |

## Frontend Routes

| Route | 대상 | 화면 |
|---|---|---|
| 모바일 (`app/`, `design/screens/mobile/`) | 직원 | **유입 전용**: 촬영 → 크롭확인 → 파싱확인·정산단위/비목 선택 → 저장 + 정산단위 대시보드(읽기 전용). 정산단위 생성·정산·상신 없음 |
| 이어카운팅 (`eaccounting/`) | 직원·관리자 | 정산단위 관리(생성/배포) · PC 영수증 업로드 · 매칭 화면(영수증↔카드내역, 증빙 추가·해제) · 정산(해외출장비 정산 / 법인카드 정산 등, 정산단위 지정칸 자동채움)·상신 · 문서함 |
