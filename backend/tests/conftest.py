from datetime import datetime, timezone

import pytest
from flask_jwt_extended import create_access_token

from app import create_app
from app.asset.models import MotorAsset, SensorReading
from app.extensions import db as _db
from app.user.models import User
from config import TestConfig


@pytest.fixture()
def app():
    application = create_app(TestConfig)
    with application.app_context():
        _db.create_all()
        yield application
        _db.session.remove()
        _db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def db(app):
    return _db


@pytest.fixture()
def make_user(db):
    def _make_user(username="someuser", password="password123", is_admin=False):
        user = User(username=username, is_admin=is_admin)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        return user

    return _make_user


@pytest.fixture()
def make_asset(db):
    def _make_asset(name="Test Motor", owner=None, **kwargs):
        asset = MotorAsset(
            name=name,
            description=kwargs.get("description", "A test motor asset."),
            location=kwargs.get("location", "Test City, Testland"),
            created_at=kwargs.get("created_at", datetime.now(timezone.utc)),
            owner_id=owner.id if owner else None,
        )
        db.session.add(asset)
        db.session.commit()
        return asset

    return _make_asset


@pytest.fixture()
def make_reading(db):
    def _make_reading(asset, metric="vibration_velocity", unit="mm/s", value=1.0, timestamp=None):
        reading = SensorReading(
            asset_id=asset.id,
            metric=metric,
            unit=unit,
            timestamp=timestamp or datetime.now(timezone.utc),
            value=value,
        )
        db.session.add(reading)
        db.session.commit()
        return reading

    return _make_reading


@pytest.fixture()
def auth_header(app):
    def _auth_header(user):
        with app.app_context():
            token = create_access_token(identity=str(user.id))
        return {"Authorization": f"Bearer {token}"}

    return _auth_header
