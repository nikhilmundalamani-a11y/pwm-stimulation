/**
 * PWM Signal Simulator — Frontend Logic
 * =======================================
 * Responsibilities:
 *  1. Sync duty-cycle slider ↔ number input
 *  2. Send parameters to Flask /generate endpoint
 *  3. Render waveform with Plotly
 *  4. Update metric cards & indicators
 *  5. Dark / Light theme toggle
 *  6. Download chart as PNG
 */

"use strict";

/* ─── DOM References ──────────────────────────────────────────── */
const frequencyInput    = document.getElementById("frequency");
const dutyCycleInput    = document.getElementById("dutyCycle");
const dutyCycleSlider   = document.getElementById("dutyCycleSlider");
const maxVoltageInput   = document.getElementById("maxVoltage");
const generateBtn       = document.getElementById("generateBtn");
const downloadBtn       = document.getElementById("downloadBtn");
const themeToggle       = document.getElementById("themeToggle");
const themeIcon         = themeToggle.querySelector(".theme-icon");
const errorMsg          = document.getElementById("errorMsg");
const chartPlaceholder  = document.getElementById("chartPlaceholder");

// Metric value spans
const avgVoltageEl  = document.getElementById("avgVoltage");
const onTimeEl      = document.getElementById("onTime");
const offTimeEl     = document.getElementById("offTime");
const periodEl      = document.getElementById("period");

// LED indicator
const ledBarFill    = document.getElementById("ledBarFill");
const ledLabel      = document.getElementById("ledLabel");

// Motor indicator
const gaugeFill     = document.getElementById("gaugeFill");
const motorRPM      = document.getElementById("motorRPM");
const motorLabel    = document.getElementById("motorLabel");

// Hint text under slider
const dcHint        = document.getElementById("dcHint");

/* ─── Gauge arc constants ─────────────────────────────────────── */
// The semicircle arc length = π × r ≈ 3.14159 × 50 ≈ 157
const GAUGE_ARC_LEN = 157;

/* ─── Plotly chart reference ──────────────────────────────────── */
let chartRendered = false;


/* ================================================================
   1. DUTY CYCLE SLIDER ↔ NUMBER INPUT — SYNC
   ================================================================ */

dutyCycleSlider.addEventListener("input", () => {
  const val = parseInt(dutyCycleSlider.value, 10);
  dutyCycleInput.value = val;
  updateSliderBackground(val);
  updateDcHint(val);
});

dutyCycleInput.addEventListener("input", () => {
  let val = parseFloat(dutyCycleInput.value);
  // Clamp to 0–100
  if (isNaN(val)) return;
  val = Math.max(0, Math.min(100, val));
  dutyCycleSlider.value = val;
  updateSliderBackground(val);
  updateDcHint(val);
});

/** Fill the range track left-of-thumb with the accent colour */
function updateSliderBackground(val) {
  dutyCycleSlider.style.background =
    `linear-gradient(to right, var(--blue-glow) ${val}%, var(--border) ${val}%)`;
}

function updateDcHint(val) {
  let label = "";
  if (val <= 30)        label = "Dim LED range";
  else if (val <= 70)   label = "Medium LED range";
  else                  label = "Bright LED range";
  dcHint.textContent = `${val}% duty cycle — ${label}`;
}

// Initialise on load
updateSliderBackground(50);
updateDcHint(50);


/* ================================================================
   2. INPUT VALIDATION
   ================================================================ */

function validateInputs() {
  const freq = parseFloat(frequencyInput.value);
  const dc   = parseFloat(dutyCycleInput.value);
  const vmax = parseFloat(maxVoltageInput.value);

  if (isNaN(freq) || freq <= 0) {
    showError("⚠ Frequency must be a positive number (Hz).");
    return false;
  }
  if (freq > 100000) {
    showError("⚠ Frequency must be ≤ 100,000 Hz.");
    return false;
  }
  if (isNaN(dc) || dc < 0 || dc > 100) {
    showError("⚠ Duty Cycle must be between 0 and 100 (%).");
    return false;
  }
  if (isNaN(vmax) || vmax <= 0) {
    showError("⚠ Max Voltage must be a positive number (V).");
    return false;
  }
  clearError();
  return true;
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove("hidden");
}
function clearError() {
  errorMsg.textContent = "";
  errorMsg.classList.add("hidden");
}


