/* =====================================================================
   game.js — state, persistence, and the simulation engine.
   ===================================================================== */
(function () {
  const SAVE_KEY = "stardust_ascendant_save";
  const SAVE_VERSION = 1;
  const OFFLINE_CAP = 8 * 3600;   // max 8 hours of offline progress
  const COLLAPSE_REQ = 1e4;       // stardust needed for the first/any collapse to give >=1

  /* ---------------- default state ---------------- */
  function freshState() {
    return {
      version: SAVE_VERSION,
      stardust: 10,
      totalStardust: 10,
      generators: G.GENERATORS.map(() => ({ count: 0, bought: 0 })),

      starlight: 0,
      totalStarlight: 0,
      collapses: 0,
      upgrades: {},                       // { upgradeId: true }

      fusionUnlocked: false,
      energy: 0,
      totalEnergy: 0,

      automation: {},                     // { autoId: true }  (enabled toggles)
      autoCollapseInterval: 60,           // seconds
      _autoCollapseTimer: 0,

      achievements: {},                   // { achId: true }

      buyMode: 1,                         // 1 | 10 | 'max'
      activeTab: "cosmos",
      settings: { notation: "standard", autosave: true },

      stats: {
        timePlayed: 0,
        started: Date.now(),
        bestStarlight: 0,
        totalCollapses: 0,
      },
      lastSave: Date.now(),
    };
  }

  /* ---------------- per-frame computed cache ---------------- */
  G.cache = {
    prodMult: 1,        // global production multiplier
    costMult: 1,        // generator cost multiplier (<1 = cheaper)
    prodPow: 1,         // production exponent (Cosmic Web etc.)
    energyMult: 1,      // multiplier contributed by Stellar Energy
    energyRate: 0,      // energy/sec
    stardustRate: 0,    // observed stardust/sec
    slGain: 0,          // starlight that a collapse would give right now
    achMult: 1,
  };

  /* ---------------- helpers ---------------- */
  G.has = id => !!(G.state && G.state.upgrades[id]);
  G.autoOn = id => !!(G.state && G.state.automation[id]);
  G.autoUnlocked = id => {
    const a = G.AUTOMATIONS.find(x => x.id === id);
    return a ? a.unlock(G.state) : false;
  };
  G.COLLAPSE_REQ = COLLAPSE_REQ;

  /* ---------------- recalc multipliers (cheap; run each tick) ---------------- */
  function recalc() {
    const s = G.state;
    let m = 1;

    // Starlight tree — production
    if (G.has("prod1")) m *= 3;
    if (G.has("prod2")) m *= 5;
    if (G.has("prod3")) m *= 10;
    if (G.has("synergy")) m *= Math.pow(1.02, s.generators[5].count);

    // Achievements (product of all completed mults)
    let am = 1;
    for (const a of G.ACHIEVEMENTS) if (s.achievements[a.id] && a.mult) am *= a.mult;
    G.cache.achMult = am;
    m *= am;

    // Stellar Energy boost (Loop B feeding into Loop A)
    let em = 1;
    if (s.fusionUnlocked) {
      const strength = G.has("energy1") ? 0.9 : 0.5;
      em = 1 + Math.log10(1 + s.energy) * strength;
    }
    G.cache.energyMult = em;
    m *= em;

    G.cache.prodMult = m;

    // Production exponent
    G.cache.prodPow = G.has("prod4") ? 1.04 : 1;

    // Cost multiplier
    let cm = 1;
    if (G.has("cost1")) cm *= 0.6;
    G.cache.costMult = cm;

    // Energy generation rate (driven by player-bought generators -> the loops feed each other)
    if (s.fusionUnlocked) {
      let boughtSum = 0;
      for (const g of s.generators) boughtSum += g.bought;
      const conduit = G.has("energy1") ? 5 : 1;
      G.cache.energyRate = Math.pow(boughtSum, 1.5) * 0.15 * conduit;
    } else {
      G.cache.energyRate = 0;
    }

    // Starlight that a collapse would grant right now
    G.cache.slGain = collapseGain(s);
  }
  G.recalc = recalc;

  /* ---------------- generator economics ---------------- */
  function genCost(i, fromBought) {
    const def = G.GENERATORS[i];
    const b = fromBought != null ? fromBought : G.state.generators[i].bought;
    return def.baseCost * Math.pow(def.costGrowth, b) * G.cache.costMult;
  }
  G.genCost = genCost;

  // Total cost of buying `k` units of generator i starting from current bought count.
  function bulkCost(i, k) {
    const def = G.GENERATORS[i];
    const b = G.state.generators[i].bought;
    const r = def.costGrowth;
    const base = def.baseCost * Math.pow(r, b) * G.cache.costMult;
    return base * (Math.pow(r, k) - 1) / (r - 1);
  }

  // How many of generator i can be afforded with `money`.
  function maxAffordable(i, money) {
    const def = G.GENERATORS[i];
    const b = G.state.generators[i].bought;
    const r = def.costGrowth;
    const base = def.baseCost * Math.pow(r, b) * G.cache.costMult;
    if (money < base) return 0;
    // money >= base * (r^k - 1)/(r-1)  ->  k <= log_r( money*(r-1)/base + 1 )
    const k = Math.floor(Math.log(money * (r - 1) / base + 1) / Math.log(r));
    return Math.max(0, k);
  }
  G.maxAffordable = maxAffordable;

  function buyGenerator(i, mode) {
    const s = G.state;
    mode = mode || s.buyMode;
    let k;
    if (mode === "max") {
      k = maxAffordable(i, s.stardust);
      if (k <= 0) return false;
    } else {
      k = mode;
      if (s.stardust < bulkCost(i, k)) return false;
    }
    const cost = bulkCost(i, k);
    if (s.stardust < cost) return false;
    s.stardust -= cost;
    s.generators[i].count += k;
    s.generators[i].bought += k;
    return true;
  }
  G.buyGenerator = buyGenerator;

  /* ---------------- prestige: Collapse -> Starlight ---------------- */
  function collapseGain(s) {
    if (s.totalStardust < COLLAPSE_REQ) return 0;
    let g = Math.pow(s.totalStardust / COLLAPSE_REQ, 0.5);
    if (G.has("slgain1")) g *= 2;
    if (G.has("slgain2")) g = Math.pow(g, 1.08);
    return Math.floor(g);
  }

  function canCollapse() { return G.cache.slGain >= 1; }
  G.canCollapse = canCollapse;

  function doCollapse(silent) {
    const s = G.state;
    const gain = G.cache.slGain;
    if (gain < 1) return false;

    s.starlight += gain;
    s.totalStarlight += gain;
    s.collapses += 1;
    s.stats.totalCollapses += 1;
    if (s.starlight > s.stats.bestStarlight) s.stats.bestStarlight = s.starlight;

    // Reset Loop A. (Stellar Energy persists — it is a parallel loop.)
    s.stardust = 10;
    s.totalStardust = 10;
    s.generators = G.GENERATORS.map(() => ({ count: 0, bought: 0 }));

    // "Keep" upgrades: start with some generators after collapse.
    if (G.has("keep1")) { s.generators[0].count = 10; s.generators[0].bought = 10; }

    recalc();
    if (!silent) {
      G.toast("💫 Collapse!", "Gained " + G.fmt(gain) + " Starlight.");
      G.ui.renderTab("collapse");
      G.ui.renderTab("cosmos");
    }
    return true;
  }
  G.doCollapse = doCollapse;

  /* ---------------- the simulation tick ---------------- */
  // dt in seconds. Euler integration of the cascading generator chain.
  function tick(dt) {
    const s = G.state;
    recalc();
    const m = G.cache.prodMult;
    const pow = G.cache.prodPow;
    const flowOf = base => pow === 1 ? base : Math.pow(Math.max(base, 0), pow);

    // Stardust from tier 0 (apply exponent to the production flow).
    const baseFlow0 = flowOf(s.generators[0].count * G.GENERATORS[0].baseProd * m);
    const dStardust = baseFlow0 * dt;
    s.stardust += dStardust;
    s.totalStardust += dStardust;   // cumulative "ever produced"

    // Cascade: each higher tier produces the tier below it.
    for (let i = G.GENERATORS.length - 1; i >= 1; i--) {
      const flow = flowOf(s.generators[i].count * G.GENERATORS[i].baseProd * m);
      s.generators[i - 1].count += flow * dt;
    }

    // Stellar Energy (Loop B)
    if (s.fusionUnlocked) {
      const e = G.cache.energyRate * dt;
      s.energy += e;
      s.totalEnergy += e;
    }

    // Automation
    runAutomation(dt);

    // observed stardust rate (for display + achievement)
    G.cache.stardustRate = baseFlow0;

    // stats
    s.stats.timePlayed += dt;

    checkAchievements();
  }
  G.tick = tick;

  function runAutomation(dt) {
    const s = G.state;
    // auto-buy generators (buy max each tick when enabled & unlocked)
    for (let i = 0; i < G.GENERATORS.length; i++) {
      const id = "auto_g" + i;
      if (s.automation[id] && G.autoUnlocked(id)) {
        buyGenerator(i, "max");
      }
    }
    // auto-collapse
    if (s.automation["auto_collapse"] && G.autoUnlocked("auto_collapse")) {
      s._autoCollapseTimer += dt;
      if (s._autoCollapseTimer >= s.autoCollapseInterval) {
        s._autoCollapseTimer = 0;
        if (canCollapse()) doCollapse(true);
      }
    }
  }

  /* ---------------- achievements ---------------- */
  function checkAchievements() {
    const s = G.state;
    for (const a of G.ACHIEVEMENTS) {
      if (s.achievements[a.id]) continue;
      let ok = false;
      try { ok = a.check(s); } catch (e) { ok = false; }
      if (ok) {
        s.achievements[a.id] = true;
        if (!G._silentToast)
          G.toast("🏆 Achievement: " + a.name, a.desc + (a.unlocks ? " (Automation unlocked!)" : ""));
        if (G.ui) { G.ui.markDirty("achievements"); G.ui.markDirty("automation"); }
      }
    }
  }

  /* ---------------- persistence ---------------- */
  function save() {
    const s = G.state;
    s.lastSave = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, encode(s));
      return true;
    } catch (e) {
      console.warn("save failed", e);
      return false;
    }
  }
  G.save = save;

  function encode(obj) {
    // base64(JSON) — compact, copy-pasteable
    const json = JSON.stringify(obj);
    return btoa(unescape(encodeURIComponent(json)));
  }
  function decode(str) {
    const json = decodeURIComponent(escape(atob(str.trim())));
    return JSON.parse(json);
  }
  G.encode = encode;
  G.decode = decode;

  function migrate(s) {
    // ensure all fields exist when loading older saves / partial data
    const def = freshState();
    const merged = Object.assign({}, def, s);
    merged.settings = Object.assign({}, def.settings, s.settings || {});
    merged.stats = Object.assign({}, def.stats, s.stats || {});
    merged.upgrades = s.upgrades || {};
    merged.automation = s.automation || {};
    merged.achievements = s.achievements || {};
    if (!Array.isArray(merged.generators) || merged.generators.length !== G.GENERATORS.length) {
      merged.generators = G.GENERATORS.map((_, i) =>
        (s.generators && s.generators[i]) ? s.generators[i] : { count: 0, bought: 0 });
    }
    merged.version = SAVE_VERSION;
    return merged;
  }

  function load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { G.state = freshState(); return false; }
    try {
      G.state = migrate(decode(raw));
      applyOffline();
      return true;
    } catch (e) {
      console.error("load failed, starting fresh", e);
      G.state = freshState();
      return false;
    }
  }
  G.load = load;

  function importSave(str) {
    try {
      const parsed = migrate(decode(str));
      G.state = parsed;
      save();
      recalc();
      return true;
    } catch (e) {
      console.error("import failed", e);
      return false;
    }
  }
  G.importSave = importSave;

  function exportSave() { return encode(G.state); }
  G.exportSave = exportSave;

  function hardReset() {
    localStorage.removeItem(SAVE_KEY);
    G.state = freshState();
    recalc();
  }
  G.hardReset = hardReset;

  function applyOffline() {
    const s = G.state;
    const now = Date.now();
    let elapsed = (now - (s.lastSave || now)) / 1000;
    if (elapsed < 1) return;
    elapsed = Math.min(elapsed, OFFLINE_CAP);
    // simulate in chunks for cascade accuracy (suppress per-achievement toasts)
    const steps = Math.min(600, Math.max(1, Math.floor(elapsed)));
    const dt = elapsed / steps;
    G._silentToast = true;
    for (let i = 0; i < steps; i++) tick(dt);
    G._silentToast = false;
    G.offlineEarned = elapsed;
  }

  G.freshState = freshState;
  G.SAVE_KEY = SAVE_KEY;
})();
