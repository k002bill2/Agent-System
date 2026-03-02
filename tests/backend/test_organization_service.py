"""Tests for OrganizationService (in-memory mode, USE_DATABASE=false)."""

import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta

from utils.time import utcnow

import services.organization_service as org_module
from services.organization_service import OrganizationService
from models.organization import (
    PLAN_LIMITS,
    InviteMemberRequest,
    MemberRole,
    Organization,
    OrganizationCreate,
    OrganizationInvitation,
    OrganizationMember,
    OrganizationPlan,
    OrganizationStatus,
    OrganizationUpdate,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _reset_global_state():
    """Wipe all in-memory stores and indexes used by the service."""
    org_module._organizations.clear()
    org_module._members.clear()
    org_module._invitations.clear()
    org_module._member_usage.clear()
    org_module._slug_to_id.clear()
    org_module._user_orgs.clear()


def _make_org_create(
    name: str = "Acme Corp",
    slug: str = "acme-corp",
    plan: OrganizationPlan = OrganizationPlan.FREE,
) -> OrganizationCreate:
    return OrganizationCreate(name=name, slug=slug, plan=plan)


def _create_org(
    name: str = "Acme Corp",
    slug: str = "acme-corp",
    owner_id: str = "user-owner",
    owner_email: str = "owner@example.com",
    plan: OrganizationPlan = OrganizationPlan.FREE,
) -> Organization:
    """Create an org through the service (with file I/O patched out)."""
    data = _make_org_create(name=name, slug=slug, plan=plan)
    with patch("services.organization_service._save_organizations"), \
         patch("services.organization_service._save_members"):
        return OrganizationService.create_organization(
            data=data,
            owner_user_id=owner_id,
            owner_email=owner_email,
            owner_name="Owner Name",
        )


# ---------------------------------------------------------------------------
# Test Class
# ---------------------------------------------------------------------------

class TestOrganizationService:
    """Unit tests for OrganizationService (in-memory mode)."""

    def setup_method(self):
        """Reset global state before every test."""
        _reset_global_state()

    # -----------------------------------------------------------------------
    # create_organization
    # -----------------------------------------------------------------------

    def test_create_organization_success(self):
        """Creating an org stores it and adds an OWNER member."""
        with patch("services.organization_service._save_organizations"), \
             patch("services.organization_service._save_members"):
            org = OrganizationService.create_organization(
                data=_make_org_create(),
                owner_user_id="user-1",
                owner_email="owner@example.com",
                owner_name="Alice",
            )

        assert org.name == "Acme Corp"
        assert org.slug == "acme-corp"
        assert org.plan == OrganizationPlan.FREE
        assert org.status == OrganizationStatus.ACTIVE
        assert org.current_members == 1

        # Verify stored in module-level dict
        assert org.id in org_module._organizations
        # Slug index populated
        assert org_module._slug_to_id.get("acme-corp") == org.id

        # Owner member created with OWNER role
        members = OrganizationService.get_members(org.id)
        assert len(members) == 1
        assert members[0].role == MemberRole.OWNER
        assert members[0].user_id == "user-1"
        assert members[0].email == "owner@example.com"

    def test_create_organization_applies_plan_limits(self):
        """Plan limits are applied to max_members etc. at creation time."""
        with patch("services.organization_service._save_organizations"), \
             patch("services.organization_service._save_members"):
            org = OrganizationService.create_organization(
                data=_make_org_create(slug="starter-org", plan=OrganizationPlan.STARTER),
                owner_user_id="u1",
                owner_email="u@example.com",
            )

        limits = PLAN_LIMITS[OrganizationPlan.STARTER]
        assert org.max_members == limits["max_members"]
        assert org.max_projects == limits["max_projects"]
        assert org.max_sessions_per_day == limits["max_sessions_per_day"]
        assert org.max_tokens_per_month == limits["max_tokens_per_month"]

    def test_create_organization_duplicate_slug_raises(self):
        """Creating two orgs with the same slug raises ValueError."""
        _create_org(slug="dup-slug")

        with pytest.raises(ValueError, match="already taken"):
            with patch("services.organization_service._save_organizations"), \
                 patch("services.organization_service._save_members"):
                OrganizationService.create_organization(
                    data=_make_org_create(slug="dup-slug"),
                    owner_user_id="u2",
                    owner_email="u2@example.com",
                )

    def test_create_organization_invalid_slug_raises(self):
        """Slug must be lowercase alphanumeric+hyphens, min 3 chars."""
        bad_slugs = ["AB", "a", "UPPER", "has space", "-leading", "trailing-"]
        for bad in bad_slugs:
            with pytest.raises(ValueError, match="Slug"):
                OrganizationService.create_organization(
                    data=_make_org_create(slug=bad),
                    owner_user_id="u",
                    owner_email="u@example.com",
                )

    # -----------------------------------------------------------------------
    # get_organization / get_organization_by_slug
    # -----------------------------------------------------------------------

    def test_get_organization_by_id(self):
        """get_organization returns org for valid ID, None for unknown."""
        org = _create_org()
        found = OrganizationService.get_organization(org.id)
        assert found is not None
        assert found.id == org.id

        assert OrganizationService.get_organization("nonexistent-id") is None

    def test_get_organization_by_slug(self):
        """get_organization_by_slug resolves slug -> org."""
        org = _create_org(slug="my-slug")
        found = OrganizationService.get_organization_by_slug("my-slug")
        assert found is not None
        assert found.id == org.id

        assert OrganizationService.get_organization_by_slug("unknown-slug") is None

    # -----------------------------------------------------------------------
    # list_organizations
    # -----------------------------------------------------------------------

    def test_list_organizations_excludes_deleted_by_default(self):
        """list_organizations hides soft-deleted orgs by default."""
        org_a = _create_org(name="Alpha", slug="alpha")
        org_b = _create_org(name="Beta", slug="beta")

        # Soft-delete org_b
        with patch("services.organization_service._save_organizations"):
            OrganizationService.delete_organization(org_b.id)

        orgs = OrganizationService.list_organizations()
        ids = [o.id for o in orgs]
        assert org_a.id in ids
        assert org_b.id not in ids

    def test_list_organizations_filter_by_plan(self):
        """list_organizations can filter by plan."""
        _create_org(slug="free-org", plan=OrganizationPlan.FREE)
        _create_org(slug="starter-org", plan=OrganizationPlan.STARTER)

        free_orgs = OrganizationService.list_organizations(plan=OrganizationPlan.FREE)
        starter_orgs = OrganizationService.list_organizations(plan=OrganizationPlan.STARTER)

        assert all(o.plan == OrganizationPlan.FREE for o in free_orgs)
        assert all(o.plan == OrganizationPlan.STARTER for o in starter_orgs)

    # -----------------------------------------------------------------------
    # update_organization
    # -----------------------------------------------------------------------

    def test_update_organization_partial_update(self):
        """update_organization applies only provided fields."""
        org = _create_org()
        original_name = org.name

        with patch("services.organization_service._save_organizations"):
            updated = OrganizationService.update_organization(
                org.id,
                OrganizationUpdate(description="New desc"),
            )

        assert updated is not None
        assert updated.description == "New desc"
        assert updated.name == original_name  # unchanged

    def test_update_organization_settings_merge(self):
        """Updating settings merges keys into existing dict."""
        org = _create_org()
        org.settings = {"key1": "val1"}

        with patch("services.organization_service._save_organizations"):
            updated = OrganizationService.update_organization(
                org.id,
                OrganizationUpdate(settings={"key2": "val2"}),
            )

        assert updated.settings["key1"] == "val1"
        assert updated.settings["key2"] == "val2"

    def test_update_organization_not_found_returns_none(self):
        """update_organization returns None for unknown org_id."""
        result = OrganizationService.update_organization(
            "bad-id", OrganizationUpdate(name="X")
        )
        assert result is None

    # -----------------------------------------------------------------------
    # delete_organization (soft delete)
    # -----------------------------------------------------------------------

    def test_delete_organization_soft_deletes(self):
        """delete_organization marks status=DELETED and removes slug index."""
        org = _create_org(slug="to-delete")

        with patch("services.organization_service._save_organizations"):
            result = OrganizationService.delete_organization(org.id)

        assert result is True
        stored = org_module._organizations[org.id]
        assert stored.status == OrganizationStatus.DELETED
        # Slug freed from index
        assert "to-delete" not in org_module._slug_to_id

    def test_delete_organization_slug_can_be_reused_after_delete(self):
        """After soft-delete, slug is freed and can be used by a new org."""
        _create_org(slug="reusable-slug")
        with patch("services.organization_service._save_organizations"):
            OrganizationService.delete_organization(
                OrganizationService.get_organization_by_slug("reusable-slug").id
            )

        # Create new org with same slug - should not raise
        with patch("services.organization_service._save_organizations"), \
             patch("services.organization_service._save_members"):
            new_org = OrganizationService.create_organization(
                data=_make_org_create(slug="reusable-slug"),
                owner_user_id="u2",
                owner_email="u2@example.com",
            )
        assert new_org.slug == "reusable-slug"
        assert new_org.status == OrganizationStatus.ACTIVE

    def test_delete_organization_not_found_returns_false(self):
        assert OrganizationService.delete_organization("nonexistent") is False

    # -----------------------------------------------------------------------
    # upgrade_plan
    # -----------------------------------------------------------------------

    def test_upgrade_plan_updates_limits(self):
        """upgrade_plan changes limits according to the new plan."""
        org = _create_org(plan=OrganizationPlan.FREE)

        with patch("services.organization_service._save_organizations"):
            upgraded = OrganizationService.upgrade_plan(org.id, OrganizationPlan.PROFESSIONAL)

        limits = PLAN_LIMITS[OrganizationPlan.PROFESSIONAL]
        assert upgraded.plan == OrganizationPlan.PROFESSIONAL
        assert upgraded.max_members == limits["max_members"]

    # -----------------------------------------------------------------------
    # invite_member / accept_invitation
    # -----------------------------------------------------------------------

    def test_invite_member_creates_pending_invitation(self):
        """invite_member returns a valid OrganizationInvitation."""
        org = _create_org()

        mock_quota = MagicMock()
        mock_quota.allowed = True

        with patch("services.quota_service.QuotaService.check_member_quota",
                   return_value=mock_quota), \
             patch("services.organization_service._save_invitations"):
            inv = OrganizationService.invite_member(
                org_id=org.id,
                request=InviteMemberRequest(email="newmember@example.com", role=MemberRole.MEMBER),
                invited_by="user-owner",
            )

        assert isinstance(inv, OrganizationInvitation)
        assert inv.email == "newmember@example.com"
        assert inv.role == MemberRole.MEMBER
        assert inv.accepted is False
        assert inv.organization_id == org.id
        assert inv.id in org_module._invitations

    def test_invite_member_quota_exceeded_raises(self):
        """invite_member raises ValueError when member quota is exceeded."""
        org = _create_org()

        mock_quota = MagicMock()
        mock_quota.allowed = False
        mock_quota.message = "Member limit reached (5)"

        with patch("services.quota_service.QuotaService.check_member_quota",
                   return_value=mock_quota):
            with pytest.raises(ValueError, match="Member limit reached"):
                OrganizationService.invite_member(
                    org_id=org.id,
                    request=InviteMemberRequest(email="x@example.com"),
                    invited_by="user-owner",
                )

    def test_invite_member_duplicate_active_member_raises(self):
        """invite_member raises ValueError if email is already an active member."""
        org = _create_org(owner_email="owner@example.com")

        mock_quota = MagicMock()
        mock_quota.allowed = True

        with patch("services.quota_service.QuotaService.check_member_quota",
                   return_value=mock_quota):
            with pytest.raises(ValueError, match="already a member"):
                OrganizationService.invite_member(
                    org_id=org.id,
                    request=InviteMemberRequest(email="owner@example.com"),
                    invited_by="user-owner",
                )

    def test_invite_member_duplicate_pending_invitation_raises(self):
        """invite_member raises ValueError when a pending invitation exists."""
        org = _create_org()

        mock_quota = MagicMock()
        mock_quota.allowed = True

        # First invite
        with patch("services.quota_service.QuotaService.check_member_quota",
                   return_value=mock_quota), \
             patch("services.organization_service._save_invitations"):
            OrganizationService.invite_member(
                org_id=org.id,
                request=InviteMemberRequest(email="new@example.com"),
                invited_by="user-owner",
            )

        # Second invite for same email
        with patch("services.quota_service.QuotaService.check_member_quota",
                   return_value=mock_quota):
            with pytest.raises(ValueError, match="already pending"):
                OrganizationService.invite_member(
                    org_id=org.id,
                    request=InviteMemberRequest(email="new@example.com"),
                    invited_by="user-owner",
                )

    def test_accept_invitation_creates_member(self):
        """accept_invitation turns an invitation into an OrganizationMember."""
        org = _create_org()

        # Directly plant an invitation in global state
        inv = OrganizationInvitation(
            organization_id=org.id,
            email="invited@example.com",
            role=MemberRole.ADMIN,
            invited_by="user-owner",
            expires_at=utcnow() + timedelta(days=7),
        )
        org_module._invitations[inv.id] = inv

        with patch("services.organization_service._save_members"), \
             patch("services.organization_service._save_invitations"), \
             patch("services.organization_service._save_organizations"):
            member = OrganizationService.accept_invitation(
                token=inv.token,
                user_id="user-invited",
                user_name="Invited User",
            )

        assert isinstance(member, OrganizationMember)
        assert member.email == "invited@example.com"
        assert member.role == MemberRole.ADMIN
        assert member.user_id == "user-invited"
        assert org_module._invitations[inv.id].accepted is True

    def test_accept_invitation_expired_raises(self):
        """accept_invitation raises ValueError for an expired invitation."""
        org = _create_org()

        inv = OrganizationInvitation(
            organization_id=org.id,
            email="late@example.com",
            role=MemberRole.MEMBER,
            invited_by="user-owner",
            expires_at=utcnow() - timedelta(days=1),  # already expired
        )
        org_module._invitations[inv.id] = inv

        with pytest.raises(ValueError, match="expired"):
            OrganizationService.accept_invitation(
                token=inv.token,
                user_id="user-late",
            )

    def test_accept_invitation_invalid_token_raises(self):
        """accept_invitation raises ValueError for a non-existent token."""
        with pytest.raises(ValueError, match="Invalid or expired"):
            OrganizationService.accept_invitation(token="bad-token", user_id="u")

    # -----------------------------------------------------------------------
    # update_member_role
    # -----------------------------------------------------------------------

    def test_update_member_role_success(self):
        """update_member_role changes a non-last-owner member's role."""
        org = _create_org()

        # Add a second member (non-owner) directly
        second = OrganizationMember(
            organization_id=org.id,
            user_id="user-2",
            email="member2@example.com",
            role=MemberRole.MEMBER,
            joined_at=utcnow(),
        )
        org_module._members[second.id] = second

        with patch("services.organization_service._save_members"):
            updated = OrganizationService.update_member_role(second.id, MemberRole.ADMIN)

        assert updated is not None
        assert updated.role == MemberRole.ADMIN

    def test_update_member_role_last_owner_raises(self):
        """Demoting the last owner raises ValueError."""
        org = _create_org(owner_id="sole-owner")
        owner_member = OrganizationService.get_member_by_user(org.id, "sole-owner")
        assert owner_member is not None

        with pytest.raises(ValueError, match="last owner"):
            OrganizationService.update_member_role(owner_member.id, MemberRole.ADMIN)

    def test_update_member_role_not_found_returns_none(self):
        assert OrganizationService.update_member_role("bad-id", MemberRole.ADMIN) is None

    # -----------------------------------------------------------------------
    # remove_member
    # -----------------------------------------------------------------------

    def test_remove_member_soft_deactivates(self):
        """remove_member sets is_active=False and decrements member count."""
        org = _create_org(owner_id="owner-u")

        second = OrganizationMember(
            organization_id=org.id,
            user_id="user-2",
            email="second@example.com",
            role=MemberRole.MEMBER,
            joined_at=utcnow(),
        )
        org_module._members[second.id] = second
        org.current_members = 2
        org_module._user_orgs.setdefault("user-2", []).append(org.id)

        with patch("services.organization_service._save_members"), \
             patch("services.organization_service._save_organizations"):
            result = OrganizationService.remove_member(second.id)

        assert result is True
        assert org_module._members[second.id].is_active is False
        # Member count decremented
        assert org_module._organizations[org.id].current_members == 1

    def test_remove_member_last_owner_raises(self):
        """remove_member raises ValueError when trying to remove the last owner."""
        org = _create_org(owner_id="sole-owner")
        owner_member = OrganizationService.get_member_by_user(org.id, "sole-owner")
        assert owner_member is not None

        with pytest.raises(ValueError, match="last owner"):
            OrganizationService.remove_member(owner_member.id)

    def test_remove_member_not_found_returns_false(self):
        assert OrganizationService.remove_member("nonexistent-id") is False

    # -----------------------------------------------------------------------
    # get_pending_invitations / cancel_invitation
    # -----------------------------------------------------------------------

    def test_get_pending_invitations(self):
        """get_pending_invitations returns only non-accepted, non-expired."""
        org = _create_org()

        # Active pending
        active = OrganizationInvitation(
            organization_id=org.id,
            email="active@example.com",
            role=MemberRole.MEMBER,
            invited_by="owner",
            expires_at=utcnow() + timedelta(days=5),
        )
        # Expired
        expired = OrganizationInvitation(
            organization_id=org.id,
            email="expired@example.com",
            role=MemberRole.MEMBER,
            invited_by="owner",
            expires_at=utcnow() - timedelta(days=1),
        )
        # Accepted
        accepted = OrganizationInvitation(
            organization_id=org.id,
            email="accepted@example.com",
            role=MemberRole.MEMBER,
            invited_by="owner",
            expires_at=utcnow() + timedelta(days=5),
            accepted=True,
        )
        org_module._invitations[active.id] = active
        org_module._invitations[expired.id] = expired
        org_module._invitations[accepted.id] = accepted

        pending = OrganizationService.get_pending_invitations(org.id)
        ids = [p.id for p in pending]
        assert active.id in ids
        assert expired.id not in ids
        assert accepted.id not in ids

    def test_cancel_invitation_removes_it(self):
        """cancel_invitation deletes a pending invitation."""
        org = _create_org()

        inv = OrganizationInvitation(
            organization_id=org.id,
            email="cancel@example.com",
            role=MemberRole.MEMBER,
            invited_by="owner",
            expires_at=utcnow() + timedelta(days=5),
        )
        org_module._invitations[inv.id] = inv

        with patch("services.organization_service._save_invitations"):
            OrganizationService.cancel_invitation(org.id, inv.id)

        assert inv.id not in org_module._invitations

    def test_cancel_accepted_invitation_raises(self):
        """cancel_invitation raises ValueError for an already-accepted invitation."""
        org = _create_org()

        inv = OrganizationInvitation(
            organization_id=org.id,
            email="done@example.com",
            role=MemberRole.MEMBER,
            invited_by="owner",
            expires_at=utcnow() + timedelta(days=5),
            accepted=True,
        )
        org_module._invitations[inv.id] = inv

        with pytest.raises(ValueError, match="already accepted"):
            OrganizationService.cancel_invitation(org.id, inv.id)

    # -----------------------------------------------------------------------
    # get_user_organizations
    # -----------------------------------------------------------------------

    def test_get_user_organizations_excludes_deleted(self):
        """get_user_organizations omits orgs with DELETED status."""
        org_live = _create_org(slug="live-org", owner_id="uid")
        org_dead = _create_org(slug="dead-org", owner_id="uid")

        with patch("services.organization_service._save_organizations"):
            OrganizationService.delete_organization(org_dead.id)

        orgs = OrganizationService.get_user_organizations("uid")
        ids = [o.id for o in orgs]
        assert org_live.id in ids
        assert org_dead.id not in ids

    # -----------------------------------------------------------------------
    # get_tenant_context
    # -----------------------------------------------------------------------

    def test_get_tenant_context_returns_context_for_member(self):
        """get_tenant_context returns TenantContext for a valid member."""
        org = _create_org(owner_id="owner-x", slug="tenant-org")
        ctx = OrganizationService.get_tenant_context(org.id, "owner-x")

        assert ctx is not None
        assert ctx.organization_id == org.id
        assert ctx.organization_slug == "tenant-org"
        assert ctx.user_id == "owner-x"
        assert ctx.user_role == MemberRole.OWNER

    def test_get_tenant_context_non_member_returns_none(self):
        """get_tenant_context returns None for a user not in the org."""
        org = _create_org()
        ctx = OrganizationService.get_tenant_context(org.id, "some-stranger")
        assert ctx is None

    def test_get_tenant_context_deleted_org_returns_none(self):
        """get_tenant_context returns None for a DELETED org."""
        org = _create_org(owner_id="owner-y")
        with patch("services.organization_service._save_organizations"):
            OrganizationService.delete_organization(org.id)

        ctx = OrganizationService.get_tenant_context(org.id, "owner-y")
        assert ctx is None

    # -----------------------------------------------------------------------
    # get_organization_stats
    # -----------------------------------------------------------------------

    def test_get_organization_stats(self):
        """get_organization_stats reflects current member/project counts."""
        org = _create_org(owner_id="u-stats")
        stats = OrganizationService.get_organization_stats(org.id)

        assert stats.organization_id == org.id
        assert stats.total_members == 1
        assert stats.active_members == 1

    # -----------------------------------------------------------------------
    # track_token_usage / reset_monthly_usage
    # -----------------------------------------------------------------------

    def test_track_token_usage_increments_org_tokens(self):
        """track_token_usage adds tokens to org.tokens_used_this_month."""
        org = _create_org()

        mock_quota = MagicMock()
        mock_quota.allowed = True

        with patch("services.quota_service.QuotaService.check_token_quota",
                   return_value=mock_quota), \
             patch("services.organization_service._save_organizations"):
            success = OrganizationService.track_token_usage(org.id, 500)

        assert success is True
        assert org_module._organizations[org.id].tokens_used_this_month == 500

    def test_track_token_usage_quota_exceeded_returns_false(self):
        """track_token_usage returns False when token quota is exceeded."""
        org = _create_org()

        mock_quota = MagicMock()
        mock_quota.allowed = False

        with patch("services.quota_service.QuotaService.check_token_quota",
                   return_value=mock_quota):
            result = OrganizationService.track_token_usage(org.id, 99999)

        assert result is False
        assert org_module._organizations[org.id].tokens_used_this_month == 0

    def test_track_token_usage_unknown_org_returns_false(self):
        result = OrganizationService.track_token_usage("bad-org", 100)
        assert result is False

    def test_reset_monthly_usage_zeroes_all_orgs(self):
        """reset_monthly_usage sets tokens_used_this_month=0 for every org."""
        org_a = _create_org(slug="org-a")
        org_b = _create_org(slug="org-b")

        # Manually set some usage
        org_module._organizations[org_a.id].tokens_used_this_month = 1000
        org_module._organizations[org_b.id].tokens_used_this_month = 2000

        with patch("services.organization_service._save_organizations"):
            OrganizationService.reset_monthly_usage()

        assert org_module._organizations[org_a.id].tokens_used_this_month == 0
        assert org_module._organizations[org_b.id].tokens_used_this_month == 0

    # -----------------------------------------------------------------------
    # get_member_usage
    # -----------------------------------------------------------------------

    def test_get_member_usage_returns_summary_per_member(self):
        """get_member_usage aggregates usage records by member."""
        from models.organization import MemberUsageRecord

        org = _create_org(owner_id="uid-usage", owner_email="usage@example.com")

        record = MemberUsageRecord(
            organization_id=org.id,
            user_id="uid-usage",
            tokens=300,
            session_id="sess-1",
            model="gpt-4",
            timestamp=utcnow(),
        )
        org_module._member_usage[record.id] = record

        response = OrganizationService.get_member_usage(org.id, period="month")

        assert response.organization_id == org.id
        assert response.total_tokens == 300
        assert len(response.members) >= 1

        owner_summary = next(
            (m for m in response.members if m.user_id == "uid-usage"), None
        )
        assert owner_summary is not None
        assert owner_summary.tokens_used_this_month == 300
