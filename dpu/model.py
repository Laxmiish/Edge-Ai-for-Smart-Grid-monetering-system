"""
Smart Grid Edge AI — Net Load Prediction Model (model.py)
=========================================================
Trains a 1-hour-ahead net load forecasting model using the UCI 
Appliances Energy Prediction dataset.

Modified for Continuous Online Learning:
  - Uses SGDRegressor (Stochastic Gradient Descent) instead of GradientBoosting.
  - Native support for `.partial_fit()` allows the DPU to continually 
    update the weights with new data.
  - Uses StandardScaler to normalize features, which is strictly required 
    for SGD convergence.
"""

import pandas as pd
import numpy as np
from sklearn.linear_model import SGDRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import joblib
import warnings
warnings.filterwarnings('ignore')

# ========================
# CONFIGURATION
# ========================
DATASET_URL = (
    "https://raw.githubusercontent.com/LuisM78/"
    "Appliances-energy-prediction-data/master/energydata_complete.csv"
)

SOLAR_CAPACITY_KW = 5.0
LATITUDE = 26.8467
NUM_HOUSES = 10
STEPS_PER_HOUR = 6
FORECAST_HORIZON = STEPS_PER_HOUR


def estimate_solar_generation(hours, days_of_year, cloud_cover,
                              solar_capacity_kw, latitude):
    declination = 23.45 * np.sin(np.radians(360 / 365 * (days_of_year - 81)))
    hour_angle = 15 * (hours - 12)
    lat_rad = np.radians(latitude)
    dec_rad = np.radians(declination)
    ha_rad = np.radians(hour_angle)

    sin_elevation = (np.sin(lat_rad) * np.sin(dec_rad) +
                     np.cos(lat_rad) * np.cos(dec_rad) * np.cos(ha_rad))

    output = np.where(
        sin_elevation > 0,
        solar_capacity_kw * sin_elevation * (1 - 0.75 * cloud_cover),
        0.0
    )
    return np.maximum(0, output)


def fetch_and_engineer_features(url):
    print("[*] Downloading UCI dataset for Base Model Training...")
    df = pd.read_csv(url)

    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date').reset_index(drop=True)

    df['hour'] = df['date'].dt.hour + df['date'].dt.minute / 60.0
    df['day_of_year'] = df['date'].dt.dayofyear
    df['day_of_week'] = df['date'].dt.dayofweek
    df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
    df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)

    df['temperature_c'] = df['T_out']
    vis_norm = df['Visibility'].clip(0, 40) / 40.0
    rh_norm = df['RH_out'].clip(0, 100) / 100.0
    df['cloud_cover'] = ((1 - vis_norm) * 0.6 + rh_norm * 0.4).clip(0, 1)

    df['gross_demand_kw'] = ((df['Appliances'] + df['lights']) / 1000.0 * NUM_HOUSES)

    solar_elev = np.sin(np.radians(np.clip(90 - np.abs(df['hour'] - 12) * 15, 0, 90)))
    daytime = (df['hour'] >= 6) & (df['hour'] <= 18)
    df['ambient_light_lux'] = np.where(daytime, 1000 * solar_elev * (1 - 0.6 * df['cloud_cover']), 0.0)

    df['solar_gen_kw'] = estimate_solar_generation(
        df['hour'].values, df['day_of_year'].values, df['cloud_cover'].values,
        SOLAR_CAPACITY_KW, LATITUDE
    )

    df['net_load_kw'] = df['gross_demand_kw'] - df['solar_gen_kw']
    df['lagged_net_load_1h'] = df['net_load_kw'].shift(STEPS_PER_HOUR)
    df['lagged_solar_1h'] = df['solar_gen_kw'].shift(STEPS_PER_HOUR)

    steps_24h = 24 * STEPS_PER_HOUR
    steps_7d = 7 * 24 * STEPS_PER_HOUR
    df['rolling_avg_net_load_24h'] = df['net_load_kw'].rolling(window=steps_24h, min_periods=1).mean()
    df['rolling_avg_net_load_7d'] = df['net_load_kw'].rolling(window=steps_7d, min_periods=1).mean()

    # Target
    df['target_net_load_1h'] = df['net_load_kw'].shift(-FORECAST_HORIZON)
    df = df.dropna()
    return df


def train_net_load_model(df):
    feature_cols = [
        'gross_demand_kw', 'ambient_light_lux', 'temperature_c', 'cloud_cover',
        'lagged_net_load_1h', 'lagged_solar_1h',
        'rolling_avg_net_load_24h', 'rolling_avg_net_load_7d',
        'hour_sin', 'hour_cos', 'is_weekend'
    ]

    X = df[feature_cols]
    y = df['target_net_load_1h']

    split_idx = int(len(df) * 0.8)
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

    print("\n[*] Scaling features for SGD...")
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    print("[*] Training SGDRegressor (Base Model for Online Learning)...")
    # eta0=0.0001 as requested by user
    model = SGDRegressor(
        loss='squared_error',
        penalty='l2',
        alpha=0.0001,
        learning_rate='constant',
        eta0=0.0001,
        max_iter=1000,
        tol=1e-3,
        random_state=42
    )

    model.fit(X_train_scaled, y_train)
    predictions = model.predict(X_test_scaled)

    print(f"  MAE  : {mean_absolute_error(y_test, predictions):.4f} kW")
    print(f"  RMSE : {np.sqrt(mean_squared_error(y_test, predictions)):.4f} kW")
    print(f"  R²   : {r2_score(y_test, predictions):.4f}")

    joblib.dump(model, 'transformer_netload_model.pkl')
    joblib.dump(scaler, 'transformer_scaler.pkl')
    joblib.dump(feature_cols, 'model_feature_cols.pkl')
    
    print("\n[✓] Exported 'transformer_netload_model.pkl' & 'transformer_scaler.pkl'")
    return model, scaler, feature_cols


if __name__ == '__main__':
    df = fetch_and_engineer_features(DATASET_URL)
    train_net_load_model(df)
