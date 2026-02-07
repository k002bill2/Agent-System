"""Code analysis and development tools."""

import json
import os
import subprocess

from langchain_core.tools import tool


@tool
def run_tests(
    path: str = ".",
    pattern: str | None = None,
    framework: str = "auto",
) -> str:
    """
    테스트를 실행합니다.

    Args:
        path: 테스트 경로 또는 프로젝트 루트
        pattern: 테스트 파일 패턴 (예: "test_*.py")
        framework: 테스트 프레임워크 ("pytest", "jest", "auto")

    Returns:
        테스트 결과 또는 오류 메시지
    """
    path = os.path.expanduser(path)

    if not os.path.exists(path):
        return f"Error: Path does not exist: {path}"

    # Auto-detect framework
    if framework == "auto":
        framework = _detect_test_framework(path)

    try:
        if framework == "pytest":
            cmd = ["pytest", path, "-v", "--tb=short"]
            if pattern:
                cmd.extend(["-k", pattern])
        elif framework == "jest":
            cmd = ["npm", "test", "--", "--passWithNoTests"]
            if pattern:
                cmd.extend(["--testPathPattern", pattern])
        elif framework == "npm":
            cmd = ["npm", "test"]
        else:
            return f"Error: Unknown test framework: {framework}"

        result = subprocess.run(
            cmd,
            cwd=path if os.path.isdir(path) else os.path.dirname(path),
            capture_output=True,
            text=True,
            timeout=300,
        )

        output = ""
        if result.stdout:
            output += result.stdout
        if result.stderr:
            output += f"\n[stderr]\n{result.stderr}"

        # Truncate if too long
        max_length = 20000
        if len(output) > max_length:
            output = output[:max_length] + "\n... (truncated)"

        status = "✅ PASSED" if result.returncode == 0 else "❌ FAILED"
        return f"Test Results ({status}):\n{output}"

    except subprocess.TimeoutExpired:
        return "Error: Tests timed out after 5 minutes"
    except FileNotFoundError as e:
        return f"Error: Test framework not found. Please install: {str(e)}"
    except Exception as e:
        return f"Error running tests: {str(e)}"


@tool
def run_lint(path: str = ".", fix: bool = False) -> str:
    """
    린트를 실행합니다.

    Args:
        path: 린트할 경로
        fix: True면 자동 수정 시도

    Returns:
        린트 결과 또는 오류 메시지
    """
    path = os.path.expanduser(path)

    if not os.path.exists(path):
        return f"Error: Path does not exist: {path}"

    # Detect linter based on project files
    linter = _detect_linter(path)

    try:
        if linter == "eslint":
            cmd = ["npx", "eslint", path]
            if fix:
                cmd.append("--fix")
        elif linter == "ruff":
            cmd = ["ruff", "check", path]
            if fix:
                cmd.append("--fix")
        elif linter == "flake8":
            cmd = ["flake8", path]
        elif linter == "pylint":
            cmd = ["pylint", path]
        else:
            return f"No linter detected for path: {path}"

        result = subprocess.run(
            cmd,
            cwd=os.path.dirname(path) if os.path.isfile(path) else path,
            capture_output=True,
            text=True,
            timeout=120,
        )

        output = ""
        if result.stdout:
            output += result.stdout
        if result.stderr:
            output += f"\n{result.stderr}"

        if not output.strip():
            return "✅ No lint issues found"

        status = "✅ CLEAN" if result.returncode == 0 else "⚠️ ISSUES FOUND"
        return f"Lint Results ({status}):\n{output}"

    except subprocess.TimeoutExpired:
        return "Error: Linting timed out"
    except FileNotFoundError as e:
        return f"Error: Linter not found. Please install: {str(e)}"
    except Exception as e:
        return f"Error running lint: {str(e)}"


