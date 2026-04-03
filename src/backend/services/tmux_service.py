"""Tmux session management service for Claude Code CLI execution.

Manages tmux sessions that run Claude Code CLI in print mode (-p),
enabling real-time output capture via `tmux capture-pane`.

Usage:
- Task Analyzer produces an analysis → build_claude_prompt() converts to instructions
- execute_analysis() creates a tmux session and runs `claude -p "prompt"`
- Dashboard polls capture_output() for live terminal output
"""

import asyncio
import logging
import os
import shutil
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from utils.time import utcnow

logger = logging.getLogger(__name__)


class ClaudeAuthStatus(BaseModel):
    """Claude CLI 인증 상태."""

    authenticated: bool
    has_credits: bool
    error: str = ""
    message: str = ""


class TmuxSessionInfo(BaseModel):
    """tmux 세션 정보."""

    session_name: str
    analysis_id: str
    project_path: str
    active: bool
    started_at: datetime
    task_input: str = ""


class TmuxService:
    """tmux 세션 기반 Claude Code CLI 실행 관리."""

    # AOS 세션 접두사
    SESSION_PREFIX = "aos-"

    def __init__(self):
        self._sessions: dict[str, TmuxSessionInfo] = {}

    # =========================================================================
    # tmux 기본 명령
    # =========================================================================

    def is_available(self) -> bool:
        """tmux가 설치되어 있는지 확인."""
        return shutil.which("tmux") is not None

    def is_claude_available(self) -> bool:
        """Claude CLI가 설치되어 있는지 확인."""
        return shutil.which("claude") is not None

    async def check_claude_auth(self) -> ClaudeAuthStatus:
        """Claude CLI 인증 상태 및 크레딧 사전 체크.

        사용자 셸 환경(login shell)에서 `claude -p "ping"`을 실행하여
        인증/크레딧 문제를 사전 감지합니다.

        NOTE: 백엔드 프로세스에서 직접 claude를 실행하면 키체인 접근 등
        환경 차이로 인해 인증 실패할 수 있으므로, login shell을 통해 실행합니다.

        Returns:
            ClaudeAuthStatus with authentication and credit info
        """
        if not self.is_claude_available():
            return ClaudeAuthStatus(
                authenticated=False,
                has_credits=False,
                error="not_installed",
                message="Claude CLI가 설치되어 있지 않습니다.",
            )

        try:
            # login shell (-l)을 통해 실행하여 사용자 환경 상속
            proc = await asyncio.create_subprocess_exec(
                "/bin/bash",
                "-l",
                "-c",
                'claude -p "respond with only: ok"',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env={**os.environ, "HOME": str(Path.home())},
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)

            stdout_text = stdout.decode().strip() if stdout else ""
            stderr_text = stderr.decode().strip() if stderr else ""
            combined = f"{stdout_text} {stderr_text}".lower()

            logger.warning(
                f"[check_claude_auth] exit={proc.returncode} "
                f"stdout='{stdout_text[:200]}' stderr='{stderr_text[:200]}' "
                f"combined='{combined[:200]}'"
            )

            # 크레딧 부족
            if "credit balance is too low" in combined:
                return ClaudeAuthStatus(
                    authenticated=True,
                    has_credits=False,
                    error="no_credits",
                    message="Claude Code 구독 크레딧이 부족합니다. 크레딧이 갱신될 때까지 기다리거나 플랜을 업그레이드하세요.",
                )

            # 인증 안됨
            if (
                "not logged in" in combined
                or "unauthorized" in combined
                or "authentication" in combined
            ):
                return ClaudeAuthStatus(
                    authenticated=False,
                    has_credits=False,
                    error="not_authenticated",
                    message="Claude CLI에 로그인되어 있지 않습니다. 터미널에서 'claude login'을 실행하세요.",
                )

            # 성공 (exit code 0 + 출력 존재)
            if proc.returncode == 0 and stdout_text:
                return ClaudeAuthStatus(
                    authenticated=True,
                    has_credits=True,
                    message="인증 및 크레딧 확인 완료.",
                )

            # 기타 에러
            return ClaudeAuthStatus(
                authenticated=False,
                has_credits=False,
                error="unknown",
                message=f"Claude CLI 체크 실패: {stderr_text or stdout_text or 'exit code ' + str(proc.returncode)}",
            )

        except TimeoutError:
            return ClaudeAuthStatus(
                authenticated=False,
                has_credits=False,
                error="timeout",
                message="Claude CLI 응답 시간 초과 (30초). 네트워크를 확인하세요.",
            )
        except Exception as e:
            return ClaudeAuthStatus(
                authenticated=False,
                has_credits=False,
                error="exception",
                message=f"Claude CLI 체크 중 오류: {e}",
            )

    def create_session(self, name: str, project_path: str) -> bool:
        """새 tmux 세션 생성 (detached).

        Args:
            name: 세션 이름
            project_path: 작업 디렉토리

        Returns:
            성공 여부
        """
        try:
            subprocess.run(
                ["tmux", "new-session", "-d", "-s", name, "-c", project_path],
                check=True,
                capture_output=True,
                text=True,
            )
            return True
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to create tmux session '{name}': {e.stderr}")
            return False

    def send_command(self, name: str, command: str) -> bool:
        """tmux 세션에 명령어 전송.

        Args:
            name: 세션 이름
            command: 실행할 명령어

        Returns:
            성공 여부
        """
        try:
            subprocess.run(
                ["tmux", "send-keys", "-t", name, command, "Enter"],
                check=True,
                capture_output=True,
                text=True,
            )
            return True
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to send command to tmux session '{name}': {e.stderr}")
            return False

    def capture_output(self, name: str, lines: int = 200) -> str | None:
        """tmux 세션의 현재 출력 캡처.

        Args:
            name: 세션 이름
            lines: 캡처할 최대 줄 수

        Returns:
            캡처된 출력 텍스트, 실패 시 None
        """
        try:
            result = subprocess.run(
                [
                    "tmux",
                    "capture-pane",
                    "-t",
                    name,
                    "-p",  # stdout으로 출력
                    "-S",
                    f"-{lines}",  # 시작 줄 (음수 = 스크롤백)
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            return result.stdout
        except subprocess.CalledProcessError:
            return None

    def is_session_alive(self, name: str) -> bool:
        """tmux 세션이 살아있는지 확인."""
        try:
            subprocess.run(
                ["tmux", "has-session", "-t", name],
                check=True,
                capture_output=True,
                text=True,
            )
            return True
        except subprocess.CalledProcessError:
            return False

    def kill_session(self, name: str) -> bool:
        """tmux 세션 종료."""
        try:
            subprocess.run(
                ["tmux", "kill-session", "-t", name],
                check=True,
                capture_output=True,
                text=True,
            )
            # 내부 추적에서도 제거
            self._sessions.pop(name, None)
            return True
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to kill tmux session '{name}': {e.stderr}")
            return False

    def list_aos_sessions(self) -> list[TmuxSessionInfo]:
        """모든 AOS tmux 세션 목록 반환."""
        # 실제 tmux 세션 확인하여 상태 동기화
        try:
            result = subprocess.run(
                ["tmux", "list-sessions", "-F", "#{session_name}"],
                capture_output=True,
                text=True,
            )
            live_sessions = (
                set(result.stdout.strip().split("\n")) if result.stdout.strip() else set()
            )
        except subprocess.CalledProcessError:
            live_sessions = set()

        # 내부 추적 정보와 동기화
        sessions = []
        for name, info in list(self._sessions.items()):
            is_alive = name in live_sessions
            updated = info.model_copy(update={"active": is_alive})
            self._sessions[name] = updated
            sessions.append(updated)

        return sessions

    # =========================================================================
    # Claude Code 프롬프트 생성
    # =========================================================================

    def build_claude_prompt(self, analysis: dict[str, Any], task_input: str) -> str:
        """분석 결과를 Claude Code CLI 프롬프트로 변환.

        Args:
            analysis: TaskAnalysisResult의 analysis 필드
            task_input: 원본 태스크 입력

        Returns:
            마크다운 형식의 실행 지침 프롬프트
        """
        lines = [
            "# Execution Plan (from Task Analyzer)",
            "",
            "## Task",
            task_input,
            "",
        ]

        # Safety Warnings 섹션
        analysis_inner = analysis.get("analysis", {})
        safety_flags = analysis_inner.get("safety_flags", [])
        if safety_flags:
            lines.append("## Safety Warnings")
            for flag in safety_flags:
                lines.append(f"- ⚠️ {flag}")
            lines.append("")

        execution_plan = analysis.get("execution_plan", {})
        subtasks = execution_plan.get("subtasks", {})
        parallel_groups = execution_plan.get("parallel_groups", [])

        # subtask id → task_boundaries 매핑 구축
        boundaries_map: dict[str, dict[str, list[str]]] = {}
        analysis_subtasks = analysis_inner.get("subtasks", [])
        if isinstance(analysis_subtasks, list):
            for st in analysis_subtasks:
                st_id = st.get("id")
                boundaries = st.get("task_boundaries")
                if st_id and boundaries:
                    boundaries_map[st_id] = boundaries

        if parallel_groups:
            lines.append("## Subtasks (순서대로 실행)")
            lines.append("")

            for group_idx, group in enumerate(parallel_groups):
                is_parallel = len(group) > 1
                step_label = f"### Step {group_idx + 1}"
                if is_parallel:
                    step_label += " (Parallel)"
                lines.append(step_label)

                for task_id in group:
                    subtask = subtasks.get(task_id, {})
                    title = subtask.get("title", task_id)
                    effort = subtask.get("effort", "medium")
                    agent = subtask.get("agent")
                    deps = subtask.get("dependencies", [])

                    parts = [f"- **{task_id}**: {title} (effort: {effort})"]
                    if agent:
                        parts[0] += f" [agent: {agent}]"
                    if deps:
                        parts.append(f"  - depends on: {', '.join(deps)}")

                    # Task Boundaries 렌더링
                    boundaries = boundaries_map.get(task_id)
                    if boundaries:
                        do_not = boundaries.get("do_not", [])
                        wait_for = boundaries.get("wait_for", [])
                        stop_if = boundaries.get("stop_if", [])
                        if do_not:
                            parts.append(f"  - **DO NOT**: {'; '.join(do_not)}")
                        if wait_for:
                            parts.append(f"  - **WAIT FOR**: {'; '.join(wait_for)}")
                        if stop_if:
                            parts.append(f"  - **STOP IF**: {'; '.join(stop_if)}")

                    lines.extend(parts)

                lines.append("")

        # 지침 추가
        lines.extend(
            [
                "## Instructions",
                "- 위 순서대로 서브태스크를 실행하세요",
                "- 각 서브태스크의 task boundaries(DO NOT/WAIT FOR/STOP IF)를 반드시 준수하세요",
                "- 각 서브태스크 완료 후 결과를 검증하세요",
                "- 가능한 경우 Claude Code 에이전트와 스킬을 활용하세요",
                "- 에러 발생 시 근본 원인을 분석하고 수정하세요",
                "- 모든 변경 후 `tsc --noEmit` (프론트엔드) / `pytest --tb=short` (백엔드) 실행으로 검증하세요",
            ]
        )

        return "\n".join(lines)

    # =========================================================================
    # 분석 실행
    # =========================================================================

    async def execute_analysis(
        self,
        analysis_id: str,
        project_path: str,
        analysis: dict[str, Any],
        task_input: str,
        branch_name: str | None = None,
    ) -> TmuxSessionInfo | None:
        """분석 결과를 tmux + Claude Code CLI로 실행.

        Args:
            analysis_id: 분석 ID
            project_path: 프로젝트 작업 디렉토리
            analysis: 분석 결과 데이터
            task_input: 원본 태스크 입력
            branch_name: 실행 전 생성할 feature branch (선택)

        Returns:
            TmuxSessionInfo 또는 실패 시 None
        """
        if not self.is_available():
            logger.error("tmux is not installed")
            return None

        if not self.is_claude_available():
            logger.error("Claude CLI is not installed")
            return None

        # 세션 이름 생성
        short_id = analysis_id[:8]
        timestamp = int(time.time())
        session_name = f"{self.SESSION_PREFIX}{short_id}-{timestamp}"

        # 프롬프트 생성
        prompt = self.build_claude_prompt(analysis, task_input)

        # tmux 세션 생성
        if not self.create_session(session_name, project_path):
            return None

        # feature branch 생성 (요청된 경우)
        if branch_name:
            import re

            if not re.match(r"^[a-zA-Z0-9/_.-]+$", branch_name) or len(branch_name) > 100:
                logger.warning("Invalid branch name: %s", branch_name)
            else:
                git_cmd = f"git checkout -b {branch_name}"
                if not self.send_command(session_name, git_cmd):
                    logger.warning("Failed to create branch: %s", branch_name)
                else:
                    # git checkout 완료 대기
                    import asyncio

                    await asyncio.sleep(1)

        # 프롬프트를 임시 파일로 저장 (셸 이스케이프 문제 방지)
        import tempfile

        prompt_dir = Path(tempfile.mkdtemp(prefix="aos-"))
        prompt_file = prompt_dir / f"{session_name}.md"
        prompt_file.write_text(prompt, encoding="utf-8")

        # Claude CLI를 print mode(-p)로 실행
        # login shell(bash -l)로 감싸서 사용자 환경(PATH, 키체인 등) 상속
        # - print mode: 깔끔한 stdout 출력, TUI 아티팩트 없음
        # - login shell: tmux 세션에서도 인증 토큰 정상 접근
        claude_cmd = f"bash -l -c 'cat \"{prompt_file}\" | claude -p'"

        if not self.send_command(session_name, claude_cmd):
            self.kill_session(session_name)
            return None

        # 세션 정보 저장
        info = TmuxSessionInfo(
            session_name=session_name,
            analysis_id=analysis_id,
            project_path=project_path,
            active=True,
            started_at=utcnow(),
            task_input=task_input,
        )
        self._sessions[session_name] = info

        return info

    def get_session(self, session_name: str) -> TmuxSessionInfo | None:
        """세션 정보 조회 (활성 상태 갱신 포함)."""
        info = self._sessions.get(session_name)
        if not info:
            return None

        # 실제 tmux 세션 상태 확인
        is_alive = self.is_session_alive(session_name)
        if info.active != is_alive:
            info = info.model_copy(update={"active": is_alive})
            self._sessions[session_name] = info

        return info


# 싱글톤 인스턴스
_tmux_service: TmuxService | None = None


def get_tmux_service() -> TmuxService:
    """TmuxService 싱글톤 인스턴스 반환."""
    global _tmux_service
    if _tmux_service is None:
        _tmux_service = TmuxService()
    return _tmux_service
