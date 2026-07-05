# 🚀 Rocket Launch Simulator · 火箭起飛模擬器

用第一性原理拆解 Falcon 9 / Starship / Saturn V / Long March 5 的**材料**、**燃料**、**熱值**、**受力**、**分級**——全瀏覽器互動，零依賴。

**線上版**：https://rocket-launch-sim.pages.dev
**PDF 報告**：[docs/report.pdf](docs/report.pdf)

---

## 為什麼做這個？

火箭教學網頁很多，但幾乎沒有一個**用第一性原理**把「為什麼是這個材料 / 為什麼是這個燃料 / 為什麼要多級」講清楚。這個專案補上那個 *Why*。

---

## 快速使用

```bash
# 本機預覽
python -m http.server 8000
# 或直接雙擊 index.html
```

或用開發者慣用的 static server（Node、Vite、Live Server 都可）。

---

## 功能

- 🚀 **四款代表性火箭**：Falcon 9、Starship、Saturn V、長征五號
- 📊 **即時儀表板**：高度、速度、Mach、燃料、加速度、動壓
- ⚖️ **飛行受力**：推力/重力/阻力/淨推 即時比例條
- 🔧 **火箭規格**：全部靜態參數（尺寸、質量、推力、Isp、T/W）
- 🧬 **材料組成**：百分比 + 用途註解
- ⛽ **燃料系統**：燃料+氧化劑物性、O/F 比、循環方式、燃燒室溫壓
- ⏱ **任務階段**：時序 checklist，已完成 highlight
- 🧠 **12 張第一性原理教學卡**：飛行過程中依觸發條件動態浮現
- 🎨 **深空儀表板風格**：手機/桌機響應式

---

## 物理模型

- Tsiolkovsky 火箭方程：Δv = Isp·g·ln(m₀/m₁)
- 質量流率：ṁ = F / (Isp·g₀)
- 標準大氣分層：ρ(h) 對應 troposphere / stratosphere / mesosphere
- 平方反比重力：g(h) = g₀·(R⊕/(R⊕+h))²
- 動壓與阻力：Q = ½·ρ·v²，F_d = Q·C_d·A
- 音速與 Mach：a = √(γRT)
- 推力隨大氣壓修正
- Gravity turn 程序（0-1.5km 垂直，1.5-80km 線性 pitch-over 到 15°）
- 多級分離邏輯

詳細物理模型與資料來源：[docs/report.md](docs/report.md)

---

## 檔案結構

```
.
├── index.html                主頁面
├── css/style.css             深空儀表板風格
├── js/
│   ├── data.js               四款火箭資料庫
│   ├── physics.js            物理引擎（RocketSim class）
│   ├── scene.js              Canvas 2D 場景
│   ├── education.js          第一性原理教學卡
│   └── app.js                主控制
├── docs/
│   ├── report.md             技術報告
│   ├── report.pdf            PDF 版
│   └── build_pdf.py          MD → PDF 腳本
└── README.md
```

---

## 資料來源

- SpaceX 官網、Starship User Guide、公開 IAC 發表
- NASA Saturn V Flight Manual、Apollo Lunar Surface Journal
- Boeing SLS 技術文件
- CNSA 長征五號公開規格
- Sutton & Biblarz *Rocket Propulsion Elements*
- Wikipedia 交叉驗證

**免責聲明**：教學用途，非工程精度。想追求精度請用 [rocketpy](https://docs.rocketpy.org/) 或 NASA POST2。

---

## Ken 的職涯脈絡

這個專案是 [Ken_Agent](../..) 工作區中「用第一性原理拆解複雜系統」訓練的一部分。同個思維框架可以直接套用到資料中心 PUE / UPS / 冷卻設計，見 [dc_first_principles](../dc_first_principles/) 姊妹專案。

## Related 姊妹專案

- [rocket_ai_sim](../rocket_ai_sim/)：用 AI 模擬火箭六層路徑（rocketpy / PINN / FNO / RL / LLM Agent）
- [dc_first_principles](../dc_first_principles/)：用同樣思維拆解資料中心

---

## License

MIT · Made with first principles thinking · 2026 · Kunzhi0810 / Ken
