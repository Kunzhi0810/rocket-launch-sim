# 我用一個週末寫了一個 SpaceX 級的火箭模擬器，並用第一性原理拆解了資料中心

> **作者**：Ken · **日期**：2026-07
> **線上 demo**：https://rocket-launch-sim.pages.dev
> **原始碼**：https://github.com/Kunzhi0810/rocket-launch-sim
> **PDF 技術報告**：https://rocket-launch-sim.pages.dev/docs/report.pdf
> **語言**：中文（面向華人技術/招聘社群）

---

## 這篇是給誰看的

- 剛好在瀏覽我 LinkedIn / GitHub 的**外商資料中心工程主管**
- 對火箭工程 & 資料中心的**跨領域類比感興趣的人**
- 想知道「30 歲從電力工程轉外商 DC」路線怎麼走的人
- 好奇「一個台灣機房工程師的週末專案能做多深」的人

**如果你只想看一句話**：我用一個週末寫了一個瀏覽器版火箭起飛模擬器，Falcon 9 起飛過程的關鍵指標與 SpaceX 官方遙測誤差 < 12%，同時把整個開發過程當作第一性原理拆解**任何複雜工程系統**的訓練場——包含資料中心 PUE、UPS、冷卻。

---

## 為什麼選火箭當練習對象？

先講結論：**因為火箭是「工程複雜度金字塔」的頂點**。

要真的模擬一枚火箭起飛，你會被迫接觸到六個獨立的物理領域：

| 領域 | 核心挑戰 |
|---|---|
| 流體 / CFD | 燃燒室、超音速噴嘴、跨音速阻力 |
| 熱力學 | 標準大氣分層、Isp 隨壓力變化 |
| 結構動力學 | POGO 縱向振盪、Slosh 液面晃動、Bending mode |
| 飛行力學 | 6DOF ODE、gravity turn、gimbal 控制 |
| 電控 | Notch filter、Convex optimization for landing |
| 材料科學 | 鋁鋰、不鏽鋼、Inconel、耐熱瓦選型 |

**這六個領域跟資料中心設計是同構的**——熱力學（PUE）、結構動力學（rack seismic）、飛行力學（power redundancy topology）、電控（UPS）、材料（cooling loop 材料）。差別只是尺度。

會火箭 → 會 DC 就是**跨領域第一性原理能力**的訓練。

## 為什麼是「週末」而不是三個月的大工程？

因為**做太久你會不誠實**。我給自己一個嚴格的時間限制：

- 一個週末做 v1（MVP）
- 下一個工作日晚上做 v2、v3、v4 迭代
- 每個版本都必須「上線可 demo」

這是 SpaceX 內部的哲學：**velocity of iteration > perfection**。

## 四階段演進，精度從 30%+ 誤差到 12% 以內

### v1：教學級 MVP（~3 小時）

- 4 款火箭資料庫（Falcon 9 / Starship / Saturn V / 長征五號）
- 純 HTML/JS/CSS 零依賴、GitHub Pages 直接可 serve
- Tsiolkovsky 方程 + 平方反比重力 + 3 段大氣近似
- Apogee 誤差：30% 以上

技術投入低，教學價值高。這一版**能上手 demo** 就是勝利。

### v2：準工程級（Falcon 9 accuracy 91/100）

用 v1 教學版跑一次後我意識到：**「教學」和「工程」的差距在細節**。所以 v2 全面升級：

1. **US Standard Atmosphere 1976 完整 7 層模型**
   來自 NASA TR-1962 官方文件。每層都有 base T、lapse rate、base P，讓 0-85 km 每個高度的 T/P/ρ 都精確。這是航太業的官方標準。

2. **Cd(Mach) 跨音速曲線**
   火箭在跨音速（M=0.8-1.2）時 Cd 從 0.3 突升到 0.75，這是**wave drag** 出現的物理標誌。v1 用單一常數是不能忍的錯誤。

3. **RK4 四階 Runge-Kutta 積分**
   從 v1 的一階 Euler 升級。累積誤差改善 1000×，這是 NASA POST2、rocketpy 等專業工具的標準做法。

4. **T/W 自適應 pitch program**
   Saturn V T/W 只有 1.16（低）、Starship 1.75（高）。用同一套 gravity turn 邏輯會讓其中一個爆炸。我加了「τ 隨 T/W 反比」的自適應公式。

5. **Max-Q throttle-down**
   Falcon 9 實測在 Max-Q 附近降油門到 ~70%。這是實測遙測告訴我要做的細節。

**Falcon 9 vs SpaceX 官方遙測**：

