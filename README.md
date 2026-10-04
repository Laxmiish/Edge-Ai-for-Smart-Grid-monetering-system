<div align="center">
  <h1>⚡ Smart Grid Edge AI Monitoring System</h1>
  <p><i>An advanced, multi-tiered architecture for real-time electrical grid monitoring, automated billing, and theft detection using Edge AI.</i></p>
  
  [![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)
  [![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)
  [![Python](https://img.shields.io/badge/Python-3.11-yellow.svg)](https://python.org/)
  [![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED.svg)](https://docker.com/)
  [![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)
</div>

---

## 📖 Overview

The **Smart Grid Edge AI Monitoring System** is a next-generation electrical grid management platform. It shifts heavy computational analytics from the central cloud directly to the **Edge** (the distribution transformers). By predicting net load, solar generation, and detecting anomalies locally, the system drastically reduces network bandwidth, improves response times, and allows the grid to survive internet outages.

## 🏗️ Architecture

This project is built on a robust 4-Level hierarchical architecture:

### 1. Level 2: Edge Layer (DPU) 📡
Located physically on neighborhood distribution transformers, the **Data Processing Unit (DPU)** uses `scikit-learn` Machine Learning (SGDRegressor) to process real-time sensor data. 
- **Features**: Online learning, net load prediction, offline sqlite caching.

### 2. Level 2.5: Substation Relay 🏭
A regional aggregation node built in Python. 
- **Features**: Receives data from hundreds of DPUs, persistently buffers it using SQLite WAL mode, and forwards it to the cloud. Guarantees zero data loss during internet outages.

### 3. Level 3: Central Cloud ☁️
A high-throughput backend powered by Node.js, Express, Kafka, and PostgreSQL.
- **Features**: Processes thousands of meter readings via Kafka streams, stores time-series data, and orchestrates grid-wide logic like automated smart billing and rule-based theft detection.

### 4. Level 4: Web Dashboard 💻
A modern, reactive dashboard built with React and Vite.
- **Features**: Real-time consumer insights, bill payment portals, transformer health monitoring, and solar generation tracking.

---

## 🛠️ Technology Stack

- **Frontend:** React, Vite, Tailwind CSS, Recharts
- **Backend:** Node.js, Express.js
- **Machine Learning (Edge):** Python, Pandas, Scikit-Learn
- **Event Streaming:** Apache Kafka & Zookeeper
- **Database:** PostgreSQL (with TimescaleDB support fallback) & SQLite (Edge)
- **Containerization:** Docker & Docker Compose

---

## 🚀 Getting Started

Follow these steps to launch the entire multi-tier system locally on your machine.

### 1. Generate the Edge AI Models
The Edge DPU requires pre-trained models. From the project root, run:
```bash
cd dpu
python model.py
python model2.py
cd ..
```

### 2. Launch the Cloud Infrastructure
Boot up PostgreSQL, Zookeeper, Kafka, the Node.js Backend, and the DPU Edge Simulator:
```bash
docker-compose up --build
```
*(Wait ~10 seconds for the databases to fully initialize).*

### 3. Start the Substation Relay
Open a new terminal and run the local substation relay:
```bash
python substations/main.py
```

### 4. Start the Frontend Dashboard
Open a third terminal and run the React web application:
```bash
cd frontend
npm install
npm run dev
```
Navigate to `http://localhost:5173` in your browser!

### Demo Login
You can test the system using the following consumer credentials:
- **Consumer ID:** `BBDU-CN-1001`
- **Phone:** `9876543210`

---

## 🛡️ Key Features

- **Online Learning:** The AI models locally adapt and get smarter over time without needing cloud retraining.
- **Fault Tolerance:** If the internet dies, the Substation caches all data locally and syncs automatically when the connection is restored.
- **Microservice Design:** Completely decoupled using Apache Kafka message queues for extreme scalability.

<br/>
<div align="center">
  <i>Developed for the Future of Smart Grids.</i>
</div>



<!--
to run the project

terminal 1 --> docker-compose up --build

terminal 2 --> pip install flask requests
               python substations/main.py

terminal 3 --> npm run dev
-->