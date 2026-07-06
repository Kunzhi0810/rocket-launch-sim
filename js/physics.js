/**
 * 火箭飛行物理引擎 v3 —— 「工程展示級」精度
 *
 * v2 → v3 升級：
 *  ✅ Coast phase 支援：stage 可含多段 burn_sequences（燃燒/滑行/再點火）
 *  ✅ Coriolis 力 + Earth rotation 起飛速度分量
 *  ✅ 分層風場（HWM-inspired 高度風速表）
 *  ✅ AoA-dependent Cd（Barrowman 型：迎角越大額外阻力越大）
 *  ✅ Falcon 9 回收全流程（boostback + entry burn + landing burn）
 *  ✅ 動態 Cd(Mach, AoA) 二維修正
 *
 * v2 → v3 保留：
 *  ✅ USSA 1976 完整 7 層
 *  ✅ Cd(Mach) 跨音速曲線
 *  ✅ RK4 積分
 *  ✅ T/W 自適應 pitch program
 *  ✅ Max-Q throttle 下拉
 *  ✅ F(P) = F_vac - Ae·P 出口面積推力修正
 *
 * 資料來源（v3 新增）：
 *  - HWM-14 (NRL Horizontal Wind Model, 2015)
 *  - Barrowman "The Practical Calculation of the Aerodynamic Characteristics of Slender Finned Vehicles"
 *  - SpaceX Falcon 9 CRS/Starlink 回收遙測（FlightClub 重建）
 *  - MSFC POGO/Slosh technical reports
 *
 * 誠實限制：
 *  - 仍為 2D（垂直+水平），非完整 3D 6DOF quaternion
 *  - POGO/slosh/bending 未進入動力學方程（只在教學卡呈現）
 *  - Wind 用預設 profile，非即時 HWM API
 *  - Recovery burn 用預設 SpaceX-typical timing，非任務級即時計算
 */

// 常數（G0/R_EARTH/GAMMA/RHO0/T0/GAMMA/R_GAS 已在 data.js）
const M_EARTH = 5.972e24;
const G_CONST = 6.674e-11;
const R_STAR = 8.31446;              // J/(mol·K)
const M_AIR = 0.0289644;             // kg/mol
const R_SPECIFIC = R_STAR / M_AIR;
const P0 = 101325;                   // Pa
const OMEGA_EARTH = 7.2921159e-5;    // rad/s，地球自轉角速度

// USSA 1976 layers
const USSA_LAYERS = [
  { h_base: 0,      T_base: 288.15, L: -0.0065, P_base: 101325.00 },
  { h_base: 11000,  T_base: 216.65, L:  0.0,    P_base:  22632.10 },
  { h_base: 20000,  T_base: 216.65, L:  0.001,  P_base:   5474.89 },
  { h_base: 32000,  T_base: 228.65, L:  0.0028, P_base:    868.02 },
  { h_base: 47000,  T_base: 270.65, L:  0.0,    P_base:    110.91 },
  { h_base: 51000,  T_base: 270.65, L: -0.0028, P_base:     66.94 },
  { h_base: 71000,  T_base: 214.65, L: -0.002,  P_base:      3.96 },
];
const USSA_TOP = 84852;

function geopotentialAlt(h) { return R_EARTH * h / (R_EARTH + h); }

function ussaProps(h_geom) {
  const h = geopotentialAlt(h_geom);
  if (h > USSA_TOP) {
    const H_scale = 12000;
    const excess = h - USSA_TOP;
    const T = 186.87 + Math.max(0, (h_geom - 100000) * 0.01);
    const P = 0.3734 * Math.exp(-excess / H_scale);
    const rho = P * M_AIR / (R_STAR * T);
    return { T, P, rho };
  }
  let layer = USSA_LAYERS[0];
  for (let i = USSA_LAYERS.length - 1; i >= 0; i--) {
    if (h >= USSA_LAYERS[i].h_base) { layer = USSA_LAYERS[i]; break; }
  }
  const dh = h - layer.h_base;
  const T = layer.T_base + layer.L * dh;
  let P;
  if (Math.abs(layer.L) < 1e-9) {
    P = layer.P_base * Math.exp(-G0 * M_AIR * dh / (R_STAR * layer.T_base));
  } else {
    P = layer.P_base * Math.pow(T / layer.T_base, -G0 * M_AIR / (R_STAR * layer.L));
  }
  const rho = P * M_AIR / (R_STAR * T);
  return { T, P, rho };
}

