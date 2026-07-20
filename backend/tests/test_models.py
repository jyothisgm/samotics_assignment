from app.user.models import User


class TestUserPassword:
    def test_check_password_correct(self):
        user = User(username="someuser")
        user.set_password("password123")
        assert user.check_password("password123") is True

    def test_check_password_incorrect(self):
        user = User(username="someuser")
        user.set_password("password123")
        assert user.check_password("wrong") is False

    def test_password_is_hashed(self):
        user = User(username="someuser")
        user.set_password("password123")
        assert user.password_hash != "password123"


class TestIsOwnedBy:
    def test_true_when_username_matches_owner(self, make_asset, make_user):
        owner = make_user(username="owner1")
        asset = make_asset(owner=owner)
        assert asset.is_owned_by("owner1") is True

    def test_false_when_username_does_not_match(self, make_asset, make_user):
        owner = make_user(username="owner1")
        make_user(username="someoneelse")
        asset = make_asset(owner=owner)
        assert asset.is_owned_by("someoneelse") is False

    def test_false_when_asset_has_no_owner(self, make_asset):
        asset = make_asset(owner=None)
        assert asset.is_owned_by("anyone") is False

    def test_false_when_current_username_is_none(self, make_asset, make_user):
        owner = make_user(username="owner1")
        asset = make_asset(owner=owner)
        assert asset.is_owned_by(None) is False


class TestToSummaryDict:
    def test_shape(self, make_asset):
        asset = make_asset(name="Test Motor", location="Test City")
        summary = asset.to_summary_dict()
        assert summary == {
            "id": asset.id,
            "name": "Test Motor",
            "location": "Test City",
            "is_owner": False,
        }

    def test_is_owner_true_for_matching_username(self, make_asset, make_user):
        owner = make_user(username="owner1")
        asset = make_asset(owner=owner)
        assert asset.to_summary_dict("owner1")["is_owner"] is True

    def test_does_not_leak_description_or_owner(self, make_asset, make_user):
        owner = make_user(username="owner1")
        asset = make_asset(owner=owner, description="Secret internal notes")
        summary = asset.to_summary_dict("owner1")
        assert "description" not in summary
        assert "owner" not in summary


class TestToDetailDict:
    def test_shape(self, make_asset, make_user):
        owner = make_user(username="owner1")
        asset = make_asset(name="Test Motor", owner=owner)
        detail = asset.to_detail_dict("owner1")
        assert detail["id"] == asset.id
        assert detail["name"] == "Test Motor"
        assert detail["owner"] == "owner1"
        assert detail["is_owner"] is True
        assert detail["sensor_metrics"] == []

    def test_owner_is_null_when_unassigned(self, make_asset):
        asset = make_asset(owner=None)
        detail = asset.to_detail_dict()
        assert detail["owner"] is None
        assert detail["is_owner"] is False

    def test_sensor_metrics_grouped_by_metric_in_timestamp_order(
        self, make_asset, make_reading
    ):
        from datetime import datetime, timedelta, timezone

        asset = make_asset()
        t0 = datetime.now(timezone.utc)
        make_reading(asset, metric="vibration_velocity", value=3.0, timestamp=t0 + timedelta(hours=1))
        make_reading(asset, metric="vibration_velocity", value=1.0, timestamp=t0)
        make_reading(asset, metric="current_draw", value=9.0, timestamp=t0, unit="A")

        detail = asset.to_detail_dict()
        by_metric = {series["metric"]: series for series in detail["sensor_metrics"]}

        assert set(by_metric) == {"vibration_velocity", "current_draw"}
        vibration_values = [r["value"] for r in by_metric["vibration_velocity"]["readings"]]
        assert vibration_values == [1.0, 3.0]
        assert by_metric["current_draw"]["unit"] == "A"
