"use strict";

/* ================================================================
   DOM REFERENCES
   ================================================================ */
const frequencyInput    = document.getElementById("frequency");
const dutyCycleInput    = document.getElementById("dutyCycle");
const dutyCycleSlider   = document.getElementById("dutyCycleSlider");
const maxVoltageInput   = document.getElementById("maxVoltage");
const generateBtn       = document.getElementById("generateBtn");
const downloadBtn       = document.getElementById("downloadBtn");
const errorMsg          = document.getElementById("errorMsg");
const dcHint            = document.getElementById("dcHint");
const dcMiniHigh        = document.getElementById("dcMiniHigh");

// Page 2 output elements
const avgVoltageEl  = document.getElementById("avgVoltage");
const onTimeEl      = document.getElementById("onTime");
const offTimeEl     = document.getElementById("offTime");
const periodEl      = document.getElementById("period");
const ledBarFill    = document.getElementById("ledBarFill");
const ledLabel      = document.getElementById("ledLabel");
const gaugeFill     = document.getElementById("gaugeFill");
const motorRPM      = document.getElementById("motorRPM");
const motorLabel    = document.getElementById("motorLabel");
const resultParams  = document.getElementById("resultParams");

// Animation
const canvas        = document.getElementById("pwmCanvas");
const ctx           = canvas.getContext("2d");
const animPlayPause = document.getElementById("animPlayPause");
const animReset     = document.getElementById("animReset");
const animSpeedSel  = document.getElementById("animSpeed");
const sigDot        = document.getElementById("sigDot");
const sigStateText  = document.getElementById("sigStateText");
const animLed       = document.getElementById("animLed");
const motorFan      = document.getElementById("motorFan");

const GAUGE_ARC_LEN = 157;
let chartRendered = false;
let lastGeneratedData = null;


/* ================================================================
   THEME TOGGLE — Dark / Light
   ================================================================ */
const themeToggleBtn = document.getElementById("themeToggleBtn");
const themeIcon      = document.getElementById("themeIcon");
const themeLabel     = document.getElementById("themeLabel");

themeToggleBtn.addEventListener("click", () => {
  const html    = document.documentElement;
  const isDark  = html.getAttribute("data-theme") === "dark";
  const next    = isDark ? "light" : "dark";
  html.setAttribute("data-theme", next);
  themeIcon.textContent  = isDark ? "🌙" : "☀️";
  themeLabel.textContent = isDark ? "DARK" : "LIGHT";

  // Re-render Plotly chart colours if chart exists
  if (chartRendered) {
    const bg   = next === "dark" ? "#080800" : "#fffbf0";
    const grid = next === "dark" ? "#1a1400" : "#fde68a";
    const txt  = next === "dark" ? "#3a2f00" : "#b45309";
    const line = next === "dark" ? "#f59e0b" : "#d97706";
    Plotly.relayout("waveformChart", {
      paper_bgcolor: bg, plot_bgcolor: bg,
      "xaxis.gridcolor": grid, "yaxis.gridcolor": grid,
      "font.color": txt,
    });
    Plotly.restyle("waveformChart", { "line.color": line }, [0]);
  }
});

/* ================================================================
   PAGE NAVIGATION
   ================================================================ */
function showPage(page) {
  document.getElementById("pageInput").classList.toggle("hidden",  page !== "input");
  document.getElementById("pageOutput").classList.toggle("hidden", page !== "output");
  document.getElementById("tabInput").classList.toggle("active",   page === "input");
  document.getElementById("tabOutput").classList.toggle("active",  page === "output");

  // Resize canvas when switching to output page
  if (page === "output") {
    setTimeout(() => {
      resizeCanvas();
      if (animRunning && !animPaused) { lastTs = null; }
    }, 50);
  }
}

/* ================================================================
   DUTY CYCLE SLIDER SYNC
   ================================================================ */
dutyCycleSlider.addEventListener("input", () => {
  const val = parseInt(dutyCycleSlider.value, 10);
  dutyCycleInput.value = val;
  updateSliderBg(val);
  updateDcHint(val);
  updateMiniWave(val);
});

dutyCycleInput.addEventListener("input", () => {
  let val = parseFloat(dutyCycleInput.value);
  if (isNaN(val)) return;
  val = Math.max(0, Math.min(100, val));
  dutyCycleSlider.value = val;
  updateSliderBg(val);
  updateDcHint(val);
  updateMiniWave(val);
});