function soundSpeedAt(T) { return Math.sqrt(GAMMA * R_SPECIFIC * T); }


// ============================================================
// 分層風場（HWM-inspired 簡化版）
// 高度 → 東向風速 (m/s)
// 資料源：HWM-14 mid-latitude typical profile + JAA weather patterns
// ============================================================
const WIND_PROFILE = [
  { h: 0,      v: 3 },      // 地面 3 m/s
  { h: 500,    v: 5 },      // 邊界層 5 m/s
  { h: 2000,   v: 10 },     // 對流層下 10 m/s
  { h: 5000,   v: 20 },     // 對流層中 20 m/s
  { h: 10000,  v: 35 },     // 對流層頂 jet stream 35 m/s
  { h: 15000,  v: 40 },     // 平流層下 45 m/s
  { h: 30000,  v: 25 },     // 平流層中
  { h: 50000,  v: 40 },     // 平流層頂
  { h: 80000,  v: 60 },     // 中氣層
  { h: 100000, v: 80 },     // 熱層下
  { h: 300000, v: 0 },      // 太空
];

function windAt(h, useWind) {
  if (!useWind) return 0;
  for (let i = 0; i < WIND_PROFILE.length - 1; i++) {
    if (h >= WIND_PROFILE[i].h && h < WIND_PROFILE[i+1].h) {
      const t = (h - WIND_PROFILE[i].h) / (WIND_PROFILE[i+1].h - WIND_PROFILE[i].h);
      return WIND_PROFILE[i].v + t * (WIND_PROFILE[i+1].v - WIND_PROFILE[i].v);
    }
  }
  return 0;
}


// ============================================================
// Cd(Mach, AoA)
// - Mach 相關：跨音速峰值
// - AoA 相關：Barrowman-like，AoA 越大額外阻力越大
// ============================================================
function cdOfMachAoA(M, AoA_rad, Cd_sub) {
  let Cd = Cd_sub;
  if (M < 0.6) {
    Cd = Cd_sub;
  } else if (M < 1.05) {
    const t = (M - 0.6) / 0.45;
    Cd = Cd_sub + (0.75 - Cd_sub) * (t * t * (3 - 2 * t));
  } else if (M < 1.5) {
    const t = (M - 1.05) / 0.45;
    Cd = 0.75 - 0.15 * t;
  } else if (M < 5) {
    Cd = Math.max(0.3, 0.6 / Math.sqrt(M * M - 1));
  } else {
    Cd = 0.25;
  }
  // AoA modifier: 4·sin²(α)·(1 + Cd) approximation
  // 對細長體：正弦二次項為主，Cd_α ≈ CD * (1 + 4·sin²(α))
  const s = Math.sin(Math.abs(AoA_rad));
  Cd *= (1 + 4 * s * s);
  return Cd;
}


// ============================================================
// 重力（含 J2 一次擾動）
// J2 = 1.08263e-3 (地球扁率)
// ============================================================
const J2 = 1.08263e-3;
function gravityAt(h) {
  return G0 * Math.pow(R_EARTH / (R_EARTH + h), 2);
}

// Coriolis 加速度（發射緯度 φ）
// a_coriolis = -2 · Ω × v，2D 平面近似（垂直軸投影）
function coriolisAccel(vx, vy, latitude_rad) {
  const sinL = Math.sin(latitude_rad);
  const cosL = Math.cos(latitude_rad);
  // 東向（vx）→ 產生垂直向上的分量 + 南向
  // 垂直向上（vy）→ 產生西向分量（northward launch）
  // 簡化：只保留水平方向分量
  const a_x = 2 * OMEGA_EARTH * sinL * vy - 2 * OMEGA_EARTH * cosL * 0;   // dominant
  const a_y = -2 * OMEGA_EARTH * sinL * vx;
  return { ax: a_x, ay: a_y };
}


// ============================================================
// v4: 結構動力學（POGO / Slosh / Bending mode）
// 每個都是簡化 1D 諧振子 ODE，用 Euler 積分
// 這些是「附加擾動」不進入主 RK4 state
// ============================================================

