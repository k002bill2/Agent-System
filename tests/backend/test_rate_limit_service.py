"""Tests for rate limit service."""

import pytest
import asyncio
from datetime import datetime

from models.rate_limit import RateLimitTier, RATE_LIMIT_TIERS
from services.rate_limit_service import RateLimitService


@pytest.fixture
def rate_limit_service():
    """Create a fresh rate limit service for testing."""
    return RateLimitService()


class TestRateLimitService:
    """Test cases for RateLimitService."""

    @pytest.mark.asyncio
    async def test_check_rate_limit_allows_request(self, rate_limit_service):
        """Test that first request is allowed."""
        result = await rate_limit_service.check_rate_limit(
            identifier="test-user",
            tier=RateLimitTier.FREE.value,
        )

        assert result.allowed is True
        assert result.tier == RateLimitTier.FREE.value
        assert result.minute_remaining >= 0

    @pytest.mark.asyncio
    async def test_enterprise_tier_unlimited(self, rate_limit_service):
        """Test that enterprise tier has no limits."""
        result = await rate_limit_service.check_rate_limit(
            identifier="enterprise-user",
            tier=RateLimitTier.ENTERPRISE.value,
        )

        assert result.allowed is True
        assert result.limit == -1
        assert result.remaining == -1

    @pytest.mark.asyncio
    async def test_rate_limit_exceeded(self, rate_limit_service):
        """Test that rate limit is enforced."""
        identifier = "rate-test-user"

        # Get the limit for free tier
        config = RATE_LIMIT_TIERS[RateLimitTier.FREE.value]

        # Make requests up to the limit
        for i in range(config.requests_per_minute):
            result = await rate_limit_service.check_rate_limit(
                identifier=identifier,
                tier=RateLimitTier.FREE.value,
            )
            assert result.allowed is True, f"Request {i+1} should be allowed"

        # Next request should be blocked
        result = await rate_limit_service.check_rate_limit(
            identifier=identifier,
            tier=RateLimitTier.FREE.value,
        )

        assert result.allowed is False
        assert result.retry_after is not None
        assert result.retry_after > 0

    @pytest.mark.asyncio
    async def test_get_status(self, rate_limit_service):
        """Test getting rate limit status."""
        identifier = "status-test-user"

        # Make some requests
        for _ in range(5):
            await rate_limit_service.check_rate_limit(identifier=identifier)

        status = await rate_limit_service.get_status(identifier)

        assert status.identifier == identifier
        assert status.minute_count == 5
        assert status.minute_remaining == RATE_LIMIT_TIERS[RateLimitTier.FREE.value].requests_per_minute - 5

    @pytest.mark.asyncio
    async def test_reset_limits(self, rate_limit_service):
        """Test resetting rate limits."""
        identifier = "reset-test-user"

        # Make some requests
        for _ in range(10):
            await rate_limit_service.check_rate_limit(identifier=identifier)

        # Reset
        success = await rate_limit_service.reset_limits(identifier)
        assert success is True

        # Status should be reset
        status = await rate_limit_service.get_status(identifier)
        assert status.minute_count == 0

    @pytest.mark.asyncio
    async def test_override(self, rate_limit_service):
        """Test rate limit override."""
        from models.rate_limit import RateLimitOverride

        identifier = "override-test-user"

        # Set override to enterprise tier
        override = RateLimitOverride(
            identifier=identifier,
            tier=RateLimitTier.ENTERPRISE.value,
            reason="Test override",
        )
        rate_limit_service.set_override(override)

        # Should use enterprise tier now
        result = await rate_limit_service.check_rate_limit(
            identifier=identifier,
            tier=RateLimitTier.FREE.value,  # Original tier
        )

        assert result.tier == RateLimitTier.ENTERPRISE.value
        assert result.limit == -1

    def test_list_tiers(self, rate_limit_service):
        """Test listing all tiers."""
        tiers = rate_limit_service.list_tiers()

        assert "free" in tiers
        assert "starter" in tiers
        assert "professional" in tiers
        assert "enterprise" in tiers

        # Check free tier config
        free = tiers["free"]
        assert free.requests_per_minute == 60
        assert free.requests_per_hour == 1000


class TestRateLimitTierConfig:
    """Test rate limit tier configurations."""

    def test_tier_limits_are_reasonable(self):
        """Test that tier limits make sense."""
        tiers = RATE_LIMIT_TIERS

        # Each higher tier should have higher limits
        assert tiers["starter"].requests_per_minute > tiers["free"].requests_per_minute
        assert tiers["professional"].requests_per_minute > tiers["starter"].requests_per_minute

        # Enterprise should be unlimited
        assert tiers["enterprise"].requests_per_minute == -1
        assert tiers["enterprise"].requests_per_hour == -1

    def test_all_tiers_have_required_fields(self):
        """Test that all tiers have required configuration."""
        for tier_name, config in RATE_LIMIT_TIERS.items():
            assert config.name is not None
            assert config.requests_per_minute is not None
            assert config.requests_per_hour is not None
            assert config.burst_limit is not None
