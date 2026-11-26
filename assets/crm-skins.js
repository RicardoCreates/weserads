/* CRM-Themes: Auswahl, Speicherung und Effekte (Binär-Regen im Hacker-Theme). */
(() => {
  const KEY = "weserads-skin";
  const SKINS = {
    neon: ["Neon", "#3df5c4"],
    mac: ["macOS Google-Blau", "#1a73e8"],
    synth: ["Synthwave ’84", "linear-gradient(135deg,#ff7edb,#fede5d)"],
    hacker: ["Hacker", "#3ee0ff"],
    aurora: ["Aurora", "linear-gradient(135deg,#6dffc0,#a98bff)"],
  };
  const root = document.documentElement;
  const fx = document.createElement("div"); fx.className = "cfx"; fx.setAttribute("aria-hidden", "true");
  document.body.prepend(fx);

  let rain = null;
  function rainOn() {
    rainOff();
    const cv = document.createElement("canvas"); fx.append(cv);
    const g = cv.getContext("2d"), z = 16;
    let drops = [];
    const fit = () => { const r = devicePixelRatio || 1; cv.width = innerWidth * r; cv.height = innerHeight * r; g.setTransform(r, 0, 0, r, 0, 0); drops = Array.from({ length: Math.ceil(innerWidth / z) }, () => Math.random() * -50); };
    fit(); addEventListener("resize", fit);
    const frame = () => {
      if (document.hidden) return;
      g.fillStyle = "rgba(1,8,13,.2)"; g.fillRect(0, 0, innerWidth, innerHeight);
      g.font = `${z - 3}px "JetBrains Mono", ui-monospace, monospace`;
      drops.forEach((y, i) => {
        g.fillStyle = Math.random() < .05 ? "rgba(210,252,255,.9)" : "rgba(62,224,255,.5)";
        g.fillText(Math.random() < .5 ? "0" : "1", i * z, y * z);
        drops[i] = y * z > innerHeight && Math.random() > .975 ? 0 : y + 1;
      });
    };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { for (let i = 0; i < 40; i++) frame(); rain = { cv, fit }; return; }
    rain = { cv, fit, id: setInterval(frame, 75) };
  }
  function rainOff() { if (!rain) return; clearInterval(rain.id); removeEventListener("resize", rain.fit); rain.cv.remove(); rain = null; }

  const pop = document.createElement("div"); pop.className = "skin-pop"; pop.hidden = true; pop.setAttribute("role", "menu");
  const title = document.createElement("b"); title.textContent = "Theme"; pop.append(title);
  for (const [key, [name, color]] of Object.entries(SKINS)) {
    const b = document.createElement("button"); b.type = "button"; b.dataset.skin = key; b.setAttribute("role", "menuitemradio");
    const dot = document.createElement("i"); dot.style.background = color;
    b.append(dot, document.createTextNode(name));
    b.onclick = () => { apply(key); pop.hidden = true; };
    pop.append(b);
  }
  document.body.append(pop);

  function apply(key) {
    if (!SKINS[key]) key = "neon";
    root.classList.add("skin-switch");
    root.dataset.skin = key;
    try { localStorage.setItem(KEY, key); } catch { /* nur für diese Sitzung */ }
    pop.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.skin === key ? "true" : "false"));
    if (key === "hacker") rainOn(); else rainOff();
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("skin-switch")));
    window.dispatchEvent(new CustomEvent("crm-skin", { detail: key }));
  }
  window.crmSkin = apply;

  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "skin-btn"; btn.title = "Theme wählen"; btn.setAttribute("aria-label", "Theme wählen"); btn.setAttribute("aria-haspopup", "true");
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1-.9-1.4-.9-2.4 0-1 .8-1.8 1.8-1.8H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/></svg>';
  btn.onclick = (e) => {
    e.stopPropagation();
    const r = btn.getBoundingClientRect();
    pop.hidden = !pop.hidden;
    if (!pop.hidden) {
      const h = pop.offsetHeight;
      pop.style.left = `${Math.min(innerWidth - pop.offsetWidth - 8, r.left)}px`;
      pop.style.top = `${r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8}px`;
    }
  };
  document.querySelector(".userchip")?.insertBefore(btn, document.querySelector("#logout"));
  document.addEventListener("click", (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) pop.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") pop.hidden = true; });

  let saved = "neon"; try { saved = localStorage.getItem(KEY) || "neon"; } catch { /* Standard */ }
  apply(saved);
})();
