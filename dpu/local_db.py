"""
DPU Local SQLite Database
=========================
Provides local data persistence for the Edge DPU.
Stores readings for computing rolling averages and lagged features.
Acts as a resilient cache during network outages.
"""

import sqlite3
import json
import os
from datetime import datetime, timedelta

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, 'dpu_cache.db')


def get_connection():
    """Get a new SQLite connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")  # Better concurrent read/write
    return conn


def init_db():
    """Create tables if they don't exist."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            gross_demand_kw REAL,
            solar_gen_kw REAL,
            net_load_kw REAL,
            predicted_net_load_kw REAL,
            predicted_solar_kw REAL,
            temperature_c REAL,
            ambient_light_lux REAL,
            cloud_cover REAL,
            status TEXT,
            house_data TEXT,
            feature_vector TEXT,
            sent_to_substation INTEGER DEFAULT 0,
            trained_on INTEGER DEFAULT 0
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS config_cache (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT
        )
    ''')

    # Index for fast time-range lookups (critical for rolling averages)
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_readings_timestamp 
        ON readings(timestamp)
    ''')

    conn.commit()
    conn.close()
    print("[DB] DPU SQLite database initialized.")


def save_reading(data):
    """Save a single reading to the local database."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO readings 
        (timestamp, gross_demand_kw, solar_gen_kw, net_load_kw, 
         predicted_net_load_kw, predicted_solar_kw, temperature_c, 
         ambient_light_lux, cloud_cover, status, house_data, feature_vector, sent_to_substation, trained_on)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data.get('timestamp'),
        data.get('gross_demand_kw', 0),
        data.get('solar_gen_kw', 0),
        data.get('net_load_kw', 0),
        data.get('predicted_net_load_kw', 0),
        data.get('predicted_solar_kw', 0),
        data.get('temperature_c', 0),
        data.get('ambient_light_lux', 0),
        data.get('cloud_cover', 0),
        data.get('status', 'NORMAL'),
        json.dumps(data.get('house_data', [])),
        json.dumps(data.get('feature_vector', [])),
        0,
        0
    ))

    conn.commit()
    conn.close()


def get_recent_readings(hours=168):
    """
    Get readings from the last N hours (default: 7 days = 168 hours).
    Used to compute rolling averages and lagged features.
    """
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cutoff = (datetime.now() - timedelta(hours=hours)).isoformat()

    cursor.execute('''
        SELECT * FROM readings 
        WHERE timestamp >= ? 
        ORDER BY timestamp ASC
    ''', (cutoff,))

    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


def get_latest_reading():
    """Get the most recent reading."""
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute('SELECT * FROM readings ORDER BY id DESC LIMIT 1')
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def save_config(key, value):
    """Cache a configuration value fetched from the central server."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('''
        INSERT OR REPLACE INTO config_cache (key, value, updated_at)
        VALUES (?, ?, ?)
    ''', (key, json.dumps(value), datetime.now().isoformat()))

    conn.commit()
    conn.close()


def get_config(key):
    """Retrieve a cached configuration value."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT value FROM config_cache WHERE key = ?', (key,))
    row = cursor.fetchone()
    conn.close()

    if row:
        return json.loads(row[0])
    return None


def mark_as_sent(reading_id):
    """Mark a reading as successfully sent to the substation."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE readings SET sent_to_substation = 1 WHERE id = ?', (reading_id,))
    conn.commit()
    conn.close()


def get_unsent_readings():
    """Get all readings that haven't been sent to the substation yet."""
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute('''
        SELECT * FROM readings 
        WHERE sent_to_substation = 0 
        ORDER BY timestamp ASC
    ''')

    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


def get_pending_training_records():
    """
    Get readings older than 1 hour that haven't been used for online learning yet.
    """
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    one_hour_ago = (datetime.now() - timedelta(hours=1)).isoformat()

    cursor.execute('''
        SELECT * FROM readings 
        WHERE timestamp <= ? AND trained_on = 0 
        ORDER BY timestamp ASC
    ''', (one_hour_ago,))

    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


def mark_as_trained(reading_id):
    """Mark a reading as having been used for the feedback loop."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE readings SET trained_on = 1 WHERE id = ?', (reading_id,))
    conn.commit()
    conn.close()
