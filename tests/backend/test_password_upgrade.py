"""Tests for SHA-256 to bcrypt password auto-upgrade."""

import hashlib
import secrets

import pytest

from services.auth_service import AuthService


def _make_legacy_sha256_hash(password: str) -> str:
    """Create a legacy SHA-256 hash in the old format: {salt_hex32}:{hash_hex64}."""
    salt = secrets.token_hex(16)  # 32 hex chars
    password_hash = hashlib.sha256((password + salt).encode()).hexdigest()  # 64 hex chars
    return f"{salt}:{password_hash}"


class TestLegacySha256Detection:
    """Test _is_legacy_sha256 detection."""

    def test_detects_legacy_format(self) -> None:
        legacy = _make_legacy_sha256_hash("password123")
        assert AuthService._is_legacy_sha256(legacy) is True

    def test_rejects_bcrypt_hash(self) -> None:
        bcrypt_hash = AuthService.hash_password("password123")
        assert AuthService._is_legacy_sha256(bcrypt_hash) is False

    def test_rejects_random_string(self) -> None:
        assert AuthService._is_legacy_sha256("not-a-hash") is False

    def test_rejects_wrong_length(self) -> None:
        assert AuthService._is_legacy_sha256("a" * 96) is False
        assert AuthService._is_legacy_sha256("a" * 98) is False


class TestBcryptHashing:
    """Test bcrypt hash_password and verify."""

    def test_hash_and_verify(self) -> None:
        password = "mySecurePassword!"
        hashed = AuthService.hash_password(password)
        assert AuthService.verify_password(password, hashed) is True

    def test_wrong_password(self) -> None:
        hashed = AuthService.hash_password("correct")
        assert AuthService.verify_password("wrong", hashed) is False

    def test_hash_starts_with_bcrypt_prefix(self) -> None:
        hashed = AuthService.hash_password("test")
        assert hashed.startswith("$2b$")


class TestLegacyVerification:
    """Test that legacy SHA-256 hashes still verify correctly."""

    def test_verify_legacy_hash(self) -> None:
        password = "oldPassword123"
        legacy_hash = _make_legacy_sha256_hash(password)
        assert AuthService.verify_password(password, legacy_hash) is True

    def test_verify_legacy_wrong_password(self) -> None:
        legacy_hash = _make_legacy_sha256_hash("correct")
        assert AuthService.verify_password("wrong", legacy_hash) is False


class TestAutoUpgrade:
    """Test verify_and_upgrade_password for SHA-256 -> bcrypt migration."""

    def test_upgrade_on_legacy_success(self) -> None:
        password = "upgradeMe!"
        legacy_hash = _make_legacy_sha256_hash(password)

        is_valid, new_hash = AuthService.verify_and_upgrade_password(password, legacy_hash)
        assert is_valid is True
        assert new_hash is not None
        # New hash should be bcrypt
        assert new_hash.startswith("$2b$")
        # New hash should verify
        assert AuthService.verify_password(password, new_hash) is True

    def test_no_upgrade_on_legacy_failure(self) -> None:
        legacy_hash = _make_legacy_sha256_hash("correct")
        is_valid, new_hash = AuthService.verify_and_upgrade_password("wrong", legacy_hash)
        assert is_valid is False
        assert new_hash is None

    def test_no_upgrade_for_bcrypt(self) -> None:
        password = "alreadyBcrypt"
        bcrypt_hash = AuthService.hash_password(password)
        is_valid, new_hash = AuthService.verify_and_upgrade_password(password, bcrypt_hash)
        assert is_valid is True
        assert new_hash is None  # No upgrade needed

    def test_no_upgrade_for_bcrypt_wrong_password(self) -> None:
        bcrypt_hash = AuthService.hash_password("correct")
        is_valid, new_hash = AuthService.verify_and_upgrade_password("wrong", bcrypt_hash)
        assert is_valid is False
        assert new_hash is None
