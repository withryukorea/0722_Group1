# 0722_Group1 — 영수증 전표 자동화 "찍으면 끝"

법인카드 영수증을 찍기만 하면 자동 크롭·OCR·카드내역 매칭을 거쳐
전표(계정과목·전결라인 포함)가 자동완성되는 시스템. 사람은 검토만 한다.

10시간 · 5인 해커톤 프로젝트. 사내망 연결 불가 → Mock E-Accounting으로 시연.

## 문서

| 문서 | 내용 |
|------|------|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Git 협업 절차, 브랜치·PR 규칙, 병합 권한 및 주의사항 |
| [docs/01-PLANNING.md](docs/01-PLANNING.md) | 기획서: 문제정의, MVP 범위, 아키텍처 결정, 데모 시나리오 |
| [docs/02-API-CONTRACT.md](docs/02-API-CONTRACT.md) | 데이터 모델 + API 계약 (H1에 동결, 병렬 개발의 기준) |
| [docs/03-ROLES-TIMELINE.md](docs/03-ROLES-TIMELINE.md) | 5인 역할 분담 + 10시간 타임라인 + 스코프 컷 순서 |

## 구조 (예정)

```
/app       모바일 웹앱 (P2, P5)
/server    Mock E-Accounting API + OCR + 매칭엔진 (P1, P3, P4)
/fixtures  시드/목업 데이터 — 병렬 개발용 (P1)
/docs      기획 문서
```