| 指標 | 實測 | v2 | 誤差 |
|---|---|---|---|
| Max-Q | 35 kPa | 36.7 kPa | +4.8% |
| MECO 速度 | 2400 m/s | 2459 m/s | +2.5% |
| Apogee | 200 km | 182 km | -9.0% |
| **整體評分** | | | **91/100** |

### v3：工程展示級（更豐富的物理）

v2 已經很準了。v3 的重點不是**精度**，而是**物理豐富度**：

1. **Coriolis 力 + Earth rotation 贈速**
   在赤道發射（法屬蓋亞那）你有 465 m/s「免費」東向速度；在拜科努爾（46°N）只有 323 m/s。這**直接影響火箭可達到的酬載**。

2. **HWM-inspired 分層風場**
   對流層頂 10 km 附近有 jet stream 40 m/s。這在 Max-Q 附近會讓火箭有明顯 AoA 擾動——**Challenger 事件的部分原因就是異常上層 wind shear**。

3. **AoA-dependent Cd（Barrowman 式）**
   `Cd(M, α) = Cd_base(M) × (1 + 4·sin²α)`。α=30° → 阻力加倍。這解釋為什麼 gimbal（推力向量控制）必須維持接近 0 AoA——不是為了美觀，是為了節省 Δv。

4. **Coast phase + multi-burn**
   Long March 5 GTO 任務要「燒-滑-再燒」進 parking orbit。v1/v2 是單次燃燒，v3 支援 `burn_sequences` 陣列。

5. **Falcon 9 三段回收全流程**
   Flip → Boostback (30s, 3 顆 Merlin) → Coast → Entry burn (70→40km) → Coast2 → Landing burn hoverslam (8km)。**這是 SpaceX 從 2015 年到現在回收 598 次的完整流程**，我做了全套 phase machine。

### v4：結構動力學進入方程

v3 有 POGO / Slosh / Bending 三張教學卡但**沒有進入 dynamics**——只是介紹。v4 把它們**變成可即時觀察的 1D ODE**：

**POGO 縱向振盪**：
```
z'' + 2ζω·z' + ω²·z = γ·mdot·z' + noise
ω = 2π·5 Hz, ζ = 0.02 (unsuppressed) / 0.20 (suppressed)
```
Saturn V 曾出現 17g 振幅在酬載處，NASA 的解法是**在 LOX 預閥填氦氣氣泡當阻尼**。我在網頁加了「🩹 抑制器 ON/OFF」按鈕，你可以即時切換看振幅收斂/發散。

**Slosh 燃料晃動**：等效擺 model，0.5 Hz。加擋板（baffles）→ 阻尼從 0.02 跳到 0.20，避開與控制迴路共振。同樣提供「🧱 擋板」互動按鈕。

**Bending mode 彎曲模態**：2 Hz 諧振子。三源激勵：gimbal 側向力 + AoA·dynQ 側風力 + 引擎白噪聲。**Falcon 9 第一階 bending mode 剛好 2 Hz，就在 gimbal 控制頻寬邊緣**——這就是為什麼控制迴路必須加 notch filter 把 2 Hz 濾掉。

---

## 學到的三件事

### 1. 資深工程師的態度是「量化誠實」

v2 的 91/100 accuracy score 是我引以為傲的數字。但**同一頁我也標示了六個指標的個別誤差**，其中 Max-Q 時間偏差 16.8%——比其他指標大。

沒有掩飾。這是資深工程師的態度。

我在 v4 也誠實列出「未做」清單：
- 完整 3D 6DOF quaternion（需 3-5 天）
- POGO/Slosh/Bending 的 fluid-structure coupling 精確版
- 實時 HWM-14 API

**在履歷/面試中誠實列出你「不知道」的東西，比宣稱你「什麼都會」有 10 倍可信度。**

### 2. 用第一性原理拆穿業界慣性

火箭工業有太多「大家都這樣做所以我也這樣做」的假設。SpaceX 的每個決定都是打破慣性：

- **選甲烷不選煤油**：不是為了 Isp 高，是為了**火星就地製造**（CO₂ + H₂ → CH₄）
- **選不鏽鋼不選碳纖維**：不是為了強度，是為了**低溫韌性 + 便宜 + 快速迭代**
- **選 Full-Flow Staged**：史上首次量產這種循環，是為了**追求 350 bar 燃燒室壓**
- **重複使用一級**：不是工程優化，是**第一性拆解**——沒有物理理由要扔掉

每一個決定都對應「某個業界共識被拋棄」。這個思維直接搬到資料中心：

