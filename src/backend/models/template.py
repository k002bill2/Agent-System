"""Workflow template models."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class TemplateCategory(str, Enum):
    CI = "ci"
    DEPLOY = "deploy"
    TEST = "test"
    UTILITY = "utility"


class TemplateCreate(BaseModel):
    name: str
    description: str = ""
    category: TemplateCategory = TemplateCategory.UTILITY
    tags: list[str] = Field(default_factory=list)
    yaml_content: str
    icon: str = "zap"


class TemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: TemplateCategory | None = None
    tags: list[str] | None = None
    yaml_content: str | None = None
    icon: str | None = None


class TemplateResponse(BaseModel):
    id: str
    name: str
    description: str
    category: TemplateCategory
    tags: list[str]
    yaml_content: str
    icon: str
    popularity: int
    created_at: datetime
    updated_at: datetime


class TemplateListResponse(BaseModel):
    templates: list[TemplateResponse]
    total: int
