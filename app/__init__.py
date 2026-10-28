from flask import Flask
from config import Config
from app.extensions import db, migrate

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    migrate.init_app(app, db)

    from app.auth import auth_bp
    app.register_blueprint(auth_bp, url_prefix="/api/auth")

    # catalog, orders, gps blueprints get added here once they're built

    @app.route("/health")
    def health():
        return {"status": "healthy"}

    return app
