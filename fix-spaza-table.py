#!/usr/bin/env python3
"""Creates spaza_shops table if missing and syncs real spazas from OSM."""
import sqlite3, urllib.request, urllib.parse, json, sys

DB = "shoparound.db"

def ensure_table():
    conn = sqlite3.connect(DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS spaza_shops (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            category TEXT DEFAULT 'spaza',
            address TEXT,
            phone TEXT,
            verified INTEGER DEFAULT 1,
            osm_id TEXT UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_spaza_lat ON spaza_shops(latitude)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_spaza_lng ON spaza_shops(longitude)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_spaza_verified ON spaza_shops(verified)")
    conn.commit()
    n = conn.execute("SELECT COUNT(*) FROM spaza_shops").fetchone()[0]
    conn.close()
    print(f"✅ spaza_shops table ready ({n} rows)")
    return n

def sync_from_osm(lat, lng, radius=10000):
    """Fetch real convenience stores + small shops from OSM = real spazas."""
    query = f"""[out:json][timeout:30];
        (
          node["shop"~"convenience|yes|general|kiosk|small"](around:{radius},{lat},{lng});
          way["shop"~"convenience|yes|general|kiosk|small"](around:{radius},{lat},{lng});
        );
        out center tags;"""
    data = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request("https://overpass-api.de/api/interpreter",
                                 data=data,
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        result = json.loads(resp.read())

    conn = sqlite3.connect(DB)
    added = 0
    for el in result.get("elements", []):
        tags = el.get("tags", {})
        lat_pt = el.get("lat") or el.get("center", {}).get("lat")
        lng_pt = el.get("lon") or el.get("center", {}).get("lon")
        if lat_pt is None or lng_pt is None:
            continue
        name = tags.get("name") or "Unnamed Spaza"
        osm_id = f"{el['type']}/{el['id']}"
        address = " ".join(filter(None, [tags.get("addr:street"), tags.get("addr:suburb"), tags.get("addr:city")])) or None
        try:
            conn.execute("""
                INSERT OR IGNORE INTO spaza_shops (name, latitude, longitude, address, phone, osm_id)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (name, lat_pt, lng_pt, address, tags.get("phone"), osm_id))
            if conn.total_changes:
                added += 1
        except sqlite3.IntegrityError:
            pass
    conn.commit()
    total = conn.execute("SELECT COUNT(*) FROM spaza_shops").fetchone()[0]
    conn.close()
    print(f"✅ OSM spaza sync: +{added} new, {total} total")

if __name__ == "__main__":
    ensure_table()
    if len(sys.argv) >= 3:
        sync_from_osm(float(sys.argv[1]), float(sys.argv[2]))
    else:
        print("Run with lat lng to sync from OSM, e.g.: python3 fix-spaza-table.py -25.7223 28.4259")
