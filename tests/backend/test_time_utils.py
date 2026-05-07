"""Tests for utils.time display-timezone helpers."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from utils.time import display_tz, to_display_tz


class TestDisplayTz:
    def test_default_is_seoul(self, monkeypatch):
        monkeypatch.delenv("HEATMAP_DISPLAY_TZ", raising=False)
        assert display_tz() == ZoneInfo("Asia/Seoul")

    def test_env_override_uses_provided_zone(self, monkeypatch):
        monkeypatch.setenv("HEATMAP_DISPLAY_TZ", "America/Los_Angeles")
        assert display_tz() == ZoneInfo("America/Los_Angeles")

    def test_invalid_env_falls_back_to_default(self, monkeypatch):
        monkeypatch.setenv("HEATMAP_DISPLAY_TZ", "Not/A_Real_Zone")
        assert display_tz() == ZoneInfo("Asia/Seoul")

    def test_blank_env_falls_back_to_default(self, monkeypatch):
        monkeypatch.setenv("HEATMAP_DISPLAY_TZ", "   ")
        assert display_tz() == ZoneInfo("Asia/Seoul")


class TestToDisplayTz:
    def test_naive_input_treated_as_utc(self, monkeypatch):
        monkeypatch.setenv("HEATMAP_DISPLAY_TZ", "Asia/Seoul")
        # 2026-05-02 00:00 UTC → KST 09:00 same date
        local = to_display_tz(datetime(2026, 5, 2, 0, 0))
        assert local.hour == 9
        assert local.day == 2

    def test_aware_input_converts_to_display(self, monkeypatch):
        monkeypatch.setenv("HEATMAP_DISPLAY_TZ", "Asia/Seoul")
        utc_aware = datetime(2026, 5, 1, 22, 0, tzinfo=UTC)
        local = to_display_tz(utc_aware)
        # UTC 22:00 = KST 07:00 next day
        assert local.day == 2
        assert local.hour == 7
