from flask import Blueprint, jsonify, request

from app.extensions import db
from app.user.auth import MIN_PASSWORD_LENGTH, issue_token
from app.user.models import User

users_bp = Blueprint("users", __name__, url_prefix="/auth")


@users_bp.post("/register")
def register():
    """Create a new user account.
    ---
    tags:
      - auth
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required: [username, password]
          properties:
            username:
              type: string
              example: newuser
            password:
              type: string
              example: password123
              description: Must be at least 6 characters.
    responses:
      201:
        description: Account created; body includes an access_token and the user.
      400:
        description: Missing username/password, or password too short.
      409:
        description: Username is already taken.
    """
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify(error="'username' and 'password' are required"), 400

    if len(password) < MIN_PASSWORD_LENGTH:
        return jsonify(error=f"'password' must be at least {MIN_PASSWORD_LENGTH} characters"), 400

    if User.query.filter_by(username=username).first():
        return jsonify(error="Username is already taken"), 409

    user = User(username=username)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return jsonify(access_token=issue_token(user), user=user.to_dict()), 201


@users_bp.post("/login")
def login():
    """Log in and receive a JWT access token.
    ---
    tags:
      - auth
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required: [username, password]
          properties:
            username:
              type: string
              example: admin
            password:
              type: string
              example: admin
    responses:
      200:
        description: Login succeeded; body includes an access_token and the user.
      401:
        description: Invalid username or password.
    """
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    user = User.query.filter_by(username=username).first() if username else None
    if not user or not user.check_password(password or ""):
        return jsonify(error="Invalid username or password"), 401

    return jsonify(access_token=issue_token(user), user=user.to_dict())
