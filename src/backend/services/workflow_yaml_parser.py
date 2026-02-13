"""Safe YAML parser for workflow definitions."""

from typing import Any

import yaml


def parse_workflow_yaml(yaml_content: str) -> dict[str, Any]:
    """Parse a workflow YAML string into a definition dict.

    Uses safe_load to prevent code injection.
    Validates required structure.
    """
    try:
        data = yaml.safe_load(yaml_content)
    except yaml.YAMLError as e:
        raise ValueError(f"Invalid YAML syntax: {e}")

    if not isinstance(data, dict):
        raise ValueError("Workflow definition must be a YAML mapping")

    # Validate required fields
    if "name" not in data:
        raise ValueError("Workflow must have a 'name' field")

    if "jobs" not in data or not isinstance(data.get("jobs"), dict):
        raise ValueError("Workflow must have a 'jobs' mapping")

    # Validate jobs
    for job_name, job_def in data["jobs"].items():
        if not isinstance(job_def, dict):
            raise ValueError(f"Job '{job_name}' must be a mapping")
        if "steps" not in job_def or not isinstance(job_def.get("steps"), list):
            raise ValueError(f"Job '{job_name}' must have a 'steps' list")

        # Normalize matrix exclude/include
        if "matrix" in job_def and isinstance(job_def["matrix"], dict):
            # Extract exclude/include from matrix if nested
            matrix = job_def["matrix"]
            if "exclude" in matrix:
                job_def["matrix_exclude"] = matrix.pop("exclude")
            if "include" in matrix:
                job_def["matrix_include"] = matrix.pop("include")

        for i, step in enumerate(job_def["steps"]):
            if not isinstance(step, dict):
                raise ValueError(f"Step {i} in job '{job_name}' must be a mapping")
            if "name" not in step:
                raise ValueError(f"Step {i} in job '{job_name}' must have a 'name'")
            if "run" not in step and "uses" not in step:
                raise ValueError(f"Step '{step.get('name', i)}' must have 'run' or 'uses'")

            # Normalize retry config
            if "retry" in step and isinstance(step["retry"], dict):
                retry = step["retry"]
                step["retry"] = {
                    "max_attempts": retry.get("max_attempts", 1),
                    "backoff": retry.get("backoff", "linear"),
                    "delay_seconds": retry.get("delay_seconds", retry.get("delay", 1.0)),
                }

    # Normalize trigger config
    # Note: YAML parses 'on' as boolean True, so check both keys
    trigger = data.get("on") or data.get(True, {})
    if True in data:
        del data[True]
    if isinstance(trigger, str):
        data["on"] = {trigger: {}}
    elif isinstance(trigger, list):
        data["on"] = {t: {} for t in trigger}
    elif isinstance(trigger, dict):
        data["on"] = trigger
    else:
        data["on"] = {}

    # Ensure env is a dict
    if "env" not in data:
        data["env"] = {}

    return data


def workflow_to_yaml(definition: dict[str, Any]) -> str:
    """Convert a workflow definition dict back to YAML string."""
    return yaml.dump(definition, default_flow_style=False, allow_unicode=True, sort_keys=False)
