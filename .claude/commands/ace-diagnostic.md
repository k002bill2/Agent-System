---
name: ace-diagnostic
description: ACE Framework 거버넌스 상태 진단 - 훅 등록, 참조 무결성, 병렬 상태 확인
---

# ACE Framework 진단

아래 진단을 **순서대로** 실행하고 결과를 테이블로 정리하세요.

## 1. Hook 등록 상태

```bash
cat .claude/settings.json | python3 -c "
import json, sys
h = json.load(sys.stdin)['hooks']
print('| Event | Rules | Hooks |')
print('|-------|-------|-------|')
for event, rules in h.items():
    total = sum(len(r['hooks']) for r in rules)
    print(f'| {event} | {len(rules)} | {total} |')
print(f'\nTotal: {sum(len(r[\"hooks\"]) for rules in h.values() for r in rules)} hooks')
"
```

## 2. 끊어진 참조 검사

```bash
# ACE 구 경로 참조
echo "=== 구 경로 (shared/ace-framework) ===" && grep -r "shared/ace-framework" .claude/agents/ --include="*.md" 2>/dev/null || echo "PASS: 0건"

# 훅 파일 존재 확인
echo "=== Hook 파일 존재 ===" && for f in ethicalValidator.js parallelCoordinator.js agentTracer.js geminiAutoTrigger.js contextMonitor.js stopEvent.js userPromptSubmit.js workspaceGuard.js; do [ -f ".claude/hooks/$f" ] && echo "  ✅ $f" || echo "  ❌ $f (MISSING)"; done
```

## 3. Enforcement Matrix 정합성

```bash
# settings.json P2 훅 수 vs enforcement-matrix P2 행 수
echo "=== P2 Hard Constraints ===" && echo "settings.json hooks: $(cat .claude/settings.json | python3 -c "import json,sys; h=json.load(sys.stdin)['hooks']; print(sum(len(r['hooks']) for rules in h.values() for r in rules))")" && echo "enforcement-matrix P2 rows: $(grep -c '^| P2-' .claude/skills/ace-framework/references/enforcement-matrix.md)"
```

## 4. 병렬 실행 상태

```bash
node .claude/hooks/parallelCoordinator.js status
```

## 5. 에이전트-레지스트리 일관성

```bash
python3 -c "
import json
reg = json.load(open('.claude/agents-registry.json'))['agents']
import os
agent_files = [f[:-3] for f in os.listdir('.claude/agents') if f.endswith('.md')]
print('| Agent | In Registry | Has File |')
print('|-------|------------|----------|')
all_names = sorted(set(list(reg.keys()) + agent_files))
for name in all_names:
    in_reg = '✅' if name in reg else '❌'
    has_file = '✅' if name in agent_files else '❌'
    print(f'| {name} | {in_reg} | {has_file} |')
"
```

## 판정 기준

- **HEALTHY**: 모든 항목 통과
- **NEEDS-ATTENTION**: 경고 1-2건
- **CRITICAL**: 끊어진 참조 또는 누락 훅 파일
