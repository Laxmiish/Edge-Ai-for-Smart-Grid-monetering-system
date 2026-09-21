/**
 * Smart Grid Central Backend Server
 * ==================================
 * Express.js server that acts as the Level 3 Cloud layer.
 * 
 * Services:
 *   1. PostgreSQL — Persistent storage for telemetry, house readings, and transformer config
 *   2. Apache Kafka — Stream processing for real-time meter readings
 *   3. REST API — Configuration, data ingestion, and query endpoints
 * 
 * Resilience:
 *   - Server starts even if Kafka or PostgreSQL are unavailable
 *   - Falls back gracefully (logs warnings, serves default config)
 * 
 * Endpoints:
 *   GET  /api/health                      — System health check
 *   GET  /api/config/:transformerId       — DPU config (solar capacity, lat/lon)
 *   POST /api/cloud/ingest                — Receive data from Substations
 *   GET  /api/telemetry/:transformerId    — Query telemetry history
 *   GET  /api/houses/:transformerId       — Query house-level readings
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
        solar_capacity_kw DOUBLE PRECISION DEFAULT 5.0,
        location_description TEXT DEFAULT 'Lucknow, India',
        created_at TIMESTAMPTZ DEFAULT NOW()
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
      
      await client.query(`
        SELECT create_hypertable('telemetry', by_range('timestamp'), if_not_exists => TRUE);
      `);
      
      await client.query(`
        SELECT create_hypertable('house_readings', by_range('timestamp'), if_not_exists => TRUE);
      `);
      console.log('[DB] TimescaleDB Hypertables created for telemetry and house_readings.');
    } catch (err) {
      console.log('[DB] Note: TimescaleDB extension not found or already configured. Standard tables will be used if hypertable creation failed.', err.message);
    }

    // Seed default transformer config (DPUs will fetch this on startup)
    await client.query(`
      INSERT INTO transformers (id, name, latitude, longitude, rated_capacity_kw, solar_capacity_kw, location_description)
      VALUES 
        ('TX-LUCKNOW-BBD-01', 'BBD Transformer 01', 26.8467, 80.9462, 45.0, 5.0, 'BBD, Lucknow, UP, India')
      ON CONFLICT (id) DO NOTHING;
    `);

    client.release();
    pgConnected = true;
    console.log('[DB] PostgreSQL connected and tables initialized.');
  } catch (err) {
    console.error('[DB] PostgreSQL connection failed:', err.message);
    console.log('[DB] Server will continue without database persistence.');
    console.log('[DB] Make sure PostgreSQL is running and the "smart_grid" database exists.');
    console.log('[DB] Create it with: CREATE DATABASE smart_grid;');
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

    // Start consumer in the background
    await consumer.connect();
    await consumer.subscribe({ topic: 'meter-readings', fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const data = JSON.parse(message.value.toString());
          console.log(`[Kafka] Consumed: ${data.transformer_id} from partition ${partition}`);

          // Persist consumed messages to PostgreSQL
          if (pgConnected) {
            await saveTelemetry(data);
          }
        } catch (e) {
          console.error('[Kafka] Error processing message:', e.message);
        }
      },
    });

    console.log('[Kafka] Consumer listening on "meter-readings" topic.');
  } catch (err) {
    console.error('[Kafka] Connection failed:', err.message);
    console.log('[Kafka] Server will continue without Kafka streaming.');
    console.log('[Kafka] Data will be saved directly to PostgreSQL on ingestion.');
  }
}

// ════════════════════════════════════════════════════════════
// Helper: Save Telemetry to PostgreSQL
// ════════════════════════════════════════════════════════════
async function saveTelemetry(data) {
  if (!pgConnected) return;

  try {
    const client = await pool.connect();
    const telemetry = data.transformer_telemetry || {};
    const analytics = data.edge_analytics || {};

    // Insert telemetry record
    await client.query(`
      INSERT INTO telemetry 
      (transformer_id, timestamp, temperature_c, ambient_light_lux, cloud_cover,
       gross_demand_kw, solar_gen_kw, net_load_kw, predicted_net_load_kw, 
       predicted_solar_kw, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      data.transformer_id,
      data.timestamp,
      telemetry.temperature_c || 0,
      telemetry.ambient_light_lux || 0,
      telemetry.cloud_cover || 0,
      telemetry.gross_demand_kw || telemetry.aggregated_demand_kw || 0,
      telemetry.solar_gen_kw || 0,
      telemetry.net_load_kw || 0,
      analytics.predicted_net_load_1h_kw || analytics.predicted_net_load_kw || 0,
      analytics.predicted_solar_1h_kw || 0,
      analytics.status || 'UNKNOWN',
    ]);

    // Insert individual house readings
    const houses = data.house_data || [];
    for (const house of houses) {
      await client.query(`
        INSERT INTO house_readings 
        (house_id, transformer_id, timestamp, raw_demand_kw, solar_gen_kw, net_demand_kw)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        house.house_id,
        data.transformer_id,
        data.timestamp,
        house.raw_demand_kw || 0,
        house.solar_gen_kw || 0,
        house.net_demand_kw || 0,
      ]);
    }

    client.release();
  } catch (err) {
    console.error('[DB] Error saving telemetry:', err.message);
  }
}

// ════════════════════════════════════════════════════════════
// API ROUTES
// ════════════════════════════════════════════════════════════

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'running',
    postgres: pgConnected ? 'connected' : 'disconnected',
    kafka: kafkaConnected ? 'connected' : 'disconnected',
    uptime_seconds: Math.floor(process.uptime()),
  });
});

// ── GET /api/config/:transformerId ──────────────────────────
// Returns configuration (solar capacity, geological data) for a DPU.
// The DPU calls this endpoint on startup.
app.get('/api/config/:transformerId', async (req, res) => {
  const { transformerId } = req.params;

  if (pgConnected) {
    try {
      const result = await pool.query(
        'SELECT * FROM transformers WHERE id = $1', [transformerId]
      );

      if (result.rows.length > 0) {
        const t = result.rows[0];
        return res.json({
          transformer_id: t.id,
          name: t.name,
          latitude: t.latitude,
          longitude: t.longitude,
          rated_capacity_kw: t.rated_capacity_kw,
          solar_capacity_kw: t.solar_capacity_kw,
          location_description: t.location_description,
        });
      }
    } catch (err) {
      console.error('[API] Config query error:', err.message);
    }
  }

  // Fallback defaults (returned even if PostgreSQL is down)
  res.json({
    transformer_id: transformerId,
    name: 'Default Transformer',
    latitude: 26.8467,
    longitude: 80.9462,
    rated_capacity_kw: 45.0,
    solar_capacity_kw: 5.0,
    location_description: 'Lucknow, India (default)',
  });
});

// ── POST /api/cloud/ingest ──────────────────────────────────
// Receives data forwarded by the Substation relay.
app.post('/api/cloud/ingest', async (req, res) => {
  const data = req.body;

  if (!data || !data.transformer_id) {
    return res.status(400).json({ error: 'Invalid payload: missing transformer_id' });
  }

  const status = (data.edge_analytics || {}).status || '?';
  console.log(`[API] ← Ingested: ${data.transformer_id} | ${data.timestamp} | ${status}`);

  // Publish to Kafka if connected
  if (kafkaConnected) {
    try {
      await producer.send({
        topic: 'meter-readings',
        messages: [{
          key: data.transformer_id,
          value: JSON.stringify(data),
        }],
      });
    } catch (err) {
      console.error('[Kafka] Publish error:', err.message);
    }
  }

  // Save directly to PostgreSQL (guaranteed persistence even without Kafka)
  if (pgConnected) {
    await saveTelemetry(data);
  }

  res.json({
    status: 'ingested',
    transformer_id: data.transformer_id,
    kafka: kafkaConnected ? 'published' : 'skipped',
    postgres: pgConnected ? 'saved' : 'skipped',
  });
});

// ── GET /api/telemetry/:transformerId ───────────────────────
// Query recent telemetry for a transformer.
app.get('/api/telemetry/:transformerId', async (req, res) => {
// ... existing telemetry logic ...

  const { transformerId } = req.params;
  const limit = parseInt(req.query.limit) || 100;

  if (!pgConnected) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const result = await pool.query(`
      SELECT * FROM telemetry 
      WHERE transformer_id = $1 
      ORDER BY timestamp DESC 
      LIMIT $2
    `, [transformerId, limit]);

    res.json({
      transformer_id: transformerId,
      count: result.rows.length,
      readings: result.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/houses/:transformerId ──────────────────────────
// Query recent house-level readings.
app.get('/api/houses/:transformerId', async (req, res) => {
  const { transformerId } = req.params;
  const limit = parseInt(req.query.limit) || 100;

  if (!pgConnected) {
    return res.status(503).json({ error: 'Database not available' });
  }

  try {
    const result = await pool.query(`
      SELECT * FROM house_readings 
      WHERE transformer_id = $1 
      ORDER BY timestamp DESC 
      LIMIT $2
    `, [transformerId, limit]);

    res.json({
      transformer_id: transformerId,
      count: result.rows.length,
      readings: result.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// TODO: LEVEL 3 BUSINESS LOGIC (As per Project Synopsis)
// ════════════════════════════════════════════════════════════

/**
 * 1. Rule-Based Theft Detection Engine (PENDING)
 * Will analyze house_readings against total transformer output 
 * to mathematically identify unmetered electricity theft.
 */

