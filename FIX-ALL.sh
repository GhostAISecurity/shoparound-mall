#!/bin/bash
cd ~/shoparound
set -e

echo "=========================================="
echo " SHOPAROUND FIX-ALL"
echo "=========================================="

# 1. SEED DATABASE (safe: only creates if missing)
echo "[1/4] Seeding database..."
python3 << 'PYEOF'
import sqlite3
conn = sqlite3.connect("shoparound.db")
cur = conn.cursor()
cur.executescript("""
CREATE TABLE IF NOT EXISTS stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    category TEXT NOT NULL, latitude REAL, longitude REAL,
    address TEXT, phone TEXT, opening_hours TEXT, rating REAL DEFAULT 0,
    source TEXT DEFAULT 'seed', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS community_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT, product_name TEXT NOT NULL,
    retailer_name TEXT NOT NULL, price REAL NOT NULL,
    latitude REAL, longitude REAL, reported_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, full_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
""")

if cur.execute("SELECT COUNT(*) FROM stores").fetchone()[0] == 0:
    cur.executemany("INSERT INTO stores (name,category,latitude,longitude,address,phone,opening_hours,rating) VALUES (?,?,?,?,?,?,?,?)", [
        ("Woolworths Sandton City","grocery",-26.1076,28.0567,"Sandton City, JHB","+27118831111","Mo-Su 08:00-20:00",4.6),
        ("Checkers Rosebank","grocery",-26.1436,28.0402,"The Zone, Rosebank","+27114471622","Mo-Su 08:00-21:00",4.5),
        ("Pick n Pay Hyde Park","grocery",-26.1256,28.0331,"Hyde Park Corner","+27113254631","Mo-Su 08:00-20:00",4.4),
        ("Dis-Chem Rosebank","pharmacy",-26.1441,28.0405,"Rosebank Mall","+27114478000","Mo-Su 08:00-21:00",4.7),
        ("Clicks Sandton","pharmacy",-26.1073,28.0560,"Sandton City","+27117845300","Mo-Su 08:00-21:00",4.3),
        ("Incredible Connection","electronics",-26.1068,28.0561,"Sandton City","+27117836000","Mo-Su 09:00-19:00",4.4),
        ("Nando's Melrose","restaurant",-26.1350,28.0600,"Melrose Arch","+27112144300","Mo-Su 10:00-22:00",4.5),
        ("Makro Woodmead","electronics",-26.0880,28.0800,"Woodmead","+27112342600","Mo-Su 08:00-19:00",4.3),
        ("Woolworths V&A","grocery",-33.9036,18.4203,"V&A Waterfront, CT","+27214071234","Mo-Su 09:00-21:00",4.7),
        ("Checkers Gateway","grocery",-29.7238,31.0699,"Gateway, DBN","+27315142000","Mo-Su 08:00-21:00",4.4),
    ])
    print(f"  Seeded {cur.execute('SELECT COUNT(*) FROM stores').fetchone()[0]} stores")

if cur.execute("SELECT COUNT(*) FROM community_prices").fetchone()[0] == 0:
    cur.executemany("INSERT INTO community_prices (product_name,retailer_name,price,latitude,longitude,reported_by) VALUES (?,?,?,?,?,?)", [
        ("White Bread 700g","Woolworths",21.99,-26.1076,28.0567,"community"),
        ("White Bread 700g","Checkers",18.99,-26.1436,28.0402,"community"),
        ("White Bread 700g","Pick n Pay",19.50,-26.1256,28.0331,"community"),
        ("Full Cream Milk 2L","Woolworths",38.99,-26.1076,28.0567,"community"),
        ("Full Cream Milk 2L","Checkers",34.99,-26.1436,28.0402,"community"),
        ("Panado 24s","Dis-Chem",44.99,-26.1441,28.0405,"community"),
        ("Panado 24s","Clicks",49.99,-26.1073,28.0560,"community"),
    ])
    print(f"  Seeded {cur.execute('SELECT COUNT(*) FROM community_prices').fetchone()[0]} prices")

conn.commit()
print("  Tables:", [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()])
conn.close()
PYEOF

# 2. VITE PROXY to Flask
echo "[2/4] Configuring Vite proxy..."
cat > vite.config.js << 'VITE'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', port: 5173, strictPort: true,
    proxy: { '/api': { target: 'http://localhost:5000', changeOrigin: true } }
  }
});
VITE

