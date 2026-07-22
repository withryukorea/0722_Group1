# 모바일 증빙 수집 PWA

최신 `sot/`의 시스템 경계와 `design/screens/mobile/`의 화면 기준을 반영한 모바일 우선 웹앱입니다. 모바일은 영수증 증빙을 수집·확인해 공용 서버에 저장하는 역할만 담당하며, 카드 매칭·전표작성·첨부·상신은 E-Accounting에서 계속합니다.

## 사용자 흐름

1. 배정된 출장·정산단위를 읽기 전용으로 확인
2. 카메라 촬영 또는 갤러리에서 영수증 선택
3. 자동 크롭 결과 확인
4. OCR 결과 수정
5. 정산단위·허용 비목·부가세 확인
6. 공용 서버에 증빙 저장
7. `E-Accounting에서 계속`으로 카드 매칭·전표작성 화면 이동

출장 정산단위 생성·수정, 카드 승인내역 매칭 확정, 전표 미리보기 및 상신은 모바일에서 수행하지 않습니다.

## 서버 경계

모바일이 직접 쓰는 API는 아래 두 가지입니다.

- `POST /api/receipts`: 원본 이미지 업로드 및 OCR 시작
- `PATCH /api/receipts/:id`: 수정한 OCR·정산단위·비목·부가세 저장

다음 API는 읽기 전용 화면 구성에 사용합니다.

- `GET /api/presets?active=true`
- `GET /api/receipts`
- `GET /api/transactions`

쓰기 요청에는 데모 폴백을 적용하지 않습니다. 서버 저장에 실패하면 성공 화면으로 넘어가지 않고 현재 단계에 머물러 재시도를 안내합니다. `샘플` 버튼은 화면 확인 전용이며 서버에 저장되지 않았음을 완료 화면에 명시합니다.

`PATCH /api/receipts/:id` 응답은 수정된 `ocr`, `presetId`, `accountCode`, `vat.confirmed`를 그대로 반환해야 합니다. 모바일은 응답값을 다시 검증하고, 일부 값이 저장되지 않았으면 완료로 처리하지 않습니다.

## 설정

같은 Express 서버에서 `/app`으로 제공될 때는 API를 동일 출처로 호출합니다. 별도 배포 환경은 `app.js`보다 먼저 아래 런타임 값을 선언할 수 있습니다.

```html
<script>
  window.RECEIPT_APP_CONFIG = {
    apiBase: 'https://example-api.invalid',
    eAccountingUrl: 'https://example.invalid/eaccounting/',
    demoFallback: true
  };
</script>
```

`demoFallback`은 목록 조회용 데모에만 적용됩니다. 실제 업로드와 수정 저장은 항상 서버 성공 응답이 있어야 완료로 표시됩니다.

## 구현 기준

- `sot/`이 Source of Truth입니다.
- Trip/Budget 별도 엔티티를 만들지 않고 서버가 제공하는 Preset(`TRIP`/`RECURRING`/`CAMPAIGN`)을 정산단위로 표시합니다.
- 출장비 한도는 모바일에서 계산하거나 하드코딩하지 않고 서버 값을 읽기 전용으로 표시합니다.
- 추천값은 자동 확정하지 않으며 사용자가 OCR·정산단위·비목·부가세를 저장 전에 확인합니다.
- 영수증의 진실 원본은 서버이며, 브라우저 상태는 화면 표시용입니다.
- 대시보드 월간 사용액은 `/api/receipts`의 유효 영수증을 결제일 기준으로 집계하며 `DUPLICATE_DOCUMENT`는 제외합니다. 카드 승인내역 전체 합계를 사용액으로 표시하지 않습니다.
