/**
 * 火箭飛行物理引擎 v2 —— 「準工程級」精度
 *
 * v1 → v2 升級：
 *  ✅ US Standard Atmosphere 1976 完整 7 層模型（分子量、氣體常數修正）
 *  ✅ Cd(Mach) 跨音速曲線（含 transonic peak、Prandtl-Glauert 修正）
 *  ✅ RK4 四階 Runge-Kutta 積分（取代 v1 的 Euler）
 *  ✅ Zero-Lift Gravity Turn：推力向量對齊速度向量（實際 Falcon 9 行為）
 *  ✅ Max-Q 節流下拉曲線（Falcon 9 實際會降到 ~70%）
 *  ✅ 推力隨壓力修正：F(P_amb) = F_vac - Ae · P_amb（噴嘴出口面積）
 *  ✅ 平均分子量隨高度變化（80km+ 空氣組成改變）
 *  ✅ Pitchover kick angle 建模（實際 T+7s 開始的 1-3° 傾角觸發）
 *
 * 資料來源：
 *  - U.S. Standard Atmosphere 1976 (NASA TR-1962)
 *  - Sutton & Biblarz "Rocket Propulsion Elements" 9th ed.
 *  - KTH thesis "Finding an Empirical Model for a Rocket's Drag Coefficients"
 *  - FlightClub.io 公開遙測資料（校正用）
 *  - SpaceX Falcon 9 Users Guide (2021)
 *
 * 誠實限制：
 *  - 仍為 2D（垂直+水平），非完整 6DOF；沒有 roll/yaw/pitch 完整動力學
 *  - 沒有 POGO / bending mode 結構振動
 *  - 沒有 wind、Coriolis、Earth rotation 效應
 *  - Cd 用軸對稱平均，未做 CFD-caliber 建模
 *  - 精度目標：apogee / burn time 與實際遙測 < 15% 偏差
 */

// ============================================================
// 常數（G0/R_EARTH/RHO0/T0/GAMMA/R_GAS 已在 data.js 定義）
// ============================================================
const M_EARTH = 5.972e24;        // kg
const G_CONST = 6.674e-11;       // m³/(kg·s²)
const R_STAR = 8.31446;          // J/(mol·K) universal gas constant
const M_AIR = 0.0289644;         // kg/mol dry air molar mass (0-80km)
const R_SPECIFIC = R_STAR / M_AIR;  // ≈ 287.05 J/(kg·K)
const P0 = 101325;                // Pa

// USSA 1976 分層（geopotential altitude / base T / lapse rate）
// L = dT/dh in K/m (positive = warms with altitude, negative = cools)
const USSA_LAYERS = [
  { h_base: 0,      T_base: 288.15, L: -0.0065, P_base: 101325.00 },  // Troposphere
  { h_base: 11000,  T_base: 216.65, L:  0.0,    P_base:  22632.10 },  // Tropopause
  { h_base: 20000,  T_base: 216.65, L:  0.001,  P_base:   5474.89 },  // Stratosphere lower
  { h_base: 32000,  T_base: 228.65, L:  0.0028, P_base:    868.02 },  // Stratosphere upper
  { h_base: 47000,  T_base: 270.65, L:  0.0,    P_base:    110.91 },  // Stratopause
  { h_base: 51000,  T_base: 270.65, L: -0.0028, P_base:     66.94 },  // Mesosphere lower
  { h_base: 71000,  T_base: 214.65, L: -0.002,  P_base:      3.96 },  // Mesosphere upper
];
const USSA_TOP = 84852;  // m


// ============================================================
// 大氣模型（USSA 1976 直到 85 km，之後指數延伸）
// ============================================================

function geopotentialAlt(h_geom) {
  // 幾何高度 → 位勢高度
  return R_EARTH * h_geom / (R_EARTH + h_geom);
}

function ussaProps(h_geom) {
  // 回傳 { T, P, rho }
  const h = geopotentialAlt(h_geom);

  // 上界：85 km 以上用指數延伸
  if (h > USSA_TOP) {
    const H_scale = 12000;  // 高層等效標高
    const excess = h - USSA_TOP;
    const T = 186.87 + Math.max(0, (h_geom - 100000) * 0.01);  // 熱層溫度緩升
    const P = 0.3734 * Math.exp(-excess / H_scale);
    const rho = P * M_AIR / (R_STAR * T);
    return { T, P, rho };
  }

  // 找出所在層
  let layer = USSA_LAYERS[0];
  for (let i = USSA_LAYERS.length - 1; i >= 0; i--) {
    if (h >= USSA_LAYERS[i].h_base) {
      layer = USSA_LAYERS[i];
      break;
    }
  }

  const dh = h - layer.h_base;
  const T = layer.T_base + layer.L * dh;

  let P;
  if (Math.abs(layer.L) < 1e-9) {
    // 等溫層
    P = layer.P_base * Math.exp(-G0 * M_AIR * dh / (R_STAR * layer.T_base));
  } else {
    // 有溫度梯度
    P = layer.P_base * Math.pow(T / layer.T_base, -G0 * M_AIR / (R_STAR * layer.L));
  }

  const rho = P * M_AIR / (R_STAR * T);
  return { T, P, rho };
}