# 3. NEW APP.JSX wired to Flask backend + OSM fallback
echo "[3/4] Writing new App.jsx..."
cat > src/App.jsx << 'APPEOF'
import React, { useState, useEffect, useCallback, useRef } from 'react';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const T = { bg:'#0A0C12', panel:'#0F141E', card:'#11161F', border:'#202837', gold:'#F5B041', text:'#EFF3F8', muted:'#8A99B0', neon:'#00ff88' };

export default function App() {
  const [userLoc, setUserLoc] = useState(null);
  const [dbStores, setDbStores] = useState([]);
  const [osmStores, setOsmStores] = useState([]);
  const [status, setStatus] = useState('Ready');
  const [backendOK, setBackendOK] = useState(false);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [aiQ, setAiQ] = useState('');
  const [aiA, setAiA] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const routeRef = useRef(null);

  const checkBackend = useCallback(async () => {
    try {
      const r = await fetch('/api/stores');
      if (r.ok) {
        const data = await r.json();
        const stores = Array.isArray(data) ? data : (data.stores || []);
        setDbStores(stores);
        setBackendOK(true);
        setStatus(`✅ Backend online — ${stores.length} DB stores`);
        return true;
      }
    } catch (e) {}
    setBackendOK(false);
    setStatus('⚠️ Backend offline — using live OSM only');
    return false;
  }, []);

  const fetchOSM = useCallback(async (lat, lng, cat = 'all') => {
    setLoading(true);
    const filter = cat === 'all' ? '["shop"]' : ({
      grocery:'["shop"="supermarket"]', electronics:'["shop"="electronics"]',
      pharmacy:'["amenity"="pharmacy"]', restaurant:'["amenity"="restaurant"]',
      cafe:'["amenity"="cafe"]', clothing:'["shop"="clothes"]'
    }[cat] || '["shop"]');
    const q = `[out:json][timeout:25];(node${filter}(around:3000,${lat},${lng});way${filter}(around:3000,${lat},${lng}););out center tags;`;
    try {
      const r = await fetch('https://overpass-api.de/api/interpreter', {
        method:'POST', body:'data='+encodeURIComponent(q),
        headers:{'Content-Type':'application/x-www-form-urlencoded'}
      });
      const data = await r.json();
      const found = (data.elements||[]).map(el => ({
        id:`osm-${el.type}-${el.id}`,
        name: el.tags?.name || el.tags?.shop || el.tags?.amenity || 'Unnamed',
        lat: el.lat ?? el.center?.lat, lng: el.lon ?? el.center?.lon,
        category: el.tags?.shop || el.tags?.amenity || 'store',
        address: el.tags?.['addr:street'] || 'Address unknown',
        phone: el.tags?.phone || null, source: 'OSM'
      })).filter(s => Number.isFinite(s.lat));
      setOsmStores(found);
      setStatus(`✅ ${found.length} OSM stores + ${dbStores.length} DB stores`);
      drawMarkers([...dbStores, ...found]);
    } catch (e) { setStatus(`❌ OSM error: ${e.message}`); }
    finally { setLoading(false); }
  }, [dbStores]);

  const getLocation = useCallback(() => {
    if (!navigator.geolocation) return setStatus('❌ GPS not supported');
    setStatus('📍 Requesting GPS...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLoc(loc);
        if (mapRef.current) {
          mapRef.current.setView([loc.lat, loc.lng], 14);
          L.marker([loc.lat, loc.lng], { icon: L.divIcon({ html:'<div style="background:#F5B041;width:20px;height:20px;border-radius:50%;border:3px solid white"></div>', iconSize:[20,20] }) }).addTo(mapRef.current).bindPopup('📍 You');
        }
        setStatus(`📍 GPS: ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
        await fetchOSM(loc.lat, loc.lng);
      },
      (e) => setStatus(`❌ GPS: ${e.message}`),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [fetchOSM]);

  const drawMarkers = (list) => {
    if (!mapRef.current) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    list.forEach(s => {
      const m = L.marker([s.lat, s.lng]).addTo(mapRef.current);
      m.bindPopup(`<b>${s.name}</b><br/>${s.category}<br/>${s.address||''}${s.phone?`<br/>📞 ${s.phone}`:''}`);
      m.on('click', () => pickStore(s));
      markersRef.current.push(m);
    });
  };

  const pickStore = async (store) => {
    setSelected(store);
    if (!userLoc) return;
    try {
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${userLoc.lng},${userLoc.lat};${store.lng},${store.lat}?overview=full&geometries=geojson`);
      const d = await r.json();
      if (d.code === 'Ok' && d.routes?.[0]) {
        const coords = d.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        if (routeRef.current) mapRef.current.removeLayer(routeRef.current);
        routeRef.current = L.polyline(coords, { color:'#F5B041', weight:5 }).addTo(mapRef.current);
        mapRef.current.fitBounds(L.polyline(coords).getBounds());
        setRouteInfo({ dist: `${(d.routes[0].distance/1000).toFixed(1)} km`, dur: `${Math.round(d.routes[0].duration/60)} min` });
      }
    } catch(e) { console.error(e); }
  };

  const askAI = async () => {
    if (!aiQ.trim()) return;
    setAiBusy(true); setAiA('');
    try {
      // Try real intelligence blueprint first
      let r = await fetch('/api/real/price', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ product: aiQ, lat: userLoc?.lat, lng: userLoc?.lng })
      });
      if (!r.ok) {
        // Fallback — try other endpoints
        r = await fetch('/api/ai/think', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ query: aiQ }) });
      }
      if (r.ok) {
        const d = await r.json();
        setAiA(typeof d === 'string' ? d : (d.response || d.message || JSON.stringify(d, null, 2)));
      } else {
        setAiA(`Backend ${r.status}: endpoint not registered. See terminal logs.`);
      }
    } catch (e) {
      setAiA(`Error: ${e.message}. Is Flask running on :5000?`);
    } finally { setAiBusy(false); }
  };

  useEffect(() => {
    const map = L.map('map').setView([-26.195, 28.034], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OSM' }).addTo(map);
    mapRef.current = map;
    checkBackend().then(() => getLocation());
    return () => { if (mapRef.current) mapRef.current.remove(); };
  }, [checkBackend, getLocation]);

  const all = [...dbStores, ...osmStores];
  const cats = [{id:'all',label:'All',icon:'fa-globe'},{id:'grocery',label:'Grocery',icon:'fa-apple-alt'},{id:'electronics',label:'Electronics',icon:'fa-laptop'},{id:'pharmacy',label:'Pharmacy',icon:'fa-pills'},{id:'restaurant',label:'Food',icon:'fa-utensils'},{id:'cafe',label:'Cafe',icon:'fa-mug-hot'}];

  return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.text, fontFamily:'Inter,sans-serif' }}>
      <div style={{ background:T.panel, borderBottom:`1px solid ${T.border}`, padding:'16px 20px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={{ fontSize:'1.6rem', background:`linear-gradient(135deg, ${T.gold}, ${T.neon})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', margin:0 }}>SHOPAROUND MALL</h1>
            <p style={{ fontSize:'0.7rem', color:T.muted, margin:'4px 0 0' }}>Flask AI Backend + Live OSM Data</p>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:'0.7rem', color: backendOK ? T.neon : '#ff8f8f' }}>
              <i className="fas fa-circle"></i> {backendOK ? 'Backend OK' : 'Backend OFF'}
            </span>
            <button onClick={getLocation} style={{ background:T.gold, border:'none', padding:'8px 16px', borderRadius:40, cursor:'pointer', fontWeight:500, color:'#000' }}>
              <i className="fas fa-crosshairs"></i> GPS
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1400, margin:'0 auto', padding:20 }}>
        <div style={{ background:T.panel, borderRadius:16, padding:'12px 16px', marginBottom:16, fontSize:'0.85rem' }}>
          <i className="fas fa-info-circle" style={{ color:T.gold }}></i> {status}
        </div>

        <div style={{ background:T.panel, borderRadius:20, padding:16, marginBottom:16, border:`1px solid ${T.neon}40` }}>
          <h3 style={{ margin:'0 0 12px', fontSize:'1rem' }}><i className="fas fa-robot" style={{ color:T.neon }}></i> AI Intelligence → Flask /api/real/price</h3>
          <div style={{ display:'flex', gap:8 }}>
            <input value={aiQ} onChange={e=>setAiQ(e.target.value)} onKeyPress={e=>e.key==='Enter'&&askAI()}
              placeholder="Ask about a product price, e.g. 'White Bread 700g'"
              style={{ flex:1, padding:'12px 16px', background:T.card, border:`1px solid ${T.border}`, borderRadius:40, color:T.text, outline:'none' }} />
            <button onClick={askAI} disabled={aiBusy} style={{ background:T.neon, border:'none', padding:'12px 24px', borderRadius:40, fontWeight:'bold', cursor:'pointer', color:'#000' }}>
              {aiBusy ? '...' : 'Ask AI'}
            </button>
          </div>
          {aiA && <div style={{ marginTop:12, padding:12, background:T.card, borderRadius:12, fontSize:'0.85rem', whiteSpace:'pre-wrap' }}>{aiA}</div>}
        </div>

        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
          {cats.map(c => (
            <button key={c.id} onClick={() => { setCategory(c.id); if (userLoc) fetchOSM(userLoc.lat, userLoc.lng, c.id); }}
              style={{ background: category===c.id ? T.gold : T.card, border:'none', padding:'8px 18px', borderRadius:40, color: category===c.id ? '#000' : T.text, cursor:'pointer', fontWeight:500 }}>
              <i className={`fas ${c.icon}`}></i> {c.label}
            </button>
          ))}
        </div>

        <div id="map" style={{ height:450, borderRadius:20, overflow:'hidden', marginBottom:20, border:`1px solid ${T.border}` }}></div>

        {routeInfo && <div style={{ background:`${T.neon}15`, borderRadius:16, padding:12, marginBottom:16 }}>🚗 {routeInfo.dist} · ⏱️ {routeInfo.dur} · 🎯 {selected?.name}</div>}
        {loading && <div style={{ textAlign:'center', padding:30 }}><i className="fas fa-spinner fa-pulse"></i> Loading...</div>}

        <h3 style={{ marginBottom:12 }}>
          <i className="fas fa-store"></i> Stores ({all.length}) —
          <span style={{ fontSize:'0.75rem', color:T.muted, marginLeft:8 }}>{dbStores.length} from DB · {osmStores.length} from OSM</span>
        </h3>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:12 }}>
          {all.slice(0, 40).map(s => (
            <div key={s.id} onClick={() => pickStore(s)} style={{ background:T.card, borderRadius:16, padding:14, cursor:'pointer', border: selected?.id===s.id ? `2px solid ${T.gold}` : `1px solid ${T.border}` }}>
              <div style={{ fontWeight:600, marginBottom:6 }}>{s.name}</div>
              <div style={{ fontSize:'0.7rem', color:T.muted }}>📌 {s.category}</div>
              <div style={{ fontSize:'0.65rem', color:T.muted, marginTop:4 }}>{s.address?.substring(0,50)}</div>
              <div style={{ fontSize:'0.6rem', marginTop:6, color: s.source==='seed_real'||s.source==='seed' ? T.neon : T.gold }}>
                {s.source==='OSM' ? '📡 Live OSM' : '💾 Backend DB'}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop:40, textAlign:'center', padding:16, borderTop:`1px solid ${T.border}`, fontSize:'0.7rem', color:T.muted }}>
          © 2026 ShopAround Mall · Sediba Group · Flask AI + OpenStreetMap
        </div>
      </div>
    </div>
  );
}
APPEOF

