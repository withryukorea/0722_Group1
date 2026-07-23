# 2. Architecture and DB Schema

## System Overview

```text
📱 모바일 웹앱 (유입 전용: 촬영 → 크롭확인 → 파싱확인·정산단위/비목 선택 → 저장 + 대시보드)
  -> Mock E-Accounting API (:4000, Express)
  -> 인메모리 store (fixtures/ 로 초기화, 서버 재시작 시 리셋)

🖥 이어카운팅 (PC 웹, eaccounting/) — 정산의 중심
  -> 동일 Mock E-Accounting API
  -> 정산단위 생성/배포 · PC 영수증 업로드 · 영수증↔카드내역 매칭 · 정산(전표작성)·상신 · 전표 접수 확인
```

역할 분담 원칙: **유입(증빙 수집)만 모바일**, **정산·상신은 이어카운팅**에서 한다. 모바일에는 정산단위 생성 기능이 없다 (선택만 가능).

## Components

| Component | Path | Responsibility |
|---|---|---|
| Mock E-Accounting 서버 | `server/index.js` | Express 앱, 라우터 등록 |
| 인메모리 저장소 | `server/store.js` | fixtures 로드, 리셋, 전표 ID 시퀀스 |
| 카드내역 라우트 | `server/routes/transactions.js` | 카드 승인내역 조회/상태 갱신 (기존 유지) |
| 영수증 라우트 | `server/routes/receipts.js` | 업로드(모바일 촬영 + PC 파일), 크롭(원본/파생 분리), OCR, 정산단위·비목·부가세 확정 |
| 거래 매칭 라우트 | `server/routes/match.js` | 영수증 ↔ 카드내역 매칭 (기존 유지, 정산단위와 무관) |
| 전표 라우트 | `server/routes/vouchers.js` | 전표 초안 생성, 상신, 목록 (정산단위 반영하도록 확장) |
| 정산단위 라우트 | `server/routes/presets.js` | 정산단위 CRUD, 활성 목록 조회 |
| 참조 데이터 라우트 | `server/routes/reference.js` | 계정과목, 환율, 전결규정(fallback), 출장비 지급기준 |
| 관리자 콘솔 | `server/public/index.html`, `admin.js`, `admin.css` | 카드내역/전표/정산단위 화면 |
| 이어카운팅 화면 | `eaccounting/` | 법인카드 정산(`card-settlement`, `voucher-create`), 해외/국내 출장비 정산(`travel-foreign/domestic`), 문서함(`mydocs-all`) + **신규: 정산단위 관리, 영수증 업로드, 매칭 화면** |
| 모바일 웹앱 | `app/`, `design/screens/mobile/` | 촬영·크롭확인·파싱확인·저장, 정산단위 대시보드(읽기 전용) |
| ~~출장 라우트~~ | ~~`server/routes/trips.js`~~ | **제거됨** — `정산단위(type=TRIP)`으로 흡수 (구현 반영 완료) |

## Data Flow

### 정산단위 생성 흐름 — 전부 이어카운팅에서 (모바일 생성 없음)

| 경로 | 트리거 | type | 비고 |
|---|---|---|---|
| 품의 자동 생성 | 출장 품의 승인 시 시스템이 자동 생성 | TRIP (해외) | 품의 시스템 연동은 비범위 — **PoC에서는 seed로 시뮬레이트** (데모 시작 시 도쿄 출장 정산단위가 이미 존재) |
| 직원 직접 생성 | 이어카운팅에서 직원이 목적지·기간만 입력 | TRIP (국내) | 일비·비목·전결라인은 **국내출장 표준 기본값이 자동** 세팅 |
| 관리자 배포 | 이어카운팅 정산단위 관리 화면에서 작성 | RECURRING / CAMPAIGN | 저장 즉시 배포 — 메일 등 별도 안내 단계 없음 |

### 증빙 유입 흐름 ① — 모바일 촬영 (출장·현장 결제)

7단계. ⚙️=백엔드 연산, 📱=사용자 확인·선택:

1. 📱 촬영
2. ⚙️ 원본파일 서버 전송 (원본은 항상 보존)
3. ⚙️ 자동 크롭 (원본/크롭본 별도 경로 분리 저장)
4. 📱 **크롭 이미지 확인** — 어긋나면 "다시 크롭", 실패 시 원본 사용
5. ⚙️ 정보 파싱 (Vision LLM: merchant/amount/currency/paidAt/items/부가세)
6. 📱 **파싱 확인 + 정산단위·비목 선택** — 서버가 `matchKeywords`/기간으로 계산한 `suggestedPresetId`가 하이라이트되지만 최종 선택은 항상 사용자. `allowedAccountCodes`가 2개 이상이면 비목 선택 노출(1개면 자동). 부가세 확인/수정, 적격증빙 경고(Optional)도 이 단계에 표시
7. 📱 저장 → 보관함 (`presetId`, `accountCode`, `vat.confirmed`, `checks[]` 포함)