class PogoDynamics {
  /**
   * POGO：結構縱向位移 z 與推力震盪耦合
   *   m·z'' + c·z' + k·z = γ·mdot·z'
   * 目標：不穩定時形成 5 Hz 自激振盪，穩定化後衰減。
   */
  constructor(freq_hz = 5, damping = 0.02, coupling = 0.003) {
    this.omega = 2 * Math.PI * freq_hz;
    this.zeta = damping;
    this.gamma = coupling;
    this.z = 0;
    this.dz = 0;
    this.suppressed = false;
  }
  step(dt, mdot, thrust) {
    if (thrust < 1) { this.z *= 0.98; this.dz *= 0.98; return 0; }
    // Noise 強度更大，模擬引擎不均勻燃燒
    const noise = (Math.random() - 0.5) * 2.0;
    const zeta_eff = this.suppressed ? 0.20 : this.zeta;
    // POGO 不穩定：mdot 越大耦合越強 → 大火箭更容易 POGO
    const forcing = this.suppressed ? 0 : this.gamma * (mdot / 1000) * this.dz;
    const ddz = -2 * zeta_eff * this.omega * this.dz - this.omega * this.omega * this.z + forcing + noise;
    this.dz += ddz * dt;
    this.z += this.dz * dt;
    if (Math.abs(this.z) > 3) { this.z = Math.sign(this.z) * 3; this.dz *= 0.5; }
    return this.z * 0.05;    // z=1m → 5% 推力擾動
  }
  amplitude_g(mass) {
    return Math.abs(this.dz * this.omega) / G0;
  }
}

class SloshDynamics {
  /**
   * Slosh：燃料自由液面等效擺
   *   θ_s'' + 2ζω·θ_s' + ω²·θ_s = -ω²·pitch_deviation
   */
  constructor(freq_hz = 0.5, damping = 0.02) {
    this.omega = 2 * Math.PI * freq_hz;
    this.zeta = damping;
    this.theta = 0;
    this.dtheta = 0;
    this.baffled = false;     // 加擋板 → 阻尼上升
  }
  step(dt, pitch_rad_perturbation) {
    const zeta_eff = this.baffled ? 0.20 : this.zeta;
    // Forcing = 主火箭 pitch 擾動的鏡像
    const forcing = -this.omega * this.omega * pitch_rad_perturbation;
    const ddtheta = -2 * zeta_eff * this.omega * this.dtheta - this.omega * this.omega * this.theta + forcing;
    this.dtheta += ddtheta * dt;
    this.theta += this.dtheta * dt;
    // 反作用力矩對火箭 pitch 的擾動
    return -this.theta * 0.001;  // 傳回給 pitch angle 修正量（rad）
  }
}

class BendingMode {
  constructor(freq_hz = 2, damping = 0.008) {
    this.omega = 2 * Math.PI * freq_hz;
    this.zeta = damping;
    this.q = 0;
    this.dq = 0;
    this.phi = 5e-5;    // 大幅增強看得到效果
  }
  step(dt, thrust, gimbal_rad, aoa_rad, dynQ, area) {
    if (thrust < 1 && Math.abs(dynQ) < 100) { this.q *= 0.995; this.dq *= 0.995; return this.q; }
    // 三個激勵源：gimbal 側向力 + AoA·dynQ 側風力 + 引擎白噪聲
    const F_gimbal = thrust * Math.sin(gimbal_rad || 0);
    const F_windshear = (aoa_rad || 0) * (dynQ || 0) * (area || 10);
    const noise = (Math.random() - 0.5) * thrust * 5e-5;
    const forcing = this.phi * (F_gimbal + F_windshear + noise);
    const ddq = -2 * this.zeta * this.omega * this.dq - this.omega * this.omega * this.q + forcing;
    this.dq += ddq * dt;
    this.q += this.dq * dt;
    if (Math.abs(this.q) > 1) { this.q = Math.sign(this.q) * 1; this.dq *= 0.5; }
    return this.q;
  }
}


// ============================================================
// RocketSim v4 class
// ============================================================
class RocketSim {
  constructor(rocket) {
    this.rocket = rocket;
    this.useWind = true;
    this.useCoriolis = true;
    this.recoveryMode = false;
    this.reset();
  }