# 4. Create backend launcher that registers the blueprint
echo "[4/4] Writing backend launcher..."
cat > start-backend.sh << 'BACKEND'
#!/bin/bash
cd ~/shoparound
pkill -f "python.*shoparound" 2>/dev/null
sleep 1
python3 << 'PYEOF'
import os, sys
sys.path.insert(0, os.getcwd())

from shoparound_final_working import app

try:
    from real_mmapateng_intelligence import real_bp
    app.register_blueprint(real_bp)
    print("✅ Registered /api/real/* blueprint")
except Exception as e:
    print(f"⚠️ Blueprint register failed: {e}")

print("\n=== Routes ===")
for r in sorted(app.url_map.iter_rules(), key=lambda x: str(x)):
    if not r.rule.startswith('/static'):
        methods = ','.join(sorted(m for m in r.methods if m not in ['HEAD','OPTIONS']))
        print(f"  {methods:12} {r.rule}")

print("\n🚀 Flask on :5000\n")
app.run(host='0.0.0.0', port=5000)
PYEOF
BACKEND
chmod +x start-backend.sh

echo ""
echo "=========================================="
echo " ✅ FIX COMPLETE"
echo "=========================================="
echo ""
echo "Now run these in TWO terminals:"
echo ""
echo "  Terminal 1 (backend):  cd ~/shoparound && ./start-backend.sh"
echo "  Terminal 2 (frontend): cd ~/shoparound && npm run dev"
echo ""
echo "Then open in your phone browser: http://localhost:5173"
echo ""
