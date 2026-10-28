import React, { useState, useEffect, useCallback, useRef } from 'react';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const T = { bg:'#0A0C12', panel:'#0F141E', card:'#11161F', border:'#202837', gold:'#F5B041', text:'#EFF3F8', muted:'#8A99B0', neon:'#00ff88', red:'#ff8f8f' };

export default function App() {
  const [userLoc, setUserLoc] = useState(null);
  const [dbStores, setDbStores] = useState([]);
  const [osmStores, setOsmStores] = useState([]);
  const [status, setStatus] = useState('Ready');
  const [backendOK, setBackendOK] = useState(false);
  const [stats, setStats] = useState(null);
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [aiQ, setAiQ] = useState('');
  const [aiA, setAiA] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [deals, setDeals] = useState([]);
  const [spazas, setSpazas] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [subProduct, setSubProduct] = useState('');
  const [subRetailer, setSubRetailer] = useState('');
  const [subPrice, setSubPrice] = useState('');
  const [subBusy, setSubBusy] = useState(false);
  const [subMsg, setSubMsg] = useState('');

  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const routeRef = useRef(null);
  const dbStoresRef = useRef([]);   // ← stable ref, avoids re-triggering effects

  // keep dbStoresRef in sync without causing dependency churn
  useEffect(() => { dbStoresRef.current = dbStores; }, [dbStores]);

  // ============ BACKEND CALLS (all stable via useCallback with []) ============

  const checkBackend = useCallback(async () => {
    try {
      const r = await fetch('/api/stores');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const stores = Array.isArray(data) ? data : (data.stores || []);
      setDbStores(stores);
      setBackendOK(true);
      setStatus(`✅ Backend online — ${stores.length} stores`);
      try {
        const s = await fetch('/api/real/stats');
        if (s.ok) setStats(await s.json());
      } catch(e) {}
    } catch (e) {
      setBackendOK(false);
      setStatus('⚠️ Backend offline — using live OSM only');
    }
  }, []);

  const loadDeals = useCallback(async () => {
    try {
      const r = await fetch('/api/real/deals');
      if (r.ok) { const d = await r.json(); setDeals(d.deals || []); }
    } catch(e) {}
  }, []);

  const loadSpazas = useCallback(async (lat, lng) => {
    try {
      const r = await fetch(`/api/real/spaza/nearby?lat=${lat}&lng=${lng}&radius=5000`);
      if (r.ok) {
        const d = await r.json();
        setSpazas(d.spazas || []);  // handles {spazas: [], count: 0} gracefully
      }
    } catch(e) { /* silent — endpoint may be missing table */ }
  }, []);

  const fetchOSM = useCallback(async (lat, lng, cat) => {
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
        phone: el.tags?.phone || null,
        source: 'OSM'
      })).filter(s => Number.isFinite(s.lat));
      setOsmStores(found);
      setStatus(`✅ ${found.length} OSM + ${dbStoresRef.current.length} DB stores`);
    } catch (e) { setStatus(`❌ OSM: ${e.message}`); }
  }, []);

  // Location — stable, no deps
  const getLocation = useCallback(() => {
    if (!navigator.geolocation) return setStatus('❌ GPS not supported');
    setStatus('📍 Requesting GPS...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLoc(loc);
        if (mapRef.current) {
          mapRef.current.setView([loc.lat, loc.lng], 14);
          L.marker([loc.lat, loc.lng], { icon: L.divIcon({ html:'<div style="background:#F5B041;width:20px;height:20px;border-radius:50%;border:3px solid white"></div>', iconSize:[20,20] }) })
            .addTo(mapRef.current).bindPopup('📍 You');
        }
        setStatus(`📍 GPS: ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);
        fetchOSM(loc.lat, loc.lng, 'all');
        loadDeals();
        loadSpazas(loc.lat, loc.lng);
      },
      (e) => setStatus(`❌ GPS: ${e.message}`),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [fetchOSM, loadDeals, loadSpazas]);

  // ============ MARKERS / ROUTE ============

  const drawMarkers = useCallback((list) => {
    if (!mapRef.current) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    list.forEach(s => {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return;
      const m = L.marker([s.lat, s.lng]).addTo(mapRef.current);
      m.bindPopup(`<b>${s.name}</b><br/>${s.category}<br/>${s.address||''}${s.phone?`<br/>📞 ${s.phone}`:''}`);
      m.on('click', () => pickStore(s));
      markersRef.current.push(m);
    });
  }, []);

  const pickStore = useCallback(async (store) => {
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
    } catch(e) {}
  }, [userLoc]);

  // redraw markers whenever the combined list changes
  useEffect(() => {
    drawMarkers([...dbStores, ...osmStores]);
  }, [dbStores, osmStores, drawMarkers]);

  // ============ AI / SUBMIT ============

  const askAI = useCallback(async () => {
    if (!aiQ.trim()) return;
    setAiBusy(true); setAiA('');
    try {
      const r = await fetch(`/api/real/price/${encodeURIComponent(aiQ.trim())}`);
      const data = await r.json().catch(() => ({}));
      if (r.status === 404) {
        setAiA(`❌ ${data.error || 'No data'}\n\n${data.message || `No real user has reported a price for "${aiQ}" yet. Use the form below to be the first.`}`);
      } else if (r.ok) {
        if (Array.isArray(data.prices) && data.prices.length) {
          const lines = data.prices.map(p => `• ${p.store} — R${p.price} (${p.reports} report${p.reports===1?'':'s'})`).join('\n');
          setAiA(`💰 Real prices for "${aiQ}":\n\n${lines}`);
        } else {
          setAiA(JSON.stringify(data, null, 2));
        }
      } else {
        setAiA(`Backend ${r.status}: ${JSON.stringify(data)}`);
      }
      try {
        const p = await fetch(`/api/real/predict/${encodeURIComponent(aiQ.trim())}`);
        if (p.ok) setPrediction(await p.json());
      } catch(e) {}
    } catch (e) {
      setAiA(`Network error: ${e.message}`);
    } finally { setAiBusy(false); }
  }, [aiQ]);

  const submitPrice = useCallback(async () => {
    if (!subProduct.trim() || !subRetailer.trim() || !subPrice) {
      setSubMsg('❌ Fill all fields'); return;
    }
    setSubBusy(true); setSubMsg('');
    try {
      const r = await fetch('/api/real/price/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: subProduct.trim(), retailer: subRetailer.trim(),
                               price: parseFloat(subPrice), lat: userLoc?.lat, lng: userLoc?.lng })
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setSubMsg(`✅ Saved: ${d.product} @ ${d.retailer} = R${d.price} · ${d.total_reports_for_product} total reports`);
        setSubProduct(''); setSubRetailer(''); setSubPrice('');
        try { const s = await fetch('/api/real/stats'); if (s.ok) setStats(await s.json()); } catch(e) {}
      } else {
        setSubMsg(`❌ ${d.error || 'Failed'}`);
      }
    } catch(e) { setSubMsg(`❌ Network: ${e.message}`); }
    finally { setSubBusy(false); }
  }, [subProduct, subRetailer, subPrice, userLoc]);

  // ============ INIT MAP + BOOTSTRAP (runs ONCE) ============

  useEffect(() => {
    const map = L.map('map').setView([-26.195, 28.034], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OSM' }).addTo(map);
    mapRef.current = map;

    // Bootstrap: check backend, then get location
    (async () => {
      await checkBackend();
      getLocation();
    })();

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []); // ← empty deps: run ONCE, no loop

  // ============ RENDER ============

  const all = [...dbStores, ...osmStores];
  const cats = [
    {id:'all',label:'All',icon:'fa-globe'},
    {id:'grocery',label:'Grocery',icon:'fa-apple-alt'},
    {id:'electronics',label:'Electronics',icon:'fa-laptop'},
    {id:'pharmacy',label:'Pharmacy',icon:'fa-pills'},
    {id:'restaurant',label:'Food',icon:'fa-utensils'},
    {id:'cafe',label:'Cafe',icon:'fa-mug-hot'}
  ];

  return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.text, fontFamily:'Inter,sans-serif' }}>
      <div style={{ background:T.panel, borderBottom:`1px solid ${T.border}`, padding:'16px 20px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={{ fontSize:'1.6rem', background:`linear-gradient(135deg, ${T.gold}, ${T.neon})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', margin:0 }}>SHOPAROUND MALL</h1>
            <p style={{ fontSize:'0.7rem', color:T.muted, margin:'4px 0 0' }}>Flask AI + Live OSM · Zero Hardcode</p>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:'0.7rem', color: backendOK ? T.neon : T.red }}>
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

        {stats && (
          <div style={{ background:T.panel, borderRadius:16, padding:'10px 16px', marginBottom:16, fontSize:'0.8rem', color:T.muted }}>
            <i className="fas fa-database" style={{ color:T.gold }}></i> DB:
            <strong style={{color:T.text, margin:'0 4px'}}>{stats.stores_in_db}</strong>stores ·
            <strong style={{color:T.text, margin:'0 4px'}}>{stats.community_prices_in_db}</strong>prices ·
            <strong style={{color:T.text, margin:'0 4px'}}>{stats.registered_users}</strong>users
          </div>
        )}

        <div style={{ background:T.panel, borderRadius:20, padding:16, marginBottom:16, border:`1px solid ${T.neon}40` }}>
          <h3 style={{ margin:'0 0 12px', fontSize:'1rem' }}><i className="fas fa-robot" style={{ color:T.neon }}></i> AI Price Query</h3>
          <div style={{ display:'flex', gap:8 }}>
            <input value={aiQ} onChange={e=>setAiQ(e.target.value)} onKeyPress={e=>e.key==='Enter'&&askAI()}
              placeholder="e.g. 'Bread'"
              style={{ flex:1, padding:'12px 16px', background:T.card, border:`1px solid ${T.border}`, borderRadius:40, color:T.text, outline:'none' }} />
            <button onClick={askAI} disabled={aiBusy} style={{ background:T.neon, border:'none', padding:'12px 24px', borderRadius:40, fontWeight:'bold', cursor:'pointer', color:'#000' }}>
              {aiBusy ? '...' : 'Ask'}
            </button>
          </div>
          {aiA && <div style={{ marginTop:12, padding:12, background:T.card, borderRadius:12, fontSize:'0.85rem', whiteSpace:'pre-wrap', fontFamily:'monospace' }}>{aiA}</div>}
          {prediction && <div style={{ marginTop:8, padding:10, background:`${T.gold}20`, borderRadius:10, fontSize:'0.75rem' }}>📈 Prediction: {JSON.stringify(prediction)}</div>}
        </div>

        <div style={{ background:T.panel, borderRadius:20, padding:16, marginBottom:16, border:`1px solid ${T.gold}40` }}>
          <h3 style={{ margin:'0 0 12px', fontSize:'1rem' }}><i className="fas fa-upload" style={{ color:T.gold }}></i> Report Real Price</h3>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 2fr 1fr auto', gap:8 }}>
            <input value={subProduct} onChange={e=>setSubProduct(e.target.value)} placeholder="Product"
              style={{ padding:'10px 14px', background:T.card, border:`1px solid ${T.border}`, borderRadius:10, color:T.text, outline:'none' }} />
            <input value={subRetailer} onChange={e=>setSubRetailer(e.target.value)} placeholder="Retailer"
              style={{ padding:'10px 14px', background:T.card, border:`1px solid ${T.border}`, borderRadius:10, color:T.text, outline:'none' }} />
            <input value={subPrice} onChange={e=>setSubPrice(e.target.value)} placeholder="R" type="number" step="0.01"
              style={{ padding:'10px 14px', background:T.card, border:`1px solid ${T.border}`, borderRadius:10, color:T.text, outline:'none' }} />
            <button onClick={submitPrice} disabled={subBusy} style={{ background:T.gold, border:'none', padding:'10px 20px', borderRadius:10, fontWeight:'bold', cursor:'pointer', color:'#000' }}>
              {subBusy ? '...' : 'Submit'}
            </button>
          </div>
          {subMsg && <div style={{ marginTop:10, fontSize:'0.8rem', color: subMsg.startsWith('✅') ? T.neon : T.red }}>{subMsg}</div>}
        </div>

        {deals.length > 0 && (
          <div style={{ background:T.panel, borderRadius:20, padding:16, marginBottom:16, border:`1px solid ${T.gold}40` }}>
            <h3 style={{ margin:'0 0 12px', fontSize:'1rem' }}><i className="fas fa-tags" style={{ color:T.gold }}></i> Real Deals ({deals.length})</h3>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {deals.slice(0,8).map((d,i) => (
                <div key={i} style={{ background:T.card, padding:'10px 14px', borderRadius:12, fontSize:'0.8rem' }}>
                  {typeof d === 'string' ? d : `${d.product||d.name||'Deal'}${d.store?' @ '+d.store:''}${d.price?' R'+d.price:''}`}
                </div>
              ))}
            </div>
          </div>
        )}

        {spazas.length > 0 && (
          <div style={{ background:T.panel, borderRadius:20, padding:16, marginBottom:16, border:`1px solid ${T.neon}40` }}>
            <h3 style={{ margin:'0 0 12px', fontSize:'1rem' }}><i className="fas fa-store" style={{ color:T.neon }}></i> Nearby Spazas ({spazas.length})</h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px,1fr))', gap:8 }}>
              {spazas.slice(0,8).map((s,i) => (
                <div key={i} style={{ background:T.card, padding:10, borderRadius:12, fontSize:'0.8rem' }}>
                  <div style={{ fontWeight:600 }}>{s.name || 'Spaza'}</div>
                  <div style={{ fontSize:'0.7rem', color:T.muted }}>{s.distance_km ? s.distance_km+' km' : ''} {s.category||''}</div>
                </div>
              ))}
            </div>
          </div>
        )}

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

        <h3 style={{ marginBottom:12 }}>
          <i className="fas fa-store"></i> Stores ({all.length}) —
          <span style={{ fontSize:'0.75rem', color:T.muted, marginLeft:8 }}>{dbStores.length} DB · {osmStores.length} OSM</span>
        </h3>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:12 }}>
          {all.slice(0,40).map(s => (
            <div key={s.id} onClick={() => pickStore(s)}
              style={{ background:T.card, borderRadius:16, padding:14, cursor:'pointer', border: selected?.id===s.id ? `2px solid ${T.gold}` : `1px solid ${T.border}` }}>
              <div style={{ fontWeight:600, marginBottom:6 }}>{s.name}</div>
              <div style={{ fontSize:'0.7rem', color:T.muted }}>📌 {s.category}</div>
              <div style={{ fontSize:'0.65rem', color:T.muted, marginTop:4 }}>{s.address?.substring(0,50)}</div>
              <div style={{ fontSize:'0.6rem', marginTop:6, color: s.source==='OSM' ? T.gold : T.neon }}>
                {s.source==='OSM' ? '📡 Live OSM' : '💾 Backend DB'}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop:40, textAlign:'center', padding:16, borderTop:`1px solid ${T.border}`, fontSize:'0.7rem', color:T.muted }}>
          © 2026 ShopAround Mall · Sediba Group
        </div>
      </div>
    </div>
  );
}