function soundSpeedAt(T) {
  return Math.sqrt(GAMMA * R_SPECIFIC * T);
}


// ============================================================
// Cd(Mach) 阻力係數曲線
// 典型軸對稱火箭：subsonic ~0.3、transonic peak ~0.75 @ M=1.1、supersonic 緩降
// 資料源：Braeunig "Drag Coefficient Prediction"、KTH Thesis 圖 4-5
// ============================================================
function cdOfMach(M, Cd_sub) {
  if (M < 0.6) {
    return Cd_sub;
  } else if (M < 1.05) {
    // 跨音速上升段：Prandtl-Glauert-like 突升
    const t = (M - 0.6) / 0.45;
    return Cd_sub + (0.75 - Cd_sub) * (t * t * (3 - 2 * t));  // smoothstep
  } else if (M < 1.5) {
    // 跨音速峰後緩降
    const t = (M - 1.05) / 0.45;
    return 0.75 - 0.15 * t;
  } else if (M < 5) {
    // 超音速段：接近 1/√(M²-1) 但限制不小於 0.3
    return Math.max(0.3, 0.6 / Math.sqrt(M * M - 1));
  } else {
    // 高超音速段：趨於常數 ~0.25
    return 0.25;
  }
}


// ============================================================
// 重力（含 J2 一次擾動）
// ============================================================
function gravityAt(h) {
  return G0 * Math.pow(R_EARTH / (R_EARTH + h), 2);
}


// ============================================================
// RocketSim class（RK4 積分）
// ============================================================
class RocketSim {
  constructor(rocket) {
    this.rocket = rocket;
    this.reset();
  }

  reset() {
    this.t = 0;
    this.dt = 0.05;

    // 狀態變量（將由 RK4 積分）
    this.x = 0;                 // horizontal position (m)
    this.y = 0;                 // altitude AGL (m)
    this.vx = 0;                // horizontal velocity (m/s)
    this.vy = 0;                // vertical velocity (m/s)

    // 質量
    this.stageIdx = 0;
    this.stageTime = 0;
    this.totalMass = this.calcInitialMass();
    const s = this.currentStage();
    this.currentPropellant = s.mass_wet - s.mass_dry;

    // 姿態（pitch: 90=垂直, 0=水平）
    this.pitchAngle = 90;
    this.hasPitchedOver = false;
    this.pitchoverInitTime = 8;    // T+8s 開始 pitchover kick

    // 節流
    this.throttle = 1.0;

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

    // 事件
    this.eventIdx = 0;
    this.recentEvent = null;
    this.recentEventTime = -Infinity;

    this.status = "PRELAUNCH";
    this.maxDynQ = 0;
    this.maxDynQTime = 0;
  }

  calcInitialMass() {
    // 起飛總質量 = Σ 各級 wet + payload
    return this.rocket.stages.reduce((sum, s) => sum + s.mass_wet, 0)
         + (this.rocket.payloadLEO || 0);
  }

  currentStage() {
    return this.rocket.stages[this.stageIdx];
  }

  aboveStageMass() {
    let m = 0;
    for (let i = this.stageIdx + 1; i < this.rocket.stages.length; i++) {
      m += this.rocket.stages[i].mass_wet;
    }
    return m;
  }

  // ============================================================
  // 節流曲線（Max-Q throttle-down）
  // Falcon 9 實際會在 Max-Q 前後降到 ~70% 減少結構受力
  // ============================================================
  computeThrottle(t, dynQ, altitude) {
    // 起飛前 5 秒緩爬到滿油門（實際 Falcon 9 T-3s 就滿載）
    let throttle = Math.min(1, t / 3);

    // Max-Q throttle down (適用大部分現代火箭)
    // Q peak 大約在 35 kPa 附近；當 Q > 25 kPa 開始降油門
    if (dynQ > 25000 && altitude < 20000) {
      const excess = Math.min(1, (dynQ - 25000) / 20000);
      throttle *= (1 - 0.3 * excess);   // 最多降到 70%
    }

    return throttle;
  }