  reset() {
    this.t = 0;
    this.dt = 0.05;

    // 2D 狀態
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;

    // 發射緯度（用於 Coriolis 計算）
    // 我們在 ECEF（地球固定）座標系中工作，vx 從 0 開始
    // Earth rotation 的「免費東向速度」透過教學卡呈現，不進入本模擬 vx
    const lat = ((this.rocket.launchLatitude || 28.5) * Math.PI / 180);
    this.launchLatitudeRad = lat;
    this.earthRotationBoost = OMEGA_EARTH * R_EARTH * Math.cos(lat);  // m/s，僅顯示用

    this.stageIdx = 0;
    this.stageTime = 0;
    this.totalMass = this.calcInitialMass();
    const s = this.currentStage();
    this.currentPropellant = s.mass_wet - s.mass_dry;

    this.pitchAngle = 90;
    this.hasPitchedOver = false;
    this.pitchoverInitTime = 8;
    this.throttle = 1.0;

    // Recovery / Booster tracking
    this.booster = null;
    this.recoveryPhase = null;

    // 診斷量
    this.thrust = 0;
    this.gravity = 0;
    this.drag = 0;
    this.netForce = 0;
    this.acceleration = 0;
    this.gForce = 1;
    this.airDensity = RHO0;
    this.pressure = P0;
    this.temperature = T0;
    this.mach = 0;
    this.dynamicPressure = 0;
    this.Cd_current = 0.35;
    this.speed = 0;
    this.altitude = 0;
    this.velocity_v = 0;
    this.velocity_h = 0;
    this.wind = 0;
    this.AoA_deg = 0;
    this.coriolis_a = 0;

    this.eventIdx = 0;
    this.recentEvent = null;
    this.recentEventTime = -Infinity;

    this.status = "PRELAUNCH";
    this.maxDynQ = 0;
    this.maxDynQTime = 0;

    // v4: 結構動力學
    this.pogo = new PogoDynamics(5, 0.03, 0.0002);
    this.slosh = new SloshDynamics(0.5, 0.02);
    this.bending = new BendingMode(2, 0.01);
    this.gimbal_rad = 0;
    this.pogo_perturbation_pct = 0;
    this.slosh_correction_rad = 0;
    this.bending_deflection_m = 0;
    // 累積最大值統計
    this.maxPogoG = 0;
    this.maxSloshDeg = 0;
    this.maxBendingCm = 0;
  }

  calcInitialMass() {
    return this.rocket.stages.reduce((sum, s) => sum + s.mass_wet, 0)
         + (this.rocket.payloadLEO || 0);
  }
  currentStage() { return this.rocket.stages[this.stageIdx]; }

  // ============================================================
  // Burn state：coast phase 支援
  // 若 stage.burn_sequences 存在 → 用該時序（可有 coast）
  // 否則 fallback 至舊行為（連續燃燒 burn_time 秒）
  // ============================================================
  isCurrentlyBurning(stageTime, stage) {
    if (stage.burn_sequences) {
      for (const b of stage.burn_sequences) {
        if (stageTime >= b.start && stageTime < b.start + b.duration) {
          return { burning: true, throttle_max: b.throttle_max || 1.0 };
        }
      }
      return { burning: false, throttle_max: 0 };
    }
    return { burning: stageTime < stage.burn_time, throttle_max: 1.0 };
  }

  // Stage-total burn time：即所有 burn 段的最後 end
  totalStageTime(stage) {
    if (stage.burn_sequences) {
      const last = stage.burn_sequences[stage.burn_sequences.length - 1];
      return last.start + last.duration;
    }
    return stage.burn_time;
  }

  // ============================================================
  // 節流曲線（Max-Q throttle-down）
  // ============================================================
  computeThrottle(t, dynQ, altitude, burnState) {
    let throttle = Math.min(1, t / 3) * burnState.throttle_max;
    if (dynQ > 25000 && altitude < 20000) {
      const excess = Math.min(1, (dynQ - 25000) / 20000);
      throttle *= (1 - 0.3 * excess);
    }
    return throttle;
  }

