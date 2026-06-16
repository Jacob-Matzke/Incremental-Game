# ✦ Stardust Ascendant

A cosmic-themed incremental game with stacked prestige and interlocking
gameplay loops, built in vanilla JS (no build step, no dependencies).

## How to play / run

**Just open `index.html` in a browser.** That's it — everything runs client-side
and progress autosaves to your browser's `localStorage` every 15 seconds.

> If your browser is strict about `file://` (rare with this setup since it uses
> classic scripts), serve the folder instead:
> `python -m http.server 8123` then visit `http://localhost:8123`.

### The loops
- **Cosmos (Loop A):** A chain of generators — Mote → Dust Cloud → Comet →
  Asteroid → Planet → Star. Each tier produces the one below it; Motes produce
  raw **Stardust**. Buy higher tiers to accelerate everything beneath them.
- **Collapse (Prestige 1):** Reset Stardust + generators for **Starlight**, spent
  on a permanent upgrade tree (production, economy, automation, and more).
- **Condense (Prestige 2):** A deeper reset — wipes Stardust, generators, Starlight
  *and the whole Starlight tree* for **Nebulae**, spent on a second permanent tree
  whose boosts persist across every Collapse (×production, Starlight-gain multipliers,
  "keep Fusion", auto-everything, offline cap, and more).
- **Fusion (Loop B):** Unlocked in the tree. Your *purchased* generators fuel
  fusion, producing **Stellar Energy**, which multiplies all Stardust production
  and **persists through Collapses** — so the two loops feed each other.
- **Achievements:** ~18 of them, each granting a permanent production bonus. A
  few unlock automations *early* if you strive for them.
- **Automation:** Auto-buyers per generator + Auto-Collapse, unlocked via the
  tree or achievements.

### Saving
Settings tab → Export/Import save strings, copy to clipboard, or download/upload
a save file.

## Architecture (built to grow)

Data-driven and modular. Adding content rarely means touching engine code.

| File | Role |
|------|------|
| `index.html` | Layout shell (resource bar, tab panels, canvas). |
| `styles.css` | Cosmic theme + all component styles. |
| `js/format.js` | Big-number formatting (standard & scientific). |
| `js/content.js` | **All game content:** generators, the Starlight tree, achievements, automations. Edit here to balance or add. |
| `js/game.js` | State, save/load/import/export, offline progress, the production tick, prestige, achievements. |
| `js/ui.js` | Rendering + interaction. Builds each tab once, refreshes numbers each frame. |
| `js/main.js` | Boot, animated starfield, main loop, autosave. |

### Extending it
- **New generator:** add an entry to `G.GENERATORS` in `content.js`.
- **New Starlight node:** add to `G.STAR_UPGRADES` (give it a `row` and optional
  `req`), then wire its effect in `recalc()` in `game.js`.
- **New achievement:** add to `G.ACHIEVEMENTS` with a `check(state)` function.
- **Next prestige layer:** layers 1 (`doCollapse`/`collapseGain`) and 2
  (`doCondense`/`condenseGain`) share the same shape, so a layer 3 currency that
  resets Nebulae and unlocks a third tree slots in the same way.

### Balance knobs (all in `js/game.js` unless noted)
- `SL_COEF` / `SL_POW` — the Starlight gain curve. Gain is
  `SL_COEF · log10(totalStardust / COLLAPSE_REQ) ^ SL_POW`. Using a **log** of
  Stardust (which itself runs away hyper-exponentially) keeps Starlight bounded —
  raise `SL_POW` to widen the gain range, lower it to flatten/de-bunch.
- `COLLAPSE_REQ` / `NEBULA_REQ` — Stardust scale for Collapse gain / Starlight
  needed per Condense. The condense exponent (0.8) lives in `condenseGain`.
- Generator `costGrowth` / `baseProd` in `js/content.js`, and the tree costs in
  `G.STAR_UPGRADES` / `G.NEBULA_UPGRADES`.
- `MAX_NUM` (1e300) — hard ceiling that clamps all resources so native-double
  overflow can't reach `Infinity` (which would cascade to `NaN` and soft-lock the
  game). This is the placeholder until `break_infinity.js` lands.

## Roadmap ideas
- Prestige layer 3 with a third upgrade tree.
- A third interlocking loop (e.g. Constellations) consuming Energy.
- `break_infinity.js` for numbers beyond 1e308.
- Challenges / modifiers, and milestone-based passive bonuses.
