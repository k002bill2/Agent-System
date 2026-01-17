---
name: delegation-template
description: Structured template for delegating tasks to subagents with clear boundaries
---

# Task Delegation Template

Structured format for delegating tasks to subagents to prevent duplicated work and gaps.

**Source**: [Anthropic Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)

> "Early versions suffered from agents duplicating work, leaving gaps, emphasizing the importance of detailed task descriptions for effective delegation."

## Required Elements

Every task delegation MUST include all four elements:

### 1. Objective
Clear, specific goal statement
- What success looks like
- Measurable outcome
- Acceptance criteria

### 2. Output Format
Expected deliverable structure
- File paths and naming conventions
- Code style requirements
- Documentation expectations

### 3. Tools & Sources
Resources to use
- Skills to invoke
- Reference files to consult
- APIs or services to use

### 4. Task Boundaries
Explicit exclusions to prevent overlap
- Files to NOT modify
- Actions to NOT take
- Dependencies to wait for

---

## Template

```markdown
## Task: {descriptive_task_name}

### Objective
{Clear statement of what needs to be accomplished}

Success Criteria:
- [ ] {criterion_1}
- [ ] {criterion_2}
- [ ] {criterion_3}

### Output Format
**Location**: `.temp/agent_workspaces/{agent}/proposals/`

**Files to create:**
- `{FileName}.tsx` - {description}
- `{FileName}.test.tsx` - {description}

**Code Requirements:**
- TypeScript strict mode
- Use path aliases (@components, @services)
- Follow existing patterns in {reference_file}

### Tools & Sources
**Invoke skill**: `{skill_name}`

**Reference files:**
- `{path_to_reference_1}` - {why to reference}
- `{path_to_reference_2}` - {why to reference}

**APIs/Services:**
- {api_name} - {how to use}

### Task Boundaries

**DO NOT:**
- Modify files in: `{excluded_paths}`
- Implement: `{excluded_features}` (other agent handles)
- Write: `{excluded_outputs}` (other agent handles)

**WAIT FOR:**
- `{dependency_agent}` to complete: `{what to wait for}`

**STOP IF:**
- You need to modify excluded files
- Task scope exceeds defined boundaries
- Blocking dependency not yet complete
```

---

## Real Examples

### Example 1: UI Component

```markdown
## Task: Create StationInfoCard Component

### Objective
Create a reusable card component displaying station information.

Success Criteria:
- [ ] Shows station name with line color indicator
- [ ] Displays distance when provided
- [ ] Includes onPress handler for navigation
- [ ] Has accessibility labels

### Output Format
**Location**: `.temp/agent_workspaces/mobile-ui/proposals/`

**Files to create:**
- `StationInfoCard.tsx` - Main component with styles
- `StationInfoCard.types.ts` - Props interface (optional)

**Code Requirements:**
- TypeScript strict mode
- Use memo() wrapper
- Follow patterns in `src/components/train/StationCard.tsx`

### Tools & Sources
**Invoke skill**: `react-native-development`

**Reference files:**
- `src/components/train/StationCard.tsx` - Existing pattern
- `src/models/station.ts` - Station type definition
- `src/utils/lineColors.ts` - Line color constants

### Task Boundaries

**DO NOT:**
- Modify files in: `src/services/`, `src/models/`
- Implement: data fetching (backend agent handles)
- Write: tests (test-automation agent handles)

**WAIT FOR:**
- None (types already exist)

**STOP IF:**
- You need Station type changes
```

### Example 2: Backend Service

```markdown
## Task: Implement StationService

### Objective
Create service for fetching station data from Seoul API.

Success Criteria:
- [ ] Fetches station list from Seoul API
- [ ] Fetches real-time arrival data
- [ ] Implements caching with 30s TTL
- [ ] Handles API errors gracefully

### Output Format
**Location**: `.temp/agent_workspaces/backend-integration/proposals/`

**Files to create:**
- `stationService.ts` - Service with all methods
- `stationService.types.ts` - Request/response types

**Code Requirements:**
- TypeScript strict mode
- Export types for UI consumption
- Return empty arrays on error (don't throw)

### Tools & Sources
**Invoke skill**: `api-integration`

**Reference files:**
- `src/services/api/seoulSubwayApi.ts` - Existing API patterns
- `src/services/train/trainService.ts` - Service pattern

**APIs/Services:**
- Seoul Open Data API - Station endpoints

### Task Boundaries

**DO NOT:**
- Modify files in: `src/components/`, `src/screens/`
- Implement: UI components (mobile-ui agent handles)
- Write: tests (test-automation agent handles)

**WAIT FOR:**
- None (first in dependency chain)
```

### Example 3: Test Suite

```markdown
## Task: Write StationInfoCard Tests

### Objective
Create comprehensive test suite for StationInfoCard component.

Success Criteria:
- [ ] Tests rendering with all prop combinations
- [ ] Tests onPress callback invocation
- [ ] Tests accessibility attributes
- [ ] Coverage > 80%

### Output Format
**Location**: `.temp/agent_workspaces/test-automation/proposals/`

**Files to create:**
- `StationInfoCard.test.tsx` - Test suite

**Code Requirements:**
- Use React Native Testing Library
- Mock navigation if needed
- Test edge cases (missing data, long text)

### Tools & Sources
**Invoke skill**: `test-automation`

**Reference files:**
- `src/components/train/__tests__/StationCard.test.tsx` - Test pattern
- Mobile-ui proposals: `StationInfoCard.tsx` - Component to test

### Task Boundaries

**DO NOT:**
- Modify: implementation files
- Implement: new features
- Create: snapshot tests (prefer assertions)

**WAIT FOR:**
- `mobile-ui-specialist` to complete: StationInfoCard.tsx
```

---

## Anti-Patterns

### ❌ Vague Objective
```markdown
### Objective
Create a component for stations.
```

### ✅ Clear Objective
```markdown
### Objective
Create a StationInfoCard component that displays station name,
line color indicator, and optional distance, with tap navigation.

Success Criteria:
- [ ] Shows station name prominently
- [ ] Line color matches station.lineId
- [ ] Distance formatted as "X.Xkm" when provided
- [ ] onPress triggers with station.id
```

### ❌ Missing Boundaries
```markdown
(No task boundaries section)
```

### ✅ Explicit Boundaries
```markdown
### Task Boundaries
**DO NOT:**
- Touch src/services/ (backend agent)
- Write tests (test agent)
- Modify existing components

**WAIT FOR:**
- Backend types to be available
```

### ❌ Implicit Dependencies
```markdown
### Tools & Sources
Check the types somewhere in the codebase
```

### ✅ Explicit Dependencies
```markdown
### Tools & Sources
**Reference files:**
- `src/models/station.ts` - Station interface (lines 1-20)
- `src/utils/lineColors.ts` - LINE_COLORS constant

**WAIT FOR:**
- `backend-integration-specialist` types in proposals/
```

---

## Quick Reference

### Checklist Before Delegation

- [ ] Objective has measurable success criteria?
- [ ] Output location and format specified?
- [ ] Skills and reference files listed?
- [ ] Boundaries clearly state DO NOT?
- [ ] Dependencies with WAIT FOR noted?
- [ ] STOP conditions for edge cases?

### Common Boundaries by Agent

| Agent | Typical DO NOT |
|-------|---------------|
| mobile-ui | services, models, tests |
| backend-integration | components, screens, tests |
| test-automation | implementation, services |
| performance-optimizer | new features, tests |

---

**Version**: 1.0 | **Last Updated**: 2025-01-04