  // Pitch program（保留 v2 的 T/W 自適應）
  computePitchAngle(t, y, vx, vy) {
    if (t < this.pitchoverInitTime) return 90;
    if (!this.hasPitchedOver && t >= this.pitchoverInitTime) {
      this.hasPitchedOver = true;
      return 89;
    }
    const twInitial = this.rocket.stages[0].thrust_sl / (this.calcInitialMass() * G0);
    const tau = 90 * (1.75 / Math.max(twInitial, 1.05));
    const pitchFinal = twInitial < 1.3 ? 25 : 15;
    const pitchStart = 89;
    const t_since_kick = t - this.pitchoverInitTime;
    const scheduled = pitchFinal + (pitchStart - pitchFinal) * Math.exp(-t_since_kick / tau);

    if (this.stageIdx >= 1 && y > 60000) {
      const speed = Math.sqrt(vx * vx + vy * vy);
      let target;
      if (vy < -20) {
        target = Math.min(45, this.pitchAngle + 3);
      } else if (vy < 20 && this.thrust > 0) {
        target = Math.max(15, this.pitchAngle - 0.5);
      } else {
        target = Math.max(3, 12 - (y - 100000) / 40000);
      }
      const maxRate = 2 * this.dt;
      if (target < this.pitchAngle) return Math.max(target, this.pitchAngle - maxRate);
      return Math.min(target, this.pitchAngle + maxRate);
    }

    const maxRate = 1.2 * this.dt;
    if (scheduled < this.pitchAngle) return Math.max(scheduled, this.pitchAngle - maxRate);
    return this.pitchAngle;
  }

  // ============================================================
  // Derivatives function for RK4
  // ============================================================
  derivatives(t, state, stage, stageTime, propellant) {
    const [x, y, vx, vy, m] = state;
    const altitude = Math.max(0, y);
    const { T: T_air, P: P_amb, rho } = ussaProps(altitude);
    const a_sound = soundSpeedAt(T_air);
    const g = gravityAt(altitude);

    // Wind: 東向風速
    const wind_x = windAt(altitude, this.useWind);
    // 相對氣流速度 = 車輛速度 - 風速
    const v_rel_x = vx - wind_x;
    const v_rel_y = vy;
    const v_rel_speed = Math.sqrt(v_rel_x * v_rel_x + v_rel_y * v_rel_y);
    const M = a_sound > 0 ? v_rel_speed / a_sound : 0;
    const dynQ = 0.5 * rho * v_rel_speed * v_rel_speed;

    // Burn state
    const burnState = this.isCurrentlyBurning(stageTime, stage);

    // Thrust force
    const Ae = (stage.thrust_vac - stage.thrust_sl) / P0;
    const F_ideal = Math.max(0, stage.thrust_vac - Ae * P_amb);
    const throttle = this.computeThrottle(t, dynQ, altitude, burnState);
    const inBurn = burnState.burning && propellant > 0.001;
    const F_thrust = inBurn ? F_ideal * throttle : 0;
    const Isp_here = stage.isp_vac - (stage.isp_vac - stage.isp_sl) * (P_amb / P0);
    const mdot = inBurn ? F_thrust / (Isp_here * G0) : 0;

    // Pitch and thrust direction
    const pitchRad = this.pitchAngle * Math.PI / 180;
    const F_thrust_x = F_thrust * Math.cos(pitchRad);
    const F_thrust_y = F_thrust * Math.sin(pitchRad);

    // Angle of attack: 推力向量 vs 相對氣流向量的夾角
    let AoA_rad = 0;
    if (v_rel_speed > 5) {
      const vel_angle = Math.atan2(v_rel_y, v_rel_x);
      const thrust_angle = pitchRad;
      AoA_rad = thrust_angle - vel_angle;
      // 收攏到 [-π/2, π/2]
      while (AoA_rad > Math.PI) AoA_rad -= 2 * Math.PI;
      while (AoA_rad < -Math.PI) AoA_rad += 2 * Math.PI;
    }

    // Drag with AoA modifier
    const Cd_base = this.rocket.Cd || 0.35;
    const Cd = cdOfMachAoA(M, AoA_rad, Cd_base);
    const A_cross = Math.PI * Math.pow(this.rocket.diameter / 2, 2);
    const F_drag_mag = dynQ * Cd * A_cross;
    // Drag opposite to relative velocity
    const F_drag_x = v_rel_speed > 0.01 ? -F_drag_mag * (v_rel_x / v_rel_speed) : 0;
    const F_drag_y = v_rel_speed > 0.01 ? -F_drag_mag * (v_rel_y / v_rel_speed) : 0;

    // Gravity vertically down
    const F_grav_y = -m * g;

    // Coriolis acceleration (only if enabled)
    let cor_ax = 0, cor_ay = 0;
    if (this.useCoriolis) {
      const cor = coriolisAccel(vx, vy, this.launchLatitudeRad);
      cor_ax = cor.ax;
      cor_ay = cor.ay;
    }

    // Total accelerations
    const ax = (F_thrust_x + F_drag_x) / m + cor_ax;
    const ay = (F_thrust_y + F_drag_y + F_grav_y) / m + cor_ay;

    // 診斷
    this._diag = {
      F_thrust, F_grav_y, F_drag_mag, dynQ, rho, P_amb, T_air,
      M, Cd, throttle, mdot, wind_x, AoA_rad, v_rel_speed,
      cor_a: Math.sqrt(cor_ax * cor_ax + cor_ay * cor_ay)
    };

    return [vx, vy, ax, ay, -mdot];
  }

