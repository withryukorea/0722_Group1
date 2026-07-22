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
