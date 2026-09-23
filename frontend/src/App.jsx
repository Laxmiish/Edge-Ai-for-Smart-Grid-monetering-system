import React, { useState } from "react";
import LoginPage from "./components/LoginPage";
import ConsumerDashboard from "./components/ConsumerDashboard";
import GovernmentDashboard from "./components/GovernmentDashboard";
import { initialConsumers, initialTransformers } from "./data/mockData";

export default function App() {
  const [view, setView] = useState("login"); // 'login' | 'consumer' | 'gov'
  const [activeConsumerId, setActiveConsumerId] = useState(null);

  const [consumers, setConsumers] = useState(initialConsumers);
  const [transformers, setTransformers] = useState(initialTransformers);

  const handleConsumerLogin = (consumerId, phone) => {
    const match = consumers.find(
      (c) => c.consumerId.toLowerCase() === consumerId.toLowerCase()
    );
    if (!match) {
      return { ok: false, message: "No consumer found with that Consumer ID." };
    }
    if (match.phone !== phone) {
      return { ok: false, message: "Incorrect mobile number for this Consumer ID." };
    }
    setActiveConsumerId(match.consumerId);
    setView("consumer");
    return { ok: true };
  };

  const handleGovLogin = () => setView("gov");

  const handleLogout = () => {
    setActiveConsumerId(null);
    setView("login");
  };

  const handlePay = () => {
    setConsumers((prev) =>
      prev.map((c) =>
        c.consumerId === activeConsumerId ? { ...c, billStatus: "Paid" } : c
      )
    );
  };

  const handleToggleSolar = (transformerId) => {
    setTransformers((prev) =>
      prev.map((t) =>
        t.transformerId === transformerId
          ? { ...t, solarIntegrated: !t.solarIntegrated }
          : t
      )
    );
  };

  const handleAddSolarPlant = (transformerId, capacityKW) => {
    setTransformers((prev) =>
      prev.map((t) =>
        t.transformerId === transformerId
          ? {
              ...t,
              solarIntegrated: true,
              solarCapacityKW: t.solarCapacityKW + capacityKW,
            }
          : t
      )
    );
  };

  if (view === "login") {
    return (
      <LoginPage onConsumerLogin={handleConsumerLogin} onGovLogin={handleGovLogin} />
    );
  }

  if (view === "consumer") {
    const consumer = consumers.find((c) => c.consumerId === activeConsumerId);
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