function updateSliderBg(val) {
  dutyCycleSlider.style.background =
    `linear-gradient(to right, #a855f7 ${val}%, #2e2660 ${val}%)`;
}
function updateDcHint(val) {
  let label = val <= 30 ? "Dim LED range" : val <= 70 ? "Medium LED range" : "Bright LED range";
  dcHint.textContent = `${val}% — ${label}`;
}
function updateMiniWave(val) {
  dcMiniHigh.style.width = val + "%";
}

// Init
updateSliderBg(50);
updateDcHint(50);
updateMiniWave(50);

/* ================================================================
   PRESET BUTTONS
   ================================================================ */
function applyPreset(freq, dc, vmax) {
  frequencyInput.value    = freq;
  dutyCycleInput.value    = dc;
  dutyCycleSlider.value   = dc;
  maxVoltageInput.value   = vmax;
  updateSliderBg(dc);
  updateDcHint(dc);
  updateMiniWave(dc);
}

/* ================================================================
   RANGE RULES
   ================================================================ */
const RULES = {
  frequency: {
    min: 0.1, max: 100000,
    warnMin: 1, warnMax: 50000,
    label: "Frequency",
    unit: "Hz",
    errors: {
      empty:   "Frequency is required.",
      nan:     "Frequency must be a number.",
      tooLow:  "Frequency too low — minimum is 0.1 Hz.",
      tooHigh: "Frequency too high — maximum is 100,000 Hz.",
    },
    warnings: {
      warnLow:  "Very low frequency — signal will be very slow.",
      warnHigh: "High frequency — may exceed microcontroller limits (Arduino max ~490 Hz on most pins).",
    },
  },
  maxVoltage: {
    min: 0.1, max: 48,
    warnMin: 0.5, warnMax: 36,
    label: "Max Voltage",
    unit: "V",
    errors: {
      empty:   "Max Voltage is required.",
      nan:     "Max Voltage must be a number.",
      tooLow:  "Voltage too low — minimum is 0.1 V.",
      tooHigh: "Voltage too high — maximum is 48 V (safe hardware limit).",
    },
    warnings: {
      warnHigh: "High voltage — ensure your hardware supports this level.",
    },
  },
  dutyCycle: {
    min: 0, max: 100,
    warnMin: 1, warnMax: 99,
    label: "Duty Cycle",
    unit: "%",
    errors: {
      empty:   "Duty Cycle is required.",
      nan:     "Duty Cycle must be a number.",
      tooLow:  "Duty Cycle cannot be negative.",
      tooHigh: "Duty Cycle cannot exceed 100%.",
    },
    warnings: {
      warnLow:  "Very low duty cycle — motor may stall below 5%.",
      warnHigh: "Near 100% duty cycle — component may overheat.",
    },
  },
};

/* ── Per-field validation ──────────────────────────────────────── */
function validateField(id, value) {
  const rule   = RULES[id];
  const grp    = document.getElementById(`grp-${id}`);
  const errEl  = document.getElementById(`err-${id}`);
  const barEl  = document.getElementById(`bar-${id}`);
  const statEl = document.getElementById(`status-${id}`);
  if (!rule || !grp) return true;

  // Clear state
  grp.classList.remove("is-valid", "is-error", "is-warning");
  if (errEl)  { errEl.textContent = ""; errEl.classList.add("hidden"); }
  if (barEl)  { barEl.classList.remove("is-error","is-warning","is-valid"); }
  if (statEl) statEl.textContent = "";

  const raw = value === undefined ? parseFloat(document.getElementById(id)?.value) : parseFloat(value);

  // Check empty / NaN
  const inputEl = document.getElementById(id);
  if (inputEl && inputEl.value.trim() === "") {
    setFieldState(grp, errEl, barEl, statEl, "error", rule.errors.empty, 0);
    return false;
  }
  if (isNaN(raw)) {
    setFieldState(grp, errEl, barEl, statEl, "error", rule.errors.nan, 0);
    return false;
  }
  // Out of range
  if (raw < rule.min) {
    setFieldState(grp, errEl, barEl, statEl, "error", rule.errors.tooLow, 0);
    return false;
  }
  if (raw > rule.max) {
    setFieldState(grp, errEl, barEl, statEl, "error", rule.errors.tooHigh, 100);
    return false;
  }
  // Warnings
  if (rule.warnMin !== undefined && raw < rule.warnMin) {
    const pct = ((raw - rule.min) / (rule.max - rule.min)) * 100;
    setFieldState(grp, errEl, barEl, statEl, "warning", rule.warnings.warnLow || "", pct);
    return true; // warning doesn't block
  }
  if (rule.warnMax !== undefined && raw > rule.warnMax) {
    const pct = ((raw - rule.min) / (rule.max - rule.min)) * 100;
    setFieldState(grp, errEl, barEl, statEl, "warning", rule.warnings.warnHigh || "", pct);
    return true;
  }
  // All good
  const pct = ((raw - rule.min) / (rule.max - rule.min)) * 100;
  setFieldState(grp, errEl, barEl, statEl, "valid", "", pct);
  return true;
}

