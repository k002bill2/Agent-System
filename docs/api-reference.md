# API Reference

AOS Backend API 엔드포인트 문서입니다.

## Base URL
- Development: `http://localhost:8000`

---

## 도메인별 API 문서

| 도메인 | 파일 | 주요 내용 |
|--------|------|-----------|
| Core | [api/core.md](api/core.md) | Sessions, Auth, WebSocket, HITL |
| Agents | [api/agents.md](api/agents.md) | Agents, Orchestration, Tmux, MCP, Claude Sessions |
| Projects | [api/projects.md](api/projects.md) | Registry, Configs, Versions, Access, Invitations, Monitoring |
| Git | [api/git.md](api/git.md) | Status, Branches, Merge, MR, Branch Protection, GitHub |
| LLM | [api/llm.md](api/llm.md) | Models, Router, Credentials, Proxy, Playground |
| Monitoring | [api/monitoring.md](api/monitoring.md) | Usage, Analytics, Audit, Health, Notifications, Orgs, Admin, Rate Limits, Cost, Feedback |
| Automation | [api/automation.md](api/automation.md) | Workflows, Secrets, Webhooks, Pipelines, RAG, Warp |

> 새 API 엔드포인트 추가 시 해당 도메인 파일에 추가하세요.
