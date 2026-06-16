/* =====================================================================
   format.js — number formatting & small math helpers
   Attaches helpers to the global G namespace shared by all scripts.
   ===================================================================== */
window.G = window.G || {};

(function () {
  const SUFFIXES = [
    "", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No",
    "Dc", "UDc", "DDc", "TDc", "QaDc", "QiDc", "SxDc", "SpDc", "OcDc", "NoDc",
    "Vg", "UVg", "DVg", "TVg", "QaVg", "QiVg", "SxVg", "SpVg", "OcVg", "NoVg", "Tg"
  ];

  // Round x to `dec` decimal places in the given direction.
  // 'floor' for owned amounts (never over-report), 'ceil' for costs
  // (never under-report) — keeps the displayed number consistent with the
  // exact affordability check, so a cost never *looks* affordable before it is.
  function roundTo(x, dec, mode) {
    if (mode === "floor") { const f = Math.pow(10, dec); return Math.floor(x * f) / f; }
    if (mode === "ceil")  { const f = Math.pow(10, dec); return Math.ceil(x * f) / f; }
    return x; // 'round' — let toFixed handle it
  }

  // Format a (possibly huge) number for display.
  // < 1e3: a few decimals. 1e3+: suffix (K/M). notation pref or huge: scientific.
  // mode: 'round' (default) | 'floor' | 'ceil'
  function fmt(n, mode) {
    if (n === Infinity) return "∞";
    if (n === null || n === undefined || isNaN(n)) return "0";
    const neg = n < 0;
    n = Math.abs(n);
    let out;

    if (n < 1e-6 && n > 0) {
      out = n.toExponential(2);
    } else if (n < 1000) {
      const d = n < 10 ? (Number.isInteger(n) ? 0 : 2) : (n < 100 ? 1 : 0);
      out = roundTo(n, d, mode).toFixed(d);
    } else {
      const exp = Math.floor(Math.log10(n));
      const tier = Math.floor(exp / 3);
      const notation = (G.state && G.state.settings && G.state.settings.notation) || "standard";
      if (notation === "scientific" || tier >= SUFFIXES.length) {
        const mant = n / Math.pow(10, exp);
        out = roundTo(mant, 2, mode).toFixed(2) + "e" + exp;
      } else {
        const scaled = n / Math.pow(10, tier * 3);
        const d = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
        out = roundTo(scaled, d, mode).toFixed(d) + SUFFIXES[tier];
      }
    }
    return neg ? "-" + out : out;
  }

  // Compact whole-number format for counts (owned amounts).
  function fmtInt(n) {
    if (n < 1e6) return Math.floor(n).toLocaleString("en-US");
    return fmt(n, "floor");
  }

  // Format a per-second rate.
  function fmtRate(n) {
    return fmt(n) + "/s";
  }

  // Format seconds into a human duration.
  function fmtTime(s) {
    s = Math.floor(s);
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60);
    if (m < 60) return m + "m " + (s % 60) + "s";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "h " + (m % 60) + "m";
    const d = Math.floor(h / 24);
    return d + "d " + (h % 24) + "h";
  }

  G.fmt = fmt;
  G.fmtInt = fmtInt;
  G.fmtRate = fmtRate;
  G.fmtTime = fmtTime;
})();