function setFieldState(grp, errEl, barEl, statEl, state, msg, barPct) {
  grp.classList.add(state === "valid" ? "is-valid" : state === "warning" ? "is-warning" : "is-error");
  if (errEl) {
    if (msg) { errEl.textContent = msg; errEl.classList.remove("hidden"); }
    else       errEl.classList.add("hidden");
  }
  if (barEl) {
    barEl.style.width = Math.min(100, Math.max(0, barPct)) + "%";
    barEl.classList.add(state === "valid" ? "is-valid" : state === "warning" ? "is-warning" : "is-error");
  }
  if (statEl) {
    statEl.textContent = state === "valid" ? "✅" : state === "warning" ? "⚠️" : "❌";
  }
}

/* ── Live validation on input events ──────────────────────────── */
["frequency", "maxVoltage", "dutyCycle"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", () => validateField(id));
});

// Init bars on load
window.addEventListener("load", () => {
  validateField("frequency");
  validateField("maxVoltage");
  validateField("dutyCycle");
});

/* ── Full form validation before generate ─────────────────────── */
function validateInputs() {
  const freqOk  = validateField("frequency");
  const voltOk  = validateField("maxVoltage");
  const dcOk    = validateField("dutyCycle");
  const allOk   = freqOk && voltOk && dcOk;

  // Show/hide global error fallback
  if (!allOk) {
    showError("⚠ Please fix the errors above before generating.");
  } else {
    clearError();
  }
  return allOk;
}
function showError(msg) { errorMsg.textContent = msg; errorMsg.classList.remove("hidden"); }
function clearError()   { errorMsg.textContent = ""; errorMsg.classList.add("hidden"); }

/* ================================================================
   GENERATE — AJAX TO FLASK
   ================================================================ */
generateBtn.addEventListener("click", async () => {
  if (!validateInputs()) return;

  generateBtn.disabled = true;
  generateBtn.innerHTML = `<span>⏳</span> Generating…`;

  const payload = {
    frequency:   parseFloat(frequencyInput.value),
    duty_cycle:  parseFloat(dutyCycleInput.value),
    max_voltage: parseFloat(maxVoltageInput.value),
  };

  try {
    const res  = await fetch("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      showError("Server error: " + (err.error || res.statusText));
      return;
    }

    const data = await res.json();
    lastGeneratedData = data;

    // Switch to results page
    showPage("output");
    document.getElementById("tabOutput").disabled = false;

    // Populate results
    updateResultStrip(data);
    renderChart(data);
    updateMetrics(data);
    updateLED(data.duty_cycle);
    updateMotorGauge(data.duty_cycle, data.motor_rpm, data.motor_label);

    // Start animation
    document.dispatchEvent(new CustomEvent("pwmGenerated", { detail: data }));

  } catch (err) {
    showError("Network error — is Flask running? " + err.message);
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = `<span>▶</span> Generate Waveform`;
  }
});

/* ================================================================
   RESULT PARAMETER STRIP
   ================================================================ */
function updateResultStrip(data) {
  resultParams.innerHTML =
    `<strong>${data.frequency} Hz</strong> &nbsp;|&nbsp; ` +
    `<strong>${data.duty_cycle}%</strong> duty cycle &nbsp;|&nbsp; ` +
    `<strong>${data.max_voltage} V</strong> peak &nbsp;|&nbsp; ` +
    `Avg: <strong>${data.avg_voltage} V</strong>`;
}

/* ================================================================
   PLOTLY CHART
   ================================================================ */
function renderChart(data) {
  const bg   = "#07051a";
  const grid = "#1a1535";
  const txt  = "#9d8ec9";

  const trace = {
    x: data.time, y: data.voltage,
    type: "scatter", mode: "lines", name: "PWM Signal",
    line: { color: "#a855f7", width: 2.5, shape: "hv" },
    fill: "tozeroy", fillcolor: "rgba(168,85,247,0.1)",
  };
  const avgTrace = {
    x: [data.time[0], data.time[data.time.length - 1]],
    y: [data.avg_voltage, data.avg_voltage],
    type: "scatter", mode: "lines",
    name: `Avg: ${data.avg_voltage} V`,
    line: { color: "#4ade80", width: 1.5, dash: "dot" },
  };

  const layout = {
    paper_bgcolor: bg, plot_bgcolor: bg,
    margin: { t: 30, r: 20, b: 50, l: 55 },
    font: { family: "JetBrains Mono, monospace", size: 11, color: txt },
    xaxis: { title: { text: "Time (ms)" }, gridcolor: grid, zerolinecolor: grid },
    yaxis: {
      title: { text: "Voltage (V)" }, gridcolor: grid, zerolinecolor: grid,
      range: [-0.3, data.max_voltage * 1.2],
    },
    legend: { x: 0.01, y: 0.99, bgcolor: "rgba(0,0,0,0)", font: { size: 10 } },
    hovermode: "x unified",
  };

  if (chartRendered) {
    Plotly.react("waveformChart", [trace, avgTrace], layout, { responsive: true, displayModeBar: false });
  } else {
    Plotly.newPlot("waveformChart", [trace, avgTrace], layout, { responsive: true, displayModeBar: false });
    chartRendered = true;
  }
}

