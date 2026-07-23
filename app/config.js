const isWeb = ['http:', 'https:'].includes(location.protocol);

/**
 * 기능 논의가 끝나기 전까지 화면 코드와 서버 주소를 분리한다.
 * 배포 환경에서 window.RECEIPT_APP_CONFIG를 먼저 선언하면 값을 덮어쓸 수 있다.
 */
const runtime = window.RECEIPT_APP_CONFIG || {};

export const APP_CONFIG = Object.freeze({
  apiBase: runtime.apiBase ?? (isWeb ? '' : 'http://localhost:4000'),
  // Render 콜드스타트 + Vision OCR 시간을 함께 기다린다. 서버 OCR 자체 제한은 30초.
  requestTimeoutMs: runtime.requestTimeoutMs || 70000,
  eAccountingUrl: runtime.eAccountingUrl || '../eaccounting/card-settlement.html?source=mobile',
});

export const ACCOUNT_OPTIONS = Object.freeze([
  { code: 'SNACK', name: '간식비' },
  { code: 'ENTERTAIN', name: '복리후생-회식' },
  { code: 'TRAVEL_MEAL', name: '출장-식대' },
  { code: 'TRAVEL_TRANSPORT', name: '출장-교통' },
  { code: 'TRAVEL_LODGING', name: '출장-숙박' },
  { code: 'SUPPLIES', name: '사무용품비' },
  { code: 'WELFARE_AI', name: '복지-AI구독' },
  { code: 'WELFARE_BOOK', name: '복지-도서' },
]);