/* ================================================================
   3. GENERATE WAVEFORM — AJAX → Flask
   ================================================================ */

generateBtn.addEventListener("click", async () => {
  if (!validateInputs()) return;

  // Button loading state
  generateBtn.disabled = true;
  generateBtn.innerHTML = `<span class="btn-icon">⏳</span> Generating…`;

  const payload = {
    frequency:   parseFloat(frequencyInput.value),
    duty_cycle:  parseFloat(dutyCycleInput.value),
    max_voltage: parseFloat(maxVoltageInput.value),
  };

  try {
    const response = await fetch("/generate", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json();
      showError("Server error: " + (err.error || response.statusText));
      return;
    }

    const data = await response.json();

    // Render everything
    renderChart(data);
    updateMetrics(data);
    updateLED(data.duty_cycle);
    updateMotorGauge(data.duty_cycle, data.motor_rpm, data.motor_label);

    // Enable download
    downloadBtn.disabled = false;

    // 🔴 Fire custom event → triggers live canvas animation
    document.dispatchEvent(new CustomEvent("pwmGenerated", { detail: data }));

  } catch (err) {
    showError("Network error — is Flask running? " + err.message);
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = `<span class="btn-icon">▶</span> Generate Waveform`;
  }
});


/* ================================================================
   4. PLOTLY CHART RENDERING
   ================================================================ */

function renderChart(data) {
  // Hide placeholder text
  chartPlaceholder.classList.add("hidden");

  const isDark = document.documentElement.getAttribute("data-theme") !== "light";

  const bgColor   = isDark ? "#0d1117" : "#ffffff";
  const gridColor = isDark ? "#1e2d45" : "#e2e8f0";
  const textColor = isDark ? "#7a8fa6" : "#475569";
  const lineColor = "#1a6cff";
  const fillColor = "rgba(26,108,255,0.10)";

  // Waveform trace
  const trace = {
    x:    data.time,
    y:    data.voltage,
    type: "scatter",
    mode: "lines",
    name: "PWM Signal",
    line: {
      color: lineColor,
      width: 2.5,
      shape: "hv",   // horizontal-then-vertical steps (square wave)
    },
    fill: "tozeroy",
    fillcolor: fillColor,
  };

  // Average voltage reference line
  const avgTrace = {
    x:    [data.time[0], data.time[data.time.length - 1]],
    y:    [data.avg_voltage, data.avg_voltage],
    type: "scatter",
    mode: "lines",
    name: `Avg: ${data.avg_voltage} V`,
    line: {
      color: "#22c55e",
      width: 1.5,
      dash:  "dot",
    },
  };

  const layout = {
    paper_bgcolor: bgColor,
    plot_bgcolor:  bgColor,
    margin:        { t: 30, r: 20, b: 50, l: 55 },
    font:          { family: "JetBrains Mono, monospace", size: 11, color: textColor },
    xaxis: {
      title:      { text: "Time (ms)", standoff: 8 },
      gridcolor:  gridColor,
      zerolinecolor: gridColor,
      tickfont:   { size: 10 },
    },
    yaxis: {
      title:      { text: "Voltage (V)", standoff: 8 },
      gridcolor:  gridColor,
      zerolinecolor: gridColor,
      range:      [-0.3, data.max_voltage * 1.2],
      tickfont:   { size: 10 },
    },
    legend: {
      x: 0.01, y: 0.99,
      font: { size: 10 },
      bgcolor: "rgba(0,0,0,0)",
    },
    hovermode: "x unified",
    annotations: [
      {
        xref: "paper", yref: "paper",
        x: 1, y: 1.04,
        xanchor: "right", yanchor: "bottom",
        text: `f = ${data.frequency} Hz | D = ${data.duty_cycle}% | Vpeak = ${data.max_voltage} V`,
        showarrow: false,
        font: { size: 10, color: textColor },
      }
    ],
  };

  const config = {
    responsive:     true,
    displayModeBar: false,   // hide default plotly toolbar (we have our own download btn)
  };

  if (chartRendered) {
    Plotly.react("waveformChart", [trace, avgTrace], layout, config);
  } else {
    Plotly.newPlot("waveformChart", [trace, avgTrace], layout, config);
    chartRendered = true;
  }
}


/* ================================================================
   5. METRIC CARDS UPDATE
   ================================================================ */