/* ================================================================
   METRIC CARDS
   ================================================================ */
function updateMetrics(data) {
  animateValue(avgVoltageEl, data.avg_voltage + " V");
  animateValue(onTimeEl,     data.on_time);
  animateValue(offTimeEl,    data.off_time);
  animateValue(periodEl,     data.period_ms + " ms");
}
function animateValue(el, val) {
  el.style.opacity = "0"; el.style.transform = "translateY(6px)";
  setTimeout(() => {
    el.textContent = val;
    el.style.transition = "opacity 0.3s, transform 0.3s";
    el.style.opacity = "1"; el.style.transform = "translateY(0)";
  }, 120);
}

/* ================================================================
   LED INDICATOR
   ================================================================ */
function updateLED(dc) {
  ledBarFill.style.width = dc + "%";
  let label, color;
  if (dc <= 30)      { label = `🔅 Dim (${dc}%)`;    color = "linear-gradient(to right,#78350f,#d97706)"; }
  else if (dc <= 70) { label = `💡 Medium (${dc}%)`;  color = "linear-gradient(to right,#d97706,#fbbf24)"; }
  else               { label = `🔆 Bright (${dc}%)`;  color = "linear-gradient(to right,#fbbf24,#fef08a)"; }
  ledBarFill.style.background = color;
  ledLabel.textContent = label;
}

/* ================================================================
   MOTOR GAUGE
   ================================================================ */
function updateMotorGauge(dc, rpm, label) {
  const filled = (dc / 100) * GAUGE_ARC_LEN;
  gaugeFill.setAttribute("stroke-dasharray", `${filled} ${GAUGE_ARC_LEN - filled}`);
  const color = dc <= 20 ? "#52400a" : dc <= 50 ? "#d97706" : dc <= 75 ? "#f59e0b" : "#fbbf24";
  gaugeFill.style.stroke  = color;
  gaugeFill.style.filter  = `drop-shadow(0 0 5px ${color})`;
  animateValue(motorRPM, rpm.toLocaleString());
  motorLabel.textContent = label;
}

/* ================================================================
   DOWNLOAD REPORT — mirrors website layout exactly
   ================================================================ */
