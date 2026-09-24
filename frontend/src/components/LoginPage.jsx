import React, { useState } from "react";
const styles = {
  page: {
    minHeight: "100vh",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)",
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
    padding: "24px",
    boxSizing: "border-box",
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    background: "#ffffff",
    borderRadius: "16px",
    boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
    overflow: "hidden",
  },
  header: {
    background: "linear-gradient(120deg, #0f9b6e, #16a085)",
    color: "#fff",
    padding: "24px 28px",
    textAlign: "center",
  },
  headerTitle: {
    margin: 0,
    fontSize: "20px",
    fontWeight: 700,
    letterSpacing: "0.3px",
  },
  headerSub: {
    margin: "6px 0 0 0",
    fontSize: "12.5px",
    opacity: 0.9,
  },
  tabRow: {
    display: "flex",
    borderBottom: "1px solid #eee",
  },
  tabBtn: (active) => ({
    flex: 1,
    padding: "14px 8px",
    border: "none",
    background: active ? "#f4fbf8" : "#fafafa",
    color: active ? "#0f9b6e" : "#888",
    fontWeight: active ? 700 : 500,
    fontSize: "14px",
    cursor: "pointer",
    borderBottom: active ? "3px solid #0f9b6e" : "3px solid transparent",
    transition: "all 0.2s ease",
  }),
  form: {
    padding: "28px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  label: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#333",
    marginBottom: "-8px",
  },
  input: {
    padding: "12px 14px",
    fontSize: "14px",
    border: "1.5px solid #ddd",
    borderRadius: "8px",
    outline: "none",
    boxSizing: "border-box",
    width: "100%",
    transition: "border-color 0.2s ease",
  },
  hint: {
    fontSize: "11.5px",
    color: "#999",
    marginTop: "-10px",
  },
  submitBtn: {
    marginTop: "6px",
    padding: "13px",
    fontSize: "14.5px",
    fontWeight: 700,
    color: "#fff",
    background: "linear-gradient(120deg, #0f9b6e, #16a085)",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    letterSpacing: "0.3px",
    boxShadow: "0 6px 16px rgba(22,160,133,0.35)",
  },
  error: {
    background: "#fdecea",
    color: "#c0392b",
    fontSize: "12.5px",
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid #f5c6c3",
  },
  demoBox: {
    background: "#f7f9fb",
    borderRadius: "8px",
    padding: "10px 12px",
    fontSize: "11.5px",
    color: "#667",
    lineHeight: 1.6,
  },
  footer: {
    textAlign: "center",
    fontSize: "11px",
    color: "rgba(255,255,255,0.75)",
    marginTop: "18px",
  },
};

export default function LoginPage({ onConsumerLogin, onGovLogin }) {
  const [tab, setTab] = useState("consumer");

  // consumer form state
  const [consumerId, setConsumerId] = useState("");
  const [phone, setPhone] = useState("");

  // government form state
  const [govUser, setGovUser] = useState("");
  const [govPass, setGovPass] = useState("");

  const [error, setError] = useState("");

  const handleConsumerSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const result = await onConsumerLogin(consumerId.trim(), phone.trim());
    if (result && !result.ok) setError(result.message);
  };

  const handleGovSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const result = await onGovLogin(govUser.trim(), govPass.trim());
    if (result && !result.ok) setError(result.message);
  };

  return (
    <div style={styles.page}>
      <div>
        <div style={styles.card}>
          <div style={styles.header}>
            <h1 style={styles.headerTitle}>⚡ Smart Grid Monitoring System</h1>
            <p style={styles.headerSub}>
              Edge AI powered net-load forecasting &amp; billing platform
            </p>
          </div>

          <div style={styles.tabRow}>
            <button
              style={styles.tabBtn(tab === "consumer")}
              onClick={() => {
                setTab("consumer");
                setError("");
              }}
            >
              👤 Consumer Login
            </button>
            <button
              style={styles.tabBtn(tab === "gov")}
              onClick={() => {
                setTab("gov");
                setError("");
              }}
            >
              🏛️ Government Portal
            </button>
          </div>

          {tab === "consumer" ? (
            <form style={styles.form} onSubmit={handleConsumerSubmit}>
              <div style={styles.label}>Consumer ID</div>
              <input
                style={styles.input}
                type="text"
                placeholder="e.g. BBDU-CN-1001"
                value={consumerId}
                onChange={(e) => setConsumerId(e.target.value)}
                onFocus={(e) => (e.target.style.borderColor = "#16a085")}
                onBlur={(e) => (e.target.style.borderColor = "#ddd")}
                required
              />

              <div style={styles.label}>Registered Mobile Number (Password)</div>
              <input
                style={styles.input}
                type="password"
                placeholder="10-digit mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onFocus={(e) => (e.target.style.borderColor = "#16a085")}
                onBlur={(e) => (e.target.style.borderColor = "#ddd")}
                required
              />
              <div style={styles.hint}>
                Your registered mobile number is used as your password.
              </div>

              {error && <div style={styles.error}>{error}</div>}

              <button
                type="submit"
                style={styles.submitBtn}
                onMouseDown={(e) => (e.currentTarget.style.opacity = 0.85)}
                onMouseUp={(e) => (e.currentTarget.style.opacity = 1)}
              >
                Login to My Dashboard
              </button>

              <div style={styles.demoBox}>
                <b>Demo IDs:</b> BBDU-CN-1001 / 9876543210 &nbsp;|&nbsp;
                BBDU-CN-1003 / 9988776655
              </div>
            </form>
          ) : (
            <form style={styles.form} onSubmit={handleGovSubmit}>
              <div style={styles.label}>Username</div>
              <input
                style={styles.input}
                type="text"
                placeholder="Admin username"
                value={govUser}
                onChange={(e) => setGovUser(e.target.value)}
                onFocus={(e) => (e.target.style.borderColor = "#16a085")}
                onBlur={(e) => (e.target.style.borderColor = "#ddd")}
                required
              />

              <div style={styles.label}>Password</div>
              <input
                style={styles.input}
                type="password"
                placeholder="Password"
                value={govPass}
                onChange={(e) => setGovPass(e.target.value)}
                onFocus={(e) => (e.target.style.borderColor = "#16a085")}
                onBlur={(e) => (e.target.style.borderColor = "#ddd")}
                required
              />

              {error && <div style={styles.error}>{error}</div>}

              <button
                type="submit"
                style={styles.submitBtn}
                onMouseDown={(e) => (e.currentTarget.style.opacity = 0.85)}
                onMouseUp={(e) => (e.currentTarget.style.opacity = 1)}
              >
                Access Control Room
              </button>

              <div style={styles.demoBox}>
                <b>Demo credentials:</b> admin / grid@2026
              </div>
            </form>
          )}
        </div>
        <div style={styles.footer}>
          Babu Banarasi Das University · Dept. of CSE (AI) · Minor Project 2026-27
        </div>
      </div>
    </div>
  );
}
