/**
 * 第一性原理教學卡（隨飛行階段動態顯示）
 *
 * 每張卡包含：
 *  - condition: (state) => boolean，何時顯示
 *  - title, body: 內容
 *  - 依觸發順序疊加，用 Set 記錄已顯示過的
 */

const FIRST_PRINCIPLES_CARDS = [

  {
    id: "why-rocket-equation",
    condition: s => true,   // 一開始就顯示
    title: "Tsiolkovsky 火箭方程",
    body: `
      <div class="fp-eq">Δv = I<sub>sp</sub>·g·ln(m<sub>0</sub>/m<sub>1</sub>)</div>
      這是火箭學的<strong>第一性原理式</strong>。它告訴你：
      能達到多少速度增量（Δv）只取決於<strong>比衝 (Isp)</strong> 與<strong>質量比 (m₀/m₁)</strong>。
      進軌道需要 Δv ≈ 9.4 km/s（含重力損失、氣動損失）。
      這就是為什麼火箭必須「幾乎全部都是燃料」——質量比要夠大。
    `,
  },

  {
    id: "why-multistage",
    condition: s => true,
    title: "為什麼要多級火箭？",
    body: `
      單級火箭的 Δv 上限受制於<strong>結構質量比例</strong>——
      無論燃料多好，火箭本身結構要 5-15% 的乾重。
      解法：<strong>把已用完的殼拋掉</strong>，讓後級用更小的殼繼續加速。
      這是 1903 年 Tsiolkovsky 提出的關鍵洞察，也是<strong>火箭必須分級</strong>的物理原因，
      而非工程妥協。
    `,
  },

  {
    id: "thrust-weight-ratio",
    condition: s => s.t < 15 && s.altitude < 5000,
    title: "為什麼 T/W > 1.2 起飛？",
    body: `
      離架瞬間，火箭必須<strong>推力 > 重量</strong>才能起飛。
      但如果 T/W ≈ 1，加速太慢 → 燃料浪費在對抗重力（gravity loss）。
      實務上 T/W = 1.2 到 1.5 是甜蜜點：
      <span class="fp-eq">gravity loss ≈ g·t<sub>burn</sub>·(1/(T/W))</span>
      Falcon 9 起飛 T/W ≈ 1.4，Starship ≈ 1.5，Saturn V 只有 1.15（單體太重）。
    `,
  },

  {
    id: "max-q",
    condition: s => s.dynQ > 20000 || (s.altitude > 8000 && s.altitude < 15000),
    title: "為什麼 Max-Q 是關鍵時刻？",
    body: `
      動壓 Q = ½·ρ·v² 是<strong>結構承受的空氣動力應力</strong>。
      起飛時 ρ 大、v 小；到 10 km 附近 ρ 小、v 大，兩者乘積達最大值 Max-Q。
      火箭在 Max-Q 附近會<strong>油門收</strong>降到 70-90%，避免結構過載。
      Space Shuttle Challenger 就是在 Max-Q 附近失事——不是巧合。
    `,
  },

  {
    id: "gravity-drop",
    condition: s => s.altitude > 100000,
    title: "重力真的變小了嗎？",
    body: `
      是的，但沒你想的多。100 km 高空重力 g ≈ 9.5 m/s²（只降 3%）。
      <span class="fp-eq">g(h) = g₀·(R⊕/(R⊕+h))²</span>
      到 400 km (ISS 軌道)，g 還有 8.7 m/s²（降 11%）。
      <strong>ISS 的太空人不是「無重力」，是「持續自由落體」</strong>——重力仍然存在，
      只是他們與太空站一起繞地球下墜，永遠 miss the ground。
    `,
  },

  {
    id: "why-methane",
    condition: s => s.stage === 1 && s.t > 5,
    title: "SpaceX 為什麼選甲烷？",
    body: `
      過去 60 年主流是 RP-1（煤油）或 LH₂（氫），為什麼 Raptor 選了甲烷？
      <strong>第一性原理答案：火星</strong>。
      火星大氣 96% CO₂，用 Sabatier 反應（CO₂ + H₂ → CH₄ + H₂O）可以就地製造甲烷。
      RP-1 沒有這條路徑。這個決定<strong>從殖民火星的目標倒推</strong>而來，
      而非「哪種燃料 Isp 最高」的技術優化。這是第一性原理應用的教科書案例。
    `,
  },

  {
    id: "why-fullflow",
    condition: s => s.stage >= 1 && s.t > 30,
    title: "Full-Flow Staged Combustion 是什麼？",
    body: `
      傳統引擎<strong>只有一路預燃</strong>（富燃料或富氧），
      Raptor 是史上首次量產的<strong>兩路都預燃</strong>——
      全部燃料 + 全部氧化劑都經渦輪泵，然後再進主燃燒室。
      好處：燃燒室壓力可到 350 bar（Raptor 3），比 RS-25 太空梭主引擎的 207 bar 高。
      代價：<strong>兩個預燃器 + 兩個渦輪泵 + 極端整合複雜度</strong>。
      蘇聯 60 年代做過原型（RD-270），從沒進量產。
    `,
  },

  {
    id: "reusability",
    condition: s => s.stage >= 2 || s.t > 100,
    title: "重複使用的第一性拆解",
    body: `
      一架 Boeing 747 造價 4 億 US，飛一次不會扔掉。
      為什麼 6000 萬 US 的火箭要扔掉？<strong>沒有物理理由</strong>，只有產業慣性。
      Falcon 9 一級可重用 20+ 次，發射成本從 $54,000/kg（太空梭）→ $2,000/kg。
      Starship 目標 $100/kg。<strong>這是馬斯克第一性原理最著名的應用</strong>，
      而不是某個工程優化。
    `,
  },

  {
    id: "orbit",
    condition: s => s.altitude > 150000,
    title: "什麼叫「進入軌道」？",
    body: `
      不是「飛得夠高」，而是「<strong>橫向速度夠快</strong>」。
      在 200 km 高度，圓形軌道速度 ≈ 7.8 km/s。
      如果你只有高度沒有速度 → 直接掉下來（次軌道飛行）。
      這就是為什麼火箭在爬升過程要<strong>逐漸 pitch over</strong>（gravity turn），
      把推力方向從垂直轉水平——目的不是飛高，是<strong>把質量推快</strong>。
    `,
  },

  {
    id: "no-rocket-in-space",
    condition: s => s.altitude > 300000,
    title: "火箭在真空為什麼還能推進？",
    body: `
      常見誤解：火箭「推空氣」。錯。
      正確：<strong>火箭是動量守恆機器</strong>——把推進劑高速噴向後方，
      火箭本體被推向前方，跟空氣完全無關。
      <span class="fp-eq">F = ṁ·v<sub>e</sub></span>
      這也是為什麼 Isp（比衝，等效 vₑ/g）是核心指標——
      單位推進劑能生多快的排氣。
    `,
  },

  {
    id: "hydrogen-vs-methane",
    condition: s => s.stage === 2,
    title: "為什麼氫的 Isp 高但沒被選？",
    body: `
      LH₂ Isp 可到 450s（RS-25），CH₄ 只有 350-380s。差異不小。
      但 LH₂ 密度只有 71 kg/m³（水的 7%），儲槽必須<strong>極大</strong>。
      Saturn V S-II 儲槽外要包<strong>軟木隔熱層</strong>，因為 LH₂ 液化溫度 20K（-253°C）。
      LH₂ 的操作、儲存、加壓成本吃掉了 Isp 優勢。
      這是「<strong>單指標最優 vs 系統最優</strong>」的經典課。
    `,
  },

  {
    id: "second-cosmic-velocity",
    condition: s => s.velocity > 10000 || s.altitude > 400000,
    title: "第一/第二宇宙速度",
    body: `
      <strong>第一宇宙速度 7.9 km/s</strong>：貼地圓軌道最低速（達成 = 進 LEO）
      <strong>第二宇宙速度 11.2 km/s</strong>：脫離地球引力（達成 = 去月球以外）
      <strong>第三宇宙速度 16.7 km/s</strong>：脫離太陽系
      這三個數字純粹來自<strong>能量守恆</strong>：
      <span class="fp-eq">½·v² = G·M/r</span>
      Falcon 9 到 LEO 用約 9.4 km/s（含損失）。
      去火星要 ≈ 12 km/s，所以需要更大級別火箭（或多次點火）。
    `,
  },

];


class EducationSystem {
  constructor(container) {
    this.container = container;
    this.shown = new Set();
  }

  reset() {
    this.shown.clear();
    this.container.innerHTML = "";
    this.checkNow({ t: 0, altitude: 0, velocity: 0, stage: 1, dynQ: 0 });
  }

  checkNow(state) {
    for (const card of FIRST_PRINCIPLES_CARDS) {
      if (!this.shown.has(card.id) && card.condition(state)) {
        this.addCard(card);
        this.shown.add(card.id);
      }
    }
  }

  addCard(card) {
    const div = document.createElement("div");
    div.className = "fp-card";
    div.innerHTML = `
      <div class="fp-title">${card.title}</div>
      <div class="fp-body">${card.body}</div>
    `;
    // 新卡插最上面（最新事件在最上）
    this.container.insertBefore(div, this.container.firstChild);
    // 平滑進場
    div.style.opacity = 0;
    requestAnimationFrame(() => {
      div.style.transition = "opacity 0.4s";
      div.style.opacity = 1;
    });
  }
}
