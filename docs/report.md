# 火箭起飛模擬器 · 技術與第一性原理報告

**作者**：Ken（HM PowerNet / Coupang DC Engineer）＋ Claude
**日期**：2026-07-06
**專案**：`Ken_Agent/projects/rocket_launch_sim/`
**線上版**：https://rocket-launch-sim.pages.dev（Cloudflare Pages）
**原始碼**：https://github.com/Kunzhi0810/rocket-launch-sim

---

## 摘要

用純 HTML + JavaScript 打造一個能執行在瀏覽器裡的火箭起飛模擬器，涵蓋四款代表性火箭（Falcon 9、Starship、Saturn V、長征五號），內建 Tsiolkovsky 火箭方程 + 標準大氣模型 + 平方反比重力模型，並附上 12 張第一性原理教學卡在飛行過程中依觸發條件動態浮現。零額外費用、零外部依賴、GitHub Pages 直接可 serve。

---

## 為什麼寫這個？

**表面理由**：Ken 想動手玩「AI + 火箭」；理解 SpaceX 為什麼能做到別人做不到的事。

**第一性理由**：資料中心工程師的差異化在「跨領域第一性原理能力」。火箭工程與 DC 設計看似不相關，但**思考結構完全相同**——熱力學、可靠度、材料選擇、系統整合都是重複可移植的能力。做這個專案的真正產出是「面試時能講出的深度」，不是火箭本身。

---

## 系統設計

### 目錄結構

```
rocket_launch_sim/
├── index.html            主頁面（HTML/儀表板/事件）
├── css/style.css         深空儀表板風格
├── js/
│   ├── data.js           四款火箭資料庫（材料/燃料/引擎/事件）
│   ├── physics.js        RocketSim class：Tsiolkovsky + 大氣 + gravity turn
│   ├── scene.js          Canvas 2D 場景（火箭 sprite + 星空 + 高度尺）
│   ├── education.js      第一性原理教學卡系統
│   └── app.js            主控制：把上面全部串起來
├── docs/
│   ├── report.md         本份報告
│   └── report.pdf        本份報告的 PDF 版
└── README.md
```

### 技術棧

- **純 HTML/CSS/JS**，無 build step、無 npm、無框架
- **Canvas 2D**（非 WebGL）：Ken 機器無獨顯，效能可預測
- **零外部依賴**：可放上 GitHub Pages 或 Cloudflare Pages 直接運作
- **響應式設計**：手機也能用（分欄→單欄）

---

## 物理模型

### 1. Tsiolkovsky 火箭方程（第一性原理起點）

    Δv = I_sp · g₀ · ln(m₀ / m₁)

- Δv：能達到的速度增量
- I_sp：比衝（specific impulse），秒
- g₀：標準重力 9.80665 m/s²
- m₀ / m₁：起飛質量 / 燒完後質量

這個公式決定了火箭的**根本能力上限**。想達成 LEO 所需的 ≈ 9.4 km/s Δv，你必須選對 Isp（燃料組合）+ 質量比（結構效率）。多級火箭的必要性完全從這個公式推出——單級不夠。

### 2. 質量流率

    ṁ = F_thrust / (I_sp · g₀)

推力來自將質量以高速噴出，動量守恆給出這個關係式。

### 3. 標準大氣模型

分段近似：

- 0-11 km（對流層）：ρ = ρ₀ · exp(-h / 8500)
- 11-50 km（平流層）：稍緩衰減
- 50-100 km：更緩衰減
- 100+ km：趨近真空

實際 U.S. Standard Atmosphere 1976 有 8 層分段線性溫度模型，我這裡簡化到夠用即可。

### 4. 平方反比重力

    g(h) = g₀ · (R⊕ / (R⊕ + h))²

R⊕ = 6371 km。到 400 km（ISS 軌道）g 還有 8.7 m/s²，衰減 11%。**太空人不是「無重力」，是「持續自由落體」**——這是一般人最常誤解的物理事實之一。

### 5. 動壓與阻力

    Q = ½ · ρ · v²
    F_drag = Q · C_d · A

- Q：動壓，起飛時最大值稱 Max-Q，是結構受力臨界時刻
- C_d：阻力係數，我用 0.45-0.6 依火箭型號取常數
- A：截面積 = π · d²/4

