# 2. Architecture and DB Schema

## System Overview

```text
모바일 웹앱 (촬영 / 리뷰 / 정산하기)
  -> Mock E-Accounting API (:4000, Express)
  -> 인메모리 store (fixtures/ 로 초기화, 서버 재시작 시 리셋)

관리자 콘솔 (PC 웹, server/public)
  -> 동일 Mock E-Accounting API
  -> 정산단위 작성/배포, 카드내역·접수전표 확인 (3초 폴링)
```

## Components

| Component | Path | Responsibility |
|---|---|---|
| Mock E-Accounting 서버 | `server/index.js` | Express 앱, 라우터 등록 |
| 인메모리 저장소 | `server/store.js` | fixtures 로드, 리셋, 전표 ID 시퀀스 |
| 카드내역 라우트 | `server/routes/transactions.js` | 카드 승인내역 조회/상태 갱신 (기존 유지) |
| 영수증 라우트 | `server/routes/receipts.js` | 업로드, 크롭(원본/파생 분리), OCR, 정산단위·비목·부가세 확정 |
| 거래 매칭 라우트 | `server/routes/match.js` | 영수증 ↔ 카드내역 매칭 (기존 유지, 정산단위와 무관) |
| 전표 라우트 | `server/routes/vouchers.js` | 전표 초안 생성, 상신, 목록 (정산단위 반영하도록 확장) |
| 정산단위 라우트 (신규) | `server/routes/presets.js` | 정산단위 CRUD, 활성 목록 조회 |
| 참조 데이터 라우트 | `server/routes/reference.js` | 계정과목, 환율, 전결규정(fallback) |
| 관리자 콘솔 | `server/public/index.html`, `admin.js`, `admin.css` | 카드내역/전표/정산단위 화면 |
| 모바일 웹앱 | `/app` (예정) | 촬영, 리뷰(정산단위/비목/부가세), 정산하기, 상신 |
| ~~출장 라우트~~ | ~~`server/routes/trips.js`~~ | **제거** — `정산단위(type=TRIP)`으로 흡수 |

## Data Flow

### 증빙 캡처 흐름

1. 사용자가 영수증 촬영 → 원본 이미지 서버 업로드.
2. 서버가 크롭 수행. **원본과 크롭본을 별도 경로에 분리 저장** (크롭 실패·리셋 대비 원본 보존).
3. Vision LLM으로 OCR 파싱 (merchant/amount/currency/paidAt/items/부가세 추출).
4. 서버는 활성 정산단위 중 `matchKeywords`/기간 기준으로 `suggestedPresetId`를 계산해 응답에 포함.
5. 리뷰 화면: 사용자가 정산단위를 확정 (자동추천은 참고용 하이라이트, 최종 선택은 항상 사용자) → 선택된 정산단위의 `allowedAccountCodes`가 2개 이상이면 비목도 선택 (1개면 자동 세팅) → 부가세 확인/수정 → (Optional) 적격증빙 경고 확인.
6. 확정된 Receipt 저장 (`presetId`, `accountCode`, `vat.confirmed`, `checks[]` 포함).

### 정산단위 배포 흐름

- **관리자 배포**: 관리자 콘솔의 정산단위 탭에서 작성 → 저장 즉시 활성 정산단위로 등록, 다음 조회부터 앱에 노출. 메일 등 별도 안내 단계 없음 — 저장이 곧 배포.
- **출장 등록 (품의 mock)**: 모바일 앱 "출장모드 시작" 폼 제출 → 동일 `POST /api/presets` 호출 (`type=TRIP`). 실제 품의 시스템 연동은 비범위 — 폼 제출 자체가 품의 역할을 겸함.

### 거래 매칭 흐름 (기존 유지, 변경 없음)

영수증 ↔ 카드승인내역 매칭은 정산단위 지정과 **독립적인 별도 프로세스**다. 금액/일시/가맹점 유사도 기반 스코어링은 `docs/02-API-CONTRACT.md` 3절 그대로.

