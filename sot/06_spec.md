# 6. SPEC

## Core Product

시스템은 다음 end-to-end 흐름을 지원해야 한다:

1. 관리자가 Preset(RECURRING/CAMPAIGN)을 작성 → 즉시 배포.
2. 직원이 출장모드 시작 → TRIP Preset 자동 생성.
3. 직원이 영수증 촬영 → 원본 보존 + 크롭 + OCR.
4. 직원이 Preset·비목을 확정 (자동추천 참고, 최종 선택은 사용자).
5. (Optional) 부가세 확인/수정, 적격증빙 경고 확인.
6. 직원이 "정산하기" → 영수증-카드내역 거래 매칭 (기존 로직).
7. 전표 자동생성 (Preset 규칙 반영) → 직원 검토 → 상신.
8. 관리자 콘솔에 전표·결재선·Preset 사용량이 즉시 반영.

## Functional Spec — 핵심 (반드시 만든다)

### Preset 엔진

- Preset 엔티티: `type`(TRIP/RECURRING/CAMPAIGN), `allowedAccountCodes[]`, `limitKRW`/`limitPeriod`, `approvalLine`, `descriptionTemplate`, `matchKeywords`, `usage`.
- 관리자 콘솔에서 Preset 작성 폼 (RECURRING/CAMPAIGN) 및 목록/비활성화.
- 모바일 "출장모드 시작"이 동일 API로 TRIP Preset 생성.
- 영수증 리뷰 화면에서 활성 Preset 목록을 후보로 제시, 자동추천은 하이라이트만.
- `allowedAccountCodes.length > 1`일 때만 비목 선택 UI 노출.

### 증빙 캡처

- 촬영 → 원본/크롭본 분리 저장 (크롭 실패 시 원본 사용 폴백, 리셋 가능).
- Vision LLM으로 merchant/amount/currency/paidAt/items/부가세 구조화 추출.
- 거래 매칭(기존 스코어링 로직, `docs/02-API-CONTRACT.md` 3절)은 변경 없음.

### 전표 생성

- Preset 지정 건: Preset의 비목·전결라인·적요 템플릿 사용, `usage` 차감.
- Preset 미지정 건: 기존 P4 자동분류 + `approval-rules.json` fallback.
- 상신 시 Preset 한도 초과해도 차단하지 않음 (경고만).

## Functional Spec — Optional (시간 되면 포함)

- **적격증빙 경고**: `requireItemized=true`인 비목(편의점/마트류)에서 품목 상세내역이 없으면 경고 배지. 상신 차단 없음.
- **부가세 확인**: OCR 추출 부가세를 리뷰 화면에 표시, 사용자가 확인/수정 → `vat.confirmed` 저장.

이 둘은 스코프 컷 시 가장 먼저 빠지는 후보다 (아래 우선순위 참고).

## Non-Functional Spec

- 규모: 단일 사용자(`u_me`) 하드코딩, 인메모리 저장, DB 없음 — 기존 해커톤 결정 유지.
- 통합: fixtures가 진실, API 계약 변경 시 문서 우선 갱신 — `docs/03-ROLES-TIMELINE.md` 규칙 유지.
- 보안/백업/복구: 비범위 (레퍼런스 프로젝트의 프로덕션 요구사항은 이 PoC에 적용하지 않음).

## 데모 시나리오 (개정판, 3분)

| 시간 | 장면 |
|---|---|
| 0:00 | As-Is 페인포인트 1문장 |
| 0:15 | 관리자 콘솔에서 "AI구독료" Preset 배포 (신규 장면) |
| 0:30 | 모바일 "출장모드 시작" → 도쿄 TRIP Preset 자동 생성, Cap 표시 |
| 0:50 | 영수증 촬영 → 크롭 → OCR → Preset 선택(자동추천 하이라이트) → 잔여한도 갱신 |
| 1:30 | 편의점 영수증 촬영 → 적격증빙 경고 시연 → 그대로 진행 |
| 1:50 | 정산하기 → 카드내역 거래 매칭 (기존과 동일) |
| 2:20 | 전표 자동생성 (Preset의 비목·전결라인 반영) → 상신 |
| 2:40 | 관리자 콘솔 전환 → 전표 접수 확인 |
| 2:55 | AI구독 결제 → 배포된 Preset 자동 인식 → 잔여한도 차감 시연 |
| 3:10 | "규정을 배포하면 정산이 알아서 따라간다" 마무리 |

## 스코프 컷 우선순위 (먼저 빠지는 순)

1. 적격증빙 경고 (Optional)
2. 부가세 확인 (Optional)
3. 자동 크롭 정교화 (실패 시 원본 사용은 유지)
4. 매칭 "확인 필요" 중간단계 (자동/미매칭 2단계로 단순화)
5. **절대 안 버리는 것**: 관리자 Preset 배포 → 촬영→크롭(원본분리)→OCR→Preset/비목 선택→거래매칭→전표 자동완성→상신→관리자 화면

## 작업 분해 (참고, 확정 배분 아님)

기존 `docs/03-ROLES-TIMELINE.md`의 P1~P5 역할 위에 이번 라운드 추가 작업:

| 작업 | 내용 | 걸리는 기존 영역 |
|---|---|---|
| Preset API + 관리자 폼 | `server/routes/presets.js`, 관리자 콘솔 Preset 탭 | P1 연장 |
| 리뷰 화면 Preset/비목 선택 UI | 모바일 리뷰 화면에 Preset 칩·비목 칩 추가 | P2 연장 |
| Preset 매칭 제안 로직 | `suggestedPresetId` 계산 (matchKeywords/기간 기준) | P4 연장 |
| 적격증빙·부가세 (Optional) | `checks[]` 계산, 리뷰 화면 경고/입력 UI | P3/P4 연장 |
| Trip/Budget 제거, fixtures 교체 | `trips.js` 삭제, `presets.json`으로 대체 | P1/P5 |

## Known Gaps

| Gap | Status |
|---|---|
| Preset 자동추천 랭킹 로직 | 단순 키워드 매칭 수준, 정교화 안 함 (의도적) |
| 다중 Preset 동시 후보 우선순위 | 없음 — 사용자가 항상 직접 선택 (의도적) |
| 실제 품의/메일 시스템 연동 | 비범위 — mock으로도 구현하지 않음 |
| 다중 사용자/인증 | 비범위 |
