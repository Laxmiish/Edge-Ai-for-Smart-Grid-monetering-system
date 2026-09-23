import React, { useEffect, useState } from "react";

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f2f5f7",
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
  },
  topbar: {
    background: "linear-gradient(120deg, #0f9b6e, #16a085)",
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
    background: "rgba(255,255,255,0.18)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.5)",
    padding: "8px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
  },
  container: { padding: "24px", maxWidth: "1100px", margin: "0 auto" },
  welcomeCard: {
    background: "#fff",
    borderRadius: "12px",
    padding: "20px 24px",
    boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
    marginBottom: "20px",
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "12px",
  },
  name: { fontSize: "20px", fontWeight: 700, color: "#1b2b34" },
  meta: { fontSize: "13px", color: "#7a8a94", marginTop: "4px" },
  badge: (color) => ({
    display: "inline-block",
    padding: "4px 12px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: 700,
    color: "#fff",
    background: color,
    height: "fit-content",
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
  chartRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: "14px",
    height: "160px",
    padding: "0 6px",
  },
  chartCol: { display: "flex", flexDirection: "column", alignItems: "center", flex: 1 },
  bar: (h, color) => ({
    width: "26px",
    height: `${h}px`,
    background: color,
    borderRadius: "6px 6px 2px 2px",
    transition: "height 0.4s ease",
  }),
  chartLabel: { fontSize: "11px", color: "#8a97a0", marginTop: "6px" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    fontSize: "12px",
    color: "#8a97a0",
    padding: "10px 8px",
    borderBottom: "2px solid #eef1f2",
  },
  td: {
    fontSize: "13.5px",
    color: "#3a464e",
    padding: "10px 8px",
    borderBottom: "1px solid #f1f3f4",
  },
  billBanner: (ok) => ({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "12px",
    background: ok ? "#eafaf3" : "#fff4e5",
    border: `1px solid ${ok ? "#b7ecd6" : "#ffdca8"}`,
    borderRadius: "10px",
    padding: "16px 18px",
  }),
  payBtn: {
    background: "#16a085",
    color: "#fff",
    border: "none",
    padding: "10px 22px",
    borderRadius: "8px",
    fontWeight: 700,
    fontSize: "13.5px",
    cursor: "pointer",
  },
  alertBox: {
    background: "#fdecea",
    border: "1px solid #f5c6c3",
    color: "#c0392b",
    padding: "12px 16px",
    borderRadius: "8px",
    fontSize: "13px",
    marginBottom: "20px",
    fontWeight: 600,
  },
  liveDot: {
    display: "inline-block",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "#2ecc71",
    marginRight: "6px",
    boxShadow: "0 0 0 rgba(46,204,113,0.6)",
    animation: "none",
  },
};

const statusColors = {
  Paid: "#2ecc71",
  Due: "#f39c12",
  Overdue: "#e74c3c",
};

