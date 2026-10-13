(function () {
  try {
    var t = window.localStorage.getItem('caliban.theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    // The manual "reduce motion" switch, for sessions (VDI) that hide the OS setting.
    if (window.localStorage.getItem('caliban.motion') === 'reduce') {
      document.documentElement.setAttribute('data-motion', 'reduce');
    }
  } catch {
    /* storage unavailable: fall back to prefers-color-scheme */
  }
})();