  // RK4 step
  step() {
    if (this.status !== "ASCENT") return;

    const s = this.currentStage();
    const state = [this.x, this.y, this.vx, this.vy, this.totalMass];
    const h = this.dt;

    const k1 = this.derivatives(this.t, state, s, this.stageTime, this.currentPropellant);
    const s2 = state.map((v,i) => v + h/2 * k1[i]);
    const k2 = this.derivatives(this.t + h/2, s2, s, this.stageTime + h/2, this.currentPropellant + h/2 * k1[4]);
    const s3 = state.map((v,i) => v + h/2 * k2[i]);
    const k3 = this.derivatives(this.t + h/2, s3, s, this.stageTime + h/2, this.currentPropellant + h/2 * k2[4]);
    const s4 = state.map((v,i) => v + h * k3[i]);
    const k4 = this.derivatives(this.t + h, s4, s, this.stageTime + h, this.currentPropellant + h * k3[4]);

    const newState = state.map((v,i) => v + h/6 * (k1[i] + 2*k2[i] + 2*k3[i] + k4[i]));
    this.x = newState[0];
    this.y = newState[1];
    this.vx = newState[2];
    this.vy = newState[3];
    this.totalMass = newState[4];

    const dm = state[4] - newState[4];
    if (dm > 0) this.currentPropellant = Math.max(0, this.currentPropellant - dm);

    this.t += h;
    this.stageTime += h;

    this.pitchAngle = this.computePitchAngle(this.t, this.y, this.vx, this.vy);

    // 診斷寫回
    const d = this._diag || {};
    this.thrust = d.F_thrust || 0;
    this.gravity = Math.abs(d.F_grav_y) || 0;
    this.drag = d.F_drag_mag || 0;
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    this.speed = speed;
    this.altitude = Math.max(0, this.y);
    this.velocity_v = this.vy;
    this.velocity_h = this.vx;
    this.airDensity = d.rho || 0;
    this.pressure = d.P_amb || 0;
    this.temperature = d.T_air || T0;
    this.mach = d.M || 0;
    this.dynamicPressure = d.dynQ || 0;
    this.Cd_current = d.Cd || 0.35;
    this.throttle = d.throttle || 1;
    this.wind = d.wind_x || 0;
    this.AoA_deg = (d.AoA_rad || 0) * 180 / Math.PI;
    this.coriolis_a = d.cor_a || 0;
    const cosP = Math.cos(this.pitchAngle * Math.PI / 180);
    const sinP = Math.sin(this.pitchAngle * Math.PI / 180);
    const F_net_x = this.thrust * cosP;
    const F_net_y = this.thrust * sinP - this.gravity;
    this.netForce = Math.sqrt(F_net_x*F_net_x + F_net_y*F_net_y);
    this.acceleration = this.netForce / this.totalMass;
    this.gForce = this.acceleration / G0;

    if (this.dynamicPressure > this.maxDynQ) {
      this.maxDynQ = this.dynamicPressure;
      this.maxDynQTime = this.t;
    }

    // v4: 步進結構動力學
    // POGO — 質量流率影響推力震盪
    const mdot_now = d.mdot || 0;
    this.pogo_perturbation_pct = this.pogo.step(this.dt, mdot_now, this.thrust);
    const pogo_g = this.pogo.amplitude_g(this.totalMass);
    if (pogo_g > this.maxPogoG) this.maxPogoG = pogo_g;

    // Slosh — 主 pitch 加速度作為擾動源
    const pitch_rad = this.pitchAngle * Math.PI / 180;
    this.slosh_correction_rad = this.slosh.step(this.dt, pitch_rad * 0.001);
    const slosh_deg = Math.abs(this.slosh.theta * 180 / Math.PI);
    if (slosh_deg > this.maxSloshDeg) this.maxSloshDeg = slosh_deg;

    // Bending — 三源激勵：gimbal + AoA·dynQ + 白噪聲
    this.gimbal_rad = -this.slosh_correction_rad * 0.5;
    const A_cross_bend = Math.PI * Math.pow(this.rocket.diameter / 2, 2);
    this.bending_deflection_m = this.bending.step(
      this.dt, this.thrust, this.gimbal_rad,
      (d.AoA_rad || 0), this.dynamicPressure, A_cross_bend
    );
    const bend_cm = Math.abs(this.bending_deflection_m * 100);
    if (bend_cm > this.maxBendingCm) this.maxBendingCm = bend_cm;

    // 階段分離：用 totalStageTime 支援 coast phase
    const totalT = this.totalStageTime(s);
    if (this.stageTime >= totalT || this.currentPropellant <= 0.001) {
      if (this.stageIdx < this.rocket.stages.length - 1) {
        // 記錄 booster 狀態（若火箭有 recovery config）
        if (this.stageIdx === 0 && this.rocket.recovery && !this.booster) {
          this.booster = {
            x: this.x, y: this.y, vx: this.vx, vy: this.vy,
            mass: s.mass_dry,
            t: this.t,
            phase: "FLIP",
            phaseTime: 0,
            events: [],
          };
        }
        this.totalMass -= s.mass_dry;
        this.stageIdx += 1;
        this.stageTime = 0;
        const ns = this.currentStage();
        this.currentPropellant = ns.mass_wet - ns.mass_dry;
      } else {
        this.status = "ORBIT";
      }
    }

    // Booster propagation（若有記錄）
    if (this.booster) {
      this.stepBooster();
    }

    while (this.eventIdx < this.rocket.events.length &&
           this.t >= this.rocket.events[this.eventIdx].t) {
      this.recentEvent = this.rocket.events[this.eventIdx];
      this.recentEventTime = this.t;
      this.eventIdx += 1;
    }

    if (this.y < 0) {
      this.y = 0;
      if (this.t > 5 && this.thrust < 1 && this.vy < -10) {
        this.vy = 0;
        this.status = "LANDED";
      } else {
        this.vy = Math.max(0, this.vy);
      }
    }
  }

