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
          color: "#7f99b8",
          font: { family: "'Inter', sans-serif", size: 11 },
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
        titleFont: { family: "'Share Tech Mono',monospace", size: 11 },
        bodyFont: { family: "'Share Tech Mono',monospace", size: 11 },
        callbacks: {
          label: (c) => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}%`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#7f99b8",
          font: { family: "'Share Tech Mono',monospace", size: 10 },
          maxTicksLimit: 8,
        },
        grid: { color: "rgba(255,255,255,0.07)" },
      },
      y: {
        min: 0,
        max: 100,
        ticks: {
          color: "#7f99b8",
          font: { family: "'Share Tech Mono',monospace", size: 10 },
          callback: (v) => v + "%",
        },
        grid: { color: "rgba(255,255,255,0.09)" },
      },
    },
  },
});

/* ── HELPERS ─────────────────────────────────────────────── */
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
      "🔴  DANGER — Gas levels exceed danger threshold! Immediate action required.";
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

  // Alert log — only on level change or timestamp change at non-safe
  if (lvl > 0 && (lvl !== lastLvl || ts !== lastTs2)) {
    addRow(d, ts);
  }
  lastLvl = lvl;
  lastTs2 = ts;
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
