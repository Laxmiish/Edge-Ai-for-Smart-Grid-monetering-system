# Smart Grid Monitoring System — Frontend

React + inline-CSS frontend for the **Edge AI For Smart Grid Monitoring System**
minor project (BBDU, Dept. of CSE-AI). Built to match the concept paper's
Level 4 "Interfaces" layer: a consumer billing portal and a utility control-room
dashboard.

## Features

**Login (`src/components/LoginPage.jsx`)**
- Two tabs: Consumer login and Government portal login.
- Consumer login uses **Consumer ID + registered mobile number as password**
  (matches against the mock consumer records in `src/data/mockData.js`).
- Government login uses a demo admin/password pair.

**Consumer Dashboard (`src/components/ConsumerDashboard.jsx`)**
- Live-updating current usage, solar generation, and net load (simulated
  telemetry ticking every 3s, representing the Edge DPU stream).
- Current bill, due date, and a "Pay Now" action.
- 6-month consumption bar chart and full billing history table.
- Theft/anomaly alert banner when flagged.

**Government Dashboard (`src/components/GovernmentDashboard.jsx`)**
- Grid-wide totals: demand, solar generation, net load, active alerts.
- Live per-transformer load table.
- **Add/expand solar integration**: a form to add solar capacity (kW) to any
  transformer, plus a toggle to enable/disable solar integration per
  transformer — this is the "Government can add solar energy" feature.
- All-consumers table with usage, solar, and billing status.
- Theft and overdue-billing alerts panel.

All styling is done with inline `style={{ ... }}` objects (no CSS files, no
Tailwind/UI kit), and all data is dynamic React state (`useState`/`useEffect`)
— nothing is hardcoded into the JSX beyond the initial mock dataset.

## Demo credentials

| Role | Login |
|---|---|
| Consumer | ID `BBDU-CN-1001`, password `9876543210` |
| Consumer (with theft flag) | ID `BBDU-CN-1003`, password `9988776655` |
| Government | username `admin`, password `grid@2026` |

## Run locally

```bash
npm install
npm run dev
```

Then open the printed local URL (typically `http://localhost:5173`).

## Next steps for the real system

Replace `src/data/mockData.js` with real API calls to your cloud platform
(Level 3 in the concept paper) once the backend, database, and Edge DPU
integration are ready — the component props are already structured so only
the data-fetching layer needs to change, not the UI components themselves.
