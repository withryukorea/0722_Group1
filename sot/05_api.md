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
| 추가 | `GET /api/travel-policy` — 국내·해외 출장비 화면이 공통 지급기준을 조회 |
| 유지 | `/api/transactions`, `/api/match`, `/api/vouchers`, `/api/fx`, `/api/approval-rules` |

## REST API 전체 (:4000)

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/transactions?status=unmatched` | 카드승인내역 목록 (기존 유지) |
| PATCH | `/api/transactions/:id` | 상태/매칭 갱신 (기존 유지) |
| POST | `/api/receipts` (multipart) | 실 이미지 → Vision OCR(성공만 저장, `ocrMode:"real"`), 데모 `{key}` → WoZ(`ocrMode:"woz"`). 실패 시 저장 안 함 |
| GET | `/api/receipts/ocr-status` | 비밀값 없이 실 OCR 설정 여부·모델 조회 |
| GET | `/api/persistence-status` | Supabase 설정·준비·revision·최근 저장 시각 조회(키 비노출) |
| DELETE | `/api/receipts/bulk` | body `{ids[]}` — 선택 영수증 삭제, 연결 카드내역 미매칭 복원. 전표 참조 영수증은 409 |
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
| GET | `/api/travel-policy` | `fixtures/travel-policy.json` 기반 국내·해외 직급·지역별 출장비 지급기준 |

## Frontend Routes

| Route | 대상 | 화면 |
|---|---|---|
| 모바일 (`app/`, `design/screens/mobile/`) | 직원 | **유입 전용**: 촬영 → 크롭확인 → 파싱확인·정산단위/비목 선택 → 저장 + 정산단위 대시보드(읽기 전용). 정산단위 생성·정산·상신 없음 |
| 이어카운팅 (`eaccounting/`) | 직원·관리자 | 정산단위 관리(생성/배포) · PC 영수증 업로드 · 매칭 화면(영수증↔카드내역, 증빙 추가·해제) · 정산(해외출장비 정산 / 법인카드 정산 등, 정산단위 지정칸 자동채움)·상신 · 문서함 |

---

## 확정 계약: 요청·응답 예시 (1단계 서버 구현 반영, 2026-07-22)

아래 예시는 실제 서버 응답을 그대로 기록한 것이다 (모바일·PC·이어카운팅 담당은 이 형태를 기준으로 개발).
1단계에서 추가된 엔드포인트: `POST /api/match/confirm`, `POST /api/receipts/:id/crop`.

### 정산단위 (신 스키마)

`GET /api/presets/ps_ai_sub` →

```jsonc
{
  "id": "ps_ai_sub",
  "name": "AI구독료 정산",
  "type": "RECURRING",
  "source": "admin",                                   // trip_request | employee | admin
  "target": { "scope": "company", "teams": [], "users": [] },
  "limitBasis": "perPerson",                           // perPerson | shared
  "rules": {
    "allowedAccountCodes": ["WELFARE_AI"],             // 내부 비목 코드 (실계정코드는 아래 참고)
    "costCenter": "AQ131",                             // 예산부서
    "limitKRW": 300000, "limitPeriod": "monthly",
    "approvalLineTemplate": { "draft": "$DRAFTER", "reviewers": ["최아무개 매니저"], "approve": "$SUPERIOR" },
    "approvalLine": ["최아무개 매니저", "김아무개 팀장"],  // 호환용 — 양식 해석 결과 고정 저장
    "descriptionTemplate": "[AI구독료] {merchant}_[이름]",  // [이름][직급][월] + {merchant}{n}{date} 치환
    "matchKeywords": ["ANTHROPIC", "OPENAI", "..."]
  },
  "usage": { "usedKRW": 120000, "byDay": {}, "byAccountCode": { "WELFARE_AI": 120000 } }
}
```

**실계정코드 규칙**: 내부 비목 코드(`WELFARE_AI` 등)는 그대로 유지하고, `fixtures/accounts.json`의
`realCode`/`realName`으로 실계정코드에 매핑한다 (예: WELFARE_AI → `[726350]수수료-기타`).
출장 TRIP은 `rules.realAccountCode`가 국내 `706101`/해외 `706102`(여비교통비)로 override 한다.
전표 미리보기 라인의 `accountDisplay`가 이어카운팅 계정과목 입력칸 형식(`[코드]계정명`) 그대로 내려간다.

### TRIP 생성 — 목적지·기간만 입력하면 한도는 출장비 지급기준 자동

`POST /api/presets` `{"type":"TRIP","name":"광주 1박","destination":"광주","country":"KR","members":1,"startDate":"2026-07-27","endDate":"2026-07-28"}` →

```jsonc
{
  "rules": { "limitKRW": 155000, "limitPeriod": "daily", "realAccountCode": "706101", ... },
  "meta": { "policyBasis": {                            // 한도 산출 근거 (travel-policy.json)
    "region": "KR", "rank": "TEAM_MEMBER", "currency": "KRW", "fxRate": 1,
    "perDiem": 35000, "lodging": 120000, "dailyCapPerPersonKRW": 155000 } }
}
```

- 당일 출장(start=end)은 숙박 0 → 일당만 (35,000). 해외는 지역통화 기준 × 환율 (JP 팀원: (17,000+23,000)×9.0 = 360,000/인).
- `perPersonKRW`·`rules.limitKRW`를 명시하면 그 값이 우선 (policy 는 기본값·근거 표시용).
- `rank` 파라미터(CEO|DIVISION_HEAD|HQ_HEAD|TEAM_LEAD|TEAM_MEMBER, 기본 TEAM_MEMBER)로 직급별 기준 적용.
- 구 `POST /api/trips` 별칭도 동일 로직 (`dailyCapPerPersonKRW` 미지정 시 policy 자동).

### 영수증 — 하이브리드 OCR (2026-07-23, Codex 실 OCR 반영)

`POST /api/receipts` 두 경로:

- **실제 이미지 업로드**(multipart `image`[, `cropped`]) → `server/ocr.js`의 Vision OCR(Letsur AI Gateway)로 인식.
  가맹점·금액을 신뢰 있게 인식한 경우에만 저장하고 `ocrMode:"real"` 반환.
  **키 미설정·인식 실패·타임아웃 시 저장하지 않고 오류 반환**(WoZ 폴백 금지 — 성공 위장 방지):

  | 실패 | HTTP | 의미 |
  |---|---:|---|
  | `IMAGE_REQUIRED` | 400 | 이미지도 데모 key도 없음 |
  | `INVALID_DEMO_KEY` | 400 | 명시한 데모 key가 fixtures에 없음 |
  | `OCR_UNSUPPORTED_MEDIA` | 415 | 이미지 아님(PDF 등) |
  | `OCR_NOT_CONFIGURED` | 503 | 실 OCR 키(`LETSUR_API_KEY`) 미설정 |
  | `OCR_PROVIDER_ERROR`/`OCR_INVALID_RESULT` | 502 | 제공자 오류 또는 가맹점·금액 검증 실패 |
  | `OCR_TIMEOUT` | 504 | 인식 제한시간 초과 |

  실패 응답은 `{error, message, ocrMode:"failed", saved:false}`.

- **데모 샘플 key**(JSON `{key}`, 이미지 없음) → `fixtures/receipts-ocr` WoZ 픽스처로 저장, `ocrMode:"woz"`.
  연출용 데모 샘플칩·시드 재현용으로 **유지**(키 없이도 동작). 즉 "새 영수증(실 업로드)만 실 OCR, 기존 데모·시드 기록은 보존".

- `GET /api/receipts/ocr-status` — 비밀값 없이 `{configured, model, demoKeyFallback:true, actualUploadFallback:false}` 반환.

응답 공통에 `ocrMode`, `source`("mobile"|"pc"), `crop:{status:"auto"|"manual"|"original", updatedAt}` 포함.

실 이미지가 Supabase 모드에서 저장되면 `imageUrl`/`croppedUrl`은 `/api/receipts/:id/image?variant=...` 프록시를 가리킨다. 원본 객체 경로는 `receipt.storage`에 보존하며 버킷은 비공개다. Storage 또는 `app_state` 저장이 실패하면 성공 응답을 내지 않고 `503` + `saved:false`를 반환한다.

> 배포: `render.yaml`은 `LETSUR_API_KEY`를 `sync:false`로 선언한다. 실제 값은 Render Environment에 비공개로 설정한다. 실제 사진 업로드는 `ocrMode:"real"`만 성공으로 취급하고, 실패 시 WoZ 데이터나 기존 시드로 자동 전환하지 않는다.

`POST /api/receipts/:id/crop` — 재크롭: multipart `cropped` 파일 → `crop.status:"manual"` / `{"useOriginal":true}` → 원본 폴백(`crop.status:"original"`).

`PATCH /api/receipts/:id` — 기존 `presetId`/`accountCode`/`vat`/`serviceDate`에 더해 **`ocr` 부분 수정** 허용:

```
PATCH { "ocr": { "amount": 8800, "currency": "JPY" } }
→ 응답: fxRate 9, amountKRW 79200 재계산 + checks·suggestedPresetId 재산출 (사용자가 고른 presetId 는 유지)
```

### 수동 매칭 확정 — `POST /api/match/confirm`

| 요청 | 응답 |
|---|---|
| `{"receiptId":"rcpt_111","txId":"tx_002"}` | `200 {"receiptId":"rcpt_111","txId":"tx_002","status":"confirmed"}` — 양방향 링크 설정 |
| `{"receiptId":"rcpt_111","txId":null}` | `200 {..., "status":"unlinked"}` — 매칭 해제(거래는 unmatched 로 복귀) |
| 없는 txId | `400 {"error":"UNKNOWN_TX"}` |
| 이미 전표 처리된 거래 | `409 {"error":"TX_ALREADY_VOUCHERED"}` |
| 다른 영수증과 매칭된 거래 | `409 {"error":"TX_ALREADY_MATCHED","matchedReceiptId":"rcpt_101"}` — 먼저 해제 필요 |

### 전표 미리보기 — 양식 해석 결과 포함

`POST /api/vouchers/preview` `{"receiptIds":["rcpt_101"]}` →

```jsonc
{
  "title": "AI구독료 정산 (ANTHROPIC* CLAUDE SUB)",
  "costCenter": "AQ131",
  "approvalLine": ["최아무개 매니저", "김아무개 팀장"],           // 호환 유지
  "approvalLineDetail": {                                        // 결재선 표에 그대로 전개
    "draft": "정성훈 매니저",                                     // $DRAFTER 해석
    "reviewers": ["최아무개 매니저"],
    "approve": "김아무개 팀장"                                    // $SUPERIOR 해석 (조직도 기준 차상위)
  },
  "lines": [{
    "txId": "tx_003", "receiptId": "rcpt_101", "presetId": "ps_ai_sub",
    "accountCode": "WELFARE_AI", "accountName": "복지-AI구독",
    "accountRealCode": "726350", "accountDisplay": "[726350]수수료-기타",   // 이어카운팅 입력칸 형식
    "costCenter": "AQ131", "serviceDate": "2026-07-19",
    "amountKRW": 167435, "supplyKRW": 167435, "vatKRW": 0,
    "description": "[AI구독료] ANTHROPIC* CLAUDE SUB_정성훈"
  }],
  "warnings": []
}
```

한도 경고: `limitPeriod:"monthly"|"total"` → `PRESET_LIMIT_EXCEEDED`(usage 합산),
`"daily"`(TRIP) → 일자별 검사 `PRESET_DAILY_LIMIT_EXCEEDED` (`day` 필드 포함). 경고만, 상신 차단 없음.

### 전표 상신 검증 — `POST /api/vouchers`

| 케이스 | 응답 |
|---|---|
| `lines` 없음/빈 배열 | `400 EMPTY_LINES` |
| 라인에 존재하지 않는 `txId` | `400 UNKNOWN_TX` (txIds 목록 포함) |
| 라인에 존재하지 않는 `receiptId` | `400 UNKNOWN_RECEIPT` |
| `txId` 없는 현금 라인 | **허용** (201) |
| 이미 vouchered 거래 재상신 | `409 DUPLICATE_SUBMISSION` |
| 정상 | `201` + 라인의 preset `usage.usedKRW`/`byDay`/`byAccountCode` 차감 |

### 시드 정합성

서버 부팅·리셋 시 `receipts-seed.json`의 `matchedTxId`를 거래 쪽에도 반영해
양방향 링크를 맞춘다 (거래 8건이 `matched` + `matchedReceiptId` 상태로 시작).
