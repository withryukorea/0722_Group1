# Mock E-Accounting 서버 (P1)

사내망 연결 불가 → 시연용 "회사 회계 시스템" 역할. 카드승인내역·전표·전결규정·예산·환율 API와 관리자 웹화면을 제공한다.

## 실행

```bash
cd server
npm install
npm start
```

- 관리자 화면: http://localhost:4000/
- API 베이스: http://localhost:4000/api

> 서버 재시작하면 `fixtures/` 초기값으로 리셋됩니다. 데모 중에도 관리자 화면의 **[데모 리셋]** 버튼으로 초기화할 수 있습니다.

## API 목록

| Method | Path | 설명 | 상태 |
|--------|------|------|------|
| GET | `/api/transactions?status=unmatched` | 카드승인내역 | ✅ P1 |
| PATCH | `/api/transactions/:id` | 상태/매칭/계정과목 갱신 | ✅ P1 |
| GET | `/api/vouchers` | 접수 전표 목록 | ✅ P1 |
| POST | `/api/vouchers` | 전표 상신 | ✅ P1 |
| GET | `/api/approval-rules` | 전결규정 | ✅ P1 |
| GET | `/api/budgets?userId=u_me` | 복지비 잔여 한도 | ✅ P1 |
| GET | `/api/fx` | 환율 테이블 | ✅ P1 |
| GET | `/api/accounts` | 계정과목 코드표 | ✅ P1 |
| POST | `/api/reset` | 데모 초기화 | ✅ P1 |
| POST | `/api/receipts` | 업로드→OCR | ✅ P3 (WoZ 폴백 포함) |
| POST | `/api/match` | 영수증↔거래 매칭 | ✅ P4 |
| POST | `/api/vouchers/preview` | 전표 초안 생성 | ✅ P4 |
| POST/GET | `/api/trips` `/api/trips/:id` | 출장 등록/조회 | ✅ TRIP Preset 별칭 (presets.js) |

## 팀원 안내

- **서버 없이도 개발 가능**: `fixtures/*.json` 을 직접 import 해서 프론트/엔진을 만드세요.
- **P3/P4/P5**: 자기 라우트 파일(위 표)만 채우면 서버에 자동 연결됩니다. 다른 파일 건드릴 필요 없음 → 병합 충돌 없음.
- 스키마를 바꿔야 하면 `docs/02-API-CONTRACT.md` 를 먼저 고치고 전원 공지.