사용자 개입은 4·6단계 두 번뿐이다.

### 증빙 유입 흐름 ② — PC 업로드 (비출장·구독형)

AI구독료처럼 PDF 인보이스로 오는 건은 이어카운팅에서 직접 업로드한다:

1. 🖥 이어카운팅 영수증 업로드 화면에서 파일(PDF/이미지) 선택
2. ⚙️ 파싱 → 정산단위 키워드 자동추천 (예: "ANTHROPIC" → AI구독 정산단위)
3. 🖥 확인 후 정산(전표작성)으로 이동

### 매칭 흐름 — 이어카운팅 매칭 화면

업로드된 영수증 ↔ 카드 statement(승인내역) 매칭은 이어카운팅의 매칭 화면에서 확인한다:

- 자동 매칭(금액/일시/가맹점 스코어링, `docs/02-API-CONTRACT.md` 3절 그대로) + 낮은 점수 건만 수동 확정
- 행별로 비목 확인, 증빙 추가·해제 가능
- 거래 매칭은 정산단위 지정과 **독립적인 별도 프로세스**다

### 정산(전표작성)·상신 흐름 — 이어카운팅에서 (반자동)

정산은 이어카운팅의 기존 전표작성 화면(해외출장비 정산 / 법인카드 정산 등)에서 이루어진다.

**진입 — 정산 방식 선택**: 법인카드 정산 목록 상단에 `[일반 정산 | 정산단위 정산]` 토글을 둔다.

- **일반 정산**: 기존 그대로 — 카드내역을 낱개로 선택해 전표작성.
- **정산단위 정산**: 내게 배정된 활성 정산단위 드롭다운에서 선택 → 그 정산단위로 태깅된(영수증 `presetId` 매칭) **미정산 카드내역이 자동 필터·선택**됨 (건수·합계 표시) → 전표작성. 신규 API 없이 클라이언트에서 `receipt.presetId` 기준 필터.
- 출장(TRIP)도 같은 메커니즘 — 해외출장비 정산의 기존 "출장 개요조회" 팝업이 사실상 정산단위 선택이며, 개념적으로 통일된다.

**정산단위가 지정한 칸은 자동완성·고정**되고, 나머지는 일반 정산처럼 사용자가 입력/확인한다:

| 자동완성·고정 (정산단위) | 사용자 입력/확인 |
|---|---|
| 계정과목(비목), 예산부서(Cost Center), 적요(양식 자동 생성), 결재선(양식 자동 전개) | 금액·통화·환율(OCR값 확인), 부가세, 증빙일자, 세부내역 등 |

`POST /api/vouchers/preview` 시:

- `receipt.presetId`가 있으면 → 그 정산단위의 규칙(비목·costCenter·적요양식·전결라인 양식) 자동 반영, `usage`에 사용액 차감.
- 없으면 → 기존 P4 자동분류 로직 + `fixtures/approval-rules.json` 카테고리×금액구간 fallback.

## Entities

### 정산단위 (핵심 엔티티)

```jsonc
{
  "id": "ps_ai_frontier",
  "name": "AI Frontier 교육",
  "type": "RECURRING",            // TRIP | RECURRING | CAMPAIGN
  "source": "admin",              // trip_request(품의 자동, PoC는 seed) | employee(국내출장 직접) | admin(관리자 배포)
  "target": {                     // 배포 대상 — 이 대상의 영수증 처리에만 후보로 노출
    "scope": "company",           // company(전사) | team | users
    "teams": [],                  // scope=team일 때 (예: ["전력사업기획팀"])
    "users": []                   // scope=users일 때 명단
  },
  "limitBasis": "perPerson",      // perPerson(1인당) | shared(공동) — 한도 집계 기준
  "period": null,                 // TRIP만 사용 (예: {"start":"2026-07-14","end":"2026-07-17"})
  "active": true,
  "rules": {
    "allowedAccountCodes": ["723105"],        // 허용 비목 (실계정코드). TRIP은 복수 (숙박/식대/교통)
    "costCenter": "A860",                     // 예산부서 (예: [A860] SSC 교육)
    "limitKRW": 300000,
    "limitPeriod": "monthly",                 // daily(TRIP 일당) | monthly | total
    "approvalLineTemplate": {                 // 전결라인 "양식" — 변수는 상신자 기준 자동 결정
      "draft": "$DRAFTER",                    // 기안 = [기안자] 자동
      "reviewers": ["이진현 매니저", "오정훈 팀장"],  // 검토 = 지정 검토자(고정) 또는 상대 직책 변수
      "approve": "$SUPERIOR"                  // 승인 = [차상위자] 자동
    },
    "descriptionTemplate": "[이름][직급]_[월]월 AI Frontier",  // 적요양식 — [이름]·[직급]=프로필, [월]=결제월 치환
    "matchKeywords": ["ANTHROPIC", "OPENAI", "AI Frontier"],
    "requireItemized": false
  },
  "usage": { "usedKRW": 0, "byAccountCode": {} }   // TRIP 대시보드는 비목별 누적으로 표시 (일별 아님)
}
```

