/* =====================================================================
   content.js — game content definitions (data-driven, easy to extend)
   Generators, the Starlight upgrade tree, achievements, and automations.
   Adding a new generator / node / achievement here is all it takes.
   ===================================================================== */
(function () {
  /* ---------------------------------------------------------------
     GENERATORS — the core production chain (Loop A).
     Tier 0 produces Stardust. Each higher tier produces the tier
     below it, creating hyper-exponential growth (Antimatter-Dimensions
     style). Bought with Stardust.
     --------------------------------------------------------------- */
  // Steep cost growth gates the higher tiers (limiting the polynomial degree
  // of the cascade), and sub-unity production on tiers 1+ slows the feedback
  // loop — together these keep early-game pacing a deliberate grind rather
  // than an immediate runaway.
  G.GENERATORS = [
    { id: 0, name: "Mote",       icon: "·",  baseCost: 10,    costGrowth: 1.85, baseProd: 1 },
    { id: 1, name: "Dust Cloud", icon: "∴",  baseCost: 250,   costGrowth: 2.05, baseProd: 0.55 },
    { id: 2, name: "Comet",      icon: "☄",  baseCost: 1.2e4, costGrowth: 2.30, baseProd: 0.40 },
    { id: 3, name: "Asteroid",   icon: "🜨", baseCost: 8e5,   costGrowth: 2.65, baseProd: 0.30 },
    { id: 4, name: "Planet",     icon: "🪐", baseCost: 8e8,   costGrowth: 3.05, baseProd: 0.24 },
    { id: 5, name: "Star",       icon: "★",  baseCost: 3e12,  costGrowth: 3.55, baseProd: 0.20 },
  ];

  /* ---------------------------------------------------------------
     STARLIGHT TREE — purchased with Starlight (prestige-1 currency).
     Each node has: id, name, desc, cost, row, optional req[] (ids),
     and is consumed by recalc() in game.js via G.has('id').
     Branches: production / economy / fusion / automation.
     --------------------------------------------------------------- */
  G.STAR_UPGRADES = [
    // Costs span ~1 → 5e6. Early production upgrades are deliberately cheap so
    // the engine (and thus Starlight gain) ramps quickly; the steep climb to the
    // millions lives in rows 4-5, a long-term grind aided by Nebula boosts.
    // Row 1 — entry
    { id: "prod1",  name: "Gravity Wells",   row: 1, cost: 1,      desc: "×2 to all Stardust production." },
    { id: "cost1",  name: "Cosmic Bargain",  row: 1, cost: 2,      desc: "Generators cost 40% less." },
    { id: "keep1",  name: "Stellar Memory",  row: 1, cost: 5,      desc: "Begin each Collapse with 10 Motes." },

    // Row 2
    { id: "prod2",  name: "Dark Energy",     row: 2, cost: 8,      req: ["prod1"], desc: "×3 to all Stardust production." },
    { id: "slgain1",name: "Luminous Collapse",row: 2, cost: 15,    desc: "+100% Starlight gained from Collapse." },
    { id: "fusion", name: "Ignite Fusion",   row: 2, cost: 30,     req: ["prod1"], desc: "Unlock the Fusion loop — a second resource (Stellar Energy) that boosts everything." },

    // Row 3
    { id: "prod3",  name: "Singularity",     row: 3, cost: 80,     req: ["prod2"], desc: "×4 to all Stardust production." },
    { id: "autoLow",name: "Drone Foundry",   row: 3, cost: 250,    req: ["cost1"], desc: "Unlock auto-buyers for Mote, Dust Cloud & Comet." },
    { id: "energy1",name: "Plasma Conduits", row: 3, cost: 600,    req: ["fusion"], desc: "×5 Stellar Energy generation, and its boost is stronger." },

    // Row 4
    { id: "slgain2",name: "Supernova Echo",  row: 4, cost: 4000,   req: ["slgain1"], desc: "Starlight gain is raised to the ^1.08 power." },
    { id: "autoHigh",name:"Fleet Command",   row: 4, cost: 15000,  req: ["autoLow"], desc: "Unlock auto-buyers for Asteroid, Planet & Star." },
    { id: "prod4",  name: "Cosmic Web",      row: 4, cost: 60000,  req: ["prod3"], desc: "All Stardust production is raised to the ^1.04 power." },

    // Row 5
    { id: "autoCol",name: "Recursion Engine",row: 5, cost: 200000,  req: ["autoHigh", "slgain1"], desc: "Unlock Auto-Collapse." },
    { id: "synergy",name: "Stellar Synergy", row: 5, cost: 5000000, req: ["prod4", "energy1"], desc: "Each owned Star multiplies ALL production by +2%." },
  ];

  /* ---------------------------------------------------------------
     NEBULA TREE — prestige LAYER 2. Purchased with Nebulae, gained
     by Condensing (which resets Stardust, generators, Starlight AND
     the entire Starlight tree). These boosts persist forever, making
     each new run through layer 1 dramatically faster — the "new tree
     each prestige" loop.
     --------------------------------------------------------------- */
  // Costs span ~1 → 1e6, a deep grind across many Condenses (Nebulae scale up
  // via the boosted condense formula). Reqs are always cheaper than dependents.
  G.NEBULA_UPGRADES = [
    // Row 1
    { id: "n_prod1", name: "Cosmic Lattice",   row: 1, cost: 1,       desc: "×5 to all Stardust production." },
    { id: "n_sl1",   name: "Stellar Genesis",  row: 1, cost: 3,       desc: "×3 Starlight gained from Collapse." },
    { id: "n_start", name: "Echoed Light",     row: 1, cost: 8,       desc: "Begin each Condense already holding 10 Starlight." },

    // Row 2
    { id: "n_prod2", name: "Dark Nebula",      row: 2, cost: 25,      req: ["n_prod1"], desc: "×25 to all Stardust production." },
    { id: "n_cost",  name: "Gravity Crush",    row: 2, cost: 60,      desc: "Generators cost 90% less." },
    { id: "n_fuse",  name: "Eternal Flame",    row: 2, cost: 180,     desc: "Fusion stays ignited after a Condense, and Energy is no longer reset." },

    // Row 3
    { id: "n_sl2",   name: "Supernova Bloom",  row: 3, cost: 600,     req: ["n_sl1"], desc: "Starlight gain is raised to the ^1.10 power." },
    { id: "n_neb",   name: "Nebular Resonance",row: 3, cost: 2000,    req: ["n_prod1"], desc: "Each Nebula multiplies all production ×1.10 (compounding)." },
    { id: "n_auto",  name: "Autonomic Core",   row: 3, cost: 6000,    req: ["n_fuse"], desc: "All auto-buyers and Auto-Collapse start unlocked after a Condense." },

    // Row 4
    { id: "n_offline",name:"Stasis Field",     row: 4, cost: 18000,   desc: "Offline progress cap +16 hours (24h total)." },
    { id: "n_prod3", name: "Galactic Filament",row: 4, cost: 55000,   req: ["n_prod2"], desc: "All Stardust production gains a +0.05 exponent." },
    { id: "n_synergy",name:"Luminous Web",     row: 4, cost: 700000,  req: ["n_neb", "n_sl2"], desc: "All production ×(1 + log₁₀(1 + Starlight))." },

    // Row 5 — capstone: retires the manual Collapse grind
    { id: "n_passive",name:"Perpetual Collapse",row: 5, cost: 7000000, req: ["n_synergy", "n_sl2"],
      desc: "Every second, automatically gain the Starlight a Collapse would grant right now — with NO reset. Manual Collapsing becomes optional." },
  ];

  /* ---------------------------------------------------------------
     ACHIEVEMENTS — check(state) returns bool. Most grant a small
     permanent global multiplier (mult). A few unlock automations
     EARLY (unlocks: 'autoId') — the reward for striving.
     --------------------------------------------------------------- */
  G.ACHIEVEMENTS = [
    { id: "a_first",   name: "First Light",      icon: "✨", desc: "Buy your first Mote.",                 mult: 1.05, check: s => s.generators[0].bought >= 1 },
    { id: "a_dust1k",  name: "Speck of Cosmos",  icon: "·",  desc: "Reach 1,000 total Stardust.",          mult: 1.05, check: s => s.totalStardust >= 1e3 },
    { id: "a_dust1m",  name: "Dustpan",          icon: "∴",  desc: "Reach 1,000,000 total Stardust.",      mult: 1.10, check: s => s.totalStardust >= 1e6 },
    { id: "a_comet",   name: "Tail Chaser",      icon: "☄",  desc: "Own 10 Comets.",                       mult: 1.08, check: s => s.generators[2].count >= 10 },
    { id: "a_collapse",name: "Ashes to Stars",   icon: "💫", desc: "Perform your first Collapse.",         mult: 1.10, check: s => s.collapses >= 1 },
    { id: "a_collapse10",name:"Phoenix",         icon: "🔥", desc: "Collapse 10 times.",                   mult: 1.15, check: s => s.collapses >= 10 },
    { id: "a_sl10",    name: "Constellation",    icon: "✦",  desc: "Hold 10 Starlight at once.",           mult: 1.10, check: s => s.starlight >= 10 },
    { id: "a_sl100",   name: "Galaxy Brain",     icon: "🌌", desc: "Hold 100 Starlight at once.",          mult: 1.15, check: s => s.starlight >= 100 },
    { id: "a_planet",  name: "Worldbuilder",     icon: "🪐", desc: "Own 5 Planets.",                       mult: 1.10, check: s => s.generators[4].count >= 5 },
    { id: "a_star",    name: "Star Maker",       icon: "★",  desc: "Own your first Star.",                 mult: 1.12, check: s => s.generators[5].count >= 1 },
    { id: "a_fusion",  name: "It's Alive",       icon: "⚛", desc: "Ignite the Fusion loop.",              mult: 1.10, check: s => s.fusionUnlocked },
    { id: "a_energy1k",name: "Power Surge",      icon: "⚡", desc: "Reach 1,000 Stellar Energy.",          mult: 1.12, check: s => s.totalEnergy >= 1e3 },
    { id: "a_energy1m",name: "Fusion Reactor",   icon: "☢", desc: "Reach 1,000,000 Stellar Energy.",      mult: 1.18, check: s => s.totalEnergy >= 1e6 },
    { id: "a_rate",    name: "Firehose",         icon: "🚀", desc: "Reach 1e9 Stardust per second.",       mult: 1.12, check: s => G.cache.stardustRate >= 1e9 },
    // Achievement-gated EARLY automation unlocks — reachable naturally, or rushed.
    { id: "a_grind",   name: "Idle Hands",       icon: "🤖", desc: "Own 50 of every generator. Unlocks auto-buy Mote/Dust/Comet early.",
                       unlocks: "autoLow", mult: 1.10, check: s => s.generators.every(g => g.count >= 50) },
    { id: "a_hoard",   name: "Overachiever",     icon: "👑", desc: "Hold 250 Starlight. Unlocks Auto-Collapse early.",
                       unlocks: "autoCol", mult: 1.20, check: s => s.starlight >= 250 },
    { id: "a_marathon",name: "The Long Haul",    icon: "⏳", desc: "Play for 1 hour total.",               mult: 1.10, check: s => s.stats.timePlayed >= 3600 },
    { id: "a_full",    name: "Enlightened",      icon: "🌟", desc: "Purchase every Starlight upgrade.",    mult: 1.25, check: s => G.STAR_UPGRADES.every(u => s.upgrades[u.id]) },
    // Prestige layer 2 (Nebula / Condense)
    { id: "a_condense",name: "Reborn",           icon: "🌫", desc: "Perform your first Condense.",          mult: 1.25, check: s => s.condenses >= 1 },
    { id: "a_neb10",   name: "Nebula Nursery",   icon: "🌠", desc: "Hold 10 Nebulae at once.",             mult: 1.20, check: s => s.nebulae >= 10 },
    { id: "a_condense5",name:"Cycle of Rebirth", icon: "♻", desc: "Condense 5 times.",                     mult: 1.30, check: s => s.condenses >= 5 },
    { id: "a_nebfull", name: "Transcendent",     icon: "💠", desc: "Purchase every Nebula upgrade.",       mult: 1.40, check: s => G.NEBULA_UPGRADES.every(u => s.nebulaUpgrades[u.id]) },
  ];

  /* ---------------------------------------------------------------
     AUTOMATIONS — toggleable helpers. unlock(state) decides if the
     toggle is available (via tree node OR achievement override).
     --------------------------------------------------------------- */
  G.AUTOMATIONS = [
    { id: "auto_g0", name: "Auto-Mote",       gen: 0, desc: "Automatically buy Motes.",       unlock: s => G.has("autoLow")  || G.nh("n_auto") },
    { id: "auto_g1", name: "Auto-Dust Cloud", gen: 1, desc: "Automatically buy Dust Clouds.", unlock: s => G.has("autoLow")  || G.nh("n_auto") },
    { id: "auto_g2", name: "Auto-Comet",      gen: 2, desc: "Automatically buy Comets.",      unlock: s => G.has("autoLow")  || G.nh("n_auto") },
    { id: "auto_g3", name: "Auto-Asteroid",   gen: 3, desc: "Automatically buy Asteroids.",   unlock: s => G.has("autoHigh") || G.nh("n_auto") },
    { id: "auto_g4", name: "Auto-Planet",     gen: 4, desc: "Automatically buy Planets.",     unlock: s => G.has("autoHigh") || G.nh("n_auto") },
    { id: "auto_g5", name: "Auto-Star",       gen: 5, desc: "Automatically buy Stars.",       unlock: s => G.has("autoHigh") || G.nh("n_auto") },
    { id: "auto_collapse", name: "Auto-Collapse", desc: "Automatically Collapse on an interval (configurable below).", unlock: s => G.has("autoCol") || G.nh("n_auto") },
  ];

  /* ---------------------------------------------------------------
     MILESTONES — passive rewards for simply prestiging more, by
     cumulative Collapse / Condense count. They hand out production
     and free automation "just by playing", giving a constant stream
     of near-term goals and cutting tedium (cf. AD's Eternity
     Milestones). `mult` = global production ×, `pow` adds to the
     production exponent, `autos` unlocks those auto-buyers for free.
     --------------------------------------------------------------- */
  G.MILESTONES = [
    // Collapse milestones (by total Collapses ever)
    { type: "collapse", req: 3,    name: "Getting the Hang of It", mult: 1.5, desc: "×1.5 production" },
    { type: "collapse", req: 10,   name: "Muscle Memory",          autos: ["auto_g0"], desc: "Auto-buy Mote (free)" },
    { type: "collapse", req: 25,   name: "Serial Collapser",       mult: 2, desc: "×2 production" },
    { type: "collapse", req: 50,   name: "Assembly Line",          autos: ["auto_g1", "auto_g2"], desc: "Auto-buy Dust Cloud & Comet (free)" },
    { type: "collapse", req: 100,  name: "Centurion",              mult: 3, desc: "×3 production" },
    { type: "collapse", req: 200,  name: "Hands Free",             autos: ["auto_collapse"], desc: "Auto-Collapse (free)" },
    { type: "collapse", req: 500,  name: "Relentless",             mult: 5, desc: "×5 production" },
    { type: "collapse", req: 1000, name: "Unstoppable",            pow: 0.01, desc: "+0.01 production exponent" },

    // Condense milestones (by total Condenses ever)
    { type: "condense", req: 1,    name: "Second Genesis",         mult: 2, desc: "×2 production" },
    { type: "condense", req: 3,    name: "Nebular Drones",         autos: ["auto_g0", "auto_g1", "auto_g2"], desc: "Low-tier auto-buyers (free)" },
    { type: "condense", req: 10,   name: "Full Fleet",             mult: 3, autos: ["auto_g3", "auto_g4", "auto_g5"], desc: "×3 production + high-tier auto-buyers (free)" },
    { type: "condense", req: 25,   name: "Perpetual Motion",       mult: 5, autos: ["auto_collapse"], desc: "×5 production + Auto-Collapse (free)" },
    { type: "condense", req: 50,   name: "Nebula Lord",            mult: 10, desc: "×10 production" },
    { type: "condense", req: 100,  name: "Transcendent Drift",     pow: 0.02, desc: "+0.02 production exponent" },
  ];

  /* ---------------------------------------------------------------
     TRIALS (challenges) — opt-in constrained runs. Entering resets
     your generator run (Starlight/Nebula/milestones persist) and
     applies a handicap; reach the goal total Stardust to claim a
     permanent reward. Replayability + long-term goals (cf. AD
     challenges / Synergism corruptions).
       mCost — generator-cost multiplier (>1 = harder)
       mProd — global production multiplier (<1 = harder)
       mPow  — production-exponent multiplier (<1 = harder)
       rMult — permanent production reward; rSl — permanent Starlight-gain reward
     --------------------------------------------------------------- */
  G.TRIALS = [
    { id: "frugal",  name: "Frugal Cosmos",  icon: "💸", goal: 1e8,
      desc: "Generators cost ×800 more.", mCost: 800,
      reward: "×4 all production", rMult: 4 },
    { id: "dim",     name: "Dim Light",      icon: "🌑", goal: 1e7,
      desc: "Production exponent ×0.65 — growth crawls.", mPow: 0.65,
      reward: "×3 all production", rMult: 3 },
    { id: "gravity", name: "Heavy Gravity",  icon: "🪐", goal: 1e9,
      desc: "All production ×0.02.", mProd: 0.02,
      reward: "×6 all production", rMult: 6 },
    { id: "decay",   name: "Frenetic Decay", icon: "☄", goal: 1e8,
      desc: "Generators cost ×50 more AND production ×0.3.", mCost: 50, mProd: 0.3,
      reward: "+150% Starlight gain", rSl: 2.5 },
    { id: "longdark",name: "The Long Dark",  icon: "🕳", goal: 1e11,
      desc: "Production exponent ×0.8 AND generators cost ×30 more.", mPow: 0.8, mCost: 30,
      reward: "×10 all production", rMult: 10 },
  ];
})();
