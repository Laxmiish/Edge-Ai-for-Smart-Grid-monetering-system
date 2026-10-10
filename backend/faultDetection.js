/**
 * Fault Detection Engine (Level 3 - Cloud)
 * -----------------------------------------
 * Single source of truth for transformer fault detection.
 *
 * Detects:
 *  - OVERLOAD
 *  - PREDICTED_OVERLOAD
 *  - OVERHEAT
 *  - LOAD_DROP
 *  - SOLAR_UNDERPERFORMANCE
 *  - SENSOR_FLATLINE
 *  - COMMUNICATION_LOSS
 */

const THRESHOLDS = {
  OVERLOAD_WARN_PCT: 85,
  OVERLOAD_CRIT_PCT: 100,

  TEMP_WARN_C: 75,
  TEMP_CRIT_C: 85,

  LOAD_DROP_PCT: 80,
  MIN_AVG_LOAD_FOR_DROP_KW: 5,

  SOLAR_MIN_LUX: 600,
  SOLAR_MAX_CLOUD: 0.30,
  SOLAR_MIN_RATIO: 0.15,

  FLATLINE_READINGS: 10,
  COMM_LOSS_MINUTES: 5,

  CONFIRM_READINGS: 2,
  CLEAR_READINGS: 5,
};

const FAULT_TYPES = [
  "OVERLOAD",
  "PREDICTED_OVERLOAD",
  "OVERHEAT",
  "LOAD_DROP",
  "SOLAR_UNDERPERFORMANCE",
  "SENSOR_FLATLINE",
  "COMMUNICATION_LOSS",
  "THEFT_DETECTED",
  "AGING_HARDWARE",
];

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const keyOf = (transformerId, type) => `${transformerId}:${type}`;

function mapFault(row) {
  return {
    id: row.id,
    transformerId: row.transformer_id,
    type: row.type,
    severity: row.severity,
    message: row.message,
    details: row.details || {},
    status: row.status,
    detectedAt: row.detected_at,
    lastSeenAt: row.last_seen_at,
    resolvedAt: row.resolved_at,
    resolutionNote: row.resolution_note,
  };
}

