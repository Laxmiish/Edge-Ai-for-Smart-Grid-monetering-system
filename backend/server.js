const express = require("express");
const { Pool } = require("pg");
const { Kafka, logLevel } = require("kafkajs");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(cors());

const PORT = process.env.PORT || 3000;

// ============================================================
// POSTGRESQL
// ============================================================

const pool = new Pool({
  host: process.env.PG_HOST || "localhost",
  port: parseInt(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || "smart_grid",
  user: process.env.PG_USER || "postgres",
  password: process.env.PG_PASSWORD || "postgres",
});

// Single source of truth for transformer fault detection.
const { createFaultDetector } = require("./faultDetection");
const faults = createFaultDetector(pool);

let pgConnected = false;

// ============================================================
// DATABASE INITIALIZATION
// ============================================================

async function initDatabase() {
  let retries = 15;

  while (retries > 0) {
    let client;

    try {
      client = await pool.connect();

      console.log("[DB] Connected to PostgreSQL.");

      // --------------------------------------------------------
      // TRANSFORMERS
      // --------------------------------------------------------

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
        CREATE TABLE IF NOT EXISTS maintenance_logs (
          id SERIAL PRIMARY KEY,
          transformer_id VARCHAR(50) REFERENCES transformers(id),
          technician VARCHAR(100),
          action_taken TEXT,
          date DATE DEFAULT CURRENT_DATE,
          cost DOUBLE PRECISION DEFAULT 0,
          status VARCHAR(50) DEFAULT 'Completed'
        );
      `);

      // --------------------------------------------------------
      // CONSUMERS
      // --------------------------------------------------------

      await client.query(`
        CREATE TABLE IF NOT EXISTS consumers (
          id VARCHAR(50) PRIMARY KEY,
          phone VARCHAR(20),
          name VARCHAR(100),
          address TEXT,

          transformer_id VARCHAR(50)
            REFERENCES transformers(id),

          category VARCHAR(50),

          has_solar BOOLEAN DEFAULT false,

          current_usage_kw DOUBLE PRECISION DEFAULT 0,
          solar_gen_kw DOUBLE PRECISION DEFAULT 0,

          sanctioned_load_kw DOUBLE PRECISION DEFAULT 5,

          bill_status VARCHAR(50) DEFAULT 'Due',

          current_bill DOUBLE PRECISION DEFAULT 0,

          due_date DATE,

          theft_flag BOOLEAN DEFAULT false,

          billing_history JSONB DEFAULT '[]'::jsonb,

          -- Billing fields
          rate_per_unit DOUBLE PRECISION DEFAULT 7.0,

          fixed_charge DOUBLE PRECISION DEFAULT 0,

          current_month_units DOUBLE PRECISION DEFAULT 0,

          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // --------------------------------------------------------
      // ALTER TABLE
      // Existing database mein columns missing ho sakte hain.
      // --------------------------------------------------------

      await client.query(`
        ALTER TABLE consumers
        ADD COLUMN IF NOT EXISTS rate_per_unit DOUBLE PRECISION DEFAULT 7.0;
      `);

      await client.query(`
        ALTER TABLE consumers
        ADD COLUMN IF NOT EXISTS fixed_charge DOUBLE PRECISION DEFAULT 0;
      `);

      await client.query(`
        ALTER TABLE consumers
        ADD COLUMN IF NOT EXISTS current_month_units DOUBLE PRECISION DEFAULT 0;
      `);

      // --------------------------------------------------------
      // TELEMETRY
      // --------------------------------------------------------

      await client.query(`
        CREATE TABLE IF NOT EXISTS telemetry (
          id SERIAL PRIMARY KEY,

          transformer_id VARCHAR(50)
            REFERENCES transformers(id),

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

      // --------------------------------------------------------
      // HOUSE READINGS
      // --------------------------------------------------------

      await client.query(`
        CREATE TABLE IF NOT EXISTS house_readings (
          id SERIAL PRIMARY KEY,

          house_id VARCHAR(50) NOT NULL,

          transformer_id VARCHAR(50)
            REFERENCES transformers(id),

          timestamp TIMESTAMPTZ NOT NULL,

          raw_demand_kw DOUBLE PRECISION,

          solar_gen_kw DOUBLE PRECISION,

          net_demand_kw DOUBLE PRECISION
        );
      `);

      // --------------------------------------------------------
      // PAYMENTS TABLE
      // --------------------------------------------------------

      await client.query(`
        CREATE TABLE IF NOT EXISTS payments (
          id SERIAL PRIMARY KEY,

          consumer_id VARCHAR(50)
            REFERENCES consumers(id),

          amount DOUBLE PRECISION NOT NULL,

          payment_type VARCHAR(30) DEFAULT 'bill_payment',

          payment_status VARCHAR(30) DEFAULT 'SUCCESS',

          payment_reference VARCHAR(100),

          payment_date TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // --------------------------------------------------------
      // BILLING LEDGER
      // --------------------------------------------------------

      await client.query(`
        CREATE TABLE IF NOT EXISTS bills (
          id SERIAL PRIMARY KEY,

          consumer_id VARCHAR(50)
            REFERENCES consumers(id),

          month VARCHAR(10) NOT NULL,

          year INTEGER NOT NULL,

          units DOUBLE PRECISION DEFAULT 0,

          energy_charge DOUBLE PRECISION DEFAULT 0,

          fixed_charge DOUBLE PRECISION DEFAULT 0,

          total_amount DOUBLE PRECISION DEFAULT 0,

          amount_paid DOUBLE PRECISION DEFAULT 0,

          outstanding_amount DOUBLE PRECISION DEFAULT 0,

          status VARCHAR(30) DEFAULT 'Due',

          generated_on DATE,

          due_date DATE,

          paid_on TIMESTAMPTZ,

          UNIQUE(consumer_id, month, year)
        );
      `);

      // --------------------------------------------------------
      // FAULTS
      // --------------------------------------------------------
      // Schema and migration are handled by faultDetection.js.

      // --------------------------------------------------------
      // INDEXES
      // --------------------------------------------------------

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_telemetry_transformer_ts
        ON telemetry(transformer_id, timestamp DESC);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_house_readings_transformer_ts
        ON house_readings(transformer_id, timestamp DESC);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_bills_consumer
        ON bills(consumer_id, year DESC, month);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_payments_consumer
        ON payments(consumer_id, payment_date DESC);
      `);

      // ========================================================
      // SEED TRANSFORMERS
      // ========================================================

      await client.query(`
        INSERT INTO transformers
        (
          id,
          name,
          latitude,
          longitude,
          rated_capacity_kw,
          solar_capacity_kw,
          solar_integrated,
          status,
          location_description
        )
        VALUES

        (
          'TRF-A1',
          'BBD Transformer 01',
          26.8467,
          80.9462,
          100.0,
          25.0,
          true,
          'Healthy',
          'Gomti Nagar Sector 4'
        ),

        (
          'TRF-A2',
          'BBD Transformer 02',
          26.8467,
          80.9462,
          63.0,
          0.0,
          false,
          'Healthy',
          'Alambagh / Indira Nagar'
        ),

        (
          'TRF-B1',
          'BBD Transformer 03',
          26.8467,
          80.9462,
          500.0,
          0.0,
          false,
          'Watch',
          'NER Railway Yard'
        ),

        (
          'TX-LUCKNOW-BBD-01',
          'Default Edge Transformer',
          26.8467,
          80.9462,
          45.0,
          5.0,
          true,
          'Healthy',
          'Lucknow, UP, India'
        )

        ON CONFLICT (id) DO NOTHING;
      `);

      // ========================================================
      // SEED CONSUMERS
      // ========================================================

      const consumersSeed = [
        {
          id: "BBDU-CN-1001",
          phone: "9876543210",
          name: "Ramesh Verma",
          address: "House 12, Gomti Nagar, Lucknow",
          transformer: "TRF-A1",
          category: "Residential",
          solar: true,
          usage: 3.2,
          solarGen: 1.8,
          sanctioned: 5,
          status: "Due",
          bill: 1420,
          due: "2026-10-05",
          theft: false,
          rate: 7,
          fixed: 100,
          currentUnits: 188,
          history: [
            {
              month: "Apr",
              year: 2026,
              units: 210,
              amount: 1260,
              paid: true,
              status: "Paid",
              dueDate: "2026-05-05",
            },
          ],
        },

        {
          id: "BBDU-CN-1002",
          phone: "9123456780",
          name: "Sunita Textiles Pvt. Ltd.",
          address: "Plot 4, Industrial Area, Lucknow",
          transformer: "TRF-A1",
          category: "Industrial",
          solar: false,
          usage: 42.5,
          solarGen: 0,
          sanctioned: 60,
          status: "Paid",
          bill: 68500,
          due: "2026-09-28",
          theft: false,
          rate: 12,
          fixed: 1500,
          currentUnits: 5200,
          history: [
            {
              month: "Apr",
              year: 2026,
              units: 5200,
              amount: 62400,
              paid: true,
              status: "Paid",
              dueDate: "2026-05-05",
            },
          ],
        },

        {
          id: "BBDU-CN-1003",
          phone: "9988776655",
          name: "Anjali Sharma",
          address: "Flat 302, Alambagh, Lucknow",
          transformer: "TRF-A2",
          category: "Residential",
          solar: false,
          usage: 1.4,
          solarGen: 0,
          sanctioned: 3,
          status: "Overdue",
          bill: 890,
          due: "2026-09-10",
          theft: true,
          rate: 7,
          fixed: 100,
          currentUnits: 110,
          history: [
            {
              month: "Apr",
              year: 2026,
              units: 90,
              amount: 540,
              paid: false,
              status: "Overdue",
              dueDate: "2026-09-10",
            },
          ],
        },

        {
          id: "BBDU-CN-1004",
          phone: "9012345678",
          name: "Railway Traction Sub-Station 7",
          address: "NER Railway Yard, Lucknow",
          transformer: "TRF-B1",
          category: "Railway Traction",
          solar: false,
          usage: 310,
          solarGen: 0,
          sanctioned: 400,
          status: "Paid",
          bill: 412000,
          due: "2026-09-30",
          theft: false,
          rate: 10,
          fixed: 5000,
          currentUnits: 38000,
          history: [
            {
              month: "Apr",
              year: 2026,
              units: 38000,
              amount: 380000,
              paid: true,
              status: "Paid",
              dueDate: "2026-05-05",
            },
          ],
        },

        {
          id: "BBDU-CN-1005",
          phone: "9765432109",
          name: "Vikram Singh",
          address: "House 45, Indira Nagar, Lucknow",
          transformer: "TRF-A2",
          category: "Residential",
          solar: true,
          usage: 2.1,
          solarGen: 2.6,
          sanctioned: 4,
          status: "Paid",
          bill: 640,
          due: "2026-09-25",
          theft: false,
          rate: 7,
          fixed: 100,
          currentUnits: 160,
          history: [
            {
              month: "Apr",
              year: 2026,
              units: 160,
              amount: 960,
              paid: true,
              status: "Paid",
              dueDate: "2026-05-05",
            },
          ],
        },
      ];

      await Promise.all(consumersSeed.map(c => client.query(
          `
          INSERT INTO consumers
          (
            id,
            phone,
            name,
            address,
            transformer_id,
            category,
            has_solar,
            current_usage_kw,
            solar_gen_kw,
            sanctioned_load_kw,
            bill_status,
            current_bill,
            due_date,
            theft_flag,
            billing_history,
            rate_per_unit,
            fixed_charge,
            current_month_units
          )

          VALUES
          (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,$18
          )

          ON CONFLICT (id) DO NOTHING
          `,
          [
            c.id,
            c.phone,
            c.name,
            c.address,
            c.transformer,
            c.category,
            c.solar,
            c.usage,
            c.solarGen,
            c.sanctioned,
            c.status,
            c.bill,
            c.due,
            c.theft,
            JSON.stringify(c.history),
            c.rate,
            c.fixed,
            c.currentUnits,
          ]
        )));

      // ========================================================
      // CREATE INITIAL BILL LEDGER
      // ========================================================

      const billPromises = [];
      for (const c of consumersSeed) {
        for (const h of c.history) {
          const energyCharge = h.units * c.rate;
          const fixedCharge = c.fixed;

          billPromises.push(client.query(
            `
            INSERT INTO bills
            (
              consumer_id,
              month,
              year,
              units,
              energy_charge,
              fixed_charge,
              total_amount,
              amount_paid,
              outstanding_amount,
              status,
              generated_on,
              due_date,
              paid_on
            )

            VALUES
            (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
            )

            ON CONFLICT (consumer_id, month, year)
            DO NOTHING
            `,
            [
              c.id,
              h.month,
              h.year,
              h.units,
              energyCharge,
              fixedCharge,
              h.amount,
              h.paid ? h.amount : 0,
              h.paid ? 0 : h.amount,
              h.paid ? "Paid" : h.status || "Due",
              `${h.year}-${String(
                new Date(`${h.year}-${h.month}-01`).getMonth() + 2
              ).padStart(2, "0")}-01`,
              h.dueDate,
              h.paid ? new Date() : null,
            ]
          ));
        }
      }
      await Promise.all(billPromises);

      // ========================================================
      // SEED MAINTENANCE LOGS
      // ========================================================

      const logCount = await client.query('SELECT COUNT(*) FROM maintenance_logs');
      if (Number(logCount.rows[0].count) === 0) {
        await client.query(`
          INSERT INTO maintenance_logs (transformer_id, technician, action_taken, date, cost, status)
          VALUES 
          ('TRF-A1', 'Rajesh Kumar', 'Replaced blown fuse and checked cooling oil levels', CURRENT_DATE - INTERVAL '15 days', 1500, 'Completed'),
          ('TRF-A1', 'Amit Singh', 'Routine semi-annual inspection', CURRENT_DATE - INTERVAL '6 months', 500, 'Completed'),
          ('TRF-A2', 'Amit Singh', 'Upgraded solar inverter relay', CURRENT_DATE - INTERVAL '2 days', 4500, 'Completed'),
          ('TRF-B1', 'Vikram Singh', 'Replaced high-tension cables', CURRENT_DATE - INTERVAL '1 month', 12000, 'Completed')
        `);
      }

      // Create/migrate the fault-detection schema after transformers exist.
      await faults.ensureSchema();

      pgConnected = true;

      client.release();

      console.log("[DB] Database initialized successfully.");

      break;
    } catch (error) {
      if (client) client.release();

      console.error(
        `[DB] Connection failed. Retrying... (${retries} attempts left)`
      );

      console.error(error.message);

      retries--;

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  if (!pgConnected) {
    console.error("[DB] Could not connect to PostgreSQL.");
  }
}

// ============================================================
// KAFKA
// ============================================================

const kafka = new Kafka({
  clientId: "smart-grid-backend",
  brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
  logLevel: logLevel.WARN,
  retry: {
    retries: 3,
  },
});

const producer = kafka.producer();

const kafkaConsumer = kafka.consumer({
  groupId: "grid-monitoring-group",
});

const USE_KAFKA = process.env.KAFKA_ENABLED === "true";

let kafkaConnected = false;

// ============================================================
// KAFKA INITIALIZATION
// ============================================================

async function initKafka() {
  if (!USE_KAFKA) {
    console.log("[Kafka] KAFKA_ENABLED is not true. Skipping Kafka connection.");
    return;
  }
  
  try {
    await producer.connect();

    kafkaConnected = true;

    console.log("[Kafka] Producer connected.");

    await kafkaConsumer.connect();

    await kafkaConsumer.subscribe({
      topic: "meter-readings",
      fromBeginning: false,
    });

    await kafkaConsumer.run({
      eachMessage: async ({ message }) => {
        try {
          const data = JSON.parse(message.value.toString());

          if (pgConnected) {
            await saveTelemetry(data);

            await faults.evaluate(data);

            await runTheftDetectionEngine(data);
          }
        } catch (error) {
          console.error("[Kafka] Message error:", error.message);
        }
      },
    });

    console.log("[Kafka] Consumer connected.");
  } catch (error) {
    console.log(
      "[Kafka] Kafka unavailable. Server will continue without Kafka."
    );
  }
}

// ============================================================
// TELEMETRY
// ============================================================

async function saveTelemetry(data) {
  if (!pgConnected) return;

  try {
    const client = await pool.connect();

    const telemetry = data.transformer_telemetry || {};
    const analytics = data.edge_analytics || {};

    await client.query(
      `
      INSERT INTO telemetry
      (
        transformer_id,
        timestamp,
        temperature_c,
        ambient_light_lux,
        cloud_cover,
        gross_demand_kw,
        solar_gen_kw,
        net_load_kw,
        predicted_net_load_kw,
        predicted_solar_kw,
        status
      )

      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
      )
      `,
      [
        data.transformer_id,
        data.timestamp || new Date(),
        telemetry.temperature_c || 0,
        telemetry.ambient_light_lux || 0,
        telemetry.cloud_cover || 0,
        telemetry.gross_demand_kw || 0,
        telemetry.solar_gen_kw || 0,
        telemetry.net_load_kw || 0,
        analytics.predicted_net_load_1h_kw || 0,
        analytics.predicted_solar_1h_kw || 0,
        analytics.status || "UNKNOWN",
      ]
    );

    const houses = data.house_data || [];

    for (const house of houses) {
      await client.query(
        `
        INSERT INTO house_readings
        (
          house_id,
          transformer_id,
          timestamp,
          raw_demand_kw,
          solar_gen_kw,
          net_demand_kw
        )

        VALUES
        ($1,$2,$3,$4,$5,$6)
        `,
        [
          house.house_id,
          data.transformer_id,
          data.timestamp || new Date(),
          house.raw_demand_kw || 0,
          house.solar_gen_kw || 0,
          house.net_demand_kw || 0,
        ]
      );
    }

    client.release();
  } catch (error) {
    console.error("[DB] Telemetry error:", error.message);
  }
}

// ============================================================
// BILLING ENGINE
// ============================================================

function calculateBill(units, ratePerUnit, fixedCharge) {
  const energyCharge = units * ratePerUnit;

  const total = energyCharge + fixedCharge;

  return {
    units: Number(units.toFixed(3)),
    energyCharge: Number(energyCharge.toFixed(2)),
    fixedCharge: Number(fixedCharge.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
}

// ============================================================
// GENERATE CURRENT MONTH BILL
// ============================================================

async function generateCurrentMonthBill(consumerId) {
  const result = await pool.query(
    `
    SELECT *
    FROM consumers
    WHERE id = $1
    `,
    [consumerId]
  );

  if (result.rows.length === 0) {
    throw new Error("Consumer not found");
  }

  const consumer = result.rows[0];

  const now = new Date();

  const month = now.toLocaleString("en-US", {
    month: "short",
  });

  const year = now.getFullYear();

  const bill = calculateBill(
    Number(consumer.current_month_units || 0),
    Number(consumer.rate_per_unit || 7),
    Number(consumer.fixed_charge || 0)
  );

  return {
    consumerId,
    month,
    year,
    ...bill,
  };
}

// ============================================================
// CREATE / UPDATE MONTHLY BILL
// ============================================================

async function createMonthlyBill(consumerId) {
  const result = await pool.query(
    `
    SELECT *
    FROM consumers
    WHERE id = $1
    `,
    [consumerId]
  );

  if (result.rows.length === 0) {
    throw new Error("Consumer not found");
  }

  const consumer = result.rows[0];

  const now = new Date();

  const month = now.toLocaleString("en-US", {
    month: "short",
  });

  const year = now.getFullYear();

  const bill = calculateBill(
    Number(consumer.current_month_units || 0),
    Number(consumer.rate_per_unit || 7),
    Number(consumer.fixed_charge || 0)
  );

  const dueDate = new Date(year, now.getMonth() + 1, 5);

  await pool.query(
    `
    INSERT INTO bills
    (
      consumer_id,
      month,
      year,
      units,
      energy_charge,
      fixed_charge,
      total_amount,
      amount_paid,
      outstanding_amount,
      status,
      generated_on,
      due_date
    )

    VALUES
    (
      $1,$2,$3,$4,$5,$6,$7,0,$7,'Due',CURRENT_DATE,$8
    )

    ON CONFLICT (consumer_id, month, year)

    DO UPDATE SET
      units = EXCLUDED.units,
      energy_charge = EXCLUDED.energy_charge,
      fixed_charge = EXCLUDED.fixed_charge,
      total_amount = EXCLUDED.total_amount,
      outstanding_amount =
        GREATEST(
          EXCLUDED.total_amount - bills.amount_paid,
          0
        ),
      status =
        CASE
          WHEN bills.amount_paid >= EXCLUDED.total_amount
            THEN 'Paid'
          ELSE 'Due'
        END
    `,
    [
      consumerId,
      month,
      year,
      bill.units,
      bill.energyCharge,
      bill.fixedCharge,
      bill.total,
      dueDate,
    ]
  );

  return bill;
}

// ============================================================
// GET UNPAID BILLS
// ============================================================

async function getUnpaidBills(consumerId) {
  const result = await pool.query(
    `
    SELECT *
    FROM bills

    WHERE consumer_id = $1

    AND outstanding_amount > 0

    ORDER BY year DESC, id DESC
    `,
    [consumerId]
  );

  return result.rows.map((b) => ({
    id: b.id,
    month: b.month,
    year: b.year,
    units: Number(b.units),
    amount: Number(b.outstanding_amount),
    totalAmount: Number(b.total_amount),
    amountPaid: Number(b.amount_paid),
    status: b.status,
    generatedOn: b.generated_on,
    dueDate: b.due_date,
  }));
}

// ============================================================
// PAYMENT ENGINE
// ============================================================

async function processPayment(consumerId, requestedAmount = null) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const consumerResult = await client.query(
      `
      SELECT *
      FROM consumers
      WHERE id = $1
      FOR UPDATE
      `,
      [consumerId]
    );

    if (consumerResult.rows.length === 0) {
      throw new Error("Consumer not found");
    }

    // --------------------------------------------------------
    // Find all outstanding bills
    // --------------------------------------------------------

    const billResult = await client.query(
      `
      SELECT *
      FROM bills

      WHERE consumer_id = $1

      AND outstanding_amount > 0

      ORDER BY due_date ASC NULLS LAST, id ASC

      FOR UPDATE
      `,
      [consumerId]
    );

    if (billResult.rows.length === 0) {
      await client.query("COMMIT");

      return {
        ok: true,
        message: "No outstanding bills.",
        amountPaid: 0,
      };
    }

    const totalOutstanding = billResult.rows.reduce(
      (sum, bill) => sum + Number(bill.outstanding_amount),
      0
    );

    // Frontend Pay All mein amount nahi bhej raha.
    // Isliye amount null => complete outstanding amount.
    let remainingPayment =
      requestedAmount === null || requestedAmount === undefined
        ? totalOutstanding
        : Number(requestedAmount);

    if (!Number.isFinite(remainingPayment) || remainingPayment <= 0) {
      throw new Error("Invalid payment amount");
    }

    if (remainingPayment > totalOutstanding) {
      remainingPayment = totalOutstanding;
    }

    let actualPaid = 0;

    // --------------------------------------------------------
    // Oldest bill first
    // --------------------------------------------------------

    for (const bill of billResult.rows) {
      if (remainingPayment <= 0) break;

      const outstanding = Number(bill.outstanding_amount);

      const paymentForThisBill = Math.min(
        remainingPayment,
        outstanding
      );

      const newPaid =
        Number(bill.amount_paid) + paymentForThisBill;

      const newOutstanding =
        Number(bill.total_amount) - newPaid;

      let newStatus = "Due";

      if (newOutstanding <= 0.01) {
        newStatus = "Paid";
      } else {
        const dueDate = bill.due_date
          ? new Date(bill.due_date)
          : null;

        if (dueDate && dueDate < new Date()) {
          newStatus = "Overdue";
        }
      }

      await client.query(
        `
        UPDATE bills

        SET
          amount_paid = $1,
          outstanding_amount = $2,
          status = $3,
          paid_on =
            CASE
              WHEN $2 <= 0.01
              THEN NOW()
              ELSE paid_on
            END

        WHERE id = $4
        `,
        [
          newPaid,
          Math.max(newOutstanding, 0),
          newStatus,
          bill.id,
        ]
      );

      actualPaid += paymentForThisBill;

      remainingPayment -= paymentForThisBill;
    }

    // --------------------------------------------------------
    // Payment record
    // --------------------------------------------------------

    const paymentReference =
      "PAY-" +
      Date.now() +
      "-" +
      Math.floor(Math.random() * 10000);

    await client.query(
      `
      INSERT INTO payments
      (
        consumer_id,
        amount,
        payment_type,
        payment_status,
        payment_reference
      )

      VALUES
      ($1,$2,'bill_payment','SUCCESS',$3)
      `,
      [
        consumerId,
        Number(actualPaid.toFixed(2)),
        paymentReference,
      ]
    );

    // --------------------------------------------------------
    // Update consumer status
    // --------------------------------------------------------

    const unpaidResult = await client.query(
      `
      SELECT
        COUNT(*) AS count,
        COALESCE(SUM(outstanding_amount),0) AS outstanding,

        BOOL_OR(status = 'Overdue') AS has_overdue

      FROM bills

      WHERE consumer_id = $1

      AND outstanding_amount > 0
      `,
      [consumerId]
    );

    const unpaid = unpaidResult.rows[0];

    let consumerStatus = "Paid";

    if (Number(unpaid.count) > 0) {
      consumerStatus =
        unpaid.has_overdue === true
          ? "Overdue"
          : "Due";
    }

    // Current bill = latest outstanding/current bill
    const latestBillResult = await client.query(
      `
      SELECT total_amount
      FROM bills
      WHERE consumer_id = $1
      ORDER BY year DESC, id DESC
      LIMIT 1
      `,
      [consumerId]
    );

    const latestBill =
      latestBillResult.rows[0]?.total_amount || 0;

    await client.query(
      `
      UPDATE consumers

      SET
        bill_status = $1,
        current_bill = $2

      WHERE id = $3
      `,
      [
        consumerStatus,
        Number(latestBill),
        consumerId,
      ]
    );

    await client.query("COMMIT");

    return {
      ok: true,
      message: "Payment successful.",
      amountPaid: Number(actualPaid.toFixed(2)),
      paymentReference,
      status: consumerStatus,
      remainingOutstanding: Number(
        unpaid.outstanding
      ),
    };
  } catch (error) {
    await client.query("ROLLBACK");

    throw error;
  } finally {
    client.release();
  }
}

// ============================================================
// UPDATE CURRENT MONTH UNITS
// ============================================================

async function updateConsumerUsage(
  consumerId,
  units
) {
  if (!Number.isFinite(Number(units))) {
    throw new Error("Invalid units");
  }

  const result = await pool.query(
    `
    UPDATE consumers

    SET current_month_units = GREATEST(
      current_month_units + $1,
      0
    )

    WHERE id = $2

    RETURNING *
    `,
    [Number(units), consumerId]
  );

  return result.rows[0];
}

// ============================================================
// BILLING HISTORY
// ============================================================

async function getBillingHistory(consumerId) {
  const result = await pool.query(
    `
    SELECT *
    FROM bills

    WHERE consumer_id = $1

    ORDER BY year DESC, id DESC
    `,
    [consumerId]
  );

  return result.rows.map((b) => ({
    month: b.month,
    year: b.year,
    units: Number(b.units),
    amount: Number(b.total_amount),
    paid: Number(b.outstanding_amount) <= 0.01,
    status: b.status,
    dueDate: b.due_date,
    generatedOn: b.generated_on,
  }));
}

// ============================================================
// MAP CONSUMER FOR FRONTEND
// ============================================================

async function mapConsumerDBtoFrontend(dbObj) {
  const billingHistory =
    await getBillingHistory(dbObj.id);

  const unpaidBills =
    await getUnpaidBills(dbObj.id);

  return {
    consumerId: dbObj.id,

    phone: dbObj.phone,

    name: dbObj.name,

    address: dbObj.address,

    transformerId: dbObj.transformer_id,

    category: dbObj.category,

    hasSolar: dbObj.has_solar,

    currentUsageKW: Number(
      dbObj.current_usage_kw || 0
    ),

    solarGenKW: Number(
      dbObj.solar_gen_kw || 0
    ),

    sanctionedLoadKW: Number(
      dbObj.sanctioned_load_kw || 0
    ),

    billStatus: dbObj.bill_status,

    currentBill: Number(
      dbObj.current_bill || 0
    ),

    dueDate: dbObj.due_date,

    theftFlag: dbObj.theft_flag,

    // Billing fields
    ratePerUnit: Number(
      dbObj.rate_per_unit || 7
    ),

    fixedCharge: Number(
      dbObj.fixed_charge || 0
    ),

    currentMonthUnits: Number(
      dbObj.current_month_units || 0
    ),

    billingHistory,

    unpaidBills,
  };
}

// ============================================================
// MAP TRANSFORMER
// ============================================================

function mapTransformerDBtoFrontend(dbObj) {
  return {
    transformerId: dbObj.id,

    location: dbObj.location_description,

    ratedCapacityKW: Number(
      dbObj.rated_capacity_kw
    ),

    solarIntegrated:
      dbObj.solar_integrated,

    solarCapacityKW: Number(
      dbObj.solar_capacity_kw
    ),

    status: dbObj.status,
  };
}

// ============================================================
// HEALTH
// ============================================================

app.get("/api/health", (req, res) => {
  res.json({
    status: "running",
    postgres: pgConnected,
    kafka: kafkaConnected,
  });
});

// ============================================================
// AUTH - CONSUMER
// ============================================================

app.post("/api/auth/consumer", async (req, res) => {
  try {
    const { consumerId, phone } = req.body;

    if (!consumerId || !phone) {
      return res.status(400).json({
        ok: false,
        message: "Consumer ID and mobile number are required.",
      });
    }

    if (!pgConnected) {
      return res.status(503).json({
        ok: false,
        message:
          "Database is still starting. Please try again.",
      });
    }

    const result = await pool.query(
      `
      SELECT *
      FROM consumers
      WHERE id = $1
      `,
      [consumerId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        ok: false,
        message: "No consumer found.",
      });
    }

    const consumer = result.rows[0];

    if (consumer.phone !== phone) {
      return res.status(401).json({
        ok: false,
        message: "Incorrect mobile number.",
      });
    }

    const frontendConsumer =
      await mapConsumerDBtoFrontend(consumer);

    res.json({
      ok: true,
      consumer: frontendConsumer,
    });
  } catch (error) {
    console.error(
      "[AUTH CONSUMER]",
      error.message
    );

    res.status(500).json({
      ok: false,
      message: "Server error.",
    });
  }
});

// ============================================================
// AUTH - GOVERNMENT
// ============================================================

app.post("/api/auth/gov", (req, res) => {
  const { username, password } = req.body;

  if (
    username === "admin" &&
    password === "grid@2026"
  ) {
    return res.json({
      ok: true,
    });
  }

  res.status(401).json({
    ok: false,
    message: "Invalid credentials",
  });
});

// ============================================================
// GET ALL CONSUMERS
// ============================================================

app.get("/api/consumers", async (req, res) => {
  try {
    if (!pgConnected) {
      return res.status(503).json([]);
    }

    const result = await pool.query(
      `
      SELECT *
      FROM consumers
      ORDER BY id
      `
    );

    const consumers = await Promise.all(
      result.rows.map(consumer => mapConsumerDBtoFrontend(consumer))
    );

    res.json(consumers);
  } catch (error) {
    console.error(
      "[GET CONSUMERS]",
      error.message
    );

    res.status(500).json([]);
  }
});

// ============================================================
// GET SINGLE CONSUMER
// ============================================================

app.get(
  "/api/consumers/:id",
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT *
        FROM consumers
        WHERE id = $1
        `,
        [req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Consumer not found",
        });
      }

      const consumer =
        await mapConsumerDBtoFrontend(
          result.rows[0]
        );

      res.json(consumer);
    } catch (error) {
      console.error(error.message);

      res.status(500).json({
        error: "Server error",
      });
    }
  }
);

// ============================================================
// PAY BILL
// ============================================================

app.post(
  "/api/consumers/:id/pay",
  async (req, res) => {
    try {
      if (!pgConnected) {
        return res.status(503).json({
          ok: false,
          error: "Database unavailable",
        });
      }

      const { id } = req.params;

      /*
        Frontend currently:

        fetch(
          `/api/consumers/${activeConsumerId}/pay`,
          {
            method: "POST"
          }
        )

        So no amount means PAY ALL.
      */

      const amount =
        req.body &&
        req.body.amount !== undefined
          ? Number(req.body.amount)
          : null;

      const result =
        await processPayment(id, amount);

      res.json(result);
    } catch (error) {
      console.error(
        "[PAYMENT]",
        error.message
      );

      res.status(400).json({
        ok: false,
        message: error.message,
      });
    }
  }
);

// ============================================================
// BILLING HISTORY
// ============================================================

app.get(
  "/api/consumers/:id/bills",
  async (req, res) => {
    try {
      const bills =
        await getBillingHistory(
          req.params.id
        );

      res.json(bills);
    } catch (error) {
      console.error(error.message);

      res.status(500).json({
        error: "Unable to fetch billing history",
      });
    }
  }
);

// ============================================================
// UNPAID BILLS
// ============================================================

app.get(
  "/api/consumers/:id/unpaid-bills",
  async (req, res) => {
    try {
      const bills =
        await getUnpaidBills(
          req.params.id
        );

      res.json(bills);
    } catch (error) {
      console.error(error.message);

      res.status(500).json({
        error: "Unable to fetch unpaid bills",
      });
    }
  }
);

// ============================================================
// CURRENT BILL
// ============================================================

app.get(
  "/api/consumers/:id/current-bill",
  async (req, res) => {
    try {
      const bill =
        await generateCurrentMonthBill(
          req.params.id
        );

      res.json(bill);
    } catch (error) {
      console.error(error.message);

      res.status(500).json({
        error: error.message,
      });
    }
  }
);

// ============================================================
// ADD CONSUMPTION UNITS
// ============================================================

app.post(
  "/api/consumers/:id/usage",
  async (req, res) => {
    try {
      const { units } = req.body;

      const consumer =
        await updateConsumerUsage(
          req.params.id,
          Number(units)
        );

      res.json({
        ok: true,
        currentMonthUnits:
          consumer.current_month_units,
      });
    } catch (error) {
      console.error(
        "[USAGE]",
        error.message
      );

      res.status(400).json({
        ok: false,
        message: error.message,
      });
    }
  }
);

// ============================================================
// MAINTENANCE LOGS
// ============================================================

app.get("/api/maintenance", async (req, res) => {
  try {
    if (!pgConnected) return res.status(503).json([]);
    const result = await pool.query(`
      SELECT m.*, t.name as transformer_name 
      FROM maintenance_logs m
      JOIN transformers t ON m.transformer_id = t.id
      ORDER BY m.date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("[MAINTENANCE]", error.message);
    res.status(500).json([]);
  }
});

app.post("/api/maintenance", async (req, res) => {
  try {
    const { transformer_id, technician, action_taken, cost } = req.body;
    await pool.query(
      `INSERT INTO maintenance_logs (transformer_id, technician, action_taken, cost) VALUES ($1, $2, $3, $4)`,
      [transformer_id, technician, action_taken, cost]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("[MAINTENANCE POST]", error.message);
    res.status(500).json({ error: "Failed to add log" });
  }
});

// ============================================================
// TRANSFORMERS
// ============================================================

app.get(
  "/api/transformers",
  async (req, res) => {
    try {
      if (!pgConnected) {
        return res.status(503).json([]);
      }

      const result = await pool.query(
        `
        SELECT *
        FROM transformers
        ORDER BY id
        `
      );

      res.json(
        result.rows.map(
          mapTransformerDBtoFrontend
        )
      );
    } catch (error) {
      console.error(
        "[TRANSFORMERS]",
        error.message
      );

      res.status(500).json([]);
    }
  }
);

// ============================================================
// TOGGLE SOLAR
// ============================================================

app.post(
  "/api/transformers/:id/toggle-solar",
  async (req, res) => {
    try {
      await pool.query(
        `
        UPDATE transformers

        SET solar_integrated =
          NOT solar_integrated

        WHERE id = $1
        `,
        [req.params.id]
      );

      res.json({
        ok: true,
      });
    } catch (error) {
      console.error(error.message);

      res.status(500).json({
        ok: false,
      });
    }
  }
);

// ============================================================
// ADD SOLAR PLANT
// ============================================================

app.post(
  "/api/transformers/:id/add-solar",
  async (req, res) => {
    try {
      const capacityKW =
        Number(req.body.capacityKW);

      if (
        !Number.isFinite(capacityKW) ||
        capacityKW <= 0
      ) {
        return res.status(400).json({
          ok: false,
          message:
            "Invalid solar capacity.",
        });
      }

      await pool.query(
        `
        UPDATE transformers

        SET
          solar_integrated = true,

          solar_capacity_kw =
            solar_capacity_kw + $1

        WHERE id = $2
        `,
        [
          capacityKW,
          req.params.id,
        ]
      );

      res.json({
        ok: true,
      });
    } catch (error) {
      console.error(
        "[SOLAR]",
        error.message
      );

      res.status(500).json({
        ok: false,
      });
    }
  }
);

// ============================================================
// TRANSFORMER CONFIG
// ============================================================

app.get(
  "/api/config/:transformerId",
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT *
        FROM transformers
        WHERE id = $1
        `,
        [req.params.transformerId]
      );

      if (result.rows.length > 0) {
        return res.json(result.rows[0]);
      }

      res.json({
        transformer_id:
          req.params.transformerId,

        solar_capacity_kw: 5,
      });
    } catch (error) {
      res.status(500).json({
        error: "Config unavailable",
      });
    }
  }
);

// ============================================================
// CLOUD INGEST
// ============================================================

app.post(
  "/api/cloud/ingest",
  async (req, res) => {
    const data = req.body;

    let viaKafka = false;

    if (kafkaConnected) {
      try {
        await producer.send({
          topic: "meter-readings",

          messages: [
            {
              key: data.transformer_id,

              value: JSON.stringify(data),
            },
          ],
        });

        viaKafka = true;
      } catch (error) {
        console.error(
          "[Kafka Producer]",
          error.message
        );
      }
    }

    if (!viaKafka && pgConnected) {
      await saveTelemetry(data);

      await faults.evaluate(data);
    }

    res.json({
      status: "ingested",
      viaKafka,
    });
  }
);

// ============================================================
// SERVERLESS DEMO TICK
// ============================================================

app.post("/api/demo/tick", async (req, res) => {
  try {
    const trfId = req.body.transformer_id || "TRF-DEMO-01";
    let config = { solar_capacity_kw: 5.0, solar_integrated: true };
    
    if (pgConnected) {
      const dbRes = await pool.query("SELECT solar_capacity_kw, solar_integrated FROM transformers WHERE id = $1", [trfId]);
      if (dbRes.rows.length > 0) {
        config.solar_capacity_kw = Number(dbRes.rows[0].solar_capacity_kw);
        config.solar_integrated = req.body.solar_integrated_override !== undefined 
          ? req.body.solar_integrated_override 
          : dbRes.rows[0].solar_integrated;
      }
    }

    // 1. Call Python Serverless Simulator
    const pyResponse = await fetch("http://127.0.0.1:5005/api/python/simulate-tick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...req.body, ...config }),
    });

    if (!pyResponse.ok) {
      return res.status(500).json({ error: "Python simulation failed" });
    }

    const payload = await pyResponse.json();

    // 2. Process payload in Node Backend
    if (pgConnected) {
      // The fault engine expects a nested structure matching the DPU output
      const structuredPayload = {
        transformer_id: payload.transformer_id,
        timestamp: payload.timestamp,
        house_data: payload.house_data,
        transformer_telemetry: {
          temperature_c: payload.temperature_c,
          ambient_light_lux: payload.ambient_light_lux,
          cloud_cover: payload.cloud_cover,
          gross_demand_kw: payload.gross_demand_kw,
          metered_demand_kw: payload.metered_demand_kw,
          solar_gen_kw: payload.solar_gen_kw,
          net_load_kw: payload.net_load_kw
        },
        edge_analytics: {
          predicted_net_load_1h_kw: payload.predicted_net_load_kw,
          status: payload.predicted_net_load_kw > 100 ? "WARNING" : "NORMAL"
        }
      };

      await saveTelemetry(structuredPayload);
      await faults.evaluate(structuredPayload);
    }

    res.json({ ok: true, payload });
  } catch (err) {
    console.error("[DEMO TICK ERROR]", err);
    res.status(500).json({ error: "Failed to run simulation tick" });
  }
});

