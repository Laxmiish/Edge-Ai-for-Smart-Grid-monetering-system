import React, { useEffect, useMemo, useState } from "react";
import DpuSimulator from "./DpuSimulator";
import PredictiveMaintenance from "./PredictiveMaintenance";

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f2f5f7",
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
  },
  topbar: {
    background: "linear-gradient(120deg, #1b2b34, #203a43)",
    color: "#fff",
    padding: "18px 28px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "10px",
  },
  brand: { fontSize: "18px", fontWeight: 700 },
  logoutBtn: {
    background: "rgba(255,255,255,0.15)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.4)",
    padding: "8px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
  },
  container: { padding: "24px", maxWidth: "1200px", margin: "0 auto" },
  tabs: { display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" },
  tabBtn: (active) => ({
    padding: "10px 18px",
    borderRadius: "8px",
    border: active ? "1.5px solid #16a085" : "1.5px solid #dde3e6",
    background: active ? "#0f9b6e" : "#fff",
    color: active ? "#fff" : "#4a5760",
    fontWeight: 700,
    fontSize: "13px",
    cursor: "pointer",
  }),
  tabCount: (active) => ({
    display: "inline-block",
    marginLeft: "8px",
    minWidth: "20px",
    padding: "1px 7px",
    borderRadius: "10px",
    fontSize: "11px",
    textAlign: "center",
    background: active ? "rgba(255,255,255,0.28)" : "#e74c3c",
    color: "#fff",
  }),
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
    marginBottom: "20px",
  },
  statCard: {
    background: "#fff",
    borderRadius: "12px",
    padding: "18px 20px",
    boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
    borderLeft: "5px solid #16a085",
  },
  statLabel: { fontSize: "12.5px", color: "#8a97a0", fontWeight: 600 },
  statValue: { fontSize: "26px", fontWeight: 800, color: "#1b2b34", marginTop: "6px" },
  statSub: { fontSize: "11.5px", color: "#a4aeb5", marginTop: "4px" },
  section: {
    background: "#fff",
    borderRadius: "12px",
    padding: "22px 24px",
    boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
    marginBottom: "20px",
  },
  sectionTitle: {
    fontSize: "15.5px",
    fontWeight: 700,
    color: "#1b2b34",
    marginBottom: "16px",
  },
  sectionHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "10px",
    marginBottom: "16px",
  },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    fontSize: "12px",
    color: "#8a97a0",
    padding: "10px 8px",
    borderBottom: "2px solid #eef1f2",
    whiteSpace: "nowrap",
  },
  td: {
    fontSize: "13.5px",
    color: "#3a464e",
    padding: "10px 8px",
    borderBottom: "1px solid #f1f3f4",
    whiteSpace: "nowrap",
    verticalAlign: "middle",
  },
  pill: (color) => ({
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: "20px",
    fontSize: "11.5px",
    fontWeight: 700,
    color: "#fff",
    background: color,
  }),
  toggleWrap: { display: "flex", alignItems: "center", gap: "8px" },
  // Toggle: flex use kiya hai taaki knob kabhi vertically idhar-udhar na jaye
  toggle: (on) => ({
    width: "42px",
    height: "22px",
    borderRadius: "20px",
    background: on ? "#16a085" : "#ccd3d6",
    display: "flex",
    alignItems: "center",
    padding: "2px",
    boxSizing: "border-box",
    border: "none",
    cursor: "pointer",
    transition: "background 0.2s ease",
    flexShrink: 0,
  }),
  knob: (on) => ({
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    background: "#fff",
    transform: on ? "translateX(20px)" : "translateX(0)",
    transition: "transform 0.2s ease",
    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
  }),
  formRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "14px",
    marginBottom: "14px",
  },
  label: { fontSize: "12.5px", fontWeight: 600, color: "#4a5760", marginBottom: "6px" },
  input: {
    padding: "10px 12px",
    fontSize: "13.5px",
    border: "1.5px solid #ddd",
    borderRadius: "8px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  addBtn: {
    background: "#16a085",
    color: "#fff",
    border: "none",
    padding: "11px 22px",
    borderRadius: "8px",
    fontWeight: 700,
    fontSize: "13.5px",
    cursor: "pointer",
  },
  alertItem: (level) => ({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 14px",
    borderRadius: "8px",
    marginBottom: "8px",
    background: level === "high" ? "#fdecea" : "#fff8e6",
    border: `1px solid ${level === "high" ? "#f5c6c3" : "#ffe6a8"}`,
    fontSize: "13px",
    flexWrap: "wrap",
    gap: "8px",
  }),
  alertActions: { display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 },
  resolveBtn: {
    background: "#fff",
    color: "#0e7c5a",
    border: "1.5px solid #16a085",
    padding: "5px 12px",
    borderRadius: "6px",
    fontWeight: 700,
    fontSize: "12px",
    cursor: "pointer",
  },
  resolvedItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 14px",
    borderRadius: "8px",
    marginBottom: "8px",
    background: "#f4f7f8",
    border: "1px solid #e3e9ec",
    fontSize: "13px",
    color: "#7a8a94",
    flexWrap: "wrap",
    gap: "8px",
  },
  reopenBtn: {
    background: "transparent",
    color: "#4a5760",
    border: "1.5px solid #cfd8dc",
    padding: "5px 12px",
    borderRadius: "6px",
    fontWeight: 700,
    fontSize: "12px",
    cursor: "pointer",
  },
  linkBtn: {
    background: "transparent",
    border: "none",
    color: "#16a085",
    fontWeight: 700,
    fontSize: "12.5px",
    cursor: "pointer",
    padding: 0,
  },
  successMsg: {
    background: "#eafaf3",
    border: "1px solid #b7ecd6",
    color: "#0e7c5a",
    padding: "10px 14px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 600,
    marginBottom: "14px",
  },
};

