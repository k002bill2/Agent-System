"""Tests for AuthService: JWT token management, OAuth callbacks, email/password auth, and password hashing."""

import hashlib
import uuid
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import jwt
import pytest

from services.auth_service import AuthService, TokenPair, UserInfo


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_settings(
    secret: str = "test-secret-key-32-bytes-long-abc",
    algorithm: str = "HS256",
    access_minutes: int = 60,
    refresh_days: int = 7,
    super_admin_emails: str = "",
):
    """Return a minimal Settings-like MagicMock."""
    s = MagicMock()
    s.session_secret_key = secret
    s.jwt_algorithm = algorithm
    s.access_token_expire_minutes = access_minutes
    s.refresh_token_expire_days = refresh_days
    s.super_admin_emails = super_admin_emails
    s.google_client_id = "google-client-id"
    s.google_client_secret = "google-client-secret"
    s.github_client_id = "github-client-id"
    s.github_client_secret = "github-client-secret"
    return s


def _legacy_sha256_hash(password: str) -> str:
    """Create a legacy SHA-256 hash in the format ``{salt32}:{hash64}``."""
    salt = uuid.uuid4().hex  # 32 hex chars
    password_hash = hashlib.sha256((password + salt).encode()).hexdigest()  # 64 hex chars
    return f"{salt}:{password_hash}"


def _make_user_model(
    user_id: str = "user-123",
    email: str = "test@example.com",
    name: str = "Test User",
    password_hash: str | None = None,
    is_active: bool = True,
    is_admin: bool = False,
    oauth_provider: str | None = None,
    oauth_provider_id: str | None = None,
):
    """Return a MagicMock that mimics UserModel."""
    user = MagicMock()
    user.id = user_id
    user.email = email
    user.name = name
    user.password_hash = password_hash
    user.is_active = is_active
    user.is_admin = is_admin
    user.role = "admin" if is_admin else "user"
    user.oauth_provider = oauth_provider
    user.oauth_provider_id = oauth_provider_id
    user.avatar_url = None
    user.last_login_at = None
    return user


# ---------------------------------------------------------------------------
# JWT Token Tests
# ---------------------------------------------------------------------------

class TestJwtTokenCreation:
    """Tests for create_access_token, create_refresh_token, and create_token_pair."""

    def setup_method(self):
        with patch("services.auth_service.get_settings", return_value=_make_settings()):
            self.service = AuthService()
        self.service.settings = _make_settings()

    def test_create_access_token_returns_string(self):
        token = self.service.create_access_token("user-abc")
        assert isinstance(token, str)
        assert len(token) > 0

    def test_create_access_token_payload_fields(self):
        token = self.service.create_access_token("user-abc")
        payload = jwt.decode(
            token,
            self.service.settings.session_secret_key,
            algorithms=[self.service.settings.jwt_algorithm],
        )
        assert payload["sub"] == "user-abc"
        assert payload["type"] == "access"
        assert "exp" in payload
        assert "iat" in payload

    def test_create_access_token_additional_claims(self):
        token = self.service.create_access_token(
            "user-abc", additional_claims={"role": "admin", "org": "acme"}
        )
        payload = jwt.decode(
            token,
            self.service.settings.session_secret_key,
            algorithms=[self.service.settings.jwt_algorithm],
        )
        assert payload["role"] == "admin"
        assert payload["org"] == "acme"

    def test_create_refresh_token_payload_fields(self):
        token = self.service.create_refresh_token("user-abc")
        payload = jwt.decode(
            token,
            self.service.settings.session_secret_key,
            algorithms=[self.service.settings.jwt_algorithm],
        )
        assert payload["sub"] == "user-abc"
        assert payload["type"] == "refresh"
        assert "jti" in payload  # unique token ID

    def test_create_token_pair_returns_token_pair(self):
        pair = self.service.create_token_pair("user-abc")
        assert isinstance(pair, TokenPair)
        assert pair.token_type == "bearer"
        assert pair.expires_in == self.service.settings.access_token_expire_minutes * 60
        assert len(pair.access_token) > 0
        assert len(pair.refresh_token) > 0

    def test_refresh_token_has_unique_jti(self):
        t1 = self.service.create_refresh_token("user-abc")
        t2 = self.service.create_refresh_token("user-abc")
        p1 = jwt.decode(
            t1,
            self.service.settings.session_secret_key,
            algorithms=[self.service.settings.jwt_algorithm],
        )
        p2 = jwt.decode(
            t2,
            self.service.settings.session_secret_key,
            algorithms=[self.service.settings.jwt_algorithm],
        )
        assert p1["jti"] != p2["jti"]


