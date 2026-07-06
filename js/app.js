/**
 * 主控制：把 data / physics / scene / education / dashboard 串起來
 */

const $ = id => document.getElementById(id);

let sim;
let scene;
let edu;
let selectedRocket = "falcon9";
let running = false;
let lastFrame = performance.now();
let timeScale = 1;
let eventBannerHideTimer = 0;

function selectRocket(name) {
  selectedRocket = name;
  document.querySelectorAll("#rocketPicker button").forEach(b => {
    b.classList.toggle("active", b.dataset.rocket === name);
  });
  const rocket = ROCKETS[name];
  sim = new RocketSim(rocket);
  scene.setRocket(name);
  edu.reset();
  simMax = { alt: 0, altT: 0, mecoV: null, mecoAlt: null, mecoT: null, secoV: null, secoAlt: null };
  updateStaticPanels(rocket);
  renderTimeline(rocket, sim.getState());
  renderAccuracy(rocket);
  updateDashboard();
  $("btnLaunch").disabled = false;
  $("btnPause").disabled = true;
  running = false;
  $("btnPause").textContent = "⏸ PAUSE";
}

// 追蹤模擬產出的關鍵事件量
let simMax = { alt: 0, altT: 0, mecoV: null, mecoAlt: null, mecoT: null, secoV: null, secoAlt: null };
let lastStageIdx = 0;

function trackSimMilestones(state) {
  if (state.altitude > simMax.alt) {
    simMax.alt = state.altitude;
    simMax.altT = state.t;
  }
  // 一級 → 二級切換瞬間 = MECO
  if (state.stage - 1 > lastStageIdx) {
    if (lastStageIdx === 0) {
      simMax.mecoV = state.velocity;
      simMax.mecoAlt = state.altitude;
      simMax.mecoT = state.t;
    }
    lastStageIdx = state.stage - 1;
  }
  // 最終進入 ORBIT/LANDED
  if ((state.status === "ORBIT" || state.status === "LANDED") && simMax.secoV === null) {
    simMax.secoV = state.velocity;
    simMax.secoAlt = state.altitude;
  }
}

function renderAccuracy(rocket) {
  const tel = rocket.telemetry;
  const $t = $("accuracyTable");
  if (!tel) {
    $t.innerHTML = "<div class='mini-note'>此火箭無公開遙測基準</div>";
    return;
  }

  function errorClass(err) {
    if (err === null || err === undefined) return "pending";
    const e = Math.abs(err);
    if (e < 10) return "good";
    if (e < 25) return "ok";
    return "bad";
  }
  function errorText(err) {
    if (err === null || err === undefined) return "—";
    const sign = err >= 0 ? "+" : "";
    return `${sign}${err.toFixed(1)}%`;
  }

  const rows = [];

  // Max-Q
  const simQ = sim.maxDynQ / 1000;
  const errQ = tel.maxQ_kPa ? ((simQ - tel.maxQ_kPa) / tel.maxQ_kPa * 100) : null;
  rows.push({ label: "Max-Q", real: `${tel.maxQ_kPa} kPa`, mine: `${simQ.toFixed(1)} kPa`, err: sim.maxDynQ > 100 ? errQ : null });

  // Max-Q 時間
  const errQT = tel.maxQ_time_s && sim.maxDynQTime > 0 ? ((sim.maxDynQTime - tel.maxQ_time_s) / tel.maxQ_time_s * 100) : null;
  rows.push({ label: "Max-Q 時間", real: `T+${tel.maxQ_time_s}s`, mine: `T+${sim.maxDynQTime.toFixed(0)}s`, err: sim.maxDynQTime > 0 ? errQT : null });

  // MECO 速度
  const errMecoV = simMax.mecoV && tel.MECO_vel_ms ? ((simMax.mecoV - tel.MECO_vel_ms) / tel.MECO_vel_ms * 100) : null;
  rows.push({ label: "MECO 速度", real: `${tel.MECO_vel_ms} m/s`, mine: simMax.mecoV ? `${simMax.mecoV.toFixed(0)} m/s` : "—", err: errMecoV });

  // MECO 高度
  const errMecoA = simMax.mecoAlt && tel.MECO_alt_km ? ((simMax.mecoAlt/1000 - tel.MECO_alt_km) / tel.MECO_alt_km * 100) : null;
  rows.push({ label: "MECO 高度", real: `${tel.MECO_alt_km} km`, mine: simMax.mecoAlt ? `${(simMax.mecoAlt/1000).toFixed(0)} km` : "—", err: errMecoA });

  // Apogee
  const errApo = simMax.alt && tel.SECO_alt_km ? ((simMax.alt/1000 - tel.SECO_alt_km) / tel.SECO_alt_km * 100) : null;
  rows.push({ label: "Apogee", real: `${tel.SECO_alt_km} km`, mine: simMax.alt > 100 ? `${(simMax.alt/1000).toFixed(0)} km` : "—", err: errApo });

  // Final Velocity
  const errFV = simMax.secoV && tel.SECO_vel_ms ? ((simMax.secoV - tel.SECO_vel_ms) / tel.SECO_vel_ms * 100) : null;
  rows.push({ label: "軌道速度", real: `${tel.SECO_vel_ms} m/s`, mine: simMax.secoV ? `${simMax.secoV.toFixed(0)} m/s` : "—", err: errFV });

  const html = [
    `<div class="acc-row header"><span>指標</span><span>實測</span><span>本模擬</span><span>誤差</span></div>`,
    ...rows.map(r =>
      `<div class="acc-row"><span>${r.label}</span><span class="acc-val">${r.real}</span><span class="acc-val">${r.mine}</span><span class="acc-err ${errorClass(r.err)}">${errorText(r.err)}</span></div>`
    ),
  ].join("");

  $t.innerHTML = html;

  // 整體 score
  const errs = rows.map(r => r.err).filter(e => e !== null && e !== undefined).map(Math.abs);
  if (errs.length > 0) {
    const avg = errs.reduce((a, b) => a + b, 0) / errs.length;
    const score = Math.max(0, 100 - avg);
    const cls = avg < 10 ? "good" : (avg < 25 ? "ok" : "bad");
    $("accScore").innerHTML = `<span class="acc-err ${cls}">accuracy: ${score.toFixed(0)}/100</span>`;
  } else {
    $("accScore").textContent = "尚未起飛";
  }
}

