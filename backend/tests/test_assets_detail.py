def test_requires_auth(client, make_asset):
    asset = make_asset()
    response = client.get(f"/assets/{asset.id}")
    assert response.status_code == 401


def test_returns_404_for_missing_asset(client, auth_header, make_user):
    user = make_user()
    response = client.get("/assets/999999", headers=auth_header(user))
    assert response.status_code == 404


def test_returns_full_detail_shape(client, auth_header, make_user, make_asset):
    user = make_user()
    asset = make_asset(name="Test Motor", description="A description", location="Test City")

    response = client.get(f"/assets/{asset.id}", headers=auth_header(user))
    assert response.status_code == 200
    body = response.get_json()
    assert body["id"] == asset.id
    assert body["name"] == "Test Motor"
    assert body["description"] == "A description"
    assert body["location"] == "Test City"
    assert "created_at" in body
    assert body["sensor_metrics"] == []


def test_is_owner_true_for_owner(client, auth_header, make_user, make_asset):
    owner = make_user(username="owner1")
    asset = make_asset(owner=owner)

    response = client.get(f"/assets/{asset.id}", headers=auth_header(owner))
    body = response.get_json()
    assert body["is_owner"] is True
    assert body["owner"] == "owner1"


def test_is_owner_false_for_non_owner(client, auth_header, make_user, make_asset):
    owner = make_user(username="owner1")
    other = make_user(username="other1")
    asset = make_asset(owner=owner)

    response = client.get(f"/assets/{asset.id}", headers=auth_header(other))
    assert response.get_json()["is_owner"] is False


def test_includes_sensor_metrics(client, auth_header, make_user, make_asset, make_reading):
    user = make_user()
    asset = make_asset()
    make_reading(asset, metric="vibration_velocity", value=2.5, unit="mm/s")

    response = client.get(f"/assets/{asset.id}", headers=auth_header(user))
    metrics = response.get_json()["sensor_metrics"]
    assert len(metrics) == 1
    assert metrics[0]["metric"] == "vibration_velocity"
    assert metrics[0]["unit"] == "mm/s"
    assert metrics[0]["readings"][0]["value"] == 2.5