# ---------------------------------------------------------------------------
# JWT Token Verification Tests
# ---------------------------------------------------------------------------

class TestJwtTokenVerification:
    """Tests for verify_token."""

    def setup_method(self):
        self.settings = _make_settings()
        with patch("services.auth_service.get_settings", return_value=self.settings):
            self.service = AuthService()
        self.service.settings = self.settings

    def test_verify_valid_access_token(self):
        token = self.service.create_access_token("user-xyz")
        payload = self.service.verify_token(token, token_type="access")
        assert payload is not None
        assert payload["sub"] == "user-xyz"

    def test_verify_valid_refresh_token(self):
        token = self.service.create_refresh_token("user-xyz")
        payload = self.service.verify_token(token, token_type="refresh")
        assert payload is not None
        assert payload["sub"] == "user-xyz"

    def test_verify_wrong_token_type_returns_none(self):
        """Passing an access token as refresh (or vice versa) should return None."""
        access_token = self.service.create_access_token("user-xyz")
        result = self.service.verify_token(access_token, token_type="refresh")
        assert result is None

    def test_verify_expired_token_returns_none(self):
        # Create a token that is already expired
        expired_payload = {
            "sub": "user-xyz",
            "type": "access",
            "exp": datetime.utcnow() - timedelta(seconds=1),
            "iat": datetime.utcnow() - timedelta(minutes=5),
        }
        expired_token = jwt.encode(
            expired_payload,
            self.settings.session_secret_key,
            algorithm=self.settings.jwt_algorithm,
        )
        result = self.service.verify_token(expired_token, token_type="access")
        assert result is None

    def test_verify_tampered_token_returns_none(self):
        token = self.service.create_access_token("user-xyz")
        tampered = token[:-4] + "xxxx"
        result = self.service.verify_token(tampered, token_type="access")
        assert result is None

    def test_verify_token_wrong_secret_returns_none(self):
        token = self.service.create_access_token("user-xyz")
        # Create a second service with a different secret
        alt_settings = _make_settings(secret="totally-different-secret-32b!!")
        with patch("services.auth_service.get_settings", return_value=alt_settings):
            alt_service = AuthService()
        alt_service.settings = alt_settings
        result = alt_service.verify_token(token, token_type="access")
        assert result is None


# ---------------------------------------------------------------------------
# Password Hashing Tests
# ---------------------------------------------------------------------------

class TestPasswordHashing:
    """Tests for hash_password, verify_password, and verify_and_upgrade_password."""

    def test_hash_password_returns_bcrypt_string(self):
        hashed = AuthService.hash_password("mysecretpassword")
        assert isinstance(hashed, str)
        assert hashed.startswith("$2b$") or hashed.startswith("$2a$")

    def test_verify_password_bcrypt_correct(self):
        password = "correct-horse-battery-staple"
        hashed = AuthService.hash_password(password)
        assert AuthService.verify_password(password, hashed) is True

    def test_verify_password_bcrypt_wrong(self):
        hashed = AuthService.hash_password("correct-password")
        assert AuthService.verify_password("wrong-password", hashed) is False

    def test_verify_password_legacy_sha256_correct(self):
        password = "legacy-password"
        legacy_hash = _legacy_sha256_hash(password)
        assert AuthService.verify_password(password, legacy_hash) is True

    def test_verify_password_legacy_sha256_wrong(self):
        legacy_hash = _legacy_sha256_hash("correct-password")
        assert AuthService.verify_password("wrong-password", legacy_hash) is False

    def test_is_legacy_sha256_detection(self):
        legacy_hash = _legacy_sha256_hash("some-pass")
        assert AuthService._is_legacy_sha256(legacy_hash) is True
        bcrypt_hash = AuthService.hash_password("some-pass")
        assert AuthService._is_legacy_sha256(bcrypt_hash) is False

    def test_verify_and_upgrade_bcrypt_correct(self):
        password = "modern-password"
        hashed = AuthService.hash_password(password)
        is_valid, new_hash = AuthService.verify_and_upgrade_password(password, hashed)
        assert is_valid is True
        assert new_hash is None  # No upgrade needed for bcrypt

    def test_verify_and_upgrade_bcrypt_wrong(self):
        hashed = AuthService.hash_password("actual-password")
        is_valid, new_hash = AuthService.verify_and_upgrade_password("wrong-password", hashed)
        assert is_valid is False
        assert new_hash is None

    def test_verify_and_upgrade_legacy_returns_new_bcrypt_hash(self):
        password = "legacy-password"
        legacy_hash = _legacy_sha256_hash(password)
        is_valid, new_hash = AuthService.verify_and_upgrade_password(password, legacy_hash)
        assert is_valid is True
        assert new_hash is not None
        # New hash must be a valid bcrypt hash that also verifies correctly
        assert AuthService.verify_password(password, new_hash) is True
        assert not AuthService._is_legacy_sha256(new_hash)

    def test_verify_and_upgrade_legacy_wrong_password(self):
        legacy_hash = _legacy_sha256_hash("correct-password")
        is_valid, new_hash = AuthService.verify_and_upgrade_password("wrong-password", legacy_hash)
        assert is_valid is False
        assert new_hash is None


