import React, { useState, useEffect, useRef } from "react";
import LoginPage from "./components/LoginPage";
import ConsumerDashboard from "./components/ConsumerDashboard";
import GovernmentDashboard from "./components/GovernmentDashboard";
import DemoSimulator from "./components/DemoSimulator";

const API_URL = "http://localhost:3000/api";

// Login state browser mein save hota hai, taaki refresh par logout na ho.
const STORAGE_KEY = "smartgrid_session";

function readSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { view: "login", consumerId: null };
    const s = JSON.parse(raw);
    if (s.view === "gov") return { view: "gov", consumerId: null };
    if (s.view === "consumer" && s.consumerId) {
      return { view: "consumer", consumerId: s.consumerId };
    }
  } catch (e) {
    // corrupt data ho to ignore karo
  }
  return { view: "login", consumerId: null };
}

function saveSession(view, consumerId = null) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ view, consumerId }));
  } catch (e) {
    // storage disabled ho to bhi app chalti rahe
  }
}

function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // ignore
  }
}

const centerBox = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "14px",
  background: "#f2f5f7",
  fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
  color: "#3a464e",
  textAlign: "center",
  padding: "24px",
};

const centerBtn = {
  background: "#16a085",
  color: "#fff",
  border: "none",
  padding: "10px 20px",
  borderRadius: "8px",
  fontWeight: 700,
  fontSize: "13.5px",
  cursor: "pointer",
};

const centerBtnGhost = {
  ...centerBtn,
  background: "#fff",
  color: "#4a5760",
  border: "1.5px solid #cfd8dc",
};

