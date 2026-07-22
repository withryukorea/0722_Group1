# 모바일 정산 PWA

`docs/05-APP-README.md`의 출장 중심 사용자 여정을 반영하되, 최신 `sot/` 기준과 저장소의 공용 Express API에 맞춘 모바일 우선 정적 웹앱입니다.

화면은 `design/screens/mobile/`의 홈·촬영·영수증·일정 스냅샷과 `design/components/`의 SK 테마를 기준으로 통합했습니다. `design/`은 시각 기준이며, 실제 데이터와 동작은 이 폴더의 API 어댑터와 공용 서버를 사용합니다.

## 현재 포함된 최소 흐름

1. 국내/해외 출장 장소·기간 설정과 한도 계산
2. 사용금액·남은 한도·소진율 대시보드
3. 영수증 촬영 또는 사진 선택과 크롭 확인
4. OCR 결과 확인·수정
5. Preset·허용 비목·부가세 사용자 확정
6. 카드 승인내역 자동매칭 및 모호한 결과 확인
7. 전표 초안과 증빙 연결 검토
8. 상신 후 e-Accounting 이동

하단 메뉴는 디자인 기준에 맞춰 `홈 / 촬영 / 영수증 / 일정` 4개로 구성됩니다. 카드 승인내역은 홈과 영수증 화면에서 필요한 시점에 진입합니다.

서버 API가 아직 구현되지 않았거나 연결되지 않으면 같은 구조의 데모 데이터로 화면 흐름을 확인합니다. 실제 상신처럼 오해하지 않도록 완료 화면에 데모 상태를 명시합니다.

## 서버 경계

- `POST /api/receipts`
- `PATCH /api/receipts/:id`
- `POST /api/match`
- `POST /api/vouchers/preview`
- `POST /api/vouchers`
- `GET/POST /api/presets`

API 호출은 `api.js`, 주소·기능 설정은 `config.js`, 화면 상태는 `app.js`에 있습니다. 서버·fixtures는 이 앱에서 수정하지 않습니다.

배포 환경에서 서버 주소가 달라지면 `app.js`보다 먼저 아래 값을 선언합니다.

```html
<script>
  window.RECEIPT_APP_CONFIG = {
    apiBase: 'https://example-api.invalid',
    demoFallback: true
  };
</script>
```

## 구현 기준

- `sot/`이 현재 Source of Truth입니다. Trip/Budget 별도 엔티티를 만들지 않고 Preset(`TRIP`/`RECURRING`/`CAMPAIGN`)으로 통합합니다.
- `docs/05-APP-README.md`의 Next.js·Prisma·Claude API 설명은 초기 별도 앱 기획안입니다. 현재 구현은 SoT가 정한 기존 Express + 인메모리 store 패턴과 새 DB 금지 원칙을 따릅니다.
- 출장모드 시작은 `POST /api/presets`로 TRIP Preset을 만들고, 대시보드는 `GET /api/presets?active=true`의 `usage`를 읽기 전용으로 표시합니다.
- Preset 추천은 하이라이트일 뿐이며, 사용자가 Preset·허용 비목·부가세를 직접 확정합니다.
- 브라우저 상태는 화면 시연용이며 영수증·전표의 진실 원본은 서버입니다.

복지비, 다건 전표, 항목 분리 플래그는 별도 기획이 확정될 때 추가합니다.
