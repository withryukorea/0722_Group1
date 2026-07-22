# design — 화면(UI) 작업 폴더

이 폴더는 화면 개발 산출물만 관리한다. 다른 팀원 영역(`server/`, `fixtures/`, `docs/`)은 여기서 건드리지 않는다.

## 구조

```
design/
├── screens/     화면 단위 파일 (화면 1개 = 파일 1개)
├── components/  여러 화면에서 재사용하는 조각
└── assets/      이미지·아이콘·폰트 등 정적 리소스
```

## 규칙

- 화면 파일 이름은 화면 이름을 그대로 쓴다. 예: `screens/receipt-capture.html`
- 데이터는 `fixtures/`를 진실로 삼는다 (docs/03-ROLES-TIMELINE.md 규칙 2).
- API 스키마가 필요하면 `docs/02-API-CONTRACT.md`를 먼저 본다.