// ============================================================
// FAULT DETECTION
// ============================================================
// Implemented by backend/faultDetection.js. Telemetry is written first,
// then faults.evaluate(data) runs against the latest telemetry history.

// THEFT DETECTION has been moved to faultDetection.js (Transformer-level loss)
// ============================================================
// FAULT API
// ============================================================

app.get("/api/faults", async (req, res) => {
  try {
    if (!pgConnected) return res.status(503).json([]);
    const data = await faults.listFaults({ status: req.query.status });
    res.json(data);
  } catch (error) {
    console.error("[FAULT LIST]", error.message);
    res.status(500).json([]);
  }
});

app.post("/api/faults/:id/resolve", async (req, res) => {
  try {
    if (!pgConnected) {
      return res.status(503).json({ ok: false, message: "DB down" });
    }

    const faultId = Number(req.params.id);
    if (!Number.isInteger(faultId)) {
      return res.status(400).json({ ok: false, message: "Invalid fault id" });
    }

    const ok = await faults.resolveFault(
      faultId,
      req.body?.note || "Resolved by government operator"
    );

    if (!ok) {
      return res.status(404).json({
        ok: false,
        message: "Open fault not found",
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("[FAULT RESOLVE]", error.message);
    res.status(500).json({
      ok: false,
      message: "Could not resolve fault",
    });
  }
});

// ============================================================
// MAINTENANCE LOGS
// ============================================================

app.get("/api/maintenance", async (req, res) => {
  try {
    if (!pgConnected) return res.status(503).json([]);
    const result = await pool.query(
      `SELECT m.*, t.name as transformer_name 
       FROM maintenance_logs m 
       JOIN transformers t ON m.transformer_id = t.id 
       ORDER BY m.date DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("[MAINTENANCE LOGS]", error.message);
    res.status(500).json([]);
  }
});

// ============================================================
// BILLING WATCHDOG
// ============================================================

// Jin bills ki due date nikal chuki hai aur paisa baaki hai,
// unhe "Overdue" mark karta hai, aur consumer ka bill_status bhi sync karta hai.
async function updateOverdueBills() {
  if (!pgConnected) return;

  try {
    const billResult = await pool.query(`
      UPDATE bills
      SET status = 'Overdue'
      WHERE status = 'Due'
        AND outstanding_amount > 0.01
        AND due_date IS NOT NULL
        AND due_date < CURRENT_DATE
    `);

    if (billResult.rowCount > 0) {
      await pool.query(`
        UPDATE consumers
        SET bill_status = 'Overdue'
        WHERE id IN (
          SELECT DISTINCT consumer_id
          FROM bills
          WHERE status = 'Overdue'
            AND outstanding_amount > 0.01
        )
      `);

      console.log(
        `[Billing] Marked ${billResult.rowCount} bill(s) as Overdue.`
      );
    }
  } catch (error) {
    console.error("[Billing] Overdue update failed:", error.message);
  }
}

// Server start hote hi ek baar chalao, phir har ghante.
setInterval(
  updateOverdueBills,
  60 * 60 * 1000
);

// ============================================================
// START SERVER
// ============================================================

async function startServer() {
  await initDatabase();

  // Check every minute for transformers that stopped sending telemetry.
  faults.startWatchdog();

  await initKafka();

  await updateOverdueBills();

  app.listen(
    PORT,
    () => {
      console.log(
        "=========================================="
      );

      console.log(
        `Smart Grid Backend running on port ${PORT}`
      );

      console.log(
        `http://localhost:${PORT}`
      );

      console.log(
        "=========================================="
      );
    }
  );
}

startServer();