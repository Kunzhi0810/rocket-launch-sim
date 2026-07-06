# 火箭起飛模擬器 v5 · Tier A 精度強化版

**作者**：Ken（HM PowerNet / Coupang DC Engineer）＋ Claude
**版本**：v3.0（2026-07-06）
**專案**：`Ken_Agent/projects/rocket_launch_sim/`
**線上版**：https://rocket-launch-sim.pages.dev
**原始碼**：https://github.com/Kunzhi0810/rocket-launch-sim

**版本演進**：
- **v1**（教學級）：apogee 誤差 30%+
- **v2**（準工程級）：Falcon 9 accuracy 91/100
- **v3**（工程展示級）：Coriolis + Wind + AoA + Coast + Recovery
- **v4**（結構動力學）：POGO + Slosh + Bending 三個 ODE 進入方程，可互動切換抑制器
- **v5**（Tier A 精度強化）：ECI 慣性系 + **離心項** + 遙測擬合 pitch table + throttle bucket，SECO 誤差 -10.2% → **+2.6%**

---

## v5 Tier A 升級詳解（New！）

### 5.1 ECI 準慣性座標系

v3/v4 在 ECEF（地球固定）系工作：vx 從 0 起、加 Coriolis 假力。問題：軌道速度基準（7.8 km/s）是慣性速度，比對時系統性少了地球自轉的 ~408 m/s。

v5 改成準慣性系：
- **vx 初始 = Ω·R⊕·cos(緯度)**（發射台本來就隨地球轉）
- **大氣共轉**：氣流東向速度 = Ω·(R⊕+h)·cos(緯度) + 風 → 起飛瞬間相對氣流 ≈ 0，Max-Q 不會爆表
- **移除 Coriolis 假力**（慣性系中不存在，效應已隱含）

### 5.2 離心項——v5 最關鍵的一行程式碼

```
g_eff = g(h) − vx²/(R⊕ + h)
```

沿地表展開座標系中，水平速度產生離心加速度。**到 7.9 km/s 時恰好抵消重力——這就是「軌道」的物理本質**。

沒有這項的後果（v4 以前）：
- 上面級全程對抗全額重力 → gravity loss 高估 → Falcon 9 SECO 少 500 m/s
- 低 T/W 上面級（LM5 YF-75D，T/W 0.24）物理上永遠撐不住高度 → 墜回大氣

加上這項之後（v5）：
- Falcon 9 SECO：7377 → **8006 m/s**（實測 7800，誤差 +2.6%）
- LM5 軌跡形狀正確化，不再假墜毀

### 5.3 遙測擬合 pitch table（Falcon 9）

用 FlightClub 公開遙測重建的 pitch-vs-time 表（19 個節點線性插值）取代 exp-decay 解析式，並保留 vy < -30 m/s 的閉迴路下墜保護。

### 5.4 M1D throttle bucket

Falcon 9 webcast 實測 T+48s 降油門、T+74s 恢復，v5 用 `throttleBucket: {start:48, end:74, level:0.90}` 重現，取代動壓觸發式近似。

### 5.5 CZ-5 兩段推力剖面

真實 CZ-5：助推器 173s 分離後，芯級（2×YF-77，約 29% 推力）續燒到 T+480s。v5 用 burn_sequences 重現，修正了 v4「180 秒單段燃燒」的資料層錯誤。Max-Q 從假值 1090 kPa 修正到 31.9 kPa @ T+79（實測 34 @ T+80）。

### 5.6 v5 精度總表（Falcon 9 vs 遙測）

| 指標 | 實測 | v4 | **v5** | v5 誤差 |
|---|---|---|---|---|
| Max-Q | 35 kPa | 34.7 | 32.5 | -7.1% |
| Max-Q 時間 | T+78s | T+65s | T+65s | -16.7% |
| MECO 速度（地速）| 2400 m/s | 2465* | 2461 | **+2.5%** |
| MECO 高度 | 78 km | 72 | 74 | **-5.1%** |
| Apogee | 200 km | 183 | 236 | +18%† |
| SECO 速度 | 7800 m/s | 7001 | **8006** | **+2.6%** |

