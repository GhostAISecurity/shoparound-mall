#!/usr/bin/env python3
"""
SHOPAROUND NEXUS - WITH REAL MMAPATENG INTELLIGENCE
Your original app is UNCHANGED
Real AI intelligence added
"""

import os
import sys
import time

# Kill existing process
os.system("fuser -k 5000/tcp 2>/dev/null")
os.system("pkill -f python3 2>/dev/null")
time.sleep(2)

# Import your original app
from shoparound_final_working import app

# Import real intelligence
from real_mmapateng_intelligence import real_bp

# Register real intelligence blueprint
app.register_blueprint(real_bp)

print("="*60)
print("🧠 SHOPAROUND NEXUS - REAL INTELLIGENCE ACTIVE")
print("="*60)
print("✅ REAL Community Price Intelligence")
print("✅ REAL Budget Optimization")
print("✅ REAL Fraud Detection")
print("✅ REAL Spaza Finder")
print("✅ REAL Price Prediction")
print("✅ REAL Deal Radar")
print("="*60)
print("🌐 Open: http://localhost:5000")
print("📊 Test REAL endpoints:")
print("   GET  /api/real/price/bread")
print("   POST /api/real/budget/optimize")
print("   GET  /api/real/deals")
print("   GET  /api/real/predict/bread?days=7")
print("="*60)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