function updateStaticPanels(rocket) {
  $("rocketName").textContent = rocket.name;

  // Specs
  const totalThrust = rocket.stages[0].thrust_sl;
  const TW = totalThrust / (rocket.totalMass * G0);
  const totalIsp = rocket.stages[0].isp_sl;
  const engines = rocket.stages[0].engines;

  $("specs").innerHTML = `
    <div class="spec-item"><span class="spec-label">高度</span><span class="spec-val">${rocket.height} m</span></div>
    <div class="spec-item"><span class="spec-label">直徑</span><span class="spec-val">${rocket.diameter} m</span></div>
    <div class="spec-item"><span class="spec-label">起飛質量</span><span class="spec-val">${TONS(rocket.totalMass)} t</span></div>
    <div class="spec-item"><span class="spec-label">LEO 酬載</span><span class="spec-val">${TONS(rocket.payloadLEO)} t</span></div>
    <div class="spec-item"><span class="spec-label">一級推力(海)</span><span class="spec-val">${MN(totalThrust)} MN</span></div>
    <div class="spec-item"><span class="spec-label">一級 Isp</span><span class="spec-val">${totalIsp} s</span></div>
    <div class="spec-item"><span class="spec-label">起飛 T/W</span><span class="spec-val">${TW.toFixed(2)}</span></div>
    <div class="spec-item"><span class="spec-label">階數</span><span class="spec-val">${rocket.stages.length}</span></div>
    <div class="spec-item"><span class="spec-label">首飛</span><span class="spec-val">${rocket.firstFlight}</span></div>
    <div class="spec-item"><span class="spec-label">發射場</span><span class="spec-val">${rocket.launchSite}</span></div>
  `;

  // Materials
  $("materials").innerHTML = rocket.materials.map(m => `
    <div class="material-row">
      <span class="material-name">${m.name}</span>
      <span class="material-note">${m.percent}%</span>
      ${m.note ? `<span class="material-note" style="grid-column:1/-1">${m.note}</span>` : ""}
      <div class="material-bar-wrap"><div class="material-bar" style="width:${m.percent}%"></div></div>
    </div>
  `).join("");

  // Fuel
  const f = rocket.fuelDetails;
  $("fuel-info").innerHTML = `
    <div class="fuel-header">
      <div>
        <div class="fuel-type">${f.fuel.name}</div>
        <div class="fuel-cycle">${f.cycle}</div>
      </div>
      <div style="text-align:right">
        <div class="fuel-type">${f.oxidizer.name}</div>
        <div class="fuel-cycle">O/F ratio = ${f.OFratio}</div>
      </div>
    </div>
    <div class="fuel-props">
      <div class="fuel-prop"><span class="fuel-prop-label">燃料密度</span><span>${f.fuel.density} kg/m³</span></div>
      <div class="fuel-prop"><span class="fuel-prop-label">氧化劑密度</span><span>${f.oxidizer.density} kg/m³</span></div>
      <div class="fuel-prop"><span class="fuel-prop-label">燃料熱值</span><span>${(f.fuel.specificEnergy/1e6).toFixed(1)} MJ/kg</span></div>
      <div class="fuel-prop"><span class="fuel-prop-label">燃燒室溫</span><span>${f.fuel.combustionTemp} K</span></div>
      <div class="fuel-prop"><span class="fuel-prop-label">燃料沸點</span><span>${f.fuel.boilPoint} K</span></div>
      <div class="fuel-prop"><span class="fuel-prop-label">氧化劑沸點</span><span>${f.oxidizer.boilPoint} K</span></div>
      <div class="fuel-prop"><span class="fuel-prop-label">燃燒室壓</span><span>${f.chamberPressure} bar</span></div>
      <div class="fuel-prop"><span class="fuel-prop-label">Isp (海平面)</span><span>${f.isp_sl} s</span></div>
    </div>
    <div class="fuel-note">${f.note}</div>
  `;
}

