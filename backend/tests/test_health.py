def test_health_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_health_does_not_require_auth(client):
    response = client.get("/health")
    assert response.status_code != 401
