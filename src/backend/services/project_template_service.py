"""Project template service for creating new projects from templates."""

from pathlib import Path
from dataclasses import dataclass


@dataclass
class ProjectTemplate:
    """Template definition."""

    id: str
    name: str
    description: str
    files: dict[str, str]  # filename -> content template


# Template variable placeholders: {name}, {id}, {description}

TEMPLATES: dict[str, ProjectTemplate] = {
    "default": ProjectTemplate(
        id="default",
        name="Default Project",
        description="Basic project with CLAUDE.md and README",
        files={
            "CLAUDE.md": """# {name}

## Overview
{description}

## Project Structure

```
{id}/
├── CLAUDE.md          # Project instructions for Claude Code
├── README.md          # Project documentation
└── src/               # Source code
```

## Quick Start

```bash
# Add your quick start commands here
```

## Code Patterns

Add your code patterns and conventions here.
""",
            "README.md": """# {name}

{description}

## Getting Started

Add installation and usage instructions here.

## License

MIT
""",
            ".gitignore": """# Dependencies
node_modules/
__pycache__/
*.pyc
.venv/
venv/

# IDE
.idea/
.vscode/
*.swp
*.swo

# Build
dist/
build/
*.egg-info/

# Environment
.env
.env.local

# OS
.DS_Store
Thumbs.db
""",
        },
    ),
    "react-native": ProjectTemplate(
        id="react-native",
        name="React Native (Expo)",
        description="React Native project with Expo SDK",
        files={
            "CLAUDE.md": """# {name}

## Overview
{description}

React Native application built with Expo SDK.

## Tech Stack

| Technology | Version |
|------------|---------|
| React Native | 0.73+ |
| Expo SDK | ~50 |
| TypeScript | 5.x |

## Quick Start

```bash
npm install
npm start
```

## Project Structure

```
{id}/
├── app/                # Expo Router pages
├── components/         # Reusable components
├── hooks/              # Custom hooks
├── services/           # API services
├── stores/             # Zustand stores
└── utils/              # Utility functions
```

## Path Aliases

```typescript
import {{ Button }} from '@/components/Button'
import {{ useAuth }} from '@/hooks/useAuth'
```

## Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server |
| `npm test` | Run Jest tests |
| `npm run lint` | Run ESLint |
| `npm run type-check` | TypeScript check |
""",
            "README.md": """# {name}

{description}

## Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)

## Installation

```bash
npm install
```

## Development

```bash
npm start
```

## License

MIT
""",
            ".gitignore": """# Expo
.expo/
dist/
web-build/

# Dependencies
node_modules/

# Native
*.orig.*
*.jks
*.p8
*.p12
*.key
*.mobileprovision
*.orig.*

# Metro
.metro-health-check*

# Debug
npm-debug.*
yarn-debug.*
yarn-error.*

# macOS
.DS_Store
*.pem

# Environment
.env
.env.*
!.env.example

# TypeScript
*.tsbuildinfo

# Testing
coverage/
""",
            "app.json": """{
  "expo": {
    "name": "{name}",
    "slug": "{id}",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      }
    },
    "web": {
      "favicon": "./assets/favicon.png"
    }
  }
}
""",
            "package.json": """{
  "name": "{id}",
  "version": "1.0.0",
  "description": "{description}",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "test": "jest",
    "lint": "eslint .",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "expo": "~50.0.0",
    "expo-router": "~3.4.0",
    "expo-status-bar": "~1.11.0",
    "react": "18.2.0",
    "react-native": "0.73.0"
  },
  "devDependencies": {
    "@babel/core": "^7.20.0",
    "@types/react": "~18.2.45",
    "typescript": "^5.3.0"
  },
  "private": true
}
""",
            "tsconfig.json": """{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
""",
        },
    ),
    "python": ProjectTemplate(
        id="python",
        name="Python Package",
        description="Python package with pyproject.toml",
        files={
            "CLAUDE.md": """# {name}

## Overview
{description}

Python package using modern pyproject.toml configuration.

## Quick Start

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # or .venv\\Scripts\\activate on Windows

# Install dependencies
pip install -e .

# Run tests
pytest
```

## Project Structure

```
{id}/
├── src/
│   └── {id}/          # Package source
│       ├── __init__.py
│       └── main.py
├── tests/              # Test files
├── pyproject.toml      # Package configuration
└── README.md
```

## Commands

| Command | Description |
|---------|-------------|
| `pytest` | Run tests |
| `ruff check .` | Run linter |
| `ruff format .` | Format code |
| `mypy src` | Type check |
""",
            "README.md": """# {name}

{description}

## Installation

```bash
pip install -e .
```

## Usage

```python
from {id} import main
```

## Development

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest
```

## License

MIT
""",
            ".gitignore": """# Byte-compiled
__pycache__/
*.py[cod]
*$py.class

# Virtual environments
.venv/
venv/
ENV/

# Distribution
dist/
build/
*.egg-info/

# IDE
.idea/
.vscode/
*.swp

# Testing
.pytest_cache/
.coverage
htmlcov/

# Type checking
.mypy_cache/

# Environment
.env
""",
            "pyproject.toml": """[project]
name = "{id}"
version = "0.1.0"
description = "{description}"
readme = "README.md"
requires-python = ">=3.11"
dependencies = []

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "ruff>=0.3",
    "mypy>=1.8",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "UP"]

[tool.mypy]
python_version = "3.11"
strict = true
""",
            "src/{id}/__init__.py": '''"""{name}."""

__version__ = "0.1.0"
''',
            "src/{id}/main.py": '''"""Main module."""


def hello() -> str:
    """Return greeting."""
    return "Hello from {name}!"
''',
            "tests/__init__.py": "",
            "tests/test_main.py": '''"""Test main module."""

from {id}.main import hello


def test_hello():
    """Test hello function."""
    assert hello() == "Hello from {name}!"
''',
        },
    ),
    "fastapi": ProjectTemplate(
        id="fastapi",
        name="FastAPI Service",
        description="FastAPI web service with async support",
        files={
            "CLAUDE.md": """# {name}

## Overview
{description}

FastAPI-based REST API service with async support.

## Quick Start

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -e .

# Run development server
uvicorn app.main:app --reload
```

## Project Structure

```
{id}/
├── app/
│   ├── __init__.py
│   ├── main.py         # FastAPI app
│   ├── api/            # API routes
│   ├── models/         # Pydantic models
│   └── services/       # Business logic
├── tests/              # Test files
├── pyproject.toml
└── README.md
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/...` | API routes |

## Commands

| Command | Description |
|---------|-------------|
| `uvicorn app.main:app --reload` | Dev server |
| `pytest` | Run tests |
| `ruff check .` | Linter |
""",
            "README.md": """# {name}

{description}

## Installation

```bash
pip install -e .
```

## Running

```bash
uvicorn app.main:app --reload
```

API docs available at: http://localhost:8000/docs

## License

MIT
""",
            ".gitignore": """# Python
__pycache__/
*.py[cod]
*$py.class
.venv/
venv/
dist/
build/
*.egg-info/

# IDE
.idea/
.vscode/

# Testing
.pytest_cache/
.coverage
htmlcov/

# Environment
.env
""",
            "pyproject.toml": """[project]
name = "{id}"
version = "0.1.0"
description = "{description}"
readme = "README.md"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.109",
    "uvicorn[standard]>=0.27",
    "pydantic>=2.6",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "httpx>=0.26",
    "ruff>=0.3",
    "mypy>=1.8",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "UP"]
""",
            "app/__init__.py": "",
            "app/main.py": '''"""FastAPI application."""

from fastapi import FastAPI

app = FastAPI(
    title="{name}",
    description="{description}",
    version="0.1.0",
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {{"status": "healthy", "service": "{id}"}}


@app.get("/")
async def root():
    """Root endpoint."""
    return {{"message": "Welcome to {name}"}}
''',
            "tests/__init__.py": "",
            "tests/test_main.py": '''"""Test main module."""

from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


def test_health():
    """Test health endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_root():
    """Test root endpoint."""
    response = client.get("/")
    assert response.status_code == 200
''',
        },
    ),
}


