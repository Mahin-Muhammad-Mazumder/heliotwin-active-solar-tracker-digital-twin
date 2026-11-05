
# HelioTwin — Active Solar Tracker Digital Twin & Telemetry

[![Live Demo](https://img.shields.io/badge/Status-Production%20Ready-brightgreen.svg)](https://aistudio.google.com)
[![Tech Stack](https://img.shields.io/badge/Tech-React%20%7C%20Three.js%20%7C%20WebGL-blue.svg)](https://threejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> An industrial-grade, real-time 3D WebGL digital twin and simulation environment modeling a microcontroller-based active dual-axis solar tracking system.

---

## 🌟 Overview

**HelioTwin** is an interactive, high-fidelity engineering simulation built to visualize and analyze the real-time electromechanical behavior of an active dual-axis solar tracking rig versus a fixed passive baseline panel. Designed with accurate photovoltaic (PV) physics, 4-quadrant LDR (Light Dependent Resistor) sensor kinematics, servo-driven altitude/azimuth rotation, and an immersive dark boot sequence, this application serves as a comprehensive digital twin for embedded renewable energy systems.

---

## ✨ Key Features

*   **Real-Time 3D WebGL Simulation (`Three.js`):** Fully interactive 3D rendering featuring Rig A (Active Dual-Axis U-bracket assembly with servo kinematics) and Rig B (Fixed Passive Baseline panel) rendered at a locked 60 FPS using direct DOM reference updates (`useRef`).
*   **Dual-Axis Servo Kinematics:** Full $180^\circ$ azimuth base rotation ($yawGroup$ on Pin D2) mapped 1:1 with SG90 PWM signaling, paired with orthogonal elevation pitch control ($pitchGroup$ on Pin D13) tracking the sun across diurnal trajectories.
*   **4-Quadrant LDR ADC Closed-Loop Feedback:** Real-time sensor array voltage readouts ($A0–A3$) generating error differentials ($\Delta E$, $\Delta A$) to drive active sun-seeking orientation.
*   **Rigorous Photovoltaic Physics Engine (`SOLAR_CONSTANTS`):** Dynamic derivation of Open-Circuit Voltage ($V_{OC}$), Maximum Power Point Voltage ($V_{MP}$), Short-Circuit Current ($I_{SC}$), and instantaneous power using cosine incidence angle laws and logarithmic/linear irradiance scaling.
*   **Bounded Efficiency Gain Algorithm:** Mathematically bounded asymptotic saturation curve capping the active tracker's maximum efficiency boost at a realistic ceiling of $+90.0\%$ over passive baselines, while returning to $0.0\%$ parity at solar noon.
*   **Immersive Boot Sequence:** High-tech dark-themed initialization overlay ("SYSTEM ACTIVATING · DIGITAL TWIN BOOT") simulating hardware handshakes, LDR calibration, and solar ephemeris locking sequences before fading into the 3D scene.
*   **Live Telemetry HUD & Serial Monitor:** Collapsible telemetry panels, real-time power graphs, interactive time-multiplier scrubbing ($1\times, 2\times, 5\times$), cloud disruptor anomalies, and live Arduino-style serial logs.

---

## 🛠️ Technical Architecture & Stack

*   **Frontend Framework:** React, TypeScript, Tailwind CSS
*   **3D Graphics & Rendering:** Three.js (WebGL), custom shader/material hierarchies, direct DOM reference (`useRef`) performance optimizations
*   **Simulation Engine:** Custom definite-integral trapezoidal energy yield integrator ($Wh$) and solar ephemeris coordinate mapping

---

## 📊 Photovoltaic Physics & Constants

The simulation relies on a rigorous single-source-of-truth configuration model:

| Parameter | Symbol / Metric | Value / Spec |
| :--- | :--- | :--- |
| **Peak Rated Power (STC)** | $P_{max}$ | $20.0\text{ W}$ |
| **Open-Circuit Voltage** | $V_{OC}$ | $21.6\text{ V}$ |
| **Max Power Point Voltage** | $V_{MP}$ | $18.0\text{ V}$ |
| **Short-Circuit Current** | $I_{SC}$ | $1.22\text{ A}$ |
| **Max Power Point Current** | $I_{MP}$ | $1.11\text{ A}$ |
| **Diffuse Sky Fraction** | $\text{Diffuse}$ | $8\%$ |
| **Max Efficiency Ceiling** | $\text{Cap}$ | $90.0\%$ |

---

## 🚀 Getting Started & Local Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Mahin-Muhammad-Mazumder/heliotwin-active-solar-tracker-digital-twin.git
   cd heliotwin-active-solar-tracker-digital-twin
   ```

2. **Install dependencies:**
```bash
npm install
```

3. **Configure environment variables (optional):**
   ```bash
   copy .env.example .env.local
   ```
   Add your `GEMINI_API_KEY` if you are using the Gemini-powered features.

4. **Run the development server:**
```bash
npm run dev
```


5. **Build for production:**
```bash
npm run build
```



---

## 📂 Project Structure

```text
heliotwin-active-solar-tracker-digital-twin/
├── public/
│   └── index.html
├── app/
│   ├── layout.tsx          # Root layout and metadata
│   ├── page.tsx            # Application entry point
│   └── globals.css         # Global styles
├── components/
│   └── SolarTrackerApp.tsx # Core 3D scene, physics engine, and telemetry HUD
├── package.json
└── README.md

```

---

## 👤 Author & Maintainer

### **Mahin Muhammad Mazumder** `(M. Mahin)`
*Department of Electrical & Electronic Engineering (EEE)*  
🏛️ **University of Chittagong**

[![GitHub](https://img.shields.io/badge/GitHub-Profile-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/Mahin-Muhammad-Mazumder/)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/)
[![Email](https://img.shields.io/badge/Email-Contact-EA4335?style=flat-square&logo=gmail&logoColor=white)](mailto: [m.mazumder@cu.ac.bd])

> 🔬 **Engineering Focus:** Microcontroller-based embedded systems, closed-loop servo kinematics, photovoltaic telemetry instrumentation, and real-time 3D digital twin simulations for renewable energy infrastructure.

---

## 📜 License

This project is open-source and distributed under the **[MIT License](LICENSE)**.