export default function ConsumerDashboard({ consumer, onLogout, onPay }) {
  // Simulated live telemetry — nudges usage/solar values slightly every few
  // seconds to represent the Edge DPU streaming fresh readings.
  const [live, setLive] = useState({
    usage: consumer.currentUsageKW,
    solar: consumer.solarGenKW,
  });

  useEffect(() => {
    setLive({ usage: consumer.currentUsageKW, solar: consumer.solarGenKW });
    const id = setInterval(() => {
      setLive((prev) => {
        const usageDelta = (Math.random() - 0.5) * 0.3;
        const solarDelta = consumer.hasSolar ? (Math.random() - 0.5) * 0.25 : 0;
        return {
          usage: Math.max(0.1, +(prev.usage + usageDelta).toFixed(2)),
          solar: Math.max(0, +(prev.solar + solarDelta).toFixed(2)),
        };
      });
    }, 3000);
    return () => clearInterval(id);
  }, [consumer]);

  const netLoad = +(live.usage - live.solar).toFixed(2);
  const loadPct = Math.min(100, (live.usage / consumer.sanctionedLoadKW) * 100);

  const maxUnits = Math.max(...consumer.billingHistory.map((h) => h.units));

  return (
    <div style={styles.page}>
      <div style={styles.topbar}>
        <div style={styles.brand}>⚡ Consumer Dashboard</div>
        <button style={styles.logoutBtn} onClick={onLogout}>
          Logout
        </button>
      </div>

      <div style={styles.container}>
        {consumer.theftFlag && (
          <div style={styles.alertBox}>
            ⚠ Unusual consumption pattern detected on your connection in
            August. A field inspection may be scheduled. Contact your
            utility office if you believe this is in error.
          </div>
        )}

        <div style={styles.welcomeCard}>
          <div>
            <div style={styles.name}>{consumer.name}</div>
            <div style={styles.meta}>
              {consumer.consumerId} · {consumer.address}
            </div>
            <div style={styles.meta}>
              Transformer: {consumer.transformerId} · Category: {consumer.category}
            </div>
          </div>
          <span style={styles.badge(statusColors[consumer.billStatus])}>
            Bill {consumer.billStatus}
          </span>
        </div>

        <div style={styles.grid}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>
              <span style={styles.liveDot}></span>Current Usage
            </div>
            <div style={styles.statValue}>{live.usage.toFixed(2)} kW</div>
            <div style={styles.statSub}>
              {loadPct.toFixed(0)}% of {consumer.sanctionedLoadKW} kW sanctioned load
            </div>
          </div>

          <div style={{ ...styles.statCard, borderLeftColor: "#f39c12" }}>
            <div style={styles.statLabel}>Solar Generation</div>
            <div style={styles.statValue}>
              {consumer.hasSolar ? `${live.solar.toFixed(2)} kW` : "—"}
            </div>
            <div style={styles.statSub}>
              {consumer.hasSolar
                ? "Rooftop solar connected"
                : "No solar connection registered"}
            </div>
          </div>

          <div
            style={{
              ...styles.statCard,
              borderLeftColor: netLoad < 0 ? "#2ecc71" : "#3498db",
            }}
          >
            <div style={styles.statLabel}>Net Load (Demand − Solar)</div>
            <div style={styles.statValue}>
              {netLoad < 0 ? `+${Math.abs(netLoad)}` : netLoad} kW
            </div>
            <div style={styles.statSub}>
              {netLoad < 0
                ? "Exporting surplus to grid"
                : "Drawing from grid"}
            </div>
          </div>

          <div style={{ ...styles.statCard, borderLeftColor: "#8e44ad" }}>
            <div style={styles.statLabel}>Current Bill</div>
            <div style={styles.statValue}>₹{consumer.currentBill.toLocaleString("en-IN")}</div>
            <div style={styles.statSub}>Due by {consumer.dueDate}</div>
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Billing Status</div>
          <div style={styles.billBanner(consumer.billStatus === "Paid")}>
            <div>
              <div style={{ fontWeight: 700, fontSize: "16px", color: "#1b2b34" }}>
                ₹{consumer.currentBill.toLocaleString("en-IN")}
              </div>
              <div style={{ fontSize: "12.5px", color: "#7a8a94", marginTop: "4px" }}>
                {consumer.billStatus === "Paid"
                  ? "Your latest bill has been paid. Thank you!"
                  : `Payment ${consumer.billStatus.toLowerCase()} — due ${consumer.dueDate}`}
              </div>
            </div>
            {consumer.billStatus !== "Paid" && (
              <button style={styles.payBtn} onClick={onPay}>
                Pay Now
              </button>
            )}
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Consumption History (last 6 months)</div>
          <div style={styles.chartRow}>
            {consumer.billingHistory.map((h) => (
              <div style={styles.chartCol} key={h.month}>
                <div
                  style={styles.bar(
                    Math.max(10, (h.units / maxUnits) * 130),
                    h.month === "Sep" ? "#16a085" : "#9fd8c9"
                  )}
                  title={`${h.units} units`}
                ></div>
                <div style={styles.chartLabel}>{h.month}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Billing History</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Month</th>
                <th style={styles.th}>Units Consumed</th>
                <th style={styles.th}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {[...consumer.billingHistory].reverse().map((h) => (
                <tr key={h.month}>
                  <td style={styles.td}>{h.month} 2026</td>
                  <td style={styles.td}>{h.units} kWh</td>
                  <td style={styles.td}>₹{h.amount.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
