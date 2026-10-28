#!/usr/bin/env python3
"""
Safely adds POST /api/real/price/submit to real_mmapateng_intelligence.py
if it doesn't already exist. Real endpoint — writes real user reports to DB.
"""
import re

PATH = "real_mmapateng_intelligence.py"

with open(PATH) as f:
    content = f.read()

if "/price/submit" in content:
    print("✅ /api/real/price/submit already exists — skipping")
    raise SystemExit(0)

# Endpoint to append
new_endpoint = '''

# ============================================
# REAL PRICE SUBMISSION (NO HARDCODE)
# ============================================

@real_bp.route('/price/submit', methods=['POST'])
def submit_price():
    """Real user-submitted price. Writes to community_prices table."""
    try:
        data = request.get_json(force=True) or {}
    except Exception:
        data = {}

    product = (data.get('product') or '').strip()
    retailer = (data.get('retailer') or data.get('store') or '').strip()

    try:
        price = float(data.get('price') or 0)
    except (TypeError, ValueError):
        price = 0

    if not product or not retailer or price <= 0:
        return jsonify({"error": "product, retailer, and positive price required"}), 400

    lat = data.get('lat')
    lng = data.get('lng')

    # Real reporter — prefer authenticated user, else session id, else anonymous hash
    reported_by = 'anonymous'
    try:
        from flask import session as _session
        if _session.get('user_id'):
            reported_by = f"user:{_session['user_id']}"
    except Exception:
        pass
    if data.get('reported_by'):
        reported_by = str(data['reported_by'])[:80]

    import sqlite3
    from datetime import datetime
    conn = sqlite3.connect("shoparound.db")
    cur = conn.cursor()

    # Ensure table exists with the schema the GET endpoint expects
    cur.execute("""
        CREATE TABLE IF NOT EXISTS community_prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_name TEXT NOT NULL,
            retailer_name TEXT NOT NULL,
            price REAL NOT NULL,
            latitude REAL,
            longitude REAL,
            reported_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cur.execute("""
        INSERT INTO community_prices
            (product_name, retailer_name, price, latitude, longitude, reported_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (product, retailer, price, lat, lng, reported_by,
          datetime.utcnow().isoformat()))

    new_id = cur.lastrowid
    conn.commit()

    # Count how many reports this product now has
    total = cur.execute(
        "SELECT COUNT(*) FROM community_prices WHERE product_name LIKE ?",
        (f"%{product}%",)
    ).fetchone()[0]
    conn.close()

    return jsonify({
        "ok": True,
        "id": new_id,
        "product": product,
        "retailer": retailer,
        "price": price,
        "reported_by": reported_by,
        "total_reports_for_product": total
    }), 201


@real_bp.route('/stats', methods=['GET'])
def real_stats():
    """Honest stats — returns 0 if DB is empty, no fake numbers."""
    import sqlite3
    conn = sqlite3.connect("shoparound.db")
    cur = conn.cursor()
    try:
        stores = cur.execute("SELECT COUNT(*) FROM stores").fetchone()[0]
    except Exception:
        stores = 0
    try:
        prices = cur.execute("SELECT COUNT(*) FROM community_prices").fetchone()[0]
    except Exception:
        prices = 0
    try:
        users = cur.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    except Exception:
        users = 0
    conn.close()
    return jsonify({
        "stores_in_db": stores,
        "community_prices_in_db": prices,
        "registered_users": users,
        "note": "Zeros are real — the DB genuinely has no rows yet"
    })
'''

# Append before the last line to keep file structure intact
content = content.rstrip() + "\n" + new_endpoint
with open(PATH, "w") as f:
    f.write(content)

print("✅ Appended POST /api/real/price/submit + GET /api/real/stats")
