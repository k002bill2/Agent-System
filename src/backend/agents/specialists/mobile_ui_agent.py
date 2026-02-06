"""Mobile UI Specialist Agent - React Native UI/UX 전문가.

컴포넌트 설계, 반응형 레이아웃, 네비게이션, UX 최적화를 담당합니다.
"""

import time
from typing import Any

from agents.base import AgentConfig, AgentResult, BaseAgent

MOBILE_UI_SYSTEM_PROMPT = """You are a Mobile UI Specialist Agent, an expert in React Native development with Expo and TypeScript.

## Your Expertise

1. **React Native Components**
   - Functional components with TypeScript
   - Custom hooks for UI logic
   - Reusable component libraries
   - Platform-specific components (iOS/Android)

2. **Styling & Layout**
   - Tailwind CSS (NativeWind)
   - Responsive design for various screen sizes
   - Dark/Light theme support
   - Animation with Reanimated

3. **Navigation**
   - React Navigation 6.x
   - Stack, Tab, Drawer navigators
   - Deep linking
   - Navigation state management

4. **User Experience**
   - Accessibility (a11y) best practices
   - Touch interactions and gestures
   - Loading states and skeletons
   - Error boundaries and fallbacks

## Code Standards

- Always use TypeScript with strict mode
- Follow React hooks rules
- Prefer composition over inheritance
- Use meaningful component and prop names
- Include JSDoc comments for public APIs

## Output Format

When creating components, provide:
1. **Component Code**: Complete, production-ready code
2. **Props Interface**: TypeScript interface with descriptions
3. **Usage Example**: How to use the component
4. **Style Notes**: Any styling considerations

Example response structure:
```typescript
// Props interface
interface ButtonProps {
  /** Button text content */
  label: string;
  /** Called when button is pressed */
  onPress: () => void;
  /** Visual variant */
  variant?: 'primary' | 'secondary' | 'outline';
  /** Disabled state */
  disabled?: boolean;
}

// Component implementation
export function Button({ label, onPress, variant = 'primary', disabled }: ButtonProps) {
  // ... implementation
}

// Usage example
<Button label="Submit" onPress={handleSubmit} variant="primary" />
```

## Guidelines

1. **Performance**: Use memo, useMemo, useCallback appropriately
2. **Accessibility**: Include accessible labels and roles
3. **Responsiveness**: Support portrait/landscape and various screen sizes
4. **Platform**: Handle iOS/Android differences when necessary
5. **Testing**: Make components testable with clear props interface
"""


class MobileUIAgent(BaseAgent):
    """
    Mobile UI Specialist Agent.

    React Native UI/UX 전문가로서 컴포넌트 설계, 스타일링,
    네비게이션 설정 등을 담당합니다.
    """

    def __init__(self):
        config = AgentConfig(
            name="MobileUISpecialist",
            description="React Native UI/UX expert specializing in components, layouts, and navigation",
            system_prompt=MOBILE_UI_SYSTEM_PROMPT,
            model_name="claude-sonnet-4-20250514",
            temperature=0.5,
            max_tokens=8192,  # UI 코드는 길 수 있음
            tools=["file_read", "file_write", "code_search"],
        )
        super().__init__(config)

    async def execute(self, task: str, context: dict[str, Any] | None = None) -> AgentResult:
        """
        UI 태스크 실행.

        Args:
            task: UI 관련 태스크 설명
            context: 프로젝트 컨텍스트 (기존 컴포넌트, 스타일 등)

        Returns:
            AgentResult with generated UI code or analysis
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

        # 기본 프로젝트 설정 추가
        if "tech_stack" not in enhanced:
            enhanced["tech_stack"] = {
                "framework": "React Native",
                "expo_sdk": "~49",
                "typescript": "5.1+",
                "styling": "NativeWind (Tailwind)",
                "navigation": "React Navigation 6.x",
            }

        return enhanced

    def _parse_result(self, result: str, task: str) -> dict[str, Any]:
        """결과 파싱 및 구조화."""
        # 코드 블록 추출
        code_blocks = []
        if "```" in result:
            parts = result.split("```")
            for i, part in enumerate(parts):
                if i % 2 == 1:  # 코드 블록 내부
                    lang = ""
                    content = part
                    if "\n" in part:
                        first_line = part.split("\n")[0]
                        if first_line.strip() in ["typescript", "tsx", "ts", "javascript", "jsx"]:
                            lang = first_line.strip()
                            content = "\n".join(part.split("\n")[1:])
                    code_blocks.append({
                        "language": lang or "typescript",
                        "content": content.strip(),
                    })

        return {
            "type": "ui_implementation",
            "task": task,
            "full_response": result,
            "code_blocks": code_blocks,
            "has_code": len(code_blocks) > 0,
        }

    async def create_component(
        self,
        component_name: str,
        description: str,
        props: list[dict[str, str]] | None = None,
    ) -> AgentResult:
        """
        새 컴포넌트 생성.

        Args:
            component_name: 컴포넌트 이름
            description: 컴포넌트 설명
            props: Props 정의 [{"name": "label", "type": "string", "description": "..."}]

        Returns:
            AgentResult with component code
        """
        props_str = ""
        if props:
            props_str = "\n".join(
                f"- {p['name']}: {p['type']} - {p.get('description', '')}"
                for p in props
            )

        task = f"""Create a new React Native component called '{component_name}'.

Description: {description}

{f"Props:{chr(10)}{props_str}" if props_str else ""}

Requirements:
- TypeScript with strict types
- Include Props interface
- Follow project coding standards
- Include usage example
"""

        return await self.execute(task)

    async def improve_accessibility(
        self,
        component_code: str,
    ) -> AgentResult:
        """컴포넌트 접근성 개선."""
        task = f"""Review and improve the accessibility of this React Native component:

```typescript
{component_code}
```

Focus on:
- accessibilityLabel and accessibilityHint
- accessibilityRole
- VoiceOver/TalkBack support
- Keyboard navigation
- Color contrast

Provide the improved code with explanations."""

        return await self.execute(task)

    async def design_screen(
        self,
        screen_name: str,
        description: str,
        features: list[str],
    ) -> AgentResult:
        """새 화면 설계."""
        features_str = "\n".join(f"- {f}" for f in features)

        task = f"""Design a new screen called '{screen_name}' for a React Native app.

Description: {description}

Features:
{features_str}

Provide:
1. Screen component structure
2. Navigation integration
3. State management approach
4. Error and loading states
5. Responsive layout considerations
"""

        return await self.execute(task)
