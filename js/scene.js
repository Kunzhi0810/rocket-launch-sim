/**
 * 2D Canvas 火箭升空場景
 *
 * 選擇 canvas 2D 而非 Three.js WebGL 的原因：
 *  - 零外部依賴 → GitHub Pages 直接可跑
 *  - 效能穩定（Ken 機器無獨顯）
 *  - 側視圖對火箭升空最直覺
 *
 * 場景組成：
 *  - 星空背景（隨高度顏色漸變）
 *  - 地平線 + 地面
 *  - 火箭 sprite（依 rocket 型號顏色）
 *  - 引擎火焰（動態）
 *  - 高度標尺（10km / 100km / 400km ISS）
 *  - 已墜/已成功指示
 */

class LaunchScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = window.devicePixelRatio || 1;
    this.stars = this.generateStars(220);
    this.smokeParticles = [];
    this.rocketType = "falcon9";
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  generateStars(n) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      arr.push({
        x: Math.random(),
        y: Math.random(),
        size: Math.random() * 1.6 + 0.3,
        twinkle: Math.random(),
      });
    }
    return arr;
  }

  setRocket(type) {
    this.rocketType = type;
    this.smokeParticles = [];
  }

  // ========================================================
  // 座標系：畫面下 1/6 是地面，往上是天空
  // 火箭永遠畫在畫面中間偏下的定位點（相機跟隨）
  // 高度用「相對縮放」呈現：0-2km 線性、之後對數壓縮
  // ========================================================
  altitudeToScreenY(alt, groundY) {
    // 0 alt = groundY，高度增加往上（y 減小）
    // 用 arctan 壓縮，讓 0-100 km 都能看到
    const compressed = (Math.atan(alt / 30000) / (Math.PI / 2)); // 0 to 1
    return groundY - compressed * (groundY - 40);
  }

  skyColorAt(alt) {
    // 隨高度從藍轉黑
    const t = Math.min(1, alt / 100000);
    const top = { r: 5, g: 9, b: 21 };        // 太空
    const bot = { r: 74, g: 110, b: 168 };    // 天藍
    const r = Math.round(bot.r + (top.r - bot.r) * t);
    const g = Math.round(bot.g + (top.g - bot.g) * t);
    const b = Math.round(bot.b + (top.b - bot.b) * t);
    return `rgb(${r},${g},${b})`;
  }

  draw(state, rocket) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const groundY = h * 0.88;
    const rocketX = w / 2;
    const rocketY = this.altitudeToScreenY(state.altitude, groundY);

    // 背景漸層
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    const skyTop = this.skyColorAt(Math.max(state.altitude, 20000));
    const skyBot = this.skyColorAt(state.altitude);
    grad.addColorStop(0, skyTop);
    grad.addColorStop(1, skyBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 星空（高空更亮）
    const starOpacity = Math.min(1, state.altitude / 20000);
    ctx.fillStyle = `rgba(255,255,255,${starOpacity})`;
    for (const s of this.stars) {
      const tw = 0.5 + 0.5 * Math.sin(this.frame * 0.02 + s.twinkle * 10);
      ctx.globalAlpha = starOpacity * tw;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h * 0.7, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 地面（只有低空看得到）
    if (state.altitude < 8000) {
      const groundOpacity = 1 - Math.min(1, state.altitude / 8000);
      ctx.fillStyle = `rgba(50, 45, 70, ${groundOpacity})`;
      ctx.fillRect(0, groundY, w, h - groundY);

      // 遠山剪影
      ctx.fillStyle = `rgba(30, 25, 50, ${groundOpacity})`;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      for (let x = 0; x < w; x += 40) {
        const y = groundY - 20 - Math.sin(x * 0.02) * 15 - Math.random() * 5;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, groundY);
      ctx.closePath();
      ctx.fill();

      // 發射塔
      const towerX = w / 2 - 30;
      ctx.strokeStyle = `rgba(180, 180, 200, ${groundOpacity})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(towerX, groundY);
      ctx.lineTo(towerX, groundY - 80);
      ctx.moveTo(towerX + 5, groundY - 20);
      ctx.lineTo(towerX + 5, groundY - 75);
      ctx.moveTo(towerX, groundY - 30);
      ctx.lineTo(towerX + 5, groundY - 30);
      ctx.moveTo(towerX, groundY - 60);
      ctx.lineTo(towerX + 5, groundY - 60);
      ctx.stroke();
    }

    // 高度標尺
    this.drawAltitudeMarkers(state.altitude, groundY);

    // 煙霧（近地起飛階段）
    if (state.altitude < 2000 && state.status === "ASCENT") {
      this.spawnSmoke(rocketX, groundY, state);
    }
    this.updateAndDrawSmoke(rocketX);

    // 火箭
    this.drawRocket(rocketX, rocketY, state, rocket);

    this.frame = (this.frame || 0) + 1;
  }

  drawAltitudeMarkers(altitude, groundY) {
    const ctx = this.ctx;
    const markers = [
      { alt: 10000, label: "10 km" },
      { alt: 50000, label: "50 km" },
      { alt: 100000, label: "100 km Kármán" },
      { alt: 400000, label: "400 km ISS" },
    ];
    ctx.font = "11px SF Mono, Consolas, monospace";
    ctx.textAlign = "right";
    for (const m of markers) {
      const y = this.altitudeToScreenY(m.alt, groundY);
      if (y < 20) continue;
      ctx.strokeStyle = "rgba(150, 180, 255, 0.15)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(this.width - 8, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(150, 180, 255, 0.6)";
      ctx.fillText(m.label, this.width - 10, y - 4);
    }
  }

  spawnSmoke(x, groundY, state) {
    // 燃燒中就冒煙
    if (state.thrust > 0 && Math.random() < 0.7) {
      for (let i = 0; i < 3; i++) {
        this.smokeParticles.push({
          x: x + (Math.random() - 0.5) * 30,
          y: groundY - 5,
          vx: (Math.random() - 0.5) * 2,
          vy: Math.random() * 0.5,
          life: 60 + Math.random() * 40,
          size: 10 + Math.random() * 15,
        });
      }
    }
  }

  updateAndDrawSmoke(rocketX) {
    const ctx = this.ctx;
    const alive = [];
    for (const p of this.smokeParticles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98;
      p.vy += 0.05;
      p.life -= 1;
      if (p.life > 0) alive.push(p);
      const opacity = Math.min(1, p.life / 100);
      ctx.fillStyle = `rgba(200, 190, 180, ${opacity * 0.5})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    this.smokeParticles = alive.slice(-150);  // 上限
  }

  drawRocket(x, y, state, rocket) {
    const ctx = this.ctx;
    ctx.save();
    // 相對垂直角度（gravity turn 後傾）
    const angle = (90 - (state.pitchAngle || 90)) * Math.PI / 180;
    ctx.translate(x, y);
    ctx.rotate(angle);

    // 火箭大小依 rocket 高度縮放
    const scale = Math.min(1.4, Math.max(0.8, rocket.height / 80));
    const bodyW = 12 * scale;
    const bodyH = 60 * scale;

    // 主體
    ctx.fillStyle = rocket.heroColor || "#e8e8e8";
    ctx.strokeStyle = "rgba(60, 70, 100, 0.5)";
    ctx.lineWidth = 1;
    ctx.fillRect(-bodyW / 2, -bodyH * 0.4, bodyW, bodyH);
    ctx.strokeRect(-bodyW / 2, -bodyH * 0.4, bodyW, bodyH);

    // 頭錐
    ctx.beginPath();
    ctx.moveTo(-bodyW / 2, -bodyH * 0.4);
    ctx.lineTo(0, -bodyH * 0.4 - bodyW * 1.2);
    ctx.lineTo(bodyW / 2, -bodyH * 0.4);
    ctx.closePath();
    ctx.fillStyle = rocket.heroColor || "#e8e8e8";
    ctx.fill();
    ctx.stroke();

    // 尾翼
    ctx.fillStyle = "#666";
    ctx.beginPath();
    ctx.moveTo(-bodyW / 2, bodyH * 0.6);
    ctx.lineTo(-bodyW, bodyH * 0.6 + 6);
    ctx.lineTo(-bodyW / 2, bodyH * 0.6);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bodyW / 2, bodyH * 0.6);
    ctx.lineTo(bodyW, bodyH * 0.6 + 6);
    ctx.lineTo(bodyW / 2, bodyH * 0.6);
    ctx.fill();

    // 引擎火焰
    if (state.thrust > 0) {
      const flameL = 30 + Math.random() * 15;
      const flameW = bodyW * 0.9;
      const grad = ctx.createLinearGradient(0, bodyH * 0.6, 0, bodyH * 0.6 + flameL);
      grad.addColorStop(0, "rgba(255, 240, 200, 1)");
      grad.addColorStop(0.5, "rgba(255, 150, 40, 0.9)");
      grad.addColorStop(1, "rgba(255, 60, 40, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-flameW / 2, bodyH * 0.6);
      ctx.quadraticCurveTo(0, bodyH * 0.6 + flameL * 1.2, flameW / 2, bodyH * 0.6);
      ctx.closePath();
      ctx.fill();
      // 內焰更亮
      const grad2 = ctx.createLinearGradient(0, bodyH * 0.6, 0, bodyH * 0.6 + flameL * 0.6);
      grad2.addColorStop(0, "rgba(200, 240, 255, 1)");
      grad2.addColorStop(1, "rgba(255, 255, 200, 0)");
      ctx.fillStyle = grad2;
      ctx.beginPath();
      ctx.moveTo(-flameW * 0.35, bodyH * 0.6);
      ctx.quadraticCurveTo(0, bodyH * 0.6 + flameL * 0.7, flameW * 0.35, bodyH * 0.6);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}
