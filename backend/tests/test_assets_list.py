def test_requires_auth(client):
    response = client.get("/assets")
    assert response.status_code == 401


def test_returns_paginated_shape(client, auth_header, make_user, make_asset):
    user = make_user()
    for i in range(3):
        make_asset(name=f"Motor {i}")

    response = client.get("/assets", headers=auth_header(user))
    assert response.status_code == 200
    body = response.get_json()
    assert body["total"] == 3
    assert body["page"] == 1
    assert body["per_page"] == 20
    assert body["total_pages"] == 1
    assert len(body["assets"]) == 3
    assert set(body["assets"][0].keys()) == {"id", "name", "location", "is_owner"}


def test_per_page_is_respected(client, auth_header, make_user, make_asset):
    user = make_user()
    for i in range(5):
        make_asset(name=f"Motor {i}")

    response = client.get("/assets?per_page=2", headers=auth_header(user))
    body = response.get_json()
    assert len(body["assets"]) == 2
    assert body["total_pages"] == 3


def test_per_page_is_capped_at_200(client, auth_header, make_user, make_asset):
    user = make_user()
    make_asset()

    response = client.get("/assets?per_page=9999", headers=auth_header(user))
    assert response.get_json()["per_page"] == 200


def test_page_param_paginates(client, auth_header, make_user, make_asset):
    user = make_user()
    make_asset(name="Alpha Motor")
    make_asset(name="Beta Motor")

    page1 = client.get("/assets?per_page=1&page=1", headers=auth_header(user)).get_json()
    page2 = client.get("/assets?per_page=1&page=2", headers=auth_header(user)).get_json()
    assert page1["assets"][0]["name"] == "Alpha Motor"
    assert page2["assets"][0]["name"] == "Beta Motor"


def test_is_owner_reflects_current_user(client, auth_header, make_user, make_asset):
    owner = make_user(username="owner1")
    other = make_user(username="other1")
    make_asset(name="Owned Motor", owner=owner)

    as_owner = client.get("/assets", headers=auth_header(owner)).get_json()
    as_other = client.get("/assets", headers=auth_header(other)).get_json()

    assert as_owner["assets"][0]["is_owner"] is True
    assert as_other["assets"][0]["is_owner"] is False


def test_owned_assets_sort_before_non_owned_across_all_pages(
    client, auth_header, make_user, make_asset
):
    owner = make_user(username="owner1")
    make_asset(name="Zulu Owned", owner=owner)
    make_asset(name="Alpha Not Owned", owner=None)
    make_asset(name="Bravo Owned", owner=owner)
    make_asset(name="Yankee Not Owned", owner=None)

    response = client.get("/assets?per_page=200", headers=auth_header(owner))
    assets = response.get_json()["assets"]

    flags = [a["is_owner"] for a in assets]
    assert flags == sorted(flags, key=lambda owned: not owned), (
        "all owned assets should precede all non-owned assets"
    )
    # Alphabetical within the owned group.
    owned_names = [a["name"] for a in assets if a["is_owner"]]
    assert owned_names == sorted(owned_names)
