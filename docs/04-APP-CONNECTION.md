# 모바일 앱 ↔ Mock e-Accounting 연결 가이드 (P2 앱 담당용)

> 이 문서는 앱이 서버에 **어떻게 붙는지**만 다룹니다.
> 데이터 모양(스키마)·매칭 규칙은 [`02-API-CONTRACT.md`](02-API-CONTRACT.md)가 원본입니다.
> **확정 사항:** 백엔드는 **단일 서버**(OCR·매칭·출장까지 전부 이 서버의 라우트), 실제 이미지 업로드는 **서버 Vision OCR 성공 시에만 저장**합니다.

## 0. 한 줄 요약

앱은 **주소 하나**만 알면 됩니다. `/api/match` → `/api/vouchers` 두 번 호출이 핵심 흐름.

- 배포(시연·모바일): `https://zero722-group1.onrender.com`
- 로컬 개발: `http://localhost:4000`
- CORS 이미 열림(`app.use(cors())`) → 다른 도메인(Vercel)에서 호출 OK.

## 1. API_BASE 설정 (하드코딩 금지)

앱 코드 한 곳에서만 주소를 관리하세요.

```js
// config.js — 앱에서 이 파일만 바꾸면 dev/prod 전환
export const API_BASE =
  location.hostname === "localhost"
    ? "http://localhost:4000"          // PC에서 로컬 서버 띄우고 개발할 때
    : "https://zero722-group1.onrender.com"; // 배포/모바일

// 사용
fetch(`${API_BASE}/api/transactions`)
```

⚠️ **혼합콘텐츠 주의**: https로 배포된 앱(Vercel)에서 `http://localhost`를 부르면 브라우저가 **차단**합니다.
→ **폰 테스트는 반드시 배포 URL(https)** 로. 로컬 http는 PC 브라우저 개발용으로만.

## 2. 기능별 호출 시퀀스

### A. 영수증 촬영 → 전표 자동작성 (핵심 데모)

```
1) [앱] 카메라로 영수증 촬영
2) POST {API_BASE}/api/receipts        (multipart, 이미지)   ─ P3
      → Receipt { id, ocr:{merchant,amount,currency,paidAt,...} }
3) POST {API_BASE}/api/match           { receiptIds:[id] }   ─ P4
      → [{ receiptId, txId, score }]   (서버가 거래 7건과 대조)
4) POST {API_BASE}/api/vouchers/preview { matches:[...] }    ─ P4
      → 전표 초안 { lines[accountCode], approvalLine[], totalKRW, status:"draft" }
5) [앱] 초안 화면 표시 → 사용자 확인/수정
6) POST {API_BASE}/api/vouchers         (초안 그대로)         ─ P1(구현됨)
      → { status:"submitted" }  + 해당 거래 status=vouchered
```

2~4는 서버가 자기 데이터로 처리하므로 앱은 그냥 순서대로 호출만 하면 됩니다.
초안을 만들 필요 없이 `receipts→match→preview→vouchers`를 **한 번씩** 부르면 끝.

### B. 법인카드 미정산 목록 보기

```
GET {API_BASE}/api/transactions?status=unmatched   ─ P1(구현됨)
```

### C. 복지비(AI구독/도서) 잔여한도

```
GET {API_BASE}/api/budgets?userId=u_me             ─ P1(구현됨)
```

### D. 출장모드(환율·일일한도)

```
POST {API_BASE}/api/trips        출장 등록           ─ P5
GET  {API_BASE}/api/trips/:id    Cap 계산 조회        ─ P5
GET  {API_BASE}/api/fx           환율 테이블          ─ P1(구현됨)
```

## 3. 앱이 쓰는 엔드포인트 & 구현 상태

| 앱 화면/동작 | 호출 | 담당 | 지금 상태 |
|---|---|---|---|
| 미정산 카드목록 | `GET /api/transactions` | P1 | ✅ 동작 |
| 영수증 업로드→OCR | `POST /api/receipts` | P3 | ✅ 실제 OCR 성공 건만 저장 |
| OCR 설정 확인 | `GET /api/receipts/ocr-status` | P3 | ✅ 비밀값 제외 상태 반환 |
| 매칭 | `POST /api/match` | P4 | ✅ 동작 |
| 전표 초안 | `POST /api/vouchers/preview` | P4 | ✅ 동작 |
| 전표 상신 | `POST /api/vouchers` | P1 | ✅ 동작 |
| 복지 한도 | `GET /api/budgets` | P1 | ✅ 동작 |
| 계정과목표 | `GET /api/accounts` | P1 | ✅ 동작 |
| 전결규정 | `GET /api/approval-rules` | P1 | ✅ 동작 |
| 환율 | `GET /api/fx` | P1 | ✅ 동작 |
| 출장 | `POST/GET /api/trips` | P5 | ⏳ 501 |

> 실제 데이터 화면은 API 실패를 샘플 성공으로 바꾸지 않습니다. 실패 상태를 사용자에게 표시하고 재시도할 수 있게 합니다.

```js
async function callApi(url, opts) {
  const r = await fetch(url, opts);
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.message || `API ${r.status}`);
  return body;
}
```

## 4. 실제 OCR 저장 원칙

`POST /api/receipts`는 이미지를 받아 Vision OCR을 호출합니다.
가맹점과 금액을 정상 인식한 경우에만 Receipt를 저장하고 목록에 노출합니다.

- 응답의 `ocrMode`가 `real`이어야 실제 인식 성공입니다.
- 키 미설정·제공자 오류·타임아웃·불완전한 인식 결과는 4xx/5xx와 `saved:false`를 반환합니다.
- 실패한 업로드 파일과 DB 항목은 즉시 제거되며 샘플 영수증으로 대체하지 않습니다.
- `GET /api/receipts/ocr-status`에서 `configured:true`, `actualUploadFallback:false`를 확인할 수 있습니다.

## 5. 데모 운영 체크리스트

- **콜드스타트**: 무료플랜은 15분 방치 후 첫 요청 ~50초. **시연 직전 앱으로 한 번 열어 깨워두기.**
- **리셋**: 재시연 전 `POST {API_BASE}/api/reset` → 거래 상태·전표 초기화(fixtures로 복구).
- **상태 공유 주의**: 서버는 인메모리 단일 인스턴스. 여러 명이 동시에 상신하면 **같은 유상욱 데이터**를 함께 바꿉니다. 발표자 1명만 쓰기 동작 권장.
- **HTTPS**: 앱(Vercel)·서버(Render) 둘 다 https → PWA 카메라/서비스워커 OK.
