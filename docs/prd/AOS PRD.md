

> 💡 **한 줄 요약**: 복잡한 개발 과업을 스스로 분해·실행하며, 인간이 실시간으로 사고 과정을 제어(HITL)하는 고도화된 멀티 에이전트 협업 플랫폼

**마지막 업데이트:** 2026년 2월 4일
**상태:** ✅ Phase 1-3 구현 완료

---

## 📋 1. 제품 개요

**Target:** 소프트웨어 엔지니어링 팀, 테크 리드, PM
**Platform:** Web Dashboard (Desktop optimized) & CLI
**Core Value:** 개발 생산성 극대화 및 AI 에이전트의 불확실성 제어

---

## 🎯 2. 비전 & 목표

### 💫 비전

- **"Autonomous yet Controllable"**: 자율적으로 코드를 작성하지만, 인간이 언제든 개입하여 방향을 수정할 수 있는 공존형 개발 환경 구축
- 단순 반복 코딩 업무를 100% 자동화하고, 인간은 아키텍처 설계와 리뷰에 집중

---

## 📊 3. 핵심 지표 (Success Metrics)

| 지표 | 목표 |
| :--- | :--- |
| 📈 **Task Success Rate** | **≥ 90%** (단위 테스트 통과 기준) |
| ⚡ **Avg. Turnaround Time** | 개발 리드타임 **50% 단축** |
| 💰 **Cost Efficiency** | 인간 개발자 대비 비용 **1/10 수준** |
| 🛡️ **Human Intervention** | 태스크 당 개입 횟수 **< 2회** |

---

## 👥 4. 타깃 사용자

> 🎯 **Primary**: 시니어 개발자 및 테크 리드

### 특징

- 복잡한 아키텍처 설계를 에이전트에게 위임하고 싶어 함
- AI가 작성한 코드의 품질과 보안을 우려하여 **통제권**을 쥐고 싶어 함
- 실시간으로 에이전트의 로그(Thought Process)를 보고 싶어 함

---

## 💔 5. Pain Points

> ❌ **현재 문제점**

### A. 블랙박스화 된 AI

- 기존 AI 코딩 툴은 결과만 보여줄 뿐, 어떤 논리로 짰는지 **과정**을 알기 어려움

### B. 컨텍스트 유지 실패

- 프로젝트 규모가 커지면 이전 파일의 내용을 잊어버리거나 환각(Hallucination) 발생

---

## ⚙️ 6. 주요 기능

### 🔥 Core Features (Phase 1 - ✅ 완료)

| 기능 | 설명 | 상태 |
| :-- | :-- | :--: |
| **🧠 계층적 태스크 관리** | 메인 에이전트(Planner)가 목표를 서브 태스크로 분해 및 할당 | ✅ |
| **👀 실시간 사고 스트리밍** | 에이전트의 Thought-Action-Observation 루프를 시각화 | ✅ |
| **✋ HITL (Human-in-the-Loop)** | 위험 작업(삭제, 배포) 전 사용자 승인 및 개입 절차 | ✅ |
| **📊 Cost/Token Monitor** | 에이전트별 토큰 소모량 및 비용 실시간 대시보드 | ✅ |

### 🛡️ Safety Features (Phase 2 - ✅ 완료)

| 기능 | 설명 | 상태 |
| :-- | :-- | :--: |
| **🔄 Self-Correction** | 에러 발생 시 로그를 분석하여 스스로 수정 시도 (최대 3회) | ✅ |
| **🛡️ Sandbox Execution** | Docker 컨테이너 내에서 안전하게 코드 실행 | ✅ |
| **📂 RAG Context** | ChromaDB 기반 프로젝트 컨텍스트 검색 | ✅ |
| **🔐 인증 시스템** | OAuth (Google/GitHub) + Email/Password | ✅ |

### 🚀 Enterprise Features (Phase 3 - ✅ 완료)

