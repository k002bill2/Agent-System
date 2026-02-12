"""Workflow template service with built-in templates."""

import uuid
from datetime import datetime
from typing import Any

from models.template import TemplateCategory, TemplateCreate, TemplateUpdate
from services.workflow_yaml_parser import parse_workflow_yaml


# Built-in templates
BUILTIN_TEMPLATES = [
    {
        "name": "Python CI",
        "description": "Python CI pipeline with linting, type checking, and testing",
        "category": TemplateCategory.CI,
        "tags": ["python", "pytest", "ruff"],
        "icon": "code",
        "yaml_content": """name: Python CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
env:
  PYTHON_VERSION: "3.12"
jobs:
  lint:
    runs_on: local
    steps:
      - name: Run ruff linter
        run: ruff check .
      - name: Run ruff formatter
        run: ruff format --check .
  typecheck:
    runs_on: local
    steps:
      - name: Run mypy
        run: mypy . --ignore-missing-imports
  test:
    runs_on: local
    needs: [lint, typecheck]
    steps:
      - name: Run pytest
        run: pytest --tb=short -q
""",
    },
    {
        "name": "Node.js CI",
        "description": "Node.js CI pipeline with ESLint and Vitest",
        "category": TemplateCategory.CI,
        "tags": ["nodejs", "vitest", "eslint"],
        "icon": "hexagon",
        "yaml_content": """name: Node.js CI
on:
  push:
    branches: [main]
env:
  NODE_VERSION: "20"
jobs:
  lint:
    runs_on: local
    steps:
      - name: Install dependencies
        run: npm ci
      - name: Run ESLint
        run: npm run lint
  test:
    runs_on: local
    needs: [lint]
    steps:
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npm test
  build:
    runs_on: local
    needs: [test]
    steps:
      - name: Build project
        run: npm run build
""",
    },
    {
        "name": "Deploy Script",
        "description": "Generic deployment workflow with build and deploy steps",
        "category": TemplateCategory.DEPLOY,
        "tags": ["deploy", "production"],
        "icon": "rocket",
        "yaml_content": """name: Deploy
on:
  manual: {}
env:
  DEPLOY_ENV: production
jobs:
  build:
    runs_on: local
    steps:
      - name: Build application
        run: echo "Building..."
      - name: Run smoke tests
        run: echo "Smoke tests passed"
  deploy:
    runs_on: local
    needs: [build]
    steps:
      - name: Deploy to production
        run: echo "Deploying to ${{ env.DEPLOY_ENV }}..."
      - name: Verify deployment
        run: echo "Deployment verified"
""",
    },
    {
        "name": "Test Suite",
        "description": "Multi-environment test suite with matrix strategy",
        "category": TemplateCategory.TEST,
        "tags": ["test", "matrix", "multi-env"],
        "icon": "check-circle",
        "yaml_content": """name: Test Suite
on:
  manual: {}
jobs:
  test:
    runs_on: local
    matrix:
      env: [development, staging, production]
    steps:
      - name: Run tests for ${{ matrix.env }}
        run: echo "Testing in ${{ matrix.env }} environment"
      - name: Generate report
        run: echo "Test report for ${{ matrix.env }}"
""",
    },
]


class TemplateService:
    """Manages workflow templates including built-in ones."""

    def __init__(self):
        self._templates: dict[str, dict[str, Any]] = {}
        self._seed_builtins()

    def _seed_builtins(self):
        """Seed built-in templates."""
        for tpl in BUILTIN_TEMPLATES:
            template_id = str(uuid.uuid4())
            now = datetime.utcnow()
            self._templates[template_id] = {
                "id": template_id,
                "name": tpl["name"],
                "description": tpl["description"],
                "category": tpl["category"],
                "tags": tpl["tags"],
                "yaml_content": tpl["yaml_content"],
                "icon": tpl["icon"],
                "popularity": 0,
                "is_builtin": True,
                "created_at": now,
                "updated_at": now,
            }

    def list_templates(
        self,
        category: TemplateCategory | None = None,
        search: str | None = None,
    ) -> list[dict]:
        """List templates with optional filtering."""
        templates = list(self._templates.values())
        if category:
            templates = [t for t in templates if t["category"] == category]
        if search:
            search_lower = search.lower()
            templates = [
                t for t in templates
                if search_lower in t["name"].lower()
                or search_lower in t["description"].lower()
                or any(search_lower in tag.lower() for tag in t.get("tags", []))
            ]
        return sorted(templates, key=lambda t: t.get("popularity", 0), reverse=True)

    def get_template(self, template_id: str) -> dict | None:
        """Get a template by ID."""
        return self._templates.get(template_id)

    def create_template(self, data: TemplateCreate) -> dict:
        """Create a new template."""
        # Validate YAML
        parse_workflow_yaml(data.yaml_content)

        template_id = str(uuid.uuid4())
        now = datetime.utcnow()
        template = {
            "id": template_id,
            "name": data.name,
            "description": data.description,
            "category": data.category,
            "tags": data.tags,
            "yaml_content": data.yaml_content,
            "icon": data.icon,
            "popularity": 0,
            "is_builtin": False,
            "created_at": now,
            "updated_at": now,
        }
        self._templates[template_id] = template
        return template

    def update_template(self, template_id: str, data: TemplateUpdate) -> dict | None:
        """Update a template."""
        template = self._templates.get(template_id)
        if not template:
            return None

        if data.name is not None:
            template["name"] = data.name
        if data.description is not None:
            template["description"] = data.description
        if data.category is not None:
            template["category"] = data.category
        if data.tags is not None:
            template["tags"] = data.tags
        if data.yaml_content is not None:
            parse_workflow_yaml(data.yaml_content)  # validate
            template["yaml_content"] = data.yaml_content
        if data.icon is not None:
            template["icon"] = data.icon

        template["updated_at"] = datetime.utcnow()
        return template

    def delete_template(self, template_id: str) -> bool:
        """Delete a template."""
        return self._templates.pop(template_id, None) is not None

    def create_workflow_from_template(
        self,
        template_id: str,
        name: str | None = None,
        project_id: str | None = None,
    ) -> dict | None:
        """Create a new workflow from a template."""
        template = self._templates.get(template_id)
        if not template:
            return None

        # Increment popularity
        template["popularity"] = template.get("popularity", 0) + 1

        from models.workflow import WorkflowCreate
        from services.workflow_service import get_workflow_service

        service = get_workflow_service()
        workflow = service.create_workflow(
            WorkflowCreate(
                name=name or f"{template['name']} (from template)",
                description=template["description"],
                yaml_content=template["yaml_content"],
                project_id=project_id,
            )
        )
        return workflow


# Singleton
_service: TemplateService | None = None


def get_template_service() -> TemplateService:
    global _service
    if _service is None:
        _service = TemplateService()
    return _service
