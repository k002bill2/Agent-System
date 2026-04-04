"""Tmux session management service for Claude Code CLI execution.

Manages tmux sessions that run Claude Code CLI in interactive TUI mode,
enabling real-time monitoring via `tmux attach` and GUI terminal auto-open.

Usage:
- Task Analyzer produces an analysis → build_claude_prompt() converts to instructions
- execute_analysis() creates a tmux session and runs `claude "prompt"` (interactive)
- User attaches to tmux session to watch progress and continue conversation
- Dashboard shows session status (active/ended) via polling
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
    pane_id: str = ""  # split-window 모드 시 pane 식별자 (%N 형식)


class TmuxService:
    """tmux 세션 기반 Claude Code CLI 실행 관리."""

    # AOS 세션 접두사
    SESSION_PREFIX = "aos-"

    # 부모 Claude Code 세션에서 상속되면 안 되는 환경변수 패턴
    # - CLAUDECODE, CLAUDE_CODE_*: 팀원 모드로 hang 유발
    # - ANTHROPIC_API_KEY/MODEL: 구독 가로채기 방지
    _ENV_STRIP_PREFIXES = ("CLAUDECODE", "CLAUDE_CODE_", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL")

    def __init__(self):
        self._sessions: dict[str, TmuxSessionInfo] = {}

    @staticmethod
    def _clean_env() -> dict[str, str]:
        """Claude Code 관련 환경변수를 제거한 깨끗한 env dict 반환.

        부모 Claude Code 프로세스의 환경변수(CLAUDECODE, CLAUDE_CODE_*,
        ANTHROPIC_API_KEY 등)가 자식 claude -p에 전달되면 팀원 모드로
        동작하여 hang되므로, 패턴 매칭으로 모두 제거합니다.
        """
        return {
            k: v
            for k, v in os.environ.items()
            if not any(k == p or k.startswith(p) for p in TmuxService._ENV_STRIP_PREFIXES)
        }

    @staticmethod
    def _env_keys_to_strip() -> list[str]:
        """현재 환경에서 제거해야 할 Claude Code 관련 변수명 목록 반환."""
        return [
            k
            for k in os.environ
            if any(k == p or k.startswith(p) for p in TmuxService._ENV_STRIP_PREFIXES)
        ]

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
            # _clean_env()로 부모 Claude Code 변수 제거 (팀원 모드 hang 방지)
            clean = self._clean_env()
            clean["HOME"] = str(Path.home())
            proc = await asyncio.create_subprocess_exec(
                "/bin/bash",
                "-l",
                "-c",
                'claude -p "respond with only: ok"',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=clean,
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
        """tmux 세션/pane의 현재 출력 캡처.

        Args:
            name: 세션 이름 (내부적으로 pane_id가 있으면 자동 사용)
            lines: 캡처할 최대 줄 수

        Returns:
            캡처된 출력 텍스트, 실패 시 None
        """
        # split 모드면 pane_id를 타겟으로 사용
        info = self._sessions.get(name)
        target = info.pane_id if info and info.pane_id else name

        try:
            result = subprocess.run(
                [
                    "tmux",
                    "capture-pane",
                    "-t",
                    target,
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
        """tmux 세션 또는 pane 종료."""
        info = self._sessions.get(name)

        try:
            if info and info.pane_id:
                # split 모드: pane만 종료
                subprocess.run(
                    ["tmux", "kill-pane", "-t", info.pane_id],
                    check=True,
                    capture_output=True,
                    text=True,
                )
            else:
                # 독립 세션 모드: 세션 전체 종료
                subprocess.run(
                    ["tmux", "kill-session", "-t", name],
                    check=True,
                    capture_output=True,
                    text=True,
                )
            self._sessions.pop(name, None)
            return True
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to kill tmux target '{name}': {e.stderr}")
            return False

    def list_aos_sessions(self) -> list[TmuxSessionInfo]:
        """모든 AOS tmux 세션/pane 목록 반환."""
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

        # 활성 pane ID 일괄 조회 (N+1 방지)
        live_panes: set[str] = set()
        try:
            result = subprocess.run(
                ["tmux", "list-panes", "-a", "-F", "#{pane_id}"],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0 and result.stdout.strip():
                live_panes = set(result.stdout.strip().split("\n"))
        except subprocess.CalledProcessError:
            pass

        # 내부 추적 정보와 동기화 + 비활성 세션 정리
        sessions = []
        stale_keys = []
        now = utcnow()
        for name, info in list(self._sessions.items()):
            if info.pane_id:
                is_alive = info.pane_id in live_panes
            else:
                is_alive = name in live_sessions
            updated = info.model_copy(update={"active": is_alive})
            self._sessions[name] = updated
            sessions.append(updated)

            # 1시간 이상 비활성 세션 정리 대상
            if not is_alive and (now - info.started_at).total_seconds() > 3600:
                stale_keys.append(name)

        for key in stale_keys:
            self._sessions.pop(key, None)

        return sessions

    # =========================================================================
    # Split-window 모드 (기존 tmux 창에 분할)
    # =========================================================================

    def _find_user_session(self) -> str | None:
        """split 대상 tmux 세션 찾기.

        가장 최근 활동한 세션을 반환합니다.
        비-AOS 세션 우선, 없으면 가장 최근 AOS 세션 사용.

        Returns:
            활성 세션 이름, 없으면 None
        """
        try:
            # session_activity (Unix timestamp)로 최신 활동순 정렬
            result = subprocess.run(
                [
                    "tmux",
                    "list-sessions",
                    "-F",
                    "#{session_activity} #{session_name}",
                ],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0 or not result.stdout.strip():
                return None

            # 활동 시간 역순 정렬 (최신 먼저)
            lines = result.stdout.strip().split("\n")
            entries = []
            for line in lines:
                parts = line.split(" ", 1)
                if len(parts) == 2:
                    entries.append((int(parts[0]), parts[1]))
            entries.sort(key=lambda x: x[0], reverse=True)

            # 비-AOS 세션 우선
            for _, name in entries:
                if not name.startswith(self.SESSION_PREFIX):
                    return name
            # 없으면 가장 최근 AOS 세션
            if entries:
                return entries[0][1]
            return None
        except Exception:
            return None

    def split_window(
        self, target_session: str, command: str, cwd: str | None = None
    ) -> str | None:
        """기존 tmux 세션의 현재 윈도우를 분할하여 명령어 실행.

        pane이 너무 작으면 (높이 < 10줄) 새 윈도우를 만듭니다.
        pane 생성과 명령어 전송을 분리하여 quoting 문제를 방지합니다.

        Args:
            target_session: 분할할 대상 세션 이름
            command: 새 pane에서 실행할 명령어
            cwd: 작업 디렉토리 (선택)

        Returns:
            새 pane의 ID (%N 형식), 실패 시 None
        """
        # 현재 활성 pane 높이 확인 — 작으면 split 대신 new-window
        # window_height는 전체 윈도우라 항상 크므로, pane_height를 사용
        use_new_window = False
        try:
            height_result = subprocess.run(
                ["tmux", "display-message", "-t", target_session, "-p", "#{pane_height}"],
                capture_output=True,
                text=True,
            )
            pane_height = int(height_result.stdout.strip()) if height_result.stdout.strip() else 0
            if pane_height < 20:
                use_new_window = True
        except (subprocess.CalledProcessError, ValueError):
            pass

        # 1단계: pane 또는 window 생성
        if use_new_window:
            args = [
                "tmux",
                "new-window",
                "-t",
                target_session,
                "-P",
                "-F",
                "#{pane_id}",
            ]
        else:
            args = [
                "tmux",
                "split-window",
                "-t",
                target_session,
                "-v",  # 세로 분할 (위/아래)
                "-l",
                "50%",
                "-P",
                "-F",
                "#{pane_id}",
            ]
        if cwd:
            args.extend(["-c", cwd])

        try:
            result = subprocess.run(
                args, capture_output=True, text=True, check=True
            )
            pane_id = result.stdout.strip()
        except subprocess.CalledProcessError as e:
            logger.error("Failed to create pane in '%s': %s", target_session, e.stderr)
            return None

        # 2단계: 새 pane에 명령어 전송 (quoting 문제 회피)
        try:
            subprocess.run(
                ["tmux", "send-keys", "-t", pane_id, command, "Enter"],
                check=True,
                capture_output=True,
                text=True,
            )
        except subprocess.CalledProcessError as e:
            logger.error("Failed to send command to pane %s: %s", pane_id, e.stderr)
            return None

        mode = "new-window" if use_new_window else "split"
        logger.info("Created %s pane %s in session '%s'", mode, pane_id, target_session)
        return pane_id

    def is_pane_alive(self, pane_id: str) -> bool:
        """tmux pane이 살아있는지 확인."""
        try:
            subprocess.run(
                ["tmux", "display-message", "-t", pane_id, "-p", ""],
                check=True,
                capture_output=True,
                text=True,
            )
            return True
        except subprocess.CalledProcessError:
            return False

    # =========================================================================
    # GUI 터미널 연결 (split 불가 시 폴백)
    # =========================================================================

    def _detect_terminal_app(self) -> str:
        """GUI 터미널 감지: iTerm 우선, 없으면 Terminal.app.

        Returns:
            "iTerm" 또는 "Terminal"
        """
        if Path("/Applications/iTerm.app").exists():
            return "iTerm"
        return "Terminal"

    def open_gui_terminal(self, session_name: str) -> bool:
        """GUI 터미널 창을 열어 tmux 세션에 attach.

        iTerm이 설치되어 있으면 iTerm, 아니면 Terminal.app을 사용합니다.
        Best-effort: 실패해도 tmux 세션 실행에 영향 없음.

        Args:
            session_name: attach할 tmux 세션 이름

        Returns:
            성공 여부
        """
        terminal_app = self._detect_terminal_app()
        tmux_path = shutil.which("tmux") or "/opt/homebrew/bin/tmux"
        attach_cmd = f"{tmux_path} attach-session -t {session_name}"

        if terminal_app == "iTerm":
            applescript = (
                'tell application "iTerm"\n'
                "    activate\n"
                f'    create window with default profile command "{attach_cmd}"\n'
                "end tell"
            )
        else:
            applescript = (
                'tell application "Terminal"\n'
                "    activate\n"
                f'    do script "{attach_cmd}"\n'
                "end tell"
            )

        try:
            subprocess.run(
                ["osascript", "-e", applescript],
                check=True,
                capture_output=True,
                text=True,
                timeout=5,
            )
            logger.info("Opened %s for tmux session '%s'", terminal_app, session_name)
            return True
        except subprocess.TimeoutExpired:
            logger.warning("Timeout opening %s for session '%s'", terminal_app, session_name)
            return False
        except subprocess.CalledProcessError as e:
            logger.warning(
                "Failed to open %s for session '%s': %s",
                terminal_app,
                session_name,
                e.stderr,
            )
            return False
        except Exception as e:
            logger.warning("Unexpected error opening GUI terminal: %s", e)
            return False

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

        기존 tmux 세션이 있으면 split-window로 분할하여 실행하고,
        없으면 새 세션을 생성한 후 GUI 터미널을 엽니다.

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

        # 트래킹용 이름 생성
        short_id = analysis_id[:8]
        timestamp = int(time.time())
        session_name = f"{self.SESSION_PREFIX}{short_id}-{timestamp}"

        # 프롬프트 생성 및 임시 파일 저장
        prompt = self.build_claude_prompt(analysis, task_input)

        import tempfile

        prompt_dir = Path(tempfile.mkdtemp(prefix="aos-"))
        prompt_file = prompt_dir / f"{session_name}.md"
        prompt_file.write_text(prompt, encoding="utf-8")

        # Claude 명령어 조립
        strip_keys = self._env_keys_to_strip()
        unset_clause = f"unset {' '.join(strip_keys)}; " if strip_keys else ""
        cd_clause = f"cd \"{project_path}\" && " if project_path and project_path != "." else ""

        # branch 생성 (선택, 실패해도 계속 진행)
        import re

        branch_clause = ""
        if branch_name and re.match(r"^[a-zA-Z0-9/_.-]+$", branch_name) and len(branch_name) <= 100:
            branch_clause = f"git checkout -b {branch_name} 2>/dev/null; "

        claude_cmd = (
            f"bash -l -c '{unset_clause}{cd_clause}{branch_clause}"
            f"claude \"$(cat \"{prompt_file}\")\" --dangerously-skip-permissions'"
        )

        # ── 독립 세션 + GUI 터미널 ──
        if not self.create_session(session_name, project_path):
            return None

        for env_key in strip_keys:
            subprocess.run(
                ["tmux", "set-environment", "-t", session_name, "-u", env_key],
                capture_output=True,
            )

        if not self.send_command(session_name, claude_cmd):
            self.kill_session(session_name)
            return None

        info = TmuxSessionInfo(
            session_name=session_name,
            analysis_id=analysis_id,
            project_path=project_path,
            active=True,
            started_at=utcnow(),
            task_input=task_input,
        )
        self._sessions[session_name] = info

        # GUI 터미널로 세션 표시
        self.open_gui_terminal(session_name)

        return info

    def get_session(self, session_name: str) -> TmuxSessionInfo | None:
        """세션 정보 조회 (활성 상태 갱신 포함)."""
        info = self._sessions.get(session_name)
        if not info:
            return None

        # 실제 tmux 세션/pane 상태 확인
        if info.pane_id:
            is_alive = self.is_pane_alive(info.pane_id)
        else:
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