function updateMetrics(data) {
  animateValue(avgVoltageEl, data.avg_voltage + " V");
  animateValue(onTimeEl,     data.on_time);
  animateValue(offTimeEl,    data.off_time);
  animateValue(periodEl,     data.period_ms + " ms");
}

/** Simple fade-swap animation for metric values */
function animateValue(el, newValue) {
  el.style.opacity = "0";
  el.style.transform = "translateY(6px)";
  setTimeout(() => {
    el.textContent = newValue;
    el.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    el.style.opacity   = "1";
    el.style.transform = "translateY(0)";
  }, 120);
}


/* ================================================================
   6. LED BRIGHTNESS INDICATOR
   ================================================================ */

function updateLED(dc) {
  ledBarFill.style.width = dc + "%";

  let label, color;
  if (dc <= 30) {
    label = `🔅 Dim (${dc}%)`;
    color = "linear-gradient(to right, #78350f, #d97706)";
  } else if (dc <= 70) {
    label = `💡 Medium (${dc}%)`;
    color = "linear-gradient(to right, #d97706, #fbbf24)";
  } else {
    label = `🔆 Bright (${dc}%)`;
    color = "linear-gradient(to right, #fbbf24, #fef08a)";
  }

  ledBarFill.style.background = color;
  ledLabel.textContent = label;
}


/* ================================================================
   7. MOTOR SPEED GAUGE
   ================================================================ */

function updateMotorGauge(dc, rpm, label) {
  // Dash array: filled portion = (dc/100) × arc length
  const filled = (dc / 100) * GAUGE_ARC_LEN;
  const gap    = GAUGE_ARC_LEN - filled;
  gaugeFill.setAttribute("stroke-dasharray", `${filled} ${gap}`);

  // Change colour based on speed
  let strokeColor;
  if (dc <= 20)       strokeColor = "#475569";
  else if (dc <= 50)  strokeColor = "#3b82f6";
  else if (dc <= 75)  strokeColor = "#0ea5e9";
  else                strokeColor = "#22c55e";

  gaugeFill.style.stroke = strokeColor;
  gaugeFill.style.filter = `drop-shadow(0 0 5px ${strokeColor})`;

  // Animate RPM counter
  animateValue(motorRPM, rpm.toLocaleString());
  motorLabel.textContent = label;
}


/* ================================================================
   8. DARK / LIGHT THEME TOGGLE
   ================================================================ */

themeToggle.addEventListener("click", () => {
  const html    = document.documentElement;
  const isDark  = html.getAttribute("data-theme") === "dark";
  const newTheme = isDark ? "light" : "dark";

  html.setAttribute("data-theme", newTheme);
  themeIcon.textContent = isDark ? "🌙" : "☀️";

  // Re-render chart colours if chart exists
  if (chartRendered) {
    // Trigger a re-render with updated colours by clicking generate
    // Instead we just relayout with new bg colours
    const isNowDark  = newTheme === "dark";
    const bgColor    = isNowDark ? "#0d1117" : "#ffffff";
    const gridColor  = isNowDark ? "#1e2d45" : "#e2e8f0";
    const textColor  = isNowDark ? "#7a8fa6" : "#475569";

    Plotly.relayout("waveformChart", {
      paper_bgcolor: bgColor,
      plot_bgcolor:  bgColor,
      "xaxis.gridcolor":  gridColor,
      "yaxis.gridcolor":  gridColor,
      "font.color":        textColor,
    });
  }
});


/* ================================================================
   9. DOWNLOAD WAVEFORM AS PNG
   ================================================================ */

downloadBtn.addEventListener("click", () => {
  if (!chartRendered) return;

  const freq = frequencyInput.value || "unknown";
  const dc   = dutyCycleInput.value || "unknown";

  // Plotly's built-in image export
  Plotly.downloadImage("waveformChart", {
    format:   "png",
    width:    1200,
    height:   500,
    filename: `pwm_waveform_${freq}Hz_${dc}pct`,
  });
});


/* ================================================================
   10. KEYBOARD SHORTCUT — Enter to Generate
   ================================================================ */

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !generateBtn.disabled) {
    generateBtn.click();
  }
});


/* ================================================================
   10. KEYBOARD SHORTCUT — Enter to Generate
   ================================================================ */

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !generateBtn.disabled) {
    generateBtn.click();
  }
});


