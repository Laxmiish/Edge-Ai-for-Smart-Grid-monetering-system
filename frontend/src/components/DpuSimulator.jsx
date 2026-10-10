import React, { useState } from "react";

const styles = {
  container: {
    background: "#fff",
    borderRadius: "12px",
    padding: "22px 24px",
    boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
    marginBottom: "20px",
    borderLeft: "5px solid #8e44ad",
  },
  title: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#1b2b34",
    marginBottom: "16px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  formRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "14px",
    marginBottom: "14px",
  },
  label: { fontSize: "12px", fontWeight: 600, color: "#4a5760", marginBottom: "6px" },
  input: {
    padding: "8px 12px",
    fontSize: "13px",
    border: "1.5px solid #ddd",
    borderRadius: "8px",
    width: "100%",
    boxSizing: "border-box",
  },
  btn: {
    background: "#8e44ad",
    color: "#fff",
    border: "none",
    padding: "10px 20px",
    borderRadius: "8px",
    fontWeight: 700,
    cursor: "pointer",
  },
  resultBox: {
    marginTop: "16px",
    padding: "12px",
    background: "#f8f9fa",
    border: "1px solid #dee2e6",
    borderRadius: "8px",
    fontSize: "13px",
  }
};

export default function DpuSimulator({ transformers }) {
  const [form, setForm] = useState({
    transformerId: transformers[0]?.transformerId || "",
    grossDemand: 30,
    temperature: 35,
    cloudCover: 0.2,
  });
  const [aiResult, setAiResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handlePredict = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Call our new Python AI Server
      const res = await fetch("http://localhost:5005/predict-load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gross_demand_kw: Number(form.grossDemand),
          temperature_c: Number(form.temperature),
          cloud_cover: Number(form.cloudCover),
        })
      });
      const data = await res.json();
      setAiResult(data);
    } catch (err) {
      console.error(err);
      setAiResult({ error: "Failed to connect to AI server. Is docker-compose running?" });
    }
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.title}>
        <span>🧠</span> Edge AI Simulator (DPU Payload Injector)
      </div>
      <p style={{ fontSize: "13px", color: "#666", marginBottom: "16px" }}>
        Inject hypothetical telemetry into the Python Edge AI model to predict load 1-hour into the future.
      </p>

      <form onSubmit={handlePredict}>
        <div style={styles.formRow}>
          <div>
            <div style={styles.label}>Target Transformer</div>
            <select
              style={styles.input}
              value={form.transformerId}
              onChange={(e) => setForm({ ...form, transformerId: e.target.value })}
            >
              {transformers.map(t => (
                <option key={t.transformerId} value={t.transformerId}>{t.transformerId}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={styles.label}>Simulated Gross Demand (kW)</div>
            <input
              style={styles.input}
              type="number"
              value={form.grossDemand}
              onChange={(e) => setForm({ ...form, grossDemand: e.target.value })}
            />
          </div>
          <div>
            <div style={styles.label}>Temperature (°C)</div>
            <input
              style={styles.input}
              type="number"
              value={form.temperature}
              onChange={(e) => setForm({ ...form, temperature: e.target.value })}
            />
          </div>
          <div>
            <div style={styles.label}>Cloud Cover (0-1)</div>
            <input
              style={styles.input}
              type="number"
              step="0.1"
              value={form.cloudCover}
              onChange={(e) => setForm({ ...form, cloudCover: e.target.value })}
            />
          </div>
        </div>
        <button type="submit" style={styles.btn} disabled={loading}>
          {loading ? "Running AI Model..." : "Run Edge AI Prediction"}
        </button>
      </form>

      {aiResult && (
        <div style={styles.resultBox}>
          {aiResult.error ? (
            <span style={{ color: "#e74c3c" }}>{aiResult.error}</span>
          ) : (
            <div>
              <strong>AI Output:</strong> Predicted Net Load in 1 Hour = <span style={{ color: "#e74c3c", fontWeight: "bold" }}>{aiResult.predicted_net_load_1h_kw} kW</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
