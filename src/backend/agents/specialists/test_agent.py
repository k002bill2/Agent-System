"""Test Automation Specialist Agent - 테스트 자동화 전문가.

Jest, React Native Testing Library, 커버리지 분석, TDD를 담당합니다.
"""

import time
from typing import Any

from agents.base import AgentConfig, AgentResult, BaseAgent

TEST_AUTOMATION_SYSTEM_PROMPT = """You are a Test Automation Specialist Agent, an expert in testing React Native applications with Jest and React Native Testing Library.

## Your Expertise

1. **Unit Testing**
   - Jest test framework
   - Mocking strategies (jest.mock, jest.spyOn)
   - Async testing
   - Snapshot testing

2. **Component Testing**
   - React Native Testing Library (RNTL)
   - User-centric queries (getByText, getByRole)
   - User event simulation (fireEvent, userEvent)
   - Accessibility testing

3. **Integration Testing**
   - API mocking (MSW, nock)
   - Navigation testing
   - State management testing
   - End-to-end scenarios

4. **Coverage Analysis**
   - Statement, branch, function coverage
   - Coverage thresholds
   - Identifying untested code
   - Coverage improvement strategies

## Code Standards

```typescript
// Test file naming: ComponentName.test.tsx
// Use describe blocks for grouping
// Use clear test names: "should [expected behavior] when [condition]"

describe('Button', () => {
  it('should render with the correct label', () => {
    render(<Button label="Click me" onPress={jest.fn()} />);
    expect(screen.getByText('Click me')).toBeTruthy();
  });

  it('should call onPress when pressed', () => {
    const onPress = jest.fn();
    render(<Button label="Click me" onPress={onPress} />);

    fireEvent.press(screen.getByText('Click me'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Button label="Click me" onPress={jest.fn()} disabled />);

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

## Testing Patterns

### Testing Async Operations
```typescript
it('should fetch and display data', async () => {
  // Arrange
  const mockData = [{ id: 1, name: 'Test' }];
  jest.spyOn(api, 'fetchData').mockResolvedValue(mockData);

  // Act
  render(<DataList />);

  // Assert
  await waitFor(() => {
    expect(screen.getByText('Test')).toBeTruthy();
  });
});
```

### Testing Error States
```typescript
it('should display error message on fetch failure', async () => {
  jest.spyOn(api, 'fetchData').mockRejectedValue(new Error('Network error'));

  render(<DataList />);

  await waitFor(() => {
    expect(screen.getByText(/error/i)).toBeTruthy();
  });
});
```

### Testing Hooks
```typescript
import { renderHook, act } from '@testing-library/react-hooks';

describe('useCounter', () => {
  it('should increment counter', () => {
    const { result } = renderHook(() => useCounter());

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });
});
```

## Output Format

When creating tests, provide:
1. **Test File**: Complete test file with all test cases
2. **Test Setup**: Required mocks and setup
3. **Coverage Notes**: What the tests cover
4. **Improvement Suggestions**: Additional tests to consider

## Guidelines

1. **AAA Pattern**: Arrange, Act, Assert
2. **One Assertion Focus**: Each test should verify one behavior
3. **Descriptive Names**: Tests are documentation
4. **No Implementation Details**: Test behavior, not implementation
5. **Independent Tests**: Tests should not depend on each other
6. **Mock Boundaries**: Mock external dependencies, not internal modules
"""


