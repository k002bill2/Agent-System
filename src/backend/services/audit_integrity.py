"""Audit integrity service for hash chain verification."""

import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta

from utils.time import utcnow

from models.audit import (
    RETENTION_DAYS,
    ComplianceAuditEntry,
    ComplianceReport,
    DataClassification,
    IntegrityVerificationResult,
    RetentionApplyResult,
    RetentionPolicy,
)


class AuditIntegrityService:
    """
    Service for maintaining audit log integrity using hash chains.

    Features:
    - SHA-256 hash chain linking entries
    - Integrity verification
    - Optional HMAC signatures
    - Compliance reporting
    """

    def __init__(self, signing_key: str | None = None):
        """
        Initialize integrity service.

        Args:
            signing_key: Optional key for HMAC signatures
        """
        self.signing_key = signing_key
        self._entries: list[ComplianceAuditEntry] = []
        self._last_hash: str = "genesis"

    # ─────────────────────────────────────────────────────────────
    # Hash Chain Management
    # ─────────────────────────────────────────────────────────────

    def compute_hash(self, entry: ComplianceAuditEntry) -> str:
        """
        Compute SHA-256 hash for an audit entry.

        The hash includes all significant fields to ensure any
        modification is detectable.
        """
        # Create canonical representation
        data = {
            "id": entry.id,
            "session_id": entry.session_id,
            "user_id": entry.user_id,
            "action": entry.action,
            "resource_type": entry.resource_type,
            "resource_id": entry.resource_id,
            "old_value": json.dumps(entry.old_value, sort_keys=True) if entry.old_value else None,
            "new_value": json.dumps(entry.new_value, sort_keys=True) if entry.new_value else None,
            "status": entry.status,
            "data_classification": entry.data_classification.value,
            "previous_hash": entry.previous_hash,
            "created_at": entry.created_at.isoformat(),
        }

        # Create deterministic string
        canonical = json.dumps(data, sort_keys=True, separators=(",", ":"))

        # Compute SHA-256
        return hashlib.sha256(canonical.encode()).hexdigest()

    def compute_signature(self, hash_value: str) -> str | None:
        """Compute HMAC signature for a hash (if signing key is configured)."""
        if not self.signing_key:
            return None

        return hmac.new(
            self.signing_key.encode(),
            hash_value.encode(),
            hashlib.sha256,
        ).hexdigest()

    def add_entry(self, entry: ComplianceAuditEntry) -> ComplianceAuditEntry:
        """
        Add an entry to the audit chain.

        This computes the hash, links to previous entry, and optionally signs.
        """
        # Link to previous hash
        entry.previous_hash = self._last_hash

        # Compute hash
        entry.hash = self.compute_hash(entry)

        # Optional signature
        entry.signature = self.compute_signature(entry.hash)

        # Set retention expiry
        if entry.retention_policy != RetentionPolicy.PERMANENT:
            days = RETENTION_DAYS.get(entry.retention_policy, 2555)
            entry.expires_at = entry.created_at + timedelta(days=days)

        # Update chain
        self._last_hash = entry.hash
        self._entries.append(entry)

        return entry

    # ─────────────────────────────────────────────────────────────
    # Integrity Verification
    # ─────────────────────────────────────────────────────────────

    def verify_chain(
        self,
        entries: list[ComplianceAuditEntry] | None = None,
    ) -> IntegrityVerificationResult:
        """
        Verify the integrity of the audit chain.

        Checks:
        1. Each entry's hash matches its computed value
        2. Each entry's previous_hash matches the previous entry's hash
        3. Signatures are valid (if signing is enabled)
        """
        start_time = time.time()
        entries = entries or self._entries

        if not entries:
            return IntegrityVerificationResult(
                verified=True,
                total_entries=0,
                verified_entries=0,
                verification_time_ms=0,
            )

        failed_entries = []
        expected_prev_hash = "genesis"

        for entry in entries:
            # Verify previous hash chain
            if entry.previous_hash != expected_prev_hash:
                failed_entries.append(entry.id)

            # Recompute and verify hash
            computed_hash = self.compute_hash(entry)
            if computed_hash != entry.hash:
                failed_entries.append(entry.id)

            # Verify signature if present
            if entry.signature and self.signing_key:
                expected_sig = self.compute_signature(entry.hash)
                if entry.signature != expected_sig:
                    failed_entries.append(entry.id)

            expected_prev_hash = entry.hash

        elapsed_ms = (time.time() - start_time) * 1000

        return IntegrityVerificationResult(
            verified=len(failed_entries) == 0,
            total_entries=len(entries),
            verified_entries=len(entries) - len(failed_entries),
            failed_entries=failed_entries,
            first_failure_id=failed_entries[0] if failed_entries else None,
            chain_start=entries[0].created_at if entries else None,
            chain_end=entries[-1].created_at if entries else None,
            verification_time_ms=elapsed_ms,
        )

    def verify_single(self, entry: ComplianceAuditEntry) -> bool:
        """Verify a single entry's hash."""
        computed_hash = self.compute_hash(entry)
        return computed_hash == entry.hash

    # ─────────────────────────────────────────────────────────────
    # Compliance Reporting
    # ─────────────────────────────────────────────────────────────

    def generate_compliance_report(
        self,
        start_date: datetime,
        end_date: datetime,
        entries: list[ComplianceAuditEntry] | None = None,
    ) -> ComplianceReport:
        """Generate a compliance report for the specified period."""
        entries = entries or self._entries

        # Filter by date range
        filtered = [e for e in entries if start_date <= e.created_at <= end_date]

        # Compute statistics
        actions: dict[str, int] = {}
        classifications: dict[str, int] = {}
        compliance_flags: dict[str, int] = {}
        users: set[str] = set()
        sessions: set[str] = set()
        high_risk: list[dict] = []

        for entry in filtered:
            # Actions
            actions[entry.action] = actions.get(entry.action, 0) + 1

            # Classifications
            cls = entry.data_classification.value
            classifications[cls] = classifications.get(cls, 0) + 1

            # Compliance flags
            for flag in entry.compliance_flags:
                compliance_flags[flag] = compliance_flags.get(flag, 0) + 1

            # Users and sessions
            if entry.user_id:
                users.add(entry.user_id)
            if entry.session_id:
                sessions.add(entry.session_id)

            # High risk (confidential/restricted data)
            if entry.data_classification in (
                DataClassification.CONFIDENTIAL,
                DataClassification.RESTRICTED,
            ):
                high_risk.append(
                    {
                        "id": entry.id,
                        "action": entry.action,
                        "classification": entry.data_classification.value,
                        "user_id": entry.user_id,
                        "created_at": entry.created_at.isoformat(),
                    }
                )

        # Retention statistics
        now = utcnow()
        expiry_warning_days = 30

        approaching_expiry = sum(
            1
            for e in filtered
            if e.expires_at and e.expires_at <= now + timedelta(days=expiry_warning_days)
        )

        expired = sum(1 for e in filtered if e.expires_at and e.expires_at <= now)

        # Verify chain integrity
        chain_integrity = self.verify_chain(filtered) if filtered else None

        return ComplianceReport(
            report_period_start=start_date,
            report_period_end=end_date,
            total_entries=len(filtered),
            entries_by_action=actions,
            entries_by_classification=classifications,
            entries_by_compliance_flag=compliance_flags,
            chain_integrity=chain_integrity,
            entries_approaching_expiry=approaching_expiry,
            entries_expired=expired,
            unique_users=len(users),
            unique_sessions=len(sessions),
            high_risk_actions=high_risk[:100],  # Limit to 100
        )

    # ─────────────────────────────────────────────────────────────
    # Retention Management
    # ─────────────────────────────────────────────────────────────

    def apply_retention_policy(
        self,
        policy: RetentionPolicy,
        classification: DataClassification | None = None,
    ) -> RetentionApplyResult:
        """
        Apply retention policy to entries.

        Args:
            policy: The retention policy to apply
            classification: Optional filter by data classification
        """
        affected = 0
        marked_for_deletion = 0
        extended = 0
        errors = []

        retention_days = RETENTION_DAYS.get(policy, 2555)
        now = utcnow()

        for entry in self._entries:
            # Filter by classification if specified
            if classification and entry.data_classification != classification:
                continue

            affected += 1

            try:
                # Update policy
                entry.retention_policy = policy
                entry.retention_days = retention_days

                # Update expiry
                if policy == RetentionPolicy.PERMANENT:
                    entry.expires_at = None
                else:
                    new_expiry = entry.created_at + timedelta(days=retention_days)

                    if entry.expires_at and new_expiry > entry.expires_at:
                        extended += 1

                    entry.expires_at = new_expiry

                    # Check if now expired
                    if entry.expires_at <= now:
                        marked_for_deletion += 1

            except Exception as e:
                errors.append(f"Entry {entry.id}: {str(e)}")

        return RetentionApplyResult(
            success=len(errors) == 0,
            policy=policy,
            affected_entries=affected,
            entries_marked_for_deletion=marked_for_deletion,
            entries_extended=extended,
            errors=errors,
        )

    def get_expired_entries(self) -> list[ComplianceAuditEntry]:
        """Get all entries that have passed their retention period."""
        now = utcnow()
        return [e for e in self._entries if e.expires_at and e.expires_at <= now]

    def cleanup_expired(self, dry_run: bool = True) -> int:
        """
        Remove expired entries.

        Args:
            dry_run: If True, only count without removing

        Returns:
            Number of entries removed (or would be removed)
        """
        expired = self.get_expired_entries()
        count = len(expired)

        if not dry_run:
            # Note: This breaks the hash chain - should archive first
            self._entries = [
                e for e in self._entries if not (e.expires_at and e.expires_at <= utcnow())
            ]

        return count


# Global singleton
_integrity_service: AuditIntegrityService | None = None


def get_audit_integrity_service(signing_key: str | None = None) -> AuditIntegrityService:
    """Get or create the audit integrity service singleton."""
    global _integrity_service
    if _integrity_service is None:
        _integrity_service = AuditIntegrityService(signing_key)
    return _integrity_service
