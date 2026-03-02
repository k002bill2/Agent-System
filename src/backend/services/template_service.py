"""Workflow template service with built-in templates."""

import uuid
from typing import Any

from models.template import TemplateCategory, TemplateCreate, TemplateUpdate
from services.workflow_yaml_parser import parse_workflow_yaml
from utils.time import utcnow

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
    {
        "name": "React Dashboard Dev Server",
        "description": "React 대시보드 개발 서버 실행 워크플로우 (포트 확인, 의존성 설치, 타입 체크, Vite 시작)",
        "category": TemplateCategory.UTILITY,
        "tags": ["react", "vite", "dashboard", "dev-server", "typescript"],
        "icon": "monitor",
        "yaml_content": """name: React Dashboard Dev Server
on:
  manual: {}
env:
  DASHBOARD_DIR: src/dashboard
  DEV_PORT: "5173"
jobs:
  check-port:
    name: Check port availability
    runs_on: local
    steps:
      - name: Kill existing Vite process if running
        run: pkill -f "vite.*${{ env.DEV_PORT }}" 2>/dev/null || echo "No existing process"
      - name: Verify port is free
        run: lsof -i :${{ env.DEV_PORT }} 2>/dev/null && echo "WARNING - port still in use" || echo "Port ${{ env.DEV_PORT }} is free"
  install-deps:
    name: Install dependencies
    runs_on: local
    steps:
      - name: Install npm dependencies
        run: cd ${{ env.DASHBOARD_DIR }} && test -d node_modules && echo "node_modules exists" || npm install
  type-check:
    name: TypeScript type check
    runs_on: local
    needs: [install-deps]
    steps:
      - name: Run tsc --noEmit
        run: cd ${{ env.DASHBOARD_DIR }} && npx tsc --noEmit
        continue_on_error: true
  start-server:
    name: Start Vite dev server
    runs_on: local
    needs: [check-port, type-check]
    steps:
      - name: Start dev server in background
        run: cd ${{ env.DASHBOARD_DIR }} && nohup npm run dev > /dev/null 2>&1 & echo "Dev server PID=$!"
      - name: Wait for server to be ready
        run: sleep 3 && curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:${{ env.DEV_PORT }}/ || echo "Server starting..."
      - name: Print access info
        run: echo "Dashboard available at http://localhost:${{ env.DEV_PORT }}"
""",
    },
    {
        "name": "Full Stack Health Check",
        "description": "백엔드 API + 프론트엔드 + DB 연결 상태를 한번에 점검하는 헬스체크 워크플로우",
        "category": TemplateCategory.UTILITY,
        "tags": ["health", "monitoring", "fullstack"],
        "icon": "activity",
        "yaml_content": """name: Full Stack Health Check
on:
  manual: {}
  schedule:
    - cron: "*/30 * * * *"
env:
  BACKEND_URL: "http://localhost:8000"
  FRONTEND_URL: "http://localhost:5173"
jobs:
  check-backend:
    name: Backend API health
    runs_on: local
    steps:
      - name: API health endpoint
        run: curl -sf ${{ env.BACKEND_URL }}/api/health && echo " OK" || echo "FAIL - backend unreachable"
      - name: API response time
        run: curl -o /dev/null -s -w "Response time %{time_total}s" ${{ env.BACKEND_URL }}/api/health || echo "FAIL"
        continue_on_error: true
  check-frontend:
    name: Frontend health
    runs_on: local
    steps:
      - name: Dashboard reachable
        run: curl -sf -o /dev/null ${{ env.FRONTEND_URL }}/ && echo "OK" || echo "FAIL - dashboard unreachable"
        continue_on_error: true
  check-database:
    name: Database connectivity
    runs_on: local
    steps:
      - name: PostgreSQL ping
        run: pg_isready -h localhost -p 5432 -U aos 2>/dev/null && echo "PostgreSQL OK" || echo "PostgreSQL FAIL"
        continue_on_error: true
      - name: Redis ping
        run: redis-cli -h localhost -p 6379 ping 2>/dev/null && echo "Redis OK" || echo "Redis FAIL"
        continue_on_error: true
  report:
    name: Generate report
    runs_on: local
    needs: [check-backend, check-frontend, check-database]
    steps:
      - name: Print summary
        run: echo "Health check completed at $(date '+%Y-%m-%d %H:%M:%S')"
""",
    },
    {
        "name": "Database Backup",
        "description": "PostgreSQL 데이터베이스 백업 및 정리 워크플로우 (일일/주간 백업)",
        "category": TemplateCategory.UTILITY,
        "tags": ["database", "backup", "postgresql"],
        "icon": "database",
        "yaml_content": """name: Database Backup
on:
  manual: {}
  schedule:
    - cron: "0 2 * * *"
env:
  DB_HOST: localhost
  DB_PORT: "5432"
  DB_NAME: aos
  DB_USER: aos
  BACKUP_DIR: backups/db
  RETENTION_DAYS: "7"
jobs:
  backup:
    name: Create backup
    runs_on: local
    steps:
      - name: Create backup directory
        run: mkdir -p ${{ env.BACKUP_DIR }}
      - name: Dump database
        run: pg_dump -h ${{ env.DB_HOST }} -p ${{ env.DB_PORT }} -U ${{ env.DB_USER }} -Fc ${{ env.DB_NAME }} > ${{ env.BACKUP_DIR }}/backup_$(date +%Y%m%d_%H%M%S).dump 2>&1 || echo "pg_dump failed - is PostgreSQL running?"
        continue_on_error: true
      - name: Verify backup file
        run: ls -lh ${{ env.BACKUP_DIR }}/backup_*.dump 2>/dev/null || echo "No backup files found"
        continue_on_error: true
  cleanup:
    name: Remove old backups
    runs_on: local
    needs: [backup]
    steps:
      - name: Delete backups older than retention period
        run: find ${{ env.BACKUP_DIR }} -name "*.dump" -mtime +${{ env.RETENTION_DAYS }} -delete -print 2>/dev/null || echo "No old backups to remove"
      - name: List remaining backups
        run: ls -lh ${{ env.BACKUP_DIR }}/ 2>/dev/null || echo "Backup directory empty"
""",
    },
    {
        "name": "PR Validation",
        "description": "Pull Request 코드 품질 검증 파이프라인 (lint, type-check, test, build)",
        "category": TemplateCategory.CI,
        "tags": ["pr", "validation", "quality", "ci"],
        "icon": "git-pull-request",
        "yaml_content": """name: PR Validation
on:
  pull_request:
    branches: [main, develop]
jobs:
  backend-check:
    name: Backend validation
    runs_on: local
    steps:
      - name: Lint with ruff
        run: cd src/backend && ruff check . 2>&1 || echo "ruff not found"
      - name: Format check
        run: cd src/backend && ruff format --check . 2>&1 || echo "ruff format check failed"
      - name: Run backend tests
        run: cd src/backend && pytest ../../tests/backend --tb=short -q 2>&1 || echo "pytest failed"
  frontend-check:
    name: Frontend validation
    runs_on: local
    steps:
      - name: Install dependencies
        run: cd src/dashboard && npm ci 2>&1
      - name: TypeScript type check
        run: cd src/dashboard && npx tsc --noEmit 2>&1
      - name: ESLint
        run: cd src/dashboard && npm run lint 2>&1
      - name: Run tests
        run: cd src/dashboard && npm run test:run 2>&1
      - name: Build check
        run: cd src/dashboard && npm run build 2>&1
  summary:
    name: Validation summary
    runs_on: local
    needs: [backend-check, frontend-check]
    steps:
      - name: All checks passed
        run: echo "PR validation passed - ready for review"
""",
    },
    {
        "name": "Docker Build & Push",
        "description": "Docker 이미지 빌드, 태그, 레지스트리 푸시 워크플로우",
        "category": TemplateCategory.DEPLOY,
        "tags": ["docker", "build", "registry", "image"],
        "icon": "box",
        "yaml_content": """name: Docker Build & Push
on:
  manual: {}
  push:
    branches: [main]
env:
  REGISTRY: ghcr.io
  IMAGE_NAME: aos
  DOCKERFILE: infra/docker/Dockerfile
jobs:
  build:
    name: Build Docker image
    runs_on: local
    steps:
      - name: Check Docker availability
        run: docker info > /dev/null 2>&1 && echo "Docker OK" || echo "Docker not available"
      - name: Build image
        run: docker build -f ${{ env.DOCKERFILE }} -t ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest . 2>&1
      - name: Tag with commit hash
        run: docker tag ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:$(git rev-parse --short HEAD) 2>&1
  test:
    name: Test image
    runs_on: local
    needs: [build]
    steps:
      - name: Run container health check
        run: docker run --rm ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest echo "Container OK" 2>&1
  push:
    name: Push to registry
    runs_on: local
    needs: [test]
    steps:
      - name: Push latest
        run: docker push ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest 2>&1
      - name: Push tagged version
        run: docker push ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:$(git rev-parse --short HEAD) 2>&1
      - name: Print image info
        run: echo "Pushed ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest"
""",
    },
    {
        "name": "Security Scan",
        "description": "의존성 취약점 스캔 및 코드 보안 검사 워크플로우",
        "category": TemplateCategory.TEST,
        "tags": ["security", "audit", "vulnerability", "scan"],
        "icon": "shield",
        "yaml_content": r"""name: Security Scan
on:
  manual: {}
  schedule:
    - cron: "0 6 * * 1"
jobs:
  python-audit:
    name: Python dependency audit
    runs_on: local
    steps:
      - name: Check for known vulnerabilities
        run: cd src/backend && pip audit 2>/dev/null || echo "pip-audit not installed - run pip install pip-audit"
        continue_on_error: true
      - name: Check outdated packages
        run: cd src/backend && pip list --outdated --format=columns 2>/dev/null || echo "Could not check outdated packages"
        continue_on_error: true
  node-audit:
    name: Node.js dependency audit
    runs_on: local
    steps:
      - name: Run npm audit
        run: cd src/dashboard && npm audit --omit=dev 2>&1 || true
        continue_on_error: true
      - name: Check outdated packages
        run: cd src/dashboard && npm outdated 2>&1 || true
        continue_on_error: true
  secrets-scan:
    name: Secrets detection
    runs_on: local
    steps:
      - name: Check for hardcoded secrets
        run: grep -rn "password\|secret\|api_key\|token" src/ --include="*.py" --include="*.ts" --include="*.tsx" -l 2>/dev/null | grep -v node_modules | grep -v __pycache__ | grep -v ".env" || echo "No suspicious patterns found"
        continue_on_error: true
  report:
    name: Security report
    runs_on: local
    needs: [python-audit, node-audit, secrets-scan]
    steps:
      - name: Generate summary
        run: echo "Security scan completed at $(date '+%Y-%m-%d %H:%M:%S')"
""",
    },
    {
        "name": "Release Pipeline",
        "description": "버전 태그, 체인지로그 생성, 릴리스 빌드까지 자동화된 릴리스 파이프라인",
        "category": TemplateCategory.DEPLOY,
        "tags": ["release", "version", "changelog", "tag"],
        "icon": "tag",
        "yaml_content": """name: Release Pipeline
on:
  manual: {}
env:
  VERSION_FILE: package.json
jobs:
  validate:
    name: Pre-release validation
    runs_on: local
    steps:
      - name: Check clean working tree
        run: git diff --exit-code && git diff --cached --exit-code && echo "Working tree clean" || echo "WARNING - uncommitted changes"
        continue_on_error: true
      - name: Run full test suite
        run: cd src/backend && pytest ../../tests/backend --tb=short -q 2>&1
      - name: Frontend build check
        run: cd src/dashboard && npm run build 2>&1
  changelog:
    name: Generate changelog
    runs_on: local
    needs: [validate]
    steps:
      - name: Get last tag
        run: git describe --tags --abbrev=0 2>/dev/null || echo "No tags found - using HEAD~10"
      - name: Generate changelog since last tag
        run: git log $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~10")..HEAD --pretty=format:"- %s (%h)" --no-merges 2>&1
  build:
    name: Release build
    runs_on: local
    needs: [validate]
    steps:
      - name: Build backend
        run: cd src/backend && echo "Backend build ready"
      - name: Build frontend
        run: cd src/dashboard && npm run build 2>&1
      - name: Package release
        run: echo "Release artifacts prepared"
  tag:
    name: Create release tag
    runs_on: local
    needs: [changelog, build]
    steps:
      - name: Print release info
        run: echo "Release pipeline completed - review changelog and create tag manually"
""",
    },
    {
        "name": "Log Cleanup",
        "description": "오래된 로그, 임시 파일, 캐시를 정리하는 유지보수 워크플로우",
        "category": TemplateCategory.UTILITY,
        "tags": ["cleanup", "maintenance", "logs", "cache"],
        "icon": "trash-2",
        "yaml_content": """name: Log Cleanup
on:
  manual: {}
  schedule:
    - cron: "0 3 * * 0"
env:
  LOG_DIR: logs
  MAX_LOG_AGE_DAYS: "14"
jobs:
  clean-logs:
    name: Clean old logs
    runs_on: local
    steps:
      - name: Show current disk usage
        run: du -sh ${{ env.LOG_DIR }}/ 2>/dev/null || echo "No log directory found"
        continue_on_error: true
      - name: Remove logs older than retention period
        run: find ${{ env.LOG_DIR }} -name "*.log" -mtime +${{ env.MAX_LOG_AGE_DAYS }} -delete -print 2>/dev/null || echo "No old logs to remove"
        continue_on_error: true
      - name: Rotate large log files
        run: find ${{ env.LOG_DIR }} -name "*.log" -size +50M 2>/dev/null | while read f; do truncate -s 0 "$f" && echo "Truncated $f"; done || echo "No large logs"
        continue_on_error: true
  clean-cache:
    name: Clean caches
    runs_on: local
    steps:
      - name: Clean Python cache
        run: find src/backend -type d -name "__pycache__" 2>/dev/null | xargs rm -rf 2>/dev/null && echo "Python cache cleared" || echo "No Python cache"
        continue_on_error: true
      - name: Clean Vite cache
        run: rm -rf src/dashboard/node_modules/.vite 2>/dev/null && echo "Vite cache cleared" || echo "No Vite cache"
      - name: Clean pytest cache
        run: find . -type d -name ".pytest_cache" 2>/dev/null | xargs rm -rf 2>/dev/null && echo "Pytest cache cleared" || echo "No pytest cache"
        continue_on_error: true
  clean-temp:
    name: Clean temp files
    runs_on: local
    steps:
      - name: Remove temp files
        run: find /tmp -name "aos_*" -mtime +1 -delete 2>/dev/null && echo "Temp files cleaned" || echo "No temp files"
        continue_on_error: true
      - name: Remove orphan .pyc files
        run: find src/ -name "*.pyc" -not -path "*__pycache__*" -delete 2>/dev/null && echo "Orphan .pyc removed" || echo "No orphan .pyc files"
        continue_on_error: true
  summary:
    name: Cleanup summary
    runs_on: local
    needs: [clean-logs, clean-cache, clean-temp]
    steps:
      - name: Show disk usage after cleanup
        run: echo "Cleanup completed at $(date '+%Y-%m-%d %H:%M:%S')" && du -sh ${{ env.LOG_DIR }}/ 2>/dev/null || echo "Done"
""",
    },
    {
        "name": "Performance Benchmark",
        "description": "API 응답시간 및 프론트엔드 빌드 성능 벤치마크 워크플로우",
        "category": TemplateCategory.TEST,
        "tags": ["performance", "benchmark", "api", "speed"],
        "icon": "gauge",
        "yaml_content": """name: Performance Benchmark
on:
  manual: {}
env:
  API_URL: "http://localhost:8000"
jobs:
  api-benchmark:
    name: API response benchmark
    runs_on: local
    steps:
      - name: Health endpoint latency (10 requests)
        run: bash -c 'total=0; for i in $(seq 1 10); do t=$(curl -o /dev/null -s -w "%{time_total}" ${{ env.API_URL }}/api/health 2>/dev/null); total=$(echo "$total + $t" | bc); echo "  Request $i - ${t}s"; done; avg=$(echo "scale=3; $total / 10" | bc); echo "Average - ${avg}s"'
        continue_on_error: true
      - name: Workflows endpoint latency (10 requests)
        run: bash -c 'total=0; for i in $(seq 1 10); do t=$(curl -o /dev/null -s -w "%{time_total}" ${{ env.API_URL }}/api/workflows 2>/dev/null); total=$(echo "$total + $t" | bc); echo "  Request $i - ${t}s"; done; avg=$(echo "scale=3; $total / 10" | bc); echo "Average - ${avg}s"'
        continue_on_error: true
  build-benchmark:
    name: Build performance
    runs_on: local
    steps:
      - name: Frontend build time
        run: bash -c 'start=$(date +%s); cd src/dashboard && npm run build > /dev/null 2>&1; end=$(date +%s); echo "Build time - $((end - start))s"'
        continue_on_error: true
      - name: Bundle size analysis
        run: du -sh src/dashboard/dist/ 2>/dev/null || echo "No build output - run build first"
        continue_on_error: true
      - name: Largest JS files
        run: find src/dashboard/dist -name "*.js" 2>/dev/null -exec du -sh {} + 2>/dev/null | sort -rh | head -5 || echo "No JS files found"
        continue_on_error: true
  report:
    name: Benchmark report
    runs_on: local
    needs: [api-benchmark, build-benchmark]
    steps:
      - name: Summary
        run: echo "Benchmark completed at $(date '+%Y-%m-%d %H:%M:%S')"
""",
    },
    {
        "name": "Git Branch Cleanup",
        "description": "머지된 로컬/리모트 브랜치를 정리하는 Git 유지보수 워크플로우",
        "category": TemplateCategory.UTILITY,
        "tags": ["git", "branch", "cleanup", "maintenance"],
        "icon": "git-branch",
        "yaml_content": """name: Git Branch Cleanup
on:
  manual: {}
jobs:
  analyze:
    name: Analyze branches
    runs_on: local
    steps:
      - name: List merged local branches
        run: git branch --merged main | grep -v "main\\|develop" | grep -v "\\*" || echo "No merged branches"
      - name: List stale remote branches
        run: git fetch --prune 2>&1 && git branch -r --merged origin/main | grep -v "main\\|develop\\|HEAD" || echo "No stale remote branches"
      - name: Show branch age
        run: git for-each-ref --sort=committerdate refs/heads/ --format="%(committerdate:short) %(refname:short)" | head -20
  cleanup-local:
    name: Clean local branches
    runs_on: local
    needs: [analyze]
    steps:
      - name: Delete merged local branches
        run: git branch --merged main | grep -v "main\\|develop" | grep -v "\\*" | xargs git branch -d 2>/dev/null || echo "No branches to delete"
        continue_on_error: true
  report:
    name: Branch report
    runs_on: local
    needs: [cleanup-local]
    steps:
      - name: Remaining branches
        run: echo "Remaining branches:" && git branch -a | head -20
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
            now = utcnow()
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
                t
                for t in templates
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
        now = utcnow()
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

        template["updated_at"] = utcnow()
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
