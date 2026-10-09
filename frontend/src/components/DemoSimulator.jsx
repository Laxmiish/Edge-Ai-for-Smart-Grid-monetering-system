import React, { useState, useEffect } from "react";

const API_URL = "http://localhost:3000/api";

const styles = {
  container: {
    padding: "30px",
    background: "radial-gradient(circle at top, #0f172a 0%, #020617 100%)",
    minHeight: "100vh",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    color: "#e2e8f0",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "30px",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    paddingBottom: "15px",
  },
  headerTitle: {
    fontSize: "28px",
    fontWeight: "700",
    background: "linear-gradient(90deg, #38bdf8, #818cf8)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    margin: 0,
  },
  card: {
    background: "rgba(30, 41, 59, 0.4)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    padding: "25px",
    borderRadius: "16px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
    marginBottom: "25px",
  },
  title: {
    fontSize: "16px",
    fontWeight: "600",
    color: "#94a3b8",
    marginBottom: "20px",
    textTransform: "uppercase",
    letterSpacing: "1px",
  },
  btn: (active) => ({
    padding: "12px 24px",
    background: active ? "linear-gradient(135deg, #ef4444, #b91c1c)" : "linear-gradient(135deg, #10b981, #047857)",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "bold",
    marginRight: "15px",
    boxShadow: active ? "0 4px 15px rgba(239, 68, 68, 0.4)" : "0 4px 15px rgba(16, 185, 129, 0.4)",
    transition: "all 0.2s ease-in-out",
  }),
  injectBtn: (active, colorClass) => {
    const colors = {
      red: { bg: "rgba(239, 68, 68, 0.1)", border: "#ef4444", text: "#fca5a5", glow: "rgba(239, 68, 68, 0.3)" },
      orange: { bg: "rgba(245, 158, 11, 0.1)", border: "#f59e0b", text: "#fcd34d", glow: "rgba(245, 158, 11, 0.3)" },
      green: { bg: "rgba(34, 197, 94, 0.1)", border: "#22c55e", text: "#86efac", glow: "rgba(34, 197, 94, 0.3)" }
    };
    const c = colors[colorClass];
    return {
      padding: "10px 20px",
      background: active ? c.bg : "transparent",
      color: active ? c.text : "#94a3b8",
      border: `1px solid ${active ? c.border : "rgba(255,255,255,0.2)"}`,
      borderRadius: "8px",
      cursor: "pointer",
      fontWeight: "bold",
      marginRight: "15px",
      boxShadow: active ? `0 0 10px ${c.glow}` : "none",
      transition: "all 0.2s",
    }
  },
  metricBox: {
    padding: "20px",
    background: "rgba(15, 23, 42, 0.6)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    borderRadius: "12px",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  metricValue: (color) => ({
    fontSize: "28px",
    fontWeight: "800",
    color: color || "#f8fafc",
    marginTop: "10px",
    textShadow: `0 0 20px ${color || '#fff'}40`,
  }),
  terminal: {
    background: "#020617",
    color: "#4ade80",
    padding: "20px",
    borderRadius: "12px",
    fontFamily: "'Fira Code', monospace",
    fontSize: "12px",
    height: "300px",
    overflowY: "auto",
    border: "1px solid #1e293b",
    boxShadow: "inset 0 0 20px rgba(0,0,0,0.8)",
  }
};

