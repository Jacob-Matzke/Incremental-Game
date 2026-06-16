/* =====================================================================
   ui.js — rendering and interaction. Builds each tab once (or when
   marked dirty), then refreshes volatile numbers every frame.
   ===================================================================== */
(function () {
  const ui = {};
  G.ui = ui;

  const dirty = new Set();          // tabs needing a structural rebuild
  let builtTabs = new Set();        // tabs whose structure exists
  let lastVisibleKey = "";

  ui.markDirty = name => dirty.add(name);

  /* ---------------- tab definitions ---------------- */
  const TABS = [
    { id: "cosmos",       label: "✦ Cosmos",       show: () => true },
    { id: "collapse",     label: "💫 Collapse",     show: s => s.totalStardust >= 1e3 || s.collapses > 0,
                          notif: s => G.canCollapse() ? "!" : null },
    { id: "fusion",       label: "⚛ Fusion",       show: s => s.fusionUnlocked },
    { id: "automation",   label: "🤖 Automation",   show: s => s.collapses > 0 },
    { id: "achievements", label: "🏆 Achievements", show: () => true,
                          notif: s => { const n = G.ACHIEVEMENTS.filter(a => s.achievements[a.id]).length; return n + "/" + G.ACHIEVEMENTS.length; } },
    { id: "stats",        label: "📊 Stats",        show: () => true },
    { id: "settings",     label: "⚙ Settings",     show: () => true },
  ];

  /* ---------------- nav ---------------- */
  function visibleTabs() { return TABS.filter(t => t.show(G.state)); }

  function renderNav() {
    const vis = visibleTabs();
    const key = vis.map(t => t.id).join(",");
    const navEl = document.getElementById("tabs");
    if (key !== lastVisibleKey) {
      lastVisibleKey = key;
      navEl.innerHTML = "";
      for (const t of vis) {
        const b = document.createElement("button");
        b.className = "tab-btn";
        b.dataset.tab = t.id;
        b.innerHTML = `<span class="lbl">${t.label}</span>`;
        b.onclick = () => switchTab(t.id);
        navEl.appendChild(b);
      }
    }
    // active state + notif badges
    for (const b of navEl.children) {
      const t = TABS.find(x => x.id === b.dataset.tab);
      b.classList.toggle("active", G.state.activeTab === b.dataset.tab);
      let badge = b.querySelector(".notif");
      const txt = t.notif ? t.notif(G.state) : null;
      if (txt) {
        if (!badge) { badge = document.createElement("span"); badge.className = "notif"; b.appendChild(badge); }
        badge.textContent = txt;
      } else if (badge) badge.remove();
    }
  }

  function switchTab(id) {
    if (!visibleTabs().some(t => t.id === id)) id = "cosmos";
    G.state.activeTab = id;
    for (const p of document.querySelectorAll(".panel"))
      p.classList.toggle("active", p.dataset.tab === id);
    if (!builtTabs.has(id) || dirty.has(id)) renderTab(id);
    renderNav();
  }
  ui.switchTab = switchTab;

  /* ---------------- top resource bar (refreshed each frame) ---------------- */
  function refreshResources() {
    const s = G.state;
    const el = document.getElementById("resources");
    const showSL = s.collapses > 0 || s.totalStardust >= 1e3;
    const parts = [];
    parts.push(resHtml("stardust", "Stardust", G.fmt(s.stardust), "+" + G.fmtRate(G.cache.stardustRate)));
    if (showSL) parts.push(resHtml("starlight", "Starlight", G.fmt(s.starlight),
      G.canCollapse() ? "+" + G.fmt(G.cache.slGain) + " ready" : ""));
    if (s.fusionUnlocked) parts.push(resHtml("energy", "Stellar Energy", G.fmt(s.energy),
      "+" + G.fmtRate(G.cache.energyRate) + " · ×" + G.cache.energyMult.toFixed(2)));
    el.innerHTML = parts.join("");
  }
  function resHtml(cls, name, val, rate) {
    return `<div class="res ${cls}"><span class="res-name">${name}</span>
      <span class="res-val">${val}</span><span class="res-rate">${rate}</span></div>`;
  }

  /* ---------------- COSMOS tab ---------------- */
  function buildCosmos() {
    const el = document.getElementById("tab-cosmos");
    el.innerHTML = `
      <div class="section-title">Cosmic Generators</div>
      <p class="hint">Each generator produces the one below it; Motes produce raw Stardust.
        Buy higher tiers to accelerate everything beneath them.</p>
      <div class="buymode" id="buymode"></div>
      <div class="gen-grid" id="gen-grid"></div>`;

    // buy mode
    const bm = el.querySelector("#buymode");
    [["1", 1], ["x10", 10], ["MAX", "max"]].forEach(([lbl, val]) => {
      const b = document.createElement("button");
      b.className = "btn ghost small";
      b.textContent = "Buy " + lbl;
      b.onclick = () => { G.state.buyMode = val; refreshCosmos(); };
      b.dataset.mode = val;
      bm.appendChild(b);
    });

    const grid = el.querySelector("#gen-grid");
    G.GENERATORS.forEach((def, i) => {
      const card = document.createElement("div");
      card.className = "gen-card";
      card.dataset.gen = i;
      card.innerHTML = `
        <div class="gen-info">
          <div class="gen-name"><span class="gen-icon">${def.icon}</span>${def.name}
            <span class="gen-owned"></span></div>
          <div class="gen-desc"></div>
          <div class="gen-prod"></div>
        </div>
        <div class="gen-buy"><button class="btn buy-btn"></button></div>`;
      card.querySelector(".buy-btn").onclick = () => {
        if (G.buyGenerator(i)) refreshCosmos();
      };
      grid.appendChild(card);
    });
  }

  function refreshCosmos() {
    const s = G.state;
    // buy mode highlight
    for (const b of document.querySelectorAll("#buymode .btn"))
      b.classList.toggle("active", String(b.dataset.mode) === String(s.buyMode));

    document.querySelectorAll("#gen-grid .gen-card").forEach(card => {
      const i = +card.dataset.gen;
      const def = G.GENERATORS[i];
      const g = s.generators[i];
      // visibility: show a tier once the previous one has been bought (keeps early game clean)
      const prevBought = i === 0 ? true : s.generators[i - 1].bought > 0 || g.bought > 0;
      card.style.display = prevBought ? "" : "none";
      if (!prevBought) return;

      const target = i === 0 ? "Stardust" : G.GENERATORS[i - 1].name;
      const each = def.baseProd * G.cache.prodMult;
      const flowTotal = g.count * each;

      card.querySelector(".gen-owned").textContent =
        "×" + G.fmtInt(g.count) + (g.bought > 0 ? " (" + G.fmtInt(g.bought) + " bought)" : "");
      card.querySelector(".gen-desc").textContent =
        "Each produces " + G.fmt(each) + " " + target + "/s";
      card.querySelector(".gen-prod").textContent =
        g.count > 0 ? "▸ " + G.fmt(flowTotal) + " " + target + "/s total" : "";

      // buy button
      const btn = card.querySelector(".buy-btn");
      let k, cost;
      if (s.buyMode === "max") { k = G.maxAffordable(i, s.stardust); cost = k > 0 ? bulkCostUI(i, k) : G.genCost(i); }
      else { k = s.buyMode; cost = bulkCostUI(i, k); }
      const affordable = s.stardust >= cost && k > 0;
      btn.disabled = !affordable;
      btn.innerHTML = `Buy ${s.buyMode === "max" ? "×" + G.fmtInt(Math.max(k, 0)) : "×" + k}<br>
        <span style="font-size:11px;opacity:.8">${G.fmt(cost)} Stardust</span>`;
      card.classList.toggle("affordable", affordable);
    });
  }
  function bulkCostUI(i, k) {
    // mirror of game.bulkCost using current cost mult
    const def = G.GENERATORS[i];
    const b = G.state.generators[i].bought;
    const r = def.costGrowth;
    const base = def.baseCost * Math.pow(r, b) * G.cache.costMult;
    return base * (Math.pow(r, k) - 1) / (r - 1);
  }

  /* ---------------- COLLAPSE tab ---------------- */
  function buildCollapse() {
    const el = document.getElementById("tab-collapse");
    el.innerHTML = `
      <div class="prestige-hero">
        <h2>💫 Stellar Collapse</h2>
        <div class="req" id="col-req"></div>
        <div class="gain" id="col-gain"></div>
        <p class="hint" style="max-width:560px;margin:10px auto">Collapse your cosmos into pure
          <b style="color:var(--accent-2)">Starlight</b>. This resets Stardust and all generators,
          but Starlight buys permanent upgrades that make every future run faster.</p>
        <button class="btn violet big" id="col-btn">Collapse</button>
      </div>
      <div class="section-title">Starlight Tree</div>
      <div class="tree" id="tree"></div>`;

    el.querySelector("#col-btn").onclick = () => G.doCollapse(false);

    // tree, grouped by row
    const tree = el.querySelector("#tree");
    const rows = {};
    for (const u of G.STAR_UPGRADES) (rows[u.row] = rows[u.row] || []).push(u);
    Object.keys(rows).sort((a, b) => a - b).forEach(r => {
      const rowEl = document.createElement("div");
      rowEl.className = "tree-row";
      rows[r].forEach(u => {
        const node = document.createElement("div");
        node.className = "node";
        node.dataset.up = u.id;
        node.innerHTML = `
          <div class="node-name">${u.name}</div>
          <div class="node-desc">${u.desc}</div>
          <div class="node-cost"></div>`;
        node.onclick = () => { if (G.buyUpgrade(u.id)) { refreshCollapse(); ui.markDirty("automation"); } };
        rowEl.appendChild(node);
      });
      tree.appendChild(rowEl);
    });
  }

  function refreshCollapse() {
    const s = G.state;
    const can = G.canCollapse();
    const reqEl = document.getElementById("col-req");
    const gainEl = document.getElementById("col-gain");
    if (reqEl) reqEl.textContent = can
      ? "Ready to collapse"
      : "Requires " + G.fmt(G.COLLAPSE_REQ) + " total Stardust (have " + G.fmt(s.totalStardust) + ")";
    if (gainEl) gainEl.textContent = "+" + G.fmt(G.cache.slGain) + " Starlight";
    const btn = document.getElementById("col-btn");
    if (btn) btn.disabled = !can;

    document.querySelectorAll("#tree .node").forEach(node => {
      const u = G.STAR_UPGRADES.find(x => x.id === node.dataset.up);
      const owned = !!s.upgrades[u.id];
      const reqMet = (u.req || []).every(r => s.upgrades[r]);
      const affordable = !owned && reqMet && s.starlight >= u.cost;
      node.classList.toggle("owned", owned);
      node.classList.toggle("locked", !owned && !reqMet);
      node.classList.toggle("affordable", affordable);
      const costEl = node.querySelector(".node-cost");
      if (owned) costEl.innerHTML = `<span class="node-owned-tag">✓ Purchased</span>`;
      else if (!reqMet) costEl.innerHTML = `<span style="color:var(--text-dim)">Requires: ${u.req.map(r => G.STAR_UPGRADES.find(x => x.id === r).name).join(", ")}</span>`;
      else costEl.innerHTML = `<span style="color:${affordable ? "var(--accent-2)" : "var(--bad)"}">${G.fmt(u.cost)} Starlight</span>`;
    });
  }

  // upgrade purchase (kept here for locality with the tree UI)
  G.buyUpgrade = function (id) {
    const s = G.state;
    const u = G.STAR_UPGRADES.find(x => x.id === id);
    if (!u || s.upgrades[id]) return false;
    if (!(u.req || []).every(r => s.upgrades[r])) return false;
    if (s.starlight < u.cost) return false;
    s.starlight -= u.cost;
    s.upgrades[id] = true;
    if (id === "fusion") {
      s.fusionUnlocked = true;
      G.toast("⚛ Fusion Online", "The Fusion loop is now generating Stellar Energy.");
      lastVisibleKey = ""; // force nav rebuild to reveal the tab
    }
    if (id === "keep1") { s.generators[0].count = Math.max(s.generators[0].count, 10); s.generators[0].bought = Math.max(s.generators[0].bought, 10); }
    G.recalc();
    return true;
  };

  /* ---------------- FUSION tab ---------------- */
  function buildFusion() {
    const el = document.getElementById("tab-fusion");
    el.innerHTML = `
      <div class="section-title">Fusion Loop</div>
      <p class="hint">A parallel loop. Your <b>purchased</b> generators fuel fusion, producing
        <b style="color:var(--accent-3)">Stellar Energy</b>. Energy then multiplies <i>all</i> Stardust
        production — so the two loops feed each other. Energy persists through Collapses.</p>
      <div class="stat-grid" id="fusion-stats"></div>`;
  }
  function refreshFusion() {
    const s = G.state;
    const el = document.getElementById("fusion-stats");
    if (!el) return;
    el.innerHTML =
      stat("Stellar Energy", G.fmt(s.energy)) +
      stat("Generation", G.fmtRate(G.cache.energyRate)) +
      stat("Production Boost", "×" + G.cache.energyMult.toFixed(3)) +
      stat("Total Energy Ever", G.fmt(s.totalEnergy)) +
      stat("Conduits", G.has("energy1") ? "Plasma (×5)" : "Basic");
  }

  /* ---------------- AUTOMATION tab ---------------- */
  function buildAutomation() {
    const el = document.getElementById("tab-automation");
    el.innerHTML = `
      <div class="section-title">Automation</div>
      <p class="hint">Unlock automations through the Starlight tree — or strive for the linked
        achievements to unlock some of them early.</p>
      <div class="auto-grid" id="auto-grid"></div>`;
    const grid = el.querySelector("#auto-grid");
    for (const a of G.AUTOMATIONS) {
      const card = document.createElement("div");
      card.className = "auto-card";
      card.dataset.auto = a.id;
      card.innerHTML = `
        <div class="auto-head">
          <span class="auto-name">${a.name}</span>
          <label class="switch"><input type="checkbox"><span class="slider"></span></label>
        </div>
        <div class="auto-desc">${a.desc}</div>
        <div class="auto-unlock"></div>
        ${a.id === "auto_collapse" ? `<div class="auto-config">Interval:
          <input type="number" min="1" step="1" class="ac-int"> seconds</div>` : ""}`;
      const cb = card.querySelector("input");
      cb.onchange = () => { G.state.automation[a.id] = cb.checked; };
      const intInput = card.querySelector(".ac-int");
      if (intInput) {
        intInput.value = G.state.autoCollapseInterval;
        intInput.onchange = () => {
          const v = Math.max(1, Math.floor(+intInput.value || 60));
          G.state.autoCollapseInterval = v; intInput.value = v;
        };
      }
      grid.appendChild(card);
    }
  }
  function refreshAutomation() {
    const s = G.state;
    document.querySelectorAll("#auto-grid .auto-card").forEach(card => {
      const a = G.AUTOMATIONS.find(x => x.id === card.dataset.auto);
      const unlocked = G.autoUnlocked(a.id);
      card.classList.toggle("locked", !unlocked);
      const cb = card.querySelector("input");
      cb.disabled = !unlocked;
      cb.checked = !!s.automation[a.id];
      card.querySelector(".auto-unlock").textContent = unlocked ? "✓ Unlocked" : "🔒 Locked — see tree / achievements";
    });
  }

  /* ---------------- ACHIEVEMENTS tab ---------------- */
  function buildAchievements() {
    const el = document.getElementById("tab-achievements");
    el.innerHTML = `<div class="section-title">Achievements</div>
      <p class="hint" id="ach-summary"></p><div class="ach-grid" id="ach-grid"></div>`;
    const grid = el.querySelector("#ach-grid");
    for (const a of G.ACHIEVEMENTS) {
      const d = document.createElement("div");
      d.className = "ach";
      d.dataset.ach = a.id;
      d.innerHTML = `
        <div class="ach-name"><span class="ach-icon">${a.icon}</span>${a.name}</div>
        <div class="ach-desc">${a.desc}</div>
        <div class="ach-reward">${a.mult ? "Reward: ×" + a.mult.toFixed(2) + " production" : ""}${a.unlocks ? " · unlocks automation" : ""}</div>`;
      grid.appendChild(d);
    }
  }
  function refreshAchievements() {
    const s = G.state;
    const done = G.ACHIEVEMENTS.filter(a => s.achievements[a.id]).length;
    const sum = document.getElementById("ach-summary");
    if (sum) sum.textContent = `${done} / ${G.ACHIEVEMENTS.length} unlocked · total bonus ×${G.cache.achMult.toFixed(2)}`;
    document.querySelectorAll("#ach-grid .ach").forEach(d => {
      d.classList.toggle("done", !!s.achievements[d.dataset.ach]);
    });
  }

  /* ---------------- STATS tab ---------------- */
  function buildStats() {
    document.getElementById("tab-stats").innerHTML =
      `<div class="section-title">Statistics</div><div class="stat-grid" id="stat-grid"></div>`;
  }
  function refreshStats() {
    const s = G.state;
    const el = document.getElementById("stat-grid");
    if (!el) return;
    el.innerHTML =
      stat("Stardust", G.fmt(s.stardust)) +
      stat("Stardust / sec", G.fmt(G.cache.stardustRate)) +
      stat("Total Stardust", G.fmt(s.totalStardust)) +
      stat("Starlight", G.fmt(s.starlight)) +
      stat("Total Starlight", G.fmt(s.totalStarlight)) +
      stat("Collapses", G.fmtInt(s.collapses)) +
      stat("Production Multiplier", "×" + G.fmt(G.cache.prodMult)) +
      stat("Stellar Energy", s.fusionUnlocked ? G.fmt(s.energy) : "—") +
      stat("Energy Boost", s.fusionUnlocked ? "×" + G.cache.energyMult.toFixed(3) : "—") +
      stat("Achievements", G.ACHIEVEMENTS.filter(a => s.achievements[a.id]).length + "/" + G.ACHIEVEMENTS.length) +
      stat("Upgrades Owned", Object.keys(s.upgrades).length + "/" + G.STAR_UPGRADES.length) +
      stat("Time Played", G.fmtTime(s.stats.timePlayed));
  }
  function stat(label, value) {
    return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;
  }

  /* ---------------- SETTINGS tab ---------------- */
  function buildSettings() {
    const el = document.getElementById("tab-settings");
    el.innerHTML = `
      <div class="section-title">Settings</div>
      <div class="settings-block">
        <h3>Save Management</h3>
        <div class="settings-row">
          <button class="btn green" id="btn-save">💾 Save Now</button>
          <button class="btn" id="btn-export">⬆ Export to Box</button>
          <button class="btn" id="btn-copy">📋 Copy Save</button>
          <button class="btn" id="btn-import">⬇ Import from Box</button>
          <button class="btn" id="btn-file-export">📁 Download File</button>
          <label class="btn ghost" style="cursor:pointer">📂 Load File
            <input type="file" id="file-input" accept=".txt,.json" style="display:none"></label>
        </div>
        <textarea id="savebox" placeholder="Your save string appears here on Export. Paste a save here and click Import."></textarea>
      </div>
      <div class="settings-block">
        <h3>Preferences</h3>
        <div class="settings-row">
          <span>Number notation:</span>
          <button class="btn ghost small" id="not-standard">Standard (K/M/B)</button>
          <button class="btn ghost small" id="not-scientific">Scientific (1e6)</button>
        </div>
        <div class="settings-row">
          <label class="switch"><input type="checkbox" id="set-autosave"><span class="slider"></span></label>
          <span>Autosave every 15s</span>
        </div>
      </div>
      <div class="settings-block">
        <h3 style="color:var(--bad)">Danger Zone</h3>
        <div class="settings-row">
          <button class="btn ghost" id="btn-reset" style="border-color:var(--bad);color:var(--bad)">☠ Hard Reset (erase everything)</button>
        </div>
      </div>`;

    const box = el.querySelector("#savebox");
    el.querySelector("#btn-save").onclick = () => { G.save(); G.toast("💾 Saved", "Progress stored in your browser."); };
    el.querySelector("#btn-export").onclick = () => { box.value = G.exportSave(); G.toast("⬆ Exported", "Save string written to the box below."); };
    el.querySelector("#btn-copy").onclick = async () => {
      const str = G.exportSave(); box.value = str;
      try { await navigator.clipboard.writeText(str); G.toast("📋 Copied", "Save copied to clipboard."); }
      catch (e) { box.select(); G.toast("📋 Select & copy", "Clipboard blocked — text selected for manual copy."); }
    };
    el.querySelector("#btn-import").onclick = () => {
      if (!box.value.trim()) return G.toast("⚠ Nothing to import", "Paste a save string into the box first.");
      if (G.importSave(box.value)) { rebuildAll(); G.toast("⬇ Imported", "Save loaded successfully."); }
      else G.toast("❌ Import failed", "That doesn't look like a valid save.");
    };
    el.querySelector("#btn-file-export").onclick = () => {
      const blob = new Blob([G.exportSave()], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "stardust-ascendant-save.txt";
      a.click(); URL.revokeObjectURL(a.href);
    };
    el.querySelector("#file-input").onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { if (G.importSave(r.result)) { rebuildAll(); G.toast("⬇ Imported", "Save file loaded."); } else G.toast("❌ Import failed", "Invalid save file."); };
      r.readAsText(f);
    };
    el.querySelector("#not-standard").onclick = () => { G.state.settings.notation = "standard"; refreshSettings(); };
    el.querySelector("#not-scientific").onclick = () => { G.state.settings.notation = "scientific"; refreshSettings(); };
    const as = el.querySelector("#set-autosave");
    as.onchange = () => { G.state.settings.autosave = as.checked; };
    el.querySelector("#btn-reset").onclick = () => {
      if (confirm("Hard reset? This permanently erases ALL progress. Consider exporting a backup first.")) {
        G.hardReset(); rebuildAll(); G.toast("☠ Reset", "A fresh cosmos awaits.");
      }
    };
  }
  function refreshSettings() {
    const s = G.state;
    const std = document.getElementById("not-standard");
    const sci = document.getElementById("not-scientific");
    if (std) std.classList.toggle("active", s.settings.notation === "standard");
    if (sci) sci.classList.toggle("active", s.settings.notation === "scientific");
    const as = document.getElementById("set-autosave");
    if (as) as.checked = s.settings.autosave;
  }

  /* ---------------- dispatch ---------------- */
  const BUILDERS = {
    cosmos: buildCosmos, collapse: buildCollapse, fusion: buildFusion,
    automation: buildAutomation, achievements: buildAchievements,
    stats: buildStats, settings: buildSettings,
  };
  const REFRESHERS = {
    cosmos: refreshCosmos, collapse: refreshCollapse, fusion: refreshFusion,
    automation: refreshAutomation, achievements: refreshAchievements,
    stats: refreshStats, settings: refreshSettings,
  };

  function renderTab(id) {
    if (BUILDERS[id]) { BUILDERS[id](); builtTabs.add(id); dirty.delete(id); }
  }
  ui.renderTab = renderTab;

  function rebuildAll() {
    builtTabs = new Set();
    dirty.clear();
    lastVisibleKey = "";
    renderNav();
    switchTab(visibleTabs().some(t => t.id === G.state.activeTab) ? G.state.activeTab : "cosmos");
  }
  ui.rebuildAll = rebuildAll;

  // called every animation frame from main.js
  ui.refresh = function () {
    renderNav();
    refreshResources();
    const id = G.state.activeTab;
    if (dirty.has(id)) renderTab(id);
    if (REFRESHERS[id]) REFRESHERS[id]();
  };

  ui.init = function () {
    renderNav();
    switchTab(G.state.activeTab || "cosmos");
  };

  /* ---------------- toasts ---------------- */
  G.toast = function (title, body) {
    const wrap = document.getElementById("toasts");
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `<div class="toast-title">${title}</div><div class="toast-body">${body}</div>`;
    wrap.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  };
})();
