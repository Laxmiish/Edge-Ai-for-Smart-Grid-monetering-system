"""
DPU (Data Processing Unit) — Edge AI Runtime
=============================================
Runs on a Raspberry Pi / Jetson Nano at each transformer.

Features:
  - Online Learning: Executes `partial_fit` on 1-hour old data to continually self-improve.
  - Model Persistence: Saves updated weights locally.
"""

import time
import datetime
import requests
import joblib
import numpy as np
import random
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import local_db

# ========================
# CONFIGURATION
# ========================
TRANSFORMER_ID = "TX-LUCKNOW-BBD-01"
RATED_CAPACITY_KW = 45.0
SUBSTATION_ENDPOINT = os.getenv("SUBSTATION_ENDPOINT", "http://127.0.0.1:5001/api/substation/ingest")
BACKEND_CONFIG_URL = os.getenv("BACKEND_CONFIG_URL", "http://127.0.0.1:3000/api/config")
NUM_HOUSES = 10
READING_INTERVAL_SECONDS = 10

DPU_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(DPU_DIR)
NET_LOAD_MODEL_PATH = os.path.join(PROJECT_ROOT, 'transformer_netload_model.pkl')
SOLAR_MODEL_PATH = os.path.join(PROJECT_ROOT, 'transformer_solar_model.pkl')
SCALER_PATH = os.path.join(PROJECT_ROOT, 'transformer_scaler.pkl')
FEATURE_COLS_PATH = os.path.join(PROJECT_ROOT, 'model_feature_cols.pkl')

# Initialize local SQLite
local_db.init_db()

# Load Models & Scaler
net_load_model = None
solar_model = None
scaler = None
feature_cols = None

