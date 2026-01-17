---
name: effort-scaling
description: Guide for determining appropriate agent resource allocation based on task complexity
---

# Effort Scaling Guide

Determine appropriate resource allocation before spawning agents.

**Source**: [Anthropic Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)

## Complexity Matrix

| Complexity | Agents | Tool Calls | Token Cost | Time |
|------------|--------|------------|------------|------|
| **Trivial** | 0 | 1-3 | ~1K | <1min |
| **Simple** | 1 | 3-10 | ~5K | 1-3min |
| **Moderate** | 2-3 | 10-30 | ~50K | 5-10min |
| **Complex** | 5+ | 30+ | ~150K | 15-30min |

## Decision Flowchart

```
START
  │
  ├─ Is it a typo/single-line fix?
  │   └─ YES → TRIVIAL (direct edit)
  │
  ├─ Is it one file, one concern?
  │   └─ YES → SIMPLE (1 agent)
  │
  ├─ Multiple files OR UI+Backend?
  │   └─ YES → MODERATE (2-3 agents)
  │
  └─ System-wide OR 5+ concerns?
      └─ YES → COMPLEX (5+ agents)
```

## Quick Assessment Checklist

Before spawning agents, score each:

| Factor | Score 0 | Score 1 | Score 2 |
|--------|---------|---------|---------|
| Files to modify | 1 | 2-4 | 5+ |
| Layers involved | 1 | 2 | 3+ |
| Tests needed | None | Unit | Integration |
| Exploration needed | No | Some | Extensive |

**Total Score:**
- 0-2: Trivial/Simple
- 3-5: Moderate
- 6+: Complex

## Examples by Task Type

### Trivial (0 agents)
- Fix typo in README
- Update version number
- Add comment to code
- Rename single variable

### Simple (1 agent)
- Add loading spinner to component
- Create new utility function
- Add single API endpoint
- Write tests for existing code

### Moderate (2-3 agents)
- New screen with API integration
- Feature with UI + service + tests
- Refactor across multiple files
- Add form with validation

### Complex (5+ agents)
- Offline mode with sync
- Complete feature module
- System-wide refactoring
- Performance optimization suite

## Token Economics

Multi-agent systems use ~15x more tokens than single-agent.

| Approach | Tokens | Cost | Time |
|----------|--------|------|------|
| Single agent | 10K | $ | 5min |
| 3 parallel agents | 50K | $$$ | 3min |
| 5 parallel agents | 150K | $$$$$ | 5min |

**Use multi-agent when:**
- Time savings justify token cost
- Quality/coverage requirements high
- Tasks are truly parallelizable

**Use single-agent when:**
- Simple, focused task
- Sequential dependencies
- Token budget limited

## Agent Selection Guide

### By Task Domain

| Domain | Primary Agent | Support |
|--------|---------------|---------|
| UI work | mobile-ui | - |
| API/Firebase | backend-integration | - |
| Performance | performance-optimizer | - |
| Tests | test-automation | - |
| Full feature | backend + mobile-ui | test-automation |
| Optimization | performance | test-automation |

### By Dependency Order

```
1. backend-integration-specialist
   └── Provides types and interfaces

2. mobile-ui-specialist
   └── Consumes types, creates UI

3. test-automation-specialist
   └── Tests both layers

4. performance-optimizer
   └── Optimizes final output

5. quality-validator
   └── Final validation
```

## Common Mistakes

### Over-scaling
❌ Using 3 agents for a config change
❌ Spawning test agent for exploratory work
❌ Complex delegation for simple tasks

### Under-scaling
❌ One agent for UI + API + tests
❌ Sequential work when parallel possible
❌ No tests for significant features

## Integration

This guide is referenced by:
- `lead-orchestrator.md` - Uses for effort decisions
- `parallel-coordinator/SKILL.md` - Embedded in workflow

---

**Version**: 1.0 | **Last Updated**: 2025-01-04