# ---------------------------------------------------------------------------
# OAuth URL Generation Tests
# ---------------------------------------------------------------------------

class TestOAuthUrlGeneration:
    """Tests for get_google_auth_url and get_github_auth_url."""

    def setup_method(self):
        self.settings = _make_settings()
        with patch("services.auth_service.get_settings", return_value=self.settings):
            self.service = AuthService()
        self.service.settings = self.settings

    def test_get_google_auth_url_contains_base(self):
        url = self.service.get_google_auth_url("https://example.com/callback")
        assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth?")

    def test_get_google_auth_url_contains_client_id(self):
        url = self.service.get_google_auth_url("https://example.com/callback")
        assert "client_id=google-client-id" in url

    def test_get_google_auth_url_with_state(self):
        url = self.service.get_google_auth_url("https://example.com/callback", state="mystate")
        assert "state=mystate" in url

    def test_get_google_auth_url_without_state(self):
        url = self.service.get_google_auth_url("https://example.com/callback")
        assert "state=" not in url

    def test_get_github_auth_url_contains_base(self):
        url = self.service.get_github_auth_url("https://example.com/callback")
        assert url.startswith("https://github.com/login/oauth/authorize?")

    def test_get_github_auth_url_contains_client_id(self):
        url = self.service.get_github_auth_url("https://example.com/callback")
        assert "client_id=github-client-id" in url

    def test_get_github_auth_url_with_state(self):
        url = self.service.get_github_auth_url("https://example.com/callback", state="csrf-token")
        assert "state=csrf-token" in url


# ---------------------------------------------------------------------------
# OAuth Code Exchange Tests
# ---------------------------------------------------------------------------

