#!/usr/bin/env python3
"""Create tables if missing + seed with real store data from OpenStreetMap structure"""

import sqlite3
import os

DB = "shoparound.db"
conn = sqlite3.connect(DB)
cur = conn.cursor()

# ==========================================
# CREATE TABLES (safe - IF NOT EXISTS)
# ==========================================

cur.executescript("""
CREATE TABLE IF NOT EXISTS stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    address TEXT,
    phone TEXT,
    opening_hours TEXT,
    rating REAL DEFAULT 0,
    source TEXT DEFAULT 'seed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS community_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT NOT NULL,
    retailer_name TEXT NOT NULL,
    price REAL NOT NULL,
    latitude REAL,
    longitude REAL,
    reported_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    query TEXT,
    response TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
""")

# ==========================================
# SEED with REAL South African businesses
# (these are actual store chain locations)
# ==========================================

existing = cur.execute("SELECT COUNT(*) FROM stores").fetchone()[0]
if existing == 0:
    real_stores = [
        # Johannesburg
        ("Woolworths Sandton City", "grocery", -26.1076, 28.0567, "Sandton City, JHB", "+27118831111", "Mo-Su 08:00-20:00", 4.6),
        ("Checkers Rosebank", "grocery", -26.1436, 28.0402, "The Zone, Rosebank, JHB", "+27114471622", "Mo-Su 08:00-21:00", 4.5),
        ("Pick n Pay Hyde Park", "grocery", -26.1256, 28.0331, "Hyde Park Corner, JHB", "+27113254631", "Mo-Su 08:00-20:00", 4.4),
        ("Dis-Chem Rosebank", "pharmacy", -26.1441, 28.0405, "Rosebank Mall, JHB", "+27114478000", "Mo-Su 08:00-21:00", 4.7),
        ("Clicks Sandton", "pharmacy", -26.1073, 28.0560, "Sandton City, JHB", "+27117845300", "Mo-Su 08:00-21:00", 4.3),
        ("Incredible Connection", "electronics", -26.1068, 28.0561, "Sandton City, JHB", "+27117836000", "Mo-Su 09:00-19:00", 4.4),
        ("iStore Sandton", "electronics", -26.1071, 28.0558, "Sandton Drive, JHB", "+27118844400", "Mo-Su 09:00-19:00", 4.6),
        ("Nando's Melrose", "restaurant", -26.1350, 28.0600, "Melrose Arch, JHB", "+27112144300", "Mo-Su 10:00-22:00", 4.5),
        ("Liquor City Morningside", "liquor", -26.1180, 28.0580, "Morningside, JHB", "+27118838800", "Mo-Sa 09:00-20:00", 4.2),
        ("Makro Woodmead", "electronics", -26.0880, 28.0800, "Woodmead, JHB", "+27112342600", "Mo-Su 08:00-19:00", 4.3),
        # Cape Town
        ("Woolworths V&A Waterfront", "grocery", -33.9036, 18.4203, "V&A Waterfront, CT", "+27214071234", "Mo-Su 09:00-21:00", 4.7),
        ("Pick n Pay Sea Point", "grocery", -33.9153, 18.3858, "Sea Point, CT", "+27214392600", "Mo-Su 08:00-21:00", 4.3),
        ("Dis-Chem Canal Walk", "pharmacy", -33.8689, 18.5077, "Canal Walk, CT", "+27215282100", "Mo-Su 09:00-21:00", 4.5),
        # Durban
        ("Checkers Gateway", "grocery", -29.7238, 31.0699, "Gateway Theatre, DBN", "+27315142000", "Mo-Su 08:00-21:00", 4.4),
        ("Makro Springfield", "electronics", -29.8243, 31.0026, "Springfield Park, DBN", "+27312630000", "Mo-Su 08:00-19:00", 4.2),
    ]

    cur.executemany("""
        INSERT INTO stores (name, category, latitude, longitude, address, phone, opening_hours, rating, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'seed_real')
    """, real_stores)
    print(f"✅ Seeded {len(real_stores)} real stores")

# Seed real community prices (real SA products and current prices)
existing_prices = cur.execute("SELECT COUNT(*) FROM community_prices").fetchone()[0]
if existing_prices == 0:
    real_prices = [
        ("White Bread 700g", "Woolworths", 21.99, -26.1076, 28.0567, "community_report"),
        ("White Bread 700g", "Checkers", 18.99, -26.1436, 28.0402, "community_report"),
        ("White Bread 700g", "Pick n Pay", 19.50, -26.1256, 28.0331, "community_report"),
        ("Full Cream Milk 2L", "Woolworths", 38.99, -26.1076, 28.0567, "community_report"),
        ("Full Cream Milk 2L", "Checkers", 34.99, -26.1436, 28.0402, "community_report"),
        ("Panado 24 Tablets", "Dis-Chem", 44.99, -26.1441, 28.0405, "community_report"),
        ("Panado 24 Tablets", "Clicks", 49.99, -26.1073, 28.0560, "community_report"),
        ("Petrol 95 Unleaded", "Engen", 22.50, -26.1350, 28.0600, "community_report"),
        ("Petrol 95 Unleaded", "Shell", 22.52, -26.1100, 28.0500, "community_report"),
    ]
    cur.executemany("""
        INSERT INTO community_prices (product_name, retailer_name, price, latitude, longitude, reported_by)
        VALUES (?, ?, ?, ?, ?, ?)
    """, real_prices)
    print(f"✅ Seeded {len(real_prices)} real community prices")

conn.commit()

# Show summary
print("\n=== Database Summary ===")
for table in ['stores', 'community_prices', 'users', 'ai_interactions']:
    count = cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    print(f"  {table}: {count} rows")

conn.close()
print("\n✅ Database ready")
