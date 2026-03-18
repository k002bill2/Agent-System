---
name: ace-diagnostic
description: ACE Framework 거버넌스 상태 진단 - 훅 등록, 참조 무결성, 병렬 상태 확인.
disable-model-invocation: true
---

# ACE Framework 진단

아래 진단을 **순서대로** 실행하고 결과를 테이블로 정리하세요.

## 1. Hook 등록 상태

```bash
# hooks.json 또는 settings.json에서 훅 정보 읽기
for f in .claude/hooks.json .claude/settings.json; do
  [ -f "$f" ] && python3 -c "
import json, sys
data = json.load(open('$f'))
h = data.get('hooks', data) if 'hooks' in data or isinstance(data, dict) else {}
if not isinstance(h, dict) or not h:
    sys.exit(0)
print('| Event | Rules | Hooks |')
print('|-------|-------|-------|')
total = 0
for event, rules in h.items():
    if isinstance(rules, list):
        cnt = sum(len(r.get('hooks',[])) for r in rules)
        total += cnt
        print(f'| {event} | {len(rules)} | {cnt} |')
print(f'\nTotal: {total} hooks (from $f)')
" && break
done
```

## 2. 훅 파일 존재 확인

```bash
echo "=== Hook 파일 존재 ==="
for f in aceMatrixSync.js agentTracer.js gemini-bridge.js geminiAutoTrigger.js parallelCoordinator.js userPromptSubmit.js; do
  [ -f ".claude/hooks/$f" ] && echo "  ✅ $f" || echo "  ❌ $f (MISSING)"
done
```

## 3. 끊어진 참조 검사

```bash
# 에이전트에서 구 경로 참조 확인
echo "=== 구 경로 (shared/ace-framework) ==="
grep -r "shared/ace-framework" .claude/agents/ --include="*.md" 2>/dev/null || echo "PASS: 0건"

# 삭제된 훅 참조 확인
echo "=== 삭제된 훅 참조 ==="
grep -rn "ethicalValidator\|workspaceGuard\|contextMonitor\|stopEvent\|l5Verification" .claude/ --include="*.md" --include="*.json" 2>/dev/null | grep -v "ace-diagnostic.md" || echo "PASS: 0건"
```

## 4. 병렬 실행 상태

```bash
node .claude/hooks/parallelCoordinator.js status
```

## 5. 에이전트-레지스트리 일관성

```bash
python3 -c "
import json, os
reg = json.load(open('.claude/agents-registry.json'))['agents']
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
