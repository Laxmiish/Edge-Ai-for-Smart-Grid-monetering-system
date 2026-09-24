import React, { useState, useEffect } from "react";
import LoginPage from "./components/LoginPage";
import ConsumerDashboard from "./components/ConsumerDashboard";
import GovernmentDashboard from "./components/GovernmentDashboard";

// Uses the Vite proxy in development (see vite.config.js) to forward /api/* to the Express backend.
// In production, this relative path works behind any reverse proxy (NGINX, etc.).
const API_URL = "/api";

export default function App() {
  const [view, setView] = useState("login"); // 'login' | 'consumer' | 'gov'
  const [activeConsumerId, setActiveConsumerId] = useState(null);

  const [consumers, setConsumers] = useState([]);
  const [transformers, setTransformers] = useState([]);

  // Fetch data on load
  const loadData = async () => {
    try {
      const conRes = await fetch(`${API_URL}/consumers`);
      const conData = await conRes.json();
      setConsumers(conData);

      const trfRes = await fetch(`${API_URL}/transformers`);
      const trfData = await trfRes.json();
      setTransformers(trfData);
    } catch (e) {
      console.error("Failed to fetch data:", e);
    }
  };

  // Load data from the backend on first render, then auto-refresh every 15 seconds
  // so the dashboard stays in sync with the Edge DPU telemetry stream.
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleConsumerLogin = async (consumerId, phone) => {
    try {
      const res = await fetch(`${API_URL}/auth/consumer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consumerId, phone })
      });
      const data = await res.json();
      if (!data.ok) return { ok: false, message: data.message };
      
      setActiveConsumerId(consumerId);
      setView("consumer");
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
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!data.ok) return { ok: false, message: data.message };
      
      setView("gov");
      return { ok: true };
    } catch (e) {
      return { ok: false, message: "Network Error" };
    }
  };

  const handleLogout = () => {
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
        body: JSON.stringify({ capacityKW })
      });
      await loadData();
    } catch (e) {
      console.error("Add solar failed", e);
    }
  };

  if (view === "login") {
    return (
      <LoginPage onConsumerLogin={handleConsumerLogin} onGovLogin={handleGovLogin} />
    );
  }

  if (view === "consumer") {
    const consumer = consumers.find((c) => c.consumerId.toLowerCase() === activeConsumerId?.toLowerCase());
    return (
      <ConsumerDashboard consumer={consumer} onLogout={handleLogout} onPay={handlePay} />
    );
  }

  if (view === "gov") {
    return (
      <GovernmentDashboard
        consumers={consumers}
        transformers={transformers}
        onLogout={handleLogout}
        onToggleSolar={handleToggleSolar}
        onAddSolarPlant={handleAddSolarPlant}
      />
    );
  }

  return null;
}
