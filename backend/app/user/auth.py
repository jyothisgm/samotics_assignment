from flask_jwt_extended import create_access_token, get_jwt_identity

from app.extensions import db
from app.user.models import User

MIN_PASSWORD_LENGTH = 8
MAX_USERNAME_LENGTH = 80


def validate_password(password):
    """Returns an error message for the first broken rule, or None if password is valid."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"'password' must be at least {MIN_PASSWORD_LENGTH} characters"
    if not any(c.islower() for c in password):
        return "'password' must include a lowercase letter"
    if not any(c.isupper() for c in password):
        return "'password' must include an uppercase letter"
    if not any(c.isdigit() for c in password):
        return "'password' must include a number"
    if not any(not c.isalnum() for c in password):
        return "'password' must include a symbol"
    return None


def issue_token(user):
    return create_access_token(identity=str(user.id))


def current_user():
    return db.session.get(User, int(get_jwt_identity()))


def current_username():
    user = current_user()
    return user.username if user else None
