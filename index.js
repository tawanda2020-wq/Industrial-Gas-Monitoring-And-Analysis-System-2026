import { runAI } from './ai-engine.js';

/* ── CONFIG ──────────────────────────────────────────────── */
const CFG = {
  pollMs: 2000,
  maxPts: 60,
  dataURL: "/data",
  hotspotIP: "192.168.4.1",
};

const IS_HOTSPOT = window.location.hostname === CFG.hotspotIP;
const IS_FILE = window.location.protocol === "file:";

/* ── STATE ───────────────────────────────────────────────── */
let pk2 = 0,
  pk135 = 0,
  pktN = 0;
let alertRows = [],
  lastLvl = -1,
  lastTs2 = "";
const dashStart = Date.now();
const hist = { labels: [], mq2: [], mq135: [] };

/* ── CHART SETUP ─────────────────────────────────────────── */
Chart.register(window["chartjs-plugin-annotation"]);

const chartEl = document.getElementById("chart").getContext("2d");
const tChart = new Chart(chartEl, {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "MQ-2 %",
        data: [],
        borderColor: "#60a5fa",
        backgroundColor: "rgba(96,165,250,0.07)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.38,
        fill: true,
      },
      {
        label: "MQ-135 %",
        data: [],
        borderColor: "#a78bfa",
        backgroundColor: "rgba(167,139,250,0.07)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.38,
        fill: true,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 280 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        labels: {
          color: "#b6c1d1",
          font: { family: "'Inter', Arial, sans-serif", size: 12, weight: "500" },
          boxWidth: 14,
          padding: 16,
        },
      },
      annotation: {
        annotations: {
          wL: {
            type: "line",
            yMin: 10,
            yMax: 10,
            borderColor: "rgba(245,158,11,0.7)",
            borderWidth: 1.2,
            borderDash: [5, 4],
            label: {
              display: true,
              content: "⚠ Warning",
              color: "#f59e0b",
              font: { size: 9, family: "'Inter',sans-serif" },
              position: "end",
              backgroundColor: "rgba(7,9,16,0.7)",
            },
          },
          dL: {
            type: "line",
            yMin: 15,
            yMax: 15,
            borderColor: "rgba(239,68,68,0.7)",
            borderWidth: 1.2,
            borderDash: [5, 4],
            label: {
              display: true,
              content: "🔴 Danger",
              color: "#ef4444",
              font: { size: 9, family: "'Inter',sans-serif" },
              position: "end",
              backgroundColor: "rgba(7,9,16,0.7)",
            },
          },
        },
      },
      tooltip: {
        backgroundColor: "#0d1220",
        titleColor: "#e6edf8",
        bodyColor: "#7f99b8",
        borderColor: "#1b2740",
        borderWidth: 1,
        titleFont: { family: "'Inter', Arial, sans-serif", size: 12, weight: "600" },
        bodyFont: { family: "'Inter', Arial, sans-serif", size: 12 },
        callbacks: {
          label: (c) => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}%`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#b6c1d1",
          font: { family: "'Inter', Arial, sans-serif", size: 11 },
          maxTicksLimit: 8,
        },
        grid: { color: "rgba(255,255,255,0.07)" },
      },
      y: {
        min: 0,
        max: 100,
        ticks: {
          color: "#b6c1d1",
          font: { family: "'Inter', Arial, sans-serif", size: 11 },
          callback: (v) => v + "%",
        },
        grid: { color: "rgba(255,255,255,0.09)" },
      },
    },
  },
});

/* ── AI MINI-CHARTS SETUP ────────────────────────────────── */

// Shared font config — Inter at 12px for all chart text
const CHART_FONT = { family: "'Inter', Arial, sans-serif", size: 12, weight: "500" };
const CHART_FONT_SM = { family: "'Inter', Arial, sans-serif", size: 11 };
const TICK_COLOR = "#b6c1d1";   // brighter than before — was #7f99b8
const GRID_COLOR = "rgba(255,255,255,0.06)";

// ── CHART 1: Linear Regression ─────────────────────────────
// Shows: actual sensor readings (last 20) + OLS trend line + 10-step forecast
const aiChart1 = new Chart(document.getElementById("aiChart1").getContext("2d"), {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "MQ-2 (combustible gas)",
        data: [], borderColor: "#60a5fa",
        backgroundColor: "rgba(96,165,250,0.10)",
        borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 5,
        pointBackgroundColor: "#60a5fa", tension: 0.35, fill: true
      },
      {
        label: "MQ-135 (air quality)",
        data: [], borderColor: "#a78bfa",
        backgroundColor: "rgba(167,139,250,0.08)",
        borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 5,
        pointBackgroundColor: "#a78bfa", tension: 0.35, fill: true
      },
      {
        label: "Trend line (MQ-2)",
        data: [], borderColor: "#f59e0b",
        borderWidth: 2, borderDash: [6, 4],
        pointRadius: 0, tension: 0, fill: false
      },
      {
        label: "Forecast →",
        data: [], borderColor: "rgba(96,165,250,0.55)",
        borderWidth: 2, borderDash: [4, 3],
        pointRadius: 0, tension: 0.25, fill: false
      },
    ]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 250 },
    layout: { padding: { top: 8, right: 14, bottom: 4, left: 4 } },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "top",
        labels: {
          color: TICK_COLOR, font: CHART_FONT,
          boxWidth: 14, boxHeight: 3, padding: 14,
          usePointStyle: false
        }
      },
      tooltip: {
        backgroundColor: "#0d1220", titleColor: "#e6edf8",
        bodyColor: "#b6c1d1", borderColor: "#253650", borderWidth: 1,
        padding: 10,
        titleFont: { family: "'Inter', Arial, sans-serif", size: 12, weight: "600" },
        bodyFont:  { family: "'Inter', Arial, sans-serif", size: 12 },
        callbacks: {
          title: items => `Reading: ${items[0].label}`,
          label: c => {
            if (c.parsed.y == null) return null;
            const suffix = c.datasetIndex <= 1 ? "%" : c.datasetIndex === 2 ? "% (trend)" : "% (forecast)";
            return `  ${c.dataset.label}: ${c.parsed.y.toFixed(1)}${suffix}`;
          }
        }
      },
      annotation: {
        annotations: {
          wL1: {
            type: "line", yMin: 10, yMax: 10,
            borderColor: "rgba(245,158,11,0.75)", borderWidth: 1.5, borderDash: [6, 4],
            label: {
              display: true, content: "⚠ Warning threshold",
              color: "#f59e0b", font: { family: "'Inter',Arial,sans-serif", size: 11, weight: "600" },
              position: "start", yAdjust: -10,
              backgroundColor: "rgba(7,9,16,0.75)", padding: { x: 6, y: 3 }
            }
          },
          dL1: {
            type: "line", yMin: 15, yMax: 15,
            borderColor: "rgba(239,68,68,0.75)", borderWidth: 1.5, borderDash: [6, 4],
            label: {
              display: true, content: "🔴 Danger threshold",
              color: "#ef4444", font: { family: "'Inter',Arial,sans-serif", size: 11, weight: "600" },
              position: "start", yAdjust: -10,
              backgroundColor: "rgba(7,9,16,0.75)", padding: { x: 6, y: 3 }
            }
          }
        }
      }
    },
    scales: {
      x: {
        ticks: { color: TICK_COLOR, font: CHART_FONT_SM, maxTicksLimit: 7, maxRotation: 0 },
        grid: { color: GRID_COLOR },
        title: { display: true, text: "← History  |  Forecast →",
          color: "#7f99b8", font: { family:"'Inter',Arial,sans-serif", size:11 } }
      },
      y: {
        min: 0, max: 100,
        ticks: { color: TICK_COLOR, font: CHART_FONT_SM, callback: v => v + "%" },
        grid: { color: GRID_COLOR },
        title: { display: true, text: "Gas concentration (%)",
          color: "#7f99b8", font: { family:"'Inter',Arial,sans-serif", size: 11 } }
      }
    }
  }
});

// ── CHART 2: Z-Score Anomaly Detection ─────────────────────
// Bar chart: recent Z-scores per sensor, coloured green/amber/red by severity
const aiChart2 = new Chart(document.getElementById("aiChart2").getContext("2d"), {
  type: "bar",
  data: {
    labels: [],
    datasets: [
      {
        label: "MQ-2 deviation (σ)",
        data: [],
        backgroundColor: ctx => {
          const v = ctx.raw ?? 0;
          return v > 2.5 ? "rgba(239,68,68,0.8)"
               : v > 1.5 ? "rgba(245,158,11,0.75)"
               :            "rgba(96,165,250,0.65)";
        },
        borderColor: ctx => {
          const v = ctx.raw ?? 0;
          return v > 2.5 ? "#ef4444" : v > 1.5 ? "#f59e0b" : "#60a5fa";
        },
        borderWidth: 1, borderRadius: 3, borderSkipped: false
      },
      {
        label: "MQ-135 deviation (σ)",
        data: [],
        backgroundColor: ctx => {
          const v = ctx.raw ?? 0;
          return v > 2.5 ? "rgba(239,68,68,0.6)"
               : v > 1.5 ? "rgba(245,158,11,0.55)"
               :            "rgba(167,139,250,0.55)";
        },
        borderColor: ctx => {
          const v = ctx.raw ?? 0;
          return v > 2.5 ? "#ef4444" : v > 1.5 ? "#f59e0b" : "#a78bfa";
        },
        borderWidth: 1, borderRadius: 3, borderSkipped: false
      },
    ]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 250 },
    layout: { padding: { top: 8, right: 14, bottom: 4, left: 4 } },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "top",
        labels: {
          color: TICK_COLOR, font: CHART_FONT,
          boxWidth: 14, boxHeight: 10, padding: 14
        }
      },
      tooltip: {
        backgroundColor: "#0d1220", titleColor: "#e6edf8",
        bodyColor: "#b6c1d1", borderColor: "#253650", borderWidth: 1,
        padding: 10,
        titleFont: { family: "'Inter', Arial, sans-serif", size: 12, weight: "600" },
        bodyFont:  { family: "'Inter', Arial, sans-serif", size: 12 },
        callbacks: {
          title: items => `Time: ${items[0].label}`,
          label: c => {
            const v = c.parsed.y ?? 0;
            const status = v > 2.5 ? " ⚠ ANOMALY" : v > 1.5 ? " ↑ Elevated" : " ✓ Normal";
            return `  ${c.dataset.label}: ${v.toFixed(2)} σ${status}`;
          },
          afterBody: items => {
            const maxZ = Math.max(...items.map(i => i.parsed.y ?? 0));
            if (maxZ > 2.5) return ["", "🔴 Anomaly detected — unexpected spike"];
            if (maxZ > 1.5) return ["", "⚠ Slightly elevated — monitor closely"];
            return ["", "✓ Within normal statistical range"];
          }
        }
      },
      annotation: {
        annotations: {
          zThresh: {
            type: "line", yMin: 2.5, yMax: 2.5,
            borderColor: "rgba(239,68,68,0.85)", borderWidth: 1.5, borderDash: [6, 4],
            label: {
              display: true,
              content: "⚠ Anomaly threshold  Z = 2.5 σ",
              color: "#ef4444",
              font: { family: "'Inter',Arial,sans-serif", size: 11, weight: "600" },
              position: "start", yAdjust: -10,
              backgroundColor: "rgba(7,9,16,0.8)", padding: { x: 8, y: 4 }
            }
          },
          zNorm: {
            type: "box", yMin: 0, yMax: 1.5,
            backgroundColor: "rgba(34,197,94,0.03)",
            borderColor: "transparent",
            label: {
              display: true, content: "Normal zone",
              color: "rgba(34,197,94,0.45)",
              font: { family:"'Inter',Arial,sans-serif", size: 10 },
              position: { x: "start", y: "center" }
            }
          }
        }
      }
    },
    scales: {
      x: {
        ticks: { color: TICK_COLOR, font: CHART_FONT_SM, maxTicksLimit: 8, maxRotation: 0 },
        grid: { color: GRID_COLOR },
        title: { display: true, text: "Reading timestamp",
          color: "#7f99b8", font: { family:"'Inter',Arial,sans-serif", size: 11 } }
      },
      y: {
        min: 0, suggestedMax: 4,
        ticks: {
          color: TICK_COLOR, font: CHART_FONT_SM,
          callback: v => v.toFixed(1) + " σ"
        },
        grid: { color: GRID_COLOR },
        title: { display: true, text: "Standard deviations from normal (σ)",
          color: "#7f99b8", font: { family:"'Inter',Arial,sans-serif", size: 11 } }
      }
    }
  }
});
const $ = (id) => document.getElementById(id);
const fU = (s) => {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};
const gc = (p, w, d) =>
  p >= d ? "var(--danger)" : p >= w ? "var(--warn)" : "var(--safe)";

function setArc(id, pct) {
  const el = $(id);
  if (!el) return;
  el.style.strokeDashoffset = (220 - (Math.min(pct, 100) / 100) * 220).toFixed(
    1,
  );
}

function setChip(id, pct, w, d) {
  const el = $(id);
  if (!el) return;
  if (pct >= d) {
    el.className = "schip schip-danger";
    el.textContent = "DANGER";
  } else if (pct >= w) {
    el.className = "schip schip-warn";
    el.textContent = "WARNING";
  } else {
    el.className = "schip schip-safe";
    el.textContent = "SAFE";
  }
}

function setCard(id, pct, w, d) {
  const el = $(id);
  if (!el) return;
  el.classList.remove("sw", "sd");
  if (pct >= d) el.classList.add("sd");
  else if (pct >= w) el.classList.add("sw");
}

/* ── BANNER ──────────────────────────────────────────────── */
function setBanner(d) {
  const bn = $("banner");
  const lvl = parseInt(d.alertLevel, 10);
  const w = d.thresh_warning || 10;
  const deg = d.thresh_danger || 15;

  if (lvl === 2) {
    bn.className = "bn-danger";
    $("bannerMain").textContent =
      "🔴  DANGER - Gas levels exceed danger threshold! Immediate action required.";
    const gases = [];
    if ((d.mq2_pct || 0) >= deg)
      gases.push(`MQ-2: ${d.mq2_pct.toFixed(1)}%  (Methane/LPG/Smoke)`);
    if ((d.mq135_pct || 0) >= deg)
      gases.push(`MQ-135: ${d.mq135_pct.toFixed(1)}%  (CO/NH₃/Benzene/H₂)`);
    $("bannerSub").textContent = gases.join("   |   ");
  } else if (lvl === 1) {
    bn.className = "bn-warn";
    $("bannerMain").textContent =
      "⚠  WARNING - Elevated gas detected. Monitor closely and prepare to act.";
    $("bannerSub").textContent = "";
  } else {
    bn.className = "bn-safe";
    $("bannerMain").textContent =
      "✅  SAFE - All sensor readings within normal range.";
    $("bannerSub").textContent = "";
  }
}

/* ── ALERT LOG ───────────────────────────────────────────── */
function addRow(d, ts) {
  const lvl = parseInt(d.alertLevel, 10);
  if (lvl === 0) return;
  alertRows.unshift({ ts, d, lvl });
  if (alertRows.length > 60) alertRows.pop();
  renderLog();
}

function renderLog() {
  const tb = $("logBody");
  if (!alertRows.length) {
    tb.innerHTML =
      '<tr><td colspan="6" class="log-empty">No alert events recorded this session</td></tr>';
    return;
  }
  tb.innerHTML = alertRows
    .map((r) => {
      const cls = r.lvl === 2 ? "d" : "w";
      const lbl = r.lvl === 2 ? "DANGER" : "WARNING";
      return `<tr>
      <td>${r.ts}</td>
      <td>${r.d.nodeId || "—"}</td>
      <td><span class="lbadge ${cls}">${lbl}</span></td>
      <td>${r.d.mq2_pct !== undefined ? r.d.mq2_pct.toFixed(1) + "%" : "-"}</td>
      <td>${r.d.mq135_pct !== undefined ? r.d.mq135_pct.toFixed(1) + "%" : "-"}</td>
      <td>${r.d.statusMsg || lbl}</td>
    </tr>`;
    })
    .join("");
}

/* ── MAIN INGEST ─────────────────────────────────────────── */
function ingest(d) {
  if (!d) return;
  pktN++;

  const mq2 = parseFloat(d.mq2_pct) || 0;
  const mq135 = parseFloat(d.mq135_pct) || 0;
  const w = parseFloat(d.thresh_warning) || 10;
  const deg = parseFloat(d.thresh_danger) || 15;
  const lvl = parseInt(d.alertLevel, 10) || 0;
  const ts = d.ts || new Date().toLocaleTimeString();
  const mode = d.mode || "hotspot";

  if (mq2 > pk2) pk2 = mq2;
  if (mq135 > pk135) pk135 = mq135;

  // Header
  $("hNode").textContent = d.nodeId || "—";
  $("hTs").textContent = ts;

  // Connection badge
  $("connBadge").className = "badge b-conn";
  $("connTxt").textContent = "CONNECTED";
  $("modeTxt").textContent = "☁ CLOUD";
  $("footMode").textContent = "Cloud · Firebase";

  // MQ-2
  const v2 = $("vMq2");
  v2.childNodes[0].textContent = mq2.toFixed(1);
  v2.style.color = gc(mq2, w, deg);
  setArc("aMq2", mq2);
  setChip("xMq2", mq2, w, deg);
  setCard("cMq2", mq2, w, deg);
  $("bMq2").style.cssText =
    `width:${Math.min(mq2, 100)}%;background:${gc(mq2, w, deg)}`;
  $("twMq2").textContent = `▲${w}%`;
  $("tdMq2").textContent = `▲${deg}%`;

  // MQ-135
  const v135 = $("vMq135");
  v135.childNodes[0].textContent = mq135.toFixed(1);
  v135.style.color = gc(mq135, w, deg);
  setArc("aMq135", mq135);
  setChip("xMq135", mq135, w, deg);
  setCard("cMq135", mq135, w, deg);
  $("bMq135").style.cssText =
    `width:${Math.min(mq135, 100)}%;background:${gc(mq135, w, deg)}`;
  $("twMq135").textContent = `▲${w}%`;
  $("tdMq135").textContent = `▲${deg}%`;

  // Thresholds card
  $("thW").textContent = w + "%";
  $("thD").textContent = deg + "%";
  $("thSafe").textContent = w + "%";
  $("pk2").textContent = pk2.toFixed(1) + "%";
  $("pk135").textContent = pk135.toFixed(1) + "%";
  $("pkts").textContent = pktN;

  // System status card
  $("ssConn").innerHTML = '<span class="pill p-safe">ONLINE</span>';
  $("ssSurface").innerHTML = '<span class="pill p-safe">ONLINE · Cloud</span>';
  $("ssGround").innerHTML = '<span class="pill p-safe">CONNECTED</span>';
  $("ssSrc").innerHTML = '<span class="pill p-cloud">☁ Firebase</span>';
  const aEl = $("ssAlert");
  aEl.textContent = lvl === 2 ? "DANGER" : lvl === 1 ? "WARNING" : "SAFE";
  aEl.style.color =
    lvl === 2 ? "var(--danger)" : lvl === 1 ? "var(--warn)" : "var(--safe)";
  $("ssNode").textContent = d.nodeId || "-";
  $("ssTs").textContent = ts;

  if (d.uptime !== undefined) {
    const us = parseInt(d.uptime, 10);
    $("ssUp").textContent = fU(us);
    $("ubar").style.width = Math.min(us / 86400, 1) * 100 + "%";
  }

  // Banner
  setBanner(d);

  // Chart
  hist.labels.push(ts);
  hist.mq2.push(mq2);
  hist.mq135.push(mq135);
  if (hist.labels.length > CFG.maxPts) {
    hist.labels.shift();
    hist.mq2.shift();
    hist.mq135.shift();
  }
  tChart.data.labels = hist.labels;
  tChart.data.datasets[0].data = hist.mq2;
  tChart.data.datasets[1].data = hist.mq135;
  const ann = tChart.options.plugins.annotation.annotations;
  ann.wL.yMin = ann.wL.yMax = w;
  ann.dL.yMin = ann.dL.yMax = deg;
  tChart.update("none");

  // Alert log - only on level change or timestamp change at non-safe
  if (lvl > 0 && (lvl !== lastLvl || ts !== lastTs2)) {
    addRow(d, ts);
  }
  lastLvl = lvl;
  lastTs2 = ts;

  // ── AI ENGINE ──────────────────────────────────────────
  const ai = runAI(hist.mq2, hist.mq135, w, deg);
  if (ai) {
    // Trend
    $("aiT2").textContent   = ai.mq2.trend;
    $("aiT135").textContent = ai.mq135.trend;

    // ETAs
    const fmtEta = s => s === 0 ? "NOW" : s < 60 ? s + "s" : Math.ceil(s/60) + " min " + (s%60) + "s";
    $("aiEtaW").textContent = ai.etaWarning !== null ? fmtEta(ai.etaWarning) : "Not trending there";
    $("aiEtaD").textContent = ai.etaDanger  !== null ? fmtEta(ai.etaDanger)  : "Not trending there";

    // Risk score + colour
    const rEl = $("aiRisk");
    rEl.textContent = ai.riskScore + " / 100";
    rEl.style.color = ai.riskScore > 70 ? "var(--danger)"
                    : ai.riskScore > 40 ? "var(--warn)" : "var(--safe)";

    // Regression stats
    $("aiSlope2").textContent = ai.mq2.slope + " %/reading";
    $("aiR2").textContent     = ai.mq2.r2 + "  (1.0 = perfect fit)";

    // Z-score anomaly chips
    const setAnom = (elId, anom) => {
      const el = $(elId);
      el.textContent = anom.isAnomaly ? "ANOMALY" : "NORMAL";
      el.className   = "schip " + (anom.isAnomaly ? "schip-danger" : "schip-safe");
    };
    setAnom("aiAnom2",   ai.mq2.anomaly);
    setAnom("aiAnom135", ai.mq135.anomaly);
    $("aiZ2").textContent    = ai.mq2.anomaly.z;
    $("aiZ135").textContent  = ai.mq135.anomaly.z;
    $("aiMean2").textContent = ai.mq2.anomaly.mean + "%";
    $("aiStd2").textContent  = ai.mq2.anomaly.std + "%";

    // Dashed forecast overlay on existing chart
    const fLabels = ai.forecast2.map((_,i) => `+${(i+1)*2}s`);
    tChart.data.datasets[2] = {
      label: "MQ-2 Forecast",
      data: [...Array(hist.mq2.length - 1).fill(null), hist.mq2.at(-1), ...ai.forecast2],
      borderColor: "rgba(96,165,250,0.5)",
      borderDash: [6,4], borderWidth: 1.5,
      pointRadius: 0, tension: 0.3, fill: false
    };
    tChart.data.datasets[3] = {
      label: "MQ-135 Forecast",
      data: [...Array(hist.mq135.length - 1).fill(null), hist.mq135.at(-1), ...ai.forecast135],
      borderColor: "rgba(167,139,250,0.5)",
      borderDash: [6,4], borderWidth: 1.5,
      pointRadius: 0, tension: 0.3, fill: false
    };
    tChart.data.labels = [...hist.labels, ...fLabels];
    tChart.update("none");

    // ── AI MINI-CHART 1: regression window + trend line + forecast ──
    const win2   = hist.mq2.slice(-20);
    const win135 = hist.mq135.slice(-20);
    const winLabels = win2.map((_,i) => `t-${win2.length-1-i}`);
    const forecastLabels = ai.forecast2.map((_,i) => `+${(i+1)*2}s`);
    const allLabels1 = [...winLabels, ...forecastLabels];

    // Build trend-line points over the actual window using slope+intercept
    const _reg2 = (() => {
      const n = win2.length;
      let sx=0,sy=0,sxy=0,sx2=0;
      for(let i=0;i<n;i++){sx+=i;sy+=win2[i];sxy+=i*win2[i];sx2+=i*i;}
      const slope=(n*sxy-sx*sy)/(n*sx2-sx*sx||1);
      const intercept=(sy-slope*sx)/n;
      return {slope,intercept};
    })();
    const trendLine = win2.map((_,i) => Math.max(0,Math.min(100, _reg2.slope*i+_reg2.intercept)));
    const trendPadded = [...trendLine, ...Array(ai.forecast2.length).fill(null)];
    const actual2Padded   = [...win2,   ...Array(ai.forecast2.length).fill(null)];
    const actual135Padded = [...win135, ...Array(ai.forecast135.length).fill(null)];
    const forecastPadded  = [...Array(win2.length-1).fill(null), win2.at(-1), ...ai.forecast2];

    aiChart1.data.labels = allLabels1;
    aiChart1.data.datasets[0].data = actual2Padded;
    aiChart1.data.datasets[1].data = actual135Padded;
    aiChart1.data.datasets[2].data = trendPadded;
    aiChart1.data.datasets[3].data = forecastPadded;
    const ann1 = aiChart1.options.plugins.annotation.annotations;
    ann1.wL1.yMin = ann1.wL1.yMax = w;
    ann1.dL1.yMin = ann1.dL1.yMax = deg;
    aiChart1.update("none");

    // ── AI MINI-CHART 2: Z-score bar history ──
    // Keep a rolling buffer of z-scores for the chart
    if (!window._zHist) window._zHist = { labels:[], z2:[], z135:[] };
    const zh = window._zHist;
    zh.labels.push(ts);
    zh.z2.push(ai.mq2.anomaly.z);
    zh.z135.push(ai.mq135.anomaly.z);
    if (zh.labels.length > 30) { zh.labels.shift(); zh.z2.shift(); zh.z135.shift(); }
    aiChart2.data.labels = zh.labels;
    aiChart2.data.datasets[0].data = zh.z2;
    aiChart2.data.datasets[1].data = zh.z135;
    aiChart2.update("none");
  }
}

/* ── STATUS (offline / disconnected) ────────────────────── */
window._onStatus = function (status) {
  const ok = status.connected !== false;
  $("connBadge").className = "badge " + (ok ? "b-conn" : "b-disc");
  $("connTxt").textContent = ok ? "CONNECTED" : "DISCONNECTED";
  if (!ok) {
    $("ssConn").innerHTML = '<span class="pill p-off">OFFLINE</span>';
    $("ssGround").innerHTML = '<span class="pill p-off">DISCONNECTED</span>';
    $("banner").className = "bn-offline";
    $("bannerMain").textContent =
      "⚠  Underground node is disconnected or not transmitting.";
    $("bannerSub").textContent = "";
  }
  const m = status.mode || "hotspot";
  $("modeTxt").textContent = m === "online" ? "☁ CLOUD" : "📶 HOTSPOT";
};

/* ── FIREBASE ────────────────────────────────────────────── */
window._onReadings = (d) => {
  if (d && typeof d === "object") ingest(d);
};

window._onHistory = (h) => {
  if (!h) return;
  alertRows = [];
  Object.entries(h).forEach(([k, v]) => {
    const lvl = parseInt(v.alertLevel, 10);
    if (lvl > 0) alertRows.push({ ts: v.ts || k, d: v, lvl });
  });
  alertRows.sort((a, b) => b.ts.localeCompare(a.ts));
  alertRows = alertRows.slice(0, 60);
  renderLog();
};

/* ── HOTSPOT POLL ────────────────────────────────────────── */
async function poll() {
  try {
    const r = await fetch(CFG.dataURL, { cache: "no-cache" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    if (d.connected === false)
      window._onStatus({ connected: false, mode: d.mode });
    else ingest(d);
  } catch (e) {
    console.warn("[POLL]", e.message);
    $("connBadge").className = "badge b-disc";
    $("connTxt").textContent = "UNREACHABLE";
    $("banner").className = "bn-offline";
    $("bannerMain").textContent = "⚠  Cannot reach surface node server.";
    $("bannerSub").textContent = "";
  }
}

/* ── DASHBOARD CLOCK ─────────────────────────────────────── */
setInterval(
  () =>
    ($("dashUp").textContent = fU(Math.floor((Date.now() - dashStart) / 1000))),
  1000,
);

/* ── BOOT — online/cloud only ────────────────────────────── */
$("modeTxt").textContent = "☁ CLOUD";
$("footMode").textContent = "Cloud · Firebase";