function renderTimeline(rocket, state) {
  const html = rocket.events.map(e => {
    let cls = "";
    if (state.t >= e.t) cls = "done";
    // 「當前」= 最近 15 秒內剛觸發
    if (state.recentEvent && e.name === state.recentEvent.name && state.t - state.recentEventTime < 15) {
      cls = "current";
    }
    return `<li class="${cls}"><span class="t">T+${formatTime(e.t)}</span><span>${e.name}</span></li>`;
  }).join("");
  $("timeline").innerHTML = html;
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updateDashboard() {
  const state = sim.getState();
  const r = sim.rocket;

  // HUD
  $("hudTime").textContent = "+" + formatTime(state.t);
  $("hudAlt").textContent = (state.altitude / 1000).toFixed(2) + " km";
  $("hudVel").textContent = Math.round(state.velocity) + " m/s";
  $("hudMach").textContent = state.mach.toFixed(2);
  $("hudStage").textContent = state.stage + " / " + r.stages.length;

  // Gauges
  $("dAlt").textContent = (state.altitude / 1000).toFixed(2);
  $("dAltBar").style.width = Math.min(100, state.altitude / 400000 * 100) + "%";
  $("dVel").textContent = Math.round(state.velocity);
  $("dVelBar").style.width = Math.min(100, state.velocity / 8000 * 100) + "%";
  $("dMach").textContent = state.mach.toFixed(2);
  $("dMachBar").style.width = Math.min(100, state.mach / 25 * 100) + "%";
  $("dFuel").textContent = Math.round(state.fuelPct);
  $("dFuelBar").style.width = state.fuelPct + "%";
  $("dAcc").textContent = state.gForce.toFixed(2);
  $("dAccBar").style.width = Math.min(100, state.gForce / 10 * 100) + "%";
  $("dQ").textContent = Math.round(state.dynQ / 1000);
  $("dQBar").style.width = Math.min(100, state.dynQ / 60000 * 100) + "%";

  // Forces
  const maxF = Math.max(state.thrust, state.gravity, state.drag, 1);
  const scale = v => Math.min(100, v / maxF * 100) + "%";
  $("fThrust").style.width = scale(state.thrust);
  $("fThrustVal").textContent = KN(state.thrust) + " kN";
  $("fGravity").style.width = scale(state.gravity);
  $("fGravityVal").textContent = KN(state.gravity) + " kN";
  $("fDrag").style.width = scale(state.drag);
  $("fDragVal").textContent = KN(state.drag) + " kN";
  $("fNet").style.width = scale(state.netForce);
  $("fNetVal").textContent = KN(state.netForce) + " kN";

  // Event banner
  if (state.recentEvent && state.t - state.recentEventTime < 4) {
    $("eventBanner").textContent = state.recentEvent.name;
    $("eventBanner").classList.add("show");
    eventBannerHideTimer = performance.now();
  } else if (performance.now() - eventBannerHideTimer > 3500) {
    $("eventBanner").classList.remove("show");
  }

  // Timeline
  renderTimeline(r, state);

  // v3: env 面板
  $("envWind").textContent = state.wind ? state.wind.toFixed(1) : "0";
  $("envAoA").textContent = state.AoA_deg ? state.AoA_deg.toFixed(1) : "0.0";
  $("envCor").textContent = state.coriolis_a ? state.coriolis_a.toFixed(3) : "0.000";
  $("envBoost").textContent = sim.earthRotationBoost ? sim.earthRotationBoost.toFixed(0) : "0";

  // v4: 結構動力學
  const pogo_pct = Math.abs(state.pogo_pct || 0);
  const pogo_g = state.pogo_g || 0;
  $("pogoPct").textContent = pogo_pct.toFixed(2);
  $("pogoG").textContent = (state.maxPogoG || 0).toFixed(2);
  $("pogoBar").style.width = Math.min(100, pogo_pct * 10) + "%";
  const slosh_abs = Math.abs(state.slosh_deg || 0);
  $("sloshDeg").textContent = slosh_abs.toFixed(2);
  $("sloshMax").textContent = (state.maxSloshDeg || 0).toFixed(2);
  $("sloshBar").style.width = Math.min(100, slosh_abs * 20) + "%";
  const bend_abs = Math.abs(state.bending_cm || 0);
  $("bendCm").textContent = bend_abs.toFixed(1);
  $("gimbalDeg").textContent = (state.gimbal_deg || 0).toFixed(2);
  $("bendBar").style.width = Math.min(100, bend_abs * 5) + "%";

  // v3: booster 面板（Falcon 9 專屬）
  const boosterPanel = $("boosterPanel");
  if (state.booster) {
    boosterPanel.style.display = "block";
    const b = state.booster;
    const phaseNames = {
      FLIP: "🔄 Flip Maneuver",
      BOOSTBACK: "🔥 Boostback Burn (3 engines)",
      COAST: "🌀 Ballistic Coast",
      ENTRY_BURN: "🔥 Entry Burn (70→40 km)",
      COAST2: "🌀 Terminal Descent",
      LANDING_BURN: "🎯 Landing Burn (hoverslam)",
      LANDED: "✅ Landed",
    };
    const isLanded = b.phase === "LANDED";
    $("boosterInfo").innerHTML = `
      <div class="booster-phase ${isLanded ? 'landed' : ''}">
        <span class="booster-phase-name">${phaseNames[b.phase] || b.phase}</span>
        <span class="booster-detail">alt ${((b.altitude || 0)/1000).toFixed(1)} km · v ${(b.speed || 0).toFixed(0)} m/s</span>
      </div>
      ${(b.events || []).slice(-4).reverse().map(e =>
        `<div class="booster-detail">T+${(e.t).toFixed(0)}s · ${e.name}</div>`
      ).join("")}
    `;
  } else {
    boosterPanel.style.display = "none";
  }

  // Track sim milestones + update accuracy panel
  trackSimMilestones(state);
  renderAccuracy(r);
}

function tick(now) {
  const dtWall = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  if (running) {
    const steps = Math.max(1, Math.floor(dtWall * timeScale / sim.dt));
    for (let i = 0; i < steps; i++) {
      sim.step();
      if (sim.status === "ORBIT" || sim.status === "LANDED") {
        running = false;
        $("btnLaunch").disabled = true;
        $("btnPause").disabled = true;
        break;
      }
    }
    edu.checkNow(sim.getState());
  }

  scene.draw(sim.getState(), sim.rocket);
  updateDashboard();

  requestAnimationFrame(tick);
}

// ============================================================
// 事件綁定
// ============================================================
function bindEvents() {
  document.querySelectorAll("#rocketPicker button").forEach(b => {
    b.addEventListener("click", () => selectRocket(b.dataset.rocket));
  });
  $("btnLaunch").addEventListener("click", () => {
    sim.launch();
    running = true;
    $("btnLaunch").disabled = true;
    $("btnPause").disabled = false;
  });
  $("btnPause").addEventListener("click", () => {
    running = !running;
    $("btnPause").textContent = running ? "⏸ PAUSE" : "▶ RESUME";
  });
  $("btnReset").addEventListener("click", () => {
    selectRocket(selectedRocket);
  });
  $("timeScale").addEventListener("input", e => {
    timeScale = parseInt(e.target.value);
    $("timeScaleLbl").textContent = timeScale;
  });
  // v4: 結構抑制器切換
  $("btnPogo").addEventListener("click", () => {
    sim.togglePogoSuppressor();
    const on = sim.pogo.suppressed;
    $("btnPogo").dataset.active = on ? "true" : "false";
    $("btnPogo").textContent = on ? "✅ 抑制器 ON" : "🩹 抑制器 OFF";
  });
  $("btnSlosh").addEventListener("click", () => {
    sim.toggleSloshBaffles();
    const on = sim.slosh.baffled;
    $("btnSlosh").dataset.active = on ? "true" : "false";
    $("btnSlosh").textContent = on ? "✅ 擋板 ON" : "🧱 擋板 OFF";
  });
}

// ============================================================
// Bootstrap
// ============================================================
window.addEventListener("DOMContentLoaded", () => {
  scene = new LaunchScene($("scene"));
  edu = new EducationSystem($("firstPrinciples"));
  bindEvents();
  selectRocket("falcon9");
  requestAnimationFrame(tick);
});