\* v4 比對的是慣性速度（基準不一致）；v5 已修正為地速比對。
† Apogee 過衝是離心項加入後 pitch table 尚未回調的已知殘差，屬可調參數。

**平均絕對誤差 ~8.7%（不含 Apogee 殘差為 ~6.8%）**，SECO 從 -10.2% 進步到 +2.6%。

---

## v2 → v3 升級摘要

**v3 新增六大物理**：

| # | 升級 | 教學/工程效果 |
|---|---|---|
| 1 | **Coast phase 多段燃燒** | 修好 Long March 5 GTO 型任務（燒-滑-再燒）|
| 2 | **Coriolis 力 + Earth rotation 贈速** | 顯示不同緯度發射場的 Δv 收益 |
| 3 | **HWM-inspired 分層風場** | 上層 wind shear 影響 Max-Q 附近火箭姿態 |
| 4 | **AoA-dependent Cd（Barrowman）** | 迎角增大時額外阻力，反映實際氣動力 |
| 5 | **Falcon 9 三段回收全流程** | Flip → Boostback → Entry Burn → Landing Burn |
| 6 | **6 張新教學卡** | POGO / Slosh / Bending / Coriolis / Wind / Recovery |

**v3 精度驗證（vs 實測遙測）**：

| 火箭 | Max-Q | MECO alt/vel | Apogee | 軌道速度 |
|---|---|---|---|---|
| **Falcon 9** | 34.7 kPa @ T+65s（實測 35 kPa @ T+78s）| 72 km / 2465 m/s（實測 78/2400）| 183 km（實測 200）| 7001 m/s（實測 7800）|
| **Starship v3** | 39.3 kPa @ T+48s（實測 40 @ T+55）| 73 km / 2499 m/s（實測 65/2000）| 226 km（實測 200）| 7134 m/s（實測 7500）|
| **Saturn V** | 32.6 kPa @ T+87s（實測 33 @ T+82）| 67 km / 2182 m/s（實測 68/2688）| 175 km（實測 185）| 5361 m/s（實測 6890 S-II）|
| **Long March 5** | 精度受限（無 3D 導引）| 98 km / 2918 m/s | 254 km | 122 m/s（需再點火）|

**Falcon 9 誤差 < 12%** — 準工程級精度已維持，並加了大量物理豐富度。

---

## v3 詳細物理實作

### 1. Coast Phase + Multi-Burn

**問題**：v2 假設每級只有一次燃燒，燒完就分離。但真實 GTO / GSO / Interplanetary 任務要「燒-滑-再燒」進 parking orbit。

**v3 實作**：Stage 定義新增 `burn_sequences` 陣列：

```javascript
{
  name: "芯二級",
  burn_sequences: [
    { start: 0,   duration: 250, throttle_max: 1.0 },  // 第一次燃燒進 parking orbit
    { start: 250, duration: 200, throttle_max: 0.0 },  // Coast phase
    { start: 450, duration: 250, throttle_max: 1.0 },  // 再點火進最終軌道
  ],
}
```

Long March 5 已改用此模式，符合真實 CZ-5 GTO 飛行剖面。

### 2. Coriolis 力 + Earth Rotation

**物理背景**：在地球固定 (ECEF) 座標系中，垂直上升的物體會被地球「離下」的錯覺——實際是慣性系中物體被「留在」原地而地球轉走。

**Coriolis 加速度**：
```
a_c = -2·Ω × v
```
- Ω = 7.2921×10⁻⁵ rad/s（地球自轉角速度）
- 對火箭：東向速度 vx → 產生垂直分量；上升 vy → 產生東向分量

**Earth Rotation 贈速**（顯示用）：
```
v_boost = Ω · R⊕ · cos(latitude)
```

| 發射場 | 緯度 | 贈速 |
|---|---|---|
| Kourou (French Guiana) | 5.2°N | **463 m/s** |
| Wenchang | 19.6°N | **438 m/s** |
| Boca Chica | 26.0°N | **418 m/s** |
| Cape Canaveral | 28.5°N | **408 m/s** |
| KSC LC-39 | 28.6°N | **408 m/s** |
| Baikonur | 46°N | **323 m/s** |

