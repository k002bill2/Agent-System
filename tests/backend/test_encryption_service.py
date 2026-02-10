"""Tests for AES-256-GCM encryption service."""

import os

import pytest

from services.encryption_service import decrypt_field, encrypt_field


@pytest.fixture
def aes_key() -> bytes:
    """Generate a random 32-byte AES-256 key."""
    return os.urandom(32)


class TestEncryptDecryptRoundTrip:
    """Round-trip encrypt/decrypt tests."""

    def test_basic_roundtrip(self, aes_key: bytes) -> None:
        plaintext = "hello world"
        encrypted = encrypt_field(plaintext, aes_key)
        assert decrypt_field(encrypted, aes_key) == plaintext

    def test_empty_string(self, aes_key: bytes) -> None:
        encrypted = encrypt_field("", aes_key)
        assert decrypt_field(encrypted, aes_key) == ""

    def test_unicode(self, aes_key: bytes) -> None:
        plaintext = "안녕하세요 🔐 암호화 테스트"
        encrypted = encrypt_field(plaintext, aes_key)
        assert decrypt_field(encrypted, aes_key) == plaintext

    def test_long_string(self, aes_key: bytes) -> None:
        plaintext = "x" * 10_000
        encrypted = encrypt_field(plaintext, aes_key)
        assert decrypt_field(encrypted, aes_key) == plaintext

    def test_different_nonce_each_time(self, aes_key: bytes) -> None:
        """Each encryption should produce different ciphertext."""
        plaintext = "same input"
        enc1 = encrypt_field(plaintext, aes_key)
        enc2 = encrypt_field(plaintext, aes_key)
        assert enc1 != enc2
        assert decrypt_field(enc1, aes_key) == plaintext
        assert decrypt_field(enc2, aes_key) == plaintext


class TestDecryptErrors:
    """Error handling tests."""

    def test_wrong_key(self, aes_key: bytes) -> None:
        encrypted = encrypt_field("secret", aes_key)
        wrong_key = os.urandom(32)
        with pytest.raises(Exception):
            decrypt_field(encrypted, wrong_key)

    def test_invalid_format_no_colons(self, aes_key: bytes) -> None:
        with pytest.raises(ValueError, match="Invalid encrypted field format"):
            decrypt_field("not-encrypted-at-all", aes_key)

    def test_invalid_format_wrong_parts(self, aes_key: bytes) -> None:
        with pytest.raises(ValueError, match="Invalid encrypted field format"):
            decrypt_field("a:b", aes_key)

    def test_unsupported_version(self, aes_key: bytes) -> None:
        with pytest.raises(ValueError, match="Unsupported encryption version"):
            decrypt_field("v99:abc:def", aes_key)

    def test_corrupted_ciphertext(self, aes_key: bytes) -> None:
        encrypted = encrypt_field("test", aes_key)
        parts = encrypted.split(":")
        parts[2] = "AAAA"  # corrupt ciphertext
        corrupted = ":".join(parts)
        with pytest.raises(Exception):
            decrypt_field(corrupted, aes_key)


class TestEncryptedFormat:
    """Format/version parsing tests."""

    def test_format_v1(self, aes_key: bytes) -> None:
        encrypted = encrypt_field("test", aes_key)
        assert encrypted.startswith("v1:")
        parts = encrypted.split(":")
        assert len(parts) == 3

    def test_nonce_is_16_chars_base64(self, aes_key: bytes) -> None:
        """12-byte nonce -> 16 chars base64."""
        encrypted = encrypt_field("test", aes_key)
        nonce_b64 = encrypted.split(":")[1]
        assert len(nonce_b64) == 16
