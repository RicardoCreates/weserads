/* Sales Dashboard. Nutzt rows, stages, chance, esc, euro … aus crm.html. Zeigt ausschließlich CRM-Daten. */
(() => {
  const root = document.querySelector("#view-sales"), $s = (q) => root.querySelector(q);
  const C = {teal:"#12a88a", amber:"#d08a1e", blue:"#4f8ff0", coral:"#e0605f", violet:"#9a7bea", grey:"#5f7a80"};
  const PACKS = [["START","Google Ads START",C.teal],["WACHSTUM","Google Ads WACHSTUM",C.amber],["PROFI","Google Ads PROFI",C.blue],["Kunden-Magnet","Kunden-Magnet",C.coral]];
  const KEY = "weserads-sales-ziel", WEEK = 6048e5;
  let goal = 0; try { goal = Math.max(0, Number(localStorage.getItem(KEY)) || 0); } catch { /* ohne Speicher kein Ziel */ }
  let days = 90, branch = "", source = "";
  root.innerHTML = `<div class="s-head"><div><h2>Sales Dashboard</h2><p id="s-sub"></p></div><div class="s-filter"><label>Zeitraum<select id="s-days"><option value="30">30 Tage</option><option value="90" selected>90 Tage</option><option value="365">12 Monate</option><option value="0">Gesamt</option></select></label><label>Branche<select id="s-branch"></select></label><label>Quelle<select id="s-source"></select></label></div></div>
    <div class="s-kpis" id="s-kpis"></div>
    <div class="s-grid"><section class="card s-4"><h3>Pipeline nach Phase <small id="s-pn"></small></h3><div id="s-pipe"></div></section><section class="card s-4"><h3>Lead-Temperatur</h3><div id="s-donut"></div></section><section class="card s-4"><h3>Kontaktweg je Temperatur <small>Anteil in %</small></h3><div id="s-mix"></div></section>
    <section class="card s-5"><h3>Leistung je Paket</h3><div class="s-scroll" id="s-table"></div></section><section class="card s-4"><h3>Monatlicher Umsatz <small>letzte 12 Monate</small></h3><div id="s-line"></div></section><section class="card s-3"><h3>Branchen und Hinweise</h3><div id="s-branches"></div><div id="s-alerts"></div></section></div>
    <div class="card s-strip" id="s-strip"></div><p class="s-note">Umsatz = eingetragener Monatswert der Kontakte mit Status „Kunde“. Der Verlauf nutzt das Datum des letzten Phasenwechsels, frühere Preise und beendete Verträge sind nicht enthalten.</p><div class="s-tip" hidden></div>`;
  const val = (r) => Math.max(0, Number(r.wert) || 0), sum = (l) => l.reduce((t, r) => t + val(r), 0), weight = (l) => l.reduce((t, r) => t + val(r) * (chance[r.status] || 0), 0);
  const clean = (r) => (r.branche || "").replace(/ \(.*$/, "").trim(), src = (r) => (r.quelle || "").trim();
  const when = (v) => { const t = new Date(v || NaN).getTime(); return Number.isFinite(t) ? t : 0; };
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0, tip = (t) => ` tabindex="0" data-tip="${esc(t)}"`;
  const inPeriod = (t) => !days || t >= Date.now() - days * 864e5;
  const group = (list, fn) => Object.entries(list.reduce((o, r) => { const k = fn(r); if (k) o[k] = (o[k] || 0) + 1; return o; }, Object.create(null))).sort((a, b) => b[1] - a[1]);
  const ring = (p, color, label) => { const n = Math.max(0, Math.min(100, p || 0)), L = 2 * Math.PI * 25; return `<svg class="s-ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="25" stroke="${color}" stroke-opacity=".2"/>${n ? `<circle cx="32" cy="32" r="25" stroke="${color}" stroke-dasharray="${n / 100 * L} ${L}" transform="rotate(-90 32 32)"/>` : ""}<text x="32" y="36">${label}</text></svg>`; };
  const spark = (v, color) => { const m = Math.max(1, ...v), p = v.map((y, i) => `${i / (v.length - 1) * 100},${34 - y / m * 28}`).join(" "); return `<svg class="s-spark" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,36 ${p} 100,36" fill="${color}" opacity=".16"/><polyline points="${p}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`; };
  const weeks = (dates) => { const v = Array(12).fill(0); dates.forEach((t) => { const i = 11 - Math.floor((Date.now() - t) / WEEK); if (t && i >= 0 && i < 12) v[i]++; }); return v; };
  const legend = (items) => `<div class="s-legend">${items.map(([n, c]) => `<span><i style="background:${c}"></i>${esc(n)}</span>`).join("")}</div>`;

  function kpis(all) {
    const deals = all.filter(isDeal), won = all.filter((r) => r.status === "Kunde"), lost = all.filter((r) => r.status === "Verloren"), mrr = sum(won);
    const fresh = all.filter((r) => when(r.createdAt) && inPeriod(when(r.createdAt))).length, acts = all.flatMap((r) => r.aktivitaeten || []).map((a) => when(a.createdAt)).filter(Boolean), closed = won.length + lost.length, noValue = deals.filter((r) => !val(r)).length;
    const cards = [
      [C.teal, "Umsatz pro Monat", euro(mrr), goal ? `Ziel ${euro(goal)}` : "Noch kein Ziel gesetzt", goal ? ring(pct(mrr, goal), C.teal, `${pct(mrr, goal)}%`) : ""],
      [C.blue, "Offene Deals", deals.length, noValue ? `${noValue} ohne Wert` : `${euro(sum(deals))} / Monat`, ring(pct(deals.length - noValue, deals.length), C.blue, `${deals.length - noValue}/${deals.length}`), "Ring: Deals mit Wert"],
      [C.violet, "Prognose", euro(weight(deals)), "gewichtet, pro Monat", ""],
      [C.amber, "Abschlussquote", closed ? `${pct(won.length, closed)} %` : "–", closed ? `${won.length} gewonnen, ${lost.length} verloren` : "Noch keine Abschlüsse", closed ? ring(pct(won.length, closed), C.amber, `${won.length}/${closed}`) : "", closed && closed < 10 ? "Wenige Fälle" : ""],
      [C.teal, "Neue Kontakte", fresh, days ? `in ${days} Tagen` : "insgesamt", spark(weeks(all.map((r) => when(r.createdAt))), C.teal), "Kurve: 12 Wochen"],
      [C.coral, "Aktivitäten", acts.filter(inPeriod).length, days ? `in ${days} Tagen` : "insgesamt", spark(weeks(acts), C.coral), "Kurve: 12 Wochen"]];
    $s("#s-kpis").innerHTML = cards.map(([c, l, v, n, g, x]) => `<div class="card s-kpi" style="--k:${c}"><span>${l}</span><div><strong>${esc(v)}</strong>${g}</div><small>${esc(n)}${x ? `<br>${esc(x)}` : ""}</small></div>`).join("");
  }
  function pipe(all) {
    const deals = all.filter(isDeal), n = stages.map((s) => deals.filter((r) => r.status === s)), m = Math.max(1, ...n.map((l) => l.length));
    $s("#s-pn").textContent = `${deals.length} Deals`;
    $s("#s-pipe").innerHTML = n.map((l, i) => `<button type="button" class="s-bar" data-go="pipeline"${tip(`${stages[i]}: ${l.length} Deals, ${euro(sum(l))}, Chance ${Math.round(chance[stages[i]] * 100)} %`)}><span>${esc(stages[i])}</span><i><b style="width:${l.length / m * 100}%"></b></i><em>${l.length}<small>${sum(l) ? euro(sum(l)) : "–"}</small></em></button>`).join("");
  }
  const TEMP = [["Heiß", C.coral], ["Warm", C.amber], ["Kalt", C.blue], ["Ohne Label", C.grey]], temp = (r) => ["Heiß", "Warm", "Kalt"].includes(r.label) ? r.label : "Ohne Label";
  function donut(all) {
    const leads = all.filter((r) => r.status === "Lead"), L = 2 * Math.PI * 60; let off = 0;
    const part = TEMP.map(([n, c]) => [n, c, leads.filter((r) => temp(r) === n).length]), many = part.filter((x) => x[2]).length > 1;
    $s("#s-donut").innerHTML = leads.length ? `<div class="s-donut"><svg viewBox="0 0 160 160" role="img" aria-label="${esc(part.map((x) => `${x[0]} ${x[2]}`).join(", "))}">${part.filter((x) => x[2]).map(([n, c, k]) => { const len = k / leads.length * L, out = `<circle cx="80" cy="80" r="60" stroke="${c}" stroke-dasharray="${Math.max(1, len - (many ? 2 : 0))} ${L}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)"${tip(`${n}: ${k} Leads, ${pct(k, leads.length)} %`)}/>`; off += len; return out; }).join("")}<text x="80" y="82" class="big">${leads.length}</text><text x="80" y="100">Leads</text></svg><div>${part.map(([n, c, k]) => `<button type="button" data-go="leads" data-label="${n}"><i style="background:${c}"></i>${n}<b>${k}</b><small>${pct(k, leads.length)} %</small></button>`).join("")}</div></div>` : `<div class="empty">Keine Leads in dieser Auswahl.</div>`;
  }
  function mix(all) {
    const leads = all.filter((r) => r.status === "Lead"), ways = [["Anruf vertretbar", C.teal, (r) => r.kontaktweg && callOk(r)], ["Erst Brief/Besuch", C.amber, (r) => r.kontaktweg && !callOk(r)], ["Ungeklärt", C.grey, (r) => !r.kontaktweg]];
    const cols = TEMP.map(([n]) => [n, leads.filter((r) => temp(r) === n)]).filter(([, l]) => l.length);
    $s("#s-mix").innerHTML = cols.length ? `<div class="s-cols">${cols.map(([n, l]) => `<div><div class="s-stack">${ways.map(([w, c, f]) => { const k = l.filter(f).length, p = pct(k, l.length); return k ? `<i style="flex:${k};background:${c}"${tip(`${n}, ${w}: ${k} von ${l.length}`)}>${p >= 14 ? `${p}%` : ""}</i>` : ""; }).join("")}</div><span>${n}</span></div>`).join("")}</div>${legend(ways)}` : `<div class="empty">Keine Leads in dieser Auswahl.</div>`;
  }
  const inPack = (r, p) => String(r.produkt || "").startsWith(p);
  function table(all) {
    const act = all.filter((r) => isDeal(r) || r.status === "Kunde"), known = (r) => PACKS.some((p) => inPack(r, p[1])), list = [...PACKS.map(([n, p, c]) => [n, c, act.filter((r) => inPack(r, p))]), ["Paket offen", C.grey, act.filter((r) => !known(r))]], total = sum(act.filter((r) => r.status === "Kunde"));
    const line = (n, c, l, cls = "") => { const k = l.filter((r) => r.status === "Kunde"), d = l.filter(isDeal); return `<tr class="${cls}"><th scope="row">${c ? `<i style="background:${c}"></i>` : ""}${n}</th><td>${k.length}</td><td>${euro(sum(k))}</td><td>${d.length}</td><td>${euro(weight(d))}</td><td>${total ? `${pct(sum(k), total)} %` : "–"}</td></tr>`; };
    $s("#s-table").innerHTML = `<table class="s-table"><thead><tr><th scope="col">Paket</th><th scope="col">Kunden</th><th scope="col">Umsatz</th><th scope="col">Deals</th><th scope="col">Prognose</th><th scope="col">Anteil</th></tr></thead><tbody>${list.map((x) => line(...x)).join("")}${line("Gesamt", "", act, "sum")}</tbody></table>`;
  }
  const nice = (v) => { if (v <= 0) return 500; const p = 10 ** Math.floor(Math.log10(v)); return [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= v); };
  function line(all) {
    const won = all.filter((r) => r.status === "Kunde"), now = new Date(), months = Array.from({length:12}, (_, i) => new Date(now.getFullYear(), now.getMonth() - 11 + i, 1));
    const v = months.map((m) => { const end = new Date(m.getFullYear(), m.getMonth() + 1, 1).getTime(); return sum(won.filter((r) => (when(r.statusSeit) || when(r.createdAt)) < end)); });
    const top = nice(Math.max(...v, goal) * 1.08), x = (i) => 50 + i * 30, y = (n) => 165 - n / top * 140, p = v.map((n, i) => `${x(i)},${y(n)}`).join(" "), name = (m) => m.toLocaleDateString("de-DE", {month:"short"}).replace(".", "");
    $s("#s-line").innerHTML = won.length ? `<svg class="s-line" viewBox="0 0 400 200" role="img" aria-label="Monatlicher Umsatz, zuletzt ${euro(v[11])}">${[0, .5, 1].map((k) => `<line class="g" x1="50" x2="380" y1="${y(top * k)}" y2="${y(top * k)}"/><text x="44" y="${y(top * k) + 4}" text-anchor="end">${euro(top * k)}</text>`).join("")}${goal ? `<line x1="50" x2="380" y1="${y(goal)}" y2="${y(goal)}" stroke="${C.amber}" stroke-width="2"/><text x="54" y="${y(goal) - 6}">Ziel ${euro(goal)}</text>` : ""}<polygon points="50,165 ${p} 380,165" fill="${C.teal}" opacity=".14"/><polyline points="${p}" fill="none" stroke="${C.teal}" stroke-width="2" stroke-linejoin="round"/>${v.map((n, i) => `<rect x="${x(i) - 15}" y="20" width="30" height="148" fill="transparent"${tip(`${name(months[i])} ${months[i].getFullYear()}: ${euro(n)}`)}/>`).join("")}<circle cx="380" cy="${y(v[11])}" r="5" fill="${C.teal}" stroke="#06161c" stroke-width="2"/><text class="end" x="390" y="${y(v[11]) - 12}" text-anchor="end">${euro(v[11])}</text>${months.map((m, i) => i % 2 ? `<text x="${x(i)}" y="188" text-anchor="middle">${name(m)}</text>` : "").join("")}</svg>` : `<div class="empty">Der Verlauf beginnt mit dem ersten Kunden.</div>`;
  }
  function side(all) {
    const list = group(all.filter((r) => r.status === "Lead"), clean).slice(0, 4), m = list[0]?.[1] || 1, deals = all.filter(isDeal), noVal = deals.filter((r) => !val(r)).length, noTask = deals.filter((r) => !nextTask(r)).length, late = all.flatMap((r) => r.aufgaben || []).filter((t) => !t.done && t.date && t.date < day()).length;
    $s("#s-branches").innerHTML = list.map(([n, k]) => `<div class="s-mini"${tip(`${n}: ${k} Leads`)}><span>${esc(n)}</span><b>${k}</b><i><em style="width:${k / m * 100}%"></em></i></div>`).join("") || `<p>Keine Branchen hinterlegt.</p>`;
    const a = [[late, "überfällige Aufgaben", "tasks", "bad"], [noVal, "Deals ohne Wert", "pipeline", ""], [noTask, "Deals ohne Aufgabe", "pipeline", ""]].filter((x) => x[0]);
    $s("#s-alerts").innerHTML = a.map(([n, t, go, c]) => `<button type="button" class="s-alert ${c}" data-go="${go}"><b>⚠ ${n}</b> ${t}</button>`).join("") || `<div class="s-alert ok">✓ Keine Hinweise</div>`;
  }
  function strip(all) {
    const won = all.filter((r) => r.status === "Kunde"), deals = all.filter(isDeal), mrr = sum(won), ads = all.filter((r) => r.status === "Lead" && /^ja/i.test(r.googleAdsStatus || "")).length, age = deals.map((r) => [r, when(r.statusSeit)]).filter((x) => x[1]).sort((a, b) => a[1] - b[1])[0];
    const best = PACKS.map(([n, p]) => [n, sum(won.filter((r) => inPack(r, p)))]).sort((a, b) => b[1] - a[1])[0];
    $s("#s-strip").innerHTML = [["Jahresumsatz, hochgerechnet", euro(mrr * 12), "Monatswert × 12"], ["Mit gewichteter Pipeline", euro((mrr + weight(deals)) * 12), "wenn die Chancen eintreffen"], ["Stärkstes Paket", best[1] ? best[0] : "–", best[1] ? `${euro(best[1])} / Monat` : "noch kein Umsatz"], ["Leads mit Google Ads", ads, "schalten bereits Anzeigen"], ["Am längsten in Phase", age ? age[0].firma : "–", age ? `${Math.floor((Date.now() - age[1]) / 864e5)} Tage, ${age[0].status}` : "kein Datum vorhanden"]].map(([l, v, n]) => `<div><span>${l}</span><strong>${esc(v)}</strong><small>${esc(n)}</small></div>`).join("") + `<form id="s-goal"><label>Ziel pro Monat (€)<input id="s-goal-in" type="number" min="0" step="50" value="${goal || ""}" placeholder="z. B. 3000"></label><button class="secondary" type="submit">Ziel speichern</button></form>`;
  }
  function options(id, list, current, first) { const el = $s(id); el.innerHTML = `<option value="">${first}</option>` + list.map((n) => `<option>${esc(n)}</option>`).join(""); el.value = list.includes(current) ? current : ""; return el.value; }
  window.renderSales = () => {
    if (root.contains(document.activeElement) && document.activeElement.id === "s-goal-in") return;
    branch = options("#s-branch", [...new Set(rows.map(clean).filter(Boolean))].sort(), branch, "Alle"); source = options("#s-source", [...new Set(rows.map(src).filter(Boolean))].sort(), source, "Alle");
    const all = rows.filter((r) => (!branch || clean(r) === branch) && (!source || src(r) === source));
    $s("#s-sub").textContent = `${all.length} von ${rows.length} Kontakten, live aus dem CRM`;
    [kpis, pipe, donut, mix, table, line, side, strip].forEach((f) => f(all));
  };
  root.addEventListener("change", (e) => { if (e.target.id === "s-days") days = Number(e.target.value); else if (e.target.id === "s-branch") branch = e.target.value; else if (e.target.id === "s-source") source = e.target.value; else return; window.renderSales(); });
  root.addEventListener("submit", (e) => { e.preventDefault(); goal = Math.max(0, Number($s("#s-goal-in").value) || 0); try { localStorage.setItem(KEY, goal); } catch { /* gilt dann nur jetzt */ } document.activeElement.blur(); window.renderSales(); });
  root.addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (!b) return; if (b.dataset.label) { $("#f-label").value = b.dataset.label === "Ohne Label" ? "" : b.dataset.label; renderLeads(); } switchView(b.dataset.go); scrollTo(0, 0); });
  const box = $s(".s-tip"), show = (t, x, y) => { box.textContent = t; box.hidden = false; box.style.left = `${Math.max(8, Math.min(innerWidth - box.offsetWidth - 8, x + 14))}px`; box.style.top = `${Math.max(8, Math.min(innerHeight - box.offsetHeight - 8, y + 14))}px`; };
  root.addEventListener("pointermove", (e) => { const t = e.target.closest("[data-tip]"); if (t) show(t.dataset.tip, e.clientX, e.clientY); else box.hidden = true; });
  root.addEventListener("pointerleave", () => { box.hidden = true; });
  root.addEventListener("focusin", (e) => { const t = e.target.closest("[data-tip]"); if (t) { const r = t.getBoundingClientRect(); show(t.dataset.tip, r.left, r.bottom); } }); root.addEventListener("focusout", () => { box.hidden = true; });
  if (rows.length) window.renderSales();
})();