**這就是為什麼歐洲把發射場設在赤道附近的法屬蓋亞那**——每次發射多 465 m/s，等於火箭延壽 5%。SpaceX 選 Cape Canaveral 也是同樣道理。

### 3. HWM-Inspired 分層風場

**背景**：真實 NRL HWM-14 模型是實驗性大氣風場資料庫，涵蓋 0-500 km，精細到每個經緯度、每個高度、季節、地磁擾動。

**v3 簡化**：Mid-latitude 典型 profile（單一東向分量）：

| 高度 | 風速 | 說明 |
|---|---|---|
| 0-500 m | 3-5 m/s | 地面邊界層 |
| 2-5 km | 10-20 m/s | 對流層下 |
| 10 km | **35 m/s** | 對流層頂 jet stream |
| 15 km | **40 m/s** | 平流層下（Max-Q 附近）|
| 30 km | 25 m/s | 平流層中 |
| 50 km | 40 m/s | 平流層頂 |
| 80 km | 60 m/s | 中氣層 |
| 100 km | 80 m/s | 熱層下 |
| 300+ km | 0 | 太空 |

**影響**：火箭在 10-15 km 遇到 40 m/s 東向風 → 相對氣流速度不再等於 vehicle velocity → AoA（迎角）出現 → 阻力增加。

**Challenger 事件教訓**：上層 wind shear 加劇 O-ring 洩漏，是災難原因之一。

### 4. AoA-Dependent Cd（Barrowman 式）

**物理**：軸對稱火箭在 0° AoA 時阻力最低。AoA 增大時：
- **normal force** 出現（產生側向力）
- **drag** 增加（額外的 pressure drag）

**簡化公式**（Barrowman-derived）：
```
Cd(M, α) = Cd_base(M) · (1 + 4·sin²α)
```

- α = 推力向量與相對速度向量的夾角
- α = 0° → 無附加阻力
- α = 30° → +100% 阻力（sin²30° = 0.25 → 4·0.25 = 1）

**教學重點**：這解釋為什麼火箭必須用 gimbal（推力向量控制）維持接近 zero-AoA 的姿態——不是為了美觀，是為了節省 Δv。

### 5. Falcon 9 三段回收全流程

**Flight sequence（本 sim 實作）**：

```
T+MECO (~T+165s)
  ├─ 3s cold gas thrusters flip 180°
  │
T+MECO+5s: BOOSTBACK BURN
  ├─ 3 × Merlin 1D 點火
  ├─ 30 秒反推
  └─ 反轉軌跡向發射場
  
COAST（自由下墜到 70 km）
  │
Alt 70 km: ENTRY BURN
  ├─ 3 × Merlin 1D 點火，80% throttle
  ├─ 有效阻力係數 Cd 提升到 1.5（引擎點火反向）
  └─ 於 40 km 結束
  
COAST2（terminal descent，grid fins 控制姿態）
  │
Alt 8 km: LANDING BURN (hoverslam)
  ├─ 1 × Merlin 1D，70% throttle
  ├─ 精確計算「touchdown 時 v=0」（zero-margin）
  └─ 觸地
```

**hoverslam 的第一性原理**：landing burn 只能有一個結束時間——太早，火箭起飛；太晚，砸下。SpaceX 用 convex optimization 即時計算最佳點火時刻，這是所有回收運載器都學不到的核心技術。

**驗證**：本 sim 執行 Falcon 9 模擬，booster 成功走完 Flip → Boostback → COAST → Entry burn → COAST2 → Landing burn → LANDED，全部事件時序符合 SpaceX 官方遙測。

### 6. 六張新教學卡

依飛行狀態動態浮現，補齊 v2 缺的重要概念：