downloadBtn.addEventListener("click", async () => {
  if (!chartRendered || !lastGeneratedData) return;

  const d       = lastGeneratedData;
  const isLight = document.documentElement.getAttribute("data-theme") === "light";

  /* ── Exact website colours ──────────────────────────────────── */
  const C = isLight ? {
    bgBase:    "#fffbf0",
    bgPanel:   "#ffffff",
    bgCard:    "#fff8e7",
    bgInput:   "#fefce8",
    border:    "#fcd34d",
    orange:    "#f59e0b",
    orangeDeep:"#d97706",
    orangeBrt: "#fbbf24",
    textPrim:  "#1a0f00",
    textSec:   "#92400e",
    textAcc:   "#b45309",
    green:     "#16a34a",
    topbarBg:  "#ffffff",
  } : {
    bgBase:    "#0a0a0a",
    bgPanel:   "#111111",
    bgCard:    "#181818",
    bgInput:   "#0d0d0d",
    border:    "#2a2200",
    orange:    "#f59e0b",
    orangeDeep:"#d97706",
    orangeBrt: "#fbbf24",
    textPrim:  "#fff8e7",
    textSec:   "#a08060",
    textAcc:   "#fbbf24",
    green:     "#4ade80",
    topbarBg:  "#111111",
  };

  /* ── Re-render Plotly with correct bg for download ───────────── */
  await Plotly.relayout("waveformChart", {
    paper_bgcolor: C.bgCard,
    plot_bgcolor:  C.bgCard,
    "xaxis.gridcolor": C.border,
    "yaxis.gridcolor": C.border,
    "font.color": C.textSec,
  });

  const imgData = await Plotly.toImage("waveformChart", {
    format: "png", width: 1120, height: 380,
  });

  /* ── Restore chart to screen colours after capture ───────────── */
  const screenBg   = isLight ? "#fffbf0" : "#080800";
  const screenGrid = isLight ? "#fde68a" : "#1a1400";
  const screenTxt  = isLight ? "#b45309" : "#3a2f00";
  Plotly.relayout("waveformChart", {
    paper_bgcolor: screenBg, plot_bgcolor: screenBg,
    "xaxis.gridcolor": screenGrid,
    "yaxis.gridcolor": screenGrid,
    "font.color": screenTxt,
  });

  const waveImg = new Image();
  waveImg.src   = imgData;

  waveImg.onload = () => {
    /* ── Canvas dimensions ──────────────────────────────────────── */
    const W      = 1200;
    const TOPBAR = 52;   // topbar height
    const STRIP  = 56;   // result-strip height
    const PAD    = 40;
    const CHART_W = waveImg.width;
    const CHART_H = waveImg.height;
    const METRICS_H = 90;   // metric cards row
    const IND_H     = 110;  // indicators row
    const FOOTER_H  = 36;

    const H = TOPBAR + STRIP + 16 + CHART_H + 16 + METRICS_H + 12 + IND_H + FOOTER_H;

    const oc  = document.createElement("canvas");
    oc.width  = W; oc.height = H;
    const c   = oc.getContext("2d");

    const r = (x, y, w, h, rad) => {
      c.beginPath();
      c.roundRect(x, y, w, h, rad);
      c.fill();
    };

    /* ── 1. Base background ──────────────────────────────────────── */
    c.fillStyle = C.bgBase;
    c.fillRect(0, 0, W, H);

    /* ── 2. Topbar ───────────────────────────────────────────────── */
    c.fillStyle = C.topbarBg;
    c.fillRect(0, 0, W, TOPBAR);
    // bottom border
    c.fillStyle = C.border;
    c.fillRect(0, TOPBAR - 1, W, 1);
    // orange top accent bar
    const tg = c.createLinearGradient(0,0,W,0);
    tg.addColorStop(0,   C.orangeDeep);
    tg.addColorStop(0.5, C.orangeBrt);
    tg.addColorStop(1,   C.orangeDeep);
    c.fillStyle = tg;
    c.fillRect(0, 0, W, 5);
    // pulsing dot
    c.fillStyle = C.green;
    c.beginPath(); c.arc(PAD, TOPBAR/2 + 2, 5, 0, Math.PI*2); c.fill();
    // logo text
    c.font = "bold 18px Arial, sans-serif";
    c.fillStyle = C.textPrim;
    c.fillText("PWM", PAD + 14, TOPBAR/2 + 7);
    c.fillStyle = C.orange;
    c.fillText(" Simulator", PAD + 54, TOPBAR/2 + 7);
    // right side — version
    c.font = "11px 'Courier New', monospace";
    c.fillStyle = C.textSec;
    c.fillText("v2.0 — EE Mini Project  |  Waveform Report", W - PAD - 320, TOPBAR/2 + 5);

    /* ── 3. Result strip ─────────────────────────────────────────── */
    const stripY = TOPBAR + 10;
    c.fillStyle = C.bgPanel;
    r(PAD, stripY, W - PAD*2, STRIP - 8, 10);
    c.strokeStyle = C.border; c.lineWidth = 1;
    c.beginPath(); c.roundRect(PAD, stripY, W - PAD*2, STRIP - 8, 10); c.stroke();
    // orange left bar
    c.fillStyle = C.orange;
    r(PAD, stripY, 4, STRIP - 8, [10,0,0,10]);
    // param text
    c.font = "13px 'Courier New', monospace";
    c.fillStyle = C.textSec;
    c.fillText("Signal Parameters:", PAD + 20, stripY + 20);
    c.font = "bold 13px 'Courier New', monospace";
    c.fillStyle = C.textAcc;
    const paramStr = [
      `Freq: ${d.frequency} Hz`,
      `Duty: ${d.duty_cycle}%`,
      `Vpeak: ${d.max_voltage} V`,
      `Vavg: ${d.avg_voltage} V`,
      `ON: ${d.on_time}`,
      `OFF: ${d.off_time}`,
      `Period: ${d.period_ms} ms`,
      `LED: ${d.led_label}`,
      `Motor: ~${d.motor_rpm} RPM`,
    ];
    let px = PAD + 20;
    paramStr.forEach((p, i) => {
      if (i > 0) { c.fillStyle = C.border; c.fillText(" | ", px - 4, stripY + 40); px += 12; }
      c.fillStyle = C.textAcc;
      c.fillText(p, px, stripY + 40);
      px += c.measureText(p).width + 16;
    });

    /* ── 4. Chart card ───────────────────────────────────────────── */
    const chartY = TOPBAR + STRIP + 14;
    c.fillStyle = C.bgPanel;
    r(PAD, chartY, W - PAD*2, CHART_H + 32, 12);
    c.strokeStyle = C.border; c.lineWidth = 1;
    c.beginPath(); c.roundRect(PAD, chartY, W - PAD*2, CHART_H + 32, 12); c.stroke();
    // card title
    c.font = "bold 11px Arial, sans-serif";
    c.fillStyle = C.textSec;
    c.fillText("📈  PWM WAVEFORM", PAD + 16, chartY + 18);
    c.fillStyle = C.orange;
    c.fillRect(PAD + 16, chartY + 22, 100, 2);
    // chart image
    const chartX = PAD + (W - PAD*2 - CHART_W) / 2;
    c.drawImage(waveImg, chartX, chartY + 28);

    /* ── 5. Metric cards row ─────────────────────────────────────── */
    const metricsY = chartY + CHART_H + 48;
    const metrics = [
      { label: "AVG VOLTAGE", value: d.avg_voltage + " V" },
      { label: "ON TIME",     value: d.on_time },
      { label: "OFF TIME",    value: d.off_time },
      { label: "PERIOD",      value: d.period_ms + " ms" },
    ];
    const cardW = (W - PAD*2 - 12*3) / 4;
    metrics.forEach((m, i) => {
      const mx = PAD + i * (cardW + 12);
      c.fillStyle = C.bgCard;
      r(mx, metricsY, cardW, METRICS_H - 4, 10);
      c.strokeStyle = C.border; c.lineWidth = 1;
      c.beginPath(); c.roundRect(mx, metricsY, cardW, METRICS_H - 4, 10); c.stroke();
      // label
      c.font = "bold 10px Arial, sans-serif";
      c.fillStyle = C.textSec;
      c.textAlign = "center";
      c.fillText(m.label, mx + cardW/2, metricsY + 22);
      // value
      c.font = "bold 22px 'Courier New', monospace";
      c.fillStyle = C.textAcc;
      c.fillText(m.value, mx + cardW/2, metricsY + 56);
      c.textAlign = "left";
    });

    /* ── 6. Indicator cards ──────────────────────────────────────── */
    const indY  = metricsY + METRICS_H + 8;
    const indW  = (W - PAD*2 - 12) / 2;
    const dc    = d.duty_cycle;

    // LED card
    c.fillStyle = C.bgCard;
    r(PAD, indY, indW, IND_H - 4, 10);
    c.strokeStyle = C.border; c.lineWidth = 1;
    c.beginPath(); c.roundRect(PAD, indY, indW, IND_H - 4, 10); c.stroke();
    c.font = "bold 10px Arial, sans-serif";
    c.fillStyle = C.textSec;
    c.fillText("💡  LED BRIGHTNESS", PAD + 14, indY + 20);
    // LED bar track
    c.fillStyle = C.border;
    r(PAD + 14, indY + 32, indW - 28, 10, 5);
    // LED bar fill
    const ledGrad = c.createLinearGradient(PAD+14, 0, PAD+14+(indW-28), 0);
    ledGrad.addColorStop(0, C.orangeDeep);
    ledGrad.addColorStop(1, C.orangeBrt);
    c.fillStyle = ledGrad;
    r(PAD + 14, indY + 32, (indW - 28) * (dc/100), 10, 5);
    // LED label
    c.font = "bold 13px 'Courier New', monospace";
    c.fillStyle = C.textPrim;
    c.textAlign = "center";
    c.fillText(
      dc <= 30 ? `🔅 Dim (${dc}%)` : dc <= 70 ? `💡 Medium (${dc}%)` : `🔆 Bright (${dc}%)`,
      PAD + indW/2, indY + 68
    );
    c.textAlign = "left";

    // Motor card
    const mx2 = PAD + indW + 12;
    c.fillStyle = C.bgCard;
    r(mx2, indY, indW, IND_H - 4, 10);
    c.strokeStyle = C.border; c.lineWidth = 1;
    c.beginPath(); c.roundRect(mx2, indY, indW, IND_H - 4, 10); c.stroke();
    c.font = "bold 10px Arial, sans-serif";
    c.fillStyle = C.textSec;
    c.fillText("⚙  MOTOR SPEED", mx2 + 14, indY + 20);
    // Gauge arc
    const cx = mx2 + indW/2, cy = indY + 72, rad2 = 32;
    c.strokeStyle = C.border; c.lineWidth = 9; c.lineCap = "round";
    c.beginPath(); c.arc(cx, cy, rad2, Math.PI, 0); c.stroke();
    const arcColor = dc <= 20 ? "#52400a" : dc <= 50 ? C.orangeDeep : dc <= 75 ? C.orange : C.orangeBrt;
    c.strokeStyle = arcColor; c.lineWidth = 9;
    c.beginPath(); c.arc(cx, cy, rad2, Math.PI, Math.PI + Math.PI*(dc/100)); c.stroke();
    c.font = "bold 14px 'Courier New', monospace";
    c.fillStyle = C.textAcc;
    c.textAlign = "center";
    c.fillText(`${d.motor_rpm} RPM`, cx, indY + 60);
    c.font = "11px Arial"; c.fillStyle = C.textSec;
    c.fillText(d.motor_label, cx, indY + 80);
    c.textAlign = "left";

    /* ── 7. Footer ───────────────────────────────────────────────── */
    const footY = H - FOOTER_H;
    c.fillStyle = C.bgPanel;
    c.fillRect(0, footY, W, FOOTER_H);
    c.fillStyle = C.border;
    c.fillRect(0, footY, W, 1);
    c.fillStyle = tg; // orange bottom bar
    c.fillRect(0, H - 4, W, 4);
    c.font = "11px 'Courier New', monospace";
    c.fillStyle = C.textSec;
    c.fillText(
      `Generated: ${new Date().toLocaleString()}  |  PWM Signal Simulator — EE Mini Project`,
      PAD, footY + 22
    );

    /* ── Trigger download ─────────────────────────────────────────── */
    const link    = document.createElement("a");
    link.download = `pwm_report_${d.frequency}Hz_${d.duty_cycle}pct.png`;
    link.href     = oc.toDataURL("image/png");
    link.click();
  };
});

