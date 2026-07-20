from flask_jwt_extended import create_access_token, get_jwt_identity

from app.extensions import db
from app.user.models import User

MIN_PASSWORD_LENGTH = 6


def issue_token(user):
    return create_access_token(identity=str(user.id))


def current_user():
    return db.session.get(User, int(get_jwt_identity()))


def current_username():
    user = current_user()
    return user.username if user else None
