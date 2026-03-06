#!/usr/bin/env python3
"""
Port Conflict Checker

등록된 모든 프로젝트의 docker-compose 파일을 스캔하여
동일 포트를 사용하는 프로젝트 간 충돌을 감지합니다.

Usage:
  python3 check_port_conflicts.py [project_paths...]

  # 특정 프로젝트 경로 직접 지정
  python3 check_port_conflicts.py /path/to/project1 /path/to/project2

  # AOS API에서 등록된 프로젝트 자동 조회
  python3 check_port_conflicts.py --from-api http://localhost:8000
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path
from typing import Optional

# docker-compose ports 패턴: "5173:80", "${VAR:-5173}:80"
PORT_RE = re.compile(
    r"(?:\$\{[^:}]+-)?(\d+)(?:\})?:(\d+)"
)


def parse_compose_ports(project_path: str) -> list[tuple[str, int]]:
    """Parse docker-compose files and return (service_name, host_port) pairs."""
    path = Path(project_path)
    compose_candidates = [
        path / "docker-compose.yml",
        path / "docker-compose.yaml",
        path / "compose.yml",
        path / "compose.yaml",
        path / "docker-compose.dev.yml",
        path / "infra" / "docker" / "docker-compose.yml",
    ]

    compose_file = None
    for f in compose_candidates:
        if f.is_file():
            compose_file = f
            break

    if not compose_file:
        return []

    try:
        content = compose_file.read_text(encoding="utf-8")
    except OSError:
        return []

    results: list[tuple[str, int]] = []
    current_service: str | None = None
    in_services = False
    in_ports = False

    for line in content.splitlines():
        stripped = line.strip()

        if stripped == "services:" and not line.startswith(" "):
            in_services = True
            continue

        if in_services and not line.startswith(" ") and stripped and not stripped.startswith("#"):
            in_services = False
            continue

        if not in_services:
            continue

        if line.startswith("  ") and not line.startswith("    ") and stripped.endswith(":") and not stripped.startswith("#"):
            current_service = stripped[:-1].strip()
            in_ports = False
            continue

        if not current_service:
            continue

        if stripped == "ports:":
            in_ports = True
            continue

        if in_ports and stripped.startswith("- "):
            port_str = stripped[2:].strip().strip('"').strip("'")
            match = PORT_RE.search(port_str)
            if match:
                host_port = int(match.group(1))
                results.append((current_service, host_port))
            continue

        if in_ports and not stripped.startswith("- ") and stripped and not stripped.startswith("#"):
            in_ports = False

    return results


def fetch_conflicts_from_api(base_url: str) -> dict | None:
    """Fetch pre-computed conflicts from AOS health API (no auth required)."""
    url = f"{base_url}/health/services/conflicts"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  Warning: API 조회 실패 ({e}), 로컬 스캔으로 fallback합니다.", file=sys.stderr)
        return None


def fetch_project_paths_from_db(base_url: str) -> list[tuple[str, str]]:
    """Fetch project paths by parsing conflicts API response project names.

    Fallback: scan well-known Work directory.
    """
    home = Path.home()
    work_dir = home / "Work"
    if not work_dir.is_dir():
        return []

    return [
        (d.name, str(d))
        for d in work_dir.iterdir()
        if d.is_dir() and not d.name.startswith(".")
    ]


def check_conflicts(project_ports: dict[str, list[tuple[str, int]]]) -> dict[int, list[tuple[str, str]]]:
    """
    Build port→[(project_name, service_name)] mapping and return only conflicting ports.
    """
    port_map: dict[int, list[tuple[str, str]]] = {}

    for project_name, services in project_ports.items():
        for service_name, port in services:
            port_map.setdefault(port, []).append((project_name, service_name))

    return {port: users for port, users in port_map.items() if len(users) > 1}


def main():
    projects: list[tuple[str, str]] = []  # (name, path)

    if "--from-api" in sys.argv:
        idx = sys.argv.index("--from-api")
        base_url = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else "http://localhost:8000"

        # Try the pre-computed conflicts API first (no auth needed)
        api_result = fetch_conflicts_from_api(base_url)
        if api_result and api_result.get("conflicts"):
            print(f"Scanned {api_result['total_projects_scanned']} projects via API\n")
            print(f"PORT CONFLICTS DETECTED ({len(api_result['conflicts'])} ports):")
            print("=" * 60)
            for conflict in api_result["conflicts"]:
                print(f"\n  Port {conflict['port']}:")
                for user in conflict["projects"]:
                    print(f"    - {user['project']} / {user['service']}")
            total = len(api_result["conflicts"])
            print(f"\nTotal: {total} conflicting port(s)")
            sys.exit(1)
        elif api_result and not api_result.get("conflicts"):
            print(f"Scanned {api_result['total_projects_scanned']} projects via API")
            print("No port conflicts detected.")
            sys.exit(0)

        # Fallback: scan ~/Work directory
        print("Falling back to local directory scan...")
        projects = fetch_project_paths_from_db(base_url)
    elif len(sys.argv) > 1:
        for p in sys.argv[1:]:
            if p.startswith("-"):
                continue
            name = Path(p).name
            projects.append((name, p))
    else:
        # Default: scan ~/Work
        work_dir = Path.home() / "Work"
        if work_dir.is_dir():
            projects = [
                (d.name, str(d))
                for d in work_dir.iterdir()
                if d.is_dir() and not d.name.startswith(".")
            ]
        if not projects:
            print(__doc__)
            sys.exit(0)

    print(f"Scanning {len(projects)} projects for port conflicts...\n")

    # Collect ports per project
    project_ports: dict[str, list[tuple[str, int]]] = {}
    for name, path in projects:
        ports = parse_compose_ports(path)
        if ports:
            project_ports[name] = ports
            port_list = ", ".join(f"{svc}:{port}" for svc, port in ports)
            print(f"  {name}: {port_list}")
        else:
            print(f"  {name}: (no docker-compose found)")

    print()

    # Check conflicts
    conflicts = check_conflicts(project_ports)

    if not conflicts:
        print("No port conflicts detected.")
        sys.exit(0)

    print(f"PORT CONFLICTS DETECTED ({len(conflicts)} ports):")
    print("=" * 60)
    for port, users in sorted(conflicts.items()):
        print(f"\n  Port {port}:")
        for project_name, service_name in users:
            print(f"    - {project_name} / {service_name}")

    print(f"\nTotal: {len(conflicts)} conflicting port(s)")
    print("\nFix: Update docker-compose port mappings or use env var overrides")
    print("  e.g., DASHBOARD_PORT=5174 docker compose up")
    sys.exit(1)


if __name__ == "__main__":
    main()
