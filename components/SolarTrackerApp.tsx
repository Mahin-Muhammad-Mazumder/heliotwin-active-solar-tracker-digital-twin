'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Sun,
  CloudRain,
  Play,
  Pause,
  Eye,
  Terminal,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Hexagon,
  Download,
} from 'lucide-react';

// -----------------------------------------------------------------------------
// Types & Constants
// -----------------------------------------------------------------------------
export type SubsystemId = 'overview' | 'arduino' | 'ldrs' | 'servo' | 'pv';

const CAMERA_PRESETS: Record<
  SubsystemId,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  overview: { pos: [0.0, 6.2, 11.8], target: [0.0, 2.3, 0.0] },
  arduino: { pos: [-4.9, 3.0, 4.3], target: [-3.6, 1.55, 0.75] },
  ldrs: { pos: [-3.6, 5.2, 3.8], target: [-3.6, 3.65, 0.5] },
  servo: { pos: [-1.4, 3.6, 3.5], target: [-3.6, 2.65, 0.0] },
  pv: { pos: [0.0, 6.8, 8.8], target: [0.0, 2.8, 0.0] },
};

const BOOT_SEQUENCE_STEPS = [
  'INITIALIZING HELIOTWIN 3D WEBGL DIGITAL TWIN...',
  'CALIBRATING 4-QUADRANT LDR ARRAY (A0–A3 · 10kΩ BRIDGE)...',
  'HOMING DUAL-AXIS SG90 SERVOS (D2 YAW / D13 PITCH · 0°–180°)...',
  'LOCKING SOLAR EPHEMERIS & TELEMETRY STREAM...',
] as const;

// -----------------------------------------------------------------------------
// Procedural Canvas Textures (Zero External Assets / Zero 404s)
// -----------------------------------------------------------------------------
function createPVModuleTexture(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#061224';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cols = 10;
  const rows = 6;
  const padX = 12;
  const padY = 12;
  const gap = 4;
  const cellW = (canvas.width - padX * 2 - gap * (cols - 1)) / cols;
  const cellH = (canvas.height - padY * 2 - gap * (rows - 1)) / rows;

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = padX + c * (cellW + gap);
      const y = padY + r * (cellH + gap);

      ctx.fillStyle = '#0c2957';
      ctx.fillRect(x, y, cellW, cellH);

      ctx.fillStyle = 'rgba(203, 213, 225, 0.52)';
      ctx.fillRect(x + cellW * 0.28, y + 1, 1.2, cellH - 2);
      ctx.fillRect(x + cellW * 0.72, y + 1, 1.2, cellH - 2);
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;
  return { map };
}

function createBreadboardTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  // Clean white solderless breadboard body
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 256, 160);

  // Red & Blue power rail stripes
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(14, 10, 228, 2);
  ctx.fillRect(14, 148, 228, 2);
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(14, 22, 228, 2);
  ctx.fillRect(14, 136, 228, 2);

  // Center IC divider trench
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(10, 74, 236, 12);

  // Tie-point pin holes
  ctx.fillStyle = '#334155';
  for (let col = 18; col <= 238; col += 8) {
    for (let row = 32; row <= 66; row += 8) {
      ctx.fillRect(col, row, 3, 3);
    }
    for (let row = 92; row <= 126; row += 8) {
      ctx.fillRect(col, row, 3, 3);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createResistorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;

  // Beige 10kOhm axial resistor body
  ctx.fillStyle = '#e6ccb2';
  ctx.fillRect(0, 0, 128, 32);

  // 10kΩ color bands: Brown (1), Black (0), Orange (×1k), Gold (±5%)
  ctx.fillStyle = '#7f2b0a';
  ctx.fillRect(22, 0, 10, 32);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(46, 0, 10, 32);
  ctx.fillStyle = '#f97316';
  ctx.fillRect(70, 0, 10, 32);
  ctx.fillStyle = '#eab308';
  ctx.fillRect(100, 0, 8, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRealisticGroundTexture(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const baseGrad = ctx.createRadialGradient(512, 512, 40, 512, 512, 720);
  baseGrad.addColorStop(0, '#4d5d43');
  baseGrad.addColorStop(0.45, '#3f5238');
  baseGrad.addColorStop(0.85, '#4a4538');
  baseGrad.addColorStop(1, '#3b372d');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 4500; i++) {
    const x = rand() * 1024;
    const y = rand() * 1024;
    const r = 2 + rand() * 14;
    const tone = rand();
    if (tone < 0.45) {
      ctx.fillStyle = 'rgba(54, 78, 42, 0.18)';
    } else if (tone < 0.8) {
      ctx.fillStyle = 'rgba(92, 83, 62, 0.16)';
    } else {
      ctx.fillStyle = 'rgba(34, 49, 29, 0.20)';
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 12000; i++) {
    const x = rand() * 1024;
    const y = rand() * 1024;
    const sz = 1 + rand() * 2.2;
    ctx.fillStyle =
      rand() > 0.5 ? 'rgba(210, 198, 174, 0.16)' : 'rgba(28, 33, 24, 0.22)';
    ctx.fillRect(x, y, sz, sz);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(8, 8);
  map.anisotropy = maxAnisotropy;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const sz = 1 + rand() * 3;
    bCtx.fillStyle = rand() > 0.5 ? '#b8b8b8' : '#484848';
    bCtx.fillRect(x, y, sz, sz);
  }
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(10, 10);
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.32)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCompassRingTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 512);

  const cx = 256;
  const cy = 256;
  const outerR = 240;

  ctx.strokeStyle = 'rgba(9, 13, 22, 0.65)';
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR - 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.stroke();

  for (let deg = 0; deg < 360; deg += 10) {
    const rad = (deg * Math.PI) / 180;
    const isMajor = deg % 30 === 0;
    const r1 = outerR - (isMajor ? 12 : 6);
    const r2 = outerR;
    ctx.strokeStyle = isMajor
      ? 'rgba(255, 251, 235, 0.95)'
      : 'rgba(203, 213, 225, 0.55)';
    ctx.lineWidth = isMajor ? 2.5 : 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * r1, cy + Math.sin(rad) * r1);
    ctx.lineTo(cx + Math.cos(rad) * r2, cy + Math.sin(rad) * r2);
    ctx.stroke();
  }

  ctx.font = '700 15px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = 'rgba(9, 13, 22, 0.82)';
  ctx.fillRect(14, cy - 12, 108, 24);
  ctx.fillRect(390, cy - 12, 108, 24);
  ctx.fillRect(cx - 115, 456, 230, 24);

  ctx.fillStyle = '#00F0FF';
  ctx.fillText('EAST · 06:00', 68, cy);

  ctx.fillStyle = '#F59E0B';
  ctx.fillText('WEST · 18:00', 444, cy);

  ctx.fillStyle = '#F8FAFC';
  ctx.fillText('SOLAR AZIMUTH · 12:00 NOON', cx, 468);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

// -----------------------------------------------------------------------------
// Prime Base Physical Constants (Single Source of Truth)
// -----------------------------------------------------------------------------
const SOLAR_CONSTANTS = {
  // Prototype Panel Rated Specs (Single Rig A & Rig B)
  P_MAX_STC: 20.0, // 20W Peak Rated Power at Standard Test Conditions (1000 W/m²)
  V_OC: 21.6, // Open-Circuit Voltage in Volts
  V_MP: 18.0, // Maximum Power Point Voltage in Volts
  I_SC: 1.22, // Short-Circuit Current in Amps
  I_MP: 1.11, // Maximum Power Point Current in Amps (18.0 V × 1.11 A = 20.0 W)
  DIFFUSE_FRACTION: 0.08, // 8% ambient sky diffuse irradiance baseline during daylight hours
  MAX_EFFICIENCY_GAIN_PCT: 90.0, // Strict 90.0% ceiling on active vs. passive efficiency boost
} as const;

interface DerivedSolarTelemetry {
  alpha: number;
  gAtm: number;
  etaAct: number;
  etaPas: number;
  vAct: number;
  vPas: number;
  iAct: number;
  iPas: number;
  pAct: number;
  pPas: number;
}

/**
 * Bounded Efficiency Gain Algorithm (Max 90.0% Ceiling):
 * Computes real-time active vs. passive efficiency gain (%) using a smooth
 * rational-asymptotic saturation curve that equals +0.0% at solar noon (P_act === P_pas)
 * and smoothly approaches the 90.0% ceiling during extreme oblique morning/evening angles
 * without ever exceeding 90.0%.
 */
function computeBoundedEfficiencyGainPct(pAct: number, pPas: number): number {
  if (pAct <= pPas || pPas <= 0.001) return 0.0;
  const rawGainPct = ((pAct - pPas) / pPas) * 100.0;
  const ceiling = SOLAR_CONSTANTS.MAX_EFFICIENCY_GAIN_PCT; // 90.0%
  const exponent = 3.2;
  const asymptoticGain =
    (rawGainPct * ceiling) /
    Math.pow(
      Math.pow(rawGainPct, exponent) + Math.pow(ceiling, exponent),
      1.0 / exponent
    );
  return Math.min(ceiling, Math.max(0.0, asymptoticGain));
}

/**
 * Step-by-step photovoltaic physics derivation at solar hour t ∈ [6.0, 18.0]
 * from SOLAR_CONSTANTS with exact symmetric solar noon parity (P_act = P_pas at t = 12.0)
 * and bounded oblique-angle divergence (< 90.0% max gain).
 */
function deriveSolarPhysicsAtTime(
  t: number,
  cloudCover = 0,
  trackErrRad = 0
): DerivedSolarTelemetry {
  const clampedT = THREE.MathUtils.clamp(t, 6.0, 18.0);
  // 1. Atmospheric Solar Irradiance Factor (G_atm ∈ [0, 1]), symmetric around t = 12.0 (alpha = 1.0 at noon)
  const alpha = Math.max(0, Math.sin(((clampedT - 6.0) / 12.0) * Math.PI));
  const cloudAttenuation = 1.0 - cloudCover * 0.62;
  const gAtm =
    Math.max(0, 0.25 + 0.75 * Math.pow(alpha, 0.38)) * cloudAttenuation;

  // 2. Symmetric Cosine Law of Incidence (cos θ_act = cos θ_pas = 1.0 at t = 12.0 solar noon)
  const dayProgress = (clampedT - 12.0) / 6.0; // -1.0 at 06:00, 0.0 at 12:00, +1.0 at 18:00
  const hourAngleRad = dayProgress * (Math.PI * 0.5);

  // Fixed Passive Panel (Rig B): normal to the sun at solar noon (t = 12.0 -> cosThetaPas = 1.0),
  // smoothly tapering to 0.51 at morning/evening horizons so efficiency boost approaches 90.0% max
  const cosThetaPas = 0.51 + 0.49 * Math.pow(Math.cos(hourAngleRad), 1.25);

  // Active Dual-Axis Tracker (Rig A): tracks sun orthogonally across the day (cos θ_act = 1.0 when locked)
  const cosThetaAct =
    trackErrRad > 0.05 ? Math.max(0, Math.cos(trackErrRad)) : 1.0;

  const directWeight = 1.0 - SOLAR_CONSTANTS.DIFFUSE_FRACTION;
  const etaAct = THREE.MathUtils.clamp(
    (directWeight * cosThetaAct + SOLAR_CONSTANTS.DIFFUSE_FRACTION) * gAtm,
    0.0,
    1.0
  );
  const etaPas = THREE.MathUtils.clamp(
    (directWeight * cosThetaPas + SOLAR_CONSTANTS.DIFFUSE_FRACTION) * gAtm,
    0.0,
    1.0
  );

  // 3. Logarithmic Voltage Derivation: V = V_MP * (0.72 + 0.28 * ln(1 + 9*eta) / ln(10))
  const computeLogVoltage = (eta: number): number => {
    if (eta <= 0.0001) return 0;
    const vRaw =
      SOLAR_CONSTANTS.V_MP *
      (0.72 + (0.28 * Math.log(1 + 9 * eta)) / Math.LN10);
    const lowIrradianceRamp = eta < 0.01 ? eta / 0.01 : 1.0;
    return Math.round(vRaw * lowIrradianceRamp * 10) / 10;
  };

  const vAct = computeLogVoltage(etaAct);
  const vPas = computeLogVoltage(etaPas);

  // 4. Linear Current Derivation: I = I_MP * eta
  const iAct = Math.round(SOLAR_CONSTANTS.I_MP * etaAct * 100) / 100;
  const iPas = Math.round(SOLAR_CONSTANTS.I_MP * etaPas * 100) / 100;

  // 5. Exact Ohm/Watt Power Law: P = round(V, 1) * round(I, 2)
  const pAct = Number((vAct * iAct).toFixed(2));
  const pPas = Number((vPas * iPas).toFixed(2));

  return {
    alpha,
    gAtm,
    etaAct,
    etaPas,
    vAct,
    vPas,
    iAct,
    iPas,
    pAct,
    pPas,
  };
}

// -----------------------------------------------------------------------------
// Daily Curve Pre-Computation (Derived 1:1 from Prime Base Constants)
// -----------------------------------------------------------------------------
const CHART_SAMPLES = 49;
const CHART_ACTIVE_BASELINE: number[] = [];
const CHART_PASSIVE_BASELINE: number[] = [];

for (let i = 0; i < CHART_SAMPLES; i++) {
  const h = 6 + (i / (CHART_SAMPLES - 1)) * 12;
  const { pAct, pPas } = deriveSolarPhysicsAtTime(h, 0);
  CHART_PASSIVE_BASELINE.push(pPas);
  CHART_ACTIVE_BASELINE.push(pAct);
}

/**
 * 6. Definite Integral Energy Yield (Wh) from sunrise (06:00) to solar hour t
 */
function computeCumulativeEnergyUpTo(
  timeOfDay: number,
  cloudCover = 0
): {
  activeWh: number;
  passiveWh: number;
} {
  let activeWh = 0;
  let passiveWh = 0;
  const dt = 0.05;
  const targetT = THREE.MathUtils.clamp(timeOfDay, 6.0, 18.0);

  for (let tau = 6.0; tau < targetT; tau += dt) {
    const step = Math.min(dt, targetT - tau);
    const { pAct, pPas } = deriveSolarPhysicsAtTime(
      tau + step * 0.5,
      cloudCover
    );
    activeWh += pAct * step;
    passiveWh += pPas * step;
  }

  return {
    activeWh: Math.max(0.1, activeWh),
    passiveWh: Math.max(0.1, passiveWh),
  };
}

function formatSolarTime(hoursFloat: number): string {
  const totalMinutes = Math.round(hoursFloat * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

const LABEL_CONFIGS = [
  {
    id: 'lbl-arduino',
    title: 'Arduino UNO + 4× 10kΩ Breadboard (A0–A3)',
    accent: 'cyan' as const,
  },
  {
    id: 'lbl-ldr',
    title: '4-Quadrant Cross-Baffle LDR Array',
    accent: 'cyan' as const,
  },
  {
    id: 'lbl-servo-yaw',
    title: 'Base Yaw SG90 Servo (Pin D2 · 0°–180°)',
    accent: 'cyan' as const,
  },
  {
    id: 'lbl-servo-pitch',
    title: 'U-Bracket Pitch SG90 Servo (Pin D13 · 0°–180°)',
    accent: 'cyan' as const,
  },
  {
    id: 'lbl-passive-pv',
    title: 'Rig B · Fixed Baseline (0°)',
    accent: 'amber' as const,
  },
];

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
export default function SolarTrackerApp() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Direct DOM Refs for zero-lag, zero-re-render telemetry updates
  const timeSliderRef = useRef<HTMLInputElement | null>(null);
  const timeTextRef = useRef<HTMLSpanElement | null>(null);
  const sunDegTextRef = useRef<HTMLSpanElement | null>(null);

  // Right Telemetry Panel DOM Refs
  const netGainRef = useRef<HTMLDivElement | null>(null);
  const activeWattRef = useRef<HTMLSpanElement | null>(null);
  const passiveWattRef = useRef<HTMLSpanElement | null>(null);
  const activeVoltRef = useRef<HTMLSpanElement | null>(null);
  const passiveVoltRef = useRef<HTMLSpanElement | null>(null);
  const activeAmpRef = useRef<HTMLSpanElement | null>(null);
  const passiveAmpRef = useRef<HTMLSpanElement | null>(null);
  const activeWhRef = useRef<HTMLSpanElement | null>(null);
  const passiveWhRef = useRef<HTMLSpanElement | null>(null);

  const footerSunAngleRef = useRef<HTMLSpanElement | null>(null);
  const footerPanelAngleRef = useRef<HTMLSpanElement | null>(null);
  const footerDevAngleRef = useRef<HTMLSpanElement | null>(null);

  const serialContainerRef = useRef<HTMLDivElement | null>(null);

  const labelDomRefs = useRef<(HTMLDivElement | null)[]>([]);
  const labelMetricRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Dark Solar System Activation / Boot Loading Screen State
  const [bootProgress, setBootProgress] = useState<number>(0);
  const [bootFading, setBootFading] = useState<boolean>(false);
  const [bootDismissed, setBootDismissed] = useState<boolean>(false);

  // Low-frequency UI mode state
  const [selectedSubsystem, setSelectedSubsystem] =
    useState<SubsystemId>('overview');
  const [autoCycle, setAutoCycle] = useState<boolean>(true);
  const [cycleSpeed, setCycleSpeed] = useState<1 | 2 | 5>(1);
  const [xrayLabels, setXrayLabels] = useState<boolean>(true);
  const [cloudActive, setCloudActive] = useState<boolean>(false);
  const [serialExpanded, setSerialExpanded] = useState<boolean>(true);
  const [hudCollapsed, setHudCollapsed] = useState<boolean>(false);

  // Click-to-Minimize / Restore state for POWER TELEMETRY HUD Box Header
  const [telemetryMinimized, setTelemetryMinimized] = useState<boolean>(false);

  useEffect(() => {
    const startTime = performance.now();
    const durationMs = 1750;
    let raf = 0;
    let fadeTimer = 0;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));
      setBootProgress(pct);
      if (pct < 100) {
        raf = requestAnimationFrame(step);
      } else {
        setBootFading(true);
        fadeTimer = window.setTimeout(() => {
          setBootDismissed(true);
        }, 550);
      }
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fadeTimer);
    };
  }, []);

  const simRef = useRef({
    timeOfDay: 10.25,
    autoCycle: true,
    cycleSpeed: 1 as 1 | 2 | 5,
    servoYawPWM: 64, // Strictly 0° to 180° full sweep (Pin D2: 90° = 0° center)
    servoPitchPWM: 116, // Strictly 15° to 165° within 0°–180° SG90 limit (Pin D13)
    panelTiltDeg: 26.0,
    panelYawDeg: -26.2,
    cloudTarget: 0,
    cloudCurrent: 0,
    xrayLabels: true,
    hudCollapsed: false,
    cameraPresetActive: false,
    desiredCamPos: new THREE.Vector3(...CAMERA_PRESETS.overview.pos),
    desiredCamTarget: new THREE.Vector3(...CAMERA_PRESETS.overview.target),
    serialLogs: [
      '[10:15:00] BOOT: Arduino UNO R3 Dual-Axis 4-LDR Gimbal Tracker (SG90 0°-180° Full Sweep)',
      '[10:15:01] A0:892 A1:890 A2:888 A3:891 (ΔE:+2 ΔA:-1) | D2_YAW: 64° | D13_PITCH: 116° | PWR: 19.62W (+10.8%)',
    ],
  });

  useEffect(() => {
    simRef.current.autoCycle = autoCycle;
  }, [autoCycle]);

  useEffect(() => {
    simRef.current.cycleSpeed = cycleSpeed;
  }, [cycleSpeed]);

  useEffect(() => {
    simRef.current.xrayLabels = xrayLabels;
  }, [xrayLabels]);

  useEffect(() => {
    simRef.current.hudCollapsed = hudCollapsed;
  }, [hudCollapsed]);

  useEffect(() => {
    simRef.current.cloudTarget = cloudActive ? 0.58 : 0.0;
  }, [cloudActive]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === 'h' &&
        document.activeElement?.tagName !== 'INPUT'
      ) {
        setHudCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSelectSubsystem = useCallback((id: SubsystemId) => {
    setSelectedSubsystem(id);
    const preset = CAMERA_PRESETS[id] || CAMERA_PRESETS.overview;
    simRef.current.desiredCamPos.set(...preset.pos);
    simRef.current.desiredCamTarget.set(...preset.target);
    simRef.current.cameraPresetActive = true;
  }, []);

  const handleTimeScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      simRef.current.timeOfDay = parseFloat(e.target.value);
    },
    []
  );

  const handleTriggerCloud = useCallback(() => {
    setCloudActive((prev) => !prev);
  }, []);

  const handleDownloadStandaloneHtml = useCallback(async () => {
    try {
      const res = await fetch('/index.html');
      const htmlText = await res.text();
      const blob = new Blob([htmlText], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'index.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Ignored
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Chart Canvas Drawing Helper
  // ---------------------------------------------------------------------------
  const drawTelemetryChart = useCallback(
    (timeOfDay: number, activePowerW: number, cloudFactor: number) => {
      const canvas = chartCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth || 320;
      const height = canvas.clientHeight || 135;
      const targetW = Math.round(width * dpr);
      const targetH = Math.round(height * dpr);

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const padLeft = 24;
      const padRight = 10;
      const padTop = 10;
      const padBottom = 22;
      const plotW = width - padLeft - padRight;
      const plotH = height - padTop - padBottom;

      // Grid lines & Y-axis ticks: 0, 5, 10, 15, 22
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.10)';
      ctx.lineWidth = 1;
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      [0, 5, 10, 15, 22].forEach((watt) => {
        const y = padTop + plotH - (watt / 22) * plotH;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(width - padRight, y);
        ctx.stroke();
        ctx.fillText(`${watt}`, padLeft - 6, y);
      });

      // Vertical grid lines & X-axis labels: 06:00, 07:45, 09:30, 11:15, 13:00, 14:45, 16:30
      const xTicks = [
        { h: 6.0, label: '06:00' },
        { h: 7.75, label: '07:45' },
        { h: 9.5, label: '09:30' },
        { h: 11.25, label: '11:15' },
        { h: 13.0, label: '13:00' },
        { h: 14.75, label: '14:45' },
        { h: 16.5, label: '16:30' },
      ];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      xTicks.forEach(({ h, label }) => {
        const x = padLeft + ((h - 6) / 12) * plotW;
        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, padTop + plotH);
        ctx.stroke();
        ctx.fillText(label, x, height - padBottom + 6);
      });

      const getXY = (idx: number, wattVal: number) => {
        const x = padLeft + (idx / (CHART_SAMPLES - 1)) * plotW;
        const y = padTop + plotH - (wattVal / 22) * plotH;
        return { x, y };
      };

      // 1. Fixed Passive Curve (Amber Bell Curve derived from V_pas(t) * I_pas(t))
      ctx.beginPath();
      for (let i = 0; i < CHART_SAMPLES; i++) {
        const h = 6 + (i / (CHART_SAMPLES - 1)) * 12;
        const pPasSample =
          cloudFactor > 0.001
            ? deriveSolarPhysicsAtTime(h, cloudFactor).pPas
            : CHART_PASSIVE_BASELINE[i];
        const { x, y } = getXY(i, pPasSample);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.lineTo(padLeft + plotW, padTop + plotH);
      ctx.lineTo(padLeft, padTop + plotH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
      ctx.fill();

      // 2. Active Tracker Curve (Cyan Plateau Curve derived from V_act(t) * I_act(t))
      ctx.beginPath();
      for (let i = 0; i < CHART_SAMPLES; i++) {
        const h = 6 + (i / (CHART_SAMPLES - 1)) * 12;
        const pActSample =
          cloudFactor > 0.001
            ? deriveSolarPhysicsAtTime(h, cloudFactor).pAct
            : CHART_ACTIVE_BASELINE[i];
        const { x, y } = getXY(i, pActSample);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#00F0FF';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.lineTo(padLeft + plotW, padTop + plotH);
      ctx.lineTo(padLeft, padTop + plotH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
      ctx.fill();

      // 3. Cyan Dashed Vertical Time Indicator + Glowing Cyan Dot at Active Curve
      const timeProgress = Math.max(0, Math.min(1, (timeOfDay - 6) / 12));
      const curX = padLeft + timeProgress * plotW;
      const actY = padTop + plotH - (activePowerW / 22) * plotH;

      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#00F0FF';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(curX, actY);
      ctx.lineTo(curX, padTop + plotH);
      ctx.stroke();
      ctx.restore();

      // Glowing outer halo + solid cyan dot
      ctx.fillStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.beginPath();
      ctx.arc(curX, actY, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#00F0FF';
      ctx.beginPath();
      ctx.arc(curX, actY, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    },
    []
  );

  // Redraw chart immediately when POWER TELEMETRY box is restored from minimized state
  useEffect(() => {
    if (!telemetryMinimized && !hudCollapsed) {
      const id = requestAnimationFrame(() => {
        drawTelemetryChart(
          simRef.current.timeOfDay,
          19.6 * (1 - simRef.current.cloudCurrent * 0.62),
          simRef.current.cloudCurrent
        );
      });
      return () => cancelAnimationFrame(id);
    }
  }, [telemetryMinimized, hudCollapsed, drawTelemetryChart]);

  // ---------------------------------------------------------------------------
  // Three.js WebGL Digital Twin Initialization & 60FPS Loop
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.75)
    );
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => e.preventDefault();
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    const scene = new THREE.Scene();
    const horizonFogColor = new THREE.Color(0x8ec5fc);
    scene.background = horizonFogColor;
    scene.fog = new THREE.FogExp2(0x8ec5fc, 0.009);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      180
    );
    camera.position.set(...CAMERA_PRESETS.overview.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_PRESETS.overview.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minDistance = 2.4;
    controls.maxDistance = 30;
    controls.update();

    const onControlsStart = () => {
      simRef.current.cameraPresetActive = false;
    };
    controls.addEventListener('start', onControlsStart);

    // -------------------------------------------------------------------------
    // 1. Realistic Dynamic Atmospheric Sky Dome
    // -------------------------------------------------------------------------
    const skyUniforms = {
      uSunDir: { value: new THREE.Vector3(-0.4, 0.85, 0.15).normalize() },
      uTime: { value: 0 },
      uCloudCover: { value: 0 },
    };

    const skyMat = new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        uniform vec3 uSunDir;
        uniform float uTime;
        uniform float uCloudCover;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float fbm(vec2 p) {
          float v = 0.0;
          v += 0.50 * noise(p); p *= 2.02;
          v += 0.25 * noise(p); p *= 2.03;
          v += 0.125 * noise(p);
          return v;
        }

        void main() {
          vec3 dir = normalize(vWorldPos);
          float y = max(0.0, dir.y);
          float sunElev = clamp(uSunDir.y, 0.0, 1.0);

          vec3 dayZenith = vec3(0.07, 0.28, 0.68);
          vec3 dayHorizon = vec3(0.58, 0.80, 0.96);

          vec3 duskZenith = vec3(0.10, 0.16, 0.36);
          vec3 duskHorizon = vec3(0.95, 0.52, 0.24);

          float dayWeight = smoothstep(0.15, 0.65, sunElev);
          vec3 zenithCol = mix(duskZenith, dayZenith, dayWeight);
          vec3 horizonCol = mix(duskHorizon, dayHorizon, dayWeight);

          float horizonFactor = pow(1.0 - y, 2.6);
          vec3 skyCol = mix(zenithCol, horizonCol, horizonFactor);

          float sunDot = max(0.0, dot(dir, uSunDir));
          float mieHalo = pow(sunDot, 8.0) * 0.42 + pow(sunDot, 64.0) * 0.85;
          vec3 sunGlowCol = mix(vec3(1.0, 0.55, 0.18), vec3(1.0, 0.95, 0.80), dayWeight);
          skyCol += sunGlowCol * mieHalo;

          if (dir.y > 0.04) {
            vec2 cloudUv = dir.xz / (dir.y + 0.18) * 1.4 + vec2(uTime * 0.015, 0.0);
            float c = fbm(cloudUv);
            float threshold = mix(0.52, 0.28, uCloudCover);
            float cloudAlpha = smoothstep(threshold, threshold + 0.28, c) * smoothstep(0.04, 0.22, dir.y);
            vec3 cloudCol = mix(vec3(0.98, 0.99, 1.0), vec3(0.55, 0.60, 0.68), uCloudCover);
            cloudCol = mix(vec3(1.0, 0.72, 0.45), cloudCol, dayWeight);
            skyCol = mix(skyCol, cloudCol, cloudAlpha * 0.65);
          }

          skyCol *= (1.0 - uCloudCover * 0.28);

          gl_FragColor = vec4(skyCol, 1.0);
        }
      `,
    });

    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(110, 40, 24),
      skyMat
    );
    scene.add(skyDome);

    // Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x4d5d43, 0.95);
    hemiLight.position.set(0, 25, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff6e0, 2.8);
    sunLight.position.set(-8, 9, 2.5);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    const d = 10;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 32;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0xbae6fd, 0.5);
    rimLight.position.set(0, 6, -10);
    scene.add(rimLight);

    // Shared Procedural Textures & Materials
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const { map: pvMap } = createPVModuleTexture(maxAnisotropy);
    const breadboardTex = createBreadboardTexture(maxAnisotropy);
    const resistorTex = createResistorTexture();
    const { map: groundMap, bumpMap: groundBumpMap } =
      createRealisticGroundTexture(maxAnisotropy);
    const contactShadowTex = createContactShadowTexture();
    const compassTex = createCompassRingTexture(maxAnisotropy);

    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.82,
      roughness: 0.34,
    });
    const brushedAluminumMat = new THREE.MeshStandardMaterial({
      color: 0xdbeafe,
      metalness: 0.85,
      roughness: 0.22,
    });
    const castIronBaseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.65,
      roughness: 0.52,
    });
    const concretePadMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.08,
      roughness: 0.85,
    });
    const whitePvcMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.08,
      roughness: 0.32,
    });
    const servoHornWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.05,
      roughness: 0.25,
    });
    const sg90BlueMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.15,
      roughness: 0.18,
      transparent: true,
      opacity: 0.88,
    });
    const brassPinMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.82,
      roughness: 0.28,
    });
    const pvSurfaceMat = new THREE.MeshStandardMaterial({
      map: pvMap,
      metalness: 0.25,
      roughness: 0.16,
    });
    const arduinoPcbMat = new THREE.MeshStandardMaterial({
      color: 0x008184,
      metalness: 0.28,
      roughness: 0.4,
    });
    const icChipMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.2,
      roughness: 0.55,
    });

    // 2. Realistic Outdoor Ground Terrain
    const terrainGeo = new THREE.PlaneGeometry(160, 160, 64, 64);
    const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const dist = Math.sqrt(vx * vx + vy * vy);
      if (dist > 13.0) {
        const edgeFactor = Math.min(1.0, (dist - 13.0) / 28.0);
        const h =
          (Math.sin(vx * 0.09) * Math.cos(vy * 0.09) * 2.4 +
            Math.sin(vx * 0.22 + 1.3) * 0.75 +
            1.2) *
          edgeFactor;
        posAttr.setZ(i, Math.max(0, h));
      }
    }
    terrainGeo.computeVertexNormals();

    const groundMesh = new THREE.Mesh(
      terrainGeo,
      new THREE.MeshStandardMaterial({
        map: groundMap,
        bumpMap: groundBumpMap,
        bumpScale: 0.06,
        roughness: 0.9,
        metalness: 0.04,
      })
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    [-3.6, 3.6].forEach((rx) => {
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(3.8, 0.08, 3.8),
        concretePadMat
      );
      pad.position.set(rx, 0.04, 0);
      pad.receiveShadow = true;
      pad.castShadow = true;
      scene.add(pad);
    });

    const rockGeo = new THREE.DodecahedronGeometry(0.45, 1);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x57534e,
      roughness: 0.88,
      metalness: 0.05,
    });
    const rockInstances = new THREE.InstancedMesh(rockGeo, rockMat, 28);
    const _dummy = new THREE.Object3D();
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2;
      const rad = 11.8 + (i % 5) * 2.2;
      _dummy.position.set(Math.cos(ang) * rad, 0.12, Math.sin(ang) * rad);
      _dummy.rotation.set(i * 0.7, i * 1.1, 0);
      const s = 0.5 + (i % 4) * 0.32;
      _dummy.scale.set(s * 1.2, s * 0.65, s);
      _dummy.updateMatrix();
      rockInstances.setMatrixAt(i, _dummy.matrix);
    }
    rockInstances.castShadow = true;
    rockInstances.receiveShadow = true;
    rockInstances.computeBoundingSphere();
    scene.add(rockInstances);

    const compassPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(21, 21),
      new THREE.MeshBasicMaterial({
        map: compassTex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    compassPlane.rotation.x = -Math.PI / 2;
    compassPlane.position.y = 0.03;
    scene.add(compassPlane);

    const SOLAR_ARC_RADIUS = 10.2;
    const arcPoints: THREE.Vector3[] = [];
    for (let azDeg = -90; azDeg <= 90; azDeg += 3) {
      const azRad = THREE.MathUtils.degToRad(azDeg);
      const elevDeg = 20.0 + 48.0 * Math.cos(azRad);
      const elevRad = THREE.MathUtils.degToRad(elevDeg);
      const horizR = SOLAR_ARC_RADIUS * Math.cos(elevRad);
      arcPoints.push(
        new THREE.Vector3(
          Math.sin(azRad) * horizR,
          Math.sin(elevRad) * SOLAR_ARC_RADIUS,
          Math.cos(azRad) * horizR
        )
      );
    }
    const arcCurve = new THREE.CatmullRomCurve3(arcPoints);
    scene.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(arcCurve, 48, 0.032, 8, false),
        new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.65,
        })
      )
    );

    const sunGroup = new THREE.Group();
    sunGroup.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      ),
      new THREE.Mesh(
        new THREE.SphereGeometry(0.95, 24, 24),
        new THREE.MeshBasicMaterial({
          color: 0xfde047,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        })
      ),
      new THREE.Mesh(
        new THREE.SphereGeometry(1.55, 24, 24),
        new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
        })
      )
    );
    scene.add(sunGroup);

    const cloudGroup = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.9,
      metalness: 0.05,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    const puffOffsets: [number, number, number, number][] = [
      [0, 0, 0, 0.95],
      [-0.85, -0.12, 0.2, 0.72],
      [0.85, -0.08, -0.15, 0.78],
      [-0.35, 0.32, -0.25, 0.65],
      [0.4, 0.28, 0.25, 0.68],
    ];
    puffOffsets.forEach(([px, py, pz, r]) => {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(r, 12, 12),
        cloudMat
      );
      puff.position.set(px, py, pz);
      cloudGroup.add(puff);
    });
    cloudGroup.visible = false;
    scene.add(cloudGroup);

    function createPVPanelAssembly(): THREE.Group {
      const panelRoot = new THREE.Group();
      const panelW = 2.85;
      const panelD = 1.9;
      const panelT = 0.08;

      const frameBody = new THREE.Mesh(
        new THREE.BoxGeometry(panelW, panelT, panelD),
        brushedAluminumMat
      );
      frameBody.position.y = 0.06;
      frameBody.castShadow = true;
      frameBody.receiveShadow = true;
      panelRoot.add(frameBody);

      const pvFace = new THREE.Mesh(
        new THREE.BoxGeometry(panelW - 0.14, 0.025, panelD - 0.14),
        pvSurfaceMat
      );
      pvFace.position.y = 0.105;
      pvFace.receiveShadow = true;
      panelRoot.add(pvFace);

      return panelRoot;
    }

    // Helper to build a translucent-blue TowerPro SG90 Micro Servo mesh
    function createSG90ServoMesh(): THREE.Group {
      const sg90 = new THREE.Group();
      // Main blue body
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.42, 0.24),
        sg90BlueMat
      );
      body.castShadow = true;
      sg90.add(body);

      // Side mounting tabs/ears
      const tabs = new THREE.Mesh(
        new THREE.BoxGeometry(0.64, 0.05, 0.24),
        sg90BlueMat
      );
      tabs.position.y = 0.08;
      sg90.add(tabs);

      // Top gearbox boss cylinder
      const gearBoss = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 0.08, 16),
        sg90BlueMat
      );
      gearBoss.position.set(0.1, 0.24, 0);
      sg90.add(gearBoss);

      // Brass output spline
      const spline = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.06, 12),
        brassPinMat
      );
      spline.position.set(0.1, 0.3, 0);
      sg90.add(spline);

      return sg90;
    }

    // Helper to build 3D curved jumper wires on the prototype base deck
    function addJumperWire(
      parent: THREE.Group,
      pStart: [number, number, number],
      pMid: [number, number, number],
      pEnd: [number, number, number],
      hexColor: number
    ) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(...pStart),
        new THREE.Vector3(...pMid),
        new THREE.Vector3(...pEnd),
      ]);
      const wireMesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 16, 0.014, 6, false),
        new THREE.MeshStandardMaterial({
          color: hexColor,
          roughness: 0.35,
          metalness: 0.1,
        })
      );
      wireMesh.castShadow = true;
      parent.add(wireMesh);
    }

    // =========================================================================
    // RIG A: Dual-Axis Arduino UNO + Breadboard + U-Bracket SG90 Gimbal Prototype
    // =========================================================================
    const activeRig = new THREE.Group();
    activeRig.position.set(-3.6, 0.08, 0);
    scene.add(activeRig);

    const activeShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 4.2),
      new THREE.MeshBasicMaterial({
        map: contactShadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.65,
      })
    );
    activeShadow.rotation.x = -Math.PI / 2;
    activeShadow.position.y = 0.01;
    activeRig.add(activeShadow);

    // Support pedestal bringing the prototype deck to ideal tabletop height (y = 1.35)
    const protoStandBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 1.05, 0.2, 16),
      castIronBaseMat
    );
    protoStandBase.position.y = 0.1;
    protoStandBase.castShadow = true;
    activeRig.add(protoStandBase);

    const protoStandPillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.26, 1.2, 16),
      darkSteelMat
    );
    protoStandPillar.position.y = 0.75;
    protoStandPillar.castShadow = true;
    activeRig.add(protoStandPillar);

    // 1. White PVC / Acrylic Rectangular Base Platform beneath Rig A
    const deckGroup = new THREE.Group();
    deckGroup.position.set(0, 1.38, 0);
    activeRig.add(deckGroup);

    const whiteBasePlate = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.12, 2.85),
      whitePvcMat
    );
    whiteBasePlate.castShadow = true;
    whiteBasePlate.receiveShadow = true;
    deckGroup.add(whiteBasePlate);

    // Corner rubber feet under the PVC base plate
    [
      [-1.5, -0.08, -1.25],
      [1.5, -0.08, -1.25],
      [-1.5, -0.08, 1.25],
      [1.5, -0.08, 1.25],
    ].forEach(([fx, fy, fz]) => {
      const foot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12),
        icChipMat
      );
      foot.position.set(fx, fy, fz);
      deckGroup.add(foot);
    });

    // 2. Detailed Arduino UNO R3 on Front-Left of Base Plate
    const arduinoUno = new THREE.Group();
    arduinoUno.position.set(-0.82, 0.09, 0.76);
    deckGroup.add(arduinoUno);

    const unoPcb = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.04, 0.76),
      arduinoPcbMat
    );
    unoPcb.castShadow = true;
    arduinoUno.add(unoPcb);

    // Silver USB-B Port
    const usbPort = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.16, 0.18),
      brushedAluminumMat
    );
    usbPort.position.set(-0.46, 0.09, -0.18);
    arduinoUno.add(usbPort);

    // Black DC Barrel Jack
    const dcJack = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.16, 0.16),
      icChipMat
    );
    dcJack.position.set(-0.44, 0.09, 0.22);
    arduinoUno.add(dcJack);

    // ATmega328P DIP-28 Microcontroller IC
    const atmegaChip = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.06, 0.14),
      icChipMat
    );
    atmegaChip.position.set(0.14, 0.04, 0.12);
    arduinoUno.add(atmegaChip);

    // Female Pin Header Banks (Digital D0-D13 & Analog A0-A5 + Power)
    const digitalHeader = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.09, 0.06),
      icChipMat
    );
    digitalHeader.position.set(0.08, 0.06, -0.32);
    arduinoUno.add(digitalHeader);

    const analogHeader = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.09, 0.06),
      icChipMat
    );
    analogHeader.position.set(0.08, 0.06, 0.32);
    arduinoUno.add(analogHeader);

    // Blinking RX/TX/ON LEDs on Arduino UNO
    const rxLedMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 2.2,
    });
    const txLedMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 2.0,
    });
    const rxLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 8, 8),
      rxLedMat
    );
    rxLed.position.set(-0.12, 0.04, -0.1);
    const txLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 8, 8),
      txLedMat
    );
    txLed.position.set(-0.12, 0.04, 0.02);
    arduinoUno.add(rxLed, txLed);

    // 3. White Solderless Mini-Breadboard on Front-Right of Base Plate
    const breadboardGroup = new THREE.Group();
    breadboardGroup.position.set(0.78, 0.1, 0.76);
    deckGroup.add(breadboardGroup);

    const bbMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.12, 0.08, 0.72),
      new THREE.MeshStandardMaterial({
        map: breadboardTex,
        roughness: 0.35,
        metalness: 0.05,
      })
    );
    bbMesh.castShadow = true;
    breadboardGroup.add(bbMesh);

    // 4× 10kΩ Axial Resistors with Color Bands mounted across the breadboard trench
    const resistorBodyMat = new THREE.MeshStandardMaterial({
      map: resistorTex,
      roughness: 0.4,
      metalness: 0.1,
    });
    const resistorBodyGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.18, 12);
    const resistorLeadGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.1, 8);

    [-0.36, -0.12, 0.12, 0.36].forEach((rxOff) => {
      const resGroup = new THREE.Group();
      resGroup.position.set(rxOff, 0.08, 0);

      const rBody = new THREE.Mesh(resistorBodyGeo, resistorBodyMat);
      rBody.rotation.x = Math.PI / 2;
      resGroup.add(rBody);

      const leadFront = new THREE.Mesh(resistorLeadGeo, brushedAluminumMat);
      leadFront.position.set(0, -0.03, 0.11);
      const leadBack = new THREE.Mesh(resistorLeadGeo, brushedAluminumMat);
      leadBack.position.set(0, -0.03, -0.11);
      resGroup.add(leadFront, leadBack);

      breadboardGroup.add(resGroup);
    });

    // Jumper Wires connecting Breadboard (A0, A1, A2, A3, 5V, GND) & Servos (D2, D13) to Arduino UNO
    // A0..A3 Analog signal jumpers
    addJumperWire(
      deckGroup,
      [0.42, 0.14, 0.85],
      [-0.1, 0.38, 1.05],
      [-0.62, 0.14, 1.08],
      0x00f0ff
    );
    addJumperWire(
      deckGroup,
      [0.66, 0.14, 0.85],
      [0.0, 0.42, 1.1],
      [-0.52, 0.14, 1.08],
      0x22c55e
    );
    addJumperWire(
      deckGroup,
      [0.9, 0.14, 0.85],
      [0.1, 0.45, 1.14],
      [-0.42, 0.14, 1.08],
      0xf59e0b
    );
    addJumperWire(
      deckGroup,
      [1.14, 0.14, 0.85],
      [0.2, 0.48, 1.18],
      [-0.32, 0.14, 1.08],
      0xa855f7
    );
    // 5V (Red) & GND (Black) power jumpers
    addJumperWire(
      deckGroup,
      [0.32, 0.14, 1.04],
      [-0.25, 0.28, 1.18],
      [-0.85, 0.14, 1.08],
      0xef4444
    );
    addJumperWire(
      deckGroup,
      [0.32, 0.14, 0.48],
      [-0.25, 0.26, 0.55],
      [-0.78, 0.14, 1.08],
      0x1e293b
    );
    // Servo PWM Pin D2 (Base Yaw) & Pin D13 (U-Bracket Pitch) jumpers
    addJumperWire(
      deckGroup,
      [-0.48, 0.14, 0.44],
      [-0.22, 0.36, 0.1],
      [-0.08, 0.24, -0.22],
      0x38bdf8
    );
    addJumperWire(
      deckGroup,
      [-0.88, 0.14, 0.44],
      [-0.45, 0.42, 0.05],
      [0.15, 0.24, -0.22],
      0xfacc15
    );

    // 4. Axis 1 — Base Azimuth / Horizontal Yaw SG90 Servo + White U-Bracket (`yawGroup`)
    const baseTurretCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.48, 0.34, 20),
      whitePvcMat
    );
    baseTurretCollar.position.set(0, 0.22, -0.25);
    baseTurretCollar.castShadow = true;
    deckGroup.add(baseTurretCollar);

    const baseYawServo = createSG90ServoMesh();
    baseYawServo.position.set(-0.1, 0.32, -0.25);
    deckGroup.add(baseYawServo);

    // `yawGroup`: Strictly rotates within 0°–180° semicircle (-90° to +90° mechanical yaw)
    const yawGroup = new THREE.Group();
    yawGroup.position.set(0, 0.58, -0.25);
    deckGroup.add(yawGroup);

    // White SG90 Servo Horn at base of U-bracket
    const yawHornDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.04, 16),
      servoHornWhiteMat
    );
    yawGroup.add(yawHornDisc);

    const yawHornArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.045, 0.12),
      servoHornWhiteMat
    );
    yawHornArm.position.y = 0.02;
    yawGroup.add(yawHornArm);

    // White U-Shaped Gimbal Bracket (`yawGroup`)
    const uBracketWidth = 3.16;
    const uBracketWallHeight = 1.62;
    const uBracketDepth = 0.38;
    const uWallThick = 0.11;

    // U-Bracket horizontal bottom bar
    const uBottomBar = new THREE.Mesh(
      new THREE.BoxGeometry(uBracketWidth, 0.12, uBracketDepth),
      whitePvcMat
    );
    uBottomBar.position.y = 0.08;
    uBottomBar.castShadow = true;
    uBottomBar.receiveShadow = true;
    yawGroup.add(uBottomBar);

    // U-Bracket Left Vertical Wall (with wooden/brass pivot pin)
    const uLeftWall = new THREE.Mesh(
      new THREE.BoxGeometry(uWallThick, uBracketWallHeight, uBracketDepth),
      whitePvcMat
    );
    uLeftWall.position.set(
      -uBracketWidth / 2 + uWallThick / 2,
      0.08 + uBracketWallHeight / 2,
      0
    );
    uLeftWall.castShadow = true;
    yawGroup.add(uLeftWall);

    // U-Bracket Right Vertical Wall (housing the Pitch SG90 Servo)
    const uRightWall = new THREE.Mesh(
      new THREE.BoxGeometry(uWallThick, uBracketWallHeight, uBracketDepth),
      whitePvcMat
    );
    uRightWall.position.set(
      uBracketWidth / 2 - uWallThick / 2,
      0.08 + uBracketWallHeight / 2,
      0
    );
    uRightWall.castShadow = true;
    yawGroup.add(uRightWall);

    // Left wooden/brass pivot pin on Left Vertical Wall
    const leftPivotPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.28, 14),
      brassPinMat
    );
    leftPivotPin.rotation.z = Math.PI / 2;
    leftPivotPin.position.set(-uBracketWidth / 2 + 0.08, 1.48, 0);
    yawGroup.add(leftPivotPin);

    // Right Elevation SG90 Micro Servo embedded in Right Vertical Wall
    const pitchServoMesh = createSG90ServoMesh();
    pitchServoMesh.rotation.z = Math.PI / 2;
    pitchServoMesh.position.set(uBracketWidth / 2 + 0.04, 1.38, 0);
    yawGroup.add(pitchServoMesh);

    const pitchHornArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.44, 0.1),
      servoHornWhiteMat
    );
    pitchHornArm.position.set(uBracketWidth / 2 - 0.12, 1.48, 0);
    yawGroup.add(pitchHornArm);

    // 5. Axis 2 — Elevation / Vertical Tilt (`pitchGroup`, strictly 15°–165° SG90 PWM)
    const pitchGroup = new THREE.Group();
    pitchGroup.position.set(0, 1.48, 0);
    yawGroup.add(pitchGroup);

    pitchGroup.add(createPVPanelAssembly());

    // 6. 4-Quadrant Cross-Baffle ("+" Plus-Shaped) LDR Module attached to `pitchGroup`
    const ldrModuleGroup = new THREE.Group();
    // Cantilevered from the front edge of the solar panel frame so it moves & tilts locked with the panel
    ldrModuleGroup.position.set(0, 0.12, 1.12);
    pitchGroup.add(ldrModuleGroup);

    // White cantilevered support arm from panel frame
    const cantileverArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.05, 0.42),
      whitePvcMat
    );
    cantileverArm.position.set(0, -0.02, -0.14);
    cantileverArm.castShadow = true;
    ldrModuleGroup.add(cantileverArm);

    // White circular/square sensor base plate
    const sensorBaseDisc = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.045, 0.56),
      whitePvcMat
    );
    sensorBaseDisc.castShadow = true;
    ldrModuleGroup.add(sensorBaseDisc);

    // 3D "+" (Plus-Shaped) White Cross-Wall Shadow Baffle dividing into 4 quadrants (A0, A1, A2, A3)
    const baffleWallNS = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.28, 0.54),
      whitePvcMat
    );
    baffleWallNS.position.y = 0.15;
    baffleWallNS.castShadow = true;
    ldrModuleGroup.add(baffleWallNS);

    const baffleWallEW = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.28, 0.035),
      whitePvcMat
    );
    baffleWallEW.position.y = 0.15;
    baffleWallEW.castShadow = true;
    ldrModuleGroup.add(baffleWallEW);

    // 4 Dynamic LDR Photoresistor Meshes in Quadrants:
    // A0 (TL: -x, -z), A1 (TR: +x, -z), A2 (BL: -x, +z), A3 (BR: +x, +z)
    const ldrQuadMats = [
      new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00f0ff,
        emissiveIntensity: 1.5,
        roughness: 0.2,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00f0ff,
        emissiveIntensity: 1.5,
        roughness: 0.2,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.5,
        roughness: 0.2,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.5,
        roughness: 0.2,
      }),
    ];

    const quadCoords: [number, number][] = [
      [-0.14, -0.14], // A0: Top-Left (TL)
      [0.14, -0.14], // A1: Top-Right (TR)
      [-0.14, 0.14], // A2: Bottom-Left (BL)
      [0.14, 0.14], // A3: Bottom-Right (BR)
    ];

    const ldrCapGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.04, 14);
    quadCoords.forEach(([qx, qz], idx) => {
      const ldrCell = new THREE.Mesh(ldrCapGeo, ldrQuadMats[idx]);
      ldrCell.position.set(qx, 0.04, qz);
      ldrModuleGroup.add(ldrCell);
    });

    // Normal vector arrow helper on Active Panel
    pitchGroup.add(
      new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0.14, 0),
        1.45,
        0x00f0ff,
        0.3,
        0.18
      )
    );

    // =========================================================================
    // RIG B: Fixed / Passive Solar Panel (Baseline Model at 0° Horizontal Tilt)
    // =========================================================================
    const passiveRig = new THREE.Group();
    passiveRig.position.set(3.6, 0.08, 0);
    scene.add(passiveRig);

    const passiveShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 4.2),
      new THREE.MeshBasicMaterial({
        map: contactShadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.65,
      })
    );
    passiveShadow.rotation.x = -Math.PI / 2;
    passiveShadow.position.y = 0.01;
    passiveRig.add(passiveShadow);

    const passivePlinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.12, 0.24, 8),
      castIronBaseMat
    );
    passivePlinth.position.y = 0.12;
    passivePlinth.castShadow = true;
    passiveRig.add(passivePlinth);

    const passiveMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.24, 3.1, 20),
      darkSteelMat
    );
    passiveMast.position.y = 1.68;
    passiveMast.castShadow = true;
    passiveRig.add(passiveMast);

    const passivePivotGroup = new THREE.Group();
    passivePivotGroup.position.set(0, 3.32, 0);
    passiveRig.add(passivePivotGroup);
    passivePivotGroup.add(createPVPanelAssembly());
    passivePivotGroup.add(
      new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0.14, 0),
        1.45,
        0xf59e0b,
        0.3,
        0.18
      )
    );

    // =========================================================================
    // 3. HARDCORE VISIBLE SOLAR RAYS
    // =========================================================================
    const rayPulseUniforms = {
      uTime: { value: 0 },
    };

    function createHardcoreRayShader(
      coreHex: number,
      edgeHex: number,
      opacityMult: number
    ): THREE.ShaderMaterial {
      return new THREE.ShaderMaterial({
        uniforms: {
          uTime: rayPulseUniforms.uTime,
          uCoreColor: { value: new THREE.Color(coreHex) },
          uEdgeColor: { value: new THREE.Color(edgeHex) },
          uOpacity: { value: opacityMult },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform float uTime;
          uniform vec3 uCoreColor;
          uniform vec3 uEdgeColor;
          uniform float uOpacity;

          void main() {
            float wave = 0.65 + 0.35 * sin(vUv.y * 28.0 + uTime * 11.0);
            float pulsePacket = smoothstep(0.4, 0.95, sin(vUv.y * 12.0 + uTime * 7.0));
            vec3 col = mix(uEdgeColor, uCoreColor, 0.55 + 0.45 * pulsePacket);
            float alpha = uOpacity * wave;
            gl_FragColor = vec4(col, alpha);
          }
        `,
      });
    }

    const unitCoreCylGeo = new THREE.CylinderGeometry(
      0.055,
      0.055,
      1,
      12,
      1,
      true
    );
    const unitGlowCylGeo = new THREE.CylinderGeometry(
      0.16,
      0.26,
      1,
      12,
      1,
      true
    );
    const unitOuterConeGeo = new THREE.CylinderGeometry(
      0.32,
      0.72,
      1,
      16,
      1,
      true
    );

    const activeCoreRayMat = createHardcoreRayShader(0xffffff, 0x00f0ff, 0.96);
    const activeGlowRayMat = createHardcoreRayShader(0xfef08a, 0x00f0ff, 0.48);
    const activeConeMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const passiveCoreRayMat = createHardcoreRayShader(0xffffff, 0xf59e0b, 0.92);
    const passiveGlowRayMat = createHardcoreRayShader(0xfde047, 0xf59e0b, 0.42);
    const passiveConeMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    interface SolarBeamInstance {
      group: THREE.Group;
      impactDisc: THREE.Mesh;
      localOffset: THREE.Vector3;
      isRigA: boolean;
    }

    const solarBeams: SolarBeamInstance[] = [];

    const beamOffsets: [number, number, number][] = [
      [0, 0.14, 0],
      [-0.95, 0.14, -0.4],
      [0.95, 0.14, 0.4],
    ];

    beamOffsets.forEach(([ox, oy, oz], idx) => {
      const isCenter = idx === 0;

      const actBeamGroup = new THREE.Group();
      const actCore = new THREE.Mesh(unitCoreCylGeo, activeCoreRayMat);
      const actGlow = new THREE.Mesh(unitGlowCylGeo, activeGlowRayMat);
      if (!isCenter) {
        actCore.scale.set(0.65, 1, 0.65);
        actGlow.scale.set(0.65, 1, 0.65);
      } else {
        const actCone = new THREE.Mesh(unitOuterConeGeo, activeConeMat);
        actBeamGroup.add(actCone);
      }
      actBeamGroup.add(actCore, actGlow);
      scene.add(actBeamGroup);

      const actImpact = new THREE.Mesh(
        new THREE.RingGeometry(0.08, isCenter ? 0.34 : 0.22, 24),
        new THREE.MeshBasicMaterial({
          color: 0x00f0ff,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
        })
      );
      actImpact.rotation.x = -Math.PI / 2;
      actImpact.position.set(ox, oy + 0.02, oz);
      pitchGroup.add(actImpact);

      solarBeams.push({
        group: actBeamGroup,
        impactDisc: actImpact,
        localOffset: new THREE.Vector3(ox, oy, oz),
        isRigA: true,
      });

      const pasBeamGroup = new THREE.Group();
      const pasCore = new THREE.Mesh(unitCoreCylGeo, passiveCoreRayMat);
      const pasGlow = new THREE.Mesh(unitGlowCylGeo, passiveGlowRayMat);
      if (!isCenter) {
        pasCore.scale.set(0.65, 1, 0.65);
        pasGlow.scale.set(0.65, 1, 0.65);
      } else {
        const pasCone = new THREE.Mesh(unitOuterConeGeo, passiveConeMat);
        pasBeamGroup.add(pasCone);
      }
      pasBeamGroup.add(pasCore, pasGlow);
      scene.add(pasBeamGroup);

      const pasImpact = new THREE.Mesh(
        new THREE.RingGeometry(0.08, isCenter ? 0.34 : 0.22, 24),
        new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        })
      );
      pasImpact.rotation.x = -Math.PI / 2;
      pasImpact.position.set(ox, oy + 0.02, oz);
      passivePivotGroup.add(pasImpact);

      solarBeams.push({
        group: pasBeamGroup,
        impactDisc: pasImpact,
        localOffset: new THREE.Vector3(ox, oy, oz),
        isRigA: false,
      });
    });

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const _sunPos = new THREE.Vector3();
    const _targetWorld = new THREE.Vector3();
    const _ldrWorldPos = new THREE.Vector3();
    const _pitchServoWorldPos = new THREE.Vector3();
    const _midPoint = new THREE.Vector3();
    const _beamDir = new THREE.Vector3();
    const _upVec = new THREE.Vector3(0, 1, 0);
    const _projVec = new THREE.Vector3();

    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();
    let uiUpdateAccum = 0;
    let serialAccum = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      rayPulseUniforms.uTime.value = elapsed;
      skyUniforms.uTime.value = elapsed;

      if (simRef.current.autoCycle) {
        simRef.current.timeOfDay += dt * 0.28 * simRef.current.cycleSpeed;
        if (simRef.current.timeOfDay > 18.0) {
          simRef.current.timeOfDay = 6.0;
        }
      }

      simRef.current.cloudCurrent = THREE.MathUtils.damp(
        simRef.current.cloudCurrent,
        simRef.current.cloudTarget,
        4.5,
        dt
      );
      skyUniforms.uCloudCover.value = simRef.current.cloudCurrent;

      // Full 180° Solar Azimuth Sweep (-90° at 06:00 East -> 0° at 12:00 Noon -> +90° at 18:00 West)
      const dayProgress = (simRef.current.timeOfDay - 12.0) / 6.0;
      const sunAzimuthDeg = dayProgress * 90.0;
      const sunAzimuthRad = THREE.MathUtils.degToRad(sunAzimuthDeg);
      const sunElevationDeg = 20.0 + 48.0 * Math.cos(sunAzimuthRad);
      const sunElevationRad = THREE.MathUtils.degToRad(sunElevationDeg);
      const sunHorizR = SOLAR_ARC_RADIUS * Math.cos(sunElevationRad);

      const sunAngleDeg = sunAzimuthDeg;
      const sunAngleRad = THREE.MathUtils.degToRad(dayProgress * 75.0);

      _sunPos.set(
        Math.sin(sunAzimuthRad) * sunHorizR,
        Math.sin(sunElevationRad) * SOLAR_ARC_RADIUS,
        Math.cos(sunAzimuthRad) * sunHorizR
      );
      sunGroup.position.copy(_sunPos);
      sunLight.position.copy(_sunPos);

      skyUniforms.uSunDir.value.copy(_sunPos).normalize();
      const elevationCos = Math.max(0, Math.cos(sunAngleRad));
      const dayWeight = THREE.MathUtils.smoothstep(elevationCos, 0.25, 0.75);
      horizonFogColor.setRGB(
        THREE.MathUtils.lerp(0.88, 0.56, dayWeight),
        THREE.MathUtils.lerp(0.55, 0.78, dayWeight),
        THREE.MathUtils.lerp(0.32, 0.94, dayWeight)
      );
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.copy(horizonFogColor);
      }

      if (simRef.current.cloudCurrent > 0.01) {
        cloudGroup.visible = true;
        cloudMat.opacity = simRef.current.cloudCurrent * 0.85;
        cloudGroup.position.set(
          _sunPos.x * 0.72 + Math.sin(elapsed * 1.2) * 0.35,
          _sunPos.y * 0.72,
          _sunPos.z * 0.72
        );
      } else {
        cloudGroup.visible = false;
      }

      const cloudAttenuation = 1.0 - simRef.current.cloudCurrent * 0.62;
      sunLight.intensity = (1.1 + elevationCos * 2.2) * cloudAttenuation;

      // -----------------------------------------------------------------------
      // Dual-Axis SG90 Kinematics (FULL 180° AZIMUTH + SYNCHRONIZED ELEVATION)
      // -----------------------------------------------------------------------
      // Axis 1: Base Azimuth Yaw (`yawGroup.rotation.y` strictly across full 180° range: -90°..+90° -> 0°..180° PWM on Pin D2)
      const targetYawPWM = THREE.MathUtils.clamp(
        90.0 + sunAzimuthDeg,
        0,
        180
      );
      simRef.current.servoYawPWM = THREE.MathUtils.clamp(
        THREE.MathUtils.damp(simRef.current.servoYawPWM, targetYawPWM, 6.0, dt),
        0,
        180
      );
      const yawDeg = THREE.MathUtils.clamp(
        simRef.current.servoYawPWM - 90.0,
        -90,
        90
      );
      simRef.current.panelYawDeg = yawDeg;
      // Rotate base U-bracket across the full 180° semicircle [-π/2, +π/2] (mapped 1:1 to 0°–180° SG90 PWM)
      yawGroup.rotation.y = THREE.MathUtils.degToRad(yawDeg);

      // Axis 2: Elevation / Vertical Tilt (`pitchGroup.rotation.x` synchronized with solar elevation within 15°..165° PWM on Pin D13)
      const targetTiltDeg = THREE.MathUtils.clamp(
        90.0 - sunElevationDeg,
        15,
        58
      );
      const targetPitchPWM = THREE.MathUtils.clamp(
        90.0 + targetTiltDeg,
        15,
        165
      );
      simRef.current.servoPitchPWM = THREE.MathUtils.clamp(
        THREE.MathUtils.damp(
          simRef.current.servoPitchPWM,
          targetPitchPWM,
          6.5,
          dt
        ),
        15,
        165
      );
      simRef.current.panelTiltDeg = simRef.current.servoPitchPWM - 90.0;

      const panelTiltRad = THREE.MathUtils.degToRad(
        simRef.current.panelTiltDeg
      );
      pitchGroup.rotation.x = panelTiltRad;
      pitchHornArm.rotation.x = panelTiltRad;

      // Blink Arduino RX/TX LEDs during active tracking updates
      rxLedMat.emissiveIntensity = 1.2 + Math.sin(elapsed * 22) * 1.0;
      txLedMat.emissiveIntensity = 1.2 + Math.cos(elapsed * 18) * 1.0;

      yawGroup.updateMatrixWorld();
      pitchGroup.updateMatrixWorld();
      passivePivotGroup.updateMatrixWorld();

      for (let i = 0; i < solarBeams.length; i++) {
        const b = solarBeams[i];
        _targetWorld.copy(b.localOffset);
        if (b.isRigA) {
          pitchGroup.localToWorld(_targetWorld);
        } else {
          passivePivotGroup.localToWorld(_targetWorld);
        }

        const dist = _sunPos.distanceTo(_targetWorld);
        _midPoint.addVectors(_sunPos, _targetWorld).multiplyScalar(0.5);
        _beamDir.subVectors(_sunPos, _targetWorld).normalize();

        b.group.position.copy(_midPoint);
        b.group.quaternion.setFromUnitVectors(_upVec, _beamDir);
        b.group.scale.set(1, dist, 1);

        const pulseScale = 0.88 + 0.22 * Math.sin(elapsed * 8 + i);
        b.impactDisc.scale.set(pulseScale, pulseScale, 1);
      }

      if (simRef.current.cameraPresetActive) {
        const dampAlpha = 1 - Math.exp(-5.5 * dt);
        camera.position.lerp(simRef.current.desiredCamPos, dampAlpha);
        controls.target.lerp(simRef.current.desiredCamTarget, dampAlpha);
        if (
          camera.position.distanceToSquared(simRef.current.desiredCamPos) <
            0.002 &&
          controls.target.distanceToSquared(simRef.current.desiredCamTarget) <
            0.002
        ) {
          simRef.current.cameraPresetActive = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      // 3D X-Ray Callout Pin Projection
      if (
        simRef.current.xrayLabels &&
        !simRef.current.hudCollapsed &&
        container
      ) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        const yawPWMInt = Math.round(
          THREE.MathUtils.clamp(simRef.current.servoYawPWM, 0, 180)
        );
        const pitchPWMInt = Math.round(
          THREE.MathUtils.clamp(simRef.current.servoPitchPWM, 0, 180)
        );

        _ldrWorldPos.set(0, 0.28, 1.12);
        pitchGroup.localToWorld(_ldrWorldPos);

        _pitchServoWorldPos.set(uBracketWidth / 2 + 0.04, 1.48, 0);
        yawGroup.localToWorld(_pitchServoWorldPos);

        const worldPoints: [number, number, number][] = [
          [-3.6, 1.65, 0.85], // 1. Arduino UNO + 4x 10kΩ Breadboard
          [_ldrWorldPos.x, _ldrWorldPos.y + 0.25, _ldrWorldPos.z], // 2. 4-Quadrant Cross-Baffle LDR Array
          [-3.6, 1.95, -0.25], // 3. Base Yaw SG90 Servo (Pin D2)
          [
            _pitchServoWorldPos.x,
            _pitchServoWorldPos.y + 0.25,
            _pitchServoWorldPos.z,
          ], // 4. U-Bracket Pitch SG90 Servo (Pin D13)
          [3.6, 4.45, 0], // 5. Rig B Passive Baseline
        ];
        const metrics = [
          'Pins A0–A3 · 5V/GND · D2/D13',
          'A0(TL) A1(TR) A2(BL) A3(BR)',
          `D2 PWM: ${yawPWMInt}° (Yaw ${simRef.current.panelYawDeg >= 0 ? '+' : ''}${simRef.current.panelYawDeg.toFixed(0)}° / 180° Sweep)`,
          `D13 PWM: ${pitchPWMInt}° (Tilt ${simRef.current.panelTiltDeg.toFixed(1)}°)`,
          'Static 0° Horizontal Tilt',
        ];

        for (let i = 0; i < 5; i++) {
          const el = labelDomRefs.current[i];
          const metricEl = labelMetricRefs.current[i];
          if (!el) continue;

          _projVec.set(
            worldPoints[i][0],
            worldPoints[i][1],
            worldPoints[i][2]
          );
          _projVec.project(camera);
          const x = (_projVec.x * 0.5 + 0.5) * w;
          const y = (-_projVec.y * 0.5 + 0.5) * h;
          const vis =
            _projVec.z < 1.0 && x > 40 && x < w - 40 && y > 40 && y < h - 40;

          if (vis) {
            el.style.display = 'block';
            el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
            if (metricEl) metricEl.textContent = metrics[i];
          } else {
            el.style.display = 'none';
          }
        }
      }

      // -----------------------------------------------------------------------
      // Direct DOM Telemetry Updates at 10Hz (Zero React Re-Renders)
      // -----------------------------------------------------------------------
      uiUpdateAccum += dt;
      serialAccum += dt;

      if (uiUpdateAccum >= 0.1) {
        uiUpdateAccum = 0;

        // 4-Quadrant Cross-Baffle LDR Math (A0=TL, A1=TR, A2=BL, A3=BR)
        const elevErrRad = THREE.MathUtils.degToRad(
          targetTiltDeg - simRef.current.panelTiltDeg
        );
        const azimErrRad = THREE.MathUtils.degToRad(
          sunAzimuthDeg - simRef.current.panelYawDeg
        );
        const totalTrackErrRad = Math.hypot(elevErrRad, azimErrRad);
        const baseIrradiance = Math.max(
          0,
          Math.cos(totalTrackErrRad) * cloudAttenuation
        );

        // Cross-wall shadow baffle response + subtle ±2 ADC jitter
        const jitter = (seedOffset: number) =>
          Math.round(Math.sin(elapsed * 13.7 + seedOffset) * 2);

        const a0_TL = THREE.MathUtils.clamp(
          Math.round(
            baseIrradiance *
              (910 +
                Math.sin(elevErrRad) * 140 -
                Math.sin(azimErrRad) * 120) +
              jitter(1.1)
          ),
          0,
          1023
        );
        const a1_TR = THREE.MathUtils.clamp(
          Math.round(
            baseIrradiance *
              (910 +
                Math.sin(elevErrRad) * 140 +
                Math.sin(azimErrRad) * 120) +
              jitter(2.3)
          ),
          0,
          1023
        );
        const a2_BL = THREE.MathUtils.clamp(
          Math.round(
            baseIrradiance *
              (910 -
                Math.sin(elevErrRad) * 140 -
                Math.sin(azimErrRad) * 120) +
              jitter(3.7)
          ),
          0,
          1023
        );
        const a3_BR = THREE.MathUtils.clamp(
          Math.round(
            baseIrradiance *
              (910 -
                Math.sin(elevErrRad) * 140 +
                Math.sin(azimErrRad) * 120) +
              jitter(5.1)
          ),
          0,
          1023
        );

        // Dual-axis averaging per schematic logic
        const avgTop = (a0_TL + a1_TR) * 0.5;
        const avgBottom = (a2_BL + a3_BR) * 0.5;
        const avgLeft = (a0_TL + a2_BL) * 0.5;
        const avgRight = (a1_TR + a3_BR) * 0.5;
        const elevErrorADC = Math.round(avgTop - avgBottom);
        const azimErrorADC = Math.round(avgLeft - avgRight);

        // Update 4-Quadrant LDR Emissive Glow
        ldrQuadMats[0].emissiveIntensity = 0.4 + (a0_TL / 1023) * 2.3;
        ldrQuadMats[1].emissiveIntensity = 0.4 + (a1_TR / 1023) * 2.3;
        ldrQuadMats[2].emissiveIntensity = 0.4 + (a2_BL / 1023) * 2.3;
        ldrQuadMats[3].emissiveIntensity = 0.4 + (a3_BR / 1023) * 2.3;

        // ---------------------------------------------------------------------
        // Single-Source-of-Truth Photovoltaic Physics & Financial Derivation
        // ---------------------------------------------------------------------
        const {
          vAct: activeVoltageV,
          vPas: passiveVoltageV,
          iAct: activeCurrentA,
          iPas: passiveCurrentA,
          pAct: activePowerW,
          pPas: passivePowerW,
        } = deriveSolarPhysicsAtTime(
          simRef.current.timeOfDay,
          simRef.current.cloudCurrent,
          totalTrackErrRad
        );

        // Bounded Efficiency Gain (%): +0.0% at 12:00 PM solar noon, strictly capped at <= 90.0% max ceiling
        const instantEfficiencyGainPct = computeBoundedEfficiencyGainPct(
          activePowerW,
          passivePowerW
        );

        // Definite Integral Energy Yield (Wh)
        const { activeWh, passiveWh } = computeCumulativeEnergyUpTo(
          simRef.current.timeOfDay,
          simRef.current.cloudCurrent
        );

        // Update Timeline Scrubber
        const formattedTime = formatSolarTime(simRef.current.timeOfDay);
        if (timeSliderRef.current) {
          timeSliderRef.current.value = String(simRef.current.timeOfDay);
        }
        if (timeTextRef.current) {
          timeTextRef.current.textContent = formattedTime;
        }
        if (sunDegTextRef.current) {
          sunDegTextRef.current.textContent =
            sunAngleDeg >= 0
              ? `(+${sunAngleDeg.toFixed(0)}° W)`
              : `(${sunAngleDeg.toFixed(0)}° E)`;
        }

        // Update Right Box: POWER TELEMETRY
        if (netGainRef.current) {
          netGainRef.current.textContent = `+${instantEfficiencyGainPct.toFixed(1)}%`;
        }
        if (activeWattRef.current) {
          activeWattRef.current.textContent = `${activePowerW.toFixed(2)} W`;
        }
        if (passiveWattRef.current) {
          passiveWattRef.current.textContent = `${passivePowerW.toFixed(2)} W`;
        }
        if (activeVoltRef.current) {
          activeVoltRef.current.textContent = `${activeVoltageV.toFixed(1)} V`;
        }
        if (passiveVoltRef.current) {
          passiveVoltRef.current.textContent = `${passiveVoltageV.toFixed(1)} V`;
        }
        if (activeAmpRef.current) {
          activeAmpRef.current.textContent = `${activeCurrentA.toFixed(2)} A`;
        }
        if (passiveAmpRef.current) {
          passiveAmpRef.current.textContent = `${passiveCurrentA.toFixed(2)} A`;
        }
        if (activeWhRef.current) {
          activeWhRef.current.textContent = `${activeWh.toFixed(2)} Wh`;
        }
        if (passiveWhRef.current) {
          passiveWhRef.current.textContent = `${passiveWh.toFixed(2)} Wh`;
        }

        const sunSign = sunAzimuthDeg >= 0 ? '+' : '';
        const panelSign = simRef.current.panelYawDeg >= 0 ? '+' : '';
        const devDeg = Math.hypot(
          sunAzimuthDeg - simRef.current.panelYawDeg,
          targetTiltDeg - simRef.current.panelTiltDeg
        );

        if (footerSunAngleRef.current) {
          footerSunAngleRef.current.textContent = `${sunSign}${sunAzimuthDeg.toFixed(1)}°`;
        }
        if (footerPanelAngleRef.current) {
          footerPanelAngleRef.current.textContent = `${panelSign}${simRef.current.panelYawDeg.toFixed(1)}°`;
        }
        if (footerDevAngleRef.current) {
          footerDevAngleRef.current.textContent = `${devDeg.toFixed(1)}°`;
        }

        drawTelemetryChart(
          simRef.current.timeOfDay,
          activePowerW,
          simRef.current.cloudCurrent
        );

        // Stream Authentic 4-LDR Dual-Axis Serial Telemetry
        if (serialAccum >= 0.6 && simRef.current.autoCycle) {
          serialAccum = 0;
          const sec = String(Math.floor(elapsed % 60)).padStart(2, '0');
          const d2Yaw = Math.round(
            THREE.MathUtils.clamp(simRef.current.servoYawPWM, 0, 180)
          );
          const d13Pitch = Math.round(
            THREE.MathUtils.clamp(simRef.current.servoPitchPWM, 0, 180)
          );
          const lineStr = `[${formattedTime}:${sec}] A0:${a0_TL} A1:${a1_TR} A2:${a2_BL} A3:${a3_BR} (ΔE:${elevErrorADC} ΔA:${azimErrorADC}) | D2_YAW: ${d2Yaw}° | D13_PITCH: ${d13Pitch}° | PWR: ${activePowerW.toFixed(2)}W (+${instantEfficiencyGainPct.toFixed(1)}%)`;

          simRef.current.serialLogs.push(lineStr);
          if (simRef.current.serialLogs.length > 4) {
            simRef.current.serialLogs.shift();
          }

          if (serialContainerRef.current) {
            serialContainerRef.current.innerHTML = simRef.current.serialLogs
              .map(
                (l) =>
                  `<div class="truncate tabular-nums text-slate-300"><span class="text-[#00F0FF] mr-1.5">&gt;</span>${l}</div>`
              )
              .join('');
          }
        }
      }

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('start', onControlsStart);
      renderer.domElement.removeEventListener(
        'webglcontextlost',
        handleContextLost
      );
      controls.dispose();
      renderer.dispose();
    };
  }, [drawTelemetryChart]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#090D16] font-sans text-slate-100 select-none">
      {/* 1. Full-Screen 3D WebGL Viewport Container */}
      {/* 0. Dark Solar System Activation / Boot Loading Screen */}
      {!bootDismissed && (
        <div
          className={`fixed inset-0 z-50 bg-[#060911]/95 backdrop-blur-xl flex flex-col items-center justify-center px-6 transition-opacity duration-500 ${
            bootFading ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-800/90 bg-[#0B111E]/95 p-6 shadow-[0_0_60px_rgba(0,240,255,0.12)] flex flex-col items-center text-center gap-4">
            {/* Animated Solar Telemetry Core Emblem */}
            <div className="relative w-20 h-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-[#00F0FF]/50 animate-spin" />
              <div className="absolute inset-2 rounded-full border border-[#F59E0B]/40 animate-pulse" />
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#F59E0B]/25 to-[#00F0FF]/25 border border-[#00F0FF]/60 flex items-center justify-center shadow-[0_0_20px_rgba(0,240,255,0.35)]">
                <Sun className="w-6 h-6 text-[#F59E0B] animate-spin" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] font-mono tracking-[0.2em] text-[#00F0FF] uppercase font-semibold">
                SYSTEM ACTIVATING · DIGITAL TWIN BOOT
              </div>
              <h2 className="text-base font-bold text-slate-100 tracking-tight">
                Microcontroller-Based Active Solar Tracking System
              </h2>
            </div>

            {/* Boot Sequence Checklist */}
            <div className="w-full bg-[#070b14] border border-slate-800/80 rounded-xl p-3 text-left font-mono text-[11px] space-y-1.5">
              {BOOT_SEQUENCE_STEPS.map((stepText, idx) => {
                const threshold = (idx + 1) * 25;
                const active =
                  bootProgress >= idx * 25 && bootProgress < threshold;
                const done = bootProgress >= threshold;
                return (
                  <div
                    key={stepText}
                    className={`flex items-center justify-between gap-2 ${
                      done
                        ? 'text-emerald-400'
                        : active
                          ? 'text-[#00F0FF]'
                          : 'text-slate-600'
                    }`}
                  >
                    <span className="truncate">&gt; {stepText}</span>
                    <span className="shrink-0 font-bold">
                      {done ? 'OK' : active ? '...' : 'WAIT'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Progress Bar */}
            <div className="w-full space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-400">TELEMETRY HANDSHAKE</span>
                <span className="text-[#00F0FF] font-bold tabular-nums">
                  {bootProgress}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#00F0FF] via-cyan-300 to-[#F59E0B] transition-all duration-75"
                  style={{ width: `${bootProgress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1. Background 3D WebGL Canvas */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full z-0 cursor-grab active:cursor-grabbing"
        aria-label="Interactive 3D Solar Tracker Digital Twin Viewport"
      />

      {/* 2. 3D X-Ray Component Callout Pins */}
      <div
        className={`absolute inset-0 pointer-events-none z-10 overflow-hidden ${
          xrayLabels && !hudCollapsed ? 'block' : 'hidden'
        }`}
      >
        {LABEL_CONFIGS.map((cfg, idx) => (
          <div
            key={cfg.id}
            ref={(el) => {
              labelDomRefs.current[idx] = el;
            }}
            style={{ display: 'none', willChange: 'transform' }}
            className="absolute top-0 left-0 -translate-x-1/2 -translate-y-full pb-3"
          >
            <div
              className={`px-2.5 py-1 rounded-md bg-[#111827]/95 border text-[11px] leading-tight shadow-lg whitespace-nowrap ${
                cfg.accent === 'cyan'
                  ? 'border-[#00F0FF]/45 text-slate-100'
                  : 'border-[#F59E0B]/45 text-slate-100'
              }`}
            >
              <div className="font-semibold tracking-tight">{cfg.title}</div>
              <div
                ref={(el) => {
                  labelMetricRefs.current[idx] = el;
                }}
                className={`font-mono text-[10px] tabular-nums ${
                  cfg.accent === 'cyan' ? 'text-[#00F0FF]' : 'text-[#F59E0B]'
                }`}
              />
            </div>
          </div>
        ))}
      </div>

      {/* 3. Outer HUD Layout Wrapper */}
      <div className="relative z-20 w-full h-full pointer-events-none flex flex-col justify-between">
        {/* TOP BAR CONTRACT */}
        <header className="pointer-events-auto flex items-center justify-between gap-8 px-5 py-3 bg-[#111827]/95 border-b border-slate-800/80">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              handleSelectSubsystem('overview');
            }}
            className="text-base md:text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            Microcontroller-Based Active Solar Tracking System
          </a>

          <nav className="hidden xl:flex items-center gap-6 text-xs font-medium text-slate-300">
            <button
              type="button"
              onClick={() => handleSelectSubsystem('overview')}
              className={`hover:text-[#00F0FF] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedSubsystem === 'overview'
                  ? 'text-[#00F0FF] underline underline-offset-4'
                  : ''
              }`}
            >
              Dual-Rig Overview
            </button>
            <button
              type="button"
              onClick={() => handleSelectSubsystem('arduino')}
              className={`hover:text-[#00F0FF] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedSubsystem === 'arduino'
                  ? 'text-[#00F0FF] underline underline-offset-4'
                  : ''
              }`}
            >
              Arduino UNO + Breadboard
            </button>
            <button
              type="button"
              onClick={() => handleSelectSubsystem('ldrs')}
              className={`hover:text-[#00F0FF] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedSubsystem === 'ldrs'
                  ? 'text-[#00F0FF] underline underline-offset-4'
                  : ''
              }`}
            >
              4-Quadrant LDR Baffle
            </button>
            <button
              type="button"
              onClick={() => handleSelectSubsystem('servo')}
              className={`hover:text-[#00F0FF] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedSubsystem === 'servo'
                  ? 'text-[#00F0FF] underline underline-offset-4'
                  : ''
              }`}
            >
              SG90 U-Bracket Gimbal
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setXrayLabels((prev) => !prev)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                xrayLabels
                  ? 'bg-[#00F0FF]/15 border-[#00F0FF]/60 text-[#00F0FF]'
                  : 'bg-slate-800/90 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>
                {xrayLabels ? '3D Labels: Active' : '3D Labels: Hidden'}
              </span>
            </button>
          </div>
        </header>

        {/* MIDDLE ROW: Right Power Telemetry Box */}
        {!hudCollapsed && (
          <div className="flex-1 flex flex-col lg:flex-row items-start justify-end px-4 py-3 gap-4 overflow-y-auto lg:overflow-visible">
            {/* RIGHT HUD BOX: POWER TELEMETRY (Reference Image Arrangement + Click-to-Minimize) */}
            <aside className="pointer-events-auto w-full lg:w-[376px] bg-[#0B111E]/95 border border-slate-800/90 rounded-2xl p-4 shadow-2xl flex flex-col gap-3.5">
              {/* 1. Clickable Section Header: Cyan Bar + POWER TELEMETRY */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setTelemetryMinimized((prev) => !prev)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setTelemetryMinimized((prev) => !prev);
                  }
                }}
                title="Click header to minimize or restore this panel"
                className={`cursor-pointer select-none flex items-center justify-between group ${
                  telemetryMinimized
                    ? ''
                    : 'border-b border-slate-800/90 pb-3'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-1.5 h-4 bg-[#00F0FF] shadow-[0_0_8px_#00F0FF] shrink-0" />
                  <h2 className="text-xs font-bold tracking-[0.14em] text-[#00F0FF] uppercase font-mono group-hover:text-cyan-200 transition-colors">
                    POWER TELEMETRY
                  </h2>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400 group-hover:text-slate-200">
                  <span>{telemetryMinimized ? 'Restore' : 'Minimize'}</span>
                  {telemetryMinimized ? (
                    <ChevronRight className="w-3.5 h-3.5 text-[#00F0FF]" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-[#00F0FF]" />
                  )}
                </div>
              </div>

              {!telemetryMinimized && (
                <>
                  {/* 2. NET EFFICIENCY GAIN Hero Card */}
                  <div className="rounded-xl border border-[#00F0FF]/40 bg-gradient-to-b from-[#0d2a3a]/90 to-[#0a1926]/95 px-4 py-3.5 text-center shadow-[inset_0_0_24px_rgba(0,240,255,0.08)]">
                    <div className="text-[11px] font-bold tracking-[0.12em] text-slate-300 uppercase">
                      NET EFFICIENCY GAIN
                    </div>
                    <div
                      ref={netGainRef}
                      className="text-4xl font-bold font-mono tabular-nums text-[#00F0FF] drop-shadow-[0_0_14px_rgba(0,240,255,0.45)] my-1"
                    >
                      +10.8%
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Active Dual-Axis vs. Fixed Baseline (Max 90% Cap)
                    </div>
                  </div>

                  {/* 3. METRIC / ACTIVE / PASSIVE Comparison Table Card */}
                  <div className="rounded-xl border border-slate-800/90 bg-[#101827]/90 px-4 py-3">
                    <div className="grid grid-cols-3 items-center border-b border-slate-800 pb-2 mb-2.5 text-[11px] font-mono tracking-wider uppercase">
                      <span className="text-slate-400 font-semibold text-left">
                        METRIC
                      </span>
                      <span className="text-[#00F0FF] font-bold text-right">
                        ACTIVE
                      </span>
                      <span className="text-[#F59E0B] font-bold text-right">
                        PASSIVE
                      </span>
                    </div>

                    <div className="space-y-2 text-xs font-mono tabular-nums">
                      <div className="grid grid-cols-3 items-center">
                        <span className="text-slate-300 font-sans">
                          Instant Pwr
                        </span>
                        <span
                          ref={activeWattRef}
                          className="text-[#00F0FF] font-semibold text-right"
                        >
                          19.62 W
                        </span>
                        <span
                          ref={passiveWattRef}
                          className="text-[#F59E0B] font-semibold text-right"
                        >
                          17.70 W
                        </span>
                      </div>

                      <div className="grid grid-cols-3 items-center">
                        <span className="text-slate-300 font-sans">
                          Voltage
                        </span>
                        <span
                          ref={activeVoltRef}
                          className="text-[#00F0FF] font-semibold text-right"
                        >
                          18.0 V
                        </span>
                        <span
                          ref={passiveVoltRef}
                          className="text-[#F59E0B] font-semibold text-right"
                        >
                          17.7 V
                        </span>
                      </div>

                      <div className="grid grid-cols-3 items-center">
                        <span className="text-slate-300 font-sans">
                          Current
                        </span>
                        <span
                          ref={activeAmpRef}
                          className="text-[#00F0FF] font-semibold text-right"
                        >
                          1.09 A
                        </span>
                        <span
                          ref={passiveAmpRef}
                          className="text-[#F59E0B] font-semibold text-right"
                        >
                          1.00 A
                        </span>
                      </div>

                      <div className="grid grid-cols-3 items-center">
                        <span className="text-slate-300 font-sans">
                          Yield (Wh)
                        </span>
                        <span
                          ref={activeWhRef}
                          className="text-[#00F0FF] font-semibold text-right"
                        >
                          79.85 Wh
                        </span>
                        <span
                          ref={passiveWhRef}
                          className="text-[#F59E0B] font-semibold text-right"
                        >
                          56.40 Wh
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 4. POWER OUTPUT vs TIME Chart Card */}
                  <div className="rounded-xl border border-slate-800/90 bg-[#101827]/90 p-3.5 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between text-[11px] font-mono tracking-wider uppercase">
                      <span className="font-bold text-slate-300">
                        POWER OUTPUT vs TIME
                      </span>
                      <span className="font-bold text-[#00F0FF]">
                        SOLAR PROFILE
                      </span>
                    </div>

                    {/* Centered Legend Row with Outlined Squares */}
                    <div className="flex items-center justify-center gap-5 text-[11px] text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 border-2 border-[#00F0FF] bg-[#00F0FF]/20 inline-block" />
                        <span>Active Tracker</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 border-2 border-[#F59E0B] bg-[#F59E0B]/20 inline-block" />
                        <span>Fixed Passive</span>
                      </div>
                    </div>

                    <div className="relative w-full h-[135px]">
                      <canvas
                        ref={chartCanvasRef}
                        className="w-full h-full block"
                      />
                    </div>
                  </div>

                  {/* 5. Bottom Sun / Panel / Dev Telemetry Strip */}
                  <div className="rounded-lg border border-slate-800/90 bg-[#080d18]/95 px-3 py-2 flex items-center justify-between text-[11px] font-mono tabular-nums">
                    <div className="flex items-center gap-1">
                      <Sun className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-slate-400">Sun:</span>
                      <span
                        ref={footerSunAngleRef}
                        className="text-[#F59E0B] font-semibold"
                      >
                        -21.9°
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Hexagon className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="text-slate-400">Panel:</span>
                      <span
                        ref={footerPanelAngleRef}
                        className="text-[#00F0FF] font-semibold"
                      >
                        -21.9°
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">Dev:</span>
                      <span
                        ref={footerDevAngleRef}
                        className="text-[#00F0FF] font-semibold"
                      >
                        0.0°
                      </span>
                    </div>
                  </div>
                </>
              )}
            </aside>
          </div>
        )}

        {/* BOTTOM DOCK: Sun Timeline Scrubber, Cloud Disruptor & Live Arduino Serial Monitor */}
        <div className="pointer-events-auto w-full max-w-[960px] mx-auto px-4 pb-3 flex flex-col items-center">
          <div className="flex items-center gap-2 mb-1.5">
            <button
              type="button"
              onClick={() => setHudCollapsed((prev) => !prev)}
              className="px-3 py-1 rounded-t-lg bg-[#111827]/95 border border-b-0 border-slate-800 text-[11px] font-medium text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              {hudCollapsed ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5 text-[#00F0FF]" />
                  <span>Show Telemetry HUD (H)</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5 text-[#00F0FF]" />
                  <span>Collapse HUD · Zen Mode (H)</span>
                </>
              )}
            </button>
          </div>

          <div className="w-full bg-[#111827]/95 border border-slate-800/90 rounded-xl p-3.5 shadow-2xl flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAutoCycle((prev) => !prev)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    autoCycle
                      ? 'bg-[#00F0FF]/15 border-[#00F0FF]/60 text-[#00F0FF]'
                      : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {autoCycle ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {autoCycle ? 'Auto-Cycle: ON' : 'Auto-Cycle: Paused'}
                  </span>
                </button>

                <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                  {([1, 2, 5] as const).map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setCycleSpeed(spd)}
                      className={`px-2 py-1 text-[11px] font-mono rounded-md transition-colors cursor-pointer ${
                        cycleSpeed === spd
                          ? 'bg-slate-800 text-[#00F0FF] font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 min-w-[220px] flex items-center gap-3">
                <div className="w-[126px] flex items-center gap-1.5 text-xs font-mono tabular-nums whitespace-nowrap shrink-0">
                  <Sun className="w-4 h-4 text-[#F59E0B] shrink-0" />
                  <span
                    ref={timeTextRef}
                    className="text-slate-200 font-semibold"
                  >
                    10:15
                  </span>
                  <span ref={sunDegTextRef} className="text-slate-400">
                    (-22° E)
                  </span>
                </div>
                <input
                  ref={timeSliderRef}
                  type="range"
                  min={6.0}
                  max={18.0}
                  step={0.05}
                  defaultValue={10.25}
                  onChange={handleTimeScrub}
                  aria-label="Solar Time of Day Scrubber (06:00 to 18:00)"
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#00F0FF]"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTriggerCloud}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    cloudActive
                      ? 'bg-[#F59E0B]/20 border-[#F59E0B] text-[#F59E0B]'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  <CloudRain className="w-3.5 h-3.5" />
                  <span>
                    {cloudActive
                      ? 'Cloud Disruptor: Active'
                      : 'Cloud Disruptor'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSerialExpanded((prev) => !prev)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Terminal className="w-3.5 h-3.5 text-[#00F0FF]" />
                  <span>Serial</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadStandaloneHtml}
                  title="Download self-contained single-file index.html"
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#00F0FF]" />
                  <span className="hidden sm:inline">index.html</span>
                </button>
              </div>
            </div>

            {serialExpanded && !hudCollapsed && (
              <div
                ref={serialContainerRef}
                className="bg-[#090D16] border border-slate-800/90 rounded-lg px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-300 h-[76px] overflow-hidden"
              >
                <div className="truncate tabular-nums text-slate-300">
                  <span className="text-[#00F0FF] mr-1.5">&gt;</span>
                  [10:15:00] BOOT: Arduino UNO R3 Dual-Axis 4-LDR Gimbal Tracker
                  (SG90 0°-180°)
                </div>
                <div className="truncate tabular-nums text-slate-300">
                  <span className="text-[#00F0FF] mr-1.5">&gt;</span>
                  [10:15:01] A0:892 A1:890 A2:888 A3:891 (ΔE:+2 ΔA:-1) | D2_YAW:
                  64° | D13_PITCH: 116° | PWR: 19.62W (+10.8%)
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