class TestAutomationAgent(BaseAgent):
    """
    Test Automation Specialist Agent.

    Jest와 React Native Testing Library를 사용한 테스트 작성,
    커버리지 분석, TDD 가이드를 담당합니다.
    """

    def __init__(self):
        config = AgentConfig(
            name="TestAutomationSpecialist",
            description="Testing expert specializing in Jest, RNTL, coverage analysis, and TDD",
            system_prompt=TEST_AUTOMATION_SYSTEM_PROMPT,
            model_name="claude-sonnet-4-20250514",
            temperature=0.3,  # 정확한 테스트 코드 생성
            max_tokens=8192,
            tools=["file_read", "file_write", "code_search", "test_run"],
        )
        super().__init__(config)

    async def execute(self, task: str, context: dict[str, Any] | None = None) -> AgentResult:
        """
        테스트 자동화 태스크 실행.

        Args:
            task: 테스트 관련 태스크 설명
            context: 프로젝트 컨텍스트 (테스트할 코드, 기존 테스트 등)

        Returns:
            AgentResult with generated test code or analysis
        """
        start_time = time.time()

        try:
            # 컨텍스트 강화
            enhanced_context = self._enhance_context(context)

            # LLM 호출
            result = await self._invoke_llm(task, enhanced_context)
            execution_time = int((time.time() - start_time) * 1000)

            # 결과 파싱
            output = self._parse_result(result, task)

            return AgentResult(
                success=True,
                output=output,
                execution_time_ms=execution_time,
            )
        except Exception as e:
            return self._format_error(e)

    def _enhance_context(self, context: dict[str, Any] | None) -> dict[str, Any]:
        """컨텍스트 강화."""
        enhanced = context.copy() if context else {}

        # 기본 테스트 설정 추가
        if "test_framework" not in enhanced:
            enhanced["test_framework"] = {
                "runner": "Jest",
                "library": "React Native Testing Library",
                "coverage_threshold": 75,
            }

        return enhanced

    def _parse_result(self, result: str, task: str) -> dict[str, Any]:
        """결과 파싱 및 구조화."""
        # 코드 블록 추출
        code_blocks = []
        if "```" in result:
            parts = result.split("```")
            for i, part in enumerate(parts):
                if i % 2 == 1:
                    lang = ""
                    content = part
                    if "\n" in part:
                        first_line = part.split("\n")[0]
                        if first_line.strip() in ["typescript", "tsx", "ts", "javascript", "jsx"]:
                            lang = first_line.strip()
                            content = "\n".join(part.split("\n")[1:])
                    code_blocks.append(
                        {
                            "language": lang or "typescript",
                            "content": content.strip(),
                        }
                    )

        # 테스트 케이스 수 추출
        test_count = 0
        for block in code_blocks:
            content = block["content"]
            test_count += content.count("it(") + content.count("test(")

        return {
            "type": "test_automation",
            "task": task,
            "full_response": result,
            "code_blocks": code_blocks,
            "has_code": len(code_blocks) > 0,
            "test_count": test_count,
        }

    async def generate_tests(
        self,
        component_code: str,
        component_name: str,
        test_focus: list[str] | None = None,
    ) -> AgentResult:
        """
        컴포넌트 테스트 생성.

        Args:
            component_code: 테스트할 컴포넌트 코드
            component_name: 컴포넌트 이름
            test_focus: 테스트 초점 영역 ["rendering", "interactions", "accessibility"]

        Returns:
            AgentResult with test code
        """
        focus_str = ""
        if test_focus:
            focus_str = f"\nFocus on testing: {', '.join(test_focus)}"

        task = f"""Generate comprehensive tests for the following React Native component:

Component Name: {component_name}

```typescript
{component_code}
```
{focus_str}

Requirements:
1. Cover all props and their variations
2. Test user interactions
3. Test loading/error states if applicable
4. Include accessibility tests
5. Follow AAA pattern (Arrange, Act, Assert)
6. Use meaningful test descriptions

Provide:
- Complete test file ({component_name}.test.tsx)
- Required mocks and setup
- Coverage notes
"""

        return await self.execute(task)

    async def generate_hook_tests(
        self,
        hook_code: str,
        hook_name: str,
    ) -> AgentResult:
        """
        커스텀 훅 테스트 생성.

        Args:
            hook_code: 테스트할 훅 코드
            hook_name: 훅 이름

        Returns:
            AgentResult with hook test code
        """
        task = f"""Generate tests for the following React Native custom hook:

Hook Name: {hook_name}

```typescript
{hook_code}
```

Requirements:
1. Use renderHook from @testing-library/react-hooks
2. Test initial state
3. Test all state changes
4. Test side effects
5. Test error cases
6. Test cleanup

Provide:
- Complete test file ({hook_name}.test.ts)
- Required mocks
- Notes on what is being tested
"""

        return await self.execute(task)

    async def analyze_coverage(
        self,
        coverage_report: dict[str, Any],
        target_threshold: int = 75,
    ) -> AgentResult:
        """
        커버리지 분석 및 개선 제안.

        Args:
            coverage_report: Jest 커버리지 리포트
            target_threshold: 목표 커버리지 (%)

        Returns:
            AgentResult with coverage analysis and suggestions
        """
        import json

        task = f"""Analyze the following test coverage report and provide improvement suggestions:

Coverage Report:
```json
{json.dumps(coverage_report, indent=2)}
```

Target Threshold: {target_threshold}%

Provide:
1. Current coverage summary
2. Files below threshold
3. Specific tests to add for each file
4. Priority order for improvement
5. Estimated effort for each improvement
"""

        return await self.execute(task)

    async def improve_test_quality(
        self,
        test_code: str,
        component_code: str,
    ) -> AgentResult:
        """
        기존 테스트 품질 개선.

        Args:
            test_code: 기존 테스트 코드
            component_code: 테스트 대상 컴포넌트 코드

        Returns:
            AgentResult with improved test code
        """
        task = f"""Review and improve the following test code:

Component:
```typescript
{component_code}
```

Current Tests:
```typescript
{test_code}
```

Improve:
1. Test coverage (missing cases)
2. Test clarity (better descriptions)
3. Test robustness (edge cases)
4. Mock quality (appropriate mocking)
5. Assertion quality (meaningful assertions)

Provide:
- Improved test file
- Explanation of changes
- Additional test suggestions
"""

        return await self.execute(task)

    async def generate_integration_tests(
        self,
        feature_description: str,
        components_involved: list[str],
    ) -> AgentResult:
        """
        통합 테스트 생성.

        Args:
            feature_description: 기능 설명
            components_involved: 관련 컴포넌트 목록

        Returns:
            AgentResult with integration test code
        """
        components_str = ", ".join(components_involved)

        task = f"""Generate integration tests for the following feature:

Feature: {feature_description}

Components Involved: {components_str}

Requirements:
1. Test the complete user flow
2. Mock external dependencies (API, navigation)
3. Verify component interactions
4. Test success and failure paths
5. Include setup and teardown

Provide:
- Integration test file
- Test utilities/helpers
- Mock setup
- Explanation of test scenarios
"""

        return await self.execute(task)
