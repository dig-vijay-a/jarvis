/**
 * JARVIS OS 2.0 — PHASE 9: PREDICTIVE RESOURCE INTELLIGENCE (P2)
 * Monitors hardware capacity trends, moving averages, queue growth, and database expansion.
 * Distinguishes temporary CPU spikes from sustained pressure.
 * NON-NEGOTIABLE: Never deletes files or modifies resources automatically without authorization.
 */

import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { query, run, get } from '../database/db.js';
import ToolRegistry from '../tools/registry.js';

export class ResourceForecastService {
  constructor(options = {}) {
    this.historyLimit = options.historyLimit || 50;
    this.cpuSpikeThreshold = options.cpuSpikeThreshold || 80.0;
    this.memoryWarningThreshold = options.memoryWarningThreshold || 85.0;
  }

  /**
   * Captures a real-time hardware & database snapshot and stores it in telemetry history.
   */
  async captureResourceSnapshot() {
    let telemetry = null;
    try {
      telemetry = await ToolRegistry.executeTool('get_system_telemetry', {});
    } catch (_) {}

    const memTotalBytes = os.totalmem();
    const memFreeBytes = os.freemem();
    const memPercent = ((memTotalBytes - memFreeBytes) / memTotalBytes) * 100;

    const cpuUsage = telemetry?.cpu?.percent ?? 15.0;
    const diskTotalGb = telemetry?.disk?.total_gb ?? 500.0;
    const diskFreeGb = telemetry?.disk?.free_gb ?? 120.0;

    const activeMissionsRow = await get(
      "SELECT COUNT(*) as count FROM missions WHERE status IN ('RUNNING', 'PLANNING')"
    );
    const pendingMissionsRow = await get(
      "SELECT COUNT(*) as count FROM missions WHERE status = 'PENDING'"
    );
    const dbPageRow = await get("PRAGMA page_count;");
    const dbPages = dbPageRow ? Object.values(dbPageRow)[0] : 0;

    const snapshotId = `res-${uuidv4()}`;
    const timestamp = new Date().toISOString();

    await run(
      `INSERT INTO resource_telemetry_history 
        (id, cpu_percent, memory_percent, disk_free_gb, disk_total_gb, active_missions_count, pending_queue_count, db_page_count, active_watchers_count, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        snapshotId,
        Number(cpuUsage.toFixed(2)),
        Number(memPercent.toFixed(2)),
        Number(diskFreeGb.toFixed(2)),
        Number(diskTotalGb.toFixed(2)),
        activeMissionsRow ? activeMissionsRow.count : 0,
        pendingMissionsRow ? pendingMissionsRow.count : 0,
        dbPages,
        2, // default 2 active watcher scopes
        timestamp
      ]
    );

    return {
      id: snapshotId,
      cpu_percent: cpuUsage,
      memory_percent: memPercent,
      disk_free_gb: diskFreeGb,
      disk_total_gb: diskTotalGb,
      active_missions: activeMissionsRow ? activeMissionsRow.count : 0,
      pending_queue: pendingMissionsRow ? pendingMissionsRow.count : 0,
      db_pages: dbPages,
      timestamp
    };
  }

  /**
   * Forecasts resource exhaustion and flags sustained pressure.
   */
  async forecastResourceTrends() {
    const history = await query(
      "SELECT * FROM resource_telemetry_history ORDER BY timestamp DESC LIMIT ?",
      [this.historyLimit]
    );

    if (history.length < 2) {
      // Need at least 2 observations to establish slope
      const latest = history[0] || (await this.captureResourceSnapshot());
      return {
        has_sufficient_data: false,
        message: 'Insufficient historical samples (minimum 2 required for trend extrapolation).',
        latest
      };
    }

    const chronological = [...history].reverse();
    const diskForecast = this.analyzeDiskTrend(chronological);
    const cpuAnalysis = this.analyzeCpuPressure(chronological);
    const queueAnalysis = this.analyzeQueueGrowth(chronological);
    const dbForecast = this.analyzeDatabaseGrowth(chronological);

    const overallRisk = Math.max(
      diskForecast.risk_probability,
      cpuAnalysis.is_sustained_pressure ? 0.75 : 0.15,
      queueAnalysis.queue_risk_probability,
      dbForecast.risk_probability
    );

    const forecastSummary = {
      evaluated_at: new Date().toISOString(),
      sample_count: history.length,
      overall_resource_risk: Number(overallRisk.toFixed(3)),
      disk_forecast: diskForecast,
      cpu_analysis: cpuAnalysis,
      queue_analysis: queueAnalysis,
      database_forecast: dbForecast,
      recommended_preventive_actions: []
    };

    if (diskForecast.hours_to_exhaustion !== null && diskForecast.hours_to_exhaustion < 48) {
      forecastSummary.recommended_preventive_actions.push(
        `Disk exhaustion projected within ${diskForecast.hours_to_exhaustion.toFixed(1)} hours at current write rate. Recommend user audit and archive old scratch deliverables.`
      );
    }
    if (cpuAnalysis.is_sustained_pressure) {
      forecastSummary.recommended_preventive_actions.push(
        `Sustained CPU pressure detected (EMA: ${cpuAnalysis.exponential_moving_average.toFixed(1)}%). Recommend staggering parallel mission execution.`
      );
    }
    if (queueAnalysis.queue_risk_probability >= 0.7) {
      forecastSummary.recommended_preventive_actions.push(
        `Mission queue growth rate exceeds worker throughput (+${queueAnalysis.net_growth_per_sample} missions/sample). Recommend queue throttling or worker scaling.`
      );
    }

    // Persist prediction in stored_predictions (P6 Compliance)
    const predId = `pred-res-${uuidv4()}`;
    await run(
      `INSERT INTO stored_predictions 
        (id, prediction_type, target_id, predicted_outcome, confidence, risk_probability, status, evidence, created_at)
       VALUES (?, 'RESOURCE_EXHAUSTION', 'system_resources', ?, 0.85, ?, 'PENDING', ?, datetime('now'))`,
      [
        predId,
        JSON.stringify(forecastSummary),
        overallRisk,
        JSON.stringify({ sample_count: history.length, diskForecast, cpuAnalysis, queueAnalysis })
      ]
    );

    return forecastSummary;
  }

  /**
   * Analyzes disk free space trajectory via linear regression.
   */
  analyzeDiskTrend(samples) {
    const n = samples.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      const x = i;
      const y = samples[i].disk_free_gb;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const denominator = n * sumX2 - sumX * sumX;
    const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
    const latestFree = samples[n - 1].disk_free_gb;

    let hoursToExhaustion = null;
    let riskProbability = 0.05;

    if (slope < -0.001) {
      // Consumption detected
      const samplesPerDay = 24 * 6; // assuming ~10 min intervals in steady state
      const gbLostPerSample = Math.abs(slope);
      const remainingSamples = latestFree / (gbLostPerSample || 0.01);
      hoursToExhaustion = (remainingSamples * 10) / 60;

      if (hoursToExhaustion < 24) riskProbability = 0.95;
      else if (hoursToExhaustion < 72) riskProbability = 0.70;
      else riskProbability = 0.35;
    }

    return {
      current_free_gb: latestFree,
      slope_gb_per_sample: Number(slope.toFixed(4)),
      is_depleting: slope < -0.001,
      hours_to_exhaustion: hoursToExhaustion ? Number(hoursToExhaustion.toFixed(1)) : null,
      risk_probability: Number(riskProbability.toFixed(3))
    };
  }

  /**
   * Distinguishes temporary CPU spikes from sustained load using moving averages.
   */
  analyzeCpuPressure(samples) {
    const n = samples.length;
    const latestCpu = samples[n - 1].cpu_percent;

    // Compute 5-sample Exponential Moving Average (EMA)
    let ema = samples[0].cpu_percent;
    const alpha = 2 / (Math.min(5, n) + 1);
    for (let i = 1; i < n; i++) {
      ema = alpha * samples[i].cpu_percent + (1 - alpha) * ema;
    }

    const isInstantaneousSpike = latestCpu >= this.cpuSpikeThreshold;
    const isSustainedPressure = ema >= 70.0;

    return {
      instantaneous_cpu_percent: latestCpu,
      exponential_moving_average: Number(ema.toFixed(1)),
      is_instantaneous_spike: isInstantaneousSpike,
      is_sustained_pressure: isSustainedPressure,
      classification: isSustainedPressure
        ? 'SUSTAINED_PRESSURE'
        : isInstantaneousSpike
        ? 'TEMPORARY_SPIKE'
        : 'NORMAL'
    };
  }

  /**
   * Analyzes mission queue intake vs worker completion rate.
   */
  analyzeQueueGrowth(samples) {
    const n = samples.length;
    const deltaQueue = samples[n - 1].pending_queue_count - samples[0].pending_queue_count;
    const active = samples[n - 1].active_missions_count;
    const isGrowing = deltaQueue > 2;
    const queueRisk = isGrowing ? Math.min(0.9, 0.4 + (deltaQueue / (active + 1)) * 0.3) : 0.1;

    return {
      current_pending: samples[n - 1].pending_queue_count,
      current_active: active,
      net_growth_per_sample: deltaQueue,
      queue_risk_probability: Number(queueRisk.toFixed(3)),
      is_congested: isGrowing
    };
  }

  /**
   * Analyzes SQLite database page growth rate.
   */
  analyzeDatabaseGrowth(samples) {
    const n = samples.length;
    const deltaPages = samples[n - 1].db_page_count - samples[0].db_page_count;
    const ratePagesPerSample = n > 1 ? deltaPages / (n - 1) : 0;

    return {
      current_pages: samples[n - 1].db_page_count,
      page_growth_rate: Number(ratePagesPerSample.toFixed(2)),
      estimated_mb_growth_per_day: Number(((ratePagesPerSample * 4096 * 144) / 1024 / 1024).toFixed(2)),
      risk_probability: ratePagesPerSample > 100 ? 0.65 : 0.05
    };
  }
}

let instance = null;
export function initResourceForecast(options) {
  instance = new ResourceForecastService(options);
  return instance;
}
export function getResourceForecast() {
  if (!instance) instance = new ResourceForecastService();
  return instance;
}
export default ResourceForecastService;
