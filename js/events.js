/* =====================================================================
   events.js — Cosmic Anomalies: golden-cookie-style clickable orbs that
   grant random temporary buffs or instant rewards. The single biggest
   active-engagement hook (variable rewards), balanced against idle play.
   ===================================================================== */
(function () {
  // Reward table. `buff:true` adds a timed production multiplier; otherwise
  // apply(s) grants something instant. `cond` gates availability.
  G.EVENTS = [
    { id: "frenzy", label: "Frenzy",        icon: "⚡", weight: 30, buff: true, mult: 7, dur: 20,
      msg: "×7 Stardust production for 20s!" },
    { id: "bloom",  label: "Cosmic Bloom",  icon: "🌸", weight: 26, buff: true, mult: 3, dur: 45,
      msg: "×3 Stardust production for 45s!" },
    { id: "rush",   label: "Stardust Rush",  icon: "✦", weight: 24,
      apply: s => { const g = G.cache.stardustRate * 60; s.stardust = G.clampNum(s.stardust + g); s.totalStardust = G.clampNum(s.totalStardust + g); },
      msg: "A full minute of Stardust, instantly!" },
    { id: "warp",   label: "Time Dilation", icon: "⏳", weight: 12,
      apply: s => { for (let i = 0; i < 10; i++) G.tick(9); },   // simulate ~90s
      msg: "Skipped 90 seconds of progress!" },
    { id: "beam",   label: "Starlight Beam", icon: "💫", weight: 8, cond: s => s.totalStarlight > 0 || s.collapses > 0,
      apply: s => { const g = Math.max(1, Math.floor(G.cache.slGainRaw * 3)); s.starlight = G.clampNum(s.starlight + g); s.totalStarlight = G.clampNum(s.totalStarlight + g); },
      msg: "A burst of bonus Starlight!" },
  ];

  // lightweight PRNG (Math.random is unavailable in some contexts here)
  let _seed = 1;
  function pseudo() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
  function rand(a, b) { return a + (b - a) * pseudo(); }

  let liveOrb = null;
  let spawnTimer = rand(25, 55);   // first orb comes fairly soon to teach the mechanic

  function weightedPick() {
    const s = G.state;
    const pool = G.EVENTS.filter(e => !e.cond || e.cond(s));
    let total = 0; for (const e of pool) total += e.weight;
    let r = pseudo() * total;
    for (const e of pool) { r -= e.weight; if (r <= 0) return e; }
    return pool[0];
  }

  function spawn() {
    if (liveOrb) return;
    const layer = document.getElementById("anomalies");
    if (!layer) return;
    const orb = document.createElement("button");
    orb.className = "anomaly";
    orb.innerHTML = "✦";
    orb.title = "A Cosmic Anomaly! Click for a bonus.";
    const x = 8 + pseudo() * 78;   // vw
    const y = 18 + pseudo() * 62;   // vh
    orb.style.left = x + "vw";
    orb.style.top = y + "vh";
    orb.onclick = () => { collect(); };
    layer.appendChild(orb);
    liveOrb = { el: orb, life: 13 };   // seconds on screen
  }

  function despawn() {
    if (liveOrb) { liveOrb.el.classList.add("leaving"); const el = liveOrb.el; setTimeout(() => el.remove(), 350); liveOrb = null; }
  }

  function collect() {
    if (!liveOrb) return;
    despawn();
    const ev = weightedPick();
    const s = G.state;
    if (ev.buff) {
      // refresh if same buff already active, else add
      const existing = s.buffs.find(b => b.id === ev.id);
      if (existing) existing.remaining = ev.dur;
      else s.buffs.push({ id: ev.id, label: ev.label, icon: ev.icon, mult: ev.mult, remaining: ev.dur, total: ev.dur });
    } else {
      try { ev.apply(s); } catch (e) { /* ignore */ }
    }
    G.recalc();
    G.toast(ev.icon + " " + ev.label, ev.msg);
    if (G.news) G.news("✦ A Cosmic Anomaly bursts — " + ev.label + "!");
    spawnTimer = rand(55, 130);   // next orb
  }

  // Called from the main loop with real-time dt (NOT during offline catch-up,
  // so orbs only appear while actually playing).
  G.events = {
    update(dt) {
      if (!G.state) return;
      renderBuffs();                 // always reflect active buffs, even if backgrounded
      const on = G.state.settings.events !== false;
      if (liveOrb) {                 // orb lifetime / despawn
        liveOrb.life -= dt;
        if (liveOrb.life <= 0) despawn();
      }
      if (!on) { if (liveOrb) despawn(); return; }
      if (document.hidden) return;   // only pause spawning while the tab is hidden
      spawnTimer -= dt;
      if (spawnTimer <= 0 && !liveOrb) spawn();
    },
    // exposed for testing
    _spawn: spawn, _collect: collect,
  };

  function renderBuffs() {
    const bar = document.getElementById("buffbar");
    if (!bar) return;
    const buffs = G.state.buffs || [];
    if (!buffs.length) { if (bar.childElementCount) bar.innerHTML = ""; return; }
    bar.innerHTML = buffs.map(b => {
      const pct = Math.max(0, Math.min(100, (b.remaining / b.total) * 100));
      return `<span class="buff-chip"><span class="buff-ic">${b.icon}</span>×${b.mult} ${b.label}
        <span class="buff-time">${Math.ceil(b.remaining)}s</span>
        <span class="buff-bar" style="width:${pct}%"></span></span>`;
    }).join("");
  }
})();
