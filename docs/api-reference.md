# API Reference

AOS Backend API 엔드포인트 문서입니다.

## Base URL
- Development: `http://localhost:8000`

---

## 도메인별 API 문서

| 도메인 | 파일 | 주요 내용 |
|--------|------|-----------|
| Core | [api/core.md](api/core.md) | Sessions, Tasks, Auth, HITL, Permission Toggles, WebSocket |
| Agents | [api/agents.md](api/agents.md) | Agents, Orchestration, Tmux, MCP, Claude Sessions |
| Projects | [api/projects.md](api/projects.md) | Registry, Configs, Versions, Access, Invitations, Monitoring, Diagnostics |
| Git | [api/git.md](api/git.md) | Status, Branches, Merge, MR, Branch Protection, GitHub |
| LLM | [api/llm.md](api/llm.md) | Models, Router, Credentials, Access, Proxy, Usage Ledger, Playground |
| Monitoring | [api/monitoring.md](api/monitoring.md) | Usage, Analytics, External Usage, Audit, Health, Notifications, Orgs, Admin, Rate Limits, Cost, Feedback |
| Automation | [api/automation.md](api/automation.md) | Workflows, Secrets, Webhooks, Artifacts, Templates, Automation Loops, Pipelines, Terminal, Warp, MCP Protocol, RAG |

> 새 API 엔드포인트 추가 시 해당 도메인 파일에 추가하세요.

> ⚠️ **미마운트 라우터**: `automation.py`(Automation Loops)와 `pipelines.py`(Pipelines)는 구현은 있으나
> `app.py`/`routes.py` 어디에도 등록되지 않아 런타임에 접근 불가합니다. 해당 절은 참조용으로만 유지됩니다
> ([api/automation.md](api/automation.md) 참조).