export default function App() {
  // Pehli baar load hote hi saved session padho (refresh ke baad bhi yahi se aayega)
  const initial = useRef(readSession()).current;

  const [view, setView] = useState(initial.view); // 'login' | 'consumer' | 'gov'
  const [activeConsumerId, setActiveConsumerId] = useState(initial.consumerId);

  const [consumers, setConsumers] = useState([]);
  const [transformers, setTransformers] = useState([]);
  const [faults, setFaults] = useState([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState([]);

  // 'loading' | 'ready' | 'error'
  const [dataStatus, setDataStatus] = useState("loading");

  // Polling ke time state tabhi update karte hain jab data sach mein badla ho,
  // warna dashboards ki live simulation (useEffect) har 5 sec par reset ho jayegi.
  const lastSnapshot = useRef({ faults: "", transformers: "" });

  // Fetch data on load
  const loadData = async () => {
    try {
      const conRes = await fetch(`${API_URL}/consumers`);
      if (!conRes.ok) throw new Error(`Consumers API returned ${conRes.status}`);
      const conData = await conRes.json();
      setConsumers(conData);

      const trfRes = await fetch(`${API_URL}/transformers`);
      if (!trfRes.ok) throw new Error(`Transformers API returned ${trfRes.status}`);
      const trfData = await trfRes.json();
      setTransformers(trfData);

      setDataStatus("ready");
    } catch (e) {
      console.error("Failed to fetch data:", e);
      setDataStatus("error");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadFaultsAndTransformers = async () => {
    try {
      const [fRes, tRes, mRes] = await Promise.all([
        fetch(`${API_URL}/faults`),
        fetch(`${API_URL}/transformers`),
        fetch(`${API_URL}/maintenance`),
      ]);
      const [fData, tData, mData] = await Promise.all([fRes.json(), tRes.json(), mRes.json()]);

      if (Array.isArray(fData)) setFaults(fData);
      if (Array.isArray(tData)) setTransformers(tData);
      if (Array.isArray(mData)) setMaintenanceLogs(mData);
    } catch (e) {
      console.error("Failed to fetch gov data:", e);
    }
  };

  useEffect(() => {
    if (view !== "gov") return;
    loadFaultsAndTransformers();
    const id = setInterval(loadFaultsAndTransformers, 5000);
    return () => clearInterval(id);
  }, [view]);

  const handleConsumerLogin = async (consumerId, phone) => {
    try {
      const res = await fetch(`${API_URL}/auth/consumer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consumerId, phone }),
      });
      const data = await res.json();
      if (!data.ok) return { ok: false, message: data.message };

      // Backend jo exact ID deta hai (sahi upper/lower case ke saath) wahi save karo
      const realId = data.consumer?.consumerId || consumerId;

      setActiveConsumerId(realId);
      setView("consumer");
      saveSession("consumer", realId);

      // Login ke turant baad fresh data le aao
      loadData();
      return { ok: true };
    } catch (e) {
      return { ok: false, message: "Network Error" };
    }
  };

  const handleGovLogin = async (username, password) => {
    try {
      const res = await fetch(`${API_URL}/auth/gov`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!data.ok) return { ok: false, message: data.message };

      setView("gov");
      saveSession("gov");
      return { ok: true };
    } catch (e) {
      return { ok: false, message: "Network Error" };
    }
  };

  const handleLogout = () => {
    clearSession();
    setActiveConsumerId(null);
    setView("login");
  };

  const handlePay = async () => {
    try {
      await fetch(`${API_URL}/consumers/${activeConsumerId}/pay`, { method: "POST" });
      await loadData(); // Reload data after action
    } catch (e) {
      console.error("Payment failed", e);
    }
  };

  const handleResolveFault = async (faultId) => {
    try {
      await fetch(`${API_URL}/faults/${faultId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await loadFaultsAndTransformers();
    } catch (e) {
      console.error("Resolve fault failed", e);
    }
  };

  const handleToggleSolar = async (transformerId) => {
    try {
      await fetch(`${API_URL}/transformers/${transformerId}/toggle-solar`, { method: "POST" });
      await loadData();
    } catch (e) {
      console.error("Toggle failed", e);
    }
  };

  const handleAddSolarPlant = async (transformerId, capacityKW) => {
    try {
      await fetch(`${API_URL}/transformers/${transformerId}/add-solar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capacityKW }),
      });
      await loadData();
    } catch (e) {
      console.error("Add solar failed", e);
    }
  };

  if (view === "login") {
    return (
      <LoginPage 
        onConsumerLogin={handleConsumerLogin} 
        onGovLogin={handleGovLogin} 
        onDemoClick={() => setView("demo")}
      />
    );
  }

  if (view === "demo") {
    return (
      <div>
        <div style={{background: "#2c3e50", padding: "10px", textAlign: "right"}}>
          <button style={{...centerBtn, background: "#e74c3c", fontSize: "12px", padding: "6px 12px"}} onClick={() => setView("login")}>Exit Demo</button>
        </div>
        <DemoSimulator />
      </div>
    );
  }

  if (view === "consumer") {
    const consumer = consumers.find(
      (c) => c.consumerId.toLowerCase() === activeConsumerId?.toLowerCase()
    );

    // Refresh ke baad data aane tak dashboard render mat karo (warna crash hota hai)
    if (!consumer) {
      if (dataStatus === "loading") {
        return (
          <div style={centerBox}>
            <div style={{ fontSize: "18px", fontWeight: 700 }}>⚡ Loading your dashboard…</div>
          </div>
        );
      }

      if (dataStatus === "error") {
        return (
          <div style={centerBox}>
            <div style={{ fontSize: "18px", fontWeight: 700 }}>Server se connect nahi ho paa raha</div>
            <div style={{ fontSize: "13.5px", color: "#7a8a94" }}>
              Check karo ki backend (port 3000) chal raha hai.
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                style={centerBtn}
                onClick={() => {
                  setDataStatus("loading");
                  loadData();
                }}
              >
                Retry
              </button>
              <button style={centerBtnGhost} onClick={handleLogout}>
                Logout
              </button>
            </div>
          </div>
        );
      }

      // Data aa gaya par ye consumer ab exist nahi karta -> session saaf karke login par bhejo
      return (
        <div style={centerBox}>
          <div style={{ fontSize: "18px", fontWeight: 700 }}>Consumer account nahi mila</div>
          <button style={centerBtn} onClick={handleLogout}>
            Back to Login
          </button>
        </div>
      );
    }

    return (
      <ConsumerDashboard consumer={consumer} onLogout={handleLogout} onPay={handlePay} />
    );
  }

  if (view === "gov") {
    return (
      <GovernmentDashboard
        consumers={consumers}
        transformers={transformers}
        faults={faults}
        maintenanceLogs={maintenanceLogs}
        onResolveFault={handleResolveFault}
        onLogout={handleLogout}
        onToggleSolar={handleToggleSolar}
        onAddSolarPlant={handleAddSolarPlant}
      />
    );
  }

  return null;
}