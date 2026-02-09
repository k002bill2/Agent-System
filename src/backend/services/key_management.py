"""Key management service using HKDF for key derivation."""

import base64

from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from services.encryption_service import decrypt_field, encrypt_field


class KeyManager:
    """Derives service-specific encryption keys from a master key using HKDF."""

    def __init__(self, master_key_hex: str) -> None:
        """Initialize with a hex-encoded master key.

        Args:
            master_key_hex: Hex string of master key (at least 32 bytes / 64 hex chars).
        """
        self._master_key = bytes.fromhex(master_key_hex)
        if len(self._master_key) < 32:
            raise ValueError("Master key must be at least 32 bytes (64 hex characters)")

    def _derive(self, info: str) -> bytes:
        """Derive a 32-byte key for a specific purpose.

        Args:
            info: Context string identifying the key purpose (e.g. 'field-encryption').

        Returns:
            32-byte derived key.
        """
        hkdf = HKDF(
            algorithm=SHA256(),
            length=32,
            salt=None,
            info=info.encode("utf-8"),
        )
        return hkdf.derive(self._master_key)

    def get_field_encryption_key(self) -> bytes:
        """Get the AES-256 key used for database field encryption."""
        return self._derive("aos-field-encryption")

    async def rotate_key(
        self,
        old_key: bytes,
        new_key: bytes,
        db_session: object,
    ) -> dict[str, int]:
        """Re-encrypt all encrypted fields from old_key to new_key.

        Args:
            old_key: The current encryption key.
            new_key: The new encryption key to re-encrypt with.
            db_session: An async SQLAlchemy session.

        Returns:
            Dict with counts of re-encrypted rows per table.
        """
        from sqlalchemy import select, text

        # Tables and columns that use EncryptedString
        encrypted_columns: list[tuple[str, list[str]]] = [
            ("channel_configs", ["webhook_url", "api_key", "bot_token", "smtp_password"]),
            ("saml_configs", ["idp_certificate"]),
        ]

        results: dict[str, int] = {}
        for table, columns in encrypted_columns:
            # Fetch all rows
            stmt = text(f"SELECT id, {', '.join(columns)} FROM {table}")  # noqa: S608
            rows = (await db_session.execute(stmt)).fetchall()
            count = 0
            for row in rows:
                row_id = row[0]
                updates = {}
                for i, col in enumerate(columns):
                    value = row[i + 1]
                    if value and value.startswith("v1:"):
                        try:
                            plaintext = decrypt_field(value, old_key)
                            updates[col] = encrypt_field(plaintext, new_key)
                        except Exception:
                            continue  # skip fields that can't be decrypted
                if updates:
                    set_clause = ", ".join(f"{c} = :{c}" for c in updates)
                    update_stmt = text(
                        f"UPDATE {table} SET {set_clause} WHERE id = :id"  # noqa: S608
                    )
                    await db_session.execute(update_stmt, {"id": row_id, **updates})
                    count += 1
            results[table] = count

        await db_session.commit()
        return results


def get_master_key_b64(master_key_hex: str) -> str:
    """Convert hex master key to base64 for display/export."""
    return base64.b64encode(bytes.fromhex(master_key_hex)).decode("ascii")
