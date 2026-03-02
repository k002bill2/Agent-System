"""Unit tests for notification_service.py."""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from models.notification import (
    ChannelConfig,
    NotificationChannel,
    NotificationCondition,
    NotificationEventType,
    NotificationMessage,
    NotificationPriority,
    NotificationRule,
    NotificationRuleCreate,
    NotificationRuleUpdate,
)
from services.notification_service import (
    DiscordAdapter,
    NotificationService,
    SlackAdapter,
    WebhookAdapter,
    _rules,
    _notification_history,
    notify_task_completed,
    notify_task_failed,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_rule_create(
    name: str = "Test Rule",
    event_type: NotificationEventType = NotificationEventType.TASK_COMPLETED,
    channels: list[NotificationChannel] | None = None,
    conditions: list[NotificationCondition] | None = None,
    project_ids: list[str] | None = None,
    priority: NotificationPriority = NotificationPriority.MEDIUM,
) -> NotificationRuleCreate:
    return NotificationRuleCreate(
        name=name,
        event_type=event_type,
        channels=channels or [NotificationChannel.SLACK],
        conditions=conditions or [],
        project_ids=project_ids or [],
        priority=priority,
    )


def _make_channel_config(
    channel: NotificationChannel = NotificationChannel.SLACK,
    enabled: bool = True,
    webhook_url: str | None = "https://hooks.example.com/test",
    rate_limit_per_hour: int = 60,
    sent_this_hour: int = 0,
    last_sent: datetime | None = None,
) -> ChannelConfig:
    return ChannelConfig(
        channel=channel,
        enabled=enabled,
        webhook_url=webhook_url,
        rate_limit_per_hour=rate_limit_per_hour,
        sent_this_hour=sent_this_hour,
        last_sent=last_sent,
    )


# ---------------------------------------------------------------------------
# CRUD – In-memory
# ---------------------------------------------------------------------------

class TestNotificationServiceCRUD:
    """Tests for in-memory CRUD operations."""

    def setup_method(self):
        """Clear in-memory state before every test."""
        _rules.clear()
        _notification_history.clear()

    # --- create_rule ---

    def test_create_rule_stores_rule(self):
        """create_rule persists the rule in the in-memory store."""
        data = _make_rule_create(name="My Rule")
        rule = NotificationService.create_rule(data)

        assert rule.id in _rules
        assert _rules[rule.id] is rule
        assert rule.name == "My Rule"

    def test_create_rule_returns_notification_rule(self):
        """create_rule returns a NotificationRule instance."""
        data = _make_rule_create()
        rule = NotificationService.create_rule(data)

        assert isinstance(rule, NotificationRule)
        assert rule.enabled is True

    def test_create_rule_assigns_unique_ids(self):
        """Two rules created from the same data receive distinct IDs."""
        data = _make_rule_create()
        rule1 = NotificationService.create_rule(data)
        rule2 = NotificationService.create_rule(data)

        assert rule1.id != rule2.id

    # --- get_rules ---

    def test_get_rules_empty_initially(self):
        """get_rules returns an empty list when no rules exist."""
        assert NotificationService.get_rules() == []

    def test_get_rules_returns_all_rules(self):
        """get_rules returns all stored rules."""
        NotificationService.create_rule(_make_rule_create(name="Rule A"))
        NotificationService.create_rule(_make_rule_create(name="Rule B"))

        rules = NotificationService.get_rules()
        assert len(rules) == 2
        names = {r.name for r in rules}
        assert names == {"Rule A", "Rule B"}

    # --- get_rule ---

    def test_get_rule_returns_rule_by_id(self):
        """get_rule retrieves a specific rule by its ID."""
        rule = NotificationService.create_rule(_make_rule_create(name="Find Me"))
        found = NotificationService.get_rule(rule.id)

        assert found is not None
        assert found.id == rule.id
        assert found.name == "Find Me"

    def test_get_rule_returns_none_for_unknown_id(self):
        """get_rule returns None when the ID does not exist."""
        assert NotificationService.get_rule("nonexistent-id") is None

    # --- update_rule ---

    def test_update_rule_modifies_fields(self):
        """update_rule applies partial updates to an existing rule."""
        rule = NotificationService.create_rule(_make_rule_create(name="Original"))
        update = NotificationRuleUpdate(name="Updated", enabled=False)

        updated = NotificationService.update_rule(rule.id, update)

        assert updated is not None
        assert updated.name == "Updated"
        assert updated.enabled is False

    def test_update_rule_returns_none_for_missing_rule(self):
        """update_rule returns None when the rule does not exist."""
        result = NotificationService.update_rule("no-such-id", NotificationRuleUpdate())
        assert result is None

    def test_update_rule_ignores_none_fields(self):
        """update_rule skips fields that are None in the update payload."""
        rule = NotificationService.create_rule(
            _make_rule_create(name="Keep Name", priority=NotificationPriority.HIGH)
        )
        update = NotificationRuleUpdate(enabled=False)  # name/priority not set

        updated = NotificationService.update_rule(rule.id, update)

        assert updated.name == "Keep Name"
        assert updated.priority == NotificationPriority.HIGH
        assert updated.enabled is False

    # --- delete_rule ---

    def test_delete_rule_removes_rule(self):
        """delete_rule removes the rule from the store and returns True."""
        rule = NotificationService.create_rule(_make_rule_create())
        result = NotificationService.delete_rule(rule.id)

        assert result is True
        assert rule.id not in _rules

    def test_delete_rule_returns_false_for_missing_rule(self):
        """delete_rule returns False when the rule does not exist."""
        assert NotificationService.delete_rule("ghost-id") is False


# ---------------------------------------------------------------------------
# Condition / Project filter checks
# ---------------------------------------------------------------------------

class TestCheckConditions:
    """Tests for _check_conditions."""

    def setup_method(self):
        _rules.clear()
        _notification_history.clear()

    def _rule_with_conditions(self, conditions: list[NotificationCondition]) -> NotificationRule:
        return NotificationRule(
            name="Rule",
            event_type=NotificationEventType.TASK_COMPLETED,
            channels=[NotificationChannel.SLACK],
            conditions=conditions,
        )

    def test_no_conditions_always_passes(self):
        """A rule with no conditions always matches any data dict."""
        rule = self._rule_with_conditions([])
        assert NotificationService._check_conditions(rule, {}) is True
        assert NotificationService._check_conditions(rule, {"foo": "bar"}) is True

    def test_equals_operator_match(self):
        """equals condition passes when field value is equal."""
        rule = self._rule_with_conditions([
            NotificationCondition(field="status", operator="equals", value="done")
        ])
        assert NotificationService._check_conditions(rule, {"status": "done"}) is True

    def test_equals_operator_no_match(self):
        """equals condition fails when field value differs."""
        rule = self._rule_with_conditions([
            NotificationCondition(field="status", operator="equals", value="done")
        ])
        assert NotificationService._check_conditions(rule, {"status": "pending"}) is False

    def test_contains_operator_match(self):
        """contains condition passes when substring is found."""
        rule = self._rule_with_conditions([
            NotificationCondition(field="message", operator="contains", value="error")
        ])
        assert NotificationService._check_conditions(rule, {"message": "fatal error occurred"}) is True

    def test_contains_operator_no_match(self):
        """contains condition fails when substring is absent."""
        rule = self._rule_with_conditions([
            NotificationCondition(field="message", operator="contains", value="error")
        ])
        assert NotificationService._check_conditions(rule, {"message": "all good"}) is False

    def test_greater_than_operator_match(self):
        """greater_than condition passes when value is larger."""
        rule = self._rule_with_conditions([
            NotificationCondition(field="cost", operator="greater_than", value=10.0)
        ])
        assert NotificationService._check_conditions(rule, {"cost": 15.0}) is True

    def test_greater_than_operator_no_match(self):
        """greater_than condition fails when value is smaller or equal."""
        rule = self._rule_with_conditions([
            NotificationCondition(field="cost", operator="greater_than", value=10.0)
        ])
        assert NotificationService._check_conditions(rule, {"cost": 5.0}) is False
        assert NotificationService._check_conditions(rule, {"cost": 10.0}) is False

    def test_less_than_operator_match(self):
        """less_than condition passes when value is smaller."""
        rule = self._rule_with_conditions([
            NotificationCondition(field="score", operator="less_than", value=50)
        ])
        assert NotificationService._check_conditions(rule, {"score": 30}) is True

    def test_less_than_operator_no_match(self):
        """less_than condition fails when value is equal or larger."""
        rule = self._rule_with_conditions([
            NotificationCondition(field="score", operator="less_than", value=50)
        ])
        assert NotificationService._check_conditions(rule, {"score": 50}) is False
        assert NotificationService._check_conditions(rule, {"score": 70}) is False

    def test_missing_field_fails(self):
        """A condition whose field is absent in data returns False."""
        rule = self._rule_with_conditions([
            NotificationCondition(field="missing_key", operator="equals", value="x")
        ])
        assert NotificationService._check_conditions(rule, {}) is False

    def test_multiple_conditions_all_must_pass(self):
        """All conditions must be satisfied for the overall check to pass."""
        rule = self._rule_with_conditions([
            NotificationCondition(field="status", operator="equals", value="done"),
            NotificationCondition(field="cost", operator="greater_than", value=5.0),
        ])
        assert NotificationService._check_conditions(
            rule, {"status": "done", "cost": 10.0}
        ) is True
        assert NotificationService._check_conditions(
            rule, {"status": "done", "cost": 1.0}
        ) is False


class TestCheckRateLimit:
    """Tests for _check_rate_limit."""

    def test_allows_when_under_limit(self):
        """Returns True when sent_this_hour is below the limit."""
        config = _make_channel_config(rate_limit_per_hour=60, sent_this_hour=0)
        assert NotificationService._check_rate_limit(config) is True

    def test_blocks_when_at_limit(self):
        """Returns False when sent_this_hour has reached the limit."""
        config = _make_channel_config(rate_limit_per_hour=5, sent_this_hour=5)
        assert NotificationService._check_rate_limit(config) is False

    def test_resets_counter_after_one_hour(self):
        """Resets sent_this_hour to 0 when more than one hour has elapsed."""
        old_time = datetime.now(timezone.utc) - timedelta(hours=2)
        config = _make_channel_config(
            rate_limit_per_hour=5,
            sent_this_hour=5,
            last_sent=old_time,
        )
        # Counter must be reset, so sending should be allowed
        result = NotificationService._check_rate_limit(config)
        assert result is True
        assert config.sent_this_hour == 0

    def test_does_not_reset_within_one_hour(self):
        """Does not reset sent_this_hour when last_sent is within the hour."""
        recent = datetime.now(timezone.utc) - timedelta(minutes=30)
        config = _make_channel_config(
            rate_limit_per_hour=5,
            sent_this_hour=5,
            last_sent=recent,
        )
        assert NotificationService._check_rate_limit(config) is False


class TestCheckProjectFilter:
    """Tests for _check_project_filter."""

    def _rule(self, project_ids: list[str]) -> NotificationRule:
        return NotificationRule(
            name="Rule",
            event_type=NotificationEventType.TASK_COMPLETED,
            channels=[NotificationChannel.SLACK],
            project_ids=project_ids,
        )

    def test_empty_project_ids_allows_all(self):
        """Empty project_ids means no filtering — all project_ids pass."""
        rule = self._rule([])
        assert NotificationService._check_project_filter(rule, "proj-abc") is True
        assert NotificationService._check_project_filter(rule, None) is True

    def test_specific_project_id_matches(self):
        """Rule with specific IDs passes when the event's project_id is listed."""
        rule = self._rule(["proj-1", "proj-2"])
        assert NotificationService._check_project_filter(rule, "proj-1") is True

    def test_specific_project_id_no_match(self):
        """Rule with specific IDs rejects events from unlisted projects."""
        rule = self._rule(["proj-1"])
        assert NotificationService._check_project_filter(rule, "proj-999") is False

    def test_none_project_id_always_passes(self):
        """Events without a project_id always pass the project filter."""
        rule = self._rule(["proj-1"])
        assert NotificationService._check_project_filter(rule, None) is True


# ---------------------------------------------------------------------------
# Adapters
# ---------------------------------------------------------------------------

class TestSlackAdapter:
    """Tests for SlackAdapter.send."""

    @pytest.mark.asyncio
    async def test_returns_error_when_no_webhook_url(self):
        """send returns (False, error_msg) when webhook_url is not configured."""
        adapter = SlackAdapter()
        config = _make_channel_config(webhook_url=None)
        message = NotificationMessage(
            event_type=NotificationEventType.TASK_COMPLETED,
            title="Test",
            body="body",
            channels=[NotificationChannel.SLACK],
        )

        success, error = await adapter.send(message, config)

        assert success is False
        assert error is not None
        assert "webhook" in error.lower()

    @pytest.mark.asyncio
    async def test_sends_successfully_on_200(self):
        """send returns (True, None) when the Slack API responds with 200."""
        adapter = SlackAdapter()
        config = _make_channel_config(webhook_url="https://hooks.slack.com/test")
        message = NotificationMessage(
            event_type=NotificationEventType.TASK_COMPLETED,
            title="Task Done",
            body="All finished",
            channels=[NotificationChannel.SLACK],
        )

        mock_response = MagicMock()
        mock_response.status_code = 200

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.notification_service.httpx.AsyncClient", return_value=mock_client):
            success, error = await adapter.send(message, config)

        assert success is True
        assert error is None

    @pytest.mark.asyncio
    async def test_returns_error_on_non_200(self):
        """send returns (False, error_msg) when Slack API returns non-200."""
        adapter = SlackAdapter()
        config = _make_channel_config(webhook_url="https://hooks.slack.com/test")
        message = NotificationMessage(
            event_type=NotificationEventType.TASK_COMPLETED,
            title="Test",
            body="body",
            channels=[NotificationChannel.SLACK],
        )

        mock_response = MagicMock()
        mock_response.status_code = 403

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.notification_service.httpx.AsyncClient", return_value=mock_client):
            success, error = await adapter.send(message, config)

        assert success is False
        assert "403" in error

    @pytest.mark.asyncio
    async def test_returns_error_on_exception(self):
        """send catches network exceptions and returns (False, str(e))."""
        adapter = SlackAdapter()
        config = _make_channel_config(webhook_url="https://hooks.slack.com/test")
        message = NotificationMessage(
            event_type=NotificationEventType.TASK_COMPLETED,
            title="Test",
            body="body",
            channels=[NotificationChannel.SLACK],
        )

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(side_effect=Exception("connection refused"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.notification_service.httpx.AsyncClient", return_value=mock_client):
            success, error = await adapter.send(message, config)

        assert success is False
        assert "connection refused" in error


class TestDiscordAdapter:
    """Tests for DiscordAdapter.send."""

    @pytest.mark.asyncio
    async def test_returns_error_when_no_webhook_url(self):
        """send returns (False, error_msg) when webhook_url is not configured."""
        adapter = DiscordAdapter()
        config = _make_channel_config(channel=NotificationChannel.DISCORD, webhook_url=None)
        message = NotificationMessage(
            event_type=NotificationEventType.TASK_FAILED,
            title="Failed",
            body="oops",
            channels=[NotificationChannel.DISCORD],
        )

        success, error = await adapter.send(message, config)

        assert success is False
        assert error is not None

    @pytest.mark.asyncio
    async def test_sends_successfully_on_204(self):
        """send returns (True, None) when Discord API responds with 204."""
        adapter = DiscordAdapter()
        config = _make_channel_config(
            channel=NotificationChannel.DISCORD,
            webhook_url="https://discord.com/api/webhooks/test",
        )
        message = NotificationMessage(
            event_type=NotificationEventType.TASK_COMPLETED,
            title="Done",
            body="All good",
            channels=[NotificationChannel.DISCORD],
        )

        mock_response = MagicMock()
        mock_response.status_code = 204

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.notification_service.httpx.AsyncClient", return_value=mock_client):
            success, error = await adapter.send(message, config)

        assert success is True
        assert error is None

    @pytest.mark.asyncio
    async def test_returns_error_on_non_200_204(self):
        """send returns (False, error_msg) when Discord returns an error code."""
        adapter = DiscordAdapter()
        config = _make_channel_config(
            channel=NotificationChannel.DISCORD,
            webhook_url="https://discord.com/api/webhooks/test",
        )
        message = NotificationMessage(
            event_type=NotificationEventType.TASK_COMPLETED,
            title="Test",
            body="body",
            channels=[NotificationChannel.DISCORD],
        )

        mock_response = MagicMock()
        mock_response.status_code = 500

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.notification_service.httpx.AsyncClient", return_value=mock_client):
            success, error = await adapter.send(message, config)

        assert success is False
        assert "500" in error


class TestWebhookAdapter:
    """Tests for WebhookAdapter.send."""

    @pytest.mark.asyncio
    async def test_returns_error_when_no_webhook_url(self):
        """send returns (False, error_msg) when webhook_url is not configured."""
        adapter = WebhookAdapter()
        config = _make_channel_config(channel=NotificationChannel.WEBHOOK, webhook_url=None)
        message = NotificationMessage(
            event_type=NotificationEventType.ERROR_OCCURRED,
            title="Error",
            body="something broke",
            channels=[NotificationChannel.WEBHOOK],
        )

        success, error = await adapter.send(message, config)

        assert success is False
        assert error is not None

    @pytest.mark.asyncio
    async def test_sends_successfully_on_200(self):
        """send returns (True, None) when the webhook responds with 200."""
        adapter = WebhookAdapter()
        config = _make_channel_config(
            channel=NotificationChannel.WEBHOOK,
            webhook_url="https://my-server.example.com/hook",
        )
        message = NotificationMessage(
            event_type=NotificationEventType.ERROR_OCCURRED,
            title="Error",
            body="something broke",
            channels=[NotificationChannel.WEBHOOK],
        )

        mock_response = MagicMock()
        mock_response.status_code = 200

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.notification_service.httpx.AsyncClient", return_value=mock_client):
            success, error = await adapter.send(message, config)

        assert success is True
        assert error is None


# ---------------------------------------------------------------------------
# send_notification (in-memory rules path)
# ---------------------------------------------------------------------------

class TestSendNotification:
    """Tests for NotificationService.send_notification (in-memory)."""

    def setup_method(self):
        _rules.clear()
        _notification_history.clear()

    @pytest.mark.asyncio
    async def test_returns_empty_message_when_no_rules_and_no_force_channels(self):
        """When no rules match and no force_channels, returns message with empty channels."""
        msg = await NotificationService.send_notification(
            NotificationEventType.TASK_COMPLETED,
            {"task_title": "My Task"},
        )

        assert msg.channels == []
        assert msg.event_type == NotificationEventType.TASK_COMPLETED

    @pytest.mark.asyncio
    async def test_force_channels_bypasses_rules(self):
        """force_channels parameter causes delivery attempt even without matching rules."""
        mock_response = MagicMock()
        mock_response.status_code = 200

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        slack_config = _make_channel_config(
            channel=NotificationChannel.SLACK,
            webhook_url="https://hooks.slack.com/test",
        )

        with patch(
            "services.notification_service.NotificationService.get_channel_config",
            return_value=slack_config,
        ), patch("services.notification_service.httpx.AsyncClient", return_value=mock_client):
            msg = await NotificationService.send_notification(
                NotificationEventType.TASK_COMPLETED,
                {"task_title": "My Task"},
                force_channels=[NotificationChannel.SLACK],
            )

        assert NotificationChannel.SLACK in msg.channels
        assert msg.delivery_status.get("slack") == "sent"

    @pytest.mark.asyncio
    async def test_disabled_channel_gets_disabled_status(self):
        """When channel config is disabled, delivery_status is 'disabled'."""
        rule_create = _make_rule_create(
            event_type=NotificationEventType.TASK_COMPLETED,
            channels=[NotificationChannel.SLACK],
        )
        NotificationService.create_rule(rule_create)

        disabled_config = _make_channel_config(enabled=False)

        with patch(
            "services.notification_service.NotificationService.get_channel_config",
            return_value=disabled_config,
        ):
            msg = await NotificationService.send_notification(
                NotificationEventType.TASK_COMPLETED,
                {},
            )

        assert msg.delivery_status.get("slack") == "disabled"

    @pytest.mark.asyncio
    async def test_rate_limited_channel_gets_rate_limited_status(self):
        """When rate limit is exceeded, delivery_status is 'rate_limited'."""
        rule_create = _make_rule_create(
            event_type=NotificationEventType.TASK_COMPLETED,
            channels=[NotificationChannel.SLACK],
        )
        NotificationService.create_rule(rule_create)

        rate_limited_config = _make_channel_config(
            rate_limit_per_hour=5,
            sent_this_hour=5,
        )

        with patch(
            "services.notification_service.NotificationService.get_channel_config",
            return_value=rate_limited_config,
        ):
            msg = await NotificationService.send_notification(
                NotificationEventType.TASK_COMPLETED,
                {},
            )

        assert msg.delivery_status.get("slack") == "rate_limited"

    @pytest.mark.asyncio
    async def test_message_appended_to_history(self):
        """send_notification appends the message to history when rules match or force_channels is set."""
        assert len(_notification_history) == 0

        # Create a matching rule so the send path (not the early-return path) is taken.
        rule_create = _make_rule_create(
            event_type=NotificationEventType.TASK_FAILED,
            channels=[NotificationChannel.SLACK],
        )
        NotificationService.create_rule(rule_create)

        disabled_config = _make_channel_config(enabled=False)

        with patch(
            "services.notification_service.NotificationService.get_channel_config",
            return_value=disabled_config,
        ):
            await NotificationService.send_notification(
                NotificationEventType.TASK_FAILED,
                {"task_title": "Some Task"},
            )

        assert len(_notification_history) == 1

    @pytest.mark.asyncio
    async def test_disabled_rule_is_not_matched(self):
        """Disabled rules are ignored when finding matches."""
        rule_create = _make_rule_create(
            event_type=NotificationEventType.TASK_COMPLETED,
            channels=[NotificationChannel.SLACK],
        )
        rule = NotificationService.create_rule(rule_create)
        NotificationService.update_rule(rule.id, NotificationRuleUpdate(enabled=False))

        msg = await NotificationService.send_notification(
            NotificationEventType.TASK_COMPLETED,
            {},
        )

        assert msg.channels == []

    @pytest.mark.asyncio
    async def test_rule_with_mismatched_event_type_not_matched(self):
        """A rule for TASK_FAILED is not matched when TASK_COMPLETED fires."""
        rule_create = _make_rule_create(
            event_type=NotificationEventType.TASK_FAILED,
            channels=[NotificationChannel.SLACK],
        )
        NotificationService.create_rule(rule_create)

        msg = await NotificationService.send_notification(
            NotificationEventType.TASK_COMPLETED,
            {},
        )

        assert msg.channels == []


# ---------------------------------------------------------------------------
# Convenience functions
# ---------------------------------------------------------------------------

class TestConvenienceFunctions:
    """Tests for notify_task_completed and notify_task_failed."""

    def setup_method(self):
        _rules.clear()
        _notification_history.clear()

    @pytest.mark.asyncio
    async def test_notify_task_completed_calls_send_notification(self):
        """notify_task_completed delegates to NotificationService.send_notification."""
        with patch(
            "services.notification_service.NotificationService.send_notification",
            new_callable=AsyncMock,
        ) as mock_send:
            mock_send.return_value = MagicMock()

            await notify_task_completed(
                session_id="sess-1",
                task_id="task-42",
                task_title="Deploy Service",
            )

            mock_send.assert_awaited_once()
            call_args = mock_send.call_args
            assert call_args[0][0] == NotificationEventType.TASK_COMPLETED
            data_arg = call_args[0][1]
            assert data_arg["session_id"] == "sess-1"
            assert data_arg["task_id"] == "task-42"
            assert data_arg["task_title"] == "Deploy Service"

    @pytest.mark.asyncio
    async def test_notify_task_failed_calls_send_notification(self):
        """notify_task_failed delegates to NotificationService.send_notification."""
        with patch(
            "services.notification_service.NotificationService.send_notification",
            new_callable=AsyncMock,
        ) as mock_send:
            mock_send.return_value = MagicMock()

            await notify_task_failed(
                session_id="sess-2",
                task_id="task-99",
                task_title="Run Tests",
                error="Assertion error",
            )

            mock_send.assert_awaited_once()
            call_args = mock_send.call_args
            assert call_args[0][0] == NotificationEventType.TASK_FAILED
            data_arg = call_args[0][1]
            assert data_arg["error"] == "Assertion error"
            assert data_arg["task_title"] == "Run Tests"


# ---------------------------------------------------------------------------
# Notification history helpers
# ---------------------------------------------------------------------------

class TestNotificationHistory:
    """Tests for get_history and clear_history."""

    def setup_method(self):
        _rules.clear()
        _notification_history.clear()

    def test_get_history_returns_empty_initially(self):
        assert NotificationService.get_history() == []

    def test_clear_history_returns_count_and_empties_list(self):
        _notification_history.append(
            NotificationMessage(
                event_type=NotificationEventType.TASK_COMPLETED,
                title="T",
                body="",
                channels=[],
            )
        )
        _notification_history.append(
            NotificationMessage(
                event_type=NotificationEventType.TASK_FAILED,
                title="T2",
                body="",
                channels=[],
            )
        )

        count = NotificationService.clear_history()

        assert count == 2
        assert NotificationService.get_history() == []

    def test_get_history_respects_limit(self):
        """get_history(limit=N) returns at most the last N messages."""
        for i in range(10):
            _notification_history.append(
                NotificationMessage(
                    event_type=NotificationEventType.TASK_COMPLETED,
                    title=f"Task {i}",
                    body="",
                    channels=[],
                )
            )

        result = NotificationService.get_history(limit=3)

        assert len(result) == 3
        # Verify they are the last 3
        assert result[0].title == "Task 7"
        assert result[2].title == "Task 9"
