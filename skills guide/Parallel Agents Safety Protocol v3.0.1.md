# Parallel Agents Safety Protocol v3.0.1
## ACE Framework Integration Edition - LiveMetro Project

## Document Information
- **Version**: 3.0.1
- **Last Updated**: 2025-01-03
- **Status**: Active - ACE Framework Integrated for LiveMetro
- **Scope**: Multi-agent parallel execution for LiveMetro React Native development
- **Framework**: Based on Autonomous Cognitive Entity (ACE) Framework
- **Project**: LiveMetro - Seoul Metropolitan Subway Real-Time Information App
- **Previous Version**: 2.0 (Safety Protocol with Skill/MCP Integration)

---

## Table of Contents

1. [ACE Framework Foundation](#1-ace-framework-foundation)
2. [Core Principles & Agent Hierarchy](#2-core-principles--agent-hierarchy)
3. [Agent Roles and Responsibilities](#3-agent-roles-and-responsibilities)
4. [Resource Management](#4-resource-management)
5. [Communication Protocol](#5-communication-protocol)
6. [Skill Auto-Invocation Protocol](#6-skill-auto-invocation-protocol)
7. [MCP CLI Coordination Rules](#7-mcp-cli-coordination-rules)
8. [Validation and Quality Assurance](#8-validation-and-quality-assurance)
9. [Complete Workflow Examples](#9-complete-workflow-examples)
10. [Error Handling and Recovery](#10-error-handling-and-recovery)
11. [Performance Optimization](#11-performance-optimization)
12. [Continuous Improvement & Feedback](#12-continuous-improvement--feedback)
13. [Testing and Validation](#13-testing-and-validation)
14. [Maintenance and Evolution](#14-maintenance-and-evolution)

---

## 1. ACE Framework Foundation

### 1.1 ACE Layer Architecture

This protocol implements a **6-layer ACE (Autonomous Cognitive Entity) framework** adapted for parallel agent coordination:
```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: ASPIRATIONAL LAYER                                 │
│ Purpose: Define ethical principles and universal constraints│
│ Scope: All agents, all operations                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: GLOBAL STRATEGY LAYER                              │
│ Purpose: Maintain overall mission and long-term goals       │
│ Scope: Primary Agent (with user input)                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: AGENT MODEL LAYER                                  │
│ Purpose: Self-awareness of capabilities and limitations     │
│ Scope: All agents (individual self-assessment)              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: EXECUTIVE FUNCTION LAYER                           │
│ Purpose: Task decomposition and resource allocation         │
│ Scope: Primary Agent (coordination)                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 5: COGNITIVE CONTROL LAYER                            │
│ Purpose: Task selection and conflict prevention             │
│ Scope: All agents (local execution control)                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 6: TASK PROSECUTION LAYER                             │
│ Purpose: Actual execution with tools and skills             │
│ Scope: All agents (parallel operation)                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ FEEDBACK LOOPS (Cross-Layer)                                │
│ Purpose: Continuous learning and protocol evolution         │
│ Scope: All layers (bidirectional feedback)                  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Layer Interaction Rules

**Downward Flow (Top → Bottom):**
- Aspirational principles constrain all lower layers
- Strategic goals guide executive decisions
- Self-awareness informs task acceptance
- Executive function allocates work
- Cognitive control manages execution
- Task prosecution performs actual work

**Upward Flow (Bottom → Top):**
- Execution results update agent model (learning)
- Task outcomes refine executive strategies
- Strategic success validates aspirational alignment
- Continuous feedback improves all layers

**Cross-Layer Communication:**
- Any layer can trigger emergency abort to all layers
- Ethical violations at any level escalate to Aspirational Layer
- Performance metrics feed back to Agent Model Layer

---

## 2. Core Principles & Agent Hierarchy

### 2.1 Aspirational Layer: Ethical Principles

All agents in parallel execution must adhere to these core principles:

#### 2.1.1 Core Mission (Heuristic Imperatives)

**1. Reduce Suffering**
- Prevent data loss through robust backup and validation (critical for user preferences, favorite stations)
- Avoid user frustration via clear communication and transparency (subway delays impact daily commutes)
- Minimize errors through pre-flight checks and cross-validation (accurate arrival times are essential)
- Abort operations that risk app instability or crashes (users depend on real-time information)

**2. Increase Prosperity**
- Maximize efficiency through intelligent parallelization (faster API responses, better UX)
- Optimize resource usage (respect Seoul Open Data API rate limits, minimize Firebase reads)
- Enable user success by delivering high-quality outputs (reliable subway information)
- Create reusable patterns for future operations (modular React Native components)

**3. Increase Understanding**
- Provide transparency in all agent actions (clear development progress)
- Explain decisions, especially when declining tasks (architectural trade-offs)
- Document all operations for audit trail (TypeScript types, code comments)
- Share learnings across agents and executions (React Native best practices)

#### 2.1.2 Universal Ethical Constraints

**Never Violate (Hard Limits):**

| Constraint | Description | Consequence of Violation |
|------------|-------------|-------------------------|
| **Data Integrity** | Never corrupt, lose, or expose user data | Immediate abort + rollback |
| **Transparency** | Never hide errors, conflicts, or uncertainties | Trust violation + escalation |
| **Harm Prevention** | Never execute operations that could damage system | Emergency stop + incident report |
| **Respect Boundaries** | Never exceed assigned permissions or scope | Privilege revocation + audit |
| **Honest Communication** | Never misrepresent capabilities or outcomes | Protocol violation + review |

**Agent-Specific Ethical Responsibilities:**

**Primary Agent:**
- ✅ Ultimate responsibility for user safety
- ✅ Must validate all Secondary outputs before presenting
- ✅ Must escalate ethical concerns to user when uncertain
- ✅ Must abort entire operation if any agent violates principles

**Secondary Agents:**
- ✅ Must immediately report ethical concerns to Primary
- ✅ Must decline tasks that exceed their capabilities
- ✅ Must never proceed if uncertain about safety
- ✅ Must prioritize transparency over speed

#### 2.1.3 Ethical Decision Framework

**When faced with uncertainty:**
```python
def ethical_decision_framework(action):
    # Layer 1: Hard constraint check
    if action.violates_ethical_constraints():
        abort_immediately()
        escalate_to_primary()
        log_incident(severity="critical")
        return ABORT
    
    # Layer 2: Safety uncertainty
    if action.has_uncertain_safety():
        if agent.is_primary():
            request_human_approval(action)
        else:
            escalate_to_primary(action)
        return WAIT_FOR_APPROVAL
    
    # Layer 3: Capability check
    if action.exceeds_agent_capability():
        decline_task()
        suggest_alternative_or_reassignment()
        return DECLINE
    
    # Layer 4: Proceed with safeguards
    proceed_with_logging()
    monitor_execution()
    return EXECUTE
```

#### 2.1.4 Ethical Conflict Resolution

**Ethical Veto Protocol:**
```json
{
  "type": "ethical_veto",
  "invoked_by": "secondary_a",
  "target_action": "modify system file without backup",
  "concern": "Violates data integrity principle (no backup)",
  "severity": "high",
  "status": "operation_halted",
  "resolution_required_from": "primary_or_user"
}
```

### 2.2 Global Strategy Layer

#### 2.2.1 Mission Context

**Primary Agent maintains:**
```json
{
  "user_goal": "Implement real-time train arrival feature with offline support",
  "success_criteria": [
    "Seoul API integration working with proper error handling",
    "Firebase fallback operational",
    "Offline cache with TTL expiration",
    "TypeScript strict mode compliance",
    "Test coverage >75%"
  ],
  "constraints": [
    "Must respect Seoul Open Data API rate limits (30s polling)",
    "Firebase read operations must be optimized (cost consideration)",
    "Must work on both iOS and Android (Expo constraints)",
    "No breaking changes to existing navigation"
  ],
  "long_term_context": "Part of LiveMetro v2.0 major release",
  "user_preferences": "Prioritize code quality and type safety over speed"
}
```

### 2.3 Agent Model Layer: Self-Awareness

#### 2.3.1 Capability Declaration

Each agent maintains explicit awareness of:
```json
{
  "agent_id": "secondary_mobile_ui",
  "capabilities": {
    "strengths": [
      "React Native component development",
      "TypeScript with strict mode",
      "React Navigation configuration",
      "Expo SDK integration",
      "Mobile UI/UX patterns"
    ],
    "weaknesses": [
      "Native module development (iOS/Android)",
      "Complex animation sequences",
      "Performance profiling at scale",
      "Backend Firebase Rules configuration"
    ],
    "tool_proficiency": {
      "bash_tool": 0.9,
      "edit": 0.95,
      "read": 1.0,
      "write": 0.90,
      "grep": 0.85,
      "glob": 0.9
    },
    "domain_expertise": {
      "react_native": 0.95,
      "typescript": 0.90,
      "mobile_design": 0.85,
      "api_integration": 0.80
    }
  },
  "resource_limits": {
    "max_concurrent_operations": 3,
    "token_budget_remaining": 50000,
    "max_file_size": "500KB",
    "max_execution_time": "10min"
  },
  "current_state": {
    "workload": 0.6,
    "active_locks": ["src/screens/HomeScreen.tsx"],
    "pending_approvals": 0,
    "error_count_recent": 0
  }
}
```

### 2.4 Fundamental Safety Rules

Building on ACE foundation:

1. **Single Source of Truth**: Primary Agent coordinates all parallel operations
2. **Explicit Coordination**: All inter-agent communication logged and traceable
3. **Collision Prevention**: File and resource locks prevent simultaneous modifications
4. **Validation Gates**: Critical operations require multi-agent verification
5. **Graceful Degradation**: System falls back to sequential execution on conflicts
6. **Ethical First**: No optimization can override Layer 1 (Aspirational) principles

### 2.5 Agent Hierarchy
```
Primary Agent (Coordinator + Strategic Decision Maker)
├── Secondary Agent 1 (Specialist + Self-Aware)
├── Secondary Agent 2 (Specialist + Self-Aware)
└── Secondary Agent N (Specialist + Self-Aware)
```


## 3. Agent Roles and Responsibilities

### 3.1 Primary Agent (Executive Function Layer)

**Core Responsibilities:**
- Task decomposition and work distribution (Layer 4)
- Resource allocation and lock management (Layer 5)
- Conflict resolution and integration (Layer 4)
- Quality assurance and final validation (Layer 5)
- User communication (Layer 2)
- Strategic adaptation when plan deviates (Layer 2)

**Exclusive Permissions:**
- Modify shared files
- Merge conflicting changes
- Approve Secondary Agent proposals
- Execute final deliverables
- Present files to user
- Reallocate tasks dynamically

**ACE-Specific Duties:**
- Maintain global strategy context (Layer 2)
- Monitor all agents' self-assessments (Layer 3)
- Enforce aspirational principles (Layer 1)
- Facilitate cross-agent learning (Feedback Loops)

### 3.2 Secondary Agents (Cognitive Control + Task Prosecution)

**Core Responsibilities:**
- Execute assigned subtasks (Layer 6)
- Report progress and blockers (Layer 5)
- Propose solutions (not implement without approval) (Layer 4)
- Perform isolated validations (Layer 5)
- Self-assess before accepting tasks (Layer 3)
- Monitor own execution and escalate deviations (Layer 3)

**Restrictions:**
- Cannot modify files locked by other agents
- Cannot make strategic decisions (Layer 2 restricted)
- Cannot communicate directly with user (unless delegated)
- Must request approval for scope changes
- Cannot override ethical constraints (Layer 1)

**ACE-Specific Duties:**
- Maintain accurate self-model (Layer 3)
- Report capability changes to Primary
- Contribute to collective learning (Feedback Loops)
- Invoke ethical veto if necessary (Layer 1)

### 3.3 Dynamic Task Reallocation (Executive Function Enhancement)

**Primary Agent's dynamic planning:**
```python
class DynamicTaskReallocator:
    def __init__(self, primary_agent):
        self.primary = primary_agent
        self.monitoring_interval = 30  # seconds
        self.deviation_threshold = 0.3  # 30% deviation triggers review
    
    def monitor_and_adapt(self):
        while execution_in_progress:
            current_state = self.assess_all_agents()
            
            # Calculate deviation from plan
            deviation = self.calculate_plan_deviation(current_state)
            
            if deviation > self.deviation_threshold:
                self.execute_dynamic_reallocation(current_state)
            
            sleep(self.monitoring_interval)
    
    def execute_dynamic_reallocation(self, state):
        """Executive decision-making for task reallocation"""
        
        # Scenario 1: Agent blocked, others idle
        blocked_agents = [a for a in state.agents if a.is_blocked]
        idle_agents = [a for a in state.agents if a.workload < 0.3]
        
        if blocked_agents and idle_agents:
            for blocked in blocked_agents:
                for idle in idle_agents:
                    if self.can_delegate(blocked.current_task, idle):
                        self.reallocate_task(
                            from_agent=blocked,
                            to_agent=idle,
                            reason="Blocked agent, idle agent available"
                        )
```

---

## 4. Resource Management

### 4.1 File Operation Protocol

#### 4.1.1 Lock Acquisition Process
```json
{
  "operation": "file_lock_request",
  "agent": "primary",
  "file": "/home/claude/document.md",
  "operation_type": "write",
  "estimated_duration": "30s",
  "timestamp": "2025-01-01T14:30:00Z",
  "ethical_clearance": true,
  "purpose": "Integrate analysis results from Secondary-A"
}
```

#### 4.1.2 Lock States

- **Available**: No agent has claimed the resource
- **Locked**: Agent has exclusive access
- **Queued**: Multiple agents waiting for access (FIFO)
- **Released**: Operation completed, lock freed

#### 4.1.3 Conflict Resolution Rules

1. **Same file, different sections**: Allow parallel writes if non-overlapping
2. **Same file, overlapping sections**: Primary wins, Secondary queues
3. **Dependent files**: Enforce sequential order
4. **Deadlock detection**: If circular wait detected, abort youngest request

### 4.2 Working Directory Isolation
```
/Users/younghwankang/Work/liveMetro2/LiveMetro/
├── src/
│   ├── screens/          # Primary Agent coordinates
│   ├── components/       # Secondary Agent A (UI components)
│   ├── services/         # Secondary Agent B (API/Firebase)
│   ├── hooks/            # Secondary Agent C (Custom hooks)
│   └── __tests__/        # All agents (isolated test files)
├── .temp/
│   ├── agent_a/          # Secondary Agent A workspace
│   ├── agent_b/          # Secondary Agent B workspace
│   └── integration/      # Merge zone (Primary controlled)
└── docs/                 # Documentation updates
```

### 4.3 Tool Access Matrix

| Tool | Primary | Secondary | Ethical Constraint | Notes |
|------|---------|-----------|-------------------|-------|
| Bash | Full | Restricted | No system-wide changes | Layer 1: Harm prevention |
| Edit | Full | Restricted | Only in assigned workspace | Layer 1: Boundary respect |
| Read | Full | Full | Safe (read-only) | No ethical concerns |
| Write | Full | Restricted | Must not overlap | Layer 1: Data integrity |
| Grep | Full | Full | Safe parallel operation | Rate limit coordination |
| Glob | Full | Full | Safe parallel operation | Pattern matching |
| WebSearch | Full | Full | Safe parallel operation | For docs/packages |
| WebFetch | Full | Full | Safe parallel operation | Max 3 concurrent |
| Task (agents) | Full | Restricted* | *needs Primary approval | Layer 1: Harm prevention |
| Skill invocation | Full | Full | Safe (read-only resources) | React Native skills |

---

## 5. Communication Protocol

### 5.1 Status Reporting Format (Cognitive Control Layer)
```json
{
  "agent_id": "secondary_a",
  "layer": "task_prosecution",
  "status": "in_progress",
  "task": "Data analysis on sales.csv",
  "progress": 75,
  "self_assessment": {
    "capability_match": 0.85,
    "confidence": "high",
    "on_track": true
  },
  "blockers": [],
  "ethical_concerns": [],
  "next_action": "Waiting for Primary to review output",
  "timestamp": "2025-01-01T14:35:00Z"
}
```

### 5.2 Coordination Messages

**Types:**

1. **Task Assignment (Layer 4 → Layer 5)**
2. **Self-Assessment Response (Layer 3 → Layer 4)**
3. **Progress Update (Layer 5 → Layer 4)**
4. **Approval Request (Layer 5 → Layer 4)**
5. **Ethical Concern (Any Layer → Layer 1)**
6. **Conflict Notification (Layer 5 → Layer 4)**
7. **Completion Report (Layer 6 → Layer 4)**
8. **Learning Share (Layer 3 → Feedback Loop)**

### 5.3 Emergency Protocols

**Abort Conditions:**
- Ethical constraint violation detected (Layer 1)
- Data corruption detected (Layer 1)
- Circular dependency discovered (Layer 5)
- User cancellation request (Layer 2)
- Critical tool failure (Layer 6)
- Agent capability severely overestimated (Layer 3)

**Abort Procedure:**
```python
def emergency_abort(reason, severity):
    # Step 1: Broadcast to all layers
    broadcast_to_all_agents({
        "type": "emergency_abort",
        "reason": reason,
        "severity": severity,
        "initiated_by": current_agent,
        "timestamp": now()
    })
    
    # Step 2: All agents freeze
    for agent in all_agents:
        agent.freeze_current_state()
        agent.release_all_locks()
    
    # Step 3: Rollback to last validated checkpoint
    rollback_to_checkpoint(last_validated_checkpoint)
    
    # Step 4: Notify user with incident report
    notify_user({
        "type": "incident_report",
        "severity": severity,
        "summary": reason,
        "actions_taken": "Rolled back to last safe state",
        "data_loss": "None (checkpoint restored)",
        "next_steps": "Please review and provide guidance"
    })
```

## 6. Skill Auto-Invocation Protocol

### 6.1 Trigger Conditions (Task Prosecution Layer)

**Mandatory skill consultation before file operations:**

| File Operation | Required Skill | Layer | Timing |
|----------------|---------------|-------|--------|
| React Native UI components | `react-native-development` | Layer 6 | Before creating screens/components |
| Push notifications | `notification-system` | Layer 6 | Before implementing alerts |
| Seoul Open Data API | `api-integration` | Layer 6 | Before API calls |
| Firebase operations | `firebase-integration` | Layer 6 | Before Firestore/Auth work |
| Custom React hooks | React Native patterns | Layer 6 | Before hook creation |
| Test automation | `test-automation` | Layer 6 | Before writing tests |

### 6.2 Skill Access Coordination

**Read-Only Resource (Safe for Parallel Access):**
- Skills are read-only, so parallel access is SAFE
- Multiple agents can view same skill simultaneously
- No locking required for skill files
- **Ethical benefit**: All agents access same quality standards

**Best Practices:**
```markdown
# ✅ Good Pattern (Parallel skill access)
Agent A: Skill react-native-development
Agent A: Write src/components/train/StationCard.tsx [using skill guidance]
Agent B: Skill api-integration  # ← Parallel OK
Agent B: Write src/services/api/seoulSubwayApi.ts [using skill guidance]

# ❌ Bad Pattern (Violates Layer 1 principles)
Agent A: Write src/components/train/StationCard.tsx  # ← Missing skill call!
# Result: Lower quality code → Type errors → Test failures → User suffering
```

### 6.3 Skill Selection Logic (Cognitive Control Layer)

**Decision Tree:**
```python
def select_and_invoke_skill(user_request, agent):
    # Step 1: Parse task type from request
    task_types = extract_task_types_from_request(user_request)

    if not task_types:
        clarify_with_user("What type of implementation? (UI/API/Firebase/Notification)")
        return

    # Step 2: Map to LiveMetro skill names
    skill_map = {
        'ui_component': 'react-native-development',
        'screen': 'react-native-development',
        'navigation': 'react-native-development',
        'api': 'api-integration',
        'seoul_data': 'api-integration',
        'notification': 'notification-system',
        'push_alert': 'notification-system',
        'firebase': 'firebase-integration',
        'firestore': 'firebase-integration',
        'auth': 'firebase-integration',
        'hook': 'react-native-development',
        'test': 'test-automation'
    }

    skills_to_invoke = [skill_map[tt] for tt in task_types if tt in skill_map]

    # Step 3: Invoke skills (Layer 6)
    for skill_name in skills_to_invoke:
        try:
            skill_tool(skill_name)
            agent.loaded_skills[skill_name] = True
            log_skill_load(agent, skill_name, success=True)
        except Exception as e:
            escalate_to_primary(
                concern="Skill invocation failed",
                principle_violated="Increase prosperity (quality degradation)",
                skill_name=skill_name,
                error=str(e)
            )
```

---

## 7. MCP CLI Coordination Rules

### 7.1 Codex CLI Usage Policies (Task Prosecution Layer)

**Primary Agent:**
- ✅ CAN use `fullAuto: true` for autonomous execution
- ✅ MUST set `sessionId: "primary-{timestamp}"` for context tracking
- ✅ CAN use `sandbox: "workspace-write"` for file operations
- ⚠️ CAN use `sandbox: "danger-full-access"` ONLY with:
  - Explicit user approval (Layer 2)
  - Clear ethical justification (Layer 1)
  - Documented necessity
- ✅ SHOULD use `workingDirectory` to isolate operations

**Secondary Agents:**
- ✅ MUST use `sessionId: "secondary-{agent-id}-{timestamp}"`
- ✅ RESTRICTED to `sandbox: "read-only"` by default (Layer 1: Harm prevention)
- ⚠️ REQUIRE Primary approval for `sandbox: "workspace-write"` (Layer 4)
- ❌ CANNOT use `sandbox: "danger-full-access"` under any circumstances (Layer 1)
- ✅ MUST use separate `workingDirectory` from Primary (Layer 5)

### 7.2 Session Management (Cognitive Control Layer)

**Naming Convention:**
```javascript
// Primary Agent
sessionId: `primary-${Date.now()}`
// Example: "primary-1704117000000"

// Secondary Agent
sessionId: `secondary-${agentId}-${Date.now()}`
// Example: "secondary-a-1704117000000"
```

**Session Isolation Rules:**
1. Each agent maintains its own session ID (Layer 5)
2. Sessions do NOT share context by design (Layer 1: Prevent information leakage)
3. If context sharing needed → Primary must explicitly pass info (Layer 4)
4. Session reuse allowed only by same agent (Layer 3: Consistency)

### 7.3 Parallel MCP Execution Examples

**Scenario A: Concurrent React Native Development Tasks**
```json
// Agent A (Primary) - Implementing UI feature
{
  "tool": "Task",
  "description": "Create station detail screen",
  "subagent_type": "react-native-development",
  "prompt": "Implement StationDetailScreen with real-time train arrival display, following LiveMetro design system and TypeScript strict mode"
}

// Agent B (Secondary) - API integration
{
  "tool": "Task",
  "description": "Seoul API integration",
  "subagent_type": "api-integration",
  "prompt": "Implement Seoul Open Data API client with rate limiting (30s polling), error handling, and TypeScript types"
}

// Agent C (Secondary) - Test creation
{
  "tool": "Task",
  "description": "Write component tests",
  "subagent_type": "test-automation",
  "prompt": "Create Jest tests for StationCard component with >75% coverage requirement"
}
```

### 7.4 Conflict Resolution (Executive Function Layer)

**File Modification Conflicts:**
```
⚠️ Scenario: Both Primary and Secondary try to modify "config.json"

Resolution Flow (Layer 4 + Layer 5):
1. Primary's changes applied immediately (workspace-write privilege)
2. Secondary's changes saved to "config.json.secondary-b.tmp"
3. Primary receives notification
4. Primary reviews diff: bash_tool: diff config.json config.json.secondary-b.tmp
5. Primary decides: Accept / Reject / Partial merge
6. Log decision in conflict_log.json
```

**Sandbox Escalation Request:**
```json
// Secondary Agent requests write access (Layer 5 → Layer 4)
{
  "type": "sandbox_escalation_request",
  "from": "secondary_a",
  "current_sandbox": "read-only",
  "requested_sandbox": "workspace-write",
  "justification": "Need to create test files for validation",
  "ethical_clearance": {
    "data_integrity": "Test files only, no production data",
    "harm_prevention": "Isolated to /home/claude/agent_a/test/ directory",
    "transparency": "All files will be logged"
  },
  "estimated_operations": 5,
  "files_to_create": [
    "/home/claude/agent_a/test/test_input.json",
    "/home/claude/agent_a/test/test_output.json"
  ]
}

// Primary Agent response (Layer 4 decision)
{
  "type": "sandbox_escalation_response",
  "status": "approved",
  "conditions": [
    "Limit to /home/claude/agent_a/ directory only",
    "No files larger than 1MB",
    "Delete all test files after validation"
  ],
  "expiration": "2025-01-01T15:00:00Z"
}
```

### 7.5 MCP Tool Coordination

**Other MCP Tools (Non-Codex):**
```markdown
# Safe for parallel use (Layer 5):
- playwright:browser_* (separate browser tabs per agent)
- filesystem:read_* (read operations are safe)
- web_search, web_fetch (coordinated rate limiting)
- view (read-only, no conflicts)

# Requires coordination (Layer 4):
- filesystem:write_file (use file locks from Section 4.1)
- filesystem:edit_file (use file locks from Section 4.1)
- filesystem:move_file (Primary only - strategic decision)
- task-master-ai:* (Primary only - Layer 2 control)
- present_files (Primary only - user communication)
```

## 8. Validation and Quality Assurance

### 8.1 Validation Gates (Multiple ACE Layers)

**Pre-Execution Validation (Layer 4 + Layer 3):**
- [ ] Task decomposition reviewed by Primary (Layer 4)
- [ ] No overlapping file assignments detected (Layer 5)
- [ ] All required skills identified and accessible (Layer 6)
- [ ] All agents self-assessed and accepted tasks (Layer 3)
- [ ] Resource requirements estimated (Layer 3)
- [ ] Rollback checkpoints defined (Layer 4)
- [ ] Ethical clearance obtained (Layer 1)

**Mid-Execution Validation (Layer 5):**
- [ ] Progress updates received from all agents (every 30s)
- [ ] No deadlocks detected (Layer 5)
- [ ] File locks properly acquired/released (Layer 5)
- [ ] No unauthorized tool usage by Secondary agents (Layer 1)
- [ ] Agent self-monitoring active (Layer 3)
- [ ] No ethical concerns raised (Layer 1)

**Post-Execution Validation (Layer 4 + Layer 2):**
- [ ] All subtasks completed successfully (Layer 6)
- [ ] File integrity verified (checksums match) (Layer 1)
- [ ] No orphaned lock files remain (Layer 5)
- [ ] Integration tests passed (Layer 4)
- [ ] Quality meets strategic goals (Layer 2)
- [ ] User-facing output ready for presentation (Layer 4)
- [ ] Learning captured for feedback loop (Feedback Layer)

### 8.2 Cross-Agent Verification (Layer 1 + Layer 4)

**When Required:**
1. Critical file modifications (e.g., production configs) → Layer 1: Data integrity
2. Complex calculations (e.g., financial computations) → Layer 1: Reduce suffering from errors
3. Security-sensitive operations (e.g., authentication code) → Layer 1: Harm prevention
4. User-facing content (e.g., reports, presentations) → Layer 2: Strategic quality

**Process:**
```python
def cross_agent_verification(primary_output, verifying_agent):
    # Step 1: Independent verification (Layer 3)
    verification_result = verifying_agent.verify_independently(primary_output)
    
    # Step 2: Compare results (Layer 5)
    if verification_result.matches(primary_output):
        log_verification(status="passed", confidence=1.0)
        return APPROVED
    
    # Step 3: Discrepancy detected (Layer 4)
    else:
        discrepancy = calculate_discrepancy(primary_output, verification_result)
        
        # Step 4: Severity assessment (Layer 1)
        if discrepancy.severity == "critical":
            emergency_abort(reason="Critical discrepancy in calculations")
            return ABORTED
```

---

## 9. Complete Workflow Examples

### 9.1 Example: Real-Time Train Arrival Feature with ACE Integration

**User Request:** "Implement real-time train arrival feature with Seoul API, Firebase fallback, and offline cache"

**Layer 2 (Global Strategy):**
```json
{
  "mission": "Deliver reliable real-time subway information to commuters",
  "success_criteria": [
    "Seoul Open Data API integration working",
    "Firebase fallback operational",
    "AsyncStorage offline cache with TTL",
    "TypeScript strict mode compliance",
    "Test coverage >75%",
    "Works on iOS and Android"
  ],
  "ethical_alignment": {
    "reduce_suffering": "Prevent user frustration from inaccurate arrival times",
    "increase_prosperity": "Help commuters plan their trips efficiently",
    "increase_understanding": "Clear, transparent data source fallback system"
  }
}
```

**Layer 4 (Executive Function) - Task Decomposition:**
```json
{
  "primary_task": "Coordinate real-time train arrival feature implementation",
  "subtasks": [
    {
      "agent": "secondary_api",
      "task": "Implement Seoul Open Data API client",
      "layer": "task_prosecution",
      "skill": "api-integration",
      "tools": ["Write", "Edit", "Read"],
      "output": "src/services/api/seoulSubwayApi.ts",
      "workspace": "/Users/younghwankang/Work/liveMetro2/LiveMetro/",
      "ethical_constraints": [
        "Respect API rate limits (30s polling minimum)",
        "Handle errors gracefully to prevent app crashes",
        "Validate all API responses before returning"
      ]
    },
    {
      "agent": "secondary_firebase",
      "task": "Implement Firebase fallback service",
      "skill": "firebase-integration",
      "tools": ["Write", "Edit", "Read"],
      "output": "src/services/train/trainService.ts",
      "workspace": "/Users/younghwankang/Work/liveMetro2/LiveMetro/",
      "ethical_constraints": [
        "Optimize Firebase reads to minimize costs",
        "Ensure data consistency with Seoul API",
        "Proper subscription cleanup to prevent memory leaks"
      ]
    },
    {
      "agent": "secondary_ui",
      "task": "Create StationDetailScreen UI",
      "skill": "react-native-development",
      "tools": ["Write", "Edit", "Read"],
      "output": "src/screens/StationDetailScreen.tsx",
      "dependencies": ["secondary_api"],
      "ethical_constraints": [
        "Follow Seoul Metro 2024 design standards",
        "Ensure accessibility (screen readers)",
        "Handle loading and error states clearly"
      ]
    },
    {
      "agent": "primary",
      "task": "Integrate data manager with multi-tier fallback",
      "tools": ["Write", "Edit", "Read", "Bash"],
      "output": "src/services/data/dataManager.ts",
      "dependencies": ["secondary_api", "secondary_firebase"],
      "ethical_constraints": [
        "Transparent fallback priority: Seoul API → Firebase → Cache",
        "Clear error messages for users",
        "No silent data corruption"
      ]
    }
  ]
}
```

**Layer 6 (Task Prosecution) - Execution Timeline:**
```
T0:00 - Primary: Task decomposition complete (Layer 4)
T0:05 - Primary: Ethical check passed (Layer 1)
T0:10 - Secondary-API: Skill api-integration invoked
T0:15 - Secondary-Firebase: Skill firebase-integration invoked
T0:20 - Secondary-UI: Skill react-native-development invoked
T2:30 - Secondary-API: Completes seoulSubwayApi.ts → Notifies Primary
T2:35 - Secondary-Firebase: Completes trainService.ts → Notifies Primary
T3:00 - Secondary-UI: Blocked (waiting for API types)
T3:05 - Primary: Exports types from seoulSubwayApi.ts
T3:10 - Secondary-UI: Resumes, creates StationDetailScreen.tsx
T5:00 - Primary: Integrates dataManager.ts with multi-tier fallback
T6:00 - Primary: Run type-check (npm run type-check)
T6:15 - Primary: Run tests (npm test)
T7:00 - Primary: All tests pass ✅ Coverage: 78%
T7:10 - Complete ✅
```

### 9.2 Example: Dynamic Reallocation with ACE Framework

**User Request:** "Add push notification feature for train delays across all lines"

**Reality at T+3min (Layer 3 monitoring):**
```json
{
  "execution_status": "deviation_detected",
  "deviations": [
    {
      "agent": "secondary_notification",
      "issue": "Expo Notifications SDK has breaking changes in v49",
      "current_progress": 15,
      "estimated_remaining": "30 minutes (migration needed)",
      "self_assessment": "Task complexity severely underestimated - SDK upgrade required"
    },
    {
      "agent": "secondary_firebase",
      "issue": "Firebase Cloud Messaging quota exceeded",
      "status": "blocked",
      "ethical_concern": "Cannot send notifications - service disruption for users"
    }
  ],
  "overall_deviation": 0.80
}
```

**Layer 4 (Executive Function) - Dynamic Adaptation:**
```
T3:00 - Primary: DEVIATION DETECTED (Layer 4)
T3:05 - Primary → User: "📱 Adaptation in progress:
        - Expo Notifications SDK breaking changes detected
        - FCM quota issue (investigating workaround)
        New approach: Local notifications + scheduled checks
        Revised ETA: 25 minutes"

T3:10 - NEW TASK ALLOCATION:
        Secondary-Notification: Implement local notifications (Expo) - 15min
        Secondary-Firebase: Setup notification queue in Firestore - 10min
        Secondary-UI: Create NotificationSettingsScreen - 12min
        Primary: Integrate notification manager with data sources - 8min

T3:20 - Primary → User: "⚠️ Ethical concern:
        FCM quota exceeded. Options:
        A) Use local notifications only (offline-capable)
        B) Queue in Firestore, send on next app open
        C) Request quota increase (24-48h delay)

        Recommending Option A for immediate functionality ✅"

T18:00 - Secondary-Notification: Local notifications working
T20:00 - Primary: Integrates with delay detection system
T23:00 - Primary: npm test (all pass, coverage: 76%)
T25:00 - Complete ✅
```

### 9.3 Example: Ethical Veto in Action

**User Request:** "Add feature to track user location history and predict future commute patterns"

**Layer 1 (Aspirational) - Ethical Analysis:**
```
T0:00 - Primary: Analyzing feature request
T0:05 - Primary: ETHICAL CONCERN DETECTED (Layer 1)
        → User location history storage raises privacy concerns

Primary → User: "⚠️ CRITICAL ETHICAL CONCERN

The requested feature would:
1. Store detailed user location history indefinitely
2. Create predictive models of user movement patterns
3. Potentially expose sensitive commute data (home/work addresses)

Privacy risks:
- User location data is highly sensitive
- GDPR/privacy law compliance concerns
- Potential data breach impact is severe

Recommended actions:
1. ✅ SAFEST: Use local-only predictions (no server storage)
2. ⚠️ ALTERNATIVE: Store encrypted, with explicit user opt-in + 30-day auto-delete
3. ⚠️ ALTERNATIVE: Aggregate station patterns only (no GPS coordinates)
4. ❌ NOT RECOMMENDED: Store detailed location history

I've halted processing to protect user privacy.
Which approach would you prefer?"
```

## 10. Error Handling and Recovery

### 10.1 Common Error Scenarios (Multi-Layer Analysis)

**Error Type 1: Deadlock (Layer 5)**
```
Detection: Circular wait timeout (30s)

Layer 5 Response:
1. Detect circular dependency
2. Abort youngest lock request
3. Notify affected agent

Layer 4 Response:
4. Investigate root cause
5. Redesign task allocation

Layer 1 Check:
- Did deadlock cause data loss? No → Low severity
- Learning captured for protocol improvement ✅
```

**Error Type 2: Tool Failure (Layer 6)**
```
Detection: Tool returns error status

Layer 6 Response:
1. Agent logs error details
2. Agent retries once

Layer 3 Response:
3. Agent self-assesses capability
4. If capable → Continue with alternative
5. If not → Escalate to Primary

Layer 1 Check:
- Does failure risk data integrity? → Abort if yes
```

### 10.2 Rollback Procedures (Layer 4 + Layer 1)

**Checkpoint Strategy:**
```json
{
  "checkpoints": [
    {
      "id": "cp_001",
      "timestamp": "T0:00",
      "layer": "initialization",
      "state": "Initial state before any operations",
      "files_snapshot": [],
      "ethical_clearance": true
    },
    {
      "id": "cp_002",
      "timestamp": "T1:00",
      "layer": "task_prosecution",
      "state": "After data analysis complete",
      "files_snapshot": ["q4_analysis.xlsx"],
      "ethical_clearance": true,
      "validation": "Cross-checked by Secondary-A"
    }
  ]
}
```

**Rollback Process:**
```python
def emergency_rollback(reason, target_checkpoint=None):
    # Layer 1: Ethical check
    if not reason.is_ethical_violation():
        log_warning("Non-ethical rollback - verify necessity")
    
    # Layer 5: Halt all agents
    broadcast_to_all_agents({"type": "emergency_halt"})
    
    # Layer 4: Identify rollback target
    checkpoint = get_last_validated_checkpoint()
    
    # Layer 6: Restore files
    restore_files_from_checkpoint(checkpoint)
    
    # Layer 2: Notify user
    notify_user({
        "type": "rollback_complete",
        "reason": reason,
        "checkpoint_restored": checkpoint.id
    })
```

### 10.3 Incident Logging (Feedback Loop)

**Comprehensive Incident Log Format:**
```json
{
  "incident_id": "INC_20250101_001",
  "timestamp": "2025-01-01T14:45:30Z",
  "severity": "high",
  "type": "data_corruption",
  "affected_layers": [
    "layer_1_aspirational (data integrity violated)",
    "layer_6_task_prosecution (merge operation failed)"
  ],
  "root_cause": {
    "immediate": "File encoding mismatch (UTF-8 vs UTF-16)",
    "underlying": "No pre-merge encoding validation"
  },
  "ethical_impact": {
    "principle_violated": "Data integrity (Layer 1)",
    "suffering_caused": "None (detected before user exposure)"
  },
  "resolution": {
    "action_taken": "Emergency rollback to cp_003",
    "fix_implemented": "Added pre-merge encoding normalization",
    "time_to_resolve": "15 minutes"
  },
  "prevention": {
    "protocol_updates": [
      {
        "section": "4.1 File Operation Protocol",
        "addition": "Pre-merge validation: Normalize all encodings to UTF-8"
      }
    ]
  }
}
```

---

## 11. Performance Optimization (Layer 2 + Layer 4)

### 11.1 Parallelization Guidelines (Executive Function)

**When to Parallelize (Layer 4 Decision):**
- ✅ Independent research tasks
- ✅ Different file types (docx + xlsx + pptx)
- ✅ Read-only operations
- ✅ Separate codex sessions
- ✅ Agent capabilities match distinct subtasks (Layer 3 informed)

**When NOT to Parallelize (Layer 1 + Layer 4):**
- ❌ Sequential dependencies
- ❌ Same file modifications
- ❌ Shared state operations
- ❌ Rate-limited resources
- ❌ Ethical concerns about parallel processing

### 11.2 Resource Utilization Targets

| Metric | Target | Warning | Critical | Layer |
|--------|--------|---------|----------|-------|
| Concurrent Agents | 1+2-3 | 5+ | 8+ | Layer 4 |
| File Locks | <3 | 5+ | 10+ | Layer 5 |
| Web Fetch/min | <20 | 30+ | 50+ | Layer 6 |
| Token Budget | >20% | <20% | <10% | Layer 3 |
| Ethical Concerns | 0 | 1 | 2+ | Layer 1 |

### 11.3 Efficiency Patterns (Layer 4 Design Patterns)

**Pattern 1: Fan-Out / Fan-In**
```
Primary (1) [Strategic coordination]
  ↓ [Fan-Out: Distribute independent subtasks]
Secondary-A, B, C (3 parallel)
  ↓ [Fan-In: Collect and aggregate]
Primary (1) [Integration]

Efficiency Gain: ~3x speedup
```

**Pattern 2: Pipeline**
```
Stage 1: Extract (parallel) → Validate
Stage 2: Transform (parallel) → Validate
Stage 3: Load (Primary)

Efficiency Gain: ~2x speedup
```

**Pattern 3: Hierarchical**
```
Primary [Strategic decomposition]
├─ Secondary-A [Component A]
│  ├─ Sub-task A1
│  └─ Sub-task A2
└─ Secondary-B [Component B]
   ├─ Sub-task B1
   └─ Sub-task B2

Efficiency Gain: ~2x + better quality
```

---

## 12. Continuous Improvement & Feedback Loops

### 12.1 Telemetry Collection (All Layers → Feedback Loop)

**What to Log:**
```json
{
  "execution_id": "exec_20250101_001",
  "telemetry": {
    "layer_1_aspirational": {
      "ethical_concerns_raised": 0,
      "ethical_vetos_invoked": 0,
      "ethical_compliance_score": 1.0
    },
    "layer_2_global_strategy": {
      "mission_success": true,
      "strategic_pivots": 0,
      "user_satisfaction": "high"
    },
    "layer_3_agent_model": {
      "self_assessments_accurate": 0.90,
      "capability_overestimations": 1,
      "learning_events": 3
    },
    "layer_4_executive_function": {
      "task_decomposition_quality": 0.88,
      "dynamic_reallocations": 0,
      "conflict_resolutions": 2
    },
    "layer_5_cognitive_control": {
      "task_completion_rate": 1.0,
      "deadlocks": 0,
      "conflicts": 2
    },
    "layer_6_task_prosecution": {
      "tool_success_rate": 0.96,
      "skill_invocations": 3,
      "mcp_sessions": 2
    }
  }
}
```

### 12.2 Post-Execution Review (Feedback Loop → All Layers)

**Comprehensive Review Process:**
```python
class PostExecutionReview:
    def conduct_review(self):
        # Layer 1: Ethical compliance review
        self.review_layer_1_ethical_compliance()
        
        # Layer 2: Strategic goal achievement
        self.review_layer_2_goal_alignment()
        
        # Layer 3: Agent model accuracy
        self.review_layer_3_agent_assessments()
        
        # Layer 4: Executive decision quality
        self.review_layer_4_coordination()
        
        # Layer 5: Operational efficiency
        self.review_layer_5_execution_control()
        
        # Layer 6: Technical execution
        self.review_layer_6_tool_usage()
        
        return self.generate_comprehensive_report()
```

### 12.3 Cross-Agent Learning (Layer 3 ↔ Feedback Loop)

**Learning Share Protocol:**
```json
{
  "learning_event_id": "learn_20250101_001",
  "type": "cross_agent_learning",
  "initiated_by": "secondary_a",
  "insight": {
    "title": "Excel pivot tables require 2x processing time",
    "context": "Discovered during Q4 analysis",
    "confidence": 0.85,
    "sample_size": 1
  },
  "recommendation": {
    "action": "Update estimation model: Check for pivot tables, apply 2x multiplier",
    "affected_layer": "layer_3_agent_model"
  },
  "validation_request": {
    "status": "pending",
    "validators": ["secondary_b", "secondary_c"]
  }
}
```

**Learning Validation Cycle:**
```
T0: Secondary-A shares learning (Confidence: 0.85, Sample: 1)
T+3 days: Secondary-B validates → CONFIRM (Confidence: 0.88, Sample: 2)
T+5 days: Secondary-C validates → CONFIRM (Confidence: 0.91, Sample: 3)
T+5 days: Learning PROMOTED to validated ✅
          Applied to all agents' estimation models
```

### 12.4 Adaptation Cycle
```
┌─────────────────────────────────────────┐
│ EXECUTION                                │
│ • Telemetry collected from all layers   │
└─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│ TELEMETRY ANALYSIS                      │
│ • Identify patterns                     │
└─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│ LEARNING EXTRACTION                     │
│ • What worked? What failed?             │
└─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│ PROTOCOL UPDATE                         │
│ • Update all 6 ACE layers               │
└─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│ NEXT EXECUTION                          │
│ • Apply updated protocol                │
└─────────────────────────────────────────┘
```

**Update Triggers:**
1. Every 10 executions: Review efficiency
2. After any incident: Update protocol
3. Weekly: Aggregate learnings
4. Monthly: Major protocol review
5. After ethical veto: Immediate Layer 1 review
## 13. Testing and Validation

### 13.1 Pre-Deployment Checklist

**Before enabling parallel execution with ACE Framework:**
- [ ] Layer 1: All agents understand ethical principles
- [ ] Layer 2: Global strategy template ready
- [ ] Layer 3: Agent self-assessment working
- [ ] Layer 4: Executive function tested
- [ ] Layer 5: File lock protocol validated
- [ ] Layer 6: Skill auto-invocation tested
- [ ] MCP CLI session management verified
- [ ] Conflict resolution tested
- [ ] Rollback mechanisms validated
- [ ] Emergency abort confirmed
- [ ] Cross-agent learning functional
- [ ] Telemetry collection working

### 13.2 Test Scenarios

**Test 1: Basic Parallel Execution**
- Setup: 1 Primary + 2 Secondary
- Expected: No conflicts, 2x efficiency ✅

**Test 2: Conflict Handling**
- Setup: Both agents modify same file
- Expected: Primary wins, Secondary queues ✅

**Test 3: Ethical Veto**
- Setup: File contains sensitive PII
- Expected: Immediate halt, user notified ✅

**Test 4: Dynamic Reallocation**
- Setup: File 10x larger than expected
- Expected: Task split across agents ✅

**Test 5: Agent Self-Assessment**
- Setup: Assign task beyond capability
- Expected: Agent declines transparently ✅

### 13.3 Performance Benchmarks

**Sequential vs Parallel (LiveMetro Development):**
```
Task: Real-time train arrival feature (API + Firebase + UI + Tests)

Sequential: 45min
Parallel (v2.0): 28min (1.6x)
Parallel + ACE (v3.0.1 LiveMetro): 22min (2.0x)

Quality:
Sequential: Good (manual coordination)
v2.0: Good (basic parallelization)
v3.0.1: Excellent (skill invocation + TypeScript strict + 75%+ test coverage)

Code Quality Metrics:
- Type safety: 100% (strict mode)
- Test coverage: 78% average
- Linting errors: 0
- React Native best practices: Enforced via skills
```

---

## 14. Maintenance and Evolution

### 14.1 Document Updates

**Version Control:**
- Major (X.0): Breaking changes to ACE structure
- Minor (3.X): New sections, significant additions
- Patch (3.0.X): Clarifications, examples

**Review Cycle:**
- Every 10 executions: Micro-optimizations
- After incidents: Immediate updates
- Weekly: Aggregate learnings
- Monthly: Major review
- Quarterly: Strategic assessment

### 14.2 Feedback Integration

**Sources:**
1. Layer 1: Ethical concern logs
2. Layer 2: User satisfaction scores
3. Layer 3: Self-assessment accuracy
4. Layer 4: Coordination efficiency
5. Layer 5: Conflict rates
6. Layer 6: Tool success rates
7. Cross-Layer: Overall efficiency

**Improvement Process:**
```
Collect → Identify patterns → Propose updates → Test → Deploy → Monitor
```

### 14.3 Future Enhancements

**Planned Features:**
1. Layer 1: Adaptive ethical thresholds
2. Layer 2: Predictive strategy (ML-based)
3. Layer 3: Advanced agent models
4. Layer 4: AI-powered coordination
5. Layer 5: Smart lock management
6. Layer 6: Tool orchestration
7. Cross-Layer: Real-time dashboard
8. Cross-Layer: Federated learning

---

## Appendix A: Quick Reference

### ACE Layer Cheat Sheet
```
Layer 1 (Aspirational): "Why we exist"
├─ Reduce suffering
├─ Increase prosperity
└─ Increase understanding

Layer 2 (Global Strategy): "What we're achieving"
├─ User's mission
└─ Success criteria

Layer 3 (Agent Model): "What we're capable of"
├─ Self-awareness
└─ Continuous learning

Layer 4 (Executive Function): "How we organize"
├─ Task decomposition
└─ Dynamic adaptation

Layer 5 (Cognitive Control): "How we coordinate"
├─ Task selection
└─ Conflict prevention

Layer 6 (Task Prosecution): "How we execute"
├─ Tool invocation
└─ Skill application

Feedback Loops: "How we improve"
└─ Protocol evolution
```

### Agent Decision Matrix

| Situation | Layer | Primary | Secondary |
|-----------|-------|---------|-----------|
| Ethical concern | Layer 1 | Invoke veto | Invoke veto |
| User goal unclear | Layer 2 | Clarify | Escalate |
| Task exceeds capability | Layer 3 | Reassign | Decline |
| Deviation from plan | Layer 4 | Reallocate | Report |
| File locked | Layer 5 | Wait/abort | Wait |
| Tool failure | Layer 6 | Retry | Report |

### Tool Call Cheat Sheet
```bash
# LiveMetro Skill invocation
Skill react-native-development    # For UI components, screens, hooks
Skill api-integration             # For Seoul Open Data API
Skill firebase-integration        # For Firestore, Auth
Skill notification-system         # For push notifications
Skill test-automation            # For Jest tests

# Task agent invocation (parallel)
Task
  description: "Implement feature X"
  subagent_type: "react-native-development"
  prompt: "Create StationCard component with TypeScript strict mode"

# File operations
1. Acquire lock (Primary coordinates)
2. Write/Edit src/{screens|components|services}/*.tsx
3. Run type-check: npm run type-check
4. Run tests: npm test
5. Release lock
```

---

## Appendix B: Troubleshooting Guide

### Issue: Ethical concern unclear

**Layer:** Layer 1
**Solution:**
```
If Critical → ETHICAL_VETO immediately
If Medium → Escalate to Primary
If Low → Document and proceed with monitoring
```

### Issue: Agent overestimated capability

**Layer:** Layer 3
**Solution:**
```
1. Agent escalates to Primary
2. Primary reassigns or simplifies
3. Agent updates self-model
4. Positive reinforcement for transparency
```

### Issue: Deadlock detected

**Layer:** Layer 5
**Solution:**
```
1. Auto-abort youngest lock
2. Re-queue operation
3. Implement lock ordering
4. Update protocol
```

### Issue: Skill file inaccessible

**Layer:** Layer 6 + Layer 1
**Solution:**
```
1. Agent notifies Primary
2. Primary checks alternatives
3. Assess quality threshold
4. Proceed with degraded quality OR abort
```

---

## Appendix C: Glossary

**ACE Framework Terms:**
- **Aspirational Layer (Layer 1)**: Ethical principles and constraints
- **Global Strategy Layer (Layer 2)**: Overall mission and goals
- **Agent Model Layer (Layer 3)**: Self-awareness and capabilities
- **Executive Function Layer (Layer 4)**: Task coordination
- **Cognitive Control Layer (Layer 5)**: Execution control
- **Task Prosecution Layer (Layer 6)**: Actual execution
- **Feedback Loops**: Continuous learning mechanism

**Core Protocol Terms:**
- **Primary Agent**: Coordinator with strategic authority
- **Secondary Agent**: Specialist with self-awareness
- **File Lock**: Exclusive access control
- **Checkpoint**: Validated state snapshot
- **Session ID**: Unique execution context
- **Sandbox**: Security policy
- **Skill**: Specialized knowledge document

**ACE-Specific Terms:**
- **Ethical Veto**: Any agent halts on Layer 1 violation
- **Self-Assessment**: Capability evaluation before task
- **Dynamic Reallocation**: Mid-execution task reassignment
- **Capability Match**: Fitness score (0-1) for task
- **Strategic Pivot**: Major approach change
- **Cross-Agent Learning**: Validated shared insights
- **Telemetry**: Performance data from all layers

---

## Document Control

**Approval:**
- Author: ACE Framework Integration Team
- Reviewer: AI Safety Team
- Approved By: Primary Agent (in operation)

**Change Log:**

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2024-12-30 | Initial protocol | System |
| 2.0 | 2025-01-01 | Skill/MCP Integration | Enhanced |
| 3.0 | 2025-01-01 | **ACE Framework Integration**: 6-layer architecture, Aspirational principles, Agent Model, Dynamic reallocation, Feedback Loops | ACE Edition |
| 3.0.1 | 2025-01-03 | **LiveMetro Adaptation**: Customized for React Native/Expo development, Seoul Open Data API integration, Firebase services, TypeScript strict mode, mobile-specific examples and workflows | LiveMetro Team |

**Distribution:**
- LiveMetro Development Team
- Claude Code agents working on LiveMetro
- React Native mobile development teams
- Seoul Metro API integration projects
- Internal LiveMetro documentation

**Related Documents:**
- ACE Framework Specification (ace-fca.md)
- Parallel Agents Safety Protocol v2.0 and v3.0
- LiveMetro CLAUDE.md (project-specific instructions)
- React Native Development Skills
- Seoul Open Data API Integration Guide
- Firebase Integration Best Practices

---

**END OF DOCUMENT**

---

## Summary of v3.0.1 LiveMetro Enhancements

### LiveMetro-Specific Adaptations:
1. ✅ Layer 1 (Aspirational): Privacy protection for user location data, API rate limit respect
2. ✅ Layer 2 (Global Strategy): Seoul Metro commuter-focused mission alignment
3. ✅ Layer 3 (Agent Model): React Native/TypeScript/Expo expertise modeling
4. ✅ Layer 4 (Executive Function): Mobile development task decomposition
5. ✅ Layer 5 (Cognitive Control): Expo/Firebase/Seoul API coordination
6. ✅ Layer 6 (Task Prosecution): LiveMetro skill integration (react-native-development, api-integration, etc.)
7. ✅ Feedback Loops: React Native best practices learning

### LiveMetro-Specific Benefits:
- **Safety**: User privacy protection, API quota management, app stability
- **Efficiency**: Parallel React Native development (UI + API + Firebase + Tests)
- **Quality**: TypeScript strict mode + 75%+ test coverage enforcement
- **Adaptability**: Handles SDK breaking changes, API failures, quota issues
- **Transparency**: Clear fallback priorities (Seoul API → Firebase → Cache)
- **Trust**: Ethical handling of commuter data, location privacy

### Key Technologies Integrated:
- React Native 0.72 + Expo ~49
- TypeScript 5.1+ (strict mode)
- Firebase (Auth, Firestore, Functions)
- Seoul Open Data API (rate-limited polling)
- AsyncStorage (offline cache with TTL)
- Jest (75%+ coverage requirement)

**Result**: Production-ready parallel execution protocol for LiveMetro React Native development that is safe, efficient, privacy-conscious, and continuously improving.