class TestGoogleCodeExchange:
    """Tests for exchange_google_code."""

    def setup_method(self):
        self.settings = _make_settings()
        with patch("services.auth_service.get_settings", return_value=self.settings):
            self.service = AuthService()
        self.service.settings = self.settings

    @pytest.mark.asyncio
    async def test_exchange_google_code_success(self):
        token_resp = MagicMock()
        token_resp.status_code = 200
        token_resp.json.return_value = {"access_token": "goog-access-token"}

        userinfo_resp = MagicMock()
        userinfo_resp.raise_for_status = MagicMock()
        userinfo_resp.json.return_value = {
            "id": "goog-123",
            "email": "alice@gmail.com",
            "name": "Alice",
            "picture": "https://example.com/pic.jpg",
        }

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=token_resp)
        mock_client.get = AsyncMock(return_value=userinfo_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.auth_service.httpx.AsyncClient", return_value=mock_client):
            user_info = await self.service.exchange_google_code("auth-code", "https://cb.example.com")

        assert isinstance(user_info, UserInfo)
        assert user_info.id == "goog-123"
        assert user_info.email == "alice@gmail.com"
        assert user_info.provider == "google"
        assert user_info.avatar_url == "https://example.com/pic.jpg"

    @pytest.mark.asyncio
    async def test_exchange_google_code_token_failure_raises(self):
        token_resp = MagicMock()
        token_resp.status_code = 400
        token_resp.json.return_value = {
            "error": "invalid_grant",
            "error_description": "Code expired",
        }

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=token_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.auth_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(Exception, match="Google token exchange failed"):
                await self.service.exchange_google_code("bad-code", "https://cb.example.com")


class TestGithubCodeExchange:
    """Tests for exchange_github_code."""

    def setup_method(self):
        self.settings = _make_settings()
        with patch("services.auth_service.get_settings", return_value=self.settings):
            self.service = AuthService()
        self.service.settings = self.settings

    @pytest.mark.asyncio
    async def test_exchange_github_code_success_public_email(self):
        token_resp = MagicMock()
        token_resp.raise_for_status = MagicMock()
        token_resp.json.return_value = {"access_token": "ghub-access-token"}

        user_resp = MagicMock()
        user_resp.raise_for_status = MagicMock()
        user_resp.json.return_value = {
            "id": 999,
            "email": "bob@example.com",
            "name": "Bob",
            "avatar_url": "https://avatars.example.com/bob",
        }

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=token_resp)
        mock_client.get = AsyncMock(return_value=user_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.auth_service.httpx.AsyncClient", return_value=mock_client):
            user_info = await self.service.exchange_github_code("gh-code", "https://cb.example.com")

        assert isinstance(user_info, UserInfo)
        assert user_info.id == "999"
        assert user_info.email == "bob@example.com"
        assert user_info.provider == "github"

    @pytest.mark.asyncio
    async def test_exchange_github_code_fetches_email_when_null(self):
        """When user.email is null, the service fetches /user/emails."""
        token_resp = MagicMock()
        token_resp.raise_for_status = MagicMock()
        token_resp.json.return_value = {"access_token": "ghub-access-token"}

        user_resp = MagicMock()
        user_resp.raise_for_status = MagicMock()
        user_resp.json.return_value = {
            "id": 888,
            "email": None,
            "name": "Charlie",
            "avatar_url": None,
        }

        emails_resp = MagicMock()
        emails_resp.raise_for_status = MagicMock()
        emails_resp.json.return_value = [
            {"email": "charlie@users.noreply.github.com", "primary": False, "verified": True},
            {"email": "charlie@real.com", "primary": True, "verified": True},
        ]

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=token_resp)
        # First GET → user info; second GET → emails
        mock_client.get = AsyncMock(side_effect=[user_resp, emails_resp])
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.auth_service.httpx.AsyncClient", return_value=mock_client):
            user_info = await self.service.exchange_github_code("gh-code", "https://cb.example.com")

        assert user_info.email == "charlie@real.com"

    @pytest.mark.asyncio
    async def test_exchange_github_code_error_in_token_raises(self):
        token_resp = MagicMock()
        token_resp.raise_for_status = MagicMock()
        token_resp.json.return_value = {
            "error": "bad_verification_code",
            "error_description": "The code is already used.",
        }

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=token_resp)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.auth_service.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ValueError, match="GitHub OAuth error"):
                await self.service.exchange_github_code("used-code", "https://cb.example.com")


# ---------------------------------------------------------------------------
# Email / Password Registration and Login Tests
# ---------------------------------------------------------------------------

