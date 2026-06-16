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

  // Format a (possibly huge) number for display.
  // < 1e3: a few decimals. 1e3–1e6: suffix (K/M). >= 1e33 or notation pref: scientific.
  function fmt(n, decimals) {
    if (n === Infinity) return "∞";
    if (n === null || n === undefined || isNaN(n)) return "0";
    const neg = n < 0;
    n = Math.abs(n);
    let out;

    if (n < 1e-6 && n > 0) {
      out = n.toExponential(2);
    } else if (n < 1000) {
      const d = decimals != null ? decimals : (n < 10 ? (Number.isInteger(n) ? 0 : 2) : (n < 100 ? 1 : 0));
      out = n.toFixed(d);
    } else {
      const exp = Math.floor(Math.log10(n));
      const tier = Math.floor(exp / 3);
      const notation = (G.state && G.state.settings && G.state.settings.notation) || "standard";
      if (notation === "scientific" || tier >= SUFFIXES.length) {
        const mant = n / Math.pow(10, exp);
        out = mant.toFixed(2) + "e" + exp;
      } else {
        const scaled = n / Math.pow(10, tier * 3);
        out = scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0) + SUFFIXES[tier];
      }
    }
    return neg ? "-" + out : out;
  }

  // Compact whole-number format for counts (owned amounts).
  function fmtInt(n) {
    if (n < 1e6) return Math.floor(n).toLocaleString("en-US");
    return fmt(n, 2);
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
