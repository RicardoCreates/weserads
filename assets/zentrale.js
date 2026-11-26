/* Kommandozentrale. Nutzt rows, stages, chance, request, openModal, closeCustomer, switchView, esc … aus crm.html. */
(() => {
  const root = document.querySelector("#view-zentrale"), still = matchMedia("(prefers-reduced-motion: reduce)");
  const GROUPS = [["deal","Deals","#3df5c4"],["kunde","Kunden","#ffffff"],["heiss","Heiße Leads","#ff8f93"],["warm","Warme Leads","#ffcf70"],["lead","Weitere Leads","#4c9f93"],["lost","Verloren","#5a6b73"]];
  const color = Object.fromEntries(GROUPS.map(([key,,value]) => [key, value]));
  /* Farben aus dem aktiven Theme (assets/crm-skins.css) */
  const Z = {};
  const hexA = (hex, a) => { const h = hex.replace("#",""), n = parseInt(h.length === 3 ? h.replace(/./g,"$&$&") : h, 16); return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`; };
  const zA = (a) => hexA(Z.z || "#3df5c4", a);
  function readSkin() {
    const cs = getComputedStyle(document.documentElement), v = (n, d) => (cs.getPropertyValue(n).trim() || d);
    Z.z = v("--z", "#3df5c4"); Z.hi = v("--tx-hi", "#ffffff"); Z.tx2 = v("--tx-2", "#c9e9e0"); Z.dim = v("--g-dim", "#174a42"); Z.warn = v("--warn", "#ffcf70"); Z.onz = v("--on-z", "#03201a");
    if (!/^#[0-9a-f]{3,6}$/i.test(Z.z)) Z.z = "#3df5c4";
    for (const g of GROUPS) { const c = v(`--g-${g[0]}`, g[2]); g[2] = c; color[g[0]] = c; }
  }
  readSkin();
  window.addEventListener("crm-skin", () => { readSkin(); try { panels(); } catch {} });
  const group = (row) => row.status === "Kunde" ? "kunde" : row.status === "Verloren" ? "lost" : stages.includes(row.status) ? "deal" : row.label === "Heiß" ? "heiss" : row.label === "Warm" ? "warm" : "lead";
  const order = Object.fromEntries(GROUPS.map(([key], index) => [key, index]));
  root.innerHTML = `<div class="z-head"><div><h2>Kommandozentrale</h2><span class="z-live"><i></i><span id="z-live"></span></span></div><div class="actions"><button class="zb" id="z-full" type="button">Vollbild</button><button class="zb zgo" id="z-load" type="button">Daten aktualisieren</button></div></div>
    <div class="z-kpis" id="z-kpis"></div>
    <div class="z-main"><div class="z-map" id="z-map"><canvas aria-label="Alle Kontakte als Strahlenkarte. Die Kontakte stehen auch unter Leads, Pipeline und Kunden."></canvas><div class="z-filter" id="z-filter"></div><div class="z-tip" hidden></div><div class="z-tools"><button class="zb" data-zoom="1.25" type="button" aria-label="Vergrößern">+</button><button class="zb" data-zoom=".8" type="button" aria-label="Verkleinern">−</button><button class="zb" data-zoom="0" type="button">Ganz zeigen</button></div></div>
    <div class="z-side"><div class="z-panel"><h3>Assistenten</h3><div id="z-agents"></div></div><div class="z-panel"><h3>Heute dran</h3><div id="z-today"></div></div></div></div>
    <div class="z-panel" id="z-ki" hidden><h3>Alphawave <em id="z-kn"></em></h3><div class="z-row"><span class="z-live"><i id="z-ks"></i><span id="z-kt"></span></span><button class="zb" id="z-kp" type="button"></button></div><div id="z-kj"></div></div><div class="z-low"><div class="z-panel"><h3>Freigaben <em id="z-pn"></em></h3><p id="z-pi"></p><div id="z-props"></div></div><div class="z-panel"><h3>Deals je Phase</h3><div class="z-fun" id="z-fun"></div></div><div class="z-panel"><h3>Verlauf</h3><div id="z-feed"></div></div></div>`;
  const $z = (selector) => root.querySelector(selector), canvas = $z("canvas"), ctx = canvas.getContext("2d"), tip = $z(".z-tip");

  /* Assistenten: feste Regeln, kein Sprachmodell */
  const leadsOnly = () => rows.filter((row) => row.status === "Lead");
  const workday = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); while ([0,6].includes(d.getDay())) d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
  const rank = (row) => ({"Heiß":0,"Warm":1}[row.label] ?? 2);
  const AGENTS = {
    nachfass: {name:"Nachfass-Assistent", all:() => rows.filter(isDeal), hit:(row) => (nextTask(row)?.date || "9999") < day(), text:(row) => `Nachfassen: ${nextTask(row).text}`, why:(row) => `Überfällig seit ${deDate(nextTask(row).date)}`, date:() => workday(0), reschedule:true},
    waechter: {name:"Pipeline-Wächter", all:() => rows.filter(isDeal), hit:(row) => !nextTask(row), text:(row) => row.naechsterSchritt || "Nächsten Schritt vereinbaren", why:(row) => `${row.status}: keine offene Aufgabe`, date:() => workday(1)},
    scout: {name:"Lead-Scout", all:leadsOnly, hit:(row) => rank(row) < 2 && !nextTask(row), sort:(a,b) => rank(a)-rank(b), text:(row) => callOk(row) && row.kontaktweg ? "Erstanruf" : "Kontaktweg prüfen, Brief oder Besuch planen", why:(row) => [row.label, row.branche, row.kontaktweg].filter(Boolean).join(" · "), date:(i) => workday(1 + Math.floor(i/3))},
    daten: {name:"Daten-Prüfer", all:() => rows.filter((row) => isDeal(row) || row.status === "Kunde"), hit:(row) => !Number(row.wert), text:() => "Dealwert eintragen", why:(row) => `${row.status}: Wert fehlt, Prognose unvollständig`, date:() => workday(1), open:true},
    betreuung: {name:"Kunden-Betreuer", all:() => rows.filter((row) => row.status === "Kunde"), hit:(row) => !nextTask(row), text:() => "Monatsbericht und Kundengespräch", why:() => "Kunde ohne geplanten Kontakt", date:() => workday(3)}
  };
  const SKIP = "weserads-zentrale-skip";
  let skip; try { skip = JSON.parse(localStorage.getItem(SKIP)) || {}; } catch { skip = {}; }
  const skipped = (agent, row) => skip[`${agent}:${row.id}`] === day();
  let active = "", busy = false, filter = "", limit = 6;
  const hits = (key) => { const a = AGENTS[key], list = a.all().filter((row) => a.hit(row) && !skipped(key, row)); return a.sort ? list.sort(a.sort) : list; };
  const proposals = () => Object.keys(AGENTS).filter((key) => !active || key === active).flatMap((key) => hits(key).map((row, i) => ({key, row, date:AGENTS[key].date(i)})));

  async function approve(key, id, date) {
    if (busy) return; const agent = AGENTS[key];
    if (agent.open) return openModal(rows.find((row) => row.id === id));
    busy = true; panels();
    try {
      if (!await closeCustomer()) return;
      await load();
      const row = rows.find((item) => item.id === id);
      if (!row || !agent.hit(row)) return;
      const current = nextTask(row);
      const aufgaben = agent.reschedule ? row.aufgaben.map((task) => task.id === current.id ? {...task, date} : task) : [...(row.aufgaben || []), {id:crypto.randomUUID(), text:agent.text(row), date, done:false}];
      const saved = await request(`/api/crm/customers?id=${id}`, {method:"PATCH", body:JSON.stringify({aufgaben})});
      rows[rows.findIndex((item) => item.id === id)] = saved; renderAll();
    } catch (error) { alert(error.message); } finally { busy = false; panels(); }
  }

  function panels() {
    const deals = rows.filter(isDeal), won = rows.filter((row) => row.status === "Kunde"), sum = (list) => list.reduce((t, row) => t + Number(row.wert || 0), 0);
    const due = allTasks().filter((task) => task.date && task.date <= day()), list = proposals();
    $z("#z-kpis").innerHTML = [[rows.length,"Kontakte im CRM"],[deals.length,`offene Deals, ${euro(sum(deals))} / Monat`],[euro(deals.reduce((t,row) => t + Number(row.wert||0)*chance[row.status],0)),"gewichtete Prognose / Monat"],[euro(sum(won)),`${won.length} Kunden, pro Monat`],[due.length,"heute fällig oder überfällig",due.length]].map(([v,l,hot]) => `<div class="${hot ? "hot" : ""}"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("");
    $z("#z-agents").innerHTML = Object.entries(AGENTS).map(([key, a]) => { const total = a.all().length, n = hits(key).length, ok = total ? Math.round((total-n)/total*24) : 0; return `<button type="button" class="z-agent${active === key ? " on" : ""}" data-agent="${key}" aria-pressed="${active === key}"><span>${a.name}<em>${n ? `${n} ${n === 1 ? "Vorschlag" : "Vorschläge"}` : total ? "alles erledigt" : "nichts zu prüfen"}</em></span><div class="z-led" aria-hidden="true">${Array.from({length:24},(_,i) => `<i class="${!total ? "" : i < ok ? "f" : "w"}"></i>`).join("")}</div><small class="zm">${total-n} von ${total} in Ordnung</small></button>`; }).join("");
    $z("#z-today").innerHTML = due.slice(0,6).map((task) => `<div class="z-row"><div><strong>${esc(task.text)}</strong><div class="zm">${esc(task.firma)}</div></div><span class="zm">${deDate(task.date)}</span></div>`).join("") || "<p>Nichts fällig.</p>";
    $z("#z-pn").textContent = list.length || "";
    $z("#z-pi").textContent = active ? `Gefiltert: ${AGENTS[active].name}` : "Gespeichert wird erst nach deiner Freigabe.";
    $z("#z-props").innerHTML = list.slice(0,limit).map((p) => `<div class="z-prop"><div><strong>${esc(p.row.firma)}</strong> <span class="zm">${esc(AGENTS[p.key].name)}</span></div><div>${esc(AGENTS[p.key].text(p.row))}<div class="zm">${esc(AGENTS[p.key].why(p.row))}</div></div><div data-key="${p.key}" data-id="${esc(p.row.id)}" data-date="${p.date}"><button class="zb zgo" data-do="ok" type="button" ${busy ? "disabled" : ""}>${AGENTS[p.key].open ? "Kontakt öffnen" : `${AGENTS[p.key].reschedule ? "Verschieben auf" : "Aufgabe anlegen für"} ${deDate(p.date)}`}</button><button class="zb" data-do="no" type="button">Heute ausblenden</button></div></div>`).join("") + (list.length > limit ? `<button class="zb" data-more type="button">${list.length-limit} weitere zeigen</button>` : "") || "<p>Keine offenen Vorschläge.</p>";
    const per = stages.map((s) => rows.filter((row) => row.status === s).length), max = Math.max(1,...per);
    $z("#z-fun").innerHTML = stages.map((s,i) => `<button type="button"><b>${per[i]}</b><i style="height:${per[i]/max*90}px"></i><span>${esc(s)}</span></button>`).join("");
    $z("#z-feed").innerHTML = allActivities().slice(0,6).map((a) => `<div class="z-row"><div><strong>${esc(a.firma)}</strong><div class="zm">${esc(a.type)}: ${esc(a.text)}</div></div><span class="zm">${deDate(a.createdAt)}</span></div>`).join("") || "<p>Noch keine Aktivitäten.</p>";
    $z("#z-filter").innerHTML = GROUPS.map(([key,label,c]) => `<button type="button" data-f="${key}" aria-pressed="${filter === key}"><i style="background:${c}"></i>${label} ${rows.filter((row) => group(row) === key).length}</button>`).join("");
  }

  /* Strahlenkarte */
  let nodes = [], W = 0, H = 0, zoom = 1, px = 0, py = 0, hover = null, born = 0, frame = 0, drag = null;
  function build() {
    const list = [...rows].sort((a,b) => order[group(a)]-order[group(b)] || String(a.firma).localeCompare(String(b.firma)));
    nodes = list.map((row,i) => ({row, g:group(row), a:-Math.PI/2 + (i+.5)/list.length*Math.PI*2, len:.25 + .75*(isDeal(row) ? chance[row.status]+.2 : row.status === "Kunde" ? 1 : row.label === "Heiß" ? .7 : row.label === "Warm" ? .5 : .25), phase:(i*.618)%1}));
  }
  const geo = () => { const R = Math.max(60, Math.min(W,H)*.5-(W<600?54:108)); return {R, inner:R*.56, hub:R*.34}; };
  function draw(now) {
    frame = 0;
    if (root.classList.contains("hidden") || document.hidden) return;
    const box = canvas.getBoundingClientRect(), ratio = Math.min(2, devicePixelRatio || 1);
    if (box.width !== W || box.height !== H) { W = box.width; H = box.height; canvas.width = W*ratio; canvas.height = H*ratio; }
    if (!W) return;
    const moving = !still.matches, t = moving ? now/1000 : 0, intro = moving ? Math.min(1,(now-born)/1500) : 1, ease = 1-(1-intro)**3, {R,inner,hub} = geo();
    ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,W,H); ctx.translate(W/2+px,H/2+py); ctx.scale(zoom,zoom);
    const glow = ctx.createRadialGradient(0,0,0,0,0,inner*1.25); glow.addColorStop(0,zA(.3)); glow.addColorStop(1,zA(0)); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0,0,inner*1.25,0,7); ctx.fill();
    [[inner,.45],[inner*.94,.14],[hub,.28],[R,.1]].forEach(([r,o]) => { ctx.strokeStyle = `rgba(61,245,196,${o})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0,0,r*ease,0,7); ctx.stroke(); });
    if (moving) { const s = t*.5%(Math.PI*2); ctx.strokeStyle = zA(.75); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0,0,inner,s,s+.7); ctx.stroke(); ctx.beginPath(); ctx.arc(0,0,hub,-s*1.6,-s*1.6+.4); ctx.stroke(); }
    const gap = nodes.length ? Math.PI*2/nodes.length : 1, bar = Math.max(1.3,Math.min(9,gap*inner*.52)), room = gap*R*zoom;
    nodes.forEach((n) => {
      const dim = filter && filter !== n.g, on = hover === n, x = Math.cos(n.a), y = Math.sin(n.a), r0 = inner+8, end = r0+(R-r0)*n.len*ease;
      ctx.globalAlpha = dim ? .1 : 1; ctx.lineCap = "round"; ctx.lineWidth = bar;
      ctx.strokeStyle = zA(.09); ctx.beginPath(); ctx.moveTo(x*r0,y*r0); ctx.lineTo(x*R*ease,y*R*ease); ctx.stroke();
      ctx.strokeStyle = color[n.g]; if (on || n.g === "deal" || n.g === "kunde") { ctx.shadowColor = color[n.g]; ctx.shadowBlur = on ? 22 : 10; }
      ctx.beginPath(); ctx.moveTo(x*r0,y*r0); ctx.lineTo(x*end,y*end); ctx.stroke(); ctx.shadowBlur = 0;
      if (n.g === "deal" || n.g === "kunde" || on) {
        ctx.lineWidth = on ? 1.6 : .7; ctx.globalAlpha = dim ? .05 : on ? .95 : .4; ctx.beginPath(); ctx.moveTo(x*hub,y*hub); ctx.lineTo(x*r0,y*r0); ctx.stroke();
        if (moving && !dim) { const k = (t*.35+n.phase)%1, d = hub+(end-hub)*k; ctx.globalAlpha = 1-k*.6; ctx.fillStyle = Z.hi; ctx.beginPath(); ctx.arc(x*d,y*d,2.1,0,7); ctx.fill(); }
      }
      if (!dim && (on || W >= 600) && (on || n.g === "deal" || n.g === "kunde" || room > 10)) {
        ctx.globalAlpha = ease; ctx.save(); ctx.rotate(n.a); ctx.font = `${on ? 700 : 500} ${Math.max(5,Math.min(11,11/Math.sqrt(zoom)))}px Manrope,sans-serif`; ctx.fillStyle = on ? Z.hi : color[n.g]; const s = String(n.row.firma || ""), label = s.length > 17 ? s.slice(0,16)+"…" : s;
        if (x < 0) { ctx.rotate(Math.PI); ctx.textAlign = "right"; ctx.fillText(label,-R-7,3); } else { ctx.textAlign = "left"; ctx.fillText(label,R+7,3); } ctx.restore();
      }
    });
    ctx.globalAlpha = ease;
    stages.forEach((s,i) => { const a = -Math.PI/2+i/stages.length*Math.PI*2+t*.04, n = rows.filter((row) => row.status === s).length, r = 5+Math.min(9,n*1.5), x = Math.cos(a)*hub, y = Math.sin(a)*hub; ctx.fillStyle = n ? Z.z : Z.dim; ctx.shadowColor = "#3df5c4"; ctx.shadowBlur = n ? 14 : 0; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = Z.tx2; ctx.font = "600 10px Manrope,sans-serif"; ctx.textAlign = "center"; ctx.fillText(`${s.split(" /")[0]} ${n}`,x,y+r+13); });
    const core = R*.11*(1+Math.sin(t*2)*.04), cg = ctx.createRadialGradient(0,0,0,0,0,core*1.5); cg.addColorStop(0,Z.hi); cg.addColorStop(.35,Z.z); cg.addColorStop(1,zA(0)); ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0,0,core*1.5,0,7); ctx.fill();
    ctx.fillStyle = Z.onz; ctx.font = `700 ${Math.max(12,core*.6)}px Sora,sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(rows.length,0,1); ctx.textBaseline = "alphabetic"; ctx.globalAlpha = 1;
    if (moving) frame = requestAnimationFrame(draw);
  }
  const kick = () => { if (!frame) frame = requestAnimationFrame(draw); };
  function pick(event) {
    const b = canvas.getBoundingClientRect(), x = (event.clientX-b.left-W/2-px)/zoom, y = (event.clientY-b.top-H/2-py)/zoom, d = Math.hypot(x,y), {R,inner} = geo();
    if (!nodes.length || d < inner || d > R+70) return null;
    let a = Math.atan2(y,x)+Math.PI/2; if (a < 0) a += Math.PI*2;
    const n = nodes[Math.min(nodes.length-1,Math.floor(a/(Math.PI*2)*nodes.length))]; return filter && n.g !== filter ? null : n;
  }
  canvas.onpointerdown = (e) => { if (e.pointerType === "mouse") canvas.setPointerCapture(e.pointerId); drag = {x:e.clientX,y:e.clientY,px,py,moved:false}; };
  canvas.onpointermove = (e) => {
    if (drag && e.pointerType === "mouse") { const dx = e.clientX-drag.x, dy = e.clientY-drag.y; if (Math.hypot(dx,dy) > 5) drag.moved = true; if (drag.moved) { px = drag.px+dx; py = drag.py+dy; } }
    hover = drag?.moved ? null : pick(e); canvas.classList.toggle("hit",Boolean(hover)); tip.hidden = !hover;
    if (hover) { const r = hover.row, b = canvas.getBoundingClientRect(), task = nextTask(r); tip.innerHTML = `<strong>${esc(r.firma)}</strong>${esc([r.status,r.label,r.branche,r.ort].filter(Boolean).join(" · "))}<br>${task ? `${esc(task.text)}, ${deDate(task.date)}` : "Keine Aufgabe"}`; tip.style.left = `${Math.max(8,Math.min(W-270,e.clientX-b.left+16))}px`; tip.style.top = `${Math.max(8,Math.min(H-100,e.clientY-b.top+16))}px`; }
    kick();
  };
  canvas.onpointerup = (e) => { const moved = drag?.moved, n = pick(e); drag = null; if (!moved && n) openModal(n.row); };
  canvas.onpointercancel = canvas.onpointerleave = () => { drag = null; hover = null; tip.hidden = true; kick(); };
  const setZoom = (k) => { if (!k) { zoom = 1; px = py = 0; } else { const next = Math.max(.6,Math.min(6,zoom*k)); px *= next/zoom; py *= next/zoom; zoom = next; } kick(); };
  canvas.addEventListener("wheel",(e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); setZoom(e.deltaY < 0 ? 1.12 : .89); },{passive:false});

  root.addEventListener("click", async (event) => {
    const hit = (selector) => event.target.closest(selector); let b;
    if ((b = hit("[data-zoom]"))) setZoom(Number(b.dataset.zoom));
    else if ((b = hit("[data-f]"))) { filter = filter === b.dataset.f ? "" : b.dataset.f; panels(); kick(); }
    else if ((b = hit("[data-agent]"))) { active = active === b.dataset.agent ? "" : b.dataset.agent; limit = 6; panels(); }
    else if (hit("[data-more]")) { limit += 20; panels(); }
    else if (hit("#z-fun button")) switchView("pipeline");
    else if ((b = hit("[data-do]"))) { const {key,id,date} = b.parentElement.dataset; if (b.dataset.do === "ok") approve(key,id,date); else { skip = Object.fromEntries(Object.entries(skip).filter(([,d]) => d === day())); skip[`${key}:${id}`] = day(); try { localStorage.setItem(SKIP,JSON.stringify(skip)); } catch { /* gilt dann nur für diese Sitzung */ } panels(); } }
    else if (hit("#z-full")) { if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen?.().catch(() => {}); }
    else if ((b = hit("#z-load"))) { b.disabled = true; try { await load(); } catch (error) { alert(error.message); } finally { b.disabled = false; } }
  });
  /* Kontaktfenster liegt außerhalb der Vollbildfläche */
  /* Alphawave auf dem Mac: nur Admins sehen und entscheiden */
  let ki = null, kiBusy = "", drafts = {};
  const OK = {mail:"Jetzt senden", event:"Termin eintragen", task:"Aufgabe anlegen", info:"Gelesen"};
  function kiPanel() {
    $z("#z-ki").hidden = !ki; if (!ki) return;
    $z("#z-kn").textContent = ki.jobs.length || "";
    $z("#z-ks").style.cssText = ki.online && !ki.paused ? "" : `background:${Z.warn};box-shadow:none;animation:none`;
    $z("#z-kt").textContent = ki.paused ? "Von dir pausiert" : ki.online ? `Mac verbunden, ${ki.note || "bereit"}, ${ki.load} % Rechenzeit` : ki.seenAt ? `Pausiert: Mac nicht erreichbar seit ${new Date(ki.seenAt).toLocaleString("de-DE",{dateStyle:"short",timeStyle:"short"})}` : "Mac noch nicht gekoppelt";
    $z("#z-kp").textContent = ki.paused ? "Fortsetzen" : "Pausieren";
    if ($z("#z-kj").contains(document.activeElement) && /TEXTAREA|INPUT/.test(document.activeElement.tagName)) return;
    $z("#z-kj").innerHTML = ki.jobs.map((j) => { const p = j.payload, d = drafts[j.id] || {}, unsure = j.status === "unklar"; return `<div class="z-prop"><div><strong>${esc(j.title)}</strong> <span class="zm">${esc(j.agent)}</span></div>${j.reason ? `<div class="zm">${esc(j.reason)}</div>` : ""}${j.type === "mail" ? `<div class="zm">An: ${esc(p.to)}</div><input data-ed="subject" data-id="${j.id}" aria-label="Betreff" value="${esc(d.subject ?? p.subject)}" ${unsure ? "disabled" : ""}><textarea data-ed="body" data-id="${j.id}" rows="7" aria-label="Mailtext" ${unsure ? "disabled" : ""}>${esc(d.body ?? p.body)}</textarea>` : j.type === "event" ? `<div>${esc(p.title)}: ${deDate(p.date)}, ${esc(p.startTime)} bis ${esc(p.endTime)}${p.eventId ? " (Änderung)" : ""}</div>` : j.type === "task" ? `<div>${esc(p.text)}, ${deDate(p.date)}</div>` : `<div style="white-space:pre-wrap">${esc(p.body)}</div>`}${unsure ? "<div>Ergebnis unklar. Bitte im Postfach oder Kalender prüfen.</div>" : `<div><button class="zb zgo" data-ki="ok" data-id="${j.id}" type="button" ${kiBusy ? "disabled" : ""}>${OK[j.type]}</button>${j.type === "info" ? "" : `<button class="zb" data-ki="no" data-id="${j.id}" type="button" ${kiBusy ? "disabled" : ""}>Verwerfen</button>`}</div>`}</div>`; }).join("") || "<p>Keine offenen KI-Vorschläge.</p>";
  }
  async function kiLoad() { if (session?.role !== "admin" || root.classList.contains("hidden") || document.hidden) return; try { ki = await request("/api/crm/agent"); kiPanel(); } catch { /* Anzeige bleibt, nächster Versuch folgt */ } }
  async function kiSend(body) { if (kiBusy) return; kiBusy = body.id || "x"; kiPanel(); try { await request("/api/crm/agent",{method:"POST",body:JSON.stringify(body)}); delete drafts[body.id]; } catch (error) { alert(error.message); } kiBusy = ""; await kiLoad(); if (ki?.jobs) kiPanel(); }
  $z("#z-kj").addEventListener("input",(e) => { const {ed,id} = e.target.dataset; if (ed) (drafts[id] ||= {})[ed] = e.target.value; });
  $z("#z-ki").addEventListener("click", async (e) => { const b = e.target.closest("[data-ki]"); if (b) { const job = ki.jobs.find((j) => j.id === b.dataset.id); await kiSend({id:job.id,decision:b.dataset.ki,payload:{...job.payload,...drafts[job.id]}}); if (job.type === "task" && b.dataset.ki === "ok") load().catch(() => {}); } else if (e.target.closest("#z-kp")) kiSend({decision:ki.paused ? "resume" : "pause"}); });
  setInterval(kiLoad,60000);
  const modalWatch = new MutationObserver(() => { if (document.fullscreenElement === root && !document.querySelector("#modal").classList.contains("hidden")) document.exitFullscreen(); });
  modalWatch.observe(document.querySelector("#modal"),{attributes:true,attributeFilter:["class"]});
  new MutationObserver(() => { if (!root.classList.contains("hidden")) { born = performance.now(); kick(); kiLoad(); } }).observe(root,{attributes:true,attributeFilter:["class"]});
  new ResizeObserver(kick).observe(canvas); document.addEventListener("visibilitychange",() => { kick(); kiLoad(); });
  window.renderZentrale = () => { build(); hover = null; tip.hidden = true; if (!born) born = performance.now(); $z("#z-live").textContent = `${rows.length} Kontakte, Stand ${new Date().toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})} Uhr`; panels(); kick(); kiLoad(); };
  if (rows.length) window.renderZentrale();
})();