/* ================================================================
   11. LIVE PWM CANVAS ANIMATION ENGINE
   ================================================================
   How it works:
   - A virtual "signal cursor" moves left-to-right across the canvas.
   - At every frame we compute whether the cursor is in the HIGH or
     LOW phase of the current cycle, draw one pixel column, and
     scroll older columns to the left (oscilloscope-style).
   - The waveform scrolls continuously so it looks "live".
   ================================================================ */

const canvas       = document.getElementById("pwmCanvas");
const ctx          = canvas.getContext("2d");
const animPlayPause = document.getElementById("animPlayPause");
const animReset    = document.getElementById("animReset");
const animSpeedSel = document.getElementById("animSpeed");
const sigDot       = document.getElementById("sigDot");
const sigStateText = document.getElementById("sigStateText");
const animLed      = document.getElementById("animLed");
const motorFan     = document.getElementById("motorFan");

/* Animation state */
let animParams = null;     // { frequency, dutyCycle, maxVoltage }
let animRunning = false;
let animPaused  = false;
let rafId       = null;

/* Oscilloscope scroll state */
let tSeconds    = 0;       // virtual time cursor (seconds)
let fanAngle    = 0;       // motor fan rotation angle (degrees)
let lastTs      = null;    // previous requestAnimationFrame timestamp

/* Colour palette */
const COLORS = {
  gridDark:  "#0f1e33",
  gridLight: "#dde8f5",
  lineDark:  "#1a6cff",
  lineLight: "#1a6cff",
  glowDark:  "rgba(26,108,255,0.25)",
  glowLight: "rgba(26,108,255,0.15)",
  textDark:  "#3a5070",
  textLight: "#94a3b8",
  highDark:  "rgba(26,108,255,0.18)",
  highLight: "rgba(26,108,255,0.10)",
};

/* ── Resize canvas to match CSS width ───────────────────────── */
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  if (canvas.width !== Math.floor(rect.width)) {
    canvas.width = Math.floor(rect.width);
  }
}

/* ── Start animation with given PWM params ───────────────────── */
function startAnimation(params) {
  animParams  = params;
  animRunning = true;
  animPaused  = false;
  tSeconds    = 0;
  lastTs      = null;
  fanAngle    = 0;

  // Enable controls
  animPlayPause.disabled = false;
  animReset.disabled     = false;
  animPlayPause.textContent = "⏸ Pause";

  // Clear canvas before starting
  resizeCanvas();
  clearCanvas();

  // Start the loop
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(animFrame);
}

/* ── Main animation loop ─────────────────────────────────────── */
function animFrame(timestamp) {
  if (!animRunning || animPaused) return;

  resizeCanvas();

  if (!lastTs) lastTs = timestamp;
  const wallDeltaMs = timestamp - lastTs;
  lastTs = timestamp;

  const speed  = parseFloat(animSpeedSel.value) || 1;
  const deltaSec = (wallDeltaMs / 1000) * speed;

  tSeconds += deltaSec;

  const { frequency, dutyCycle, maxVoltage } = animParams;
  const period    = 1 / frequency;
  const onTime    = period * (dutyCycle / 100);

  // Where in the current cycle are we?
  const phase     = (tSeconds % period) / period;   // 0 → 1
  const isHigh    = phase < (dutyCycle / 100);
  const voltage   = isHigh ? maxVoltage : 0;

  /* ── Draw oscilloscope frame ── */
  drawOscilloscope(tSeconds, frequency, dutyCycle, maxVoltage, isHigh);

  /* ── Update signal-state badge ── */
  if (isHigh) {
    sigDot.className = "sig-dot high";
    sigStateText.textContent = `HIGH — ${maxVoltage.toFixed(1)} V`;
  } else {
    sigDot.className = "sig-dot low";
    sigStateText.textContent = `LOW  — 0.0 V`;
  }

  /* ── Animate LED ── */
  // For duty cycles < 100, the LED flickers ON/OFF with the signal.
  // But at very high frequencies the human eye sees average brightness,
  // so we blend: above 60 Hz always-on glow, below 60 Hz hard ON/OFF.
  if (frequency >= 60) {
    animLed.classList.add("on");
    // Dimming effect via opacity proportional to duty cycle
    animLed.style.opacity = 0.2 + 0.8 * (dutyCycle / 100);
  } else {
    animLed.style.opacity = "1";
    if (isHigh) animLed.classList.add("on");
    else        animLed.classList.remove("on");
  }

  /* ── Spin motor fan ── */
  // Fan RPM proportional to duty cycle; max ~1800 visual degrees/sec
  const degreesPerSec = (dutyCycle / 100) * 720;  // 0–720 deg/s
  fanAngle = (fanAngle + degreesPerSec * deltaSec) % 360;
  motorFan.style.transform = `rotate(${fanAngle}deg)`;

  rafId = requestAnimationFrame(animFrame);
}