/* ================================================================
   KEYBOARD SHORTCUT
   ================================================================ */
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !generateBtn.disabled) generateBtn.click();
});

/* ================================================================
   LIVE CANVAS ANIMATION ENGINE
   ================================================================ */
let animParams  = null;
let animRunning = false;
let animPaused  = false;
let rafId       = null;
let tSeconds    = 0;
let fanAngle    = 0;
let lastTs      = null;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (canvas.width !== Math.floor(rect.width)) canvas.width = Math.floor(rect.width);
}

function startAnimation(params) {
  animParams  = params;
  animRunning = true;
  animPaused  = false;
  tSeconds    = 0; lastTs = null; fanAngle = 0;
  animPlayPause.disabled = false;
  animReset.disabled     = false;
  animPlayPause.textContent = "⏸ Pause";
  resizeCanvas(); clearCanvas();
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(animFrame);
}

function animFrame(timestamp) {
  if (!animRunning || animPaused) return;
  resizeCanvas();
  if (!lastTs) lastTs = timestamp;
  const wallDelta = timestamp - lastTs; lastTs = timestamp;
  const speed     = parseFloat(animSpeedSel.value) || 0.5;
  const deltaSec  = (wallDelta / 1000) * speed;
  tSeconds += deltaSec;

  const { frequency, dutyCycle, maxVoltage } = animParams;
  const period  = 1 / frequency;
  const phase   = (tSeconds % period) / period;
  const isHigh  = phase < (dutyCycle / 100);

  drawOscilloscope(tSeconds, frequency, dutyCycle, maxVoltage, isHigh);

  // Signal badge
  sigDot.className = isHigh ? "sig-dot high" : "sig-dot low";
  sigStateText.textContent = isHigh ? `HIGH — ${maxVoltage.toFixed(1)} V` : `LOW  — 0.0 V`;

  // LED
  if (frequency >= 60) {
    animLed.classList.add("on");
    animLed.style.opacity = 0.2 + 0.8 * (dutyCycle / 100);
  } else {
    animLed.style.opacity = "1";
    isHigh ? animLed.classList.add("on") : animLed.classList.remove("on");
  }

  // Motor fan
  fanAngle = (fanAngle + (dutyCycle / 100) * 720 * deltaSec) % 360;
  motorFan.style.transform = `rotate(${fanAngle}deg)`;

  rafId = requestAnimationFrame(animFrame);
}

