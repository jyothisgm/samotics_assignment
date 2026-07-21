from flask import Blueprint, abort, jsonify, request
from flask_jwt_extended import jwt_required

from app.asset.models import MotorAsset
from app.extensions import db
from app.user.auth import current_user, current_username
from app.user.models import User

assets_bp = Blueprint("assets", __name__, url_prefix="/assets")

UPDATABLE_ASSET_FIELDS = {"name", "description", "location"}
ADMIN_ONLY_FIELDS = {"owner"}
MAX_FIELD_LENGTHS = {"name": 200, "description": 1000, "location": 200}


@assets_bp.get("")
@jwt_required()
def list_assets():
    """List motor assets for the Asset Overview page.
    ---
    tags:
      - assets
    security:
      - Bearer: []
    parameters:
      - name: page
        in: query
        type: integer
        default: 1
      - name: per_page
        in: query
        type: integer
        default: 20
        description: Capped at 200.
    responses:
      200:
        description: Paginated asset list. Each asset includes is_owner, true when
          the logged-in user's username matches the asset's owner field. Assets
          owned by the logged-in user are sorted to the front of the list.
      401:
        description: Missing or invalid bearer token.
    """
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 200)

    user = current_user()
    order_by = [(MotorAsset.owner_id == user.id).desc()] if user else []
    order_by.append(MotorAsset.name)

    pagination = MotorAsset.query.order_by(*order_by).paginate(
        page=page, per_page=per_page, error_out=False
    )

    username = user.username if user else None

    return jsonify(
        {
            "assets": [asset.to_summary_dict(username) for asset in pagination.items],
            "page": pagination.page,
            "per_page": pagination.per_page,
            "total": pagination.total,
            "total_pages": pagination.pages,
        }
    )


@assets_bp.get("/<int:asset_id>")
@jwt_required()
def get_asset(asset_id):
    """Get full detail for one motor asset, including sensor metric time series.
    ---
    tags:
      - assets
    security:
      - Bearer: []
    parameters:
      - name: asset_id
        in: path
        type: integer
        required: true
    responses:
      200:
        description: Asset detail, including sensor_metrics time series and
          is_owner (true when the logged-in user's username matches the owner field).
      401:
        description: Missing or invalid bearer token.
      404:
        description: Asset not found.
    """
    asset = db.session.get(MotorAsset, asset_id) or abort(404, description="Asset not found")
    return jsonify(asset.to_detail_dict(current_username()))


@assets_bp.patch("/<int:asset_id>")
@jwt_required()
def update_asset(asset_id):
    """Update a motor asset's name, description, and/or location. Admins may also
    reassign the owner and may edit any asset regardless of ownership.
    ---
    tags:
      - assets
    security:
      - Bearer: []
    parameters:
      - name: asset_id
        in: path
        type: integer
        required: true
      - in: body
        name: body
        schema:
          type: object
          properties:
            name:
              type: string
            description:
              type: string
            location:
              type: string
            owner:
              type: string
              description: Admin-only. Username of the new owner, or null to unassign.
    responses:
      200:
        description: Updated asset detail.
      400:
        description: Unsupported field in body, empty name, a field over its max
          length, or unknown owner username.
      401:
        description: Missing or invalid bearer token.
      403:
        description: Logged-in user is neither this asset's owner nor an admin.
      404:
        description: Asset not found.
    """
    asset = db.session.get(MotorAsset, asset_id) or abort(404, description="Asset not found")

    user = current_user()
    username = user.username if user else None
    is_admin = bool(user and user.is_admin)

    if not is_admin and not asset.is_owned_by(username):
        abort(403, description="Only the asset's owner can update it")

    data = request.get_json(silent=True) or {}

    allowed_fields = UPDATABLE_ASSET_FIELDS | (ADMIN_ONLY_FIELDS if is_admin else set())
    unknown_fields = set(data) - allowed_fields
    if unknown_fields:
        abort(400, description=f"Unsupported field(s): {', '.join(sorted(unknown_fields))}")

    if "name" in data and not data["name"]:
        abort(400, description="'name' cannot be empty")

    for field, max_length in MAX_FIELD_LENGTHS.items():
        value = data.get(field)
        if value and len(value) > max_length:
            abort(400, description=f"'{field}' must be at most {max_length} characters")

    if "owner" in data:
        new_owner_username = data["owner"]
        if new_owner_username is None:
            asset.owner_id = None
        else:
            new_owner = User.query.filter_by(username=new_owner_username).first()
            if not new_owner:
                abort(400, description=f"Unknown owner username: {new_owner_username!r}")
            asset.owner_id = new_owner.id

    for field in UPDATABLE_ASSET_FIELDS:
        if field in data:
            setattr(asset, field, data[field])

    db.session.commit()
    return jsonify(asset.to_detail_dict(username))
