import React, { useState } from "react";

const styles = {
  container: {
    background: "#fff",
    borderRadius: "12px",
    padding: "22px 24px",
    boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
    marginBottom: "20px",
    borderLeft: "5px solid #2980b9",
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
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    fontSize: "12px",
    color: "#8a97a0",
    padding: "10px 8px",
    borderBottom: "2px solid #eef1f2",
  },
  td: {
    fontSize: "13px",
    color: "#3a464e",
    padding: "10px 8px",
    borderBottom: "1px solid #f1f3f4",
    verticalAlign: "middle",
  },
  btn: {
    background: "#2980b9",
    color: "#fff",
    border: "none",
    padding: "6px 12px",
    borderRadius: "6px",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: "12px",
  },
  pill: (color) => ({
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: 700,
    color: "#fff",
    background: color,
  })
};

export default function PredictiveMaintenance({ transformers, faults }) {
  const [predictions, setPredictions] = useState({});
  const [loading, setLoading] = useState({});

  const runAiDiagnostic = async (transformerId) => {
    setLoading(prev => ({ ...prev, [transformerId]: true }));
    
    // Calculate simple stats to feed the AI
    const faultCount = faults.filter(f => f.transformerId === transformerId).length;
    // Mock current temperature and load for the AI input
    const mockTemp = 40 + Math.random() * 20;
    const mockLoadPct = 50 + Math.random() * 40;

    try {
      const res = await fetch("http://localhost:5005/predict-maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          temperature_c: mockTemp,
          load_pct: mockLoadPct,
          fault_count: faultCount
        })
      });
      const data = await res.json();
      setPredictions(prev => ({ ...prev, [transformerId]: data }));
    } catch (err) {
      console.error(err);
      setPredictions(prev => ({ ...prev, [transformerId]: { error: "AI Offline" } }));
    }
    
    setLoading(prev => ({ ...prev, [transformerId]: false }));
  };

  const getRiskColor = (risk) => {
    if (risk === "Critical") return "#e74c3c";
    if (risk === "Moderate") return "#f39c12";
    return "#2ecc71";
  };

  return (
    <div style={styles.container}>
      <div style={styles.title}>
        <span>🔮</span> Predictive Maintenance AI Scanner
      </div>
      <p style={{ fontSize: "13px", color: "#666", marginBottom: "16px" }}>
        Run AI diagnostics on transformers to predict the estimated days remaining before a critical failure requires maintenance.
      </p>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Transformer</th>
            <th style={styles.th}>Location</th>
            <th style={styles.th}>Fault History Count</th>
            <th style={styles.th}>AI Diagnostics</th>
          </tr>
        </thead>
        <tbody>
          {transformers.map(t => {
            const faultCount = faults.filter(f => f.transformerId === t.transformerId).length;
            const pred = predictions[t.transformerId];
            const isLoad = loading[t.transformerId];

            return (
              <tr key={t.transformerId}>
                <td style={styles.td}><strong>{t.transformerId}</strong></td>
                <td style={styles.td}>{t.location}</td>
                <td style={styles.td}>{faultCount} faults logged</td>
                <td style={styles.td}>
                  {!pred && !isLoad && (
                    <button style={styles.btn} onClick={() => runAiDiagnostic(t.transformerId)}>
                      Scan with AI
                    </button>
                  )}
                  {isLoad && <span style={{ color: "#2980b9", fontWeight: "bold" }}>Scanning...</span>}
                  {pred && !pred.error && (
                    <div>
                      <span style={styles.pill(getRiskColor(pred.risk_level))}>
                        {pred.risk_level} Risk
                      </span>
                      <span style={{ marginLeft: "8px", fontSize: "12px", fontWeight: "bold" }}>
                        ~{pred.estimated_days_remaining} days left
                      </span>
                    </div>
                  )}
                  {pred && pred.error && <span style={{ color: "red" }}>{pred.error}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
