import os
import joblib
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
NET_LOAD_MODEL_PATH = os.path.join(PROJECT_ROOT, 'transformer_netload_model.pkl')
SCALER_PATH = os.path.join(PROJECT_ROOT, 'transformer_scaler.pkl')

net_load_model = None
scaler = None

try:
    net_load_model = joblib.load(NET_LOAD_MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    print("Loaded Edge AI models successfully.")
except Exception as e:
    print(f"Failed to load models: {e}")

# Simple Predictive Maintenance AI (Rule-based or mock linear model for demo)
def predict_maintenance_days(temp, load_pct, fault_history_count):
    # Base days
    days = 365
    
    # High temp reduces lifespan
    if temp > 60:
        days -= (temp - 60) * 10
        
    # High load reduces lifespan
    if load_pct > 80:
        days -= (load_pct - 80) * 5
        
    # Fault history reduces lifespan exponentially
    days -= (fault_history_count * 30)
    
    return max(1, min(int(days), 365))

@app.route('/predict-load', methods=['POST'])
def predict_load():
    if not net_load_model or not scaler:
        return jsonify({"error": "Models not loaded"}), 500
        
    data = request.json
    try:
        # Mocking the 11 feature vector from dpu logic
        # 'gross_demand_kw', 'ambient_light_lux', 'temperature_c', 'cloud_cover',
        # 'lagged_net_load_1h', 'lagged_solar_1h', 'rolling_avg_net_load_24h',
        # 'rolling_avg_net_load_7d', 'hour_sin', 'hour_cos', 'is_weekend'
        gross_demand = data.get('gross_demand_kw', 25.0)
        temp = data.get('temperature_c', 30.0)
        
        feature_vector = [
            gross_demand,
            data.get('ambient_light_lux', 500.0),
            temp,
            data.get('cloud_cover', 0.2),
            gross_demand, # lagged 1h
            0.0, # lagged solar
            gross_demand * 0.9, # rolling 24h
            gross_demand * 0.85, # rolling 7d
            0.5, # sin
            0.5, # cos
            0 # weekend
        ]
        
        scaled = scaler.transform([feature_vector])
        predicted_net_load = float(net_load_model.predict(scaled)[0])
        
        return jsonify({
            "predicted_net_load_1h_kw": round(predicted_net_load, 2)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/predict-maintenance', methods=['POST'])
def predict_maintenance():
    data = request.json
    temp = data.get('temperature_c', 45.0)
    load_pct = data.get('load_pct', 50.0)
    faults = data.get('fault_count', 0)
    
    days_left = predict_maintenance_days(temp, load_pct, faults)
    
    risk_level = "Low"
    if days_left < 30:
        risk_level = "Critical"
    elif days_left < 90:
        risk_level = "Moderate"
        
    return jsonify({
        "estimated_days_remaining": days_left,
        "risk_level": risk_level
    })

import datetime
import random

@app.route('/api/python/simulate-tick', methods=['POST'])
def simulate_tick():
    data = request.json or {}
    transformer_id = data.get("transformer_id", "TRF-DEMO-01")
    inject_theft = data.get("inject_theft", False)
    inject_degradation = data.get("inject_degradation", False)
    solar_capacity_kw = data.get("solar_capacity_kw", 5.0)
    solar_integrated = data.get("solar_integrated", True)
    manual = data.get("manual_overrides", {})
    
    # 1. Random Weather
    now = datetime.datetime.now()
    hour = now.hour + now.minute / 60.0
    
    if manual.get("temp") is not None:
        temperature_c = float(manual.get("temp"))
    else:
        temperature_c = round(28.5 + np.random.uniform(-3.0, 5.0), 2)
        
    if manual.get("cloud") is not None:
        cloud_cover = float(manual.get("cloud"))
    else:
        cloud_cover = round(max(0, min(1, ((35 - temperature_c) / 20) + random.uniform(-0.1, 0.1))), 3)

    if manual.get("light") is not None:
        ambient_light_lux = float(manual.get("light"))
    else:
        if 6 <= now.hour <= 18:
            solar_elev = max(0, np.sin(np.radians(max(0, 90 - abs(hour - 12) * 15))))
            ambient_light_lux = round(1000 * solar_elev * (1 - 0.6 * cloud_cover), 2)
        else:
            ambient_light_lux = 0.0

    # 2. Demand
    num_houses = 10
    houses = []
    total_metered_demand = 0.0
    total_solar_gen = 0.0

    house_overrides = manual.get("house_overrides", {})

    for i in range(1, num_houses + 1):
        house_id = f"{transformer_id}-H{i:02d}"
        
        if house_id in house_overrides:
            base_demand = float(house_overrides[house_id])
        else:
            if 6 <= hour <= 9: base_demand = random.uniform(1.5, 4.0)
            elif 17 <= hour <= 22: base_demand = random.uniform(2.0, 5.0)
            elif 0 <= hour <= 5: base_demand = random.uniform(0.3, 1.5)
            else: base_demand = random.uniform(1.0, 3.0)

        has_solar = (i % 3 != 0)
        solar_gen = 0.0
        if solar_integrated and has_solar and ambient_light_lux > 0:
            panel_capacity = solar_capacity_kw / num_houses
            solar_gen = panel_capacity * (ambient_light_lux / 1000.0) * random.uniform(0.7, 1.0)

        net_house_demand = max(0, base_demand - solar_gen)
        total_metered_demand += base_demand
        total_solar_gen += solar_gen

        houses.append({
            "house_id": house_id,
            "raw_demand_kw": round(base_demand, 3),
            "solar_gen_kw": round(solar_gen, 3),
            "net_demand_kw": round(net_house_demand, 3)
        })

    # 3. Line Loss Calculation
    # Normal technical loss 2-4%
    technical_loss = total_metered_demand * random.uniform(0.02, 0.04)
    if inject_degradation:
        # Pushes it to 10-14% (Aging Hardware)
        technical_loss += total_metered_demand * random.uniform(0.08, 0.10)
        
    non_technical_loss = 0.0
    if inject_theft:
        # Pushes loss way above 15% (Katiya)
        non_technical_loss = random.uniform(15.0, 20.0)

    gross_demand_kw = total_metered_demand + technical_loss + non_technical_loss
    net_load_kw = max(0, gross_demand_kw - total_solar_gen)

    # 4. Predict AI Overload
    predicted_net_load = 0.0
    if net_load_model and scaler:
        try:
            fv = [
                gross_demand_kw, ambient_light_lux, temperature_c, cloud_cover,
                gross_demand_kw, 0.0, gross_demand_kw * 0.9, gross_demand_kw * 0.85,
                0.5, 0.5, 0
            ]
            scaled = scaler.transform([fv])
            predicted_net_load = round(float(net_load_model.predict(scaled)[0]), 3)
        except Exception:
            pass

    # 5. Return Full Payload
    return jsonify({
        "transformer_id": transformer_id,
        "timestamp": now.isoformat(),
        "gross_demand_kw": round(gross_demand_kw, 3),
        "metered_demand_kw": round(total_metered_demand, 3),
        "solar_gen_kw": round(total_solar_gen, 3),
        "net_load_kw": round(net_load_kw, 3),
        "predicted_net_load_kw": predicted_net_load,
        "temperature_c": temperature_c,
        "ambient_light_lux": ambient_light_lux,
        "cloud_cover": cloud_cover,
        "house_data": houses
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5005)
