"""
Substation Relay Server
=======================
Acts as a regional aggregation point between multiple DPUs and the central cloud.

Key Changes from V1:
  - Replaced in-memory queue.Queue() with persistent SQLite buffer
  - Data survives server restarts and network outages
  - Added /api/substation/status endpoint for monitoring
  - Points to the Express.js backend on port 3000
"""

from flask import Flask, request, jsonify
import requests
import threading
import time
import os
import sys

# Add current directory to path for local_db import
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import local_db

app = Flask(__name__)

# The Level 3 Cloud Server Endpoint (Express.js backend)
CENTRAL_CLOUD_ENDPOINT = os.getenv("CENTRAL_CLOUD_ENDPOINT", "http://127.0.0.1:3000/api/cloud/ingest")

# Initialize SQLite buffer
local_db.init_db()


@app.route('/api/substation/ingest', methods=['POST'])
def receive_from_dpu():
    """Receive telemetry from a DPU and buffer it in SQLite."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid payload"}), 400

    # Buffer the payload in SQLite (persistent, survives crashes)
    buffer_id = local_db.buffer_payload(data)

    tx_id = data.get("transformer_id", "unknown")
    status = data.get("edge_analytics", {}).get("status", "?")
    print(f"[Sub] ← Received from {tx_id} | Status: {status} | Buffer ID: {buffer_id}")

    return jsonify({
        "status": "buffered_at_substation",
        "transformer_id": tx_id,
        "buffer_id": buffer_id
    }), 200


@app.route('/api/substation/status', methods=['GET'])
def buffer_status():
    """Check the current buffer statistics."""
    stats = local_db.get_buffer_stats()
    return jsonify(stats), 200


def forward_to_cloud():
    """
    Background worker that reads pending payloads from SQLite 
    and forwards them to the central cloud server.
    Retries automatically on failure without losing data.
    """
    while True:
        pending = local_db.get_pending_payloads(limit=20)

        if pending:
            for buffer_id, payload in pending:
                try:
                    response = requests.post(
                        CENTRAL_CLOUD_ENDPOINT, json=payload, timeout=10)

                    if response.status_code == 200:
                        local_db.mark_as_forwarded(buffer_id)
                        tx_id = payload.get('transformer_id', '?')
                        print(f"[Sub] → Forwarded {tx_id} to Cloud (ID: {buffer_id})")
                    else:
                        print(f"[!] Cloud returned status {response.status_code}, will retry.")
                        break

                except requests.exceptions.RequestException as e:
                    print(f"[!] Cloud unreachable: {e}")
                    time.sleep(5)
                    break  # Stop batch, retry later
        else:
            time.sleep(2)  # No pending data, wait


if __name__ == '__main__':
    # Start the background cloud forwarding thread
    forwarder_thread = threading.Thread(target=forward_to_cloud, daemon=True)
    forwarder_thread.start()

    # Run the substation Flask API
    print("[*] Substation Relay Server Running on Port 5001...")
    app.run(host='0.0.0.0', port=5001)