class TestEmailPasswordAuth:
    """Tests for register_user and login_user."""

    def setup_method(self):
        self.settings = _make_settings()
        with patch("services.auth_service.get_settings", return_value=self.settings):
            self.service = AuthService()
        self.service.settings = self.settings

    def _make_db(self, existing_user=None):
        """Return a mock AsyncSession."""
        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.scalar_one_or_none.return_value = existing_user
        db.execute = AsyncMock(return_value=result_mock)
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        return db

    @pytest.mark.asyncio
    async def test_register_user_no_db_raises(self):
        """register_user without a db session must raise RuntimeError."""
        service = AuthService(db=None)
        service.settings = self.settings
        with pytest.raises(RuntimeError, match="Database session required"):
            await service.register_user("new@example.com", "pass123")

    @pytest.mark.asyncio
    async def test_register_user_duplicate_email_raises(self):
        existing = _make_user_model(email="dup@example.com")
        db = self._make_db(existing_user=existing)
        service = AuthService(db=db)
        service.settings = self.settings
        with pytest.raises(ValueError, match="이미 등록된 이메일"):
            await service.register_user("dup@example.com", "pass123")

    @pytest.mark.asyncio
    async def test_register_user_success(self):
        db = self._make_db(existing_user=None)

        service = AuthService(db=db)
        service.settings = self.settings

        # sync_user_role_from_org hits the DB; return a passthrough mock
        async def passthrough_sync(user):
            return user

        with patch.object(service, "sync_user_role_from_org", new=AsyncMock(side_effect=passthrough_sync)):
            user = await service.register_user("new@example.com", "mypassword", name="Alice")

        db.add.assert_called_once()
        db.commit.assert_awaited()
        # The returned object is a real UserModel built inside register_user
        assert user.email == "new@example.com"
        assert user.oauth_provider == "email"
        assert user.is_active is True
        assert user.is_admin is False

    @pytest.mark.asyncio
    async def test_login_user_no_db_raises(self):
        service = AuthService(db=None)
        service.settings = self.settings
        with pytest.raises(RuntimeError, match="Database session required"):
            await service.login_user("x@example.com", "pass")

    @pytest.mark.asyncio
    async def test_login_user_unknown_email_raises(self):
        db = self._make_db(existing_user=None)
        service = AuthService(db=db)
        service.settings = self.settings
        with pytest.raises(ValueError, match="이메일 또는 비밀번호"):
            await service.login_user("ghost@example.com", "pass123")

    @pytest.mark.asyncio
    async def test_login_user_no_password_hash_raises(self):
        """OAuth-only user has no password_hash; login should raise ValueError."""
        user = _make_user_model(password_hash=None)
        db = self._make_db(existing_user=user)
        service = AuthService(db=db)
        service.settings = self.settings
        with pytest.raises(ValueError, match="이메일 또는 비밀번호"):
            await service.login_user("test@example.com", "any-pass")

    @pytest.mark.asyncio
    async def test_login_user_wrong_password_raises(self):
        correct_hash = AuthService.hash_password("correct-pass")
        user = _make_user_model(password_hash=correct_hash)
        db = self._make_db(existing_user=user)
        service = AuthService(db=db)
        service.settings = self.settings
        with pytest.raises(ValueError, match="이메일 또는 비밀번호"):
            await service.login_user("test@example.com", "wrong-pass")

    @pytest.mark.asyncio
    async def test_login_user_inactive_account_raises(self):
        correct_hash = AuthService.hash_password("mypass")
        user = _make_user_model(password_hash=correct_hash, is_active=False)
        db = self._make_db(existing_user=user)
        service = AuthService(db=db)
        service.settings = self.settings
        with pytest.raises(ValueError, match="비활성화된 계정"):
            await service.login_user("test@example.com", "mypass")

    @pytest.mark.asyncio
    async def test_login_user_success_bcrypt(self):
        password = "valid-pass"
        correct_hash = AuthService.hash_password(password)
        user = _make_user_model(password_hash=correct_hash, is_active=True)
        db = self._make_db(existing_user=user)
        service = AuthService(db=db)
        service.settings = self.settings

        with patch.object(service, "sync_user_role_from_org", new=AsyncMock(return_value=user)):
            result = await service.login_user("test@example.com", password)

        assert result is user
        db.commit.assert_awaited()

    @pytest.mark.asyncio
    async def test_login_user_upgrades_legacy_hash(self):
        """Login with a legacy SHA-256 hash must auto-upgrade it to bcrypt."""
        password = "legacy-password"
        legacy_hash = _legacy_sha256_hash(password)
        user = _make_user_model(password_hash=legacy_hash, is_active=True)
        db = self._make_db(existing_user=user)
        service = AuthService(db=db)
        service.settings = self.settings

        with patch.object(service, "sync_user_role_from_org", new=AsyncMock(return_value=user)):
            result = await service.login_user("test@example.com", password)

        # The password_hash attribute should have been updated to a bcrypt hash
        assert not AuthService._is_legacy_sha256(user.password_hash)
        assert result is user


# ---------------------------------------------------------------------------
# get_or_create_user Tests
# ---------------------------------------------------------------------------

