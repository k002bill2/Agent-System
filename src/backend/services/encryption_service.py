"""AES-256-GCM field-level encryption service."""

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Encryption format version
_VERSION = "v1"
_NONCE_SIZE = 12  # 96 bits recommended for AES-GCM


def encrypt_field(plaintext: str, key: bytes) -> str:
    """Encrypt a string field using AES-256-GCM.

    Args:
        plaintext: The string to encrypt.
        key: 32-byte AES-256 key.

    Returns:
        Encrypted string in format ``v1:{nonce_b64}:{ciphertext_b64}``.
    """
    nonce = os.urandom(_NONCE_SIZE)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    nonce_b64 = base64.b64encode(nonce).decode("ascii")
    ct_b64 = base64.b64encode(ciphertext).decode("ascii")
    return f"{_VERSION}:{nonce_b64}:{ct_b64}"


def decrypt_field(encrypted: str, key: bytes) -> str:
    """Decrypt an AES-256-GCM encrypted field.

    Args:
        encrypted: String in format ``v1:{nonce_b64}:{ciphertext_b64}``.
        key: 32-byte AES-256 key.

    Returns:
        Decrypted plaintext string.

    Raises:
        ValueError: If the encrypted string format is invalid or decryption fails.
    """
    parts = encrypted.split(":")
    if len(parts) != 3:
        raise ValueError("Invalid encrypted field format: expected v1:nonce:ciphertext")

    version, nonce_b64, ct_b64 = parts
    if version != _VERSION:
        raise ValueError(f"Unsupported encryption version: {version}")

    nonce = base64.b64decode(nonce_b64)
    ciphertext = base64.b64decode(ct_b64)
    aesgcm = AESGCM(key)
    plaintext_bytes = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext_bytes.decode("utf-8")