/**
 * 2. Automated Smart Billing Pipeline (PENDING)
 * Will calculate dynamic commercial tariffs based on net_demand_kw,
 * eliminating manual meter reading errors.
 */

/**
 * 3. Fault Detection & Grid Diagnostics (PENDING)
 * Will trigger Level 4 Dashboard alerts based on 'CRITICAL_OVERLOAD_RISK'
 * and temperature spikes.
 */

// ════════════════════════════════════════════════════════════
// START SERVER
// ════════════════════════════════════════════════════════════
async function startServer() {
  // Initialize services (non-blocking — server starts even if they fail)
  await initDatabase();
  await initKafka();

  app.listen(PORT, () => {
    console.log('');
    console.log('='.repeat(60));
    console.log('  Smart Grid Central Backend');
    console.log(`  http://localhost:${PORT}`);
    console.log('');
    console.log(`  PostgreSQL : ${pgConnected ? '✓ Connected' : '✗ Disconnected'}`);
    console.log(`  Kafka      : ${kafkaConnected ? '✓ Connected' : '✗ Disconnected'}`);
    console.log('='.repeat(60));
    console.log('');
    console.log('  Endpoints:');
    console.log(`    GET  /api/health`);
    console.log(`    GET  /api/config/:id`);
    console.log(`    POST /api/cloud/ingest`);
    console.log(`    GET  /api/telemetry/:id`);
    console.log(`    GET  /api/houses/:id`);
    console.log('');
  });
}

startServer();