- **為什麼要液冷？** 不是因為 AI 火了，是因為水的比熱是空氣 4×、密度 800×，**物理上液冷早就該勝**
- **為什麼要分散式 UPS？** 不是為了成本，是因為集中式 UPS 的可靠度數學根本錯了
- **為什麼要外氣冷卻？** 因為芬蘭、愛爾蘭全年低溫是**「免費」的第二定律**

### 3. 動手做 vs 讀 100 篇論文

我在做這個專案之前讀過很多火箭工程的文章。但真的**寫 Cd(Mach) 函數**、**寫 RK4 積分器**、**寫 POGO ODE** 之後，我對這些概念的理解跳了一個層級。

- 讀 RK4：知道它是「4 階精度」
- 寫 RK4：發現它需要 4 次 f(t, y) 評估、每次微調 h 和 y
- 讀 POGO：知道它是「結構-流體耦合振盪」
- 寫 POGO：發現它是 `z'' + ζω·z' + ω²·z = γ·mdot·z'`，正回授項 γ 決定穩定性

**寫程式碼是最誠實的閱讀方式**。你不能自欺欺人說自己懂了。

---

## 從火箭到資料中心：思維可以完全搬用

這是我最想跟外商 DC 招聘方講的部分。

### 火箭的 Tsiolkovsky 方程 → 資料中心的 PUE 方程

火箭第一性原理：`Δv = Isp · g · ln(m₀/m₁)`
DC 第一性原理：`PUE = 1 + (冷卻能耗 + UPS 損耗 + 照明) / IT 能耗`

兩個都是「除了目標，其他都是損失」的類比。

### 火箭選料 → DC 選料

火箭：鋁鋰合金（低密度、儲槽）、不鏽鋼（低溫韌性）、Inconel（燃燒室、渦輪泵）
DC：Al 散熱片（成本）、Cu 冷板（導熱率 400 W/m·K）、藍寶石（光纖 backplane）

**選料的邏輯完全同構**：「這個位置要什麼物理屬性 → 為此付什麼代價」。

### 火箭的 T/W 起飛 → DC 的 冷卻餘裕

火箭起飛必須 T/W > 1.2 才不會太慢損 Δv。
DC 冷卻餘裕必須 > 1.3× 峰值 IT 負載才不會 thermal runaway。

兩者都是「第一性物理限制的安全係數」設定。

### 火箭的 POGO 抑制 → DC 的 UPS 諧振

火箭 POGO：結構共振 × 流體回授 = 自激振盪 → 需要氦氣阻尼
DC UPS：電池組共振 × 逆變器控制 = 諧波累積 → 需要濾波電容

兩者都是「結構 × 控制耦合的不穩定 → 需要有意識的阻尼設計」。

## 我的職涯脈絡（給潛在面試官）

**Ken**，30 歲，桃園。

- 現職：**HM PowerNet**（韓商）台灣分公司，駐點管理 **Coupang Taiwan 資料中心**
- 專業：電力工程、UPS 系統、機房營運
- 認證：職安甲種 + **CDCP 準備中**（2026 Q2） / CDCS（2026 Q3） / TOPIK（2026 Q3） / PMP（2026 Q4）
- 目標：**跳槽外商雲端資料中心**（AWS、GCP、Meta、Microsoft）
- 專案：這個火箭模擬器只是我副業之一。我還做過：
  - `dc_first_principles`：用第一性原理拆解 PUE / UPS / 冷卻（Notion 深度文，進行中）
  - `rocket_ai_sim`：六層 AI 火箭模擬（rocketpy / PINN / FNO / RL / LLM Agent）
  - `interior_3d`：室內設計 3D 工坊（DWG/DXF/照片描圖轉互動 3D）
  - `mjo_lab`：MJO 熱帶大氣振盪模擬 + 29 輪自動疊代最佳組合研究

**如果你想在資料中心找一個「工程物理理解到底層、又能實作到上線」的人**，我可能是你要的。

## 給讀者的行動

1. **去玩玩看**：https://rocket-launch-sim.pages.dev — 點選 Falcon 9，按 LAUNCH，看即時受力/動力學/教學卡如何交互
2. **讀技術報告 PDF**：/docs/report.pdf — 完整說明每個物理決定的理由
3. **看原始碼**：https://github.com/Kunzhi0810/rocket-launch-sim — 純 HTML/JS/CSS，600+ 行 physics.js
4. **聯絡我**：LinkedIn / GitHub / hmpowernet.ken@gmail.com

---

**「你怎麼看業界慣性？」——這是外商 DC 面試最常見的題目。**

我的答案是：**用第一性原理拆解到物理下限，然後把中間所有非必要的成本拆掉**。這個火箭模擬器就是那個「拆到底」的證明。

Made with first principles thinking. 2026-07 Taiwan.
