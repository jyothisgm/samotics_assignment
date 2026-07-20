from flasgger import Swagger
from flask import Flask, jsonify
from flask_jwt_extended import JWTManager
from werkzeug.exceptions import HTTPException

from app.blueprints import register_blueprints
from app.extensions import db, migrate
from config import Config

SWAGGER_TEMPLATE = {
    "swagger": "2.0",
    "info": {
        "title": "Motor Asset API",
        "description": "JSON API for managing Motor Assets, their sensor time series",
        "version": "1.0.0",
    },
    "securityDefinitions": {
        "Bearer": {
            "type": "apiKey",
            "name": "Authorization",
            "in": "header",
            "description": 'JWT auth. Get a token from /auth/login or /auth/register, then send it as "Bearer <token>".',
        }
    },
}


def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)

    db.init_app(app)
    migrate.init_app(app, db)
    JWTManager(app)
    Swagger(app, template=SWAGGER_TEMPLATE)

    register_blueprints(app)

    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        # abort(...) raises an HTTPException; Flask's default handler renders that as an
        # HTML error page, which breaks a JSON API's clients. This keeps every abort()
        # call in the app (400/403/404/etc.) responding with {"error": "..."} instead.
        response = jsonify(error=error.description)
        response.status_code = error.code
        return response

    @app.get("/health")
    def health():
        """Liveness check.
        ---
        tags:
          - health
        responses:
          200:
            description: Service is up
            examples:
              application/json: {"status": "ok"}
        """
        return jsonify(status="ok")

    return app
