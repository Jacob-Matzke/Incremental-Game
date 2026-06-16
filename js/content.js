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
  G.GENERATORS = [
    { id: 0, name: "Mote",       icon: "·",  baseCost: 10,    costGrowth: 1.65, baseProd: 1 },
    { id: 1, name: "Dust Cloud", icon: "∴",  baseCost: 120,   costGrowth: 1.75, baseProd: 1 },
    { id: 2, name: "Comet",      icon: "☄",  baseCost: 1.5e4, costGrowth: 1.85, baseProd: 1 },
    { id: 3, name: "Asteroid",   icon: "🜨", baseCost: 2e6,   costGrowth: 1.95, baseProd: 1 },
    { id: 4, name: "Planet",     icon: "🪐", baseCost: 5e8,   costGrowth: 2.05, baseProd: 1 },
    { id: 5, name: "Star",       icon: "★",  baseCost: 2e11,  costGrowth: 2.20, baseProd: 1 },
  ];

  /* ---------------------------------------------------------------
     STARLIGHT TREE — purchased with Starlight (prestige-1 currency).
     Each node has: id, name, desc, cost, row, optional req[] (ids),
     and is consumed by recalc() in game.js via G.has('id').
     Branches: production / economy / fusion / automation.
     --------------------------------------------------------------- */
  G.STAR_UPGRADES = [
    // Row 1 — entry
    { id: "prod1",  name: "Gravity Wells",   row: 1, cost: 1,   desc: "×3 to all Stardust production." },
    { id: "cost1",  name: "Cosmic Bargain",  row: 1, cost: 2,   desc: "Generators cost 40% less." },
    { id: "keep1",  name: "Stellar Memory",  row: 1, cost: 4,   desc: "Begin each Collapse with 10 Motes." },

    // Row 2
    { id: "prod2",  name: "Dark Energy",     row: 2, cost: 8,   req: ["prod1"], desc: "×5 to all Stardust production." },
    { id: "slgain1",name: "Luminous Collapse",row: 2, cost: 6,  desc: "+100% Starlight gained from Collapse." },
    { id: "fusion", name: "Ignite Fusion",   row: 2, cost: 12,  req: ["prod1"], desc: "Unlock the Fusion loop — a second resource (Stellar Energy) that boosts everything." },

    // Row 3
    { id: "prod3",  name: "Singularity",     row: 3, cost: 30,  req: ["prod2"], desc: "×10 to all Stardust production." },
    { id: "autoLow",name: "Drone Foundry",   row: 3, cost: 20,  req: ["cost1"], desc: "Unlock auto-buyers for Mote, Dust Cloud & Comet." },
    { id: "energy1",name: "Plasma Conduits", row: 3, cost: 45,  req: ["fusion"], desc: "×5 Stellar Energy generation, and its boost is stronger." },

    // Row 4
    { id: "prod4",  name: "Cosmic Web",      row: 4, cost: 120, req: ["prod3"], desc: "All Stardust production is raised to the ^1.04 power." },
    { id: "slgain2",name: "Supernova Echo",  row: 4, cost: 90,  req: ["slgain1"], desc: "Starlight gain is raised to the ^1.08 power." },
    { id: "autoHigh",name:"Fleet Command",   row: 4, cost: 150, req: ["autoLow"], desc: "Unlock auto-buyers for Asteroid, Planet & Star." },

    // Row 5
    { id: "autoCol",name: "Recursion Engine",row: 5, cost: 400, req: ["autoHigh", "slgain1"], desc: "Unlock Auto-Collapse." },
    { id: "synergy",name: "Stellar Synergy", row: 5, cost: 600, req: ["prod4", "energy1"], desc: "Each owned Star multiplies ALL production by +2%." },
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
  ];

  /* ---------------------------------------------------------------
     AUTOMATIONS — toggleable helpers. unlock(state) decides if the
     toggle is available (via tree node OR achievement override).
     --------------------------------------------------------------- */
  G.AUTOMATIONS = [
    { id: "auto_g0", name: "Auto-Mote",       gen: 0, desc: "Automatically buy Motes.",       unlock: s => G.has("autoLow") },
    { id: "auto_g1", name: "Auto-Dust Cloud", gen: 1, desc: "Automatically buy Dust Clouds.", unlock: s => G.has("autoLow") },
    { id: "auto_g2", name: "Auto-Comet",      gen: 2, desc: "Automatically buy Comets.",      unlock: s => G.has("autoLow") },
    { id: "auto_g3", name: "Auto-Asteroid",   gen: 3, desc: "Automatically buy Asteroids.",   unlock: s => G.has("autoHigh") },
    { id: "auto_g4", name: "Auto-Planet",     gen: 4, desc: "Automatically buy Planets.",     unlock: s => G.has("autoHigh") },
    { id: "auto_g5", name: "Auto-Star",       gen: 5, desc: "Automatically buy Stars.",       unlock: s => G.has("autoHigh") },
    { id: "auto_collapse", name: "Auto-Collapse", desc: "Automatically Collapse on an interval (configurable below).", unlock: s => G.has("autoCol") },
  ];
})();
