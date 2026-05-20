# autodev — 격리된 자율 개발 환경

Docker로 격리된 컨테이너 안에서 Claude Code가 완전 자율로 개발을 수행하는 애드온.
설계: `docs/superpowers/specs/2026-05-21-autonomous-dev-in-docker-design.md`

## 사전 준비

1. 호스트에서 1회: `claude setup-token` → 출력된 OAuth 토큰 복사
2. 대상 레포 루트에 `.autodev.env` 생성 (gitignore됨):
   ```
   CLAUDE_CODE_OAUTH_TOKEN=<발급한 토큰>
   GH_TOKEN=<fine-grained PAT — 해당 레포 contents+PR write>
   ```
   ⚠️ `ANTHROPIC_API_KEY`는 절대 넣지 말 것 (종량제 과금 전환).
3. 대상 레포 루트에 `autodev.config.sh` 생성 (`autodev.config.sh.example` 복사 후 수정)
4. 대상 레포 루트에 `SPEC.md` 작성 (자율 개발할 작업 명세)

## 실행

```bash
cd <대상 레포>
<애드온 경로>/run-autodev.sh            # 실제 실행
<애드온 경로>/run-autodev.sh --dry-run  # API 없이 루프 메커니즘만 검증
```

## 테스트

```bash
cd claude-workspace-template/addons/autodev
bash tests/test-lib.sh        # lib 단위 테스트 (호스트)
bash tests/test-firewall.sh   # 방화벽 (Docker 필요)
bash tests/test-isolation.sh  # 격리 (Docker 필요)
bash tests/test-loop.sh       # 루프 e2e dry-run (Docker 필요)
```