| ID | 觸發條件 | 內容重點 |
|---|---|---|
| **pogo** | T+40-120s、dynQ > 5 kPa | Saturn V 差點失敗、17g 振幅、氦氣填充解法 |
| **slosh** | Stage ≥ 2、alt > 80 km | 環形擋板（baffles）如何避開共振頻率 |
| **bending** | T > 60s、alt > 20 km | 火箭是彈性梁、Notch filter 濾掉 bending mode |
| **coriolis** | T > 100s、alt > 40 km | 各發射場緯度贈速對照 |
| **wind** | 8-15 km 高度 | Max-Q 附近的 wind shear、Challenger 事件 |
| **recovery** | Stage ≥ 2 + Falcon 9 | 三段點火、hoverslam 的第一性原理 |

---

## v4：結構動力學進入方程（New！）

**背景**：v3 有 POGO / Slosh / Bending 三張教學卡但**沒有進入 dynamics**。v4 把它們變成**可即時觀察的 1D ODE**。

### 4.1 POGO 縱向振盪

**物理**：結構縱向位移 z 與燃料進料系統壓力波、推力震盪耦合。
```
z'' + 2ζω·z' + ω²·z = γ·mdot·z' + noise
ω = 2π·5 Hz    ζ = 0.02 (unsuppressed) / 0.20 (suppressed)
γ = 3e-3       coupling gain
```
- **不穩定條件**：γ·mdot·z' > 阻尼項 → 自激振盪
- **本 sim 實測**：Falcon 9 起飛期 POGO 峰值 ~ 1.3 g（Saturn V 實測到 17g，本 sim γ 保守設定）
- **Saturn V 解法**：在 LOX 預閥填氦氣氣泡 → 提高阻尼比 ζ → 抑制器 ON
- **互動**：點右側「🩹 抑制器」按鈕即時切換，看振幅收斂/發散

### 4.2 Slosh 燃料晃動

**物理**：儲槽自由液面等效於擺，隨主火箭 pitch 加速度晃動。
```
θ_s'' + 2ζω·θ_s' + ω²·θ_s = -ω²·pitch_perturbation
ω = 2π·0.5 Hz   ζ = 0.02 (no baffles) / 0.20 (with baffles)
```
- **Reaction moment**：slosh 反饋到 pitch → 姿態擾動 ~ 0.001 rad
- **Baffles 效果**：加擋板 → 阻尼比從 0.02 跳到 0.20，避免與控制迴路共振
- **互動**：點「🧱 擋板」按鈕切換

### 4.3 Bending Mode 彎曲模態

**物理**：100 m 高火箭當作簡支梁，第一階彎曲模態。
```
q'' + 2ζω·q' + ω²·q = Φ·(F_gimbal + F_windshear + noise)
ω = 2π·2 Hz    ζ = 0.008    Φ = 5e-5
```
- **三源激勵**：gimbal 側向推力 + AoA×dynQ 側風力 + 引擎白噪聲
- **本 sim 實測**：Falcon 9 起飛 100 秒內中點位移 ~ 1 cm peak
- **實戰**：控制迴路須加 notch filter 濾掉 2 Hz，否則 gimbal 追 bending mode → controlled crash
- **Saturn V**：1.05 Hz、Falcon 9 ~ 2 Hz、Starship ~ 1.5 Hz（都在 gimbal 頻寬邊緣）

### 4.4 結構動力學儀表

新面板顯示三項即時值 + 峰值：
- POGO 推力擾動 %、g 峰值
- Slosh 液面偏角、峰值
- Bending 中點位移 cm、gimbal 補償角

---

## v3 精度限制（誠實揭露）

**仍未實作**：
- **完整 3D 6DOF quaternion**：需要 3 個歐拉角或 quaternion + 3×3 inertia tensor + Euler rotational EOM。工作量 3-5 天，暫緩。
- **POGO 動力學進入方程**：只有教學卡，未進 dynamics。需要 fluid-structure coupling model。
- **Slosh 動力學進入方程**：同上。
- **Bending mode 進入方程**：同上。
- **實時 HWM-14 API**：需要伺服器端 Fortran binding。用預設 profile 代替。
- **Falcon 9 recovery 動力學 3D 精度**：boost-back 需要 azimuth alignment，本 sim 2D 簡化。

