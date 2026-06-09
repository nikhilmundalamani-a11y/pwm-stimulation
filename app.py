"""
PWM Signal Simulator — Flask Backend
=====================================
Handles waveform data generation for the frontend.
All heavy math lives here; the browser just renders.
"""

from flask import Flask, render_template, request, jsonify
import math

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Route: Main Page
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    """Serve the single-page dashboard."""
    return render_template("index.html")


# ---------------------------------------------------------------------------
# Route: Generate PWM Data (called via AJAX from the frontend)
# ---------------------------------------------------------------------------
@app.route("/generate", methods=["POST"])
def generate():
    """
    Accepts JSON with { frequency, duty_cycle, max_voltage }.
    Returns waveform data points + calculated metrics.
    """
    data = request.get_json()

    # --- Parse & Validate Inputs ---
    try:
        frequency   = float(data.get("frequency", 1))      # Hz
        duty_cycle  = float(data.get("duty_cycle", 50))     # 0–100 %
        max_voltage = float(data.get("max_voltage", 5))     # Volts
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid input values."}), 400

    # Clamp duty cycle to 0–100
    duty_cycle = max(0.0, min(100.0, duty_cycle))

    # Guard against zero/negative frequency
    if frequency <= 0:
        return jsonify({"error": "Frequency must be > 0 Hz."}), 400

    if max_voltage <= 0:
        return jsonify({"error": "Max voltage must be > 0 V."}), 400

    # --- Derived Metrics ---
    period      = 1.0 / frequency                           # seconds
    on_time     = period * (duty_cycle / 100.0)             # seconds
    off_time    = period - on_time                          # seconds
    avg_voltage = max_voltage * (duty_cycle / 100.0)        # Volts

    # --- LED Brightness Label ---
    if duty_cycle <= 30:
        led_label = "Dim"
        led_icon  = "🔅"
    elif duty_cycle <= 70:
        led_label = "Medium"
        led_icon  = "💡"
    else:
        led_label = "Bright"
        led_icon  = "🔆"

    # --- Motor Speed Label ---
    if duty_cycle <= 20:
        motor_label = "Stopped / Very Slow"
        motor_rpm   = int(duty_cycle * 35)
    elif duty_cycle <= 50:
        motor_label = "Slow"
        motor_rpm   = int(duty_cycle * 35)
    elif duty_cycle <= 75:
        motor_label = "Medium Speed"
        motor_rpm   = int(duty_cycle * 35)
    else:
        motor_label = "High Speed"
        motor_rpm   = int(duty_cycle * 35)

    # --- Waveform Data Generation ---
    # We render exactly 3 complete periods for a clean view.
    num_periods   = 3
    points_per_period = 500          # resolution per cycle
    total_points  = num_periods * points_per_period
    total_time    = num_periods * period

    time_values    = []
    voltage_values = []

    for i in range(total_points + 1):
        t = (i / total_points) * total_time
        # Position within the current period (0.0 – 1.0)
        phase = (t % period) / period

        v = max_voltage if phase < (duty_cycle / 100.0) else 0.0
        time_values.append(round(t * 1000, 4))      # convert s → ms
        voltage_values.append(round(v, 4))

    # Format time axis label
    def fmt_time(seconds):
        if seconds < 1e-3:
            return f"{seconds * 1e6:.2f} µs"
        elif seconds < 1:
            return f"{seconds * 1e3:.2f} ms"
        else:
            return f"{seconds:.4f} s"

    return jsonify({
        "time":         time_values,
        "voltage":      voltage_values,
        "period_ms":    round(period * 1000, 4),
        "on_time":      fmt_time(on_time),
        "off_time":     fmt_time(off_time),
        "avg_voltage":  round(avg_voltage, 3),
        "led_label":    led_label,
        "led_icon":     led_icon,
        "motor_label":  motor_label,
        "motor_rpm":    motor_rpm,
        "duty_cycle":   duty_cycle,
        "max_voltage":  max_voltage,
        "frequency":    frequency,
    })


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # debug=True → auto-reload on code changes (turn off in production)
    app.run(debug=True, port=5000)
