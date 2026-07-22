# Git 협업 지침

이 저장소는 여러 사람이 각자 작업 브랜치에서 개발하고 Pull Request(PR)로 검토를 요청하는 방식으로 운영합니다.

## 핵심 원칙

1. `main` 브랜치에 직접 커밋하거나 푸시하지 않습니다.
2. 모든 변경은 개인 작업 브랜치에서 진행하고 PR을 생성합니다.
3. PR의 병합은 지정된 병합 관리자만 수행합니다.
4. 다른 사람의 브랜치를 강제로 변경하거나 삭제하지 않습니다.
5. 비밀번호, API 키, 토큰, 개인정보 및 실제 회사 데이터는 커밋하지 않습니다.

## 병합 권한

- 병합 관리자: 유상욱
- 관리자 이메일: `sksmsanj@gmail.com`
- `main`에 대한 PR 병합, 직접 업데이트, 되돌리기 및 긴급 수정은 병합 관리자만 수행합니다.
- 팀원은 PR 작성과 수정까지만 하고 **Merge 버튼을 누르지 않습니다.**

> GitHub 권한은 커밋 이메일이 아니라 GitHub 사용자명 또는 팀으로 제어됩니다. 저장소 관리자는 `sksmsanj@gmail.com`에 연결된 본인 GitHub 계정만 `main` Ruleset의 우회 권한 대상으로 등록해야 합니다. 커밋 이메일은 누구나 설정할 수 있으므로 권한 확인 수단으로 사용하면 안 됩니다.

## 최초 설정

자신의 이름과 GitHub 이메일을 설정합니다. 병합 관리자의 정보를 대신 사용하지 마세요.

```bash
git config user.name "본인 이름"
git config user.email "본인 GitHub 이메일"
git config --get user.name
git config --get user.email
```

저장소를 처음 내려받는 경우:

```bash
git clone https://github.com/withryukorea/0722_Group1.git
cd 0722_Group1
```

## 작업 순서

### 1. 최신 `main`에서 시작

```bash
git switch main
git pull --ff-only origin main
```

`git status`에 수정된 파일이 보이면 먼저 본인의 변경을 커밋하거나 임시 보관한 뒤 브랜치를 전환합니다.

### 2. 개인 작업 브랜치 생성

```bash
git switch -c feat/<github-id>-<작업명>
```

브랜치 이름은 영문 소문자와 하이픈을 권장합니다.

- 기능: `feat/<github-id>-receipt-upload`
- 버그 수정: `fix/<github-id>-matching-error`
- 문서: `docs/<github-id>-api-guide`
- 환경/정리: `chore/<github-id>-server-config`

한 브랜치에는 한 가지 목적의 변경만 담습니다. 여러 사람이 같은 브랜치를 함께 사용하지 않습니다.

### 3. 변경 확인 후 커밋

```bash
git status
git diff
git add <변경한 파일 경로>
git diff --staged
git commit -m "feat: 영수증 업로드 API 추가"
```

커밋 메시지는 `종류: 변경 내용` 형식을 사용합니다.

- `feat`: 기능 추가
- `fix`: 버그 수정
- `docs`: 문서 변경
- `refactor`: 동작 변화 없는 구조 개선
- `test`: 테스트 변경
- `chore`: 설정, 의존성, 기타 정리

### 4. 작업 브랜치 푸시

```bash
git push -u origin feat/<github-id>-<작업명>
```

이후 같은 브랜치에서는 `git push`만 사용하면 됩니다.

### 5. PR 생성

- 대상 브랜치는 반드시 `main`으로 선택합니다.
- 제목에 변경 목적을 간결하게 적습니다.
- 변경 내용, 확인 방법, 영향 범위와 남은 문제를 작성합니다.
- 화면이 바뀌었다면 캡처를 첨부합니다.
- 미완성 작업은 Draft PR로 생성합니다.
- 병합 관리자를 reviewer로 지정하고, 직접 병합하지 않습니다.

## 작업 중 `main` 변경사항 반영

PR 병합 전에 작업 브랜치를 최신 상태로 맞춥니다.

```bash
git fetch origin
git rebase origin/main
```

