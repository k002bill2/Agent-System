"""SQLAlchemy models for database persistence.

All models are re-exported here for backward compatibility.
Usage: from db.models import SessionModel, TaskModel, ...
"""

# Session & Core
from db.models.session import (
    ApprovalModel,
    MessageModel,
    SessionModel,
    TaskModel,
)

# Feedback & Evaluation
from db.models.feedback import (
    DatasetEntryModel,
    FeedbackModel,
    TaskEvaluationModel,
)

# Auth
from db.models.auth import (
    SAMLConfigModel,
    TokenBlacklistModel,
    UserModel,
)

# Organization
from db.models.organization import (
    OrganizationInvitationModel,
    OrganizationMemberModel,
    OrganizationModel,
)

# Notification
from db.models.notification import (
    ChannelConfigModel,
    NotificationHistoryModel,
    NotificationRuleModel,
)

# Activity
from db.models.activity import (
    MenuVisibilityModel,
    SessionActivityModel,
    TaskAnalysisModel,
)

# Git
from db.models.git import (
    BranchProtectionRuleModel,
    MergeRequestModel,
)

# Project
from db.models.project import (
    ProjectAccessModel,
    ProjectInvitationModel,
    ProjectModel,
)

# Audit
from db.models.audit import AuditLogModel

# Cost
from db.models.cost import (
    CostAllocationModel,
    CostCenterModel,
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

# LLM
from db.models.llm import (
    LLMModelConfigModel,
    UserLLMCredentialModel,
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
    # LLM
    "LLMModelConfigModel",
    "UserLLMCredentialModel",
]
