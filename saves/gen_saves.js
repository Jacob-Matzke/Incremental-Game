// One-off generator for the pacing test saves. Builds each checkpoint state
// and base64-encodes it exactly like the game's encode() (ASCII JSON), writing
// the .txt files directly so there's no manual transcription of huge strings.
// Run: node saves/gen_saves.js   (from the project root)
const fs = require("fs");
const path = require("path");

const T = 1781589211836; // fixed timestamp (stamping live time isn't needed)
function fresh() {
  return {
    version: 2, stardust: 10, totalStardust: 10,
    generators: Array.from({ length: 6 }, () => ({ count: 0, bought: 0 })),
    starlight: 0, totalStarlight: 0, collapses: 0, upgrades: {},
    nebulae: 0, totalNebulae: 0, condenses: 0, nebulaUpgrades: {},
    fusionUnlocked: false, energy: 0, totalEnergy: 0,
    automation: {}, autoCollapseInterval: 60, _autoCollapseTimer: 0,
    achievements: {}, buyMode: 1, activeTab: "cosmos",
    settings: { notation: "standard", autosave: true },
    stats: { timePlayed: 0, started: T, bestStarlight: 0, bestNebulae: 0, totalCollapses: 0, totalCondenses: 0 },
    lastSave: T,
  };
}
const enc = obj => Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
const set = (...ids) => ids.reduce((o, k) => ((o[k] = true), o), {});
const gens = arr => arr.concat(Array.from({ length: 6 - arr.length }, () => [0, 0]))
  .map(([count, bought]) => ({ count, bought }));

const saves = {};

// 01 — mid stage-1 build, just shy of the first collapse (gain still 0)
let s = fresh();
Object.assign(s, { stardust: 1072, totalStardust: 8013, generators: gens([[147, 9], [4, 4]]),
  achievements: set("a_first", "a_dust1k") });
s.stats.timePlayed = 277;
saves["01-pre-first-collapse"] = s;

// 02 — first Collapse available (~3 Starlight)
s = fresh();
Object.assign(s, { stardust: 3731, totalStardust: 40060, generators: gens([[444, 12], [6, 6]]),
  achievements: set("a_first", "a_dust1k") });
s.stats.timePlayed = 378;
saves["02-first-collapse-ready"] = s;

// 03 — just after the first Collapse
s = fresh();
Object.assign(s, { starlight: 6, totalStarlight: 10, collapses: 3, upgrades: set("prod1"),
  achievements: set("a_first", "a_dust1k", "a_collapse") });
s.stats.timePlayed = 540;
saves["03-early-layer1"] = s;

// 04 — mid layer 1: Fusion + low auto-buyers, layer 2 still hidden
s = fresh();
Object.assign(s, { starlight: 200, totalStarlight: 420, collapses: 18,
  upgrades: set("prod1", "cost1", "keep1", "prod2", "slgain1", "fusion", "prod3", "autoLow"),
  fusionUnlocked: true, energy: 8000, totalEnergy: 8000,
  generators: gens([[10, 10]]),
  automation: set("auto_g0", "auto_g1", "auto_g2"),
  achievements: set("a_first", "a_dust1k", "a_dust1m", "a_collapse", "a_collapse10", "a_sl10", "a_sl100", "a_fusion", "a_energy1k") });
s.stats.timePlayed = 1700;
saves["04-mid-layer1"] = s;

// 05 — full-ish Starlight tree, first Condense ready, Nebula tab just unlocked
s = fresh();
Object.assign(s, { starlight: 6000, totalStarlight: 15000, collapses: 40,
  upgrades: set("prod1", "cost1", "keep1", "prod2", "slgain1", "fusion", "prod3", "autoLow", "energy1", "slgain2", "autoHigh"),
  fusionUnlocked: true, energy: 5e6, totalEnergy: 5e6,
  generators: gens([[10, 10]]),
  automation: set("auto_g0", "auto_g1", "auto_g2", "auto_g3", "auto_g4", "auto_g5"),
  activeTab: "nebula",
  achievements: set("a_first", "a_dust1k", "a_dust1m", "a_collapse", "a_collapse10", "a_sl10", "a_sl100", "a_fusion", "a_energy1k", "a_energy1m", "a_hoard") });
s.stats.timePlayed = 2400;
saves["05-condense-ready"] = s;

// 06 — one Condense done, early Nebula tree
s = fresh();
Object.assign(s, { condenses: 1, nebulae: 3, totalNebulae: 3, nebulaUpgrades: set("n_prod1", "n_sl1"),
  totalStarlight: 15000, activeTab: "nebula",
  achievements: set("a_first", "a_dust1k", "a_collapse", "a_condense") });
s.stats.timePlayed = 3000;
saves["06-early-layer2"] = s;

// 07 — whole Nebula tree incl. Perpetual Collapse; auto-buyers off so passive is visible
s = fresh();
Object.assign(s, { condenses: 20, nebulae: 2e6, totalNebulae: 5e7,
  nebulaUpgrades: set("n_prod1", "n_sl1", "n_start", "n_prod2", "n_cost", "n_fuse", "n_sl2", "n_neb", "n_auto", "n_offline", "n_prod3", "n_synergy", "n_passive"),
  starlight: 50000, totalStarlight: 1e7, fusionUnlocked: true, energy: 5e6, totalEnergy: 5e6,
  stardust: 1e12, totalStardust: 1e12, activeTab: "nebula",
  achievements: set("a_first", "a_dust1k", "a_dust1m", "a_collapse", "a_collapse10", "a_sl10", "a_sl100", "a_fusion", "a_energy1k", "a_energy1m", "a_hoard", "a_marathon", "a_condense", "a_neb10", "a_condense5", "a_nebfull") });
s.stats.timePlayed = 14400;
saves["07-capstone-perpetual"] = s;

for (const [name, state] of Object.entries(saves)) {
  fs.writeFileSync(path.join(__dirname, name + ".txt"), enc(state));
  console.log("wrote", name);
}