@tool
def run_typecheck(path: str = ".") -> str:
    """
    타입 체크를 실행합니다.

    Args:
        path: 타입 체크할 경로

    Returns:
        타입 체크 결과 또는 오류 메시지
    """
    path = os.path.expanduser(path)

    if not os.path.exists(path):
        return f"Error: Path does not exist: {path}"

    # Detect type checker based on project files
    checker = _detect_type_checker(path)

    try:
        if checker == "typescript":
            cmd = ["npx", "tsc", "--noEmit"]
        elif checker == "mypy":
            cmd = ["mypy", path]
        elif checker == "pyright":
            cmd = ["pyright", path]
        else:
            return f"No type checker detected for path: {path}"

        work_dir = os.path.dirname(path) if os.path.isfile(path) else path

        result = subprocess.run(
            cmd,
            cwd=work_dir,
            capture_output=True,
            text=True,
            timeout=180,
        )

        output = ""
        if result.stdout:
            output += result.stdout
        if result.stderr:
            output += f"\n{result.stderr}"

        if not output.strip():
            return "✅ No type errors found"

        status = "✅ CLEAN" if result.returncode == 0 else "❌ TYPE ERRORS"
        return f"Type Check Results ({status}):\n{output}"

    except subprocess.TimeoutExpired:
        return "Error: Type checking timed out"
    except FileNotFoundError as e:
        return f"Error: Type checker not found. Please install: {str(e)}"
    except Exception as e:
        return f"Error running type check: {str(e)}"


def _detect_test_framework(path: str) -> str:
    """Detect test framework based on project files."""
    if os.path.isfile(path):
        path = os.path.dirname(path)

    # Check for Python test frameworks
    if os.path.exists(os.path.join(path, "pytest.ini")) or os.path.exists(
        os.path.join(path, "pyproject.toml")
    ):
        return "pytest"

    # Check for Node.js test frameworks
    package_json = os.path.join(path, "package.json")
    if os.path.exists(package_json):
        try:
            with open(package_json) as f:
                pkg = json.load(f)
                if "jest" in pkg.get("devDependencies", {}):
                    return "jest"
                if "test" in pkg.get("scripts", {}):
                    return "npm"
        except Exception:
            pass

    # Default to pytest for Python files
    for f in os.listdir(path):
        if f.endswith(".py"):
            return "pytest"

    return "unknown"


def _detect_linter(path: str) -> str:
    """Detect linter based on project files."""
    if os.path.isfile(path):
        check_path = os.path.dirname(path)
        file_ext = os.path.splitext(path)[1]
    else:
        check_path = path
        file_ext = None

    # Check for ESLint
    if (
        os.path.exists(os.path.join(check_path, ".eslintrc.js"))
        or os.path.exists(os.path.join(check_path, ".eslintrc.json"))
        or os.path.exists(os.path.join(check_path, "eslint.config.js"))
    ):
        return "eslint"

    # Check for Python linters
    if os.path.exists(os.path.join(check_path, "ruff.toml")) or os.path.exists(
        os.path.join(check_path, ".ruff.toml")
    ):
        return "ruff"

    # Check pyproject.toml for linter config
    pyproject = os.path.join(check_path, "pyproject.toml")
    if os.path.exists(pyproject):
        try:
            with open(pyproject) as f:
                content = f.read()
                if "[tool.ruff]" in content:
                    return "ruff"
                if "[tool.flake8]" in content:
                    return "flake8"
                if "[tool.pylint]" in content:
                    return "pylint"
        except Exception:
            pass

    # Default based on file extension
    if file_ext == ".py" or any(f.endswith(".py") for f in os.listdir(check_path)):
        return "ruff"  # Prefer ruff as default Python linter
    if file_ext in [".js", ".ts", ".jsx", ".tsx"]:
        return "eslint"

    return "unknown"


def _detect_type_checker(path: str) -> str:
    """Detect type checker based on project files."""
    if os.path.isfile(path):
        check_path = os.path.dirname(path)
        file_ext = os.path.splitext(path)[1]
    else:
        check_path = path
        file_ext = None

    # Check for TypeScript
    if os.path.exists(os.path.join(check_path, "tsconfig.json")):
        return "typescript"

    # Check for Python type checkers
    pyproject = os.path.join(check_path, "pyproject.toml")
    if os.path.exists(pyproject):
        try:
            with open(pyproject) as f:
                content = f.read()
                if "[tool.mypy]" in content:
                    return "mypy"
                if "[tool.pyright]" in content:
                    return "pyright"
        except Exception:
            pass

    # Default based on extension
    if file_ext in [".ts", ".tsx"]:
        return "typescript"
    if file_ext == ".py" or any(f.endswith(".py") for f in os.listdir(check_path)):
        return "mypy"

    return "unknown"