| 기능 | 설명 | 상태 |
| :-- | :-- | :--: |
| **🔗 MCP 통합** | Model Context Protocol로 외부 도구 연동 | ✅ |
| **🌿 Git 통합** | 브랜치 관리, 머지, PR, 충돌 해결 | ✅ |
| **🏢 조직 관리** | 멀티테넌트, 멤버 초대, 역할 기반 권한 | ✅ |
| **📈 Analytics** | 멀티 프로젝트 비교, 성능 분석 | ✅ |
| **🤖 멀티 LLM** | Gemini, Claude, Ollama, GPT-4o 지원 | ✅ |
| **📝 Audit Trail** | 모든 액션 기록 및 무결성 검증 | ✅ |
| **💬 RLHF Feedback** | 사용자 피드백 수집 및 데이터셋 생성 | ✅ |
| **🎮 Playground** | 에이전트 테스트 환경 | ✅ |
| **⚡ 프로젝트 모니터링** | 헬스 체크 (test, lint, build, type_check) | ✅ |

### 🎨 Personalization Features

| 기능 | 설명 | 상태 |
| :-- | :-- | :--: |
| **📂 Project Configs** | 웹 UI에서 Skills, Agents, MCP, Hooks 관리 | ✅ |
| **🛠️ Custom Tools** | MCP 서버로 사내 도구 등록 | ✅ |

---

## 🛤️ 7. 사용자 여정 (예시)

> 💻 **기능 구현 시나리오**

| 단계 | 상황 | 시스템 동작 |
| :--- | :--- | :--- |
| **Planning** | 유저: "로그인 페이지 만들어줘" | 메인 에이전트가 UI, API, DB 태스크로 분해 |
| **Assign** | 서브 에이전트 할당 | Coder 에이전트에게 파일 생성 권한 부여 |
| **Execution** | 코드 작성 중 | 실시간으로 코드 Diff와 사고 과정 스트리밍 |
| **Review** | 유저: "디자인이 좀 다른데?" | 유저 피드백을 반영하여 즉시 수정 (Re-planning) |

---

## 💰 8. 수익모델

### 🏢 B2B SaaS

- **Basic:** 월 구독료 (토큰 별도)
- **Enterprise:** On-Premise 설치, 사내 보안 규정 준수 커스텀

### 플랜별 제한

| 플랜 | 멤버 | 프로젝트 | 일일 세션 | 월간 토큰 |
|------|------|---------|----------|----------|
| Free | 5 | 3 | 100 | 100K |
| Starter | 10 | 10 | 500 | 500K |
| Professional | 50 | 50 | 2,000 | 2M |
| Enterprise | ∞ | ∞ | ∞ | ∞ |

---

## 🗺️ 9. 출시 로드맵

| Phase | 버전 | 상태 | 내용 |
| :--- | :--- | :---: | :--- |
| **Phase 1** | v1.0 | ✅ | 핵심 오케스트레이션, LangGraph 노드, 기본 대시보드 |
| **Phase 2** | v1.1 | ✅ | Self-Correction, RAG, HITL 승인, 샌드박스 |
| **Phase 3** | v1.2 | ✅ | MCP 통합, Git 협업, 조직 관리, Analytics, RLHF |
| **Phase 4** | v2.0 | 📋 | Kubernetes 스케일링, RBAC, E2E 암호화 |

---

## 📊 10. 현재 구현 현황

### Backend

| 카테고리 | 수량 |
|----------|------|
| Services | 34개 |
| API Routers | 25개 |
| Data Models | 24개 |
| LangGraph Nodes | 6개 |
| Agents | 6개 |

### Dashboard

| 카테고리 | 수량 |
|----------|------|
| Pages | 19개 |
| Zustand Stores | 21개 |
| Components | 112개 |

---

## ⚠️ 11. 주요 리스크 & 대응

| 🚨 리스크 | 🛡️ 대응 | 상태 |
| :--- | :--- | :---: |
| **무한 루프(비용 폭탄)** | Circuit Breaker 도입 (max_iterations=100) | ✅ |
| **보안 사고 (코드 유출)** | Docker 샌드박스, 네트워크 격리 | ✅ |
| **환각 (Hallucination)** | Self-Correction, RAG 컨텍스트 주입 | ✅ |
| **비용 폭주** | 토큰/비용 실시간 추적, Rate Limiting | ✅ |
| **권한 관리** | 조직별 역할 기반 권한, HITL 승인 | ✅ |