try:
    net_load_model = joblib.load(NET_LOAD_MODEL_PATH)
    solar_model = joblib.load(SOLAR_MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    feature_cols = joblib.load(FEATURE_COLS_PATH)
    print("[*] Loaded Models, Scaler, and Features successfully.")
except Exception as e:
    print(f"[!] Failed to load models: {e}")

SOLAR_CAPACITY_KW = 5.0
LATITUDE = 26.8467
LONGITUDE = 80.9462


def fetch_server_config():
    global SOLAR_CAPACITY_KW, LATITUDE, LONGITUDE
    try:
        url = f"{BACKEND_CONFIG_URL}/{TRANSFORMER_ID}"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            config = response.json()
            SOLAR_CAPACITY_KW = config.get('solar_capacity_kw', SOLAR_CAPACITY_KW)
            LATITUDE = config.get('latitude', LATITUDE)
            LONGITUDE = config.get('longitude', LONGITUDE)
            local_db.save_config('server_config', config)
            return True
    except:
        pass
    cached = local_db.get_config('server_config')
    if cached:
        SOLAR_CAPACITY_KW = cached.get('solar_capacity_kw', SOLAR_CAPACITY_KW)
    return False


def run_online_learning():
    """
    BEGINNER EXPLANATION:
    This function is what makes the AI "smart" over time! 
    Instead of sending all the data to the cloud to retrain the AI, the AI trains itself right here on the edge device.
    It looks at predictions it made 1 hour ago, checks what the *actual* real-world values turned out to be, 
    and uses the difference (the error) to mathematically adjust its internal weights so it doesn't make the same mistake again.
    """
    if not net_load_model or not solar_model or not scaler:
        return

    pending_records = local_db.get_pending_training_records()
    if not pending_records:
        return

    history = local_db.get_recent_readings(hours=168)
    updates_made = 0

    for record in pending_records:
        try:
            # The record was made at time T. The prediction was for T + 1 hour.
            # We need to find the actual net_load and solar_gen at T + 1 hour.
            record_ts = datetime.datetime.fromisoformat(record['timestamp'])
            target_ts = record_ts + datetime.timedelta(hours=1)
            
            # Find the reading closest to target_ts in our history
            closest_actual = None
            min_diff = float('inf')
            
            for h in history:
                h_ts = datetime.datetime.fromisoformat(h['timestamp'])
                diff = abs((h_ts - target_ts).total_seconds())
                if diff < min_diff and diff <= 600: # Within 10 minutes
                    min_diff = diff
                    closest_actual = h
            
            if closest_actual and record.get('feature_vector'):
                feature_vector = json.loads(record['feature_vector'])
                if not feature_vector:
                    continue
                
                actual_net_load = closest_actual['net_load_kw']
                actual_solar = closest_actual['solar_gen_kw']
                
                # Scale features
                scaled_features = scaler.transform([feature_vector])
                
                # Partial Fit (Online Learning Update Step)
                net_load_model.partial_fit(scaled_features, [actual_net_load])
                solar_model.partial_fit(scaled_features, [actual_solar])
                
                local_db.mark_as_trained(record['id'])
                updates_made += 1
                
        except Exception as e:
            print(f"[!] Online learning error on record {record['id']}: {e}")
            continue

    if updates_made > 0:
        print(f"[*] Online Learning: Updated models with {updates_made} new samples (η=0.0001).")
        # Save updated models to disk
        joblib.dump(net_load_model, NET_LOAD_MODEL_PATH)
        joblib.dump(solar_model, SOLAR_MODEL_PATH)


def read_house_smart_meters(hour, ambient_light_lux):
    houses = []
    total_gross_demand = 0.0
    total_solar_gen = 0.0

    for i in range(1, NUM_HOUSES + 1):
        if 6 <= hour <= 9: base_demand = random.uniform(1.5, 4.0)
        elif 17 <= hour <= 22: base_demand = random.uniform(2.0, 5.0)
        elif 0 <= hour <= 5: base_demand = random.uniform(0.3, 1.5)
        else: base_demand = random.uniform(1.0, 3.0)

        has_solar = (i % 3 != 0)
        solar_gen = 0.0
        if has_solar and ambient_light_lux > 0:
            panel_capacity = SOLAR_CAPACITY_KW / NUM_HOUSES
            solar_gen = panel_capacity * (ambient_light_lux / 1000.0) * random.uniform(0.7, 1.0)

        net_house_demand = round(max(0, base_demand - solar_gen), 3)
        total_gross_demand += base_demand
        total_solar_gen += solar_gen

        houses.append({
            "house_id": f"{TRANSFORMER_ID}-H{i:02d}",
            "raw_demand_kw": round(base_demand, 3),
            "solar_gen_kw": round(solar_gen, 3),
            "net_demand_kw": net_house_demand
        })
    return houses, round(total_gross_demand, 3), round(total_solar_gen, 3)


def compute_rolling_features():
    history = local_db.get_recent_readings(hours=168)
    features = {
        'lagged_net_load_1h': 0.0, 'lagged_solar_1h': 0.0,
        'rolling_avg_net_load_24h': 0.0, 'rolling_avg_net_load_7d': 0.0,
    }
    if not history: return features

    now = datetime.datetime.now()
    one_hour_ago = now - datetime.timedelta(hours=1)

    closest_1h = None
    min_diff = float('inf')
    for r in history:
        try:
            ts = datetime.datetime.fromisoformat(r['timestamp'])
            diff = abs((ts - one_hour_ago).total_seconds())
            if diff < min_diff:
                min_diff = diff
                closest_1h = r
        except: continue

    if closest_1h:
        features['lagged_net_load_1h'] = closest_1h.get('net_load_kw', 0.0) or 0.0
        features['lagged_solar_1h'] = closest_1h.get('solar_gen_kw', 0.0) or 0.0

    twenty_four_hours_ago = now - datetime.timedelta(hours=24)
    recent_24h = [r['net_load_kw'] for r in history if r.get('net_load_kw') is not None and datetime.datetime.fromisoformat(r['timestamp']) >= twenty_four_hours_ago]
    if recent_24h: features['rolling_avg_net_load_24h'] = sum(recent_24h) / len(recent_24h)

    all_net_loads = [r['net_load_kw'] for r in history if r.get('net_load_kw') is not None]
    if all_net_loads: features['rolling_avg_net_load_7d'] = sum(all_net_loads) / len(all_net_loads)

    return features


def process_and_transmit():
    """
    BEGINNER EXPLANATION:
    This is the main loop of the Edge DPU that runs forever.
    1. It simulates reading environmental sensors (temperature, cloud cover, sunlight).
    2. It reads the smart meters from the houses connected to this transformer.
    3. It feeds that data into the local AI models to predict what the grid demand will look like in 1 hour.
    4. If the predicted demand is too high, it sets a "CRITICAL_OVERLOAD_RISK" status.
    5. Finally, it sends all this data to the local Substation relay.
    """
    while True:
        now = datetime.datetime.now()
        hour = now.hour + now.minute / 60.0
        is_weekend = now.weekday() >= 5

        temperature_c = round(28.5 + np.random.uniform(-3.0, 5.0), 2)
        cloud_cover = round(max(0, min(1, ((35 - temperature_c) / 20) + random.uniform(-0.1, 0.1))), 3)

        if 6 <= now.hour <= 18:
            solar_elev = max(0, np.sin(np.radians(max(0, 90 - abs(hour - 12) * 15))))
            ambient_light_lux = round(1000 * solar_elev * (1 - 0.6 * cloud_cover), 2)
        else:
            ambient_light_lux = 0.0

        house_data, gross_demand_kw, total_solar_gen = read_house_smart_meters(now.hour, ambient_light_lux)
        net_load_kw = round(gross_demand_kw - total_solar_gen, 3)

        rolling_features = compute_rolling_features()

        feature_dict = {
            'gross_demand_kw': gross_demand_kw,
            'ambient_light_lux': ambient_light_lux,
            'temperature_c': temperature_c,
            'cloud_cover': cloud_cover,
            'lagged_net_load_1h': rolling_features['lagged_net_load_1h'],
            'lagged_solar_1h': rolling_features['lagged_solar_1h'],
            'rolling_avg_net_load_24h': rolling_features['rolling_avg_net_load_24h'],
            'rolling_avg_net_load_7d': rolling_features['rolling_avg_net_load_7d'],
            'hour_sin': np.sin(2 * np.pi * hour / 24),
            'hour_cos': np.cos(2 * np.pi * hour / 24),
            'is_weekend': int(is_weekend),
        }

        # Build raw vector for saving
        raw_feature_vector = [feature_dict.get(col, 0.0) for col in (feature_cols or [])]
        
        predicted_net_load = 0.0
        predicted_solar = 0.0

        if net_load_model and scaler and raw_feature_vector:
            try:
                scaled_features = scaler.transform([raw_feature_vector])
                predicted_net_load = round(float(net_load_model.predict(scaled_features)[0]), 3)
                predicted_solar = round(float(solar_model.predict(scaled_features)[0]), 3)
            except Exception as e:
                print(f"[!] Prediction error: {e}")

        is_overload = predicted_net_load > RATED_CAPACITY_KW
        status_alert = "CRITICAL_OVERLOAD_RISK" if is_overload else "NORMAL"

        reading_data = {
            'timestamp': now.isoformat(),
            'gross_demand_kw': gross_demand_kw,
            'solar_gen_kw': total_solar_gen,
            'net_load_kw': net_load_kw,
            'predicted_net_load_kw': predicted_net_load,
            'predicted_solar_kw': predicted_solar,
            'temperature_c': temperature_c,
            'ambient_light_lux': ambient_light_lux,
            'cloud_cover': cloud_cover,
            'status': status_alert,
            'house_data': house_data,
            'feature_vector': raw_feature_vector
        }
        local_db.save_reading(reading_data)

        # Execute Online Learning Feedback Loop
        run_online_learning()

        payload = {
            "transformer_id": TRANSFORMER_ID,
            "timestamp": now.isoformat(),
            "transformer_telemetry": reading_data,
            "edge_analytics": {
                "predicted_net_load_1h_kw": predicted_net_load,
                "predicted_solar_1h_kw": predicted_solar,
                "rated_capacity_kw": RATED_CAPACITY_KW,
                "status": status_alert
            },
            "house_data": house_data
        }

        try:
            requests.post(SUBSTATION_ENDPOINT, json=payload, timeout=5)
            print(f"[{now.strftime('%H:%M:%S')}] ↑ Demand: {gross_demand_kw}kW | Solar: {total_solar_gen}kW | Pred(1h): {predicted_net_load}kW")
        except:
            print(f"[!] Substation unreachable, data cached.")

        time.sleep(READING_INTERVAL_SECONDS)


if __name__ == '__main__':
    fetch_server_config()
    process_and_transmit()