真實火箭 C_d 隨 Mach 變化（跨音速時劇烈），教學用取常數。

### 6. 音速與 Mach

    a = √(γ · R · T)

γ = 1.4（空氣比熱比），R = 287 J/(kg·K)（空氣氣體常數）。T 由標準大氣分層計算。

### 7. 推力隨大氣壓變化

真空推力 > 海平面推力（因為出口不受背壓抵消）：

    F(h) = F_vac - (F_vac - F_sl) · (ρ(h) / ρ₀)

實際更精確會用出口壓力 vs 環境壓力的差值，我用密度比近似。

### 8. Gravity Turn 程序

實際火箭升空約 5-15 秒後開始 pitch-over，之後跟隨速度向量方向自然轉向。教學用簡化：

- 0-1.5 km：垂直（pitch = 90°）
- 1.5-80 km：線性從 90° 降至 15°
- 80+ km：從 15° 降至 5°
- 最大轉率 3°/s

### 9. 多級火箭邏輯

當前級推進劑燒完 → 拋殼（減去 mass_dry）→ 下一級開始燃燒。每級的 thrust、Isp、burn_time 都獨立。

---

## 火箭資料庫（真實公開數據）

### Falcon 9 Block 5（SpaceX，2018-）

| 項 | 值 |
|---|---|
| 高度 | 70 m |
| 直徑 | 3.7 m |
| 起飛質量 | 549 t |
| LEO 酬載 | 22.8 t |
| 一級引擎 | 9 × Merlin 1D+（RP-1/LOX，Gas Generator） |
| 一級推力（海） | 7607 kN |
| 一級 Isp（海/真空） | 282 / 311 s |
| 起飛 T/W | 1.41 |
| 二級引擎 | 1 × Merlin Vacuum |
| 材料主體 | 鋁鋰合金 2195（55%）、不鏽鋼、碳纖維 COPV |

**特點**：可回收（一級 20+ 次重用），首個大幅拉低 $/kg 的商業火箭。

### Starship + Super Heavy（SpaceX，2023-）

| 項 | 值 |
|---|---|
| 高度 | 121 m |
| 直徑 | 9 m |
| 起飛質量 | 5000 t |
| LEO 酬載 | 150 t（v2 目標） |
| Booster 引擎 | 33 × Raptor 3（CH₄/LOX，Full-Flow Staged） |
| 起飛推力 | ≈ 74400 kN |
| Isp（海/真空） | 327 / 350 s |
| 材料主體 | 304L 不鏽鋼（90%）—— SpaceX 逆常規設計 |
| 燃燒室壓 | 350 bar（Raptor 3） |

**特點**：史上首個量產的 Full-Flow Staged Combustion 引擎；選甲烷是為了火星就地製造。

### Saturn V（NASA，1967-1973）

| 項 | 值 |
|---|---|
| 高度 | 110.6 m |
| 直徑 | 10.1 m |
| 起飛質量 | 2970 t |
| LEO 酬載 | 140 t |
| 一級 (S-IC) | 5 × F-1（RP-1/LOX） |
| 一級推力 | 34500 kN |
| 二級 (S-II) | 5 × J-2（LH₂/LOX） |
| 三級 (S-IVB) | 1 × J-2 |
| 起飛 T/W | 1.15（低！）|

**特點**：至今單發推力仍是紀錄保持者；LH₂/LOX 高 Isp 但儲存極端困難。

### 長征五號 CZ-5（CNSA，2016-）

| 項 | 值 |
|---|---|
| 高度 | 57 m |
| 直徑 | 5 m |
| 起飛質量 | 869 t |
| LEO 酬載 | 25 t |
| 芯級 | 2 × YF-77（LH₂/LOX） |
| 助推 | 4 × 助推器（各 2 × YF-100 RP-1/LOX） |
| 二級 | 2 × YF-75D（Expander cycle） |

**特點**：Hybrid 燃料策略（芯氫、助推煤油），中國最強現役火箭。

---

## 教學卡系統：12 張第一性原理拆解

依飛行狀態動態浮現，包含：

