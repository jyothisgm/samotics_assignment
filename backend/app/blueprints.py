from app.asset.routes import assets_bp
from app.user.routes import users_bp


def register_blueprints(app):
    app.register_blueprint(users_bp)
    app.register_blueprint(assets_bp)
