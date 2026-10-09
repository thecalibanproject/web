(function () {
  try {
    var t = window.localStorage.getItem('caliban.theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch {
    /* storage unavailable: fall back to prefers-color-scheme */
  }
})();
