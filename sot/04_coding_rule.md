# 4. Coding Rule

## Project Instruction Sources

- `README.md`, `docs/01-PLANNING.md` ~ `03-ROLES-TIMELINE.md` — 원 해커톤 기획 (역사적 참고, 이 SoT와 충돌하면 SoT 우선).
- 이 `sot/` 폴더 — 고도화 PoC의 현재 기준.

레퍼런스 프로젝트(`Corp_Card_Receipt_Mgmt`)의 코딩 규칙은 프로덕션 보안·PII 취급 규모에 맞춘 것이라 이 PoC에는 대부분 과함. 아래는 이 프로젝트 스케일에 맞게 축소한 규칙이다.

## General Development Rules

- fixtures가 진실이다 — 서버가 없어도 `fixtures/*.json`을 import해서 개발할 수 있어야 한다.
- API 계약(`docs/02-API-CONTRACT.md` + `sot/05_api.md`) 변경 시 문서를 먼저 고치고 공유한다.
- 기존 패턴(Express 라우터 구조, 인메모리 store)을 그대로 따른다 — 새 프레임워크나 DB 도입 금지 (PoC 범위).
- 변경 범위는 요청받은 기능에 한정한다 — 관련 없는 리팩터링 금지.
- 주석은 코드로 알 수 없는 이유가 있을 때만 추가한다.

## Data Handling Rules

- 실물 데모 영수증 이미지, 실제 카드번호·직원정보는 커밋하지 않는다 (`server/uploads/`는 이미 `.gitignore` 처리됨).
- fixtures는 전부 합성 데이터만 사용한다.
- `.env`, API 키 등 시크릿은 커밋하지 않는다 (Vision LLM API 키 등).

## Test / Build

```bash
cd server && npm install && npm run dev
```

정식 테스트 스위트는 이번 PoC 범위 밖이다. 데모 시나리오 수동 리허설이 검증 방법이며, 기존 해커톤 관행(`docs/03-ROLES-TIMELINE.md` H3 중간 체크인, H8~H9 리허설)을 그대로 따른다.

## Branch / Commit

- 작은 단위로 커밋하고, 기능 단위로 브랜치를 나눈다.
- 통합(H6 이후) 시점 이후의 머지는 PM 역할(원래 P5) 승인을 원칙으로 한다 — `docs/03-ROLES-TIMELINE.md` 규칙 그대로 적용.
