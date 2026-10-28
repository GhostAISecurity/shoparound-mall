#!/usr/bin/env python3
"""
Populates the stores table from LIVE OpenStreetMap data.
Run manually OR call from Flask on every GPS lookup.
NO hardcoded data. Everything comes from Overpass API in real time.
"""

import sqlite3
import urllib.request
import urllib.parse
import json
import sys

def sync_stores(lat, lng, radius=3000):
    query = f"""[out:json][timeout:25];
        (
          node["shop"](around:{radius},{lat},{lng});
          way["shop"](around:{radius},{lat},{lng});
          node["amenity"~"restaurant|cafe|pharmacy|fuel"](around:{radius},{lat},{lng});
          way["amenity"~"restaurant|cafe|pharmacy|fuel"](around:{radius},{lat},{lng});
        );
        out center tags;"""

    data = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request(
        "https://overpass-api.de/api/interpreter",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())

    conn = sqlite3.connect("shoparound.db")
    cur = conn.cursor()

    inserted = 0
    updated = 0

    for el in result.get("elements", []):
        tags = el.get("tags", {})
        name = tags.get("name")
        if not name:
            continue

        lat_pt = el.get("lat") or el.get("center", {}).get("lat")
        lng_pt = el.get("lon") or el.get("center", {}).get("lon")
        if lat_pt is None or lng_pt is None:
            continue

        osm_id = f"{el['type']}/{el['id']}"
        category = tags.get("shop") or tags.get("amenity") or "store"
        address = " ".join(filter(None, [
            tags.get("addr:housenumber"),
            tags.get("addr:street"),
            tags.get("addr:suburb"),
            tags.get("addr:city"),
        ])) or None
        phone = tags.get("phone")
        hours = tags.get("opening_hours")

        existing = cur.execute(
            "SELECT id FROM stores WHERE osm_id = ?", (osm_id,)
        ).fetchone()

        if existing:
            cur.execute("""
                UPDATE stores SET name=?, category=?, latitude=?, longitude=?,
                address=?, phone=?, opening_hours=?, source='osm'
                WHERE osm_id=?
            """, (name, category, lat_pt, lng_pt, address, phone, hours, osm_id))
            updated += 1
        else:
            cur.execute("""
                INSERT INTO stores (name, category, latitude, longitude, address,
                                    phone, opening_hours, source, osm_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'osm', ?)
            """, (name, category, lat_pt, lng_pt, address, phone, hours, osm_id))
            inserted += 1

    conn.commit()
    total = cur.execute("SELECT COUNT(*) FROM stores").fetchone()[0]
    conn.close()

    print(f"✅ OSM sync done: +{inserted} inserted, {updated} updated. Total in DB: {total}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python sync-osm-stores.py <lat> <lng> [radius]")
        sys.exit(1)
    lat = float(sys.argv[1])
    lng = float(sys.argv[2])
    radius = int(sys.argv[3]) if len(sys.argv) > 3 else 3000
    sync_stores(lat, lng, radius)
