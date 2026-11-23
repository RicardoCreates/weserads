(() => {
  // Ohne eigene Auswahl gilt die Systemeinstellung. Steht im <head> nach den Styles, damit nichts aufblitzt.
  const key = 'weserads-theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const systemTheme = () => (system.matches ? 'dark' : 'light');
  const read = () => {
    try {
      const value = window.localStorage.getItem(key);
      return value === 'dark' || value === 'light' ? value : null;
    } catch { return null; }
  };
  let choice = read();

  function apply() {
    const theme = choice || systemTheme();
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-theme-style]').forEach((style) => {
      style.media = style.dataset.themeStyle === theme ? 'all' : 'not all';
    });
    document.querySelectorAll('meta[data-theme-color]').forEach((meta) => {
      meta.content = theme === 'dark' ? '#081421' : meta.dataset.themeColor;
    });
    document.querySelectorAll('.theme-toggle').forEach((button) => {
      button.hidden = false;
      button.setAttribute('aria-label', theme === 'dark' ? 'Helle Ansicht einschalten' : 'Dunkle Ansicht einschalten');
      button.title = button.getAttribute('aria-label');
    });
  }

  function toggle() {
    const next = (choice || systemTheme()) === 'dark' ? 'light' : 'dark';
    // Entspricht die Auswahl dem System, folgt die Seite wieder automatisch dem System.
    choice = next === systemTheme() ? null : next;
    try {
      if (choice) window.localStorage.setItem(key, choice);
      else window.localStorage.removeItem(key);
    } catch { /* Auswahl gilt dann nur für diese Seite. */ }
    apply();
  }

  apply();
  system.addEventListener('change', apply);
  window.addEventListener('storage', (event) => {
    if (event.key === key) { choice = read(); apply(); }
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelectorAll('.theme-toggle').forEach((button) => button.addEventListener('click', toggle));
  });
})();
