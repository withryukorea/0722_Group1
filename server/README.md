# Mock E-Accounting 서버 (P1)

사내망 연결 불가 → 시연용 "회사 회계 시스템" 역할. 카드승인내역·전표·전결규정·예산·환율 API와 관리자 웹화면을 제공한다.

## 실행

```bash
cd server
npm install
npm start
```

## 영구 저장 모드 (Supabase)

기본 로컬 실행은 기존 인메모리 모드다. Render에서 아래 환경변수가 모두 있으면 서버 시작 시
`public.app_state(id=main)`을 불러오고, 성공한 모든 쓰기 API를 응답 전에 JSONB 스냅샷으로 저장한다.
실 영수증 원본·크롭 이미지는 비공개 `receipt-images` Storage 버킷에 저장하고 API가 프록시한다.

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_BUCKET=receipt-images
SUPABASE_STATE_ID=main
```

초기 스키마는 `supabase/migrations/202607230001_app_state.sql`을 SQL Editor에서 실행한다.
Secret key는 RLS를 우회하는 서버 전용 키이므로 프론트엔드나 Git에 넣지 않는다.

- `GET /api/persistence-status`: `{configured,ready,mode,revision,lastSavedAt,error}` 확인
- Supabase가 설정됐는데 테이블·키가 잘못된 경우 서버는 메모리 모드로 조용히 시작하지 않고 부팅을 실패시킨다.
- Supabase가 미설정된 로컬 개발만 `mode:"memory"`로 동작한다.

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
| GET | `/api/travel-policy` | 국내·해외 출장비 지급 기준 | ✅ 기준표 연동 |
| POST | `/api/reset` | 데모 초기화 | ✅ P1 |
| GET | `/api/persistence-status` | DB 연결·최근 저장 상태(비밀값 제외) | ✅ Supabase |
| POST | `/api/receipts` | 실 이미지→Vision OCR / 명시적 `{key}`→WoZ 데모 | ✅ P3 (실 이미지 실패 시 미저장) |
| POST | `/api/match` | 영수증↔거래 매칭 | ✅ P4 |
| POST | `/api/vouchers/preview` | 전표 초안 생성 | ✅ P4 |
| POST/GET | `/api/trips` `/api/trips/:id` | 출장 등록/조회 | ✅ TRIP Preset 별칭 (presets.js) |

## 팀원 안내

- **서버 없이도 개발 가능**: `fixtures/*.json` 을 직접 import 해서 프론트/엔진을 만드세요.
- **P3/P4/P5**: 자기 라우트 파일(위 표)만 채우면 서버에 자동 연결됩니다. 다른 파일 건드릴 필요 없음 → 병합 충돌 없음.
- 스키마를 바꿔야 하면 `docs/02-API-CONTRACT.md` 를 먼저 고치고 전원 공지.