const billBadge = { Paid: "#2ecc71", Due: "#f39c12", Overdue: "#e74c3c" };
const statusBadge = { Healthy: "#2ecc71", Watch: "#f39c12", Critical: "#e74c3c" };

const faultTitle = {
  OVERLOAD: "Transformer overload",
  PREDICTED_OVERLOAD: "Predicted overload (Edge AI)",
  OVERHEAT: "Overheating",
  LOAD_DROP: "Sudden load drop",
  SOLAR_UNDERPERFORMANCE: "Solar underperformance",
  SENSOR_FLATLINE: "Stuck sensor",
  COMMUNICATION_LOSS: "Communication loss",
  THEFT_DETECTED: "Unmetered Line Tapping (Katiya Theft)",
  AGING_HARDWARE: "High Technical Loss (Aging Hardware)",
};

const formatTime = (ts) =>
  new Date(ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export default function GovernmentDashboard({
  consumers,
  transformers,
  faults = [],
  maintenanceLogs = [],
  onResolveFault,
  onLogout,
  onToggleSolar,
  onAddSolarPlant,
}) {
  const [tab, setTab] = useState("overview");
  const [form, setForm] = useState({
    transformerId: "",
    capacity: "",
  });
  const [maintenanceForm, setMaintenanceForm] = useState({
    transformer_id: "",
    technician: "",
    action_taken: "",
    cost: "",
  });
  const [msg, setMsg] = useState("");

  // Resolved alerts: { [alertId]: timestamp }
  const [resolved, setResolved] = useState({});
  const [showResolved, setShowResolved] = useState(false);

  // Transformers ko hamesha ID ke hisaab se fixed order mein dikhate hain.
  // Isse parent array ka order badle (jaise toggle ke baad row end mein push ho)
  // tab bhi table mein row apni jagah par hi rahegi.
  const sortedTransformers = useMemo(
    () =>
      [...transformers].sort((a, b) =>
        String(a.transformerId).localeCompare(String(b.transformerId), undefined, {
          numeric: true,
        })
      ),
    [transformers]
  );

  // simulated live grid load nudges
  const [liveLoads, setLiveLoads] = useState({});
  useEffect(() => {
    const base = {};
    transformers.forEach((t) => {
      base[t.transformerId] = consumers
        .filter((c) => c.transformerId === t.transformerId)
        .reduce((sum, c) => sum + c.currentUsageKW - c.solarGenKW, 0);
    });
    setLiveLoads(base);
    const id = setInterval(() => {
      setLiveLoads((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => {
          next[k] = Math.max(0, +(next[k] + (Math.random() - 0.5) * 3).toFixed(1));
        });
        return next;
      });
    }, 3000);
    return () => clearInterval(id);
  }, [transformers, consumers]);

  const totalDemand = useMemo(
    () => consumers.reduce((s, c) => s + c.currentUsageKW, 0),
    [consumers]
  );
  const totalSolar = useMemo(
    () => consumers.reduce((s, c) => s + c.solarGenKW, 0),
    [consumers]
  );
  const solarTransformers = transformers.filter((t) => t.solarIntegrated).length;

  // ---- Saare alerts ek list mein (har alert ki unique id ke saath) ----
  const allAlerts = useMemo(() => {
    const list = [];

    consumers
      .filter((c) => c.billStatus === "Overdue")
      .forEach((c) =>
        list.push({
          id: `bill-${c.consumerId}`,
          type: "overdue",
          level: "medium",
          pillColor: "#f39c12",
          pillText: "Medium",
          body: (
            <>
              💰 <b>Overdue payment</b> — {c.name} ({c.consumerId}): ₹
              {c.currentBill.toLocaleString("en-IN")} overdue since {c.dueDate}.
            </>
          ),
        })
      );

    // Fault detection engine (backend) se aaye faults
    faults.forEach((f) =>
      list.push({
        id: `fault-${f.id}`,
        type: "fault",
        originalFaultType: f.type,
        level: f.severity === "CRITICAL" ? "high" : "medium",
        pillColor: f.severity === "CRITICAL" ? "#e74c3c" : "#f39c12",
        pillText: f.severity === "CRITICAL" ? "Critical" : "Warning",
        serverStatus: f.status,
        resolvedAt: f.resolvedAt ? new Date(f.resolvedAt).getTime() : null,
        resolvedLabel: f.status === "auto_cleared" ? "Auto-cleared" : "Resolved",
        body: (
          <>
            🔧 <b>{faultTitle[f.type] || f.type}</b> — {f.transformerId}: {f.message}
          </>
        ),
      })
    );

    return list;
  }, [consumers, faults]);

  // Fault alerts ka resolved status server (DB) se aata hai, baaki ka local state se
  const isResolved = (a) => (a.type === "fault" ? a.serverStatus !== "open" : !!resolved[a.id]);
  const resolvedTime = (a) => (a.type === "fault" ? a.resolvedAt : resolved[a.id]);

  const activeAlerts = allAlerts.filter((a) => !isResolved(a));
  const resolvedAlerts = allAlerts
    .filter(isResolved)
    .sort((a, b) => (resolvedTime(b) || 0) - (resolvedTime(a) || 0));

  // Overview card ke counts (sirf unresolved)
  const theftCount = activeAlerts.filter((a) => a.originalFaultType === "THEFT_DETECTED").length;
  const overdueCount = activeAlerts.filter((a) => a.type === "overdue").length;
  const faultAlertCount = activeAlerts.filter((a) => a.type === "fault").length;

  const resolveAlert = (id) => {
    if (id.startsWith("fault-")) {
      // Fault ko DB mein resolved mark karo (refresh par bhi saved rahega)
      if (onResolveFault) onResolveFault(Number(id.slice(6)));
      return;
    }
    setResolved((prev) => ({ ...prev, [id]: Date.now() }));
  };
  const reopenAlert = (id) =>
    setResolved((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  const clearResolved = () => {
    setResolved({});
    setShowResolved(false);
  };

  const handleAddSolar = (e) => {
    e.preventDefault();
    if (!form.transformerId || !form.capacity) return;
    onAddSolarPlant(form.transformerId, Number(form.capacity));
    setMsg(
      `Solar capacity of ${form.capacity} kW added to ${form.transformerId}.`
    );
    setForm({ transformerId: "", capacity: "" });
    setTimeout(() => setMsg(""), 4000);
  };

  const handleAddMaintenanceLog = async (e) => {
    e.preventDefault();
    try {
      await fetch("http://localhost:3000/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transformer_id: maintenanceForm.transformer_id,
          technician: maintenanceForm.technician,
          action_taken: maintenanceForm.action_taken,
          cost: Number(maintenanceForm.cost),
        }),
      });
      setMaintenanceForm({ transformer_id: "", technician: "", action_taken: "", cost: "" });
      setMsg("Maintenance log added! Refresh to see it.");
      setTimeout(() => setMsg(""), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={styles.brand}>🏛️ Government Grid Control Room</div>
        <button style={styles.logoutBtn} onClick={onLogout}>
          Logout
        </button>
      </div>

      <div style={styles.container}>
        <div style={styles.tabs}>
          <button style={styles.tabBtn(tab === "overview")} onClick={() => setTab("overview")}>
            Overview
          </button>
          <button style={styles.tabBtn(tab === "transformers")} onClick={() => setTab("transformers")}>
            Transformers &amp; Solar
          </button>
          <button style={styles.tabBtn(tab === "consumers")} onClick={() => setTab("consumers")}>
            Consumers &amp; Billing
          </button>
          <button style={styles.tabBtn(tab === "maintenance")} onClick={() => setTab("maintenance")}>
            Maintenance
          </button>
          <button style={styles.tabBtn(tab === "alerts")} onClick={() => setTab("alerts")}>
            Alerts
            {activeAlerts.length > 0 && (
              <span style={styles.tabCount(tab === "alerts")}>{activeAlerts.length}</span>
            )}
          </button>
        </div>

        {tab === "overview" && (
          <>
            <div style={styles.grid}>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>Total Grid Demand</div>
                <div style={styles.statValue}>{totalDemand.toFixed(1)} kW</div>
                <div style={styles.statSub}>Across {consumers.length} connections</div>
              </div>
              <div style={{ ...styles.statCard, borderLeftColor: "#f39c12" }}>
                <div style={styles.statLabel}>Total Solar Generation</div>
                <div style={styles.statValue}>{totalSolar.toFixed(1)} kW</div>
                <div style={styles.statSub}>{solarTransformers} of {transformers.length} transformers solar-integrated</div>
              </div>
              <div style={{ ...styles.statCard, borderLeftColor: "#3498db" }}>
                <div style={styles.statLabel}>Net Grid Load</div>
                <div style={styles.statValue}>{(totalDemand - totalSolar).toFixed(1)} kW</div>
                <div style={styles.statSub}>Demand minus solar offset</div>
              </div>
              <div style={{ ...styles.statCard, borderLeftColor: "#e74c3c" }}>
                <div style={styles.statLabel}>Active Alerts</div>
                <div style={styles.statValue}>{activeAlerts.length}</div>
                <div style={styles.statSub}>
                  {theftCount} theft flags · {overdueCount} overdue bills ·{" "}
                  {faultAlertCount} equipment faults
                </div>
              </div>
            </div>

            <div style={styles.section}>
              <div style={styles.sectionTitle}>Live Load by Transformer</div>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Transformer</th>
                      <th style={styles.th}>Location</th>
                      <th style={styles.th}>Live Net Load</th>
                      <th style={styles.th}>Rated Capacity</th>
                      <th style={styles.th}>Load %</th>
                      <th style={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTransformers.map((t) => {
                      const load = liveLoads[t.transformerId] ?? 0;
                      const pct = Math.min(100, (load / t.ratedCapacityKW) * 100);
                      return (
                        <tr key={t.transformerId}>
                          <td style={styles.td}>{t.transformerId}</td>
                          <td style={styles.td}>{t.location}</td>
                          <td style={styles.td}>{load.toFixed(1)} kW</td>
                          <td style={styles.td}>{t.ratedCapacityKW} kW</td>
                          <td style={styles.td}>{pct.toFixed(0)}%</td>
                          <td style={styles.td}>
                            <span style={styles.pill(statusBadge[t.status])}>{t.status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {tab === "transformers" && (
          <>
            <div style={styles.section}>
              <div style={styles.sectionTitle}>➕ Add / Expand Solar Integration</div>
              {msg && <div style={styles.successMsg}>{msg}</div>}
              <form onSubmit={handleAddSolar}>
                <div style={styles.formRow}>
                  <div>
                    <div style={styles.label}>Transformer</div>
                    <select
                      style={styles.input}
                      value={form.transformerId}
                      onChange={(e) => setForm({ ...form, transformerId: e.target.value })}
                      required
                    >
                      <option value="">Select transformer</option>
                      {sortedTransformers.map((t) => (
                        <option key={t.transformerId} value={t.transformerId}>
                          {t.transformerId} — {t.location}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div style={styles.label}>Additional Solar Capacity (kW)</div>
                    <input
                      style={styles.input}
                      type="number"
                      min="1"
                      placeholder="e.g. 20"
                      value={form.capacity}
                      onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <button type="submit" style={styles.addBtn}>
                  Add Solar Capacity
                </button>
              </form>
            </div>

            <div style={styles.section}>
              <div style={styles.sectionTitle}>Transformer Solar Status</div>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Transformer</th>
                      <th style={styles.th}>Location</th>
                      <th style={styles.th}>Solar Capacity</th>
                      <th style={styles.th}>Solar Integrated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTransformers.map((t) => (
                      <tr key={t.transformerId}>
                        <td style={styles.td}>{t.transformerId}</td>
                        <td style={styles.td}>{t.location}</td>
                        <td style={styles.td}>{t.solarCapacityKW} kW</td>
                        <td style={styles.td}>
                          <div style={styles.toggleWrap}>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={!!t.solarIntegrated}
                              aria-label={`Solar integration for ${t.transformerId}`}
                              style={styles.toggle(t.solarIntegrated)}
                              onClick={() => onToggleSolar(t.transformerId)}
                            >
                              <div style={styles.knob(t.solarIntegrated)}></div>
                            </button>
                            <span style={{ fontSize: "12.5px", color: "#8a97a0" }}>
                              {t.solarIntegrated ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <DpuSimulator transformers={sortedTransformers} />
          </>
        )}

        {tab === "consumers" && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>All Consumers</div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Consumer ID</th>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Category</th>
                    <th style={styles.th}>Transformer</th>
                    <th style={styles.th}>Usage</th>
                    <th style={styles.th}>Solar</th>
                    <th style={styles.th}>Bill</th>
                    <th style={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {consumers.map((c) => (
                    <tr key={c.consumerId}>
                      <td style={styles.td}>{c.consumerId}</td>
                      <td style={styles.td}>{c.name}</td>
                      <td style={styles.td}>{c.category}</td>
                      <td style={styles.td}>{c.transformerId}</td>
                      <td style={styles.td}>{c.currentUsageKW} kW</td>
                      <td style={styles.td}>{c.hasSolar ? `${c.solarGenKW} kW` : "—"}</td>
                      <td style={styles.td}>₹{c.currentBill.toLocaleString("en-IN")}</td>
                      <td style={styles.td}>
                        <span style={styles.pill(billBadge[c.billStatus])}>{c.billStatus}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "maintenance" && (
          <>
          <div style={styles.section}>
            <div style={styles.sectionTitle}>➕ Log New Maintenance Action</div>
            {msg && <div style={styles.successMsg}>{msg}</div>}
            <form onSubmit={handleAddMaintenanceLog}>
              <div style={styles.formRow}>
                <div>
                  <div style={styles.label}>Transformer</div>
                  <select
                    style={styles.input}
                    value={maintenanceForm.transformer_id}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, transformer_id: e.target.value })}
                    required
                  >
                    <option value="">Select transformer</option>
                    {sortedTransformers.map((t) => (
                      <option key={t.transformerId} value={t.transformerId}>{t.transformerId}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={styles.label}>Technician Name</div>
                  <input
                    style={styles.input}
                    type="text"
                    value={maintenanceForm.technician}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, technician: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <div style={styles.label}>Cost (₹)</div>
                  <input
                    style={styles.input}
                    type="number"
                    value={maintenanceForm.cost}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, cost: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div style={styles.formRow}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={styles.label}>Action Taken</div>
                  <input
                    style={styles.input}
                    type="text"
                    placeholder="e.g. Replaced cooling oil"
                    value={maintenanceForm.action_taken}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, action_taken: e.target.value })}
                    required
                  />
                </div>
              </div>
              <button type="submit" style={styles.addBtn}>
                Submit Log
              </button>
            </form>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionTitle}>Transformer Maintenance Records</div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Date</th>
                    <th style={styles.th}>Transformer</th>
                    <th style={styles.th}>Technician</th>
                    <th style={styles.th}>Action Taken</th>
                    <th style={styles.th}>Cost (₹)</th>
                    <th style={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenanceLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={styles.td}>{new Date(log.date).toLocaleDateString("en-IN")}</td>
                      <td style={styles.td}>{log.transformer_id}</td>
                      <td style={styles.td}>{log.technician}</td>
                      <td style={styles.td}>{log.action_taken}</td>
                      <td style={styles.td}>₹{log.cost.toLocaleString("en-IN")}</td>
                      <td style={styles.td}>
                        <span style={styles.pill(log.status === "Completed" ? "#2ecc71" : "#f39c12")}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {maintenanceLogs.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ ...styles.td, textAlign: "center", color: "#8a97a0", padding: "20px" }}>
                        No maintenance logs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
          <PredictiveMaintenance transformers={sortedTransformers} faults={faults} />
        </>
        )}

        {tab === "alerts" && (
          <>
            <div style={styles.section}>
              <div style={styles.sectionTitle}>
                Theft, Billing &amp; Fault Alerts ({activeAlerts.length})
              </div>

              {activeAlerts.length === 0 && (
                <div style={{ fontSize: "13.5px", color: "#8a97a0" }}>
                  {allAlerts.length === 0
                    ? "No active alerts."
                    : "Sab alerts resolve ho chuke hain. Koi active alert nahi hai."}
                </div>
              )}

              {activeAlerts.map((a) => (
                <div style={styles.alertItem(a.level)} key={a.id}>
                  <span style={{ flex: 1, minWidth: "220px" }}>{a.body}</span>
                  <div style={styles.alertActions}>
                    <span style={styles.pill(a.pillColor)}>{a.pillText}</span>
                    <button
                      type="button"
                      style={styles.resolveBtn}
                      onClick={() => resolveAlert(a.id)}
                      title="Action le liya gaya hai — alert ko resolved mark karo"
                    >
                      ✓ Mark Resolved
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {resolvedAlerts.length > 0 && (
              <div style={styles.section}>
                <div style={styles.sectionHeaderRow}>
                  <div style={{ ...styles.sectionTitle, marginBottom: 0 }}>
                    Resolved Alerts ({resolvedAlerts.length})
                  </div>
                  <div style={{ display: "flex", gap: "16px" }}>
                    <button
                      type="button"
                      style={styles.linkBtn}
                      onClick={() => setShowResolved((s) => !s)}
                    >
                      {showResolved ? "Hide" : "Show"}
                    </button>
                    <button type="button" style={styles.linkBtn} onClick={clearResolved}>
                      Clear all
                    </button>
                  </div>
                </div>

                {showResolved &&
                  resolvedAlerts.map((a) => (
                    <div style={styles.resolvedItem} key={a.id}>
                      <span style={{ flex: 1, minWidth: "220px" }}>
                        {a.body}
                        <div style={{ fontSize: "11.5px", marginTop: "4px", color: "#a4aeb5" }}>
                          {a.resolvedLabel || "Resolved"} on {formatTime(resolvedTime(a))}
                        </div>
                      </span>
                      <div style={styles.alertActions}>
                        <span style={styles.pill("#2ecc71")}>{a.resolvedLabel || "Resolved"}</span>
                        {a.type !== "fault" && (
                          <button
                            type="button"
                            style={styles.reopenBtn}
                            onClick={() => reopenAlert(a.id)}
                          >
                            Reopen
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}