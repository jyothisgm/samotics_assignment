from app.user.models import User


class TestRegister:
    def test_register_creates_user_and_returns_token(self, client, db):
        response = client.post(
            "/auth/register", json={"username": "newuser", "password": "password123"}
        )
        assert response.status_code == 201
        body = response.get_json()
        assert "access_token" in body
        assert User.query.filter_by(username="newuser").first() is not None

    def test_register_returns_user_info(self, client):
        response = client.post(
            "/auth/register", json={"username": "newuser", "password": "password123"}
        )
        body = response.get_json()["user"]
        assert body["username"] == "newuser"
        assert "id" in body

    def test_register_missing_username(self, client):
        response = client.post("/auth/register", json={"password": "password123"})
        assert response.status_code == 400

    def test_register_missing_password(self, client):
        response = client.post("/auth/register", json={"username": "newuser"})
        assert response.status_code == 400

    def test_register_password_too_short(self, client):
        response = client.post(
            "/auth/register", json={"username": "newuser", "password": "abc"}
        )
        assert response.status_code == 400

    def test_register_duplicate_username(self, client, make_user):
        make_user(username="taken")
        response = client.post(
            "/auth/register", json={"username": "taken", "password": "password123"}
        )
        assert response.status_code == 409

    def test_registered_password_is_hashed_not_stored_plain(self, client, db):
        client.post("/auth/register", json={"username": "newuser", "password": "password123"})
        user = User.query.filter_by(username="newuser").first()
        assert user.password_hash != "password123"
        assert user.check_password("password123")


class TestLogin:
    def test_login_with_correct_credentials(self, client, make_user):
        make_user(username="someuser", password="password123")
        response = client.post(
            "/auth/login", json={"username": "someuser", "password": "password123"}
        )
        assert response.status_code == 200
        assert "access_token" in response.get_json()

    def test_login_returns_user_info(self, client, make_user):
        user = make_user(username="someuser", password="password123")
        response = client.post(
            "/auth/login", json={"username": "someuser", "password": "password123"}
        )
        body = response.get_json()["user"]
        assert body == {"id": user.id, "username": "someuser", "is_admin": False}

    def test_login_wrong_password(self, client, make_user):
        make_user(username="someuser", password="password123")
        response = client.post(
            "/auth/login", json={"username": "someuser", "password": "wrong"}
        )
        assert response.status_code == 401

    def test_login_unknown_username(self, client):
        response = client.post(
            "/auth/login", json={"username": "nobody", "password": "password123"}
        )
        assert response.status_code == 401

    def test_login_missing_fields(self, client):
        response = client.post("/auth/login", json={})
        assert response.status_code == 401