/* ── Draw one frame of the scrolling oscilloscope ───────────── */
function drawOscilloscope(tNow, frequency, dutyCycle, maxVoltage, isHigh) {
  const W = canvas.width;
  const H = canvas.height;
  const isDark = document.documentElement.getAttribute("data-theme") !== "light";

  /* How many seconds of history to show.
     Dividing by speed makes the wave scroll visually slower at 0.1× and
     faster at 0.5× — the waveform stretches/compresses across the canvas. */
  const speed     = parseFloat(animSpeedSel.value) || 1;
  const period    = 1 / frequency;
  const windowSec = Math.max(0.005, Math.min(2.0, (period * 3) / speed));
  const pixPerSec = W / windowSec;

  /* Clear */
  ctx.clearRect(0, 0, W, H);

  /* Background */
  ctx.fillStyle = isDark ? "#060a12" : "#f1f5fb";
  ctx.fillRect(0, 0, W, H);

  /* Grid lines */
  drawGrid(W, H, windowSec, maxVoltage, isDark);

  /* Waveform path */
  drawWaveformPath(W, H, tNow, windowSec, pixPerSec, frequency, dutyCycle, maxVoltage, isDark);

  /* Moving cursor line */
  drawCursor(W, H, isDark);

  /* Voltage scale label */
  drawVoltageLabel(H, maxVoltage, isDark);
}

/* Grid ─────────────────────────────────────────────────────── */
function drawGrid(W, H, windowSec, maxVoltage, isDark) {
  ctx.strokeStyle = isDark ? COLORS.gridDark : COLORS.gridLight;
  ctx.lineWidth   = 0.5;

  // Horizontal: 4 divisions
  for (let i = 0; i <= 4; i++) {
    const y = Math.round((i / 4) * H) + 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // Vertical: 6 divisions
  for (let i = 0; i <= 6; i++) {
    const x = Math.round((i / 6) * W) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
}

/* Waveform path ─────────────────────────────────────────────── */
function drawWaveformPath(W, H, tNow, windowSec, pixPerSec, frequency, dutyCycle, maxVoltage, isDark) {
  const period  = 1 / frequency;
  const tStart  = tNow - windowSec;   // left edge of window

  const lineColor = isDark ? COLORS.lineDark  : COLORS.lineLight;
  const glowColor = isDark ? COLORS.glowDark  : COLORS.glowLight;
  const highFill  = isDark ? COLORS.highDark  : COLORS.highLight;

  // Map voltage to canvas Y (0V = bottom, maxVoltage = top with padding)
  const pad = H * 0.12;
  const voltToY = (v) => H - pad - (v / maxVoltage) * (H - 2 * pad);

  const yHigh = voltToY(maxVoltage);
  const yLow  = voltToY(0);
  const yMid  = voltToY(maxVoltage * (dutyCycle / 100)); // average line Y

  /* ── Draw fill areas first (HIGH regions shaded) ── */
  ctx.fillStyle = highFill;
  let inFill = false;
  let fillStartX = 0;

  for (let px = 0; px <= W; px++) {
    const t     = tStart + px / pixPerSec;
    const phase = ((t % period) + period) % period / period;
    const hi    = phase < dutyCycle / 100;

    if (hi && !inFill) { fillStartX = px; inFill = true; }
    if (!hi && inFill) {
      ctx.fillRect(fillStartX, yHigh, px - fillStartX, yLow - yHigh);
      inFill = false;
    }
  }
  if (inFill) ctx.fillRect(fillStartX, yHigh, W - fillStartX, yLow - yHigh);

  /* ── Average voltage dashed line ── */
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth   = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, yMid); ctx.lineTo(W, yMid);
  ctx.stroke();
  ctx.setLineDash([]);

  /* ── Glow under waveform (draw twice: blur pass + crisp pass) ── */
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    let started = false;

    for (let px = 0; px <= W; px++) {
      const t     = tStart + px / pixPerSec;
      const phase = ((t % period) + period) % period / period;
      const v     = phase < dutyCycle / 100 ? maxVoltage : 0;
      const y     = voltToY(v);

      // Detect transition edge: draw vertical line
      if (px > 0) {
        const tPrev     = tStart + (px - 1) / pixPerSec;
        const phasePrev = ((tPrev % period) + period) % period / period;
        const vPrev     = phasePrev < dutyCycle / 100 ? maxVoltage : 0;
        if (vPrev !== v) {
          // vertical edge
          ctx.lineTo(px, voltToY(vPrev));
          ctx.lineTo(px, y);
        }
      }

      if (!started) { ctx.moveTo(px, y); started = true; }
      else ctx.lineTo(px, y);
    }

    if (pass === 0) {
      // glow pass
      ctx.shadowBlur  = 10;
      ctx.shadowColor = lineColor;
      ctx.strokeStyle = glowColor;
      ctx.lineWidth   = 6;
    } else {
      // crisp pass
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth   = 2;
    }
    ctx.stroke();
    ctx.beginPath();
  }
  ctx.shadowBlur = 0;
}

