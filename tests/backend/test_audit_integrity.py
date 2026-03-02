"""Tests for audit integrity service."""

import pytest
from datetime import datetime, timedelta

from utils.time import utcnow

from models.audit import (
    ComplianceAuditEntry,
    DataClassification,
    RetentionPolicy,
)
from services.audit_integrity import AuditIntegrityService


@pytest.fixture
def integrity_service():
    """Create a fresh integrity service for testing."""
    return AuditIntegrityService(signing_key="test-signing-key")


@pytest.fixture
def sample_entry():
    """Create a sample audit entry."""
    return ComplianceAuditEntry(
        id="test-entry-1",
        session_id="session-123",
        user_id="user-456",
        action="task_created",
        resource_type="task",
        resource_id="task-789",
        new_value={"title": "Test Task"},
        data_classification=DataClassification.INTERNAL,
    )


class TestAuditIntegrityService:
    """Test cases for AuditIntegrityService."""

    def test_compute_hash(self, integrity_service, sample_entry):
        """Test that hash computation is deterministic."""
        hash1 = integrity_service.compute_hash(sample_entry)
        hash2 = integrity_service.compute_hash(sample_entry)

        assert hash1 == hash2
        assert len(hash1) == 64  # SHA-256 produces 64 hex chars

    def test_compute_signature(self, integrity_service, sample_entry):
        """Test signature computation with signing key."""
        hash_value = integrity_service.compute_hash(sample_entry)
        signature = integrity_service.compute_signature(hash_value)

        assert signature is not None
        assert len(signature) == 64  # HMAC-SHA256

    def test_add_entry_creates_chain(self, integrity_service, sample_entry):
        """Test that adding entries creates a hash chain."""
        # First entry
        entry1 = integrity_service.add_entry(sample_entry)
        assert entry1.previous_hash == "genesis"
        assert entry1.hash is not None

        # Second entry
        entry2_data = ComplianceAuditEntry(
            id="test-entry-2",
            action="task_updated",
            resource_type="task",
        )
        entry2 = integrity_service.add_entry(entry2_data)

        assert entry2.previous_hash == entry1.hash
        assert entry2.hash != entry1.hash

    def test_verify_chain_success(self, integrity_service):
        """Test successful chain verification."""
        # Add some entries
        for i in range(5):
            entry = ComplianceAuditEntry(
                id=f"entry-{i}",
                action="task_created",
                resource_type="task",
            )
            integrity_service.add_entry(entry)

        # Verify chain
        result = integrity_service.verify_chain()

        assert result.verified is True
        assert result.total_entries == 5
        assert result.verified_entries == 5
        assert len(result.failed_entries) == 0

    def test_verify_chain_detects_tampering(self, integrity_service):
        """Test that chain verification detects tampering."""
        # Add some entries
        for i in range(3):
            entry = ComplianceAuditEntry(
                id=f"entry-{i}",
                action="task_created",
                resource_type="task",
            )
            integrity_service.add_entry(entry)

        # Tamper with the second entry
        integrity_service._entries[1].action = "tampered_action"

        # Verify chain should fail
        result = integrity_service.verify_chain()

        assert result.verified is False
        assert len(result.failed_entries) > 0

    def test_generate_compliance_report(self, integrity_service):
        """Test compliance report generation."""
        # Add entries with various classifications
        for i, cls in enumerate([DataClassification.PUBLIC, DataClassification.INTERNAL, DataClassification.CONFIDENTIAL]):
            entry = ComplianceAuditEntry(
                id=f"entry-{i}",
                action="task_created",
                resource_type="task",
                data_classification=cls,
                user_id=f"user-{i % 2}",
                session_id="session-1",
            )
            integrity_service.add_entry(entry)

        # Generate report
        start_date = utcnow() - timedelta(hours=1)
        end_date = utcnow() + timedelta(hours=1)
        report = integrity_service.generate_compliance_report(start_date, end_date)

        assert report.total_entries == 3
        assert len(report.entries_by_classification) == 3
        assert report.unique_users == 2
        assert report.unique_sessions == 1


class TestRetentionPolicy:
    """Test retention policy functionality."""

    def test_apply_retention_policy(self, integrity_service):
        """Test applying retention policy."""
        # Add an entry
        entry = ComplianceAuditEntry(
            id="retention-test",
            action="task_created",
            resource_type="task",
            retention_policy=RetentionPolicy.STANDARD,
        )
        integrity_service.add_entry(entry)

        # Apply extended policy
        result = integrity_service.apply_retention_policy(RetentionPolicy.EXTENDED)

        assert result.success is True
        assert result.affected_entries == 1
        assert integrity_service._entries[0].retention_policy == RetentionPolicy.EXTENDED

    def test_retention_expiry_calculated(self, integrity_service):
        """Test that expiry dates are calculated correctly."""
        entry = ComplianceAuditEntry(
            id="expiry-test",
            action="task_created",
            resource_type="task",
        )
        result = integrity_service.add_entry(entry)

        # Standard policy: 7 years = 2555 days
        expected_days = 2555
        expected_expiry = result.created_at + timedelta(days=expected_days)

        assert result.expires_at is not None
        # Allow 1 second tolerance
        assert abs((result.expires_at - expected_expiry).total_seconds()) < 1

    def test_permanent_retention_no_expiry(self, integrity_service):
        """Test that permanent retention has no expiry."""
        entry = ComplianceAuditEntry(
            id="permanent-test",
            action="task_created",
            resource_type="task",
            retention_policy=RetentionPolicy.PERMANENT,
        )
        integrity_service.add_entry(entry)

        # Apply permanent policy
        integrity_service.apply_retention_policy(RetentionPolicy.PERMANENT)

        assert integrity_service._entries[0].expires_at is None


class TestHashChainIntegrity:
    """Test hash chain integrity features."""

    def test_chain_links_correctly(self, integrity_service):
        """Test that each entry links to the previous one."""
        entries = []
        for i in range(10):
            entry = ComplianceAuditEntry(
                id=f"chain-entry-{i}",
                action="task_created",
                resource_type="task",
            )
            result = integrity_service.add_entry(entry)
            entries.append(result)

        # Verify chain links
        for i in range(1, len(entries)):
            assert entries[i].previous_hash == entries[i - 1].hash

    def test_empty_chain_verifies(self, integrity_service):
        """Test that empty chain verifies successfully."""
        result = integrity_service.verify_chain()

        assert result.verified is True
        assert result.total_entries == 0