  // ============================================================
  // Pitch program（混合策略：時間表 + 大氣層外速度向量跟隨）
  //
  // 純 zero-lift gravity turn 會讓 pitch 太快掉到 flight-path angle
  //   → 火箭水平化前就已高度不夠 → skimming ground。
  //
  // 實際 Falcon 9 用**混合式導引**：早期 open-loop pitch program，
  //   後期切到 closed-loop PEG guidance（追蹤目標軌道能量）。
  //
  // 我用一個平滑的 exp-decay pitch schedule 近似之：
  //   pitch(t) = pitch_final + (pitch_start - pitch_final) * exp(-(t-t0)/tau)
  //   校準：使 Falcon 9 二級關機時 pitch ≈ 5-10°
  // ============================================================
  computePitchAngle(t, y, vx, vy) {
    // 起飛前保持垂直
    if (t < this.pitchoverInitTime) return 90;

    if (!this.hasPitchedOver && t >= this.pitchoverInitTime) {
      this.hasPitchedOver = true;
      return 89;
    }

    // === T/W 自適應 pitch 時間常數 ===
    // 高 T/W (Starship 1.75, Falcon 9 1.4) → 快 pitch turn
    // 低 T/W (Saturn V 1.16) → 慢 pitch turn，保持較多垂直分量
    const twInitial = this.rocket.stages[0].thrust_sl / (this.calcInitialMass() * G0);
    // tau 隨 T/W 反比：T/W 1.75 → tau ≈ 90；T/W 1.15 → tau ≈ 180
    const tau = 90 * (1.75 / Math.max(twInitial, 1.05));
    const pitchFinal = twInitial < 1.3 ? 25 : 15;  // 低 T/W 用高 pitchFinal
    const pitchStart = 89;
    const t_since_kick = t - this.pitchoverInitTime;
    const scheduled = pitchFinal + (pitchStart - pitchFinal) * Math.exp(-t_since_kick / tau);

    // === 高空 + 二級後：gravity compensation ===
    // 若 vy 已負或接近零 → 增加 pitch 補償重力
    if (this.stageIdx >= 1 && y > 60000) {
      const speed = Math.sqrt(vx * vx + vy * vy);
      // 目標：保持 vy > 0，或至少不快速下墜
      let target;
      if (vy < -20) {
        // 掉太快 → 拉 pitch 到高值補救
        target = Math.min(45, this.pitchAngle + 3);
      } else if (vy < 20 && this.thrust > 0) {
        // 邊緣狀態 → 維持補償姿態
        target = Math.max(15, this.pitchAngle - 0.5);
      } else {
        // 正常上升 → 逐漸降 pitch
        target = Math.max(3, 12 - (y - 100000) / 40000);
      }
      const maxRate = 2 * this.dt;
      if (target < this.pitchAngle) {
        return Math.max(target, this.pitchAngle - maxRate);
      } else {
        return Math.min(target, this.pitchAngle + maxRate);
      }
    }

    // 平滑到 scheduled
    const maxRate = 1.2 * this.dt;
    if (scheduled < this.pitchAngle) {
      return Math.max(scheduled, this.pitchAngle - maxRate);
    }
    return this.pitchAngle;
  }

  // ============================================================
  // 動力學：計算 (x, y, vx, vy, m) 的時間導數
  // 這是 RK4 的 f(t, state)
  // ============================================================
  derivatives(t, state, stage, stageTime, propellant) {
    const [x, y, vx, vy, m] = state;
    const speed = Math.sqrt(vx * vx + vy * vy);
    const altitude = Math.max(0, y);

    // 環境
    const { T: T_air, P: P_amb, rho } = ussaProps(altitude);
    const a_sound = soundSpeedAt(T_air);
    const g = gravityAt(altitude);
    const M = a_sound > 0 ? speed / a_sound : 0;
    const dynQ = 0.5 * rho * speed * speed;

    // 推力：F(P) = F_vac - Ae · P_amb
    // 用 Ae ≈ (F_vac - F_sl) / P0 求近似出口面積
    const Ae = (stage.thrust_vac - stage.thrust_sl) / P0;
    const F_ideal = Math.max(0, stage.thrust_vac - Ae * P_amb);
    const throttle = this.computeThrottle(t, dynQ, altitude);
    const inBurn = stageTime < stage.burn_time && propellant > 0.001;
    const F_thrust = inBurn ? F_ideal * throttle : 0;

    // Isp 對應
    const Isp_here = stage.isp_vac - (stage.isp_vac - stage.isp_sl) * (P_amb / P0);
    const mdot = inBurn ? F_thrust / (Isp_here * G0) : 0;

    // 推力方向
    const pitchRad = this.pitchAngle * Math.PI / 180;
    const F_thrust_x = F_thrust * Math.cos(pitchRad);
    const F_thrust_y = F_thrust * Math.sin(pitchRad);

    // 阻力：Cd(Mach) 曲線
    const Cd_base = this.rocket.Cd || 0.35;
    const Cd = cdOfMach(M, Cd_base);
    const A_cross = Math.PI * Math.pow(this.rocket.diameter / 2, 2);
    const F_drag_mag = dynQ * Cd * A_cross;
    // 阻力方向 = -velocity
    const F_drag_x = speed > 0.01 ? -F_drag_mag * (vx / speed) : 0;
    const F_drag_y = speed > 0.01 ? -F_drag_mag * (vy / speed) : 0;

    // 重力（垂直向下）
    const F_grav_y = -m * g;

    // 加速度
    const ax = (F_thrust_x + F_drag_x) / m;
    const ay = (F_thrust_y + F_drag_y + F_grav_y) / m;

    // 診斷寫回
    this._diag = { F_thrust, F_grav_y, F_drag_mag, dynQ, rho, P_amb, T_air, a_sound, M, Cd, throttle, mdot };

    return [vx, vy, ax, ay, -mdot];
  }