export default function DemoSimulator() {
  const [transformers, setTransformers] = useState([]);
  const [selectedTrf, setSelectedTrf] = useState("TRF-A1");
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [metrics, setMetrics] = useState({
    grossDemand: 0,
    meteredDemand: 0,
    loss: 0,
    lossPct: 0,
    temp: 0,
    aiPredict: 0,
    solarGen: 0,
    netLoad: 0,
    ambientLight: 0,
    cloudCover: 0,
    houses: []
  });

  const [injectTheft, setInjectTheft] = useState(false);
  const [injectHardware, setInjectHardware] = useState(false);
  const [solarEnabled, setSolarEnabled] = useState(true);

  // Manual Overrides
  const [sensorModes, setSensorModes] = useState({ temp: 'auto', cloud: 'auto', light: 'auto' });
  const [manualSensors, setManualSensors] = useState({ temp: 35.0, cloud: 0.5, light: 800 });
  const [houseOverrides, setHouseOverrides] = useState({});

  const handleHouseOverride = (houseId, val) => {
    setHouseOverrides(prev => {
      const copy = { ...prev };
      if (val === "") {
         delete copy[houseId];
      } else {
         copy[houseId] = parseFloat(val);
      }
      return copy;
    });
  };

  // Sync solar toggle with selected transformer
  useEffect(() => {
    const trf = transformers.find(t => (t.transformerId || t.id) === selectedTrf);
    if (trf) setSolarEnabled(trf.solarIntegrated !== false);
  }, [selectedTrf, transformers]);

  const addLog = (msg) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  const triggerTick = async () => {
    try {
      const res = await fetch(`${API_URL}/demo/tick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transformer_id: selectedTrf,
          inject_theft: injectTheft,
          inject_degradation: injectHardware,
          solar_integrated_override: solarEnabled,
          manual_overrides: {
            temp: sensorModes.temp === 'manual' ? manualSensors.temp : null,
            cloud: sensorModes.cloud === 'manual' ? manualSensors.cloud : null,
            light: sensorModes.light === 'manual' ? manualSensors.light : null,
            house_overrides: houseOverrides
          }
        }),
      });

      if (!res.ok) throw new Error("Tick Failed");
      const data = await res.json();
      const p = data.payload;

      const loss = p.gross_demand_kw - p.metered_demand_kw;
      const lossPct = (loss / p.gross_demand_kw) * 100;

      setMetrics({
        grossDemand: p.gross_demand_kw,
        meteredDemand: p.metered_demand_kw,
        loss: loss.toFixed(2),
        lossPct: lossPct.toFixed(1),
        temp: p.temperature_c,
        aiPredict: p.predicted_net_load_kw,
        solarGen: p.solar_gen_kw,
        netLoad: p.net_load_kw,
        ambientLight: p.ambient_light_lux,
        cloudCover: p.cloud_cover,
        houses: p.house_data || []
      });

      addLog(`Tick successful. Gross: ${p.gross_demand_kw}kW | Metered: ${p.metered_demand_kw}kW | Loss: ${lossPct.toFixed(1)}%`);
    } catch (e) {
      addLog(`Error: ${e.message}`);
      setIsRunning(false);
    }
  };

  useEffect(() => {
    let interval;
    if (isRunning) {
      triggerTick(); // Immediate first tick
      interval = setInterval(triggerTick, 4000); // 4-second tick rate
    }
    return () => clearInterval(interval);
  }, [isRunning, injectTheft, injectHardware, selectedTrf, sensorModes, manualSensors, houseOverrides]);

  useEffect(() => {
    fetch(`${API_URL}/transformers`)
      .then(r => r.json())
      .then(d => {
        if (d && d.length > 0) {
          setTransformers(d);
          setSelectedTrf(d[0].transformerId || d[0].id);
        }
      })
      .catch(e => console.error("Failed to load transformers", e));
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.headerTitle}>Edge AI Grid Simulator</h2>
          <p style={{ color: "#94a3b8", margin: "5px 0 0 0", fontSize: "14px" }}>
            Real-time serverless execution environment & Physics Engine
          </p>
        </div>
        <div style={{display: "flex", gap: "10px", alignItems: "center"}}>
          <div style={{width: 8, height: 8, borderRadius: "50%", background: isRunning ? "#22c55e" : "#ef4444", boxShadow: `0 0 10px ${isRunning ? "#22c55e" : "#ef4444"}`}}></div>
          <span style={{fontSize: "13px", fontWeight: "bold", color: isRunning ? "#22c55e" : "#ef4444"}}>{isRunning ? "ENGINE ACTIVE" : "ENGINE OFFLINE"}</span>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.title}>Mission Control</div>
        
        <div style={{ marginBottom: "25px", display: "flex", alignItems: "center", gap: "15px" }}>
          <label style={{ fontWeight: "600", color: "#cbd5e1" }}>Target Substation Node:</label>
          <select 
            value={selectedTrf} 
            onChange={(e) => setSelectedTrf(e.target.value)}
            style={{ 
              padding: "10px 15px", 
              borderRadius: "8px", 
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(0,0,0,0.3)",
              color: "#fff",
              outline: "none",
              cursor: "pointer",
              fontWeight: "600"
            }}
          >
            {transformers.map(t => {
              const id = t.transformerId || t.id;
              const name = t.name || t.location || "";
              const solar = t.solarCapacityKW || t.solarCapacity || 0;
              return <option key={id} value={id}>{id} - {name} ({solar > 0 ? `Solar: ${solar}kW` : 'No Solar'})</option>
            })}
          </select>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "15px" }}>
          <button 
            style={styles.btn(isRunning)} 
            onClick={() => setIsRunning(!isRunning)}
            onMouseOver={(e) => e.target.style.transform = "translateY(-2px)"}
            onMouseOut={(e) => e.target.style.transform = "translateY(0)"}
          >
            {isRunning ? "⏹ HALT SIMULATION" : "▶ IGNITE SIMULATION"}
          </button>

          <button 
            style={styles.injectBtn(injectTheft, "red")} 
            onClick={() => setInjectTheft(!injectTheft)}
          >
            {injectTheft ? "Cancel Katiya Hook" : "⚡ Inject Katiya Theft"}
          </button>

          <button 
            style={styles.injectBtn(injectHardware, "orange")} 
            onClick={() => setInjectHardware(!injectHardware)}
          >
            {injectHardware ? "Repair Hardware" : "🔥 Degrade Hardware"}
          </button>

          <button 
            style={styles.injectBtn(solarEnabled, "green")} 
            onClick={() => setSolarEnabled(!solarEnabled)}
          >
            {solarEnabled ? "☀ Solar Arrays Active" : "☁ Disable Solar Arrays"}
          </button>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.title}>Environmental Sensors (AI Inputs)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "20px" }}>
          
          {/* Temperature Sensor */}
          <div style={{ background: "rgba(0,0,0,0.2)", padding: "15px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <span style={{ fontSize: "12px", color: "#cbd5e1", fontWeight: "bold" }}>TEMPERATURE (°C)</span>
              <div style={{ display: "flex", gap: "5px", background: "rgba(0,0,0,0.3)", borderRadius: "4px", padding: "2px" }}>
                <button 
                  onClick={() => setSensorModes({...sensorModes, temp: 'auto'})}
                  style={{ background: sensorModes.temp === 'auto' ? '#38bdf8' : 'transparent', color: sensorModes.temp === 'auto' ? '#fff' : '#94a3b8', border: 'none', borderRadius: '4px', padding: "4px 8px", fontSize: "10px", cursor: "pointer", fontWeight: "bold" }}
                >AUTO</button>
                <button 
                  onClick={() => setSensorModes({...sensorModes, temp: 'manual'})}
                  style={{ background: sensorModes.temp === 'manual' ? '#fbbf24' : 'transparent', color: sensorModes.temp === 'manual' ? '#fff' : '#94a3b8', border: 'none', borderRadius: '4px', padding: "4px 8px", fontSize: "10px", cursor: "pointer", fontWeight: "bold" }}
                >MANUAL</button>
              </div>
            </div>
            {sensorModes.temp === 'manual' ? (
              <input type="number" value={manualSensors.temp} onChange={(e) => setManualSensors({...manualSensors, temp: parseFloat(e.target.value)})} style={{ width: "100%", background: "transparent", color: "#fbbf24", border: "1px solid #fbbf24", padding: "8px", borderRadius: "6px", fontSize: "18px", fontWeight: "bold", outline: "none" }} />
            ) : (
              <div style={{ color: "#38bdf8", fontSize: "18px", fontWeight: "bold" }}>{metrics.temp} °C (Engine)</div>
            )}
          </div>

          {/* Cloud Cover Sensor */}
          <div style={{ background: "rgba(0,0,0,0.2)", padding: "15px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <span style={{ fontSize: "12px", color: "#cbd5e1", fontWeight: "bold" }}>CLOUD COVER (0.0 - 1.0)</span>
              <div style={{ display: "flex", gap: "5px", background: "rgba(0,0,0,0.3)", borderRadius: "4px", padding: "2px" }}>
                <button 
                  onClick={() => setSensorModes({...sensorModes, cloud: 'auto'})}
                  style={{ background: sensorModes.cloud === 'auto' ? '#38bdf8' : 'transparent', color: sensorModes.cloud === 'auto' ? '#fff' : '#94a3b8', border: 'none', borderRadius: '4px', padding: "4px 8px", fontSize: "10px", cursor: "pointer", fontWeight: "bold" }}
                >AUTO</button>
                <button 
                  onClick={() => setSensorModes({...sensorModes, cloud: 'manual'})}
                  style={{ background: sensorModes.cloud === 'manual' ? '#fbbf24' : 'transparent', color: sensorModes.cloud === 'manual' ? '#fff' : '#94a3b8', border: 'none', borderRadius: '4px', padding: "4px 8px", fontSize: "10px", cursor: "pointer", fontWeight: "bold" }}
                >MANUAL</button>
              </div>
            </div>
            {sensorModes.cloud === 'manual' ? (
              <input type="number" step="0.1" value={manualSensors.cloud} onChange={(e) => setManualSensors({...manualSensors, cloud: parseFloat(e.target.value)})} style={{ width: "100%", background: "transparent", color: "#fbbf24", border: "1px solid #fbbf24", padding: "8px", borderRadius: "6px", fontSize: "18px", fontWeight: "bold", outline: "none" }} />
            ) : (
              <div style={{ color: "#38bdf8", fontSize: "18px", fontWeight: "bold" }}>{Math.round(metrics.cloudCover * 100)}% (Engine)</div>
            )}
          </div>

          {/* Ambient Light Sensor */}
          <div style={{ background: "rgba(0,0,0,0.2)", padding: "15px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <span style={{ fontSize: "12px", color: "#cbd5e1", fontWeight: "bold" }}>AMBIENT LIGHT (LUX)</span>
              <div style={{ display: "flex", gap: "5px", background: "rgba(0,0,0,0.3)", borderRadius: "4px", padding: "2px" }}>
                <button 
                  onClick={() => setSensorModes({...sensorModes, light: 'auto'})}
                  style={{ background: sensorModes.light === 'auto' ? '#38bdf8' : 'transparent', color: sensorModes.light === 'auto' ? '#fff' : '#94a3b8', border: 'none', borderRadius: '4px', padding: "4px 8px", fontSize: "10px", cursor: "pointer", fontWeight: "bold" }}
                >AUTO</button>
                <button 
                  onClick={() => setSensorModes({...sensorModes, light: 'manual'})}
                  style={{ background: sensorModes.light === 'manual' ? '#fbbf24' : 'transparent', color: sensorModes.light === 'manual' ? '#fff' : '#94a3b8', border: 'none', borderRadius: '4px', padding: "4px 8px", fontSize: "10px", cursor: "pointer", fontWeight: "bold" }}
                >MANUAL</button>
              </div>
            </div>
            {sensorModes.light === 'manual' ? (
              <input type="number" step="10" value={manualSensors.light} onChange={(e) => setManualSensors({...manualSensors, light: parseFloat(e.target.value)})} style={{ width: "100%", background: "transparent", color: "#fbbf24", border: "1px solid #fbbf24", padding: "8px", borderRadius: "6px", fontSize: "18px", fontWeight: "bold", outline: "none" }} />
            ) : (
              <div style={{ color: "#38bdf8", fontSize: "18px", fontWeight: "bold" }}>{metrics.ambientLight} Lux (Engine)</div>
            )}
          </div>

        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px", marginBottom: "25px" }}>
        <div style={styles.metricBox}>
          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Transformer Gross Output</div>
          <div style={styles.metricValue("#f8fafc")}>{metrics.grossDemand} kW</div>
        </div>
        <div style={styles.metricBox}>
          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Sum of Smart Meters</div>
          <div style={styles.metricValue("#4ade80")}>{metrics.meteredDemand} kW</div>
        </div>
        <div style={styles.metricBox}>
          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Unaccounted Line Loss</div>
          <div style={styles.metricValue(metrics.lossPct > 15 ? "#f87171" : metrics.lossPct > 8 ? "#fbbf24" : "#94a3b8")}>
            {metrics.loss} kW <span style={{fontSize: "14px", opacity: 0.8}}>({metrics.lossPct}%)</span>
          </div>
        </div>
        <div style={styles.metricBox}>
          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Current Net Load</div>
          <div style={styles.metricValue("#38bdf8")}>{metrics.netLoad} kW</div>
        </div>
        <div style={styles.metricBox}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>AI Prediction</span>
            <span style={{fontSize:"9px", background:"rgba(245, 158, 11, 0.2)", color: "#fbbf24", padding:"2px 6px", borderRadius:"4px", border: "1px solid rgba(245, 158, 11, 0.4)"}}>60s TICK</span>
          </div>
          <div style={styles.metricValue("#fbbf24")}>{metrics.aiPredict} kW</div>
        </div>
        <div style={styles.metricBox}>
          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Transformer Temp</div>
          <div style={styles.metricValue("#c084fc")}>{metrics.temp} °C</div>
        </div>
        <div style={styles.metricBox}>
          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Solar Generation</div>
          <div style={styles.metricValue("#fde047")}>{metrics.solarGen} kW</div>
        </div>
        <div style={styles.metricBox}>
          <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", fontWeight: "600" }}>Weather & Light</div>
          <div style={styles.metricValue("#38bdf8")}>{Math.round(metrics.cloudCover * 100)}% <span style={{fontSize: "14px", color: "#94a3b8"}}>| {metrics.ambientLight} lx</span></div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "25px" }}>
        <div style={styles.card}>
          <div style={styles.title}>Consumer Smart Meter Telemetry</div>
          <div style={{ maxHeight: "300px", overflowY: "auto", paddingRight: "10px" }}>
            <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead style={{ position: "sticky", top: 0, background: "rgba(15, 23, 42, 0.95)", backdropFilter: "blur(4px)" }}>
                <tr>
                  <th style={{ padding: "12px", color: "#94a3b8", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>House ID</th>
                  <th style={{ padding: "12px", color: "#94a3b8", borderBottom: "1px solid rgba(255,255,255,0.1)", textAlign: "right" }}>Raw Demand</th>
                  <th style={{ padding: "12px", color: "#94a3b8", borderBottom: "1px solid rgba(255,255,255,0.1)", textAlign: "center" }}>Override (kW)</th>
                  <th style={{ padding: "12px", color: "#94a3b8", borderBottom: "1px solid rgba(255,255,255,0.1)", textAlign: "right" }}>Solar Gen</th>
                  <th style={{ padding: "12px", color: "#94a3b8", borderBottom: "1px solid rgba(255,255,255,0.1)", textAlign: "right" }}>Net Demand</th>
                </tr>
              </thead>
              <tbody>
                {metrics.houses.length === 0 ? (
                  <tr><td colSpan="5" style={{ padding: "12px", textAlign: "center", color: "#64748b" }}>Waiting for telemetry streams...</td></tr>
                ) : metrics.houses.map((h, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                    <td style={{ padding: "12px", fontWeight: "bold", color: "#cbd5e1" }}>{h.house_id}</td>
                    <td style={{ padding: "12px", color: "#f8fafc", textAlign: "right" }}>{h.raw_demand_kw} kW</td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <input 
                        type="number" 
                        placeholder="Auto" 
                        value={houseOverrides[h.house_id] !== undefined ? houseOverrides[h.house_id] : ""}
                        onChange={(e) => handleHouseOverride(h.house_id, e.target.value)}
                        style={{width: "60px", background: "transparent", color: "#fbbf24", border: "1px solid #fbbf24", borderRadius: "4px", padding: "4px", outline: "none", textAlign: "center", fontSize: "12px"}} 
                      />
                    </td>
                    <td style={{ padding: "12px", color: "#fde047", textAlign: "right" }}>{h.solar_gen_kw > 0 ? `-${h.solar_gen_kw} kW` : "0 kW"}</td>
                    <td style={{ padding: "12px", color: "#38bdf8", fontWeight: "600", textAlign: "right" }}>{h.net_demand_kw} kW</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.title}>Serverless Engine Logs</div>
          <div style={styles.terminal}>
            {logs.length === 0 ? (
              <div style={{ color: "#64748b", fontStyle: "italic" }}>Waiting for simulation to ignite...</div>
            ) : logs.map((log, i) => (
              <div key={i} style={{ marginBottom: "6px", lineHeight: "1.4" }}>
                <span style={{ color: "#64748b" }}>{log.split("] ")[0]}] </span>
                <span>{log.split("] ")[1] || log}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