### 전표 생성 흐름

`POST /api/vouchers/preview` 시:

- `receipt.presetId`가 있으면 → 그 정산단위의 `accountCode`(사용자가 고른 비목), `approvalLine`, `descriptionTemplate` 사용, 정산단위의 `usage`에 사용액 반영.
- 없으면 → 기존 P4 자동분류 로직 + `fixtures/approval-rules.json` 카테고리×금액구간 fallback.

## Entities

### 정산단위 (신규 핵심 엔티티)

```jsonc
{
  "id": "ps_tokyo_trip",
  "name": "7월 도쿄 출장",
  "type": "TRIP",                 // TRIP | RECURRING | CAMPAIGN
  "source": "trip_request",       // trip_request | admin
  "assignees": ["u_me"],
  "period": { "start": "2026-07-14", "end": "2026-07-17" },  // TRIP만 사용
  "active": true,
  "rules": {
    "allowedAccountCodes": ["TRAVEL_MEAL", "TRAVEL_TRANSPORT", "TRAVEL_LODGING"],
    "limitKRW": 200000,
    "limitPeriod": "daily",        // daily | monthly | total
    "approvalLine": ["김민수 팀장"],
    "descriptionTemplate": "도쿄출장 {merchant} {n}인",
    "matchKeywords": ["JPY", "도쿄"],
    "requireItemized": false
  },
  "usage": { "usedKRW": 0, "byDay": {} }
}
```

AI구독료 같은 단일 비목 정산단위는 `allowedAccountCodes: ["WELFARE_AI"]`처럼 배열 길이 1 — 이 경우 리뷰 화면에서 비목 선택 단계가 자동으로 생략된다.

### Receipt (확장)

```jsonc
{
  "id": "rcpt_001",
  "imageUrl": "/uploads/rcpt_001.jpg",       // 원본 — 항상 보존
  "croppedUrl": "/uploads/rcpt_001_crop.jpg", // 크롭본 — 리셋/재실행 가능
  "ocr": { "merchant": "...", "amount": 8800, "currency": "JPY", "paidAt": "...", "items": [], "confidence": 0.93 },
  "matchedTxId": null,          // 거래 매칭 결과 (정산단위와 무관)
  "presetId": "ps_tokyo_trip",  // null이면 일반 결제
  "accountCode": "TRAVEL_MEAL", // 사용자가 확정한 비목
  "vat": { "extracted": 800, "confirmed": null },
  "checks": [
    { "type": "ITEMIZED_REQUIRED", "status": "warn", "message": "편의점 결제 — 상세내역 증빙 필요" }
  ]
}
```

### 폐기되는 엔티티

- **Trip** → `정산단위(type=TRIP)`으로 흡수. `fixtures`에 별도 `trips.json` 두지 않음.
- **Budget** → `정산단위(type=RECURRING)`의 `usage`로 흡수. `fixtures/budgets.json` 폐기 → `fixtures/presets.json`으로 대체.

### 유지되는 엔티티 (변경 없음)

CardTransaction, Voucher, ApprovalRule(전결규정, fallback 전용), fx, accounts — `docs/02-API-CONTRACT.md` 정의 그대로.

## Storage

- DB 없음 — 인메모리(`server/store.js`) + fixtures JSON 초기값. 서버 재시작 시 fixtures로 리셋 (의도된 동작).
- 이미지 저장: `server/uploads/` (원본/크롭 분리 경로), `.gitignore` 처리됨.

## Known Gaps

- 정산단위 자동추천(`matchKeywords`)은 단순 문자열 포함 검사 수준 — 정교한 랭킹 없음.
- 여러 정산단위가 동시에 후보로 뜰 때의 우선순위 로직 없음 (의도적 — 사용자가 항상 직접 선택).
- 단일 사용자(`u_me`) 하드코딩, 실제 인증 없음.
- 프로덕션 보안·백업 체계 없음 (PoC 범위 밖).
