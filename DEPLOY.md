# 배포 가이드 — 가짜 e-Accounting 서버 (Render)

이 서버 하나를 배포하면 **가짜 이어카운팅 화면 + API가 한 번에 공개 URL**로 열립니다.
- 화면: `https<배포주소>/` (메인), `/card-settlement.html` (법인카드 정산)
- API : `https<배포주소>/api/transactions` 등

## 1. Render 배포 (최초 1회, 약 10~15분)

1. https://render.com 가입 (GitHub 계정으로 로그인 추천)
2. 대시보드 → **New +** → **Blueprint**
3. **`withryukorea/0722_Group1`** 저장소 선택 → **Connect**
   - 저장소 루트의 `render.yaml` 을 자동으로 읽어 설정이 채워집니다.
4. **Apply** 클릭 → 빌드가 시작됩니다 (몇 분 소요).
5. 완료되면 `https://mock-eaccounting-xxxx.onrender.com` 형태의 **공개 URL**이 생깁니다.

> ⚠️ 무료 플랜은 15분간 요청이 없으면 잠듭니다. 잠든 뒤 첫 접속은 30~50초 걸릴 수 있어요.
> **시연 직전에 한 번 열어 미리 깨워두세요.**

## 2. 접속 확인

- 브라우저에서 공개 URL 열기 → 메인 대시보드가 보이면 성공
- `공개URL/api/transactions` → JSON 7건이 나오면 API 정상

## 3. 모바일 앱(다른 팀원)과 연결

모바일 앱(PWA)은 별도로 Vercel에 배포하고, **API 주소를 이 공개 URL로** 설정하면 됩니다.
```js
// 모바일 앱 코드에서
const API_BASE = "https://mock-eaccounting-xxxx.onrender.com";
fetch(`${API_BASE}/api/transactions`)
```
CORS는 서버에 이미 열려 있어(`app.use(cors())`) 다른 도메인에서 호출해도 됩니다.

## 4. 자동 재배포

`render.yaml`의 `autoDeploy: true` 덕분에 **main 브랜치에 푸시하면 Render가 자동으로 다시 배포**합니다.
데이터(fixtures)나 화면을 고치고 main에 올리면 몇 분 뒤 공개 URL에 반영됩니다.
