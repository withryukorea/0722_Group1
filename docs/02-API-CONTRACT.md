# API 계약 & 데이터 모델 (v1 — H1에 동결)

> 이 문서가 5명 병렬 개발의 접착제입니다.
> **H1 이후 변경 시 반드시 전원 합의 + 이 문서 먼저 수정.**
> 각자 개발할 때는 서버를 기다리지 말고 `fixtures/` 폴더의 JSON을 그대로 사용하세요.

## 0. 시스템 구성

```
[모바일 웹앱 (P2)]
   │  사진 업로드
   ▼
[OCR/파싱 서비스 (P3)] ──→ Receipt(구조화 데이터)
   │
   ▼
[매칭·전표 엔진 (P4)] ←──→ [Mock E-Accounting API (P1)]
   │                          ├ 카드승인내역
   ▼                          ├ 전결규정 / 예산
[출장모드·한도 (P5)]           └ 전표 접수 + 관리자 웹화면
```

- Mock E-Accounting API 서버: `http://localhost:4000` (P1)
- 프론트(모바일 웹): `http://localhost:3000` (P2/P5)
- OCR은 별도 서버 없이 프론트→백엔드 경유 or 백엔드 내 모듈로 (P3가 P1 서버에 라우트 추가)

## 1. 엔티티

### CardTransaction (법인카드 승인내역) — Mock E-Accounting이 소유

```jsonc
{
  "id": "tx_001",
  "cardLast4": "1234",
  "merchant": "스시로 신주쿠점",
  "amount": 8800,            // 결제 통화 기준
  "currency": "JPY",
  "amountKRW": 79200,        // 승인 시점 원화 환산
  "approvedAt": "2026-07-15T19:32:00+09:00",
  "category": null,          // 매칭 전 null
  "status": "unmatched"      // unmatched | matched | vouchered
}
```

### Receipt (영수증) — OCR 결과

```jsonc
{
  "id": "rcpt_001",
  "imageUrl": "/uploads/rcpt_001.jpg",
  "croppedUrl": "/uploads/rcpt_001_crop.jpg",
  "ocr": {
    "merchant": "スシロー新宿店",
    "amount": 8800,
    "currency": "JPY",
    "paidAt": "2026-07-15T19:31:00+09:00",
    "cardLast4": "1234",     // 영수증에 있으면
    "items": [{ "name": "특선세트 x2", "amount": 8800 }],
    "confidence": 0.93
  },
  "matchedTxId": "tx_001",   // 매칭 전 null
  "tripId": "trip_001"       // 출장모드에서 찍었으면, 아니면 null
}
```

### Voucher (전표)

```jsonc
{
  "id": "vch_001",
  "title": "7월 도쿄 출장비 정산",
  "lines": [
    {
      "txId": "tx_001",
      "receiptId": "rcpt_001",
      "accountCode": "TRAVEL_MEAL",   // 계정과목 (아래 코드표)
      "amountKRW": 79200,
      "description": "스시로 신주쿠점 · 석식 2인"
    }
  ],
  "totalKRW": 79200,
  "approvalLine": ["김팀장", "박부장"],  // 전결규정으로 자동 결정
  "status": "draft"          // draft | submitted | (approved)
}
```

### ApprovalRule (전결규정) — Mock E-Accounting 시드데이터

```jsonc
{
  "category": "TRAVEL_MEAL",
  "maxKRW": 300000,          // 이 금액 이하일 때 이 라인
  "approvers": ["김팀장"]
}
// 금액 초과 시 다음 단계 룰 적용. 카테고리 × 금액구간 테이블로 시드.
```

### Budget (예산/한도) — 복지비류

```jsonc
{
  "category": "WELFARE_AI",   // 복지-AI구독
  "userId": "u_me",
  "limitKRW": 300000,
  "usedKRW": 120000,
  "remainingKRW": 180000
}
```

### Trip (출장) — 출장모드

```jsonc
{
  "id": "trip_001",
  "destination": "도쿄",
  "country": "JP",
  "startDate": "2026-07-14",
  "endDate": "2026-07-17",
  "members": 2,
  "dailyCapPerPersonKRW": 100000,
  "dailyCapKRW": 200000,      // × members
  "spentByDay": { "2026-07-15": 177000 }
}
```

### 계정과목 코드표 (시드)

| code | 이름 | 예시 가맹점 |
|------|------|------------|
| TRAVEL_MEAL | 출장-식대 | 식당, 카페 |
| TRAVEL_TRANSPORT | 출장-교통 | 택시, 철도, 항공 |
| TRAVEL_LODGING | 출장-숙박 | 호텔 |
| SNACK | 간식비 | 편의점, 베이커리 |
| WELFARE_BOOK | 복지-도서 | 서점 |
| WELFARE_AI | 복지-AI구독 | OpenAI, Anthropic, GitHub |
| WELFARE_ETC | 복지-기타 | |