class TestGetOrCreateUser:
    """Tests for get_or_create_user."""

    def setup_method(self):
        self.settings = _make_settings()
        with patch("services.auth_service.get_settings", return_value=self.settings):
            self.service = AuthService()
        self.service.settings = self.settings

    def _make_db_with_results(self, first_result=None, second_result=None):
        """Return a mock DB whose execute() cycles through the given scalar results."""
        db = AsyncMock()
        calls = []

        async def execute_side_effect(stmt):
            mock_result = MagicMock()
            idx = len(calls)
            calls.append(idx)
            if idx == 0:
                mock_result.scalar_one_or_none.return_value = first_result
            else:
                mock_result.scalar_one_or_none.return_value = second_result
            return mock_result

        db.execute = AsyncMock(side_effect=execute_side_effect)
        db.add = MagicMock()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()
        return db

    @pytest.mark.asyncio
    async def test_no_db_raises(self):
        service = AuthService(db=None)
        service.settings = self.settings
        user_info = UserInfo(id="g-1", email="a@b.com", provider="google")
        with pytest.raises(RuntimeError, match="Database session required"):
            await service.get_or_create_user(user_info)

    @pytest.mark.asyncio
    async def test_existing_provider_user_is_returned(self):
        existing = _make_user_model(oauth_provider="google", oauth_provider_id="g-1")
        db = self._make_db_with_results(first_result=existing)
        service = AuthService(db=db)
        service.settings = self.settings

        user_info = UserInfo(id="g-1", email="alice@gmail.com", provider="google", name="Alice")

        with patch.object(service, "sync_user_role_from_org", new=AsyncMock(return_value=existing)):
            result = await service.get_or_create_user(user_info)

        assert result is existing
        db.commit.assert_awaited()

    @pytest.mark.asyncio
    async def test_new_user_is_created_when_not_found(self):
        new_user = _make_user_model(email="newbie@example.com", oauth_provider="github")
        db = self._make_db_with_results(first_result=None, second_result=None)
        db.refresh = AsyncMock()
        service = AuthService(db=db)
        service.settings = self.settings

        user_info = UserInfo(id="gh-999", email="newbie@example.com", provider="github")

        with patch.object(service, "sync_user_role_from_org", new=AsyncMock(return_value=new_user)):
            result = await service.get_or_create_user(user_info)

        db.add.assert_called_once()
        db.commit.assert_awaited()
        assert result is new_user


# ---------------------------------------------------------------------------
# sync_user_role_from_org Tests
# ---------------------------------------------------------------------------

class TestSyncUserRoleFromOrg:
    """Tests for sync_user_role_from_org."""

    def setup_method(self):
        self.settings = _make_settings()

    def _make_service_with_org_roles(self, roles: list[str], super_admin_emails: str = ""):
        settings = _make_settings(super_admin_emails=super_admin_emails)
        with patch("services.auth_service.get_settings", return_value=settings):
            service = AuthService()
        service.settings = settings

        db = AsyncMock()
        result_mock = MagicMock()
        result_mock.fetchall.return_value = [(r,) for r in roles]
        db.execute = AsyncMock(return_value=result_mock)
        db.commit = AsyncMock()
        service.db = db
        return service

    @pytest.mark.asyncio
    async def test_super_admin_email_always_gets_admin(self):
        service = self._make_service_with_org_roles(
            roles=[], super_admin_emails="superadmin@example.com"
        )
        user = _make_user_model(email="superadmin@example.com", is_admin=False)
        result = await service.sync_user_role_from_org(user)
        assert result.is_admin is True
        assert result.role == "admin"

    @pytest.mark.asyncio
    async def test_org_owner_gets_admin_role(self):
        service = self._make_service_with_org_roles(roles=["owner"])
        user = _make_user_model(is_admin=False)
        result = await service.sync_user_role_from_org(user)
        assert result.is_admin is True
        assert result.role == "admin"

    @pytest.mark.asyncio
    async def test_member_role_gets_user_role(self):
        service = self._make_service_with_org_roles(roles=["member"])
        user = _make_user_model(is_admin=True)
        result = await service.sync_user_role_from_org(user)
        assert result.is_admin is False
        assert result.role == "user"

    @pytest.mark.asyncio
    async def test_no_org_membership_gets_user_role(self):
        service = self._make_service_with_org_roles(roles=[])
        user = _make_user_model(is_admin=False)
        result = await service.sync_user_role_from_org(user)
        assert result.is_admin is False
        assert result.role == "user"
