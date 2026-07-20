from app.asset.models import MotorAsset


def test_requires_auth(client, make_asset):
    asset = make_asset()
    response = client.patch(f"/assets/{asset.id}", json={"name": "New Name"})
    assert response.status_code == 401


def test_returns_404_for_missing_asset(client, auth_header, make_user):
    user = make_user()
    response = client.patch(
        "/assets/999999", json={"name": "New Name"}, headers=auth_header(user)
    )
    assert response.status_code == 404
    assert response.get_json() == {"error": "Asset not found"}


def test_owner_can_update_name_description_location(
    client, auth_header, make_user, make_asset, db
):
    owner = make_user(username="owner1")
    asset = make_asset(owner=owner, name="Old Name", location="Old City")

    response = client.patch(
        f"/assets/{asset.id}",
        json={"name": "New Name", "description": "New description", "location": "New City"},
        headers=auth_header(owner),
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["name"] == "New Name"
    assert body["description"] == "New description"
    assert body["location"] == "New City"

    refreshed = db.session.get(MotorAsset, asset.id)
    assert refreshed.name == "New Name"
    assert refreshed.location == "New City"


def test_non_owner_gets_403(client, auth_header, make_user, make_asset):
    owner = make_user(username="owner1")
    other = make_user(username="other1")
    asset = make_asset(owner=owner, name="Old Name")

    response = client.patch(
        f"/assets/{asset.id}", json={"name": "Hacked Name"}, headers=auth_header(other)
    )

    assert response.status_code == 403


def test_403_does_not_apply_the_change(client, auth_header, make_user, make_asset, db):
    owner = make_user(username="owner1")
    other = make_user(username="other1")
    asset = make_asset(owner=owner, name="Old Name")

    client.patch(f"/assets/{asset.id}", json={"name": "Hacked Name"}, headers=auth_header(other))

    refreshed = db.session.get(MotorAsset, asset.id)
    assert refreshed.name == "Old Name"


def test_asset_with_no_owner_cannot_be_updated_by_anyone(
    client, auth_header, make_user, make_asset
):
    user = make_user()
    asset = make_asset(owner=None)

    response = client.patch(
        f"/assets/{asset.id}", json={"name": "New Name"}, headers=auth_header(user)
    )
    assert response.status_code == 403


def test_rejects_unknown_field(client, auth_header, make_user, make_asset):
    owner = make_user(username="owner1")
    asset = make_asset(owner=owner)

    response = client.patch(
        f"/assets/{asset.id}", json={"owner": "someone-else"}, headers=auth_header(owner)
    )
    assert response.status_code == 400
    assert response.get_json() == {"error": "Unsupported field(s): owner"}


def test_rejects_empty_name(client, auth_header, make_user, make_asset):
    owner = make_user(username="owner1")
    asset = make_asset(owner=owner)

    response = client.patch(
        f"/assets/{asset.id}", json={"name": ""}, headers=auth_header(owner)
    )
    assert response.status_code == 400


def test_partial_update_leaves_other_fields_untouched(
    client, auth_header, make_user, make_asset
):
    owner = make_user(username="owner1")
    asset = make_asset(owner=owner, name="Keep Me", location="Old City")

    response = client.patch(
        f"/assets/{asset.id}", json={"location": "New City"}, headers=auth_header(owner)
    )

    body = response.get_json()
    assert body["name"] == "Keep Me"
    assert body["location"] == "New City"


def test_admin_can_update_asset_owned_by_someone_else(
    client, auth_header, make_user, make_asset, db
):
    owner = make_user(username="owner1")
    admin = make_user(username="admin1", is_admin=True)
    asset = make_asset(owner=owner, name="Old Name")

    response = client.patch(
        f"/assets/{asset.id}", json={"name": "Admin Edited"}, headers=auth_header(admin)
    )

    assert response.status_code == 200
    refreshed = db.session.get(MotorAsset, asset.id)
    assert refreshed.name == "Admin Edited"


def test_admin_can_update_unowned_asset(client, auth_header, make_user, make_asset):
    admin = make_user(username="admin1", is_admin=True)
    asset = make_asset(owner=None)

    response = client.patch(
        f"/assets/{asset.id}", json={"name": "Admin Edited"}, headers=auth_header(admin)
    )

    assert response.status_code == 200


def test_admin_can_reassign_owner(client, auth_header, make_user, make_asset, db):
    admin = make_user(username="admin1", is_admin=True)
    old_owner = make_user(username="owner1")
    new_owner = make_user(username="owner2")
    asset = make_asset(owner=old_owner)

    response = client.patch(
        f"/assets/{asset.id}", json={"owner": "owner2"}, headers=auth_header(admin)
    )

    assert response.status_code == 200
    assert response.get_json()["owner"] == "owner2"
    refreshed = db.session.get(MotorAsset, asset.id)
    assert refreshed.owner_id == new_owner.id


def test_admin_can_unset_owner(client, auth_header, make_user, make_asset, db):
    admin = make_user(username="admin1", is_admin=True)
    owner = make_user(username="owner1")
    asset = make_asset(owner=owner)

    response = client.patch(
        f"/assets/{asset.id}", json={"owner": None}, headers=auth_header(admin)
    )

    assert response.status_code == 200
    assert response.get_json()["owner"] is None
    refreshed = db.session.get(MotorAsset, asset.id)
    assert refreshed.owner_id is None


def test_admin_reassign_to_unknown_username_is_400(client, auth_header, make_user, make_asset):
    admin = make_user(username="admin1", is_admin=True)
    asset = make_asset()

    response = client.patch(
        f"/assets/{asset.id}", json={"owner": "nobody"}, headers=auth_header(admin)
    )

    assert response.status_code == 400
    assert response.get_json() == {"error": "Unknown owner username: 'nobody'"}


def test_non_admin_non_owner_still_gets_403_even_with_owner_field(
    client, auth_header, make_user, make_asset
):
    owner = make_user(username="owner1")
    other = make_user(username="other1")
    asset = make_asset(owner=owner)

    response = client.patch(
        f"/assets/{asset.id}", json={"owner": "other1"}, headers=auth_header(other)
    )

    assert response.status_code == 403