### 환율 고정 테이블 (시드)

```jsonc
{ "JPY": 9.0, "USD": 1380, "EUR": 1500, "CNY": 190, "KRW": 1 }  // → KRW
```

## 2. REST API (Mock E-Accounting, :4000)

| Method | Path | 설명 | 담당 |
|--------|------|------|------|
| GET | `/api/transactions?status=unmatched` | 카드승인내역 목록 | P1 |
| PATCH | `/api/transactions/:id` | 상태/매칭 갱신 | P1 |
| POST | `/api/receipts` (multipart) | 영수증 업로드 → 크롭+OCR 수행 후 Receipt 반환 | P3 |
| POST | `/api/match` | body: `{receiptIds[]}` → 매칭 결과 `[{receiptId, txId, score}]` | P4 |
| POST | `/api/vouchers/preview` | 매칭된 건들로 전표 초안 생성(계정과목+전결라인 포함) | P4 |
| POST | `/api/vouchers` | 전표 상신 → status=submitted, 관리자 화면에 노출 | P1 |
| GET | `/api/vouchers` | 전표 목록 (관리자 화면용) | P1 |
| GET | `/api/approval-rules` | 전결규정 | P1 |
| GET | `/api/budgets?userId=u_me` | 잔여 한도 | P1 |
| POST | `/api/trips` / GET `/api/trips/:id` | 출장 등록/조회 (Cap 계산 포함) | P5 |
| GET | `/api/fx` | 환율 테이블 | P1 |

## 3. 매칭 규칙 (P4, v1 단순하게)

스코어 = 금액 일치(±1% 또는 환산 후 ±3%) 60점 + 일시 근접(±30분: 30점, ±24h: 15점) + 가맹점 유사도 10점

- score ≥ 70 → 자동 매칭
- 40 ≤ score < 70 → "확인 필요" (사용자에게 후보 제시)
- score < 40 → 미매칭

## 4. fixtures (H1에 P1이 커밋)

```
fixtures/
  transactions.json   # 승인내역 12건 (출장 8건 + 간식 2건 + AI구독 1건 + 도서 1건)
  approval-rules.json
  budgets.json
  fx.json
  receipts-ocr/       # 데모 영수증별 OCR 기대 결과 JSON (P3 캐시 겸용)
```

프론트·엔진 개발자는 서버 없이 이 파일들을 import해서 개발 → H6 통합 때 실제 API로 스위치.

## 5. v1.1 변경사항 (구현 확정 — 팀 공지용)

> P3(영수증)·P4(매칭/초안)가 구현되면서 확정된 내용. 기존 계약과 호환되는 추가/명확화만 포함.

- **fixtures/transactions.json 재배치**: WoZ 데모 영수증과 1:1이 되도록 ID 체계 변경
  - `tx_001~007` 국내 실데모 7건(폴바셋/치킨/ANTHROPIC/택시x2/오피스디포/OPENAI — receipts-ocr과 1:1)
  - `tx_101~108` 도쿄 출장(JPY) / `tx_201~203` 간식·도서
- **CardTransaction 선택 필드**: `biz`(업종), `apprNo`(승인번호) — 화면 표시용, 없어도 동작
- **POST /api/receipts** ✅: multipart(`image`) 또는 JSON `{key}` (데모키: coffee/chicken/anthropic/taxi1/taxi2/officedepot/openai, 생략 시 미사용 데모건 자동 배정). 실제 OCR 실패/미호출 시 WoZ 폴백
  - `GET /api/receipts`, `GET /api/receipts/:id`, `GET /api/receipts/:id/image`(업로드 원본 또는 OCR 값으로 그린 데모 SVG)
- **POST /api/match** ✅: 금액60/일시30/가맹점10 점수제, score≥70이면 서버가 즉시 매칭 확정(tx.status=matched)
- **POST /api/vouchers/preview** ✅: 계정과목 자동분류 + 부가세 분리(`supplyKRW`/`vatKRW`, 면세·구독은 0) + 전결라인(approval-rules 기반)
- **POST /api/vouchers**: 이미 vouchered된 txId 재상신 시 **409 DUPLICATE_SUBMISSION**
- **Voucher.lines[].receiptId** 를 그대로 보존 → 이어카운팅 나의 문서함에서 증빙(📎) 열람 가능

## 6. v1.2 변경사항 (Preset 엔진 — sot/05 구현 반영)

> sot/ 폴더가 계약의 현재 기준선. 이 절은 docs/02만 보는 사람을 위한 요약이다.

