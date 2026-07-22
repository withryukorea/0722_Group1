# 출장 영수증 자동 정산 앱

출장 중 법인카드로 결제한 영수증을 사진으로 촬영하면, Claude API(비전 모델)가 영수증을 분석해 법인카드 거래 내역과 자동으로 매칭하고, 출장 한도 대비 소진율까지 보여주는 데모 웹앱입니다.

## 주요 기능

- **출장 개요 입력**: 출장 장소·기간을 입력하면 국내/해외 여부에 따른 일당 한도, 출장여비 한도(=일당 한도 × 출장일수)를 자동 계산
- **영수증 촬영/분석**: 모바일 카메라로 영수증을 촬영하면 Claude API가 가맹점명/금액/날짜/카테고리를 자동 추출
- **자동 매칭**: 추출된 금액·날짜를 기준으로 법인카드 거래 내역과 자동 매칭 (모호하면 수동 선택 UI 제공)
- **대시보드**: 일당 한도, 현재까지 사용 금액, 소진율(진행률 바)을 표시
- **정산 전송(목업)**: "출장끝 e-accounting 전송" 버튼으로 매칭 완료된 거래를 정산완료 처리 (실제 사내 시스템 연동은 없음 — 자체 DB 기반 데모)

## 기술 스택

- Next.js 14 (App Router, TypeScript)
- Prisma ORM + SQLite (파일 기반 DB, 별도 서버 설치 불필요)
- Anthropic Claude API (`@anthropic-ai/sdk`) — 영수증 이미지 분석
- Tailwind CSS

## 사전 요구사항

- Node.js 18 이상 (LTS 권장)
- Anthropic API 키 ([console.anthropic.com](https://console.anthropic.com)에서 발급)

## 설치 및 실행 방법

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env
# .env 파일을 열어 ANTHROPIC_API_KEY 값을 실제 API 키로 채워넣기

# 3. DB 마이그레이션 적용 + Prisma Client 생성
npx prisma migrate dev

# 4. 목업(시드) 데이터 생성 — 3일간 부산 출장을 가정한 법인카드 거래 7건
npx prisma db seed

# 5. 개발 서버 실행
npm run dev
```

브라우저에서 `http://localhost:3000` 접속. 최초 접속 시 출장 개요 입력 화면(`/trip-setup`)으로 자동 이동합니다.

모바일 카메라로 테스트하려면, PC와 같은 Wi-Fi에 연결된 휴대폰 브라우저에서 `http://<PC의 로컬 IP>:3000`으로 접속하세요 (예: `http://192.168.0.10:3000`). PC의 로컬 IP는 `ipconfig`(Windows) / `ifconfig`(Mac/Linux)로 확인할 수 있습니다.

## 환경변수

| 변수 | 설명 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API 키. 비어있으면 영수증 업로드 시 인증 오류가 발생합니다. |
| `ANTHROPIC_MODEL` | 사용할 Claude 모델명 (기본값: `claude-sonnet-5`) |
| `DATABASE_URL` | SQLite DB 파일 경로 (기본값: `file:./dev.db`, 수정 불필요) |

`.env`를 수정한 뒤에는 반드시 `npm run dev`를 재시작해야 반영됩니다 (Next.js는 서버 시작 시점에만 환경변수를 읽습니다).

## 프로젝트 구조

```
prisma/
  schema.prisma        # CardTransaction, Receipt, TripInfo 데이터 모델
  seed.ts              # 목업 법인카드 거래 데이터
src/
  app/
    page.tsx                       # 메인 대시보드
    trip-setup/page.tsx            # 출장 개요 입력 화면
    capture/page.tsx               # 영수증 촬영 화면
    transactions/                  # 법인카드 거래 목록/상세
    receipts/                      # 촬영한 영수증 목록/상세
    api/
      trip/route.ts                # 출장 정보 생성/조회
      trip/settle/route.ts         # 정산 전송(목업) — MATCHED → SETTLED
      receipts/route.ts            # 영수증 업로드 → Claude 분석 → 자동 매칭
      transactions/[id]/match/route.ts  # 수동 매칭
  lib/
    anthropic.ts        # Claude 비전 API 호출
    matching.ts          # 금액/날짜 기반 매칭 알고리즘
    tripPolicy.ts         # 국내/해외 일당 한도 정책 및 총한도 계산
    db.ts                 # Prisma 싱글턴
  components/            # UI 컴포넌트 (카메라 캡처, 상태 배지 등)
public/uploads/          # 업로드된 영수증 이미지 저장 위치 (git 미포함)
```

## 매칭 규칙

1. 상태가 "영수증 필요"인 거래 중, 추출된 금액과 **정확히 일치**하는 거래를 후보로 조회
2. 거래일과 영수증 촬영일이 **±3일 이내**인 후보만 필터링
3. 후보가 **정확히 1건**이면 자동 매칭, **0건 또는 2건 이상**이면 미매칭 처리 후 수동 선택 UI 제공

## 출장 한도 정책 (`src/lib/tripPolicy.ts`)

- 국내 출장: 일당 한도 30,000원
- 해외 출장: 일당 한도 80,000원
- 출장여비 한도 = 일당 한도 × 출장일수(시작일~종료일 포함)
- 소진율 = 출장 기간 내 법인카드 사용 금액 합계 / 출장여비 한도 × 100

## 트러블슈팅

- **"Could not resolve authentication method..." 오류**: `.env`의 `ANTHROPIC_API_KEY`가 비어있는 경우 발생합니다. 키를 입력한 뒤 개발 서버를 재시작하세요.
- **Windows에서 `node`/`npm` 명령을 찾을 수 없음**: Node.js 설치 경로가 PATH에 없는 경우입니다. Node.js를 재설치하거나 PATH에 설치 경로를 직접 추가하세요.
- **Prisma Client 생성 시 `EPERM: operation not permitted` 오류**: 개발 서버가 실행 중인 상태에서 `prisma generate`/`migrate`를 실행하면 발생할 수 있습니다. 개발 서버를 잠시 중지한 뒤 다시 실행하세요.

## 알려진 제한사항 (해커톤 데모 범위)

- 실제 사내 정산 시스템과의 연동은 없으며, 자체 SQLite DB에 데이터를 저장/조회하는 목업입니다.
- 인증/다중 사용자 기능은 없습니다 (단일 사용자, 단일 출장 기준 데모).
- 출장 정보를 새로 입력하면 기존 출장 정보는 대체됩니다 (이력 관리 없음).