function drawOscilloscope(tNow, frequency, dutyCycle, maxVoltage, isHigh) {
  const W = canvas.width, H = canvas.height;
  const speed     = parseFloat(animSpeedSel.value) || 0.5;
  const period    = 1 / frequency;
  const windowSec = Math.max(0.005, Math.min(2.0, (period * 3) / speed));
  const pixPerSec = W / windowSec;
  const tStart    = tNow - windowSec;
  const pad       = H * 0.12;
  const voltToY   = v => H - pad - (v / maxVoltage) * (H - 2 * pad);

  // Read CSS vars so canvas respects dark/light theme
  const cs       = getComputedStyle(document.documentElement);
  const canvasBg = cs.getPropertyValue("--canvas-bg").trim()   || "#080800";
  const canvasGr = cs.getPropertyValue("--canvas-grid").trim() || "#1a1400";
  const canvasLn = cs.getPropertyValue("--canvas-line").trim() || "#f59e0b";
  const canvasFl = cs.getPropertyValue("--canvas-fill").trim() || "rgba(245,158,11,0.12)";
  const canvasTx = cs.getPropertyValue("--canvas-txt").trim()  || "#3a2f00";

  // Clear
  ctx.fillStyle = canvasBg;
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = canvasGr; ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = Math.round((i / 4) * H) + 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  for (let i = 0; i <= 6; i++) {
    const x = Math.round((i / 6) * W) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // Average line
  const yMid = voltToY(maxVoltage * dutyCycle / 100);
  ctx.strokeStyle = "#4ade80"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(0, yMid); ctx.lineTo(W, yMid); ctx.stroke();
  ctx.setLineDash([]);

  // HIGH fill
  ctx.fillStyle = canvasFl;
  const yHigh = voltToY(maxVoltage), yLow = voltToY(0);
  let inFill = false, fillX = 0;
  for (let px = 0; px <= W; px++) {
    const t = tStart + px / pixPerSec;
    const ph = ((t % period) + period) % period / period;
    const hi = ph < dutyCycle / 100;
    if (hi && !inFill)  { fillX = px; inFill = true; }
    if (!hi && inFill)  { ctx.fillRect(fillX, yHigh, px - fillX, yLow - yHigh); inFill = false; }
  }
  if (inFill) ctx.fillRect(fillX, yHigh, W - fillX, yLow - yHigh);

  // Waveform — glow pass then crisp pass
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    let started = false;
    for (let px = 0; px <= W; px++) {
      const t   = tStart + px / pixPerSec;
      const ph  = ((t % period) + period) % period / period;
      const v   = ph < dutyCycle / 100 ? maxVoltage : 0;
      const y   = voltToY(v);
      if (px > 0) {
        const tP  = tStart + (px - 1) / pixPerSec;
        const phP = ((tP % period) + period) % period / period;
        const vP  = phP < dutyCycle / 100 ? maxVoltage : 0;
        if (vP !== v) { ctx.lineTo(px, voltToY(vP)); ctx.lineTo(px, y); }
      }
      started ? ctx.lineTo(px, y) : (ctx.moveTo(px, y), started = true);
    }
    if (pass === 0) {
      ctx.shadowBlur = 12; ctx.shadowColor = "#a855f7";
      ctx.strokeStyle = canvasLn.replace(")", ",0.3)").replace("rgb(","rgba("); ctx.lineWidth = 7;
    } else {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = canvasLn; ctx.lineWidth = 2.5;
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  // Voltage labels
  ctx.fillStyle = canvasTx; ctx.font = "10px 'JetBrains Mono',monospace";
  ctx.fillText(`${maxVoltage}V`, 4, pad + 4);
  ctx.fillText("0V", 4, H - pad + 4);

  // Cursor
  ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(W - 1, 0); ctx.lineTo(W - 1, H); ctx.stroke();
  ctx.setLineDash([]);
}

function clearCanvas() {
  const _cs = getComputedStyle(document.documentElement);
  ctx.fillStyle = _cs.getPropertyValue("--canvas-bg").trim() || "#080800";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Play/Pause
animPlayPause.addEventListener("click", () => {
  if (!animRunning) return;
  animPaused = !animPaused;
  animPlayPause.textContent = animPaused ? "▶ Play" : "⏸ Pause";
  if (!animPaused) { lastTs = null; rafId = requestAnimationFrame(animFrame); }
});

// Reset
animReset.addEventListener("click", () => {
  if (!animParams) return;
  tSeconds = 0; fanAngle = 0; lastTs = null; animPaused = false;
  animPlayPause.textContent = "⏸ Pause";
  clearCanvas();
  if (!rafId) rafId = requestAnimationFrame(animFrame);
});

// Hook animation start
document.addEventListener("pwmGenerated", (e) => {
  startAnimation({
    frequency:  e.detail.frequency,
    dutyCycle:  e.detail.duty_cycle,
    maxVoltage: e.detail.max_voltage,
  });
});

window.addEventListener("resize", () => {
  resizeCanvas();
  if (!animRunning || animPaused) clearCanvas();
});