충돌이 발생하면 파일의 `<<<<<<<`, `=======`, `>>>>>>>` 표시를 확인하여 내용을 정리한 뒤 진행합니다.

```bash
git add <충돌을 해결한 파일>
git rebase --continue
```

해결이 확실하지 않으면 `git rebase --abort`로 중단하고 팀에 도움을 요청합니다. 이미 푸시한 **본인 전용 브랜치**를 rebase했다면 다음 명령만 허용합니다.

```bash
git push --force-with-lease
```

`git push --force`는 사용하지 않습니다. `--force-with-lease`도 `main`, 다른 사람의 브랜치 또는 공동 브랜치에는 절대 사용하지 않습니다.

## PR 제출 전 확인

현재 구현된 서버는 자동 테스트 명령이 없으므로 최소한 다음 실행 확인을 합니다.

```bash
cd server
npm install
npm start
```

- 서버가 오류 없이 시작되는지 확인합니다.
- 변경한 API 또는 화면을 직접 실행해 확인합니다.
- 불필요한 로그, 임시 파일 및 주석 처리된 코드를 제거합니다.
- API 스키마가 바뀌면 `docs/02-API-CONTRACT.md`를 함께 수정하고 팀에 알립니다.
- 의존성이 바뀌면 `package.json`과 lock 파일을 함께 반영합니다.

## 주의사항

- `main`에 직접 `git push`하지 않습니다.
- 공유 브랜치에서 `git reset --hard`, `git clean -fd`, `git push --force`를 사용하지 않습니다.
- 다른 팀원의 커밋을 임의로 삭제, 수정하거나 rebase하지 않습니다.
- `.env`, 인증서, 토큰, 비밀번호 및 실제 영수증/법인카드 정보는 커밋하지 않습니다.
- 대용량 바이너리, 빌드 결과물, `node_modules`를 커밋하지 않습니다.
- unrelated 변경을 한 PR에 섞지 않습니다.
- 충돌 해결 시 양쪽 변경을 이해하지 못했다면 임의로 한쪽을 선택하지 말고 해당 작성자와 확인합니다.
- 이미 공개된 커밋의 이력을 바꾸는 작업은 병합 관리자와 먼저 합의합니다.

비밀정보가 커밋된 경우 단순히 파일을 삭제하는 것만으로 해결되지 않습니다. 즉시 팀과 관리자에게 알리고, 해당 키나 토큰을 폐기·재발급한 뒤 이력 정리 여부를 결정합니다.

## 병합 관리자 절차

병합 관리자는 다음을 확인한 뒤 GitHub에서 **Squash and merge**를 수행합니다.

1. PR의 목적과 변경 범위가 명확한지 확인합니다.
2. 모든 대화와 요청 사항이 해결되었는지 확인합니다.
3. 서버 실행 또는 관련 검증 결과를 확인합니다.
4. 비밀정보와 불필요한 파일이 포함되지 않았는지 확인합니다.
5. 대상 브랜치가 `main`인지 확인합니다.
6. 병합 후 원격 작업 브랜치를 삭제합니다.

## GitHub에서 병합 권한 강제하기

이 문서만으로는 병합 권한이 강제되지 않습니다. 저장소 관리자가 GitHub의 `Settings` → `Rules` → `Rulesets`에서 `main` 대상 Branch ruleset을 생성하고 활성화해야 합니다.

권장 설정:

- 대상: Default branch 또는 `main`
- Enforcement status: `Active`
- `Restrict updates`
- `Restrict deletions`
- `Require a pull request before merging`
- `Require conversation resolution before merging`
- `Require linear history`
- `Block force pushes`
- Bypass 권한: `sksmsanj@gmail.com`에 연결된 병합 관리자 GitHub 계정만 허용

개인 저장소라면 병합 관리자만 Admin 권한을 유지하고 팀원은 Write 이하로 설정합니다. 조직 저장소라면 병합 관리자 한 명만 포함된 전용 팀을 만들어 Bypass 대상으로 지정합니다. 다른 역할, 팀 또는 앱에는 Bypass 권한을 주지 않습니다.
