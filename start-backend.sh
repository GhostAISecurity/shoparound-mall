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
