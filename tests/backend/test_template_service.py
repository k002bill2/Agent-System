"""Tests for template service."""

import pytest

from models.template import TemplateCategory, TemplateCreate, TemplateUpdate
from services.template_service import TemplateService


class TestTemplateService:
    def setup_method(self):
        self.svc = TemplateService()

    def test_builtin_templates_seeded(self):
        templates = self.svc.list_templates()
        assert len(templates) >= 4  # 4 built-in templates

    def test_list_by_category(self):
        ci_templates = self.svc.list_templates(category=TemplateCategory.CI)
        assert len(ci_templates) >= 2  # Python CI, Node.js CI

    def test_search_templates(self):
        results = self.svc.list_templates(search="python")
        assert len(results) >= 1
        assert any("Python" in t["name"] for t in results)

    def test_get_template(self):
        templates = self.svc.list_templates()
        template = self.svc.get_template(templates[0]["id"])
        assert template is not None
        assert template["yaml_content"]

    def test_get_nonexistent(self):
        assert self.svc.get_template("nope") is None

    def test_create_template(self):
        template = self.svc.create_template(
            TemplateCreate(
                name="Custom",
                description="Custom template",
                category=TemplateCategory.UTILITY,
                yaml_content="name: custom\njobs:\n  test:\n    steps:\n      - name: t\n        run: echo t",
            )
        )
        assert template["name"] == "Custom"
        assert template["category"] == TemplateCategory.UTILITY

    def test_create_template_invalid_yaml(self):
        with pytest.raises(ValueError):
            self.svc.create_template(
                TemplateCreate(name="Bad", yaml_content="invalid yaml: [")
            )

    def test_update_template(self):
        templates = self.svc.list_templates()
        tpl_id = templates[0]["id"]
        updated = self.svc.update_template(tpl_id, TemplateUpdate(description="updated"))
        assert updated["description"] == "updated"

    def test_delete_template(self):
        template = self.svc.create_template(
            TemplateCreate(
                name="ToDelete",
                yaml_content="name: del\njobs:\n  d:\n    steps:\n      - name: d\n        run: echo d",
            )
        )
        assert self.svc.delete_template(template["id"]) is True
        assert self.svc.get_template(template["id"]) is None

    def test_create_workflow_from_template(self):
        templates = self.svc.list_templates()
        tpl_id = templates[0]["id"]
        workflow = self.svc.create_workflow_from_template(tpl_id, name="From Template")
        assert workflow is not None
        assert workflow["name"] == "From Template"

    def test_create_workflow_from_nonexistent_template(self):
        assert self.svc.create_workflow_from_template("nope") is None

    def test_popularity_increments(self):
        templates = self.svc.list_templates()
        tpl_id = templates[0]["id"]
        before = self.svc.get_template(tpl_id)["popularity"]
        self.svc.create_workflow_from_template(tpl_id)
        after = self.svc.get_template(tpl_id)["popularity"]
        assert after == before + 1