1. **Tsiolkovsky 火箭方程**（一開始就顯示）
2. **為什麼要多級火箭**（一開始就顯示）
3. **為什麼 T/W > 1.2 起飛**（起飛 15s 內）
4. **為什麼 Max-Q 是關鍵時刻**（動壓 > 20 kPa 時觸發）
5. **重力真的變小了嗎**（高度 > 100 km）
6. **SpaceX 為什麼選甲烷**（stage 1 且 t > 5s）
7. **Full-Flow Staged Combustion 是什麼**（t > 30s）
8. **重複使用的第一性拆解**（stage ≥ 2 或 t > 100s）
9. **什麼叫「進入軌道」**（高度 > 150 km）
10. **火箭在真空為什麼還能推進**（高度 > 300 km）
11. **為什麼氫的 Isp 高但沒被選**（stage 2）
12. **第一/第二宇宙速度**（速度 > 10 km/s 或高度 > 400 km）

每張卡的內容都由第一性原理拆解，避免「業界都這樣做」的類比推理。

---

## 儀表板組成（右側面板）

1. **即時儀表**：高度、速度、Mach、燃料、加速度、動壓（bar chart）
2. **飛行受力**：推力/重力/阻力/淨推 即時比例（peer comparison）
3. **火箭規格**：全部靜態參數
4. **材料組成**：百分比 + bar chart + 用途註解
5. **燃料系統**：燃料+氧化劑物性、O/F 比、循環方式、燃燒室溫壓
6. **任務階段**：時序 checklist，已完成 highlight
7. **第一性原理拆解**：教學卡

左側：3D-ish 側視場景 + HUD + Launch 控制。

---

## 限制與誠實揭露

- **一維飛行 + 簡化 pitch**：不是真實 3D 軌跡，無法反映方位、方位變化、Coriolis force 等
- **氣動係數常數**：C_d 用單一值，跨音速阻力尖峰未捕捉
- **沒有燃燒室內流細節**：燃燒室壓力、noz 流純顯示公開規格，不做即時模擬
- **教學層級精度**：apogee、burn time 等會與真實任務差 5-30%
- **沒有回收模擬**：Falcon 9 一級回收、Starship 大手抓回等未動畫

想追求精度需要用真正的 6DOF ODE 積分器（rocketpy 或 POST2），已在 `rocket_ai_sim/L0` 專案處理。

---

## 給 Ken 的職涯應用

這個專案訓練的能力可以直接搬到 DC 工程：

| 火箭思維 | DC 應用 |
|---|---|
| Tsiolkovsky 方程 | PUE 公式的第一性拆解 |
| 多級火箭 | 冷卻分層（chiller/CRAC/rack door） |
| Full-Flow Staged | 高效率電力/冷卻循環設計 |
| 選甲烷為了火星 | 選液冷為了 AI 密度 |
| Max-Q 結構臨界 | 尖峰負載可靠度計算 |
| 回收 vs 拋棄 | UPS 電池梯次利用 |

**結論**：想跳槽外商 DC，能講「我用第一性原理拆解一個複雜系統」比背 20 張證照更有辨識度。這個火箭模擬器就是那個「能拿出來講的作品」。

---

## 部署與維護

**線上部署**：Cloudflare Pages（零月費）從 GitHub repo 自動 build。

**Ken 自己想加料**：
- 加新火箭：在 `js/data.js` 加一個 entry
- 改物理：`js/physics.js` 的 step() 方法
- 加教學卡：`js/education.js` 的 FIRST_PRINCIPLES_CARDS 陣列 push 新項
- 改風格：`css/style.css` 的 :root CSS variables

**相依性**：0 個。這是純 static site，未來 5-10 年不會壞。

---

## 資料來源

- SpaceX：spacex.com/vehicles/、Starship User Guide、公開 IAC 發表
- NASA：nasa.gov/humans-in-space、Saturn V Flight Manual、Apollo Lunar Surface Journal
- ESA / CNSA：官方 press kit
- 教科書：Sutton & Biblarz *Rocket Propulsion Elements*
- Wikipedia（交叉驗證用）

**免責聲明**：本模擬器為教學用途，不用於工程設計、任務規劃、法規申請等實務用途。

---

*Made with the first principles thinking. 2026-07-06 Taiwan.*
