#!/usr/bin/env python3
"""
INTEGRATE REAL INTELLIGENCE INTO YOUR EXISTING SYSTEM
NO BREAKING CHANGES - Pure addition
"""

import os
import sys

# Check if the main app exists
main_app = None
for app_file in ["shoparound_final_working.py", "shoparound_real_dashboard.py", "shoparound_professional.py"]:
    if os.path.exists(app_file):
        main_app = app_file
        break

if not main_app:
    print("❌ Could not find your main app file")
    sys.exit(1)

print(f"✅ Found your main app: {main_app}")

# Create a launcher that integrates real intelligence
launcher = f'''#!/usr/bin/env python3
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
from {main_app.replace('.py', '')} import app

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
'''

with open("run_real_intelligence.py", "w") as f:
    f.write(launcher)

print("✅ Created launcher: run_real_intelligence.py")
print("")
print("To run your app with REAL intelligence:")
print("  python3 run_real_intelligence.py")
print("")
print("Your original app remains at: python3", main_app)
