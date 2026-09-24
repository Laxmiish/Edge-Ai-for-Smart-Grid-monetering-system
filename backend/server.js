/**
 * Smart Grid Central Backend Server
 * ==================================
 * Express.js server that acts as the Level 3 Cloud layer.
 */

const express = require('express');
const { Pool } = require('pg');
const { Kafka, logLevel } = require('kafkajs');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

const PORT = process.env.PORT || 3000;

// ════════════════════════════════════════════════════════════
// PostgreSQL Setup
// ════════════════════════════════════════════════════════════
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || 'smart_grid',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
});

let pgConnected = false;

async function initDatabase() {
  let retries = 15;
  while (retries > 0) {
    try {
      const client = await pool.connect();

    // Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS transformers (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100),
        latitude DOUBLE PRECISION DEFAULT 26.8467,
        longitude DOUBLE PRECISION DEFAULT 80.9462,
        rated_capacity_kw DOUBLE PRECISION DEFAULT 45.0,
        solar_capacity_kw DOUBLE PRECISION DEFAULT 0.0,
        solar_integrated BOOLEAN DEFAULT false,
        status VARCHAR(50) DEFAULT 'Healthy',
        location_description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS consumers (
        id VARCHAR(50) PRIMARY KEY,
        phone VARCHAR(20),
        name VARCHAR(100),
        address TEXT,
        transformer_id VARCHAR(50) REFERENCES transformers(id),
        category VARCHAR(50),
        has_solar BOOLEAN,
        current_usage_kw DOUBLE PRECISION,
        solar_gen_kw DOUBLE PRECISION,
        sanctioned_load_kw DOUBLE PRECISION,
        bill_status VARCHAR(50),
        current_bill DOUBLE PRECISION,
        due_date DATE,
        theft_flag BOOLEAN DEFAULT false,
        billing_history JSONB DEFAULT '[]'::jsonb
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS telemetry (
        id SERIAL PRIMARY KEY,
        transformer_id VARCHAR(50) REFERENCES transformers(id),
        timestamp TIMESTAMPTZ NOT NULL,
        temperature_c DOUBLE PRECISION,
        ambient_light_lux DOUBLE PRECISION,
        cloud_cover DOUBLE PRECISION,
        gross_demand_kw DOUBLE PRECISION,
        solar_gen_kw DOUBLE PRECISION,
        net_load_kw DOUBLE PRECISION,
        predicted_net_load_kw DOUBLE PRECISION,
        predicted_solar_kw DOUBLE PRECISION,
        status VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS house_readings (
        id SERIAL PRIMARY KEY,
        house_id VARCHAR(50) NOT NULL,
        transformer_id VARCHAR(50) REFERENCES transformers(id),
        timestamp TIMESTAMPTZ NOT NULL,
        raw_demand_kw DOUBLE PRECISION,
        solar_gen_kw DOUBLE PRECISION,
        net_demand_kw DOUBLE PRECISION
      );
    `);

    // Create indexes for faster queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_transformer_ts 
      ON telemetry(transformer_id, timestamp DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_house_readings_transformer_ts 
      ON house_readings(transformer_id, timestamp DESC);
    `);

    // Enable TimescaleDB and create Hypertables for time-series data
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;`);
      await client.query(`SELECT create_hypertable('telemetry', by_range('timestamp'), if_not_exists => TRUE);`);
      await client.query(`SELECT create_hypertable('house_readings', by_range('timestamp'), if_not_exists => TRUE);`);
      console.log('[DB] TimescaleDB Hypertables created for telemetry and house_readings.');
    } catch (err) {
      console.log('[DB] Note: TimescaleDB extension not found or already configured. Standard tables will be used if hypertable creation failed.', err.message);
    }

    // Seed Data
    await client.query(`
      INSERT INTO transformers (id, name, latitude, longitude, rated_capacity_kw, solar_capacity_kw, solar_integrated, status, location_description)
      VALUES 
        ('TRF-A1', 'BBD Transformer 01', 26.8467, 80.9462, 100.0, 25.0, true, 'Healthy', 'Gomti Nagar Sector 4'),
        ('TRF-A2', 'BBD Transformer 02', 26.8467, 80.9462, 63.0, 0.0, false, 'Healthy', 'Alambagh / Indira Nagar'),
        ('TRF-B1', 'BBD Transformer 03', 26.8467, 80.9462, 500.0, 0.0, false, 'Watch', 'NER Railway Yard'),
        ('TX-LUCKNOW-BBD-01', 'Default Edge Transformer', 26.8467, 80.9462, 45.0, 5.0, true, 'Healthy', 'Lucknow, UP, India')
      ON CONFLICT (id) DO NOTHING;
    `);

    const consumersSeed = [
      { id: 'BBDU-CN-1001', phone: '9876543210', name: 'Ramesh Verma', address: 'House 12, Gomti Nagar, Lucknow', t_id: 'TRF-A1', cat: 'Residential', solar: true, use: 3.2, gen: 1.8, sanc: 5, bStat: 'Due', bill: 1420, due: '2026-10-05', theft: false, hist: '[{"month": "Apr", "units": 210, "amount": 1260}]' },
      { id: 'BBDU-CN-1002', phone: '9123456780', name: 'Sunita Textiles Pvt. Ltd.', address: 'Plot 4, Industrial Area, Lucknow', t_id: 'TRF-A1', cat: 'Industrial', solar: false, use: 42.5, gen: 0, sanc: 60, bStat: 'Paid', bill: 68500, due: '2026-09-28', theft: false, hist: '[{"month": "Apr", "units": 5200, "amount": 62400}]' },
      { id: 'BBDU-CN-1003', phone: '9988776655', name: 'Anjali Sharma', address: 'Flat 302, Alambagh, Lucknow', t_id: 'TRF-A2', cat: 'Residential', solar: false, use: 1.4, gen: 0, sanc: 3, bStat: 'Overdue', bill: 890, due: '2026-09-10', theft: true, hist: '[{"month": "Apr", "units": 90, "amount": 540}]' },
      { id: 'BBDU-CN-1004', phone: '9012345678', name: 'Railway Traction Sub-Station 7', address: 'NER Railway Yard, Lucknow', t_id: 'TRF-B1', cat: 'Railway Traction', solar: false, use: 310, gen: 0, sanc: 400, bStat: 'Paid', bill: 412000, due: '2026-09-30', theft: false, hist: '[{"month": "Apr", "units": 38000, "amount": 380000}]' },
      { id: 'BBDU-CN-1005', phone: '9765432109', name: 'Vikram Singh', address: 'House 45, Indira Nagar, Lucknow', t_id: 'TRF-A2', cat: 'Residential', solar: true, use: 2.1, gen: 2.6, sanc: 4, bStat: 'Paid', bill: 640, due: '2026-09-25', theft: false, hist: '[{"month": "Apr", "units": 160, "amount": 960}]' }
    ];

    for(let c of consumersSeed) {
      await client.query(`
        INSERT INTO consumers (id, phone, name, address, transformer_id, category, has_solar, current_usage_kw, solar_gen_kw, sanctioned_load_kw, bill_status, current_bill, due_date, theft_flag, billing_history)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO NOTHING;
      `, [c.id, c.phone, c.name, c.address, c.t_id, c.cat, c.solar, c.use, c.gen, c.sanc, c.bStat, c.bill, c.due, c.theft, c.hist]);
    }

    client.release();
    pgConnected = true;
    console.log('[DB] PostgreSQL connected and tables seeded.');
    break;
  } catch (err) {
    console.error(`[DB] PostgreSQL connection failed. Retrying... (${retries} attempts left)`);
    retries -= 1;
    await new Promise(res => setTimeout(res, 3000));
  }
}
}

// ════════════════════════════════════════════════════════════
// Kafka Setup
// ════════════════════════════════════════════════════════════
const kafka = new Kafka({
  clientId: 'smart-grid-backend',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
  logLevel: logLevel.WARN,
  retry: { retries: 3 },
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'grid-monitoring-group' });
let kafkaConnected = false;

async function initKafka() {
  try {
    await producer.connect();
    kafkaConnected = true;
    console.log('[Kafka] Producer connected.');
    await consumer.connect();
    await consumer.subscribe({ topic: 'meter-readings', fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const data = JSON.parse(message.value.toString());
          if (pgConnected) await saveTelemetry(data);
          
          // SKELETAL: Hook for Theft Detection Engine (Level 3 Logic)
          runTheftDetectionEngine(data);
        } catch (e) {
          console.error('[Kafka] Error:', e.message);
        }
      },
    });
  } catch (err) {
    console.log('[Kafka] Server will continue without Kafka streaming.');
  }
}

async function saveTelemetry(data) {
  if (!pgConnected) return;
  try {
    const client = await pool.connect();
    const telemetry = data.transformer_telemetry || {};
    const analytics = data.edge_analytics || {};

    await client.query(`
      INSERT INTO telemetry (transformer_id, timestamp, temperature_c, ambient_light_lux, cloud_cover, gross_demand_kw, solar_gen_kw, net_load_kw, predicted_net_load_kw, predicted_solar_kw, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [data.transformer_id, data.timestamp, telemetry.temperature_c||0, telemetry.ambient_light_lux||0, telemetry.cloud_cover||0, telemetry.gross_demand_kw||0, telemetry.solar_gen_kw||0, telemetry.net_load_kw||0, analytics.predicted_net_load_1h_kw||0, analytics.predicted_solar_1h_kw||0, analytics.status||'UNKNOWN']);

    const houses = data.house_data || [];
    for (const house of houses) {
      await client.query(`
        INSERT INTO house_readings (house_id, transformer_id, timestamp, raw_demand_kw, solar_gen_kw, net_demand_kw)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [house.house_id, data.transformer_id, data.timestamp, house.raw_demand_kw||0, house.solar_gen_kw||0, house.net_demand_kw||0]);
    }
    client.release();
  } catch (err) {
    console.error('[DB] Error saving telemetry:', err.message);
  }
}

// ════════════════════════════════════════════════════════════
// TODO: LEVEL 3 BUSINESS LOGIC (Skeletal Framework)
// ════════════════════════════════════════════════════════════
function runTheftDetectionEngine(data) {
  // 1. Rule-Based Theft Detection Engine (PENDING)
  // Will analyze house_readings against total transformer output 
  // to mathematically identify unmetered electricity theft.
}

async function runAutomatedSmartBilling(consumerId, amountPaid) {
  // 2. Automated Smart Billing Pipeline (PENDING)
  // Will calculate dynamic commercial tariffs based on net_demand_kw,
  // handle partial payments, and update billing histories.
}


// ════════════════════════════════════════════════════════════
// API ROUTES (Frontend Integration)
// ════════════════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
  res.json({ status: 'running', postgres: pgConnected, kafka: kafkaConnected });
});

// -- AUTH ROUTES --
app.post('/api/auth/consumer', async (req, res) => {
  const { consumerId, phone } = req.body;
  if (!pgConnected) return res.status(503).json({ ok: false, message: 'Database is still starting up. Please wait 5 seconds and try again.' });
  const result = await pool.query('SELECT * FROM consumers WHERE id = $1', [consumerId]);
  if (result.rows.length === 0) return res.status(401).json({ ok: false, message: "No consumer found." });
  if (result.rows[0].phone !== phone) return res.status(401).json({ ok: false, message: "Incorrect mobile number." });
  res.json({ ok: true, consumer: mapConsumerDBtoFrontend(result.rows[0]) });
});

app.post('/api/auth/gov', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'grid@2026') return res.json({ ok: true });
  res.status(401).json({ ok: false, message: "Invalid credentials" });
});

// -- CONSUMERS ROUTES --
app.get('/api/consumers', async (req, res) => {
  if (!pgConnected) return res.status(503).json([]);
  const result = await pool.query('SELECT * FROM consumers');
  res.json(result.rows.map(mapConsumerDBtoFrontend));
});

app.post('/api/consumers/:id/pay', async (req, res) => {
  const { id } = req.params;
  if (!pgConnected) return res.status(503).json({ error: 'DB down' });
  await pool.query('UPDATE consumers SET bill_status = $1 WHERE id = $2', ['Paid', id]);
  await runAutomatedSmartBilling(id, req.body.amount);
  res.json({ ok: true });
});

// -- TRANSFORMERS ROUTES --
app.get('/api/transformers', async (req, res) => {
  if (!pgConnected) return res.status(503).json([]);
  const result = await pool.query('SELECT * FROM transformers');
  res.json(result.rows.map(mapTransformerDBtoFrontend));
});

app.post('/api/transformers/:id/toggle-solar', async (req, res) => {
  const { id } = req.params;
  if (!pgConnected) return res.status(503).json({ error: 'DB down' });
  await pool.query('UPDATE transformers SET solar_integrated = NOT solar_integrated WHERE id = $1', [id]);
  res.json({ ok: true });
});

app.post('/api/transformers/:id/add-solar', async (req, res) => {
  const { id } = req.params;
  const { capacityKW } = req.body;
  if (!pgConnected) return res.status(503).json({ error: 'DB down' });
  await pool.query('UPDATE transformers SET solar_integrated = true, solar_capacity_kw = solar_capacity_kw + $1 WHERE id = $2', [capacityKW, id]);
  res.json({ ok: true });
});

// -- DPU/SUBSTATION DATA ROUTES --
app.get('/api/config/:transformerId', async (req, res) => {
  // Exists for DPU
  const { transformerId } = req.params;
  if (!pgConnected) return res.json({ transformer_id: transformerId, solar_capacity_kw: 5.0 });
  const result = await pool.query('SELECT * FROM transformers WHERE id = $1', [transformerId]);
  if (result.rows.length > 0) return res.json(result.rows[0]);
  res.json({ transformer_id: transformerId, solar_capacity_kw: 5.0 });
});

app.post('/api/cloud/ingest', async (req, res) => {
  const data = req.body;
  if (kafkaConnected) {
    try { await producer.send({ topic: 'meter-readings', messages: [{ key: data.transformer_id, value: JSON.stringify(data) }] }); } catch (e) {}
  }
  if (pgConnected) await saveTelemetry(data);
  res.json({ status: 'ingested' });
});

// -- HELPERS --
function mapConsumerDBtoFrontend(dbObj) {
  return {
    consumerId: dbObj.id,
    phone: dbObj.phone,
    name: dbObj.name,
    address: dbObj.address,
    transformerId: dbObj.transformer_id,
    category: dbObj.category,
    hasSolar: dbObj.has_solar,
    currentUsageKW: dbObj.current_usage_kw,
    solarGenKW: dbObj.solar_gen_kw,
    sanctionedLoadKW: dbObj.sanctioned_load_kw,
    billStatus: dbObj.bill_status,
    currentBill: dbObj.current_bill,
    dueDate: dbObj.due_date,
    theftFlag: dbObj.theft_flag,
    billingHistory: dbObj.billing_history
  };
}

function mapTransformerDBtoFrontend(dbObj) {
  return {
    transformerId: dbObj.id,
    location: dbObj.location_description,
    ratedCapacityKW: dbObj.rated_capacity_kw,
    solarIntegrated: dbObj.solar_integrated,
    solarCapacityKW: dbObj.solar_capacity_kw,
    status: dbObj.status
  };
}

// ════════════════════════════════════════════════════════════
// START SERVER
// ════════════════════════════════════════════════════════════
async function startServer() {
  await initDatabase();
  await initKafka();
  app.listen(PORT, () => {
    console.log(`[Server] Smart Grid Central Backend on port ${PORT}`);
  });
}

startServer();
