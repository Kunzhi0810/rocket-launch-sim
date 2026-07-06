/**
 * 火箭資料庫
 *
 * 資料來源（全部公開）：
 *   - SpaceX 官網 spacex.com/vehicles/
 *   - NASA 官網 nasa.gov/humans-in-space/space-launch-system/
 *   - Boeing SLS 技術文件
 *   - CNSA 長征五號公開規格
 *   - Wikipedia (cross-referenced with primary sources)
 *   - "Rocket Propulsion Elements" (Sutton & Biblarz)
 *
 * 所有數字以工程近似為主，實機因批次/任務不同會有 ±5-15% 差異。
 */

const G0 = 9.80665;      // m/s² 標準重力
const R_EARTH = 6371e3;  // m
const RHO0 = 1.225;      // kg/m³ 海平面標準大氣密度
const H_SCALE = 8500;    // m 大氣標高
const T0 = 288.15;       // K 海平面標準溫度
const GAMMA = 1.4;
const R_GAS = 287;       // J/(kg·K) 空氣

const ROCKETS = {

  // ===============================================================
  // SpaceX Falcon 9 Block 5
  // ===============================================================
  falcon9: {
    name: "Falcon 9 Block 5",
    manufacturer: "SpaceX",
    firstFlight: 2018,
    heroColor: "#e8e8e8",
    height: 70,           // m
    diameter: 3.7,        // m
    payloadLEO: 22800,    // kg
    totalMass: 549054,    // kg (fully fueled)
    Cd: 0.5,              // 粗略平均氣動阻力係數
    launchSite: "Cape Canaveral / Vandenberg",
    launchLatitude: 28.5, // deg，Cape Canaveral

    // v3: 回收設定（Falcon 9 特有）
    recovery: {
      type: "propulsive",
      boostback: { start_after_meco: 5, duration: 30 },
      entry_burn: { altitude: 70000, end_altitude: 40000 },
      landing_burn: { altitude: 8000 },
    },

    stages: [
      {
        name: "First Stage (B5)",
        propellant: "RP-1 / LOX",
        engines: { type: "Merlin 1D+", count: 9, cycle: "Gas generator" },
        thrust_sl: 7607e3,     // N (全 9 顆，海平面)
        thrust_vac: 8227e3,    // N (真空)
        isp_sl: 282,           // s
        isp_vac: 311,
        mass_wet: 410250,      // kg，一級（推進劑 ~384.6 t + dry 25.6 t）
        mass_dry: 25600,       // kg
        burn_time: 162,        // s
      },
      {
        name: "Second Stage",
        propellant: "RP-1 / LOX",
        engines: { type: "Merlin Vacuum (MVac)", count: 1, cycle: "Gas generator" },
        thrust_sl: 934e3,
        thrust_vac: 981e3,
        isp_sl: 311,
        isp_vac: 348,
        mass_wet: 116000,      // kg（推進劑 ~112.1 t + dry 3.9 t）
        mass_dry: 3900,
        burn_time: 397,
      },
    ],

    materials: [
      { name: "鋁鋰合金 2195 (Al-Li)", percent: 55, note: "低密度高強度、儲槽主體" },
      { name: "不鏽鋼 (interstage/thrust)", percent: 15, note: "推力結構高溫段" },
      { name: "碳纖維複合材料 (COPV)", percent: 12, note: "氦氣加壓瓶、酬載罩" },
      { name: "Inconel/耐高溫合金", percent: 10, note: "Merlin 燃燒室、渦輪泵" },
      { name: "PICA-X 隔熱瓦", percent: 3, note: "再入防熱（用於龍飛船）" },
      { name: "其他（電子、線材）", percent: 5, note: "" },
    ],

    fuelDetails: {
      fuel: {
        name: "RP-1 (Rocket Propellant-1)",
        formula: "≈ C₁₂H₂₆ (煤油衍生物)",
        density: 810,           // kg/m³
        specificEnergy: 43e6,   // J/kg 化學能
        combustionTemp: 3670,   // K
        boilPoint: 490,         // K，常溫可儲存
      },
      oxidizer: {
        name: "液氧 LOX",
        formula: "O₂",
        density: 1141,          // kg/m³
        boilPoint: 90,          // K（-183 °C）
      },
      OFratio: 2.34,            // 質量比 (O/F)
      cycle: "Gas Generator（開放循環）",
      isp_sl: 282,
      chamberPressure: 97,      // bar
      note: "RP-1 常溫可儲、密度高、渦輪泵設計成熟；缺點是積碳（結焦）→ 舊 Merlin 版本無法重用",
    },

    // 真實遙測（FlightClub / SpaceX 官方 / NASA Launch Report）
    telemetry: {
      maxQ_kPa: 35,          // 實測 30-35 kPa 之間
      maxQ_time_s: 78,       // T+1:18
      MECO_alt_km: 78,       // 一級關機高度
      MECO_vel_ms: 2400,     // 一級關機速度
      SECO_alt_km: 200,      // LEO 軌道高度
      SECO_vel_ms: 7800,     // 軌道速度
      MECO_time_s: 162,
    },

    events: [
      { t: 0,   name: "T-0: Liftoff",                    detail: "9 顆 Merlin 全部點火，離架瞬間 T/W ≈ 1.4" },
      { t: 10,  name: "T+10: Tower clear",               detail: "離架完成，開始 pitch-over（gravity turn）" },
      { t: 76,  name: "T+76: Max-Q",                     detail: "最大動壓 ≈ 33 kPa，約 Mach 1.2" },
      { t: 162, name: "T+2:42: MECO",                    detail: "Main Engine Cutoff（一級關機）" },
      { t: 165, name: "T+2:45: Stage separation",        detail: "氣壓推桿分離，一級開始回收機動" },
      { t: 168, name: "T+2:48: SES-1 (MVac ignition)",   detail: "二級真空 Merlin 點火" },
      { t: 480, name: "T+8:00: Fairing separation",      detail: "整流罩拋離（酬載已在真空）" },
      { t: 555, name: "T+9:15: SECO-1",                  detail: "二級關機，進入停泊軌道" },
    ],
  },

  // ===============================================================
  // SpaceX Starship (Super Heavy + Ship) 完整堆疊
  // ===============================================================
  starship: {
    name: "Starship (V2)",
    manufacturer: "SpaceX",
    firstFlight: 2023,
    heroColor: "#c8d0d8",
    height: 121,
    diameter: 9,
    payloadLEO: 150000,     // kg（v2 目標）
    totalMass: 5000e3,      // kg（含推進劑 4600 t + 兩級乾重）
    Cd: 0.45,
    launchSite: "Starbase, TX",
    launchLatitude: 26.0,   // deg，Boca Chica

    stages: [
      {
        name: "Super Heavy (Booster)",
        propellant: "CH₄ / LOX",
        engines: { type: "Raptor 3", count: 33, cycle: "Full-Flow Staged Combustion" },
        // Raptor 3: 280 tf 海平面, 350 s Isp, 350 bar chamber pressure
        thrust_sl: 280e3 * G0 * 33,    // 280 tf × 9.80665 × 33 顆 ≈ 90.6 MN
        thrust_vac: 305e3 * G0 * 33,   // 305 tf × 33
        isp_sl: 327,
        isp_vac: 350,
        mass_wet: 3675e3,               // 3400 t 推進劑 + 275 t dry
        mass_dry: 275e3,
        burn_time: 155,
      },
      {
        name: "Starship (Ship)",
        propellant: "CH₄ / LOX",
        engines: { type: "3 × Raptor SL + 3 × Raptor Vac", count: 6, cycle: "Full-Flow Staged" },
        thrust_sl: (280e3 + 305e3) * G0 * 3,   // 3 顆海平面 + 3 顆真空型
        thrust_vac: 305e3 * G0 * 6,             // 全部視為真空型
        isp_sl: 350,
        isp_vac: 380,
        mass_wet: 1450e3,               // 1200 t 推進劑 + 250 t dry (v3)
        mass_dry: 250e3,
        burn_time: 380,
      },
    ],

    materials: [
      { name: "304L 不鏽鋼", percent: 90, note: "低溫韌性佳、耐熱、便宜；SpaceX 逆常規的核心決定" },
      { name: "隔熱瓦（矽基）", percent: 4, note: "再入面板（TPS）" },
      { name: "Inconel（引擎）", percent: 3, note: "Raptor 燃燒室材料" },
      { name: "碳纖維（襟翼/次結構）", percent: 2, note: "" },
      { name: "其他", percent: 1, note: "" },
    ],

    fuelDetails: {
      fuel: {
        name: "液態甲烷 CH₄",
        formula: "CH₄",
        density: 422,
        specificEnergy: 55.5e6,  // J/kg
        combustionTemp: 3550,
        boilPoint: 112,          // K
      },
      oxidizer: {
        name: "液氧 LOX",
        formula: "O₂",
        density: 1141,
        boilPoint: 90,
      },
      OFratio: 3.6,
      cycle: "Full-Flow Staged Combustion（全流分級燃燒）",
      isp_sl: 327,
      chamberPressure: 350,      // bar (Raptor 3 目標)
      note: "選甲烷是為了『火星就地製造』：CO₂ + H₂ (Sabatier 反應) 可原地產甲烷。積碳少 → 快速重用。全流分級是史上首次量產。",
    },

    telemetry: {
      maxQ_kPa: 40,
      maxQ_time_s: 55,
      MECO_alt_km: 65,
      MECO_vel_ms: 2000,
      SECO_alt_km: 200,
      SECO_vel_ms: 7500,
      MECO_time_s: 155,
    },

    events: [
      { t: 0,   name: "T-0: Liftoff",                    detail: "33 顆 Raptor 齊點，推力 ≈ 7590 tf，T/W ≈ 1.5" },
      { t: 60,  name: "T+60: Max-Q",                     detail: "最大動壓約 35 kPa" },
      { t: 155, name: "T+2:35: Booster MECO + hot-stage", detail: "Booster 關 30 顆、留 3 顆繼續 → Ship 點火 → 分離" },
      { t: 165, name: "T+2:45: Ship SES",                detail: "Ship 六顆 Raptor 點火" },
      { t: 420, name: "T+7:00: Booster catch",           detail: "Booster 用 Mechazilla 大手接回發射塔" },
      { t: 540, name: "T+9:00: Ship SECO",               detail: "Ship 主引擎關機，進入軌道" },
    ],
  },

  // ===============================================================
  // NASA Saturn V (Apollo-era classic)
  // ===============================================================
  saturn5: {
    name: "Saturn V",
    manufacturer: "NASA / Boeing / North American / Douglas",
    firstFlight: 1967,
    heroColor: "#f5f2ea",
    height: 110.6,
    diameter: 10.1,
    payloadLEO: 140000,
    totalMass: 2970e3,
    Cd: 0.6,
    launchSite: "Kennedy Space Center LC-39",
    launchLatitude: 28.6,   // deg

    stages: [
      {
        name: "S-IC (First Stage)",
        propellant: "RP-1 / LOX",
        engines: { type: "F-1", count: 5, cycle: "Gas generator" },
        thrust_sl: 34.5e6,      // 全 5 顆
        thrust_vac: 38.7e6,
        isp_sl: 263,
        isp_vac: 304,
        mass_wet: 2290e3,
        mass_dry: 130e3,
        burn_time: 168,
      },
      {
        name: "S-II (Second Stage)",
        propellant: "LH₂ / LOX",
        engines: { type: "J-2", count: 5, cycle: "Gas generator" },
        thrust_sl: 5e6,
        thrust_vac: 5.6e6,
        isp_sl: 380,
        isp_vac: 421,
        mass_wet: 480e3,
        mass_dry: 40e3,
        burn_time: 384,
      },
      {
        name: "S-IVB (Third Stage)",
        propellant: "LH₂ / LOX",
        engines: { type: "J-2", count: 1, cycle: "Gas generator" },
        thrust_sl: 890e3,
        thrust_vac: 1033e3,
        isp_sl: 380,
        isp_vac: 421,
        mass_wet: 120e3,
        mass_dry: 10e3,
        burn_time: 165,   // 首次燃燒到 LEO parking
      },
    ],

    materials: [
      { name: "鋁合金 2014-T6", percent: 60, note: "當年航太主力鋁合金" },
      { name: "不鏽鋼 (S-IC 引擎架)", percent: 15, note: "" },
      { name: "Inconel-X (J-2/F-1 熱端)", percent: 10, note: "" },
      { name: "鈦合金 (壓力容器)", percent: 5, note: "" },
      { name: "軟木隔熱 (LH₂ 儲槽外)", percent: 4, note: "S-II 儲槽外壁貼軟木保冷" },
      { name: "其他", percent: 6, note: "" },
    ],

    fuelDetails: {
      fuel: {
        name: "S-IC: RP-1；S-II/S-IVB: 液氫 LH₂",
        formula: "S-IC: 煤油；S-II/S-IVB: H₂",
        density: 71,             // LH₂ 密度極低
        specificEnergy: 120e6,   // LH₂ 化學能極高
        combustionTemp: 3000,
        boilPoint: 20,           // LH₂ 液化溫度 20K（-253°C）
      },
      oxidizer: {
        name: "液氧 LOX",
        formula: "O₂",
        density: 1141,
        boilPoint: 90,
      },
      OFratio: 5.5,
      cycle: "Gas generator（開放循環）",
      isp_sl: 263,
      chamberPressure: 70,
      note: "S-IC 用 RP-1（高推力起飛）；S-II/S-IVB 換 LH₂（Isp 高、輕）。氫的儲存挑戰極大——體積是甲烷 6 倍，容器極大且需超級絕熱。",
    },

    telemetry: {
      maxQ_kPa: 33,
      maxQ_time_s: 82,
      MECO_alt_km: 68,
      MECO_vel_ms: 2688,       // Apollo 11 實測
      SECO_alt_km: 185,        // S-II 關機
      SECO_vel_ms: 6890,       // S-II 關機速度
      MECO_time_s: 168,
    },

    events: [
      { t: 0,   name: "T-0: Liftoff",                detail: "5 顆 F-1，34.5 MN 推力，T/W ≈ 1.15" },
      { t: 80,  name: "T+1:20: Max-Q",              detail: "≈ 30 kPa" },
      { t: 135, name: "T+2:15: Center engine cutoff", detail: "中央 F-1 提前關以降低 G" },
      { t: 168, name: "T+2:48: S-IC MECO",           detail: "一級關機" },
      { t: 171, name: "T+2:51: S-IC/S-II sep",       detail: "" },
      { t: 555, name: "T+9:15: S-II MECO",           detail: "" },
      { t: 559, name: "T+9:19: S-II/S-IVB sep",      detail: "" },
      { t: 720, name: "T+12:00: S-IVB first cutoff", detail: "進入 185 km parking orbit" },
    ],
  },

  // ===============================================================
  // CNSA Long March 5 (中國最強現役火箭)
  // ===============================================================
  longmarch5: {
    name: "長征五號 (CZ-5)",
    manufacturer: "CNSA / CALT",
    firstFlight: 2016,
    heroColor: "#ffffff",
    height: 57,
    diameter: 5,
    payloadLEO: 25000,
    totalMass: 869e3,
    Cd: 0.55,
    launchSite: "文昌 (Wenchang)",
    launchLatitude: 19.6,   // deg，文昌

    stages: [
      {
        name: "芯一級 + 4 助推器",
        propellant: "LH₂/LOX (芯) + RP-1/LOX (助推)",
        engines: { type: "YF-77 × 2 (芯) + YF-100 × 8 (助推)", count: 10, cycle: "Gas gen / Staged" },
        thrust_sl: 10.5e6,
        thrust_vac: 12e6,
        isp_sl: 305,
        isp_vac: 335,
        mass_wet: 780e3,
        mass_dry: 60e3,
        burn_time: 180,
      },
      {
        name: "芯二級",
        propellant: "LH₂ / LOX",
        engines: { type: "YF-75D", count: 2, cycle: "Expander cycle" },
        thrust_sl: 176e3,
        thrust_vac: 186e3,
        isp_sl: 420,
        isp_vac: 442,
        mass_wet: 55e3,
        mass_dry: 6e3,
        burn_time: 700,
        // v3: 兩次燃燒 + 中間 coast phase（真實 LM5 GTO 任務模型）
        burn_sequences: [
          { start: 0,   duration: 250, throttle_max: 1.0 },  // 第一次燃燒進入 parking orbit
          { start: 250, duration: 200, throttle_max: 0.0 },  // Coast phase 200s
          { start: 450, duration: 250, throttle_max: 1.0 },  // 第二次燃燒進入最終軌道
        ],
      },
    ],

    materials: [
      { name: "鋁合金 2219 (芯級儲槽)", percent: 50, note: "" },
      { name: "碳纖維複合材料 (助推器頭錐)", percent: 15, note: "" },
      { name: "不鏽鋼 + Inconel（引擎）", percent: 15, note: "" },
      { name: "軟木/PU 隔熱層 (LH₂ 儲槽)", percent: 8, note: "" },
      { name: "鈦合金 (壓力容器)", percent: 4, note: "" },
      { name: "其他", percent: 8, note: "" },
    ],

    fuelDetails: {
      fuel: {
        name: "芯級 LH₂ + 助推 RP-1",
        formula: "H₂ + C₁₂H₂₆",
        density: 71,
        specificEnergy: 120e6,
        combustionTemp: 3200,
        boilPoint: 20,
      },
      oxidizer: {
        name: "液氧 LOX",
        formula: "O₂",
        density: 1141,
        boilPoint: 90,
      },
      OFratio: 5.0,
      cycle: "Gas Generator (助推) + Expander (二級)",
      isp_sl: 305,
      chamberPressure: 100,
      note: "採 hybrid 燃料：芯級用氫（高 Isp）、助推用 RP-1（高推力）。這是 1990s 後蘇聯 Zenit / 歐洲 Ariane 5 學來的整合設計。",
    },

    telemetry: {
      maxQ_kPa: 34,
      maxQ_time_s: 80,
      MECO_alt_km: 90,
      MECO_vel_ms: 3500,
      SECO_alt_km: 200,
      SECO_vel_ms: 7800,
      MECO_time_s: 175,
      note: "LM5 二級 T/W 極低 (0.22) 需 coast+多次點火，此教學模型不建 coast",
    },

    events: [
      { t: 0,   name: "T-0: Liftoff",              detail: "芯+4 助推齊點" },
      { t: 90,  name: "T+1:30: Max-Q",             detail: "" },
      { t: 175, name: "T+2:55: 助推分離",           detail: "4 顆固捆助推燒完拋離" },
      { t: 470, name: "T+7:50: 芯一級分離",         detail: "" },
      { t: 475, name: "T+7:55: 芯二級點火",         detail: "" },
      { t: 1200, name: "T+20:00: 二級關機",         detail: "進入軌道" },
    ],
  },

};

// 便利: 常用單位換算
const KM = v => (v / 1000).toFixed(2);
const KN = v => (v / 1000).toFixed(0);
const MN = v => (v / 1e6).toFixed(2);
const TONS = v => (v / 1000).toFixed(0);
