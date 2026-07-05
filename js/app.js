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
  updateStaticPanels(rocket);
  renderTimeline(rocket, sim.getState());
  updateDashboard();
  $("btnLaunch").disabled = false;
  $("btnPause").disabled = true;
  running = false;
  $("btnPause").textContent = "⏸ PAUSE";
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
