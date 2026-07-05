/**
 * 火箭飛行物理引擎
 *
 * 模型：
 *  - 一維（垂直）飛行 + gravity turn 近似
 *  - Tsiolkovsky 火箭方程 dv = Isp·g·ln(m0/m1)
 *  - 質量流率 mdot = Thrust / (Isp · g0)
 *  - 標準大氣：ρ(h) = ρ0·exp(-h/H)，H≈8500m
 *  - 平方反比重力：g(h) = g0·(R⊕/(R⊕+h))²
 *  - 音速 a = √(γRT)，T 用 標準大氣線性遞減簡化
 *  - 阻力：F_d = ½·ρ·v²·Cd·A
 *
 * 這不是工程級精度，是教學/概念層級。
 */

class RocketSim {
  constructor(rocket) {
    this.rocket = rocket;
    this.reset();
  }

  reset() {
    this.t = 0;
    this.dt = 0.05;             // s

    // 位置與運動狀態
    this.altitude = 0;          // m
    this.velocity_v = 0;        // m/s 垂直
    this.velocity_h = 0;        // m/s 水平（gravity turn 產生）
    this.pitchAngle = 90;       // deg 相對地平（90=垂直、0=水平）

    // 質量狀態
    this.stageIdx = 0;
    this.stageTime = 0;
    // 全級總質量（下級燒完前，上級也在飛）
    this.totalMass = this.calcInitialMass();
    // 當前級剩餘推進劑質量
    const s = this.currentStage();
    this.currentPropellant = s.mass_wet - s.mass_dry;

    // Instantaneous forces
    this.thrust = 0;
    this.gravity = 0;
    this.drag = 0;
    this.netForce = 0;
    this.acceleration = 0;   // m/s²
    this.gForce = 1;         // g

    // Environment
    this.airDensity = RHO0;
    this.mach = 0;
    this.dynamicPressure = 0;

    // Events
    this.eventIdx = 0;
    this.recentEvent = null;
    this.recentEventTime = -Infinity;

    // Status
    this.status = "PRELAUNCH";  // PRELAUNCH | ASCENT | ORBIT | LANDED
  }

  calcInitialMass() {
    return this.rocket.stages.reduce((sum, s) => sum + s.mass_wet, 0);
  }

  currentStage() {
    return this.rocket.stages[this.stageIdx];
  }

  // 剩餘後級質量（下級燒完會分離）
  aboveStageMass() {
    let m = 0;
    for (let i = this.stageIdx + 1; i < this.rocket.stages.length; i++) {
      m += this.rocket.stages[i].mass_wet;
    }
    return m;
  }

  // ============================================================
  // 環境模型
  // ============================================================
  gravityAt(h) {
    return G0 * Math.pow(R_EARTH / (R_EARTH + h), 2);
  }

  airDensityAt(h) {
    // 分段：對流層/平流層/中間層/熱層粗略
    if (h < 11000) return RHO0 * Math.exp(-h / H_SCALE);
    if (h < 50000) return RHO0 * Math.exp(-h / (H_SCALE * 1.1));
    if (h < 100000) return RHO0 * Math.exp(-h / (H_SCALE * 1.4));
    return RHO0 * Math.exp(-h / (H_SCALE * 2)) * 1e-5;  // 高層趨近真空
  }

  temperatureAt(h) {
    // 標準大氣近似（Troposphere 到 stratosphere）
    if (h < 11000) return T0 - 0.0065 * h;
    if (h < 20000) return 216.65;
    if (h < 32000) return 216.65 + 0.001 * (h - 20000);
    if (h < 47000) return 228.65 + 0.0028 * (h - 32000);
    return 270;  // 中氣層以上簡化
  }

  soundSpeedAt(h) {
    return Math.sqrt(GAMMA * R_GAS * this.temperatureAt(h));
  }

