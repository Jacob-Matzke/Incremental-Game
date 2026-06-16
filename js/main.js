/* =====================================================================
   main.js — boot sequence, animated starfield, and the main loop.
   ===================================================================== */
(function () {
  /* ---------------- animated starfield ---------------- */
  function initStarfield() {
    const canvas = document.getElementById("starfield");
    const ctx = canvas.getContext("2d");
    let stars = [];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const count = Math.floor((canvas.width * canvas.height) / 6000);
      stars = [];
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: Math.random() * 1.4 + 0.2,
          a: Math.random(),
          tw: Math.random() * 0.02 + 0.004,
          dx: (Math.random() - 0.5) * 0.05,
          dy: (Math.random() - 0.5) * 0.05,
        });
      }
    }
    window.addEventListener("resize", resize);
    resize();

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        s.a += s.tw;
        if (s.a > 1 || s.a < 0) s.tw *= -1;
        s.x += s.dx; s.y += s.dy;
        if (s.x < 0) s.x = canvas.width; if (s.x > canvas.width) s.x = 0;
        if (s.y < 0) s.y = canvas.height; if (s.y > canvas.height) s.y = 0;
        const alpha = 0.25 + Math.abs(s.a) * 0.65;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${180 + s.r * 30}, ${200}, 255, ${alpha})`;
        ctx.fill();
      }
      requestAnimationFrame(draw);
    }
    draw();
  }

  /* ---------------- main loop ---------------- */
  let last = performance.now();
  let saveTimer = 0;

  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 1) dt = 1;          // clamp big tab-switch gaps (offline handled separately)
    if (dt < 0) dt = 0;

    G.tick(dt);
    if (G.events) G.events.update(dt);
    G.ui.refresh();

    // autosave
    saveTimer += dt;
    if (saveTimer >= 15) {
      saveTimer = 0;
      if (G.state.settings.autosave) G.save();
    }
    requestAnimationFrame(loop);
  }

  /* ---------------- boot ---------------- */
  function boot() {
    initStarfield();
    const loaded = G.load();           // also applies offline progress
    G.recalc();
    G.ui.init();

    if (loaded && G.offlineEarned && G.offlineEarned > 5) {
      G.toast("🌙 Welcome back", "Simulated " + G.fmtTime(G.offlineEarned) + " of offline progress.");
    } else if (!loaded) {
      G.toast("✦ Welcome", "Buy a Mote to begin your ascent. Progress saves automatically.");
    }

    // save on exit
    window.addEventListener("beforeunload", () => G.save());

    initHotkeys();
    requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
  }

  /* ---------------- keyboard shortcuts ---------------- */
  function initHotkeys() {
    window.addEventListener("keydown", e => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      // number keys -> nth visible tab
      if (/^[1-9]$/.test(k)) {
        const tabs = [...document.querySelectorAll("#tabs .tab-btn")];
        const t = tabs[(+k) - 1];
        if (t) { G.ui.switchTab(t.dataset.tab); e.preventDefault(); }
        return;
      }
      if (k === "c") { G.doCollapse(false); e.preventDefault(); }
      else if (k === "x") { if (G.canCondense()) G.doCondense(false); e.preventDefault(); }
      else if (k === "m") {
        const order = [1, 10, "max"];
        const i = order.indexOf(G.state.buyMode);
        G.state.buyMode = order[(i + 1) % order.length];
        e.preventDefault();
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