/* Moving cursor at right edge ───────────────────────────────── */
function drawCursor(W, H, isDark) {
  ctx.strokeStyle = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";
  ctx.lineWidth   = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(W - 1, 0); ctx.lineTo(W - 1, H); ctx.stroke();
  ctx.setLineDash([]);
}

/* Voltage labels on left axis ───────────────────────────────── */
function drawVoltageLabel(H, maxVoltage, isDark) {
  ctx.fillStyle = isDark ? COLORS.textDark : COLORS.textLight;
  ctx.font      = "10px 'JetBrains Mono', monospace";
  const pad = H * 0.12;
  ctx.fillText(`${maxVoltage}V`, 4, pad + 4);
  ctx.fillText("0V",            4, H - pad + 4);
}

/* Clear canvas to background ────────────────────────────────── */
function clearCanvas() {
  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  ctx.fillStyle = isDark ? "#060a12" : "#f1f5fb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/* ── Play / Pause button ─────────────────────────────────────── */
animPlayPause.addEventListener("click", () => {
  if (!animRunning) return;
  animPaused = !animPaused;
  animPlayPause.textContent = animPaused ? "▶ Play" : "⏸ Pause";

  if (!animPaused) {
    lastTs = null;   // reset delta to avoid time-jump on resume
    rafId = requestAnimationFrame(animFrame);
  }
});

/* ── Reset button ────────────────────────────────────────────── */
animReset.addEventListener("click", () => {
  if (!animParams) return;
  tSeconds = 0;
  fanAngle = 0;
  lastTs   = null;
  animPaused = false;
  animPlayPause.textContent = "⏸ Pause";
  clearCanvas();
  if (!rafId) rafId = requestAnimationFrame(animFrame);
});

/* ── Hook into generate flow: start animation after data arrives */
// We patch the existing generate handler to also call startAnimation.
// Store original reference, then wrap it.
const _originalGenerateClick = generateBtn.onclick;
generateBtn.addEventListener("click", () => {
  // After AJAX responds we need the params — watch for metric update as signal
});

/* Expose a hook called by the AJAX handler */
function onGenerateSuccess(data) {
  startAnimation({
    frequency:  data.frequency,
    dutyCycle:  data.duty_cycle,
    maxVoltage: data.max_voltage,
  });
}

/* ── Patch renderChart to also trigger animation ────────────── */
const _origRenderChart = renderChart;
// We reassign renderChart so that after Plotly renders, animation starts.
// The global renderChart is already called inside the fetch handler.
// Instead we hook into the fetch handler's `data` path via a global flag.

/* Simpler approach: add a MutationObserver on avgVoltage to know render done.
   Actually simplest: just call onGenerateSuccess from inside the fetch block.
   We do this by replacing the fetch callback section. Since the fetch is inside
   an async IIFE attached to generateBtn, we instead intercept via a custom event. */

document.addEventListener("pwmGenerated", (e) => {
  onGenerateSuccess(e.detail);
});

/* ── Resize handler ──────────────────────────────────────────── */
window.addEventListener("resize", () => {
  resizeCanvas();
  if (!animRunning || animPaused) clearCanvas();
});