def get_templates() -> list[dict]:
    """Get list of available templates."""
    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
        }
        for t in TEMPLATES.values()
    ]


def get_template(template_id: str) -> ProjectTemplate | None:
    """Get a specific template."""
    return TEMPLATES.get(template_id)


def create_project_from_template(
    project_path: Path,
    template_id: str,
    project_id: str,
    project_name: str,
    description: str = "",
) -> bool:
    """
    Create a new project from a template.

    Args:
        project_path: Path where the project will be created
        template_id: Template to use
        project_id: Project identifier (used for package names, etc.)
        project_name: Display name
        description: Project description

    Returns:
        True if successful, False otherwise
    """
    template = TEMPLATES.get(template_id)
    if not template:
        return False

    # Create project directory
    project_path.mkdir(parents=True, exist_ok=True)

    # Variable substitution
    variables = {
        "{name}": project_name,
        "{id}": project_id,
        "{description}": description or f"{project_name} project",
    }

    # Create files from template
    for filename, content in template.files.items():
        # Substitute variables in filename
        actual_filename = filename
        for var, val in variables.items():
            actual_filename = actual_filename.replace(var, val)

        file_path = project_path / actual_filename

        # Create parent directories if needed
        file_path.parent.mkdir(parents=True, exist_ok=True)

        # Substitute variables in content
        actual_content = content
        for var, val in variables.items():
            actual_content = actual_content.replace(var, val)

        file_path.write_text(actual_content, encoding="utf-8")

    return True
