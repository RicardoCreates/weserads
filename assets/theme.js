(() => {
  // Die öffentliche Website ist immer hell (seriöser für Unternehmenskunden).
  // Das CRM setzt sich danach per eigenem Skript auf Dunkel.
  try { window.localStorage.removeItem('weserads-theme'); } catch { /* egal */ }
  function apply() {
    document.documentElement.dataset.theme = 'light';
    document.querySelectorAll('[data-theme-style]').forEach((style) => {
      style.media = style.dataset.themeStyle === 'light' ? 'all' : 'not all';
    });
    document.querySelectorAll('meta[data-theme-color]').forEach((meta) => { meta.content = meta.dataset.themeColor; });
  }
  apply();
  document.addEventListener('DOMContentLoaded', apply);
})();