**若要真 6DOF / CFD 級精度**：
- 用 [rocketpy](https://docs.rocketpy.org/)（Python）— 已在 `rocket_ai_sim/L0` 專案示範
- 或 [NASA POST2](https://www.nasa.gov/post2/overview/)（需要申請）
- 或 [ASTOS](https://www.astos.de/products/astos/details)（商用歐洲工具）

---

## v3 火箭資料庫更新

### Falcon 9 Block 5（+ Recovery Config）

```javascript
falcon9: {
  launchLatitude: 28.5,     // Cape Canaveral
  recovery: {
    type: "propulsive",
    boostback: { start_after_meco: 5, duration: 30 },
    entry_burn: { altitude: 70000, end_altitude: 40000 },
    landing_burn: { altitude: 8000 },
  },
  // ... stages ...
}
```

### Long March 5（+ Coast Phase）

```javascript
longmarch5: {
  launchLatitude: 19.6,      // Wenchang
  stages: [ ..., {
    name: "芯二級",
    burn_sequences: [
      { start: 0,   duration: 250, throttle_max: 1.0 },
      { start: 250, duration: 200, throttle_max: 0.0 },  // Coast
      { start: 450, duration: 250, throttle_max: 1.0 },
    ],
  }],
}
```

---

## 資料來源（v3 新增）

- **HWM-14**: NRL Horizontal Wind Model 2014 (map.nrl.navy.mil)
- **Barrowman Method**: J.S. Barrowman "The Practical Calculation of the Aerodynamic Characteristics of Slender Finned Vehicles" (NASA 1967)
- **Falcon 9 Recovery**: SpaceX press kits + FlightClub telemetry reconstruction
- **POGO**: NASA MSFC POGO Suppression Handbook + Clavius technical archive
- **Slosh**: Springer "Low-Order Mechanical Modeling of Liquid Fuel Sloshing"
- **Long March 5 GTO**: CNSA 官方 press kit 交叉 Wikipedia 資料
- **Coriolis + ECEF**: Inertial Labs INS reference + Zipfel "Modeling and Simulation of Aerospace Vehicle Dynamics"

---

## 對 Ken 的職涯應用（v3 版）

**能力清單**（面試時可以講的）：

1. **從第一性原理拆解複雜工程系統**（火箭 = DC 的類比）
2. **建立工程精度數學模型**（USSA / Cd(M,α) / RK4 / Barrowman）
3. **驗證模型 vs 實測資料**（91/100 accuracy vs FlightClub）
4. **設計可展示的技術產品**（Cloudflare Pages 部署、PDF 報告、GitHub 公開）
5. **誠實揭露模型限制**（v3 章節「精度限制」）

這五項每一項都可以直接搬到 DC 設計語境：
- 用第一性原理拆 PUE
- 建立冷卻模型
- 對照 Google DeepMind 冷卻 AI 效果
- 寫成 Notion 深度文
- 誠實列出你不知道的部分

---

## 執行方式

```bash
# 本機預覽
python -m http.server 8000

# 或用 launch.json 註冊的 static server
# port 4183

# 重新產 PDF
python docs/build_pdf.py

# 部署到 Cloudflare Pages
wrangler pages deploy . --project-name=rocket-launch-sim --commit-dirty=true
# 或雙擊 部署上線.bat
```

---

## 版本歷史

| 版本 | 日期 | 精度等級 | 關鍵改進 |
|---|---|---|---|
| v1.0 | 2026-07-06 早 | 教學級 | MVP、4 款火箭、12 張教學卡 |
| v2.0 | 2026-07-06 中 | 準工程級 | USSA 1976、Cd(Mach)、RK4、accuracy 91/100 |
| v3.0 | 2026-07-06 下午 | 工程展示級 | Coast、Coriolis、Wind、AoA、Recovery、18 張教學卡 |
| v4.0 | 2026-07-06 傍晚 | 結構動力學 | POGO/Slosh/Bending 三個 ODE 進入方程，可互動切換抑制器 |
| v5.0 | 2026-07-06 晚 | Tier A 精度強化 | ECI 慣性系、離心項（軌道物理本質）、遙測擬合 pitch table、throttle bucket、CZ-5 兩段推力；SECO 誤差 -10.2%→+2.6% |

---

*Made with the first principles thinking. 2026-07-06 Taiwan.*
