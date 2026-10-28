from flask import Blueprint, request, jsonify
from app.extensions import db
from app.models import User

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(force=True)
    if User.query.filter_by(email=data.get("email")).first():
        return jsonify({"error": "Email already registered"}), 409
    user = User(email=data["email"], name=data.get("name"))
    user.set_password(data["password"])
    db.session.add(user)
    db.session.commit()
    return jsonify({"success": True, "user_id": user.id}), 201