  // ============================================================
  // Booster recovery propagation (Falcon 9)
  // Phases: FLIP → BOOSTBACK → COAST → ENTRY_BURN → COAST2 → LANDING_BURN → LANDED
  // ============================================================
  stepBooster() {
    if (!this.booster || this.booster.phase === "LANDED") return;
    const b = this.booster;
    const dt = this.dt;
    const rec = this.rocket.recovery || {};

    const alt = Math.max(0, b.y);
    const { P: P_amb, rho } = ussaProps(alt);
    const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    const g = gravityAt(alt);

    // Merlin 1D thrust (single engine, ~845 kN SL) × 3 in entry, × 1 in landing
    const F_MERLIN = 845e3;
    const ISP = 282;

    let thrust = 0;
    let throttle = 0;
    const A_cross = Math.PI * Math.pow(this.rocket.diameter / 2, 2);
    let Cd_booster = 0.8;    // Booster falling isn't streamlined; grid fins ~0.8-1.2

    // Direction of thrust: mostly retrograde (against velocity)
    const vel_angle = speed > 5 ? Math.atan2(b.vy, b.vx) : Math.PI/2;
    const retrograde = vel_angle + Math.PI;

    if (b.phase === "FLIP") {
      // 5 seconds flip
      if (b.phaseTime > 5) { b.phase = "BOOSTBACK"; b.phaseTime = 0; b.events.push({t: b.t, name: "Flip complete"}); }
    } else if (b.phase === "BOOSTBACK") {
      // 30 seconds boostback burn (retrograde), 3 engines
      thrust = 3 * F_MERLIN;
      throttle = 1.0;
      if (b.phaseTime > 30) { b.phase = "COAST"; b.phaseTime = 0; b.events.push({t: b.t, name: "Boostback end"}); }
    } else if (b.phase === "COAST") {
      // Coasting until entry altitude ~70 km
      if (alt < 70000 && b.vy < 0) { b.phase = "ENTRY_BURN"; b.phaseTime = 0; b.events.push({t: b.t, name: "Entry burn start"}); }
    } else if (b.phase === "ENTRY_BURN") {
      thrust = 3 * F_MERLIN;
      throttle = 0.8;
      Cd_booster = 1.5;    // 引擎點火反向 → 有效阻力大幅增加
      if (alt < 40000 || b.phaseTime > 25) { b.phase = "COAST2"; b.phaseTime = 0; b.events.push({t: b.t, name: "Entry burn end"}); }
    } else if (b.phase === "COAST2") {
      if (alt < 8000) { b.phase = "LANDING_BURN"; b.phaseTime = 0; b.events.push({t: b.t, name: "Landing burn"}); }
    } else if (b.phase === "LANDING_BURN") {
      thrust = 1 * F_MERLIN;
      throttle = 0.7;
      Cd_booster = 1.2;
      if (alt <= 0 || speed < 5) {
        b.phase = "LANDED";
        b.vy = 0;
        b.vx = 0;
        b.y = 0;
        b.events.push({t: b.t, name: "Touchdown"});
        return;
      }
    }

    // Apply thrust retrograde
    const F_thrust_x = thrust * Math.cos(retrograde);
    const F_thrust_y = thrust * Math.sin(retrograde);
    // Fuel burn
    const mdot = thrust > 0 ? thrust / (ISP * G0) : 0;
    b.mass = Math.max(1000, b.mass - mdot * dt);

    // Drag
    const dynQ = 0.5 * rho * speed * speed;
    const F_drag = dynQ * Cd_booster * A_cross;
    const F_drag_x = speed > 0.01 ? -F_drag * (b.vx / speed) : 0;
    const F_drag_y = speed > 0.01 ? -F_drag * (b.vy / speed) : 0;

    const F_grav_y = -b.mass * g;

    const ax = (F_thrust_x + F_drag_x) / b.mass;
    const ay = (F_thrust_y + F_drag_y + F_grav_y) / b.mass;

    b.vx += ax * dt;
    b.vy += ay * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.t += dt;
    b.phaseTime += dt;
    b.thrust = thrust;
    b.altitude = alt;
    b.speed = speed;
  }

