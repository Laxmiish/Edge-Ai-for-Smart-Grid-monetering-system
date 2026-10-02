import React, { useEffect, useMemo, useState } from "react";

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
    marginBottom: "14px",
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
  smallPayBtn: {
    background: "#16a085",
    color: "#fff",
    border: "none",
    padding: "6px 14px",
    borderRadius: "6px",
    fontWeight: 700,
    fontSize: "12px",
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
  tableWrap: { overflowX: "auto" },
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---- Simulation settings -------------------------------------------------
// Live data har 3 sec mein update hota hai. Bill dheere dheere badhe iske liye
// har tick ko sirf "SIM_MINUTES_PER_TICK" minute ke barabar maan rahe hain.
// (0.25 => ~2 kW load par bill lagbhag Rs 0.07 per tick badhta hai.)
// Real-time chahiye to isse 0.05 kar do (3 sec = 0.05 min).
const TICK_MS = 3000;
const SIM_MINUTES_PER_TICK = 0.25;
// ---------------------------------------------------------------------------

// Month short name (e.g. "Sep") -> us bill ke generate hone ki date (agle mahine ki 1st)
function getGeneratedOn(monthShort, today) {
  const idx = MONTHS.indexOf(monthShort);
  if (idx === -1) return "1st of next month";
  // Agar bill-month abhi ke mahine se aage ka hai, to wo pichhle saal ka hai
  const billYear = idx > today.getMonth() ? today.getFullYear() - 1 : today.getFullYear();
  const genMonth = (idx + 1) % 12;
  const genYear = idx === 11 ? billYear + 1 : billYear;
  return `1 ${MONTHS[genMonth]} ${genYear}`;
}

function getBillYear(monthShort, today) {
  const idx = MONTHS.indexOf(monthShort);
  return idx > today.getMonth() ? today.getFullYear() - 1 : today.getFullYear();
}

export default function ConsumerDashboard({ consumer, onLogout, onPay }) {
  const today = new Date();
  const currentMonthShort = MONTHS[today.getMonth()];
  const currentYear = today.getFullYear();

  // Current mahine ko history se alag rakhte hain (agar history mein already hai to hata do)
  const pastHistory = useMemo(
    () => consumer.billingHistory.filter((h) => h.month !== currentMonthShort),
    [consumer, currentMonthShort]
  );

  // Rate per unit: consumer.ratePerUnit ho to wahi, warna history ke average se nikalo
  const ratePerUnit = useMemo(() => {
    if (consumer.ratePerUnit) return consumer.ratePerUnit;
    const totalUnits = pastHistory.reduce((s, h) => s + h.units, 0);
    const totalAmount = pastHistory.reduce((s, h) => s + h.amount, 0);
    return totalUnits > 0 ? totalAmount / totalUnits : 7;
  }, [consumer, pastHistory]);

  const fixedCharge = consumer.fixedCharge || 0;

  // Mahine ki shuruaat se ab tak consume hui units (starting point).
  // consumer.currentMonthUnits de sakte ho, warna average daily usage se estimate hoga.
  const startingUnits = useMemo(() => {
    if (typeof consumer.currentMonthUnits === "number") return consumer.currentMonthUnits;
    const last = pastHistory[pastHistory.length - 1];
    const avgDaily = last ? last.units / 30 : 0;
    return +(avgDaily * (today.getDate() - 1)).toFixed(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consumer, pastHistory]);

  const [live, setLive] = useState({
    usage: consumer.currentUsageKW,
    solar: consumer.solarGenKW,
  });
  // Current mahine ki total units (live badhti rahegi)
  const [monthUnits, setMonthUnits] = useState(startingUnits);

  useEffect(() => {
    setLive({ usage: consumer.currentUsageKW, solar: consumer.solarGenKW });
    setMonthUnits(startingUnits);

    const id = setInterval(() => {
      setLive((prev) => {
        const usageDelta = (Math.random() - 0.5) * 0.3;
        const solarDelta = consumer.hasSolar ? (Math.random() - 0.5) * 0.25 : 0;
        const next = {
          usage: Math.max(0.1, +(prev.usage + usageDelta).toFixed(2)),
          solar: Math.max(0, +(prev.solar + solarDelta).toFixed(2)),
        };

        // Net grid se li gayi energy (kWh) = max(0, usage - solar) * time
        const netKW = Math.max(0, next.usage - next.solar);
        const addedUnits = netKW * (SIM_MINUTES_PER_TICK / 60);
        setMonthUnits((u) => +(u + addedUnits).toFixed(3));

        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [consumer, startingUnits]);

  const netLoad = +(live.usage - live.solar).toFixed(2);
  const loadPct = Math.min(100, (live.usage / consumer.sanctionedLoadKW) * 100);

  // ---- Current month ka live bill ----
  const currentMonthBill = +(monthUnits * ratePerUnit + fixedCharge).toFixed(2);

  // ---- Unpaid bills (har mahine ki 1 tarikh ko pichhle mahine ka bill aata hai) ----
  const unpaidBills = useMemo(() => {
    let list;

    if (Array.isArray(consumer.unpaidBills)) {
      // Best: backend se seedha unpaid list
      list = consumer.unpaidBills;
    } else {
      // History mein jis bill ka status/paid flag hai usse nikalo
      list = pastHistory.filter(
        (h) => h.paid === false || (h.status && h.status !== "Paid")
      );

      // Fallback: purane data mein sirf consumer.billStatus tha -> last month ka bill unpaid maan lo
      if (list.length === 0 && consumer.billStatus && consumer.billStatus !== "Paid") {
        const last = pastHistory[pastHistory.length - 1];
        if (last) {
          list = [{ ...last, status: consumer.billStatus, dueDate: consumer.dueDate }];
        }
      }
    }

    return list.map((b) => ({
      ...b,
      status: b.status || "Due",
      generatedOn: b.generatedOn || getGeneratedOn(b.month, today),
      year: b.year || getBillYear(b.month, today),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consumer, pastHistory]);

  const totalOutstanding = unpaidBills.reduce((s, b) => s + b.amount, 0);
  const hasOverdue = unpaidBills.some((b) => b.status === "Overdue");
  const overallStatus =
    unpaidBills.length === 0 ? "Paid" : hasOverdue ? "Overdue" : "Due";

  // Consumption chart: purane mahine + current mahine (live)
  const chartData = [
    ...pastHistory.map((h) => ({ month: h.month, units: h.units, current: false })),
    { month: currentMonthShort, units: +monthUnits.toFixed(1), current: true },
  ];
  const maxUnits = Math.max(...chartData.map((h) => h.units), 1);

  // Billing history table: current mahine ki row (running) + purane bills
  const historyRows = [
    {
      month: currentMonthShort,
      year: currentYear,
      units: +monthUnits.toFixed(1),
      amount: currentMonthBill,
      running: true,
    },
    ...[...pastHistory].reverse().map((h) => ({
      ...h,
      year: h.year || getBillYear(h.month, today),
      running: false,
    })),
  ];

  const isUnpaid = (h) =>
    unpaidBills.some((b) => b.month === h.month && b.year === h.year);

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
          <span style={styles.badge(statusColors[overallStatus])}>
            {overallStatus === "Paid" ? "All Bills Paid" : `Bill ${overallStatus}`}
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
            <div style={styles.statLabel}>
              <span style={styles.liveDot}></span>
              Current Bill ({currentMonthShort} {currentYear})
            </div>
            <div style={styles.statValue}>
              ₹{currentMonthBill.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div style={styles.statSub}>
              {monthUnits.toFixed(1)} units so far · ₹{ratePerUnit.toFixed(2)}/unit · bill generates on 1{" "}
              {MONTHS[(today.getMonth() + 1) % 12]}
            </div>
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Billing Status</div>

          <div style={styles.billBanner(unpaidBills.length === 0)}>
            <div>
              {unpaidBills.length === 0 ? (
                <>
                  <div style={{ fontWeight: 700, fontSize: "16px", color: "#1b2b34" }}>
                    No unpaid bills
                  </div>
                  <div style={{ fontSize: "12.5px", color: "#7a8a94", marginTop: "4px" }}>
                    All your previous bills have been paid. Thank you!
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 700, fontSize: "16px", color: "#1b2b34" }}>
                    ₹{totalOutstanding.toLocaleString("en-IN")} outstanding
                  </div>
                  <div style={{ fontSize: "12.5px", color: "#7a8a94", marginTop: "4px" }}>
                    {unpaidBills.length} unpaid bill{unpaidBills.length > 1 ? "s" : ""} ·
                    bills are generated on the 1st of every month
                  </div>
                </>
              )}
            </div>
            {unpaidBills.length > 0 && (
              <button style={styles.payBtn} onClick={() => onPay && onPay(unpaidBills)}>
                Pay All
              </button>
            )}
          </div>

          {unpaidBills.length > 0 && (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Bill Month</th>
                    <th style={styles.th}>Generated On</th>
                    <th style={styles.th}>Units</th>
                    <th style={styles.th}>Amount</th>
                    <th style={styles.th}>Due Date</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {unpaidBills.map((b) => (
                    <tr key={`${b.month}-${b.year}`}>
                      <td style={styles.td}>
                        {b.month} {b.year}
                      </td>
                      <td style={styles.td}>{b.generatedOn}</td>
                      <td style={styles.td}>{b.units} kWh</td>
                      <td style={styles.td}>₹{b.amount.toLocaleString("en-IN")}</td>
                      <td style={styles.td}>{b.dueDate || consumer.dueDate}</td>
                      <td style={styles.td}>
                        <span style={styles.badge(statusColors[b.status] || statusColors.Due)}>
                          {b.status}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <button style={styles.smallPayBtn} onClick={() => onPay && onPay(b)}>
                          Pay Now
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Consumption History (last 6 months + this month)</div>
          <div style={styles.chartRow}>
            {chartData.map((h) => (
              <div style={styles.chartCol} key={h.month}>
                <div
                  style={styles.bar(
                    Math.max(10, (h.units / maxUnits) * 130),
                    h.current ? "#16a085" : "#9fd8c9"
                  )}
                  title={`${h.units} units${h.current ? " (so far)" : ""}`}
                ></div>
                <div style={styles.chartLabel}>{h.month}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Billing History</div>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Month</th>
                  <th style={styles.th}>Units Consumed</th>
                  <th style={styles.th}>Amount</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((h) => (
                  <tr key={`${h.month}-${h.year}`}>
                    <td style={styles.td}>
                      {h.month} {h.year}
                    </td>
                    <td style={styles.td}>{h.units} kWh</td>
                    <td style={styles.td}>₹{h.amount.toLocaleString("en-IN")}</td>
                    <td style={styles.td}>
                      {h.running ? (
                        <span style={styles.badge("#3498db")}>Running</span>
                      ) : isUnpaid(h) ? (
                        <span style={styles.badge(statusColors.Due)}>Unpaid</span>
                      ) : (
                        <span style={styles.badge(statusColors.Paid)}>Paid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}