"""Custom SQLAlchemy column types."""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import TypeDecorator


class EncryptedString(TypeDecorator):
    """SQLAlchemy type that transparently encrypts/decrypts string columns.

    When ``ENCRYPTION_MASTER_KEY`` is not set the value is stored as plaintext
    for backwards compatibility.
    """

    impl = sa.String
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect: object) -> str | None:  # noqa: ARG002
        """Encrypt before writing to DB."""
        if value is None:
            return None

        key = _get_encryption_key()
        if key is None:
            return value  # no master key configured – store plaintext

        from services.encryption_service import encrypt_field

        # Already encrypted? (idempotency guard)
        if value.startswith("v1:"):
            return value

        return encrypt_field(value, key)

    def process_result_value(self, value: str | None, dialect: object) -> str | None:  # noqa: ARG002
        """Decrypt after reading from DB."""
        if value is None:
            return None

        key = _get_encryption_key()
        if key is None:
            return value  # no master key configured – return as-is

        # Not encrypted? (plain text from before encryption was enabled)
        if not value.startswith("v1:"):
            return value

        from services.encryption_service import decrypt_field

        return decrypt_field(value, key)


def _get_encryption_key() -> bytes | None:
    """Retrieve the field encryption key from config.

    Returns None when ``encryption_master_key`` is empty (encryption disabled).
    """
    from config import get_settings

    settings = get_settings()
    master_hex = settings.encryption_master_key
    if not master_hex:
        return None

    from services.key_management import KeyManager

    km = KeyManager(master_hex)
    return km.get_field_encryption_key()
