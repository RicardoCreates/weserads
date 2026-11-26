/* Postfach kontakt@weserads.de. Nutzt request, esc, rows, session, openModal, switchView aus crm.html. */
(() => {
  const root = document.querySelector("#view-postfach"), API = "/api/crm/mail";
  const SIGNATURE = "\n\nViele Grüße\nRicardo Lemser\nWeserAds · weserads.de";
  root.innerHTML = `
    <div class="pf-head"><div><h2>Postfach</h2><span class="pf-live"><i></i><span>kontakt@weserads.de · live von IONOS</span></span></div>
      <div class="actions"><button class="pb" id="pf-reload" type="button">Aktualisieren</button><button class="pb pgo" id="pf-new" type="button">+ Neue Mail</button></div></div>
    <div class="pf-grid" id="pf-grid">
      <nav class="pf-col pf-folders" id="pf-folders" aria-label="Ordner"></nav>
      <section class="pf-col pf-listcol" aria-label="Mails">
        <div class="pf-select"><select id="pf-folder-select" aria-label="Ordner"></select></div>
        <div class="pf-search"><input id="pf-q" type="search" placeholder="Absender, Betreff oder Text suchen" aria-label="Mails durchsuchen"></div>
        <div class="pf-list" id="pf-list"><div class="pf-empty">Postfach wird geladen …</div></div>
      </section>
      <section class="pf-col pf-read" id="pf-read" aria-label="Mail lesen"><div class="pf-empty">Wähle links eine Mail aus.</div></section>
    </div>
    <div class="pf-compose" id="pf-compose" hidden><form class="pf-card" id="pf-form">
      <h3 id="pf-ctitle">Neue Mail</h3>
      <label>An<input id="pf-to" required autocomplete="off" placeholder="name@firma.de, weitere@firma.de"></label>
      <label>Cc<input id="pf-cc" autocomplete="off" placeholder="optional"></label>
      <label>Betreff<input id="pf-subject" required maxlength="300"></label>
      <label>Nachricht<textarea id="pf-text" required></textarea></label>
      <div class="row"><span class="pf-msg" id="pf-cmsg" role="status"></span><button class="pb" type="button" id="pf-cancel">Verwerfen</button><button class="pb pgo" type="submit" id="pf-send">Senden</button></div>
    </form></div>
    <div class="pf-toast" id="pf-toast" role="status" hidden><span id="pf-ttext"></span><button class="pb" id="pf-undo" type="button">Rückgängig</button></div>`;
  const $p = (s) => root.querySelector(s);
  const nav = document.querySelector("#nav");

  let folders = [], folder = "INBOX", page = 1, pages = 1, messages = [], current = null, query = "", loading = false, compose = null, undo = null, loaded = false;

  const isAdmin = () => session?.role === "admin";
  const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso), now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "Gestern";
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", ...(d.getFullYear() !== now.getFullYear() ? { year: "2-digit" } : {}) });
  };
  const fullDate = (iso) => iso ? new Date(iso).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const who = (a) => a ? (a.name || a.address) : "";
  const size = (n) => n > 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
  const roleOf = (path) => folders.find((f) => f.path === path)?.role || "";

  /* Absender mit CRM verknüpfen */
  function contactFor(address) {
    if (!address) return null;
    const mail = address.toLowerCase(), domain = mail.split("@")[1] || "";
    const free = /^(gmail|googlemail|gmx|web|t-online|yahoo|outlook|hotmail|icloud|me|aol|freenet|posteo|mail)\./i.test(domain);
    const exact = rows.find((r) => String(r.email || "").toLowerCase().split(/[,;\s]+/).includes(mail));
    if (exact) return exact;
    if (free || !domain) return null;
    return rows.find((r) => String(r.email || "").toLowerCase().endsWith("@" + domain)) || null;
  }
  const chip = (row) => !row ? "" : `<span class="pf-chip${row.status === "Lead" ? " lead" : ""}">${row.status === "Kunde" ? "KUNDE" : row.status === "Lead" ? "LEAD" : "DEAL"}</span>`;

  function flash(text, undoFn) {
    $p("#pf-ttext").textContent = text; undo = undoFn || null;
    $p("#pf-undo").hidden = !undoFn; $p("#pf-toast").hidden = false;
    clearTimeout(flash.t); flash.t = setTimeout(() => { $p("#pf-toast").hidden = true; undo = null; }, 6000);
  }
  $p("#pf-undo").onclick = async () => { const fn = undo; $p("#pf-toast").hidden = true; undo = null; if (fn) await fn(); };

  /* Ordner */
  function renderFolders() {
    $p("#pf-folders").innerHTML = folders.map((f) => `<button class="pf-folder${f.path === folder ? " on" : ""}" data-path="${esc(f.path)}" type="button"><span>${esc(f.name)}</span><em>${f.unseen && f.role !== "sent" && f.role !== "trash" ? f.unseen : ""}</em></button>`).join("");
    $p("#pf-folder-select").innerHTML = folders.map((f) => `<option value="${esc(f.path)}"${f.path === folder ? " selected" : ""}>${esc(f.name)}${f.unseen && f.role === "inbox" ? ` (${f.unseen})` : ""}</option>`).join("");
    badge(folders.find((f) => f.role === "inbox")?.unseen || 0);
  }
  $p("#pf-folders").onclick = (e) => { const b = e.target.closest("[data-path]"); if (b) openFolder(b.dataset.path); };
  $p("#pf-folder-select").onchange = (e) => openFolder(e.target.value);

  function badge(n) {
    const em = nav?.querySelector('em[data-count="postfach"]');
    if (em) em.textContent = n ? String(n) : "";
  }

  async function loadFolders() {
    folders = await request(`${API}?action=folders`);
    if (!folders.some((f) => f.path === folder)) folder = folders.find((f) => f.role === "inbox")?.path || "INBOX";
    renderFolders();
  }

  /* Liste */
  function renderList() {
    const list = $p("#pf-list");
    if (!messages.length) { list.innerHTML = `<div class="pf-empty">${query ? "Keine Mail passt zur Suche." : "Dieser Ordner ist leer."}</div>`; return; }
    const sent = roleOf(folder) === "sent" || roleOf(folder) === "drafts";
    list.innerHTML = messages.map((m) => {
      const person = sent ? m.to?.[0] : m.from, row = contactFor(person?.address);
      return `<button class="pf-item${m.seen ? "" : " unread"}${current?.uid === m.uid ? " on" : ""}" data-uid="${m.uid}" type="button">
        <i class="dot" aria-hidden="true"></i><b>${sent ? "An: " : ""}${esc(who(person) || "Unbekannt")}</b><time>${esc(fmtDate(m.date))}</time>
        <span class="sub">${chip(row)}<span>${esc(m.subject)}</span>${m.attachments ? `<span aria-label="${m.attachments} Anhänge" title="${m.attachments} Anhänge">📎</span>` : ""}${m.answered ? `<span title="Beantwortet">↩</span>` : ""}</span></button>`;
    }).join("") + (page < pages ? `<button class="pb pf-more" id="pf-more" type="button">Ältere Mails laden</button>` : "");
    $p("#pf-more")?.addEventListener("click", () => loadList(page + 1));
  }
  $p("#pf-list").onclick = (e) => { const b = e.target.closest("[data-uid]"); if (b) openMessage(Number(b.dataset.uid)); };

  async function loadList(nextPage = 1) {
    if (loading) return; loading = true;
    if (nextPage === 1) $p("#pf-list").innerHTML = `<div class="pf-empty">Lädt …</div>`;
    try {
      const data = await request(`${API}?action=list&folder=${encodeURIComponent(folder)}&page=${nextPage}${query ? `&q=${encodeURIComponent(query)}` : ""}`);
      page = data.page; pages = data.pages;
      messages = nextPage === 1 ? data.messages : messages.concat(data.messages);
      renderList();
    } catch (error) { $p("#pf-list").innerHTML = `<div class="pf-empty">${esc(error.message)}</div>`; }
    loading = false;
  }

  async function openFolder(path) {
    folder = path; current = null; query = ""; $p("#pf-q").value = "";
    $p("#pf-grid").classList.remove("reading");
    $p("#pf-read").innerHTML = `<div class="pf-empty">Wähle links eine Mail aus.</div>`;
    renderFolders(); await loadList(1);
  }

  let searchTimer;
  $p("#pf-q").oninput = (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { query = e.target.value.trim(); loadList(1); }, 450); };

  /* Lesen */
  function frameDoc(html, images) {
    const csp = `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data: cid:${images ? " https: http:" : ""}`;
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{margin:0;padding:16px;font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#1d2b2e;background:#fff;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${html}</body></html>`;
  }

  function renderMessage(msg, images = false) {
    const sentFolder = ["sent", "drafts"].includes(roleOf(folder));
    const person = sentFolder ? msg.to?.[0] : (msg.replyTo || msg.from);
    const row = contactFor(person?.address);
    const inTrash = roleOf(folder) === "trash", inJunk = roleOf(folder) === "junk";
    const hasRemote = /<img[^>]+src=["']?https?:/i.test(msg.html || "") || /url\(\s*['"]?https?:/i.test(msg.html || "");
    const others = [...(msg.to || []), ...(msg.cc || [])].filter((a) => a.address && a.address !== "kontakt@weserads.de");
    $p("#pf-read").innerHTML = `
      <div class="pf-meta">
        <div class="pf-tools"><button class="pb pf-back" id="pf-back" type="button">← Zurück</button></div>
        <h3>${esc(msg.subject)}</h3>
        <div class="pf-from"><span><strong>${esc(who(msg.from))}</strong> &lt;${esc(msg.from?.address || "")}&gt;</span><span>${esc(fullDate(msg.date))}</span></div>
        <div class="pf-from"><span>An: ${esc((msg.to || []).map(who).join(", ") || "–")}${msg.cc?.length ? ` · Cc: ${esc(msg.cc.map(who).join(", "))}` : ""}</span></div>
        <div class="pf-tools">
          <button class="pb pgo" data-act="reply" type="button">Antworten</button>
          ${others.length > 1 ? `<button class="pb" data-act="replyall" type="button">Allen antworten</button>` : ""}
          <button class="pb" data-act="forward" type="button">Weiterleiten</button>
          <button class="pb" data-act="unread" type="button">Als ungelesen</button>
          ${inTrash || inJunk ? `<button class="pb" data-act="restore" type="button">In den Posteingang</button>` : `<button class="pb pdanger" data-act="trash" type="button">Papierkorb</button>`}
          <span class="pf-crm">${row ? `${chip(row)} <button class="pb" data-act="contact" type="button">${esc(row.firma || "Kontakt")} öffnen</button>` : person?.address && !sentFolder ? `<button class="pb" data-act="lead" type="button">Als Lead anlegen</button>` : ""}</span>
        </div>
      </div>
      ${msg.attachments?.length ? `<div class="pf-files" style="padding-top:12px">${msg.attachments.map((a) => `<a href="${API}?action=attachment&folder=${encodeURIComponent(folder)}&uid=${msg.uid}&index=${a.index}" download="${esc(a.filename)}">📎 <span>${esc(a.filename)}</span> <small>${size(a.size)}</small></a>`).join("")}</div>` : ""}
      <div class="pf-body">${msg.html
        ? `<div class="pf-html">${hasRemote && !images ? `<div class="pf-imgnote"><span>Bilder aus dem Internet sind blockiert, damit der Absender nicht mitliest.</span><button class="pb" data-act="images" type="button">Bilder laden</button></div>` : ""}<iframe class="pf-frame" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" title="Inhalt der Mail"></iframe></div>`
        : `<pre class="pf-text"></pre>`}</div>`;
    if (msg.html) $p(".pf-frame").srcdoc = frameDoc(msg.html, images);
    else $p(".pf-text").textContent = msg.text || "(kein Text)";
    $p("#pf-back").onclick = () => $p("#pf-grid").classList.remove("reading");
    $p("#pf-read").querySelectorAll("[data-act]").forEach((b) => b.onclick = () => act(b.dataset.act, row, person));
  }

  async function openMessage(uid) {
    $p("#pf-grid").classList.add("reading");
    $p("#pf-read").innerHTML = `<div class="pf-empty">Mail wird geöffnet …</div>`;
    try {
      const msg = await request(`${API}?action=message&folder=${encodeURIComponent(folder)}&uid=${uid}`);
      current = msg;
      const item = messages.find((m) => m.uid === uid);
      if (item && !item.seen) {
        item.seen = true;
        const f = folders.find((x) => x.path === folder); if (f && f.unseen) f.unseen--;
        renderFolders();
      }
      renderList(); renderMessage(msg);
    } catch (error) { $p("#pf-read").innerHTML = `<div class="pf-empty">${esc(error.message)}</div>`; }
  }

  async function move(to, msg = current, from = folder) {
    await request(API, { method: "POST", body: JSON.stringify({ action: "move", folder: from, uid: msg.uid, to }) });
  }

  async function act(action, row, person) {
    const msg = current; if (!msg) return;
    if (action === "images") return renderMessage(msg, true);
    if (action === "reply" || action === "replyall") return openCompose(action, msg);
    if (action === "forward") return openCompose("forward", msg);
    if (action === "contact") { switchView(row.status === "Kunde" ? "customers" : row.status === "Lead" ? "leads" : "pipeline"); return openModal(row); }
    if (action === "lead") return createLead(person);
    try {
      if (action === "unread") {
        await request(API, { method: "POST", body: JSON.stringify({ action: "seen", folder, uid: msg.uid, seen: false }) });
        const item = messages.find((m) => m.uid === msg.uid); if (item) item.seen = false;
        const f = folders.find((x) => x.path === folder); if (f) f.unseen++;
        current = null; renderFolders(); renderList();
        $p("#pf-grid").classList.remove("reading");
        $p("#pf-read").innerHTML = `<div class="pf-empty">Als ungelesen markiert.</div>`;
        return;
      }
      if (action === "trash" || action === "restore") {
        await move(action === "trash" ? "trash" : "inbox");
        messages = messages.filter((m) => m.uid !== msg.uid); current = null;
        renderList(); $p("#pf-grid").classList.remove("reading");
        $p("#pf-read").innerHTML = `<div class="pf-empty">${action === "trash" ? "In den Papierkorb verschoben." : "Zurück im Posteingang."}</div>`;
        flash(action === "trash" ? "In den Papierkorb verschoben." : "Zurück im Posteingang.", action === "trash" ? async () => {
          // Rückgängig: die Mail liegt jetzt im Papierkorb unter neuer UID – dort nach Betreff suchen
          const trash = folders.find((f) => f.role === "trash")?.path; if (!trash) return;
          const found = await request(`${API}?action=list&folder=${encodeURIComponent(trash)}&page=1`);
          const back = found.messages.find((m) => m.subject === msg.subject && m.from?.address === msg.from?.address);
          if (back) { await move("inbox", back, trash); await loadList(1); flash("Wiederhergestellt."); }
        } : null);
        loadFolders().catch(() => {});
      }
    } catch (error) { flash(error.message); }
  }

  async function createLead(person) {
    const domain = (person.address.split("@")[1] || "").replace(/^www\./, "");
    const firma = domain && !/^(gmail|googlemail|gmx|web|t-online|yahoo|outlook|hotmail|icloud|me|aol|freenet|posteo|mail)\./i.test(domain)
      ? domain.split(".").slice(0, -1).join(".").replace(/(^|[-.])(\w)/g, (_, s, c) => s + c.toUpperCase()) : "";
    switchView("leads");
    if (await openModal(null, "Lead") === false) return;
    const set = (name, value) => { const input = document.querySelector(`[name="${name}"]`); if (input && value && !input.value) input.value = value; };
    set("email", person.address); set("kontakt", person.name); set("firma", firma); set("quelle", "Mail an kontakt@weserads.de");
  }

  /* Schreiben */
  function quote(msg) {
    const head = `Am ${fullDate(msg.date)} schrieb ${who(msg.from)} <${msg.from?.address || ""}>:`;
    return `${SIGNATURE}\n\n${head}\n` + String(msg.text || "").split("\n").map((l) => "> " + l).join("\n");
  }
  function openCompose(mode = "new", msg = null) {
    const reSubj = (s) => /^(re|aw):/i.test(s) ? s : `Re: ${s}`;
    const fwSubj = (s) => /^(wg|fw|fwd):/i.test(s) ? s : `WG: ${s}`;
    compose = { mode, msg };
    let to = "", cc = "", subject = "", text = SIGNATURE;
    if (msg && (mode === "reply" || mode === "replyall")) {
      const target = msg.replyTo || msg.from;
      to = target?.address || "";
      if (mode === "replyall") cc = [...(msg.to || []), ...(msg.cc || [])].map((a) => a.address).filter((a) => a && a !== "kontakt@weserads.de" && a !== to).join(", ");
      subject = reSubj(msg.subject); text = quote(msg);
    }
    if (msg && mode === "forward") {
      subject = fwSubj(msg.subject);
      text = `${SIGNATURE}\n\n---------- Weitergeleitete Nachricht ----------\nVon: ${who(msg.from)} <${msg.from?.address || ""}>\nDatum: ${fullDate(msg.date)}\nBetreff: ${msg.subject}\nAn: ${(msg.to || []).map((a) => a.address).join(", ")}\n\n${msg.text || ""}${msg.attachments?.length ? `\n\n(Anhänge der Originalmail: ${msg.attachments.map((a) => a.filename).join(", ")} – bitte bei Bedarf separat senden)` : ""}`;
    }
    $p("#pf-ctitle").textContent = mode === "forward" ? "Weiterleiten" : mode.startsWith("reply") ? "Antworten" : "Neue Mail";
    $p("#pf-to").value = to; $p("#pf-cc").value = cc; $p("#pf-subject").value = subject; $p("#pf-text").value = text;
    $p("#pf-cmsg").textContent = ""; $p("#pf-cmsg").className = "pf-msg"; $p("#pf-send").disabled = false;
    $p("#pf-compose").hidden = false;
    (to ? $p("#pf-text") : $p("#pf-to")).focus();
    if (to) { $p("#pf-text").setSelectionRange(0, 0); $p("#pf-text").scrollTop = 0; }
  }
  $p("#pf-new").onclick = () => openCompose("new");
  $p("#pf-cancel").onclick = () => { $p("#pf-compose").hidden = true; compose = null; };
  $p("#pf-compose").addEventListener("keydown", (e) => { if (e.key === "Escape") $p("#pf-cancel").click(); });
  $p("#pf-form").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $p("#pf-send"), msgEl = $p("#pf-cmsg");
    btn.disabled = true; msgEl.className = "pf-msg"; msgEl.textContent = "Wird gesendet …";
    const reply = compose?.msg && compose.mode.startsWith("reply") ? compose.msg : null;
    try {
      await request(API, { method: "POST", body: JSON.stringify({
        action: "send", to: $p("#pf-to").value, cc: $p("#pf-cc").value, subject: $p("#pf-subject").value, text: $p("#pf-text").value,
        ...(reply ? { inReplyTo: reply.messageId, references: reply.references, replyFolder: folder, replyUid: reply.uid } : {})
      }) });
      $p("#pf-compose").hidden = true;
      if (reply) { const item = messages.find((m) => m.uid === reply.uid); if (item) { item.answered = true; renderList(); } }
      flash(`Gesendet an ${$p("#pf-to").value}.`);
      compose = null;
      if (["sent"].includes(roleOf(folder))) loadList(1);
    } catch (error) { msgEl.className = "pf-msg err"; msgEl.textContent = error.message; btn.disabled = false; }
  };

  /* Laden & ungelesen-Zähler */
  async function refresh() {
    try { await loadFolders(); await loadList(1); loaded = true; }
    catch (error) { $p("#pf-list").innerHTML = `<div class="pf-empty">${esc(error.message)}</div>`; }
  }
  $p("#pf-reload").onclick = refresh;

  async function poll() {
    if (!isAdmin() || document.hidden) return;
    try { const { unseen } = await request(`${API}?action=unread`); badge(unseen);
      if (loaded && !root.classList.contains("hidden") && !current && !query && roleOf(folder) === "inbox") {
        const inbox = folders.find((f) => f.role === "inbox");
        if (inbox && inbox.unseen !== unseen) { inbox.unseen = unseen; renderFolders(); loadList(1); }
      }
    } catch { /* nächster Versuch folgt */ }
  }

  new MutationObserver(() => { if (!root.classList.contains("hidden") && isAdmin() && !loaded) refresh(); }).observe(root, { attributes: true, attributeFilter: ["class"] });
  // Menüpunkt nur für den Admin
  const showNav = () => { const b = nav?.querySelector('[data-view="postfach"]'); if (b) b.classList.toggle("hidden", !isAdmin()); if (isAdmin()) poll(); };
  const wait = setInterval(() => { if (session) { clearInterval(wait); showNav(); } }, 500);
  setInterval(poll, 60000);
  document.addEventListener("visibilitychange", poll);
})();