- **Preset 엔진 구현** ✅: `POST/GET/PATCH /api/presets` — 출장(TRIP)·특수정산(RECURRING/CAMPAIGN) 규정의 배포 단위. fixtures/presets.json 시드 5종(AI구독·도서·복지기타·도쿄출장·부산당일출장)
- **Trip/Budget 폐기**: `trips.js`·`budgets.json` 삭제. 단 기존 호출자 호환을 위해 `GET·POST /api/trips`(TRIP Preset 별칭)와 `GET /api/budgets`(RECURRING Preset usage 계산 shim)는 유지
- **Receipt 확장** ✅: 응답에 `suggestedPresetId`(TRIP 기간 → 키워드 순 추천), `checks[]`(ITEMIZED_REQUIRED/VAT_CHECK/DUPLICATE_DOCUMENT — 경고만, 차단 없음), `fxRate`/`amountKRW`(결제 시점 환율 고정 저장), `serviceDate`(출장 기간 판정용 — 매칭은 paidAt), `vat{extracted,confirmed}`
- **PATCH /api/receipts/:id** ✅: 사용자가 presetId·accountCode·vat.confirmed 확정. 허용 비목 1개면 자동 세팅, 허용 외 비목은 400
- **실 OCR 훅** ✅: server/.env의 LETSUR_API_KEY 있으면 Letsur AI Gateway(Vision)로 실제 OCR, 실패·미설정 시 WoZ 폴백 (데모 100% 재현 유지)
- **preview Preset 분기** ✅: receipt.presetId 있으면 그 Preset의 비목·전결라인·적요 템플릿 사용 + `warnings[]`(PRESET_LIMIT_EXCEEDED — 경고만), 없으면 기존 자동분류+전결규정 fallback
- **상신 시 usage 차감** ✅: submitted 전표만 Preset usage(usedKRW/byDay)에 합산 (초안 합산 금지)
- **fixtures 갱신**: fx USD 1380→**1500**(데모 확정 환율), 계정과목 `SGA_POSTAGE`(판관비-우편) 신설, data_sample 실물 영수증 대응 카드승인내역 `tx_301~310` 추가 (부산·울산 출장 동선 + USD 구독 2건)

## 7. v1.3 변경사항 (1단계 서버 계약 완성 — 2026-07-22)

> 요청·응답 실측 예시는 `sot/05_api.md` "확정 계약" 절 참고. 기존 호출과 호환되는 추가/검증 강화만 포함.

- **Preset 신 스키마** ✅: `target{scope,teams,users}`(배포 대상), `limitBasis`(perPerson|shared), `rules.costCenter`(예산부서), `rules.approvalLineTemplate{draft,reviewers,approve}`($DRAFTER/$SUPERIOR 변수 — 서버가 프로필·조직도 기준으로 해석), `usage.byAccountCode`(TRIP 대시보드용 비목별 누적). 구 `rules.approvalLine`은 해석 결과를 고정 저장해 호환 유지
- **실계정코드 매핑** ✅: accounts.json에 `realCode`/`realName` 추가 (WELFARE_AI→[726350]수수료-기타 등). 출장 TRIP은 `rules.realAccountCode`(국내 706101/해외 706102) override. preview 라인에 `accountRealCode`/`accountDisplay`/`costCenter`/`serviceDate` 추가
- **TRIP 한도 = 출장비 지급기준 자동** ✅: 목적지·기간(·rank·members)만 주면 travel-policy.json 기준으로 일일 한도 자동 계산(국내 일당 35,000+숙박 120,000, 해외 지역통화×환율). 산출 근거는 `meta.policyBasis`. 명시값이 항상 우선
- **POST /api/match/confirm** 신설 ✅: 낮은 점수 건 수동 확정/해제(txId:null). UNKNOWN_TX 400, TX_ALREADY_VOUCHERED·TX_ALREADY_MATCHED 409
- **Receipt** ✅: `source`(mobile|pc), `crop{status,updatedAt}`(원본/크롭 분리 — multipart `cropped` 필드 추가 지원), `POST /api/receipts/:id/crop`(재크롭·원본 폴백), PATCH에서 `ocr` 부분 수정 시 fxRate/amountKRW/checks/suggestedPresetId 재계산
- **POST /api/vouchers 검증 강화** ✅: 빈 lines 400 EMPTY_LINES, 존재하지 않는 txId/receiptId 400 UNKNOWN_TX/UNKNOWN_RECEIPT (txId 없는 현금 라인은 허용). usage 차감에 byAccountCode 추가
- **preview 일일 한도 경고** ✅: TRIP(limitPeriod=daily)은 일자별 검사 `PRESET_DAILY_LIMIT_EXCEEDED` (day 필드 포함)
- **시드 정합성** ✅: 부팅·리셋 시 receipts-seed의 matchedTxId를 거래에 역반영 (양방향 링크 — 거래 8건 matched 로 시작)
