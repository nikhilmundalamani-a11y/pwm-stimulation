# ⚡ PWM Signal Simulator

A **college mini-project** Flask web app that simulates PWM (Pulse Width Modulation) signals with real-time waveform plotting, metric calculations, and hardware indicator visualizations.

---

## 📁 Project Structure

```
pwm_simulator/
├── app.py                 # Flask backend — waveform data generation
├── requirements.txt       # Python dependencies (just Flask)
├── templates/
│   └── index.html         # Single-page dashboard (HTML + Plotly)
└── static/
    ├── style.css          # Engineering dark/blue theme + responsive layout
    └── script.js          # AJAX, chart rendering, slider sync, download
```

---

## 🚀 Installation & Run

### Prerequisites
- Python 3.9 or higher

### Steps

```bash
# 1. Clone / download the project folder
cd pwm_simulator

# 2. (Optional but recommended) create a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the Flask development server
python app.py
```

Open your browser at **http://127.0.0.1:5000**

---

## 🎮 How to Use

1. Enter a **Frequency** (e.g. `1000` Hz)
2. Adjust the **Duty Cycle** slider or type a value (0–100%)
3. Set **Max Voltage** (e.g. `5` V for Arduino)
4. Click **Generate Waveform**
5. Read the calculated metrics:
   - Average Voltage, ON Time, OFF Time, Period
6. Observe the **LED Brightness** bar and **Motor Speed** gauge
7. Toggle **Dark / Light** mode with the top-right button
8. **Download PNG** saves the current chart as a high-res image

---

## 🔭 Future Scope

| Feature | Description |
|---|---|
| Arduino Integration | Export duty cycle & frequency values as an Arduino sketch via USB/Serial |
| Real-Time Hardware PWM | Stream slider updates to Arduino using PySerial — control a real LED or motor live |
| Oscilloscope Overlay | Capture ADC data from hardware and overlay on simulated waveform |
| Multi-Channel PWM | Simulate up to 6 independent channels (mirrors Arduino Timer0/1/2) |
| PWM-to-DAC Emulation | Visualise RC low-pass filter output beside the raw PWM signal |

---

## 📚 Technologies Used

| Layer | Technology |
|---|---|
| Backend | Python 3 + Flask |
| Frontend | HTML5 / CSS3 / Vanilla JS |
| Charts | Plotly.js 2.26 |
| Fonts | JetBrains Mono + Rajdhani (Google Fonts) |

---

*Built for educational demonstration — EE / ECE / CS Mini Project*