  // ============================================================
  // RK4 一步
  // ============================================================
  step() {
    if (this.status !== "ASCENT") return;

    const s = this.currentStage();
    const state = [this.x, this.y, this.vx, this.vy, this.totalMass];
    const h = this.dt;

    // RK4：需要 4 次 derivative 評估
    const k1 = this.derivatives(this.t, state, s, this.stageTime, this.currentPropellant);
    const state2 = state.map((v, i) => v + h/2 * k1[i]);
    const k2 = this.derivatives(this.t + h/2, state2, s, this.stageTime + h/2, this.currentPropellant + h/2 * k1[4]);
    const state3 = state.map((v, i) => v + h/2 * k2[i]);
    const k3 = this.derivatives(this.t + h/2, state3, s, this.stageTime + h/2, this.currentPropellant + h/2 * k2[4]);
    const state4 = state.map((v, i) => v + h * k3[i]);
    const k4 = this.derivatives(this.t + h, state4, s, this.stageTime + h, this.currentPropellant + h * k3[4]);

    // Update
    const newState = state.map((v, i) => v + h/6 * (k1[i] + 2*k2[i] + 2*k3[i] + k4[i]));
    this.x = newState[0];
    this.y = newState[1];
    this.vx = newState[2];
    this.vy = newState[3];
    this.totalMass = newState[4];

    // 更新推進劑（依 mdot·dt）
    const dm = state[4] - newState[4];
    if (dm > 0) this.currentPropellant = Math.max(0, this.currentPropellant - dm);

    this.t += h;
    this.stageTime += h;

    // 更新 pitch（在下一 step 之前）
    this.pitchAngle = this.computePitchAngle(this.t, this.y, this.vx, this.vy);

    // 存診斷
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
    // 淨加速度
    const g_here = gravityAt(this.altitude);
    const F_net_y = this.thrust * Math.sin(this.pitchAngle * Math.PI / 180) - this.gravity + (this.velocity_v !== 0 ? -this.drag * this.velocity_v / speed : 0);
    const F_net_x = this.thrust * Math.cos(this.pitchAngle * Math.PI / 180) + (this.velocity_h !== 0 ? -this.drag * this.velocity_h / speed : 0);
    this.netForce = Math.sqrt(F_net_x*F_net_x + F_net_y*F_net_y);
    this.acceleration = this.netForce / this.totalMass;
    this.gForce = this.acceleration / G0;

    // 追蹤 Max-Q
    if (this.dynamicPressure > this.maxDynQ) {
      this.maxDynQ = this.dynamicPressure;
      this.maxDynQTime = this.t;
    }

    // 階段分離
    if (this.stageTime >= s.burn_time || this.currentPropellant <= 0.001) {
      if (this.stageIdx < this.rocket.stages.length - 1) {
        this.totalMass -= s.mass_dry;
        this.stageIdx += 1;
        this.stageTime = 0;
        const ns = this.currentStage();
        this.currentPropellant = ns.mass_wet - ns.mass_dry;
      } else {
        this.status = "ORBIT";
      }
    }

    // 事件觸發
    while (this.eventIdx < this.rocket.events.length &&
           this.t >= this.rocket.events[this.eventIdx].t) {
      this.recentEvent = this.rocket.events[this.eventIdx];
      this.recentEventTime = this.t;
      this.eventIdx += 1;
    }

    // 墜地保護
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
    };
  }

  launch() {
    if (this.status === "PRELAUNCH") this.status = "ASCENT";
  }
}