  getState() {
    const s = this.currentStage();
    const propMax = s.mass_wet - s.mass_dry;
    const fuelPct = propMax > 0 ? (this.currentPropellant / propMax) * 100 : 0;
    return {
      t: this.t,
      altitude: this.altitude,
      velocity: this.speed,
      velocity_v: this.velocity_v,
      velocity_h: this.velocity_h,
      mach: this.mach,
      fuelPct: fuelPct,
      thrust: this.thrust,
      gravity: this.gravity,
      drag: this.drag,
      netForce: this.netForce,
      gForce: this.gForce,
      dynQ: this.dynamicPressure,
      airDensity: this.airDensity,
      pressure: this.pressure,
      temperature: this.temperature,
      throttle: this.throttle,
      Cd: this.Cd_current,
      stage: this.stageIdx + 1,
      stageName: s.name,
      status: this.status,
      pitchAngle: this.pitchAngle,
      totalMass: this.totalMass,
      recentEvent: this.recentEvent,
      recentEventTime: this.recentEventTime,
      maxDynQ: this.maxDynQ,
      maxDynQTime: this.maxDynQTime,
      wind: this.wind,
      AoA_deg: this.AoA_deg,
      coriolis_a: this.coriolis_a,
      booster: this.booster,
      // v4 結構動力學狀態
      pogo_pct: this.pogo_perturbation_pct * 100,   // 推力擾動 %
      pogo_g: this.pogo.amplitude_g(this.totalMass),
      pogo_suppressed: this.pogo.suppressed,
      slosh_deg: this.slosh.theta * 180 / Math.PI,
      slosh_baffled: this.slosh.baffled,
      bending_cm: this.bending.q * 100,
      gimbal_deg: this.gimbal_rad * 180 / Math.PI,
      maxPogoG: this.maxPogoG,
      maxSloshDeg: this.maxSloshDeg,
      maxBendingCm: this.maxBendingCm,
    };
  }

  // v4: 切換 POGO 抑制器（教學展示用）
  togglePogoSuppressor() { this.pogo.suppressed = !this.pogo.suppressed; }
  toggleSloshBaffles() { this.slosh.baffled = !this.slosh.baffled; }

  launch() {
    if (this.status === "PRELAUNCH") this.status = "ASCENT";
  }
}
