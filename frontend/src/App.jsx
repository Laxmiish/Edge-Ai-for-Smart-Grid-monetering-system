import React, { useState, useEffect, useRef } from "react";
import LoginPage from "./components/LoginPage";
import ConsumerDashboard from "./components/ConsumerDashboard";
import GovernmentDashboard from "./components/GovernmentDashboard";

const API_URL = "http://localhost:3000/api";

export default function App() {
  const [view, setView] = useState("login"); // 'login' | 'consumer' | 'gov'
  const [activeConsumerId, setActiveConsumerId] = useState(null);

  const [consumers, setConsumers] = useState([]);
  const [transformers, setTransformers] = useState([]);
  const [faults, setFaults] = useState([]);

  // Polling ke time state tabhi update karte hain jab data sach mein badla ho,
  // warna dashboards ki live simulation (useEffect) har 5 sec par reset ho jayegi.
  const lastSnapshot = useRef({ faults: "", transformers: "" });

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

  useEffect(() => {
    loadData();
  }, []);

  // Fault + transformer status ko gov dashboard khuli ho tab har 5 sec par refresh karo
  const loadFaultsAndTransformers = async () => {
    try {
      const [fRes, tRes] = await Promise.all([
        fetch(`${API_URL}/faults`),
        fetch(`${API_URL}/transformers`),
      ]);
      const [fData, tData] = await Promise.all([fRes.json(), tRes.json()]);

      if (Array.isArray(fData)) {
        const snap = JSON.stringify(fData);
        if (snap !== lastSnapshot.current.faults) {
          lastSnapshot.current.faults = snap;
          setFaults(fData);
        }
      }
      if (Array.isArray(tData)) {
        const snap = JSON.stringify(tData);
        if (snap !== lastSnapshot.current.transformers) {
          lastSnapshot.current.transformers = snap;
          setTransformers(tData);
        }
      }
    } catch (e) {
      console.error("Failed to fetch faults:", e);
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
        faults={faults}
        onResolveFault={handleResolveFault}
        onLogout={handleLogout}
        onToggleSolar={handleToggleSolar}
        onAddSolarPlant={handleAddSolarPlant}
      />
    );
  }

  return null;
}