  // ============================================================
  // 一步積分
  // ============================================================
  step() {
    if (this.status === "PRELAUNCH" || this.status === "ORBIT") return;

    const s = this.currentStage();
    const g = this.gravityAt(this.altitude);
    const rho = this.airDensityAt(this.altitude);
    const a_sound = this.soundSpeedAt(this.altitude);

    // 推力線性內插（海平面 → 真空）
    const pressureRatio = rho / RHO0;
    const thrust_here = s.thrust_vac - (s.thrust_vac - s.thrust_sl) * pressureRatio;
    const isp_here = s.isp_vac - (s.isp_vac - s.isp_sl) * pressureRatio;

    // 是否還在燃燒
    const inBurn = this.stageTime < s.burn_time && this.currentPropellant > 0;
    const thrust = inBurn ? thrust_here : 0;

    // 質量流率
    const mdot = inBurn ? thrust / (isp_here * G0) : 0;

    // gravity turn 程序（模擬實際 pitch program）
    // 0-1500m: 保持垂直（90°）
    // 1500m-80km: 從 90° 平滑降到 15°
    // 80km+: 從 15° 降到 5°
    if (this.altitude > 1500 && this.pitchAngle > 5) {
      let targetPitch;
      if (this.altitude < 80000) {
        // 對數插值讓早期較平緩
        const p = Math.min(1, (this.altitude - 1500) / 78500);
        targetPitch = 90 - p * 75;  // 90 → 15
      } else {
        targetPitch = Math.max(5, 15 - (this.altitude - 80000) / 20000 * 10);
      }
      // 平滑轉向（每秒最多 3°）
      const maxRate = 3 * this.dt;
      if (this.pitchAngle > targetPitch) {
        this.pitchAngle = Math.max(targetPitch, this.pitchAngle - maxRate);
      }
    }
    const pitchRad = this.pitchAngle * Math.PI / 180;

    // 目前速度大小
    const speed = Math.sqrt(this.velocity_v ** 2 + this.velocity_h ** 2);

    // 空氣動力
    const A = Math.PI * Math.pow(this.rocket.diameter / 2, 2);
    const dynQ = 0.5 * rho * speed ** 2;
    const drag = dynQ * this.rocket.Cd * A;

    // 推力方向 = pitch
    const F_thrust_v = thrust * Math.sin(pitchRad);
    const F_thrust_h = thrust * Math.cos(pitchRad);

    // 阻力方向 = -velocity 方向
    const F_drag_v = speed > 0.01 ? drag * (this.velocity_v / speed) : 0;
    const F_drag_h = speed > 0.01 ? drag * (this.velocity_h / speed) : 0;

    // 重力方向 = 垂直向下
    const F_grav_v = this.totalMass * g;

    // Net acceleration
    const a_v = (F_thrust_v - F_grav_v - F_drag_v) / this.totalMass;
    const a_h = (F_thrust_h - F_drag_h) / this.totalMass;

    // 積分
    this.velocity_v += a_v * this.dt;
    this.velocity_h += a_h * this.dt;
    this.altitude += this.velocity_v * this.dt;
    // 質量消耗
    if (inBurn) {
      const dm = mdot * this.dt;
      this.currentPropellant = Math.max(0, this.currentPropellant - dm);
      this.totalMass -= dm;
    }

    this.t += this.dt;
    this.stageTime += this.dt;

    // 記錄物理量
    this.thrust = thrust;
    this.gravity = F_grav_v;
    this.drag = drag;
    this.netForce = Math.sqrt((F_thrust_v - F_grav_v - F_drag_v) ** 2 + (F_thrust_h - F_drag_h) ** 2);
    this.acceleration = Math.sqrt(a_v ** 2 + a_h ** 2);
    this.gForce = this.acceleration / G0;
    this.airDensity = rho;
    this.mach = speed / a_sound;
    this.dynamicPressure = dynQ;
    this.speed = speed;

    // 階段分離：燒完 → 拋殼 → 換級
    if (this.stageTime >= s.burn_time || this.currentPropellant <= 0) {
      if (this.stageIdx < this.rocket.stages.length - 1) {
        this.totalMass -= s.mass_dry;
        this.stageIdx += 1;
        this.stageTime = 0;
        const ns = this.currentStage();
        this.currentPropellant = ns.mass_wet - ns.mass_dry;
      } else {
        // 最終級燒完：假設進入軌道或彈道
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

    // 判定墜地（僅在推力關閉且明顯下墜時）
    if (this.altitude < 0) {
      this.altitude = 0;
      if (this.t > 5 && thrust === 0 && this.velocity_v < 0) {
        this.velocity_v = 0;
        this.status = "LANDED";
      } else {
        // 推進中：可能是數值誤差，強制夾在 0，不當墜地
        this.velocity_v = Math.max(0, this.velocity_v);
      }
    }
  }

  // 對外簡潔取值
  getState() {
    const s = this.currentStage();
    const propMax = s.mass_wet - s.mass_dry;
    const fuelPct = propMax > 0 ? (this.currentPropellant / propMax) * 100 : 0;
    return {
      t: this.t,
      altitude: this.altitude,
      velocity: this.speed || Math.abs(this.velocity_v),
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
      stage: this.stageIdx + 1,
      stageName: s.name,
      status: this.status,
      pitchAngle: this.pitchAngle,
      totalMass: this.totalMass,
      recentEvent: this.recentEvent,
      recentEventTime: this.recentEventTime,
    };
  }

  launch() {
    if (this.status === "PRELAUNCH") {
      this.status = "ASCENT";
    }
  }
}
