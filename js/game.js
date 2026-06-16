/* =====================================================================
   game.js — state, persistence, and the simulation engine.
   ===================================================================== */
(function () {
  const SAVE_KEY = "stardust_ascendant_save";
  const SAVE_VERSION = 2;
  const OFFLINE_BASE_CAP = 8 * 3600;   // base 8 hours of offline progress
  const COLLAPSE_REQ = 1e3;       // Stardust scale for the Collapse gain formula
  const NEBULA_REQ = 1000;        // Starlight needed for a Condense to give >=1 Nebula
  // Starlight gain scales with the *logarithm* of Stardust, not a power of it.
  // Stardust runs away hyper-exponentially; a log keeps Starlight a bounded,
  // steadily-climbing currency (≈ tens→hundreds over a playthrough, never
  // trillions). gain = SL_COEF * (log10(totalStardust / COLLAPSE_REQ))^SL_POW.
  const SL_COEF = 1;
  const SL_POW = 2.5;
  // The game uses native doubles (max ~1.8e308). Clamp resources below that so
  // production can never reach Infinity — once a value is Infinity, a later
  // "Infinity - Infinity" (e.g. buying) yields NaN, which fmt() shows as "0",
  // soft-locking the game. MAX_NUM is the hard ceiling until a big-number
  // library is added.
  const MAX_NUM = 1e300;
  function clampNum(x) {
    if (isNaN(x)) return 0;       // never let NaN propagate
    if (x < 0) return 0;
    if (x > MAX_NUM) return MAX_NUM;
    return x;
  }
  G.clampNum = clampNum;

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
      upgrades: {},                       // { upgradeId: true }   (Starlight tree — reset on Condense)

      // Prestige layer 2
      nebulae: 0,
      totalNebulae: 0,
      condenses: 0,
      nebulaUpgrades: {},                 // { nebulaId: true }    (persists across Condense)

      fusionUnlocked: false,
      energy: 0,
      totalEnergy: 0,

      automation: {},                     // { autoId: true }  (enabled toggles)
      autoCollapseInterval: 60,           // seconds
      _autoCollapseTimer: 0,

      achievements: {},                   // { achId: true }

      buffs: [],                          // active Cosmic Anomaly buffs (timed)

      buyMode: 1,                         // 1 | 10 | 'max'
      activeTab: "cosmos",
      settings: { notation: "standard", autosave: true, events: true },

      stats: {
        timePlayed: 0,
        started: Date.now(),
        bestStarlight: 0,
        bestNebulae: 0,
        totalCollapses: 0,
        totalCondenses: 0,
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
    slGain: 0,          // starlight that a collapse would give right now (floored)
    slGainRaw: 0,       // unfloored version — used by Perpetual Collapse passive
    achMult: 1,
    eventMult: 1,       // product of active Cosmic Anomaly buffs
  };

  /* ---------------- helpers ---------------- */
  G.has = id => !!(G.state && G.state.upgrades[id]);                 // Starlight tree owned
  G.nh  = id => !!(G.state && G.state.nebulaUpgrades && G.state.nebulaUpgrades[id]); // Nebula tree owned
  G.autoOn = id => !!(G.state && G.state.automation[id]);
  G.autoUnlocked = id => {
    const a = G.AUTOMATIONS.find(x => x.id === id);
    return a ? a.unlock(G.state) : false;
  };
  G.COLLAPSE_REQ = COLLAPSE_REQ;
  G.NEBULA_REQ = NEBULA_REQ;

  /* ---------------- recalc multipliers (cheap; run each tick) ---------------- */
  function recalc() {
    const s = G.state;
    let m = 1;

    // Starlight tree — production (gentle stacking so Stardust climbs steadily
    // rather than slow-then-explode)
    if (G.has("prod1")) m *= 2;
    if (G.has("prod2")) m *= 3;
    if (G.has("prod3")) m *= 4;
    if (G.has("synergy")) m *= Math.pow(1.02, s.generators[5].count);

    // Nebula tree — production (persists across Condense)
    if (G.nh("n_prod1")) m *= 5;
    if (G.nh("n_prod2")) m *= 25;
    if (G.nh("n_neb"))    m *= Math.pow(1.10, s.nebulae);
    if (G.nh("n_synergy")) m *= 1 + Math.log10(1 + s.starlight);

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

    // Cosmic Anomaly buffs (timed event multipliers)
    let ev = 1;
    if (s.buffs) for (const b of s.buffs) ev *= b.mult;
    G.cache.eventMult = ev;
    m *= ev;

    G.cache.prodMult = clampNum(m);

    // Production exponent (additive bonuses combine)
    let pow = 1;
    if (G.has("prod4")) pow += 0.04;
    if (G.nh("n_prod3")) pow += 0.05;
    G.cache.prodPow = pow;

    // Cost multiplier
    let cm = 1;
    if (G.has("cost1")) cm *= 0.6;
    if (G.nh("n_cost")) cm *= 0.1;
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
    G.cache.slGainRaw = collapseGainRaw(s);
    G.cache.slGain = Math.floor(G.cache.slGainRaw);
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
    if (!isFinite(cost) || s.stardust < cost) return false;   // guard Infinity cost
    s.stardust = clampNum(s.stardust - cost);
    s.generators[i].count = clampNum(s.generators[i].count + k);
    s.generators[i].bought += k;
    return true;
  }
  G.buyGenerator = buyGenerator;

  /* ---------------- prestige 1: Collapse -> Starlight ---------------- */
  // Unfloored Starlight value of a Collapse right now (0 below the threshold).
  function collapseGainRaw(s) {
    if (s.totalStardust <= COLLAPSE_REQ) return 0;
    const logExcess = Math.log10(s.totalStardust / COLLAPSE_REQ);
    let g = SL_COEF * Math.pow(logExcess, SL_POW);
    // Gain multipliers/exponents apply on top (upgrades stay impactful).
    if (G.has("slgain1")) g *= 2;
    if (G.nh("n_sl1"))    g *= 3;
    if (G.has("slgain2")) g = Math.pow(g, 1.08);
    if (G.nh("n_sl2"))    g = Math.pow(g, 1.10);
    return g;
  }
  function collapseGain(s) { return Math.floor(collapseGainRaw(s)); }

  function canCollapse() { return G.cache.slGain >= 1; }
  G.canCollapse = canCollapse;

  function doCollapse(silent) {
    const s = G.state;
    const gain = G.cache.slGain;
    if (gain < 1) return false;

    s.starlight = clampNum(s.starlight + gain);
    s.totalStarlight = clampNum(s.totalStarlight + gain);
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
      G.toast("💫 Collapse!", "Gained " + G.fmtInt(gain) + " Starlight.");
      G.ui.renderTab("collapse");
      G.ui.renderTab("cosmos");
    }
    return true;
  }
  G.doCollapse = doCollapse;

  /* ---------------- prestige 2: Condense -> Nebulae ---------------- */
  // Exponent 0.8 (vs sqrt) so Nebulae scale up enough to reach the larger
  // Nebula-tree costs over a long playthrough, while staying bounded.
  function condenseGain(s) {
    if (s.starlight < NEBULA_REQ) return 0;
    let g = Math.pow(s.starlight / NEBULA_REQ, 0.8);
    return Math.floor(g);
  }
  G.condenseGain = condenseGain;
  function canCondense() { return condenseGain(G.state) >= 1; }
  G.canCondense = canCondense;

  function doCondense(silent) {
    const s = G.state;
    const gain = condenseGain(s);
    if (gain < 1) return false;

    s.nebulae = clampNum(s.nebulae + gain);
    s.totalNebulae = clampNum(s.totalNebulae + gain);
    s.condenses += 1;
    s.stats.totalCondenses += 1;
    if (s.nebulae > s.stats.bestNebulae) s.stats.bestNebulae = s.nebulae;

    // Condense resets ALL of layer 1: Stardust, generators, Starlight, the
    // entire Starlight tree, collapses, and (unless Eternal Flame) Fusion.
    s.stardust = 10;
    s.totalStardust = 10;
    s.generators = G.GENERATORS.map(() => ({ count: 0, bought: 0 }));
    s.starlight = 0;
    s.upgrades = {};
    s.collapses = 0;
    s._autoCollapseTimer = 0;
    if (!G.nh("n_fuse")) { s.fusionUnlocked = false; s.energy = 0; }

    // Nebula starting bonuses.
    if (G.nh("n_start")) s.starlight = 10;

    recalc();
    if (!silent) {
      G.toast("🌫 Condense!", "Gained " + G.fmtInt(gain) + " Nebulae. A new cosmos awaits.");
      G.ui.rebuildAll();
    }
    return true;
  }
  G.doCondense = doCondense;

  // Purchase a Nebula upgrade (mirrors buyUpgrade but on the persistent tree).
  G.buyNebula = function (id) {
    const s = G.state;
    const u = G.NEBULA_UPGRADES.find(x => x.id === id);
    if (!u || s.nebulaUpgrades[id]) return false;
    if (!(u.req || []).every(r => s.nebulaUpgrades[r])) return false;
    if (s.nebulae < u.cost) return false;
    s.nebulae -= u.cost;
    s.nebulaUpgrades[id] = true;
    recalc();
    return true;
  };

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
    s.stardust = clampNum(s.stardust + dStardust);
    s.totalStardust = clampNum(s.totalStardust + dStardust);   // cumulative "ever produced"

    // Cascade: each higher tier produces the tier below it.
    for (let i = G.GENERATORS.length - 1; i >= 1; i--) {
      const flow = flowOf(s.generators[i].count * G.GENERATORS[i].baseProd * m);
      s.generators[i - 1].count = clampNum(s.generators[i - 1].count + flow * dt);
    }

    // Stellar Energy (Loop B)
    if (s.fusionUnlocked) {
      const e = G.cache.energyRate * dt;
      s.energy = clampNum(s.energy + e);
      s.totalEnergy = clampNum(s.totalEnergy + e);
    }

    // Perpetual Collapse (Nebula capstone): passively accrue Starlight at the
    // rate a Collapse would grant, with no reset — retiring the layer-1 grind.
    if (G.nh("n_passive") && G.cache.slGainRaw > 0) {
      const sl = G.cache.slGainRaw * dt;
      s.starlight = clampNum(s.starlight + sl);
      s.totalStarlight = clampNum(s.totalStarlight + sl);
      if (s.starlight > s.stats.bestStarlight) s.stats.bestStarlight = s.starlight;
    }

    // Expire timed event buffs (handled in tick so offline time also drains them)
    if (s.buffs && s.buffs.length) {
      for (const b of s.buffs) b.remaining -= dt;
      s.buffs = s.buffs.filter(b => b.remaining > 0);
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
    merged.nebulaUpgrades = s.nebulaUpgrades || {};
    merged.automation = s.automation || {};
    merged.achievements = s.achievements || {};
    merged.buffs = Array.isArray(s.buffs) ? s.buffs : [];
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
    const cap = OFFLINE_BASE_CAP + (G.nh("n_offline") ? 16 * 3600 : 0);
    elapsed = Math.min(elapsed, cap);
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