배포 대상 × 한도 기준 조합 예: AI구독 = `company × perPerson`(전사, 1인당 한도), 팀빌딩 = `team × shared`(특정 팀, 공동 한도), 신규 구성원 지원 = `users × perPerson`(명단, 1인당).

직급·상대 결재자 해석 주의: **회사 직급은 전원 "매니저"** — `[직급]` 변수는 항상 "매니저"로 렌더된다 (예: "정성훈매니저_7월 AI Frontier"). 따라서 `[상위자]`/`[차상위자]`/`[차차상위자]`는 직급이 아니라 **조직도·직책 기준**으로 해석한다 (내 팀의 팀장 → 소속 실의 실장 → 본부장 순, `eaccounting/js/org-data.js` 조직트리 사용).

- 단일 비목 정산단위(`allowedAccountCodes` 길이 1)는 리뷰 화면에서 비목 선택 단계가 자동 생략된다.
- TRIP의 국내출장 표준 기본값: 직원은 목적지·기간만 입력하면 일비·허용비목·전결라인이 표준 규정으로 자동 세팅된다.

### Receipt (확장)

```jsonc
{
  "id": "rcpt_001",
  "source": "mobile",           // mobile(촬영) | pc(이어카운팅 업로드)
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

- **Trip** → `정산단위(type=TRIP)`으로 흡수. (구현 반영 완료 — `trips.js` 삭제됨)
- **Budget** → `정산단위(type=RECURRING)`의 `usage`로 흡수. `fixtures/budgets.json` → `fixtures/presets.json`으로 대체.

### 유지되는 엔티티 (변경 없음)

CardTransaction, Voucher, ApprovalRule(전결규정, fallback 전용), fx, accounts — `docs/02-API-CONTRACT.md` 정의 그대로. 출장비 지급기준은 `fixtures/travel-policy.json`을 단일 서버 원본으로 두고 `/api/travel-policy`로 제공한다.

## 모바일 정산단위 대시보드 (읽기 전용)

배정된 정산단위의 사용 현황을 조회하는 화면. 생성·수정은 이어카운팅에서만.

- **TRIP**: 일별 구분 없이 **비목별 누적** 현황. 특히 **일당(per-diem)** 한도 대비 사용/잔여를 중심으로 표시.
- **RECURRING**: 월 한도 대비 사용/잔여 게이지.
- 데이터는 `GET /api/presets?active=true`의 `usage`·`rules.limitKRW`를 그대로 렌더링 — 신규 API 불필요.

## Storage

- DB 없음 — 인메모리(`server/store.js`) + fixtures JSON 초기값. 서버 재시작 시 fixtures로 리셋 (의도된 동작).
- 이미지 저장: `server/uploads/` (원본/크롭 분리 경로), `.gitignore` 처리됨.

## Known Gaps

- 정산단위 자동추천(`matchKeywords`)은 단순 문자열 포함 검사 수준 — 정교한 랭킹 없음.
- 여러 정산단위가 동시에 후보로 뜰 때의 우선순위 로직 없음 (의도적 — 사용자가 항상 직접 선택).
- 전결라인 양식의 `$SUPERIOR`(차상위자) 해석은 조직도 mock(`eaccounting/js/org-data.js`) 기준.
- 단일 사용자(`u_me`) 하드코딩, 실제 인증 없음.
- 프로덕션 보안·백업 체계 없음 (PoC 범위 밖).
- 수동 크롭의 회전(quarter/fine rotation) 조정은 없음 — 크롭 실패 시 원본 사용 또는 재크롭(전체 재업로드)만 지원. `reference/RECEIPT_PROCESSING_BACKEND_REFERENCE_2026-07-22.md` 참고, 이번 라운드엔 미반영.
