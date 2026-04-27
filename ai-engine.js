// ═══════════════════════════════════════════════════════════
//  IGMAU  ·  AI Prediction & Anomaly Detection Engine
//  Techniques: Ordinary Least Squares Linear Regression
//              Z-Score Statistical Anomaly Detection
//              Rolling slope drift analysis
// ═══════════════════════════════════════════════════════════

const AI = {
  windowSize: 20,   // readings to analyse (20 × 2s = 40s window)
  forecastSteps: 10 // how many future points to predict
};

// ── 1. LINEAR REGRESSION (Ordinary Least Squares) ──────────
// Given array of y-values (equally spaced in time),
// fits y = mx + b and returns slope m, intercept b, and R²
function linearRegression(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, r2: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX  += i;
    sumY  += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const slope     = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // R² - how well the line fits (0 = random, 1 = perfect fit)
  const yMean   = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (values[i] - yMean) ** 2;
    ssRes += (values[i] - (slope * i + intercept)) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

// Forecast next N values using the fitted line
function forecast(reg, currentLen, steps) {
  const result = [];
  for (let i = 1; i <= steps; i++) {
    const predicted = reg.slope * (currentLen - 1 + i) + reg.intercept;
    result.push(Math.max(0, Math.min(100, predicted))); // clamp 0–100%
  }
  return result;
}

// ETA (seconds) until a value hits a threshold, based on slope
// Returns null if not trending toward it
function etaToThreshold(currentValue, slope, threshold, intervalSec = 2) {
  if (slope <= 0) return null;                      // falling or flat
  if (currentValue >= threshold) return 0;          // already past it
  const stepsNeeded = (threshold - currentValue) / slope;
  return Math.round(stepsNeeded * intervalSec);
}

// ── 2. Z-SCORE ANOMALY DETECTION ───────────────────────────
// Computes mean and std dev of the window, flags if latest
// reading deviates by more than `zThreshold` standard deviations
function zScore(values, zThreshold = 2.5) {
  const n = values.length;
  if (n < 3) return { isAnomaly: false, z: 0, mean: 0, std: 0 };

  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  const latest = values[n - 1];
  const z = std === 0 ? 0 : Math.abs(latest - mean) / std;

  return {
    isAnomaly: z > zThreshold,
    z: parseFloat(z.toFixed(2)),
    mean: parseFloat(mean.toFixed(2)),
    std: parseFloat(std.toFixed(2))
  };
}

// ── 3. TREND LABEL (from slope) ────────────────────────────
function trendLabel(slope, r2) {
  if (r2 < 0.3) return "ERRATIC(no clear trend)";           // poor fit = no clear trend
  if (slope >  0.5) return "RISING FAST";
  if (slope >  0.15) return "RISING";
  if (slope < -0.5) return "FALLING FAST";
  if (slope < -0.15) return "FALLING";
  return "STABLE";
}

// ── 4. MAIN EXPORT ─────────────────────────────────────────
// Call this every time you ingest a new reading.
// Pass in the full history arrays and thresholds.
export function runAI(mq2History, mq135History, threshWarning, threshDanger) {
  const mq2  = mq2History.slice(-AI.windowSize);
  const mq135 = mq135History.slice(-AI.windowSize);
  if (mq2.length < 4) return null; // need at least 4 points

  // --- Regression on both sensors ---
  const reg2   = linearRegression(mq2);
  const reg135 = linearRegression(mq135);

  // --- Forecasts ---
  const forecast2   = forecast(reg2,   mq2.length,   AI.forecastSteps);
  const forecast135 = forecast(reg135, mq135.length, AI.forecastSteps);

  // --- ETAs ---
  const etaWarn2   = etaToThreshold(mq2.at(-1),   reg2.slope,   threshWarning);
  const etaWarn135 = etaToThreshold(mq135.at(-1), reg135.slope, threshWarning);
  const etaDang2   = etaToThreshold(mq2.at(-1),   reg2.slope,   threshDanger);
  const etaDang135 = etaToThreshold(mq135.at(-1), reg135.slope, threshDanger);

  // Soonest ETA across both sensors
  const etaWarning = [etaWarn2, etaWarn135].filter(v => v !== null).sort((a,b)=>a-b)[0] ?? null;
  const etaDanger  = [etaDang2,  etaDang135].filter(v => v !== null).sort((a,b)=>a-b)[0] ?? null;

  // --- Anomaly detection ---
  const anom2   = zScore(mq2);
  const anom135 = zScore(mq135);

  // --- Trend labels ---
  const trend2   = trendLabel(reg2.slope,   reg2.r2);
  const trend135 = trendLabel(reg135.slope, reg135.r2);

  // --- Risk score (0–100) ---
  // Weighted: current level (40%) + slope steepness (35%) + anomaly (25%)
  const maxPct    = Math.max(mq2.at(-1), mq135.at(-1));
  const levelRisk = Math.min(maxPct / threshDanger * 60, 60);
  const slopeRisk = Math.min(Math.max(reg2.slope, reg135.slope, 0) * 40, 25);
  const anomRisk  = (anom2.isAnomaly || anom135.isAnomaly) ? 15 : 0;
  const riskScore = Math.round(Math.min(levelRisk + slopeRisk + anomRisk, 100));

  return {
    // Forecast lines (for chart overlay)
    forecast2,
    forecast135,

    // ETAs
    etaWarning,  // seconds, or null
    etaDanger,   // seconds, or null

    // Per-sensor breakdown
    mq2: {
      trend: trend2,
      slope: parseFloat(reg2.slope.toFixed(3)),
      r2: parseFloat(reg2.r2.toFixed(2)),
      anomaly: anom2
    },
    mq135: {
      trend: trend135,
      slope: parseFloat(reg135.slope.toFixed(3)),
      r2: parseFloat(reg135.r2.toFixed(2)),
      anomaly: anom135
    },

    // Summary
    riskScore,
    overallTrend: [trend2, trend135].includes("RISING FAST") ? "RISING FAST"
                : [trend2, trend135].includes("RISING")      ? "RISING"
                : [trend2, trend135].includes("ERRATIC(no clear trend)")     ? "ERRATIC(no clear trend)"
                : trend2
  };
}
