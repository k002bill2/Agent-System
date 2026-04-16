"""SQLAlchemy models for database persistence.

All models are re-exported here for backward compatibility.
Usage: from db.models import SessionModel, TaskModel, ...
"""

# Activity
from db.models.activity import (
    MenuVisibilityModel,
    SessionActivityModel,
    TaskAnalysisModel,
)

# Audit
from db.models.audit import AuditLogModel

# Auth
from db.models.auth import (
    SAMLConfigModel,
    TokenBlacklistModel,
    UserModel,
)

# Claude Session
from db.models.claude_session import ClaudeSessionSnapshotModel

# Config Version
from db.models.config_version import ConfigVersionModel

# Cost
from db.models.cost import (
    CostAllocationModel,
    CostCenterModel,
)

# Feedback & Evaluation
from db.models.feedback import (
    DatasetEntryModel,
    FeedbackModel,
    TaskEvaluationModel,
)

# Git
from db.models.git import (
    BranchProtectionRuleModel,
    MergeRequestModel,
)

# LLM
from db.models.llm import (
    LLMModelConfigModel,
    UserLLMCredentialModel,
)

# Model Update
from db.models.model_update import ModelUpdateLogModel

# Notification
from db.models.notification import (
    ChannelConfigModel,
    NotificationHistoryModel,
    NotificationRuleModel,
)

# Organization
from db.models.organization import (
    OrganizationInvitationModel,
    OrganizationMemberModel,
    OrganizationModel,
)

# Playground
from db.models.playground import PlaygroundSessionModel

# Project
from db.models.project import (
    ProjectAccessModel,
    ProjectInvitationModel,
    ProjectModel,
)
from db.models.session import (
    ApprovalModel,
    MessageModel,
    SessionModel,
    TaskModel,
)

# Workflow
from db.models.workflow import (
    WorkflowArtifactModel,
    WorkflowDefinitionModel,
    WorkflowJobModel,
    WorkflowRunModel,
    WorkflowSecretModel,
    WorkflowStepModel,
    WorkflowTemplateModel,
    WorkflowWebhookModel,
)

__all__ = [
    # Session
    "SessionModel",
    "TaskModel",
    "MessageModel",
    "ApprovalModel",
    # Feedback
    "FeedbackModel",
    "DatasetEntryModel",
    "TaskEvaluationModel",
    # Auth
    "UserModel",
    "TokenBlacklistModel",
    "SAMLConfigModel",
    # Organization
    "OrganizationModel",
    "OrganizationMemberModel",
    "OrganizationInvitationModel",
    # Notification
    "NotificationRuleModel",
    "NotificationHistoryModel",
    "ChannelConfigModel",
    # Activity
    "TaskAnalysisModel",
    "SessionActivityModel",
    "MenuVisibilityModel",
    # Git
    "MergeRequestModel",
    "BranchProtectionRuleModel",
    # Project
    "ProjectModel",
    "ProjectInvitationModel",
    "ProjectAccessModel",
    # Audit
    "AuditLogModel",
    # Cost
    "CostCenterModel",
    "CostAllocationModel",
    # Workflow
    "WorkflowDefinitionModel",
    "WorkflowRunModel",
    "WorkflowJobModel",
    "WorkflowStepModel",
    "WorkflowSecretModel",
    "WorkflowWebhookModel",
    "WorkflowArtifactModel",
    "WorkflowTemplateModel",
    # Claude Session
    "ClaudeSessionSnapshotModel",
    # LLM
    "LLMModelConfigModel",
    "UserLLMCredentialModel",
    # Config Version
    "ConfigVersionModel",
    # Playground
    "PlaygroundSessionModel",
    # Model Update
    "ModelUpdateLogModel",
]