function createFaultDetector(pool) {
  const violationStreak = new Map();
  const normalStreak = new Map();
  const openKeys = new Set();

  async function ensureSchema() {
    /*
     * Create the faults table for completely new databases.
     *
     * IMPORTANT:
     * Older databases may already have a faults table without
     * the `type` column. CREATE TABLE IF NOT EXISTS does NOT
     * modify an existing table, so migrations are handled below.
     */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS faults (
        id SERIAL PRIMARY KEY,
        transformer_id VARCHAR(50),
        type VARCHAR(100) NOT NULL,
        severity VARCHAR(30) NOT NULL,
        message TEXT,
        details JSONB DEFAULT '{}'::jsonb,
        status VARCHAR(30) DEFAULT 'open',
        detected_at TIMESTAMPTZ DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        resolution_note TEXT
      );
    `);

    /*
     * ---------------------------------------------------------
     * MIGRATION FOR OLD DATABASES
     * ---------------------------------------------------------
     */

    // Older faults tables may not have the `type` column.
    await pool.query(`
      ALTER TABLE faults
      ADD COLUMN IF NOT EXISTS type VARCHAR(100);
    `);

    /*
     * Existing rows from the old schema have no fault type.
     * Give them a unique legacy type so:
     *
     * 1. They can satisfy NOT NULL.
     * 2. The unique open-fault index can be created safely.
     * 3. Existing data is not deleted.
     */
    await pool.query(`
      UPDATE faults
      SET type = 'LEGACY_' || id::text
      WHERE type IS NULL;
    `);

    // Now that every row has a value, make type mandatory.
    await pool.query(`
      ALTER TABLE faults
      ALTER COLUMN type SET NOT NULL;
    `);

    // Add details column for older databases.
    await pool.query(`
      ALTER TABLE faults
      ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;
    `);

    // Add last_seen_at column for older databases.
    await pool.query(`
      ALTER TABLE faults
      ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();
    `);

    // Fill last_seen_at for existing rows.
    await pool.query(`
      UPDATE faults
      SET last_seen_at = COALESCE(last_seen_at, detected_at, NOW())
      WHERE last_seen_at IS NULL;
    `);

    /*
     * One open fault of a particular type is allowed per transformer.
     */
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_fault
      ON faults (transformer_id, type)
      WHERE status = 'open';
    `);

    /*
     * Load currently open faults into memory.
     */
    const { rows } = await pool.query(`
      SELECT transformer_id, type
      FROM faults
      WHERE status = 'open'
    `);

    openKeys.clear();

    rows.forEach((row) => {
      openKeys.add(keyOf(row.transformer_id, row.type));
    });

    console.log(
      `[Fault] Engine ready. ${openKeys.size} open fault(s) loaded.`
    );
  }

  async function syncTransformerStatus(transformerId) {
    await pool.query(
      `
      UPDATE transformers
      SET status = COALESCE(
        (
          SELECT CASE
            WHEN bool_or(severity = 'CRITICAL') THEN 'Critical'
            ELSE 'Watch'
          END
          FROM faults
          WHERE transformer_id = $1
            AND status = 'open'
          HAVING COUNT(*) > 0
        ),
        'Healthy'
      )
      WHERE id = $1
      `,
      [transformerId]
    );
  }

  async function raiseFault(transformerId, fault) {
    const result = await pool.query(
      `
      INSERT INTO faults
        (
          transformer_id,
          type,
          severity,
          message,
          details,
          status,
          detected_at,
          last_seen_at
        )
      VALUES
        ($1, $2, $3, $4, $5, 'open', NOW(), NOW())

      ON CONFLICT (transformer_id, type) WHERE status = 'open'
      DO UPDATE SET
        severity = EXCLUDED.severity,
        message = EXCLUDED.message,
        details = EXCLUDED.details,
        last_seen_at = NOW()

      RETURNING id, (xmax = 0) AS inserted
      `,
      [
        transformerId,
        fault.type,
        fault.severity,
        fault.message,
        JSON.stringify(fault.details || {}),
      ]
    );

    openKeys.add(keyOf(transformerId, fault.type));

    if (result.rows[0]?.inserted) {
      console.log(
        `[Fault] ${fault.severity} ${fault.type} on ${transformerId}: ${fault.message}`
      );
    }

    await syncTransformerStatus(transformerId);
  }

  async function autoClear(transformerId, type) {
    const result = await pool.query(
      `
      UPDATE faults
      SET
        status = 'auto_cleared',
        resolved_at = NOW(),
        last_seen_at = NOW()
      WHERE transformer_id = $1
        AND type = $2
        AND status = 'open'
      `,
      [transformerId, type]
    );

    const key = keyOf(transformerId, type);

    openKeys.delete(key);
    violationStreak.delete(key);
    normalStreak.delete(key);

    if (result.rowCount > 0) {
      console.log(
        `[Fault] Auto-cleared ${type} on ${transformerId}`
      );

      await syncTransformerStatus(transformerId);
    }
  }

  function detect(transformer, telemetry, analytics, history) {
    const detections = [];

    const netLoad = num(telemetry.net_load_kw);
    const temperature = num(telemetry.temperature_c);
    const solarGeneration = num(telemetry.solar_gen_kw);
    const ambientLux = num(telemetry.ambient_light_lux);
    const cloudCover = num(telemetry.cloud_cover);

    const meteredDemand = num(telemetry.metered_demand_kw);
    const grossDemand = num(telemetry.gross_demand_kw);

    const ratedCapacity = num(transformer.rated_capacity_kw);
    const solarCapacity = num(transformer.solar_capacity_kw);

    // ---------------------------------------------------------
    // 1. CURRENT TRANSFORMER OVERLOAD
    // ---------------------------------------------------------

    if (ratedCapacity > 0) {
      const loadPct =
        (Math.max(netLoad, 0) / ratedCapacity) * 100;

      const details = {
        loadPct: Number(loadPct.toFixed(1)),
        netLoadKW: netLoad,
        ratedKW: ratedCapacity,
      };

      const message =
        `Load at ${loadPct.toFixed(0)}% of rated capacity ` +
        `(${netLoad.toFixed(1)} / ${ratedCapacity} kW)`;

      if (loadPct >= THRESHOLDS.OVERLOAD_CRIT_PCT) {
        detections.push({
          type: "OVERLOAD",
          severity: "CRITICAL",
          message,
          details,
        });
      } else if (loadPct >= THRESHOLDS.OVERLOAD_WARN_PCT) {
        detections.push({
          type: "OVERLOAD",
          severity: "WARNING",
          message,
          details,
        });
      }
    }

    // ---------------------------------------------------------
    // 2. EDGE-AI ONE-HOUR OVERLOAD PREDICTION
    // ---------------------------------------------------------

    const predictedLoad = num(
      analytics.predicted_net_load_1h_kw
    );

    if (
      ratedCapacity > 0 &&
      (
        analytics.status === "CRITICAL_OVERLOAD_RISK" ||
        predictedLoad > ratedCapacity
      )
    ) {
      detections.push({
        type: "PREDICTED_OVERLOAD",
        severity:
          predictedLoad > ratedCapacity
            ? "CRITICAL"
            : "WARNING",
        message:
          `Edge AI predicts ${predictedLoad.toFixed(1)} kW load ` +
          `within 1 hour (rated ${ratedCapacity} kW)`,
        details: {
          predictedKW: predictedLoad,
          ratedKW: ratedCapacity,
        },
      });
    }

    // ---------------------------------------------------------
    // 3. TRANSFORMER TEMPERATURE
    // ---------------------------------------------------------

    if (temperature >= THRESHOLDS.TEMP_WARN_C) {
      detections.push({
        type: "OVERHEAT",
        severity:
          temperature >= THRESHOLDS.TEMP_CRIT_C
            ? "CRITICAL"
            : "WARNING",
        message:
          `Transformer temperature is ${temperature.toFixed(1)} °C`,
        details: {
          temperatureC: temperature,
        },
      });
    }

    // ---------------------------------------------------------
    // 4. SUDDEN LOAD DROP
    // ---------------------------------------------------------

    const previousLoads = history
      .slice(1)
      .map((row) => num(row.net_load_kw));

    if (previousLoads.length >= 5) {
      const average =
        previousLoads.reduce(
          (sum, value) => sum + value,
          0
        ) / previousLoads.length;

      if (
        average >= THRESHOLDS.MIN_AVG_LOAD_FOR_DROP_KW &&
        netLoad <=
          average *
            (1 - THRESHOLDS.LOAD_DROP_PCT / 100)
      ) {
        detections.push({
          type: "LOAD_DROP",
          severity: "CRITICAL",
          message:
            `Load fell to ${netLoad.toFixed(1)} kW ` +
            `from a recent average of ${average.toFixed(1)} kW ` +
            `- possible feeder trip or outage`,
          details: {
            netLoadKW: netLoad,
            recentAvgKW: Number(
              average.toFixed(1)
            ),
          },
        });
      }
    }

    // ---------------------------------------------------------
    // 5. SOLAR UNDERPERFORMANCE
    // ---------------------------------------------------------

    if (
      transformer.solar_integrated &&
      solarCapacity > 0 &&
      ambientLux >= THRESHOLDS.SOLAR_MIN_LUX &&
      cloudCover <= THRESHOLDS.SOLAR_MAX_CLOUD &&
      solarGeneration <
        solarCapacity * THRESHOLDS.SOLAR_MIN_RATIO
    ) {
      detections.push({
        type: "SOLAR_UNDERPERFORMANCE",
        severity: "WARNING",
        message:
          `Solar generating ${solarGeneration.toFixed(1)} kW ` +
          `of ${solarCapacity} kW capacity in clear sky ` +
          `- panel or inverter issue likely`,
        details: {
          solarGenKW: solarGeneration,
          solarCapacityKW: solarCapacity,
          ambientLightLux: ambientLux,
          cloudCover,
        },
      });
    }

    // ---------------------------------------------------------
    // 6. LINE LOSS (THEFT VS AGING HARDWARE)
    // ---------------------------------------------------------
    
    if (grossDemand > 0 && meteredDemand > 0) {
      const loss = grossDemand - meteredDemand;
      const lossPct = (loss / grossDemand) * 100;

      if (lossPct > 15) {
        detections.push({
          type: "THEFT_DETECTED",
          severity: "CRITICAL",
          message: `High Discrepancy (Katiya): ${loss.toFixed(1)} kW (${lossPct.toFixed(1)}%) unaccounted for.`,
          details: { lossKW: loss, lossPct, grossDemand, meteredDemand },
        });
      } else if (lossPct > 8) {
        detections.push({
          type: "AGING_HARDWARE",
          severity: "WARNING",
          message: `Technical Loss: ${loss.toFixed(1)} kW (${lossPct.toFixed(1)}%) dissipated as heat. Check hardware.`,
          details: { lossKW: loss, lossPct, grossDemand, meteredDemand },
        });
      }
    }

    // ---------------------------------------------------------
    // 7. SENSOR FLATLINE
    // ---------------------------------------------------------

    if (
      history.length >= THRESHOLDS.FLATLINE_READINGS
    ) {
      const first = history[0];

      const stuck = history.every(
        (row) =>
          Number(row.temperature_c) ===
            Number(first.temperature_c) &&
          Number(row.net_load_kw) ===
            Number(first.net_load_kw)
      );

      if (stuck) {
        detections.push({
          type: "SENSOR_FLATLINE",
          severity: "WARNING",
          message:
            `Readings unchanged for the last ` +
            `${THRESHOLDS.FLATLINE_READINGS} samples ` +
            `- sensor may be stuck`,
          details: {
            temperatureC: num(
              first.temperature_c
            ),
            netLoadKW: num(
              first.net_load_kw
            ),
            samples:
              THRESHOLDS.FLATLINE_READINGS,
          },
        });
      }
    }

    return detections;
  }

  async function evaluate(data) {
    try {
      const transformerId = data?.transformer_id;

      if (!transformerId) return;

      const transformerResult = await pool.query(
        `
        SELECT
          rated_capacity_kw,
          solar_capacity_kw,
          solar_integrated
        FROM transformers
        WHERE id = $1
        `,
        [transformerId]
      );

      if (!transformerResult.rows.length) return;

      // Any new reading means communication is back.
      if (
        openKeys.has(
          keyOf(
            transformerId,
            "COMMUNICATION_LOSS"
          )
        )
      ) {
        await autoClear(
          transformerId,
          "COMMUNICATION_LOSS"
        );
      }

      /*
       * IMPORTANT:
       * saveTelemetry() is called before evaluate(),
       * so the current reading is included as history[0].
       */
      const historyResult = await pool.query(
        `
        SELECT
          temperature_c,
          net_load_kw
        FROM telemetry
        WHERE transformer_id = $1
        ORDER BY timestamp DESC
        LIMIT $2
        `,
        [
          transformerId,
          THRESHOLDS.FLATLINE_READINGS,
        ]
      );

      const detections = detect(
        transformerResult.rows[0],
        data.transformer_telemetry || {},
        data.edge_analytics || {},
        historyResult.rows
      );

      const activeTypes = new Set(
        detections.map((d) => d.type)
      );

      // Process active detections.
      for (const detection of detections) {
        const key = keyOf(
          transformerId,
          detection.type
        );

        normalStreak.delete(key);

        const streak =
          (violationStreak.get(key) || 0) + 1;

        violationStreak.set(key, streak);

        if (
          streak >=
          THRESHOLDS.CONFIRM_READINGS
        ) {
          await raiseFault(
            transformerId,
            detection
          );
        }
      }

      // Process faults that are no longer active.
      for (const type of FAULT_TYPES) {
        if (activeTypes.has(type)) continue;

        const key = keyOf(
          transformerId,
          type
        );

        violationStreak.delete(key);

        if (!openKeys.has(key)) continue;

        const streak =
          (normalStreak.get(key) || 0) + 1;

        normalStreak.set(key, streak);

        if (
          streak >=
          THRESHOLDS.CLEAR_READINGS
        ) {
          await autoClear(
            transformerId,
            type
          );
        }
      }
    } catch (error) {
      console.error(
        "[Fault] evaluate error:",
        error.message
      );
    }
  }

  /*
   * Runs every minute.
   * A transformer is considered silent after 5 minutes.
   */
  function startWatchdog(intervalMs = 60_000) {
    return setInterval(async () => {
      try {
        const { rows } = await pool.query(`
          SELECT
            transformer_id,
            MAX(timestamp) AS last_seen
          FROM telemetry
          WHERE timestamp > NOW() - INTERVAL '1 day'
          GROUP BY transformer_id
        `);

        for (const row of rows) {
          const lastSeen =
            new Date(row.last_seen).getTime();

          const minutesSilent =
            (Date.now() - lastSeen) / 60_000;

          if (
            minutesSilent >=
            THRESHOLDS.COMM_LOSS_MINUTES
          ) {
            await raiseFault(
              row.transformer_id,
              {
                type: "COMMUNICATION_LOSS",
                severity: "CRITICAL",
                message:
                  `No telemetry received for ` +
                  `${Math.floor(minutesSilent)} minutes`,
                details: {
                  minutesSilent:
                    Math.floor(minutesSilent),
                },
              }
            );
          }
        }
      } catch (error) {
        console.error(
          "[Fault] watchdog error:",
          error.message
        );
      }
    }, intervalMs);
  }

  async function listFaults({ status } = {}) {
    let query = `
      SELECT *
      FROM faults
    `;

    const values = [];

    if (status) {
      query += `
        WHERE status = $1
      `;

      values.push(status);
    } else {
      // Active faults + faults resolved/auto-cleared
      // in the last 24 hours.
      query += `
        WHERE status = 'open'
           OR resolved_at > NOW() - INTERVAL '24 hours'
      `;
    }

    query += `
      ORDER BY detected_at DESC
      LIMIT 200
    `;

    const { rows } =
      await pool.query(
        query,
        values
      );

    return rows.map(mapFault);
  }

  async function resolveFault(id, note) {
    const { rows } = await pool.query(
      `
      UPDATE faults
      SET
        status = 'resolved',
        resolved_at = NOW(),
        resolution_note = $2
      WHERE id = $1
        AND status = 'open'
      RETURNING transformer_id, type
      `,
      [
        id,
        note ||
          "Resolved by government operator",
      ]
    );

    if (!rows.length) return false;

    const transformerId =
      rows[0].transformer_id;

    const type = rows[0].type;

    const key = keyOf(
      transformerId,
      type
    );

    openKeys.delete(key);
    violationStreak.delete(key);
    normalStreak.delete(key);

    await syncTransformerStatus(
      transformerId
    );

    return true;
  }

  return {
    ensureSchema,
    evaluate,
    startWatchdog,
    listFaults,
    resolveFault,
    THRESHOLDS,
  };
}

module.exports = {
  createFaultDetector,
  THRESHOLDS,
  FAULT_TYPES,
};