"""
Substation Local SQLite Database
================================
Replaces the in-memory queue.Queue() with persistent SQLite storage.
Buffers incoming DPU telemetry before forwarding to the central cloud.
If the internet drops, data stays safely in SQLite until connectivity returns.
"""

import sqlite3
import json
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'substation_buffer.db')


def get_connection():
    """Get a new SQLite connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """Create buffer and log tables if they don't exist."""
    conn = get_connection()
    cursor = conn.cursor()

    # Main buffer: stores raw payloads awaiting forwarding
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS buffer (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transformer_id TEXT,
            timestamp TEXT,
            payload TEXT NOT NULL,
            forwarded INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            forwarded_at TEXT
        )
    ''')

    # Telemetry log: stores key metrics for local substation analytics
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS telemetry_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transformer_id TEXT,
            timestamp TEXT,
            gross_demand_kw REAL,
            solar_gen_kw REAL,
            net_load_kw REAL,
            predicted_net_load_kw REAL,
            status TEXT,
            received_at TEXT DEFAULT (datetime('now'))
        )
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_buffer_forwarded 
        ON buffer(forwarded)
    ''')

    conn.commit()
    conn.close()
    print("[SubDB] Substation SQLite buffer initialized.")


def buffer_payload(payload):
    """Store an incoming DPU payload in the persistent buffer."""
    conn = get_connection()
    cursor = conn.cursor()

    tx_id = payload.get('transformer_id', 'unknown')
    ts = payload.get('timestamp', datetime.now().isoformat())

    cursor.execute('''
        INSERT INTO buffer (transformer_id, timestamp, payload)
        VALUES (?, ?, ?)
    ''', (tx_id, ts, json.dumps(payload)))

    buffer_id = cursor.lastrowid

    # Also log key metrics for local substation-level analytics
    telemetry = payload.get('transformer_telemetry', {})
    analytics = payload.get('edge_analytics', {})

    cursor.execute('''
        INSERT INTO telemetry_log 
        (transformer_id, timestamp, gross_demand_kw, solar_gen_kw, 
         net_load_kw, predicted_net_load_kw, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (
        tx_id, ts,
        telemetry.get('gross_demand_kw', 0),
        telemetry.get('solar_gen_kw', 0),
        telemetry.get('net_load_kw', 0),
        analytics.get('predicted_net_load_1h_kw', 0),
        analytics.get('status', 'UNKNOWN')
    ))

    conn.commit()
    conn.close()
    return buffer_id


def get_pending_payloads(limit=50):
    """Get payloads that haven't been forwarded to the cloud yet."""
    conn = get_connection()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, payload FROM buffer 
        WHERE forwarded = 0 
        ORDER BY id ASC 
        LIMIT ?
    ''', (limit,))

    rows = [(row['id'], json.loads(row['payload'])) for row in cursor.fetchall()]
    conn.close()
    return rows


def mark_as_forwarded(buffer_id):
    """Mark a buffered payload as successfully forwarded to the cloud."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE buffer 
        SET forwarded = 1, forwarded_at = datetime('now') 
        WHERE id = ?
    ''', (buffer_id,))

    conn.commit()
    conn.close()


def get_buffer_stats():
    """Get statistics about the buffer state."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute('SELECT COUNT(*) FROM buffer WHERE forwarded = 0')
    pending = cursor.fetchone()[0]

    cursor.execute('SELECT COUNT(*) FROM buffer WHERE forwarded = 1')
    sent = cursor.fetchone()[0]

    conn.close()
    return {'pending': pending, 'sent': sent, 'total': pending + sent}
