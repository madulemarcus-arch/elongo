(() => {
  'use strict';
  // ---------- Helpers ----------
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const B = window.Backend;
  const pad = n => String(n).padStart(2, '0');
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const parse = iso => new Date(iso + 'T00:00:00Z');
  const toISO = d => d.toISOString().slice(0, 10);
  const dayDiff = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
  const fmtDate = iso => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parse(iso));
  const fmtShort = iso => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parse(iso));
  const fmtTime = ts => new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtSize = b => b < 1e3 ? b + ' o' : b < 1e6 ? Math.round(b / 1e3) + ' Ko' : (b / 1e6).toFixed(1).replace('.', ',') + ' Mo';
  const num = n => new Intl.NumberFormat('fr-FR').format(n);
  const money = n => num(n) + ' ' + esc(S.cfg ? S.cfg.currency : '');
  // A round lasts interval_days days: from start_date + round × days to that date + days (5 days from the 10th: 10th to 15th).
  // The next round starts on the day this one ends.
  // The end of the round is its deadline: contributions are due and the pot is handed over by then.
  const plusDays = (iso, n) => { const d = parse(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); };
  const roundStart = (c, r) => plusDays(c.start_date, r * c.interval_days);
  const roundEnd = (c, r) => plusDays(c.start_date, (r + 1) * c.interval_days);
  const roundDate = roundEnd;
  const memberLink = m => `<button type="button" class="name-link" data-act="member" data-id="${esc(m.id)}">${esc(m.name)}</button>`;
  function tourPreview(start, days, n) {
    days = Math.round(Number(days));
    if (!start || !(days >= 1)) return "Indiquez le début du premier tour et sa durée en jours : la date de fin s'affiche ici.";
    const cfg = { start_date: start, interval_days: Math.min(365, days) };
    return `Chaque tour dure ${cfg.interval_days} jour${cfg.interval_days > 1 ? 's' : ''}. Tour 1 : du ${fmtShort(roundStart(cfg, 0))} au ${fmtShort(roundEnd(cfg, 0))}, la cagnotte est remise à la fin du tour.`
      + (n > 1 ? ` Dernier tour (${n}) : jusqu'au ${fmtShort(roundEnd(cfg, n - 1))}.` : '');
  }
  const rel = iso => { const d = dayDiff(iso, todayISO()); return d === 0 ? "aujourd'hui" : d === 1 ? 'demain' : d === -1 ? 'hier' : d > 0 ? 'dans ' + d + ' jours' : 'il y a ' + (-d) + ' jours'; };
  const freqText = c => c.interval_days === 1 ? 'chaque jour' : c.interval_days === 7 ? 'chaque semaine' : 'tous les ' + c.interval_days + ' jours';
  const initials = n => n.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };

  // How a payment reached the group. Stored in each entry of payments.log ({ a: amount, at: date, m: key }).
  const METHODS = { mpesa: 'M-Pesa', orange: 'Orange Money', airtel: 'Airtel Money', illico: 'Illico Cash', cash_orga: "Cash à l'organisateur", cash_caissier: 'Cash au caissier' };
  const METHOD_GROUPS = [['Mobile Money', ['mpesa', 'orange', 'airtel']], ['Illico', ['illico']], ['Cash', ['cash_orga', 'cash_caissier']]];
  const methodName = k => METHODS[k] || 'Moyen non précisé';
  const lastMethod = () => { const v = store.get('lisanga.lastmethod'); return METHODS[v] ? v : ''; };
  const methodSelect = (id, sel) => `<select class="msel" data-d="m.${esc(id)}" aria-label="Moyen de paiement"><option value="">Moyen de paiement…</option>${METHOD_GROUPS.map(([label, keys]) => `<optgroup label="${esc(label)}">${keys.map(k => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(METHODS[k])}</option>`).join('')}</optgroup>`).join('')}</select>`;

  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200); }
  function friendly(e) {
    const m = String((e && e.message) || ''), c = e && e.code;
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
    if (/already registered/i.test(m)) return 'Un compte existe déjà avec cet e-mail.';
    if (/Email not confirmed/i.test(m)) return "Confirmez d'abord votre e-mail (lien reçu par message), puis connectez-vous.";
    if (/at least \d+ characters/i.test(m)) return 'Le mot de passe doit avoir au moins 6 caractères.';
    if (/invalid.*email|email.*invalid/i.test(m)) return 'Adresse e-mail invalide.';
    if (/rate limit/i.test(m)) return 'Trop de tentatives. Patientez quelques minutes.';
    if (m === 'invalid_code') return "Code d'invitation inconnu.";
    if (m === 'join_closed') return "Les inscriptions sont fermées pour cette tontine.";
    if (m === 'already_joined') return 'Vous êtes déjà dans cette tontine.';
    if (m === 'name_required') return 'Indiquez votre nom.';
    if (c === '42501' || /row-level security|permission denied/i.test(m)) return "Vous n'avez pas le droit de faire cela.";
    if (c === '23505') return 'Cet élément existe déjà.';
    if (c === 'quota_exceeded') return "L'espace de stockage est plein.";
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Pas de connexion à Internet. Réessayez.';
    return 'Action impossible pour le moment. Réessayez.';
  }

  // ---------- State ----------
  const S = {
    user: null, tontines: [], tid: null, cfg: null, view: '', arg: '',
    allMembers: [], contacts: new Map(), pay: new Map(), out: new Map(), topics: [], msgs: [],
    loaded: false, members: [], pending: [], preview: null,
  };
  const ui = { push: { supported: false, subscribed: false, permission: 'default' }, armed: '', draft: {}, authMode: null, copyText: '', topic: 'general', pending: null, att: new Map(), chatBusy: false, rec: null, rendered: '', seen: null, known: null };
  const dv = (k, def) => ui.draft[k] != null ? ui.draft[k] : def;
  const isCreator = () => !!(S.cfg && S.user && S.cfg.owner_id === S.user.id);
  const myRow = () => S.user ? S.allMembers.find(m => m.user_id === S.user.id) : null;
  // organizer = creator, or an active member the creator named organizer
  const isAdmin = () => isCreator() || !!(myRow() && myRow().is_organizer && myRow().status === 'active');
  const chatName = () => { const m = myRow(); return m && m.status === 'active' ? m.name : isAdmin() ? 'Organisateur' : ''; };
  const canChat = () => !!S.user && !!chatName();

  // ---------- Push notifications ----------
  // The server (Edge Function "push") sends the alerts; here the device subscribes and the service worker shows them.
  const VAPID = (window.LISANGA_CONFIG || {}).vapidPublicKey || '';
  const pushPossible = () => !!VAPID && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && location.protocol.startsWith('http');
  const b64ToU8 = b => { const p = '='.repeat((4 - b.length % 4) % 4), r = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
  async function currentSub() { const reg = await navigator.serviceWorker.getRegistration(); return reg ? reg.pushManager.getSubscription() : null; }
  async function refreshPush() {
    if (!pushPossible()) { ui.push = { supported: false, subscribed: false, permission: 'default' }; return; }
    let sub = null; try { sub = await currentSub(); } catch (e) {}
    ui.push = { supported: true, subscribed: !!sub && Notification.permission === 'granted', permission: Notification.permission };
    render();
  }
  async function enablePush() {
    if (await Notification.requestPermission() !== 'granted') { toast("Notifications refusées. Autorisez-les dans les réglages du navigateur pour ce site."); await refreshPush(); return; }
    const reg = await navigator.serviceWorker.ready, opts = { userVisibleOnly: true, applicationServerKey: b64ToU8(VAPID) };
    let sub;
    try { sub = await reg.pushManager.subscribe(opts); }
    catch (e) { const old = await reg.pushManager.getSubscription(); if (!old) throw e; await old.unsubscribe(); sub = await reg.pushManager.subscribe(opts); }
    const j = sub.toJSON();
    await B.upsert('push_subscriptions', { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, 'user_id,endpoint');
    store.set('lisanga.pushlater', ''); toast('Notifications activées sur cet appareil.');
    await refreshPush();
  }
  async function disablePush() {
    try {
      const sub = await currentSub();
      if (sub) { const endpoint = sub.endpoint; await sub.unsubscribe(); await B.remove('push_subscriptions', { endpoint }); }
    } catch (e) { /* best effort */ }
  }
  const PUSH_FN = (window.LISANGA_CONFIG || {}).pushFunction || 'push';   // slug of the Edge Function (Supabase may force another name)
  const notify = body => { B.invoke(PUSH_FN, body).catch(() => {}); };

  // ---------- Data loading ----------
  const normT = t => Object.assign({}, t, { amount: Number(t.amount), penalty: Number(t.penalty) });
  async function loadTontines() { S.tontines = (await B.select('tontines', { order: [['created_at', true]] })).map(normT); }
  function pickTontine() {
    const want = store.get('lisanga.tid:' + (S.user ? S.user.id : ''));
    S.tid = (S.tontines.find(t => t.id === want) || S.tontines[0] || {}).id || null;
    S.cfg = S.tontines.find(t => t.id === S.tid) || null;
  }
  async function loadTable(name) {
    const tid = S.tid; if (!tid) return;
    const eq = { tontine_id: tid };
    if (name === 'tontines') { await loadTontines(); if (tid === S.tid) S.cfg = S.tontines.find(t => t.id === tid) || null; return; }
    if (name === 'contacts' && !isAdmin()) return;
    const rows = await B.select(name, name === 'messages' ? { eq, order: [['created_at', false]], limit: 300 } : name === 'topics' ? { eq, order: [['created_at', true]] } : name === 'members' ? { eq, order: [['position', true], ['created_at', true]] } : { eq });
    if (tid !== S.tid) return;
    if (name === 'members') { S.allMembers = rows; S.members = rows.filter(m => m.status === 'active'); S.pending = rows.filter(m => m.status === 'pending'); }
    else if (name === 'contacts') S.contacts = new Map(rows.map(r => [r.member_id, r.phone]));
    else if (name === 'payments') {
      const next = new Map(rows.map(r => [r.round + '_' + r.member_id, Object.assign({}, r, { amount: Number(r.amount) })]));
      if (S.loaded && !isAdmin()) next.forEach((v, k) => { const o = S.pay.get(k), n = nameOf(v.member_id); if (n && (!o || o.amount !== v.amount)) toast(v.amount >= S.cfg.amount ? n + ' a payé toute sa cotisation.' : n + ' a versé ' + money(v.amount) + ' sur ' + money(S.cfg.amount) + '.'); });
      S.pay = next;
    } else if (name === 'payouts') {
      const next = new Map(rows.map(r => [r.round, Object.assign({}, r, { amount: Number(r.amount) })]));
      if (S.loaded && !isAdmin()) next.forEach((v, k) => { if (!S.out.has(k) && nameOf(v.member_id)) toast(nameOf(v.member_id) + ' a reçu la cagnotte.'); });
      S.out = next;
    } else if (name === 'topics') S.topics = rows;
    else if (name === 'messages') {
      S.msgs = rows.reverse().map(m => Object.assign({}, m, { ts: Date.parse(m.created_at), tp: m.topic_id || 'general' }));
      const now = new Set(S.msgs.map(m => m.id));
      if (ui.known && S.view !== 'discussion') S.msgs.forEach(m => { if (!ui.known.has(m.id) && m.author_id !== S.user.id) toast(m.author_name + ' : ' + (m.body ? m.body.slice(0, 60) : '(pièce jointe)')); });
      ui.known = now;
    }
  }
  const nameOf = id => (S.allMembers.find(m => m.id === id) || {}).name;
  const ALL = ['tontines', 'members', 'contacts', 'payments', 'payouts', 'topics', 'messages'];
  let unsub = null, queued = new Set(), timer = 0;
  function queue(table) {
    if (table === '*') ALL.forEach(t => queued.add(t)); else queued.add(table);
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const list = [...queued], tid = S.tid; queued = new Set();
      if (!tid) return;
      try { await Promise.all(list.map(loadTable)); } catch (e) { /* next change or refresh retries */ }
      if (tid === S.tid) route(true);
    }, 120);
  }
  async function openTontine() {
    if (unsub) { unsub(); unsub = null; }
    S.loaded = false; ui.known = null; ui.seen = null;
    Object.assign(S, { allMembers: [], members: [], pending: [], contacts: new Map(), pay: new Map(), out: new Map(), topics: [], msgs: [] });
    if (!S.tid) return;
    store.set('lisanga.tid:' + S.user.id, S.tid);
    await Promise.all(ALL.map(loadTable));
    S.loaded = true;
    unsub = B.subscribe(S.tid, queue);
  }
  async function bootstrap() {
    if (!S.user) { if (unsub) unsub(); unsub = null; Object.assign(S, { tontines: [], tid: null, cfg: null, loaded: false }); route(); return; }
    try { await loadTontines(); pickTontine(); await openTontine(); } catch (e) { toast(friendly(e)); }
    route();
    if (S.user) refreshPush();
  }

  // ---------- Derived ----------
  const paidOf = rec => rec ? rec.amount : 0;
  const isFull = rec => !!rec && !!S.cfg && rec.amount >= S.cfg.amount;
  function derive() {
    const n = S.members.length; let cur = 0; while (S.out.has(cur)) cur++;
    const amt = new Map(S.members.map(m => [m.id, paidOf(S.pay.get(cur + '_' + m.id))]));
    let got = 0; amt.forEach(v => { got += v; });
    const paidIds = new Set(S.members.filter(m => isFull(S.pay.get(cur + '_' + m.id))).map(m => m.id));
    return { n, cur, paidIds, amt, got, benef: S.members[cur] || null };
  }
  // A payment is late when made after the round date, or still missing once that date has passed.
  function penOf(c, D, m) {
    if (!c.penalty) return 0;
    const due = roundDate(c, D.cur), rec = S.pay.get(D.cur + '_' + m.id);
    return (isFull(rec) ? (rec.done_on || rec.paid_on || '') > due : todayISO() > due) ? c.penalty : 0;
  }
  // Local numbers (0…) get the country code; international numbers are kept as typed.
  function waPhone(c, raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = (c.country_code || '243') + d.slice(1);
    return d;
  }
  function personalText(c, D, m) {
    const due = roundDate(c, D.cur), late = dayDiff(due, todayISO()) < 0, pen = penOf(c, D, m), a = D.amt.get(m.id) || 0;
    const fmt = n => num(n) + ' ' + c.currency;
    return `Bonjour ${m.name}, rappel de la tontine « ${c.name} » (tour ${D.cur + 1}) : `
      + (a > 0 ? `il vous reste ${fmt(c.amount - a)} à verser sur votre cotisation de ${fmt(c.amount)} (échéance : ${fmtDate(due)}).` : `votre cotisation de ${fmt(c.amount)} ${late ? 'était attendue' : 'est attendue'} le ${fmtDate(due)}.`)
      + (pen ? ` Une pénalité de ${fmt(pen)} s'applique.` : '') + ' Merci !';
  }
  function reminderText(c, D) {
    const due = roundDate(c, D.cur), fmt = n => num(n) + ' ' + c.currency;
    const miss = S.members.filter(m => !D.paidIds.has(m.id)).map(m => { const a = D.amt.get(m.id) || 0; return a > 0 ? `${m.name} (reste ${fmt(c.amount - a)})` : m.name; });
    return `Rappel tontine « ${c.name} », tour ${D.cur + 1}/${D.n}\nBénéficiaire : ${D.benef.name}\nFin du tour : ${fmtDate(due)}\nCotisation : ${fmt(c.amount)}`
      + (c.penalty ? `\nPénalité de retard : ${fmt(c.penalty)}` : '') + (miss.length ? `\nReste à payer : ${miss.join(', ')}` : '\nTout le monde a payé, merci !');
  }
  const inviteLink = () => location.origin + location.pathname + '#/rejoindre/' + S.cfg.code;
  const waLink = (phone, text) => 'https://wa.me/' + (phone || '') + '?text=' + encodeURIComponent(text);

  // ---------- Router ----------
  const TABS = ['tour', 'calendrier', 'direct', 'discussion', 'organisateur'];
  const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };
  function route(soft) {
    const [, r, arg] = (location.hash || '').split('/');
    let view;
    if (!S.user) { if (r === 'rejoindre' && arg) try { sessionStorage.setItem('lisanga.code', arg); } catch (e) {} view = 'auth'; }
    else if (r === 'rejoindre' && arg) { view = 'join'; S.arg = arg; }
    else if (r === 'accueil' || !S.tid) view = 'welcome';
    else if (myRow() && myRow().status === 'pending' && !isAdmin()) view = 'pending';
    else view = TABS.includes(r) ? r : 'tour';
    if (view === 'organisateur' && !isAdmin()) view = 'tour';
    const changed = S.view !== view;
    if (changed) { ui.armed = ''; ui.copyText = ''; ui.rendered = ''; }
    S.view = view;
    if (soft === true && !changed && ['auth', 'welcome', 'join'].includes(view)) return;   // data changes do not concern these forms
    if (view === 'join' && (changed || !soft)) loadPreview(arg);
    render();
    if (changed) window.scrollTo(0, 0);
  }
  async function loadPreview(code) {
    S.preview = null;
    try { const r = await B.rpc('tontine_preview', { p_code: code }); S.preview = r && r[0] ? r[0] : { missing: true }; } catch (e) { S.preview = { missing: true }; }
    if (S.view === 'join') render();
  }

  // ---------- Render ----------
  // The focused field keeps its text and caret across a re-render, so live updates never interrupt typing.
  const focusKey = el => el.dataset && (el.dataset.d ? 'd:' + el.dataset.d : el.dataset.phone ? 'p:' + el.dataset.phone : el.id ? 'i:' + el.id : '');
  function render() {
    const v = $('view'), a = document.activeElement;
    chrome();
    const ready = S.loaded || ['auth', 'welcome', 'join'].includes(S.view);
    if (!ready) { v.innerHTML = '<p class="empty">Chargement…</p>'; ui.rendered = ''; return; }
    if (S.view === 'discussion') { if (ui.rendered !== 'discussion') { v.innerHTML = chatSkeleton(); ui.rendered = 'discussion'; } renderChatParts(); return; }
    let keep = null;
    if (a && v.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName) && focusKey(a)) keep = { k: focusKey(a), value: a.value, s: a.selectionStart, e: a.selectionEnd };
    const D = S.cfg ? derive() : null;
    const html = ({ auth: viewAuth, welcome: viewWelcome, join: viewJoin, pending: viewPending, tour: () => viewTour(D), calendrier: () => viewCal(D), direct: () => viewLive(D), organisateur: () => viewAdmin(D) })[S.view];
    v.innerHTML = html ? html() : '';
    ui.rendered = S.view;
    if (keep) {
      const x = [...v.querySelectorAll('input,textarea')].find(el => focusKey(el) === keep.k);
      if (x) { x.focus({ preventScroll: true }); if (x.value !== keep.value && x.type !== 'checkbox') x.value = keep.value; try { x.setSelectionRange(keep.s, keep.e); } catch (e) {} }
    }
  }
  function chrome() {
    const signed = !!S.user;
    $('topbar').hidden = !signed;
    $('demoBanner').hidden = B.mode !== 'demo';
    const tabs = signed && S.tid && TABS.includes(S.view);
    $('tabbar').hidden = !tabs;
    document.querySelectorAll('.tabbar a').forEach(a => { a.classList.toggle('on', a.dataset.tab === S.view); a.hidden = a.dataset.role === 'orga' && !isAdmin(); });
    $('liveDot').hidden = !(signed && S.tid);
    if (signed) { const m = myRow(); $('userChip').textContent = (m ? m.name : S.user.email); }
    $('reqBadge').textContent = S.pending.length; $('reqBadge').hidden = !(isAdmin() && S.pending.length);
    const unread = S.loaded ? totalUnread() : 0; $('chatBadge').textContent = unread; $('chatBadge').hidden = !unread;
  }

  // ----- auth & onboarding -----
  function viewAuth() {
    const code = sessionStorage.getItem('lisanga.code'), up = (ui.authMode || (code ? 'up' : 'in')) === 'up';   // an invited person has no account yet
    return `<section class="panel auth"><p class="eyebrow">Tontine</p><h2>Elongo</h2><p class="hint" style="margin:6px 0 14px">Suivez votre tontine en direct avec le groupe.</p>
      ${code ? '<div class="mine" style="margin-bottom:14px">Vous êtes invité à rejoindre une tontine. Connectez-vous ou créez un compte pour continuer.</div>' : ''}
      <div class="seg"><button type="button" data-act="authmode" data-mode="in" aria-pressed="${!up}">Se connecter</button><button type="button" data-act="authmode" data-mode="up" aria-pressed="${up}">Créer un compte</button></div>
      <form id="authForm"><label class="f">Adresse e-mail<input type="email" name="email" required autocomplete="email" inputmode="email"></label>
      <label class="f">Mot de passe${up ? ' (6 caractères minimum)' : ''}<input type="password" name="password" required minlength="6" autocomplete="${up ? 'new-password' : 'current-password'}"></label>
      <p class="error" id="authErr" role="alert"></p><button class="primary" type="submit">${up ? 'Créer mon compte' : 'Se connecter'}</button></form></section>`;
  }
  const createForm = () => `<section class="panel"><h2>Créer ma tontine</h2><form id="createForm" class="grid">
      <label class="f">Nom du groupe<input data-d="c.name" value="${esc(dv('c.name', ''))}" required maxlength="60" placeholder="Ex. Tontine des amis"></label>
      <label class="f">Cotisation par membre<input data-d="c.amount" value="${esc(dv('c.amount', ''))}" type="number" min="1" step="any" required placeholder="10000"></label>
      <label class="f">Monnaie<input data-d="c.cur" value="${esc(dv('c.cur', 'FC'))}" maxlength="8" required></label>
      <label class="f">Durée d'un tour (jours)<input data-d="c.days" value="${esc(dv('c.days', 30))}" type="number" min="1" max="365" step="1" required></label>
      <label class="f">Début du premier tour<input data-d="c.start" value="${esc(dv('c.start', todayISO()))}" type="date" required></label>
      <p class="hint" id="prev-c" style="grid-column:1/-1">${esc(tourPreview(dv('c.start', todayISO()), dv('c.days', 30), 0))}</p>
      <label class="f">Votre nom<input data-d="c.me" value="${esc(dv('c.me', ''))}" required maxlength="40" placeholder="Votre nom dans le groupe"></label>
      <div class="f">Participation<label class="inl"><input type="checkbox" data-d="c.part" ${dv('c.part', true) ? 'checked' : ''}> Je participe aux tours</label></div>
      <button class="primary" type="submit">Créer la tontine</button></form></section>`;
  const joinFields = () => `<input data-d="j.name" value="${esc(dv('j.name', ''))}" maxlength="40" placeholder="Votre nom" aria-label="Votre nom" required>
      <input data-d="j.phone" value="${esc(dv('j.phone', ''))}" class="ph" inputmode="tel" placeholder="Téléphone WhatsApp" aria-label="Votre numéro de téléphone">`;
  function viewWelcome() {
    return `<section class="panel empty"><h2>Bienvenue sur Elongo</h2><p class="hint">Créez la tontine de votre groupe, ou rejoignez celle de vos amis avec le code que l'organisateur vous a donné.</p>${S.tid ? '<p style="margin-top:12px"><button type="button" data-act="back">Retour à ma tontine</button></p>' : ''}</section>
      ${createForm()}
      <section class="panel"><h2>Rejoindre une tontine</h2><form id="joinCodeForm" class="addrow" style="margin-top:0">
        <input data-d="j.code" value="${esc(dv('j.code', ''))}" maxlength="20" placeholder="Code d'invitation" aria-label="Code d'invitation" required autocapitalize="none">${joinFields()}
        <button class="primary" type="submit">Demander à rejoindre</button></form>
        <p class="hint" style="margin-top:8px">Votre numéro n'est visible que par l'organisateur.</p></section>`;
  }
  function viewJoin() {
    const p = S.preview;
    if (!p) return '<p class="empty">Chargement…</p>';
    if (p.missing) return `<section class="panel empty"><h2>Code inconnu</h2><p>Ce lien d'invitation n'est pas valide. Demandez-en un nouveau à l'organisateur.</p><button type="button" data-act="back">Retour</button></section>`;
    if (!p.join_open) return `<section class="panel empty"><h2>Inscriptions fermées</h2><p>L'organisateur de « ${esc(p.name)} » n'accepte plus de demandes.</p><button type="button" data-act="back">Retour</button></section>`;
    return `<section class="panel"><p class="eyebrow">Invitation</p><h2>Rejoindre « ${esc(p.name)} »</h2>
      <p class="hint" style="margin:8px 0 0">L'organisateur doit valider votre demande, puis votre nom apparaîtra dans le calendrier.</p>
      <form id="joinCodeForm" class="addrow"><input type="hidden" data-d="j.code" value="${esc(S.arg)}">${joinFields()}<button class="primary" type="submit">Demander à rejoindre</button></form>
      <p class="hint" style="margin-top:8px">Votre numéro n'est visible que par l'organisateur.</p></section>`;
  }
  function viewPending() {
    return `<section class="panel empty"><h2>Demande envoyée</h2><p>L'organisateur de « ${esc(S.cfg.name)} » doit valider votre demande. Cet écran se met à jour tout seul dès que c'est fait.</p>
      <p><button type="button" data-act="cancelreq">Annuler ma demande</button></p></section>`;
  }

  // ----- tour -----
  function viewTour(D) {
    const c = S.cfg;
    const pushBanner = ui.push.supported && !ui.push.subscribed && ui.push.permission !== 'denied' && !store.get('lisanga.pushlater')
      ? `<div class="remind"><b>Alertes sur ce téléphone</b><br>Soyez prévenu des versements, des remises de cagnotte et des messages, même appli fermée.<div class="versrow"><button class="mini primary" data-act="pushon">Activer les notifications</button><button class="mini" data-act="pushlater">Plus tard</button></div></div>` : '';
    const header = `<header><p class="eyebrow">Tontine</p><h2 style="font-size:1.6rem">${esc(c.name)}</h2>
      <p class="hint" style="margin-top:6px">${money(c.amount)} par membre, ${freqText(c)}. ${D.n} membre${D.n > 1 ? 's' : ''}, ${D.n} tour${D.n > 1 ? 's' : ''} au total.</p></header>` + pushBanner;
    if (!D.n) return header + `<section class="panel empty"><h2>Aucun membre pour l'instant</h2><p>${isAdmin() ? "Ajoutez les membres ou partagez le lien d'invitation dans l'onglet Organisateur." : "L'organisateur va ajouter les membres du groupe."}</p></section>`;
    if (D.cur >= D.n) return header + `<section class="panel empty"><h2>Le cycle est terminé</h2><p>Les ${D.n} membres ont tous reçu la cagnotte.</p>${isAdmin() && D.cur > 0 ? undoBtn(D, '') : ''}</section>`;
    const due = roundDate(c, D.cur), late = dayDiff(due, todayISO()) < 0, pot = c.amount * D.n, got = D.got, pct = Math.min(100, Math.round(100 * got / pot)), miss = D.n - D.paidIds.size;
    const me = myRow(), mi = me ? S.members.findIndex(m => m.id === me.id) : -1;
    let mine = '', remind = '';
    if (mi >= 0) {
      mine = mi < D.cur ? `<div class="mine">Vous avez déjà reçu votre part (tour ${mi + 1}).</div>`
        : mi === D.cur ? `<div class="mine"><b>C'est votre tour.</b> Cagnotte de ${money(pot)} à remettre le ${esc(fmtDate(due))}.</div>`
        : `<div class="mine">Votre tour : du ${esc(fmtShort(roundStart(c, mi)))} au <b>${esc(fmtDate(roundEnd(c, mi)))}</b> (${esc(rel(roundEnd(c, mi)))}), tour ${mi + 1} sur ${D.n}.</div>`;
      if (!D.paidIds.has(me.id)) {
        const dd = dayDiff(due, todayISO()), pen = penOf(c, D, me), rest = c.amount - (D.amt.get(me.id) || 0);
        if (dd < 0) remind = `<div class="remind late"><b>Cotisation en retard.</b> Versez ${money(rest)} dès que possible${pen ? `. Pénalité : ${money(pen)}` : ''}.</div>`;
        else if (dd <= c.reminder_days) remind = `<div class="remind"><b>Rappel :</b> il vous reste ${money(rest)} à verser, attendu ${esc(rel(due))} (${esc(fmtShort(due))}).</div>`;
      }
    }
    const act = isAdmin() ? `<div class="actions"><button data-act="payout" class="${ui.armed === 'payout' ? 'armed' : ''}">${ui.armed === 'payout' ? (got === 0 ? 'Confirmer : rien encaissé' : miss ? `Confirmer, il manque ${miss} cotisation${miss > 1 ? 's' : ''}` : 'Confirmer la remise') : 'Remettre ' + money(got) + ' à ' + esc(D.benef.name)}</button>`
      + (D.cur > 0 ? undoBtn(D, 'ghost') : '') + '</div>' : '';
    const hero = `<section class="hero" aria-live="polite"><div><p class="eyebrow">Tour ${D.cur + 1} sur ${D.n}, bénéficiaire</p><h2>${esc(D.benef.name)}</h2>
      <p class="when">Fin du tour : <b>${esc(fmtDate(due))}</b> · ${esc(rel(due))}</p><p class="when" style="opacity:.75;font-size:.9rem">Tour de ${c.interval_days} jour${c.interval_days > 1 ? 's' : ''}, du ${esc(fmtShort(roundStart(c, D.cur)))} au ${esc(fmtShort(due))}</p><span class="coin${late && got < pot ? ' late' : ''}">${got >= pot ? 'Cagnotte complète' : late ? 'En retard' : 'En cours'}</span></div>
      <div class="pot"><div><div class="lbl">Cagnotte du tour</div><div class="big num">${money(pot)}</div></div>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <div class="lbl num">${money(got)} encaissés sur ${money(pot)}, ${got < pot ? `il reste ${money(pot - got)} à encaisser` : 'cagnotte complète, prête à être remise'}</div></div>${mine}${remind}${act}</section>`;
    return header + hero + contribPanel(c, D);
  }
  // Takes back the last payout (the beneficiary goes back to "not served yet"); asks twice so it cannot happen by accident.
  const undoBtn = (D, cls) => { const n = S.members[D.cur - 1], armed = ui.armed === 'undo'; return `<button type="button" class="${cls}${armed ? ' armed' : ''}" data-act="undo">${armed ? 'Confirmer : annuler la remise' : 'Annuler la remise de ' + esc(n ? n.name : 'ce tour')}</button>`; };
  function contribPanel(c, D) {
    const owed = S.members.reduce((t, m) => { const r = S.pay.get(D.cur + '_' + m.id); return t + (r && r.penalty_paid ? 0 : penOf(c, D, m)); }, 0);
    const adm = isAdmin(), me = myRow();
    return `<section class="panel" id="contrib"><div class="chead"><h2>Cotisations du tour ${D.cur + 1}</h2>${adm ? `<span><a class="lnk" target="_blank" rel="noopener noreferrer" href="${esc(waLink('', reminderText(c, D)))}">Rappel au groupe (WhatsApp)</a> <button class="mini" data-act="copy">Copier</button></span>` : ''}</div>`
      + (ui.copyText ? `<textarea class="copybox" id="copyBox" readonly aria-label="Message de rappel">${esc(ui.copyText)}</textarea>` : '')
      + (owed ? `<p class="pen" style="margin:0 0 8px">Pénalités à percevoir : ${money(owed)}</p>` : '')
      + '<ul class="list">' + S.members.map((m, i) => {
        const paid = D.paidIds.has(m.id), rec = S.pay.get(D.cur + '_' + m.id), a = D.amt.get(m.id) || 0, rest = Math.max(0, c.amount - a), pen = penOf(c, D, m), settled = !!(rec && rec.penalty_paid), pct = Math.min(100, Math.round(100 * a / c.amount));
        const penLine = pen ? `<div class="pen${settled ? ' settled' : ''}">Pénalité ${money(pen)}${settled ? ' réglée' : ''}${adm && rec ? ` <button class="mini" data-act="pen" data-id="${esc(m.id)}" aria-pressed="${settled}">${settled ? 'Annuler' : 'Marquer réglée'}</button>` : ''}</div>` : '';
        const hist = rec && rec.log && rec.log.length ? `<div class="sub">Versements : ${rec.log.slice(-3).map(x => money(x.a) + (x.m ? ' · ' + esc(methodName(x.m)) : '') + ' (' + esc(fmtShort(x.at)) + ')').join(', ')}</div>` : '';
        const ctl = adm ? `<div class="versrow">${rest > 0 ? `<input class="vin" type="number" min="1" step="any" max="${rest}" data-d="v.${esc(m.id)}" value="${esc(dv('v.' + m.id, rest))}" aria-label="Montant versé par ${esc(m.name)}">${methodSelect(m.id, dv('m.' + m.id, lastMethod()))}<button class="mini primary" data-act="vers" data-id="${esc(m.id)}">Verser</button>` : ''}${a > 0 ? `<button class="mini" data-act="unvers" data-id="${esc(m.id)}">Annuler le dernier</button>` : ''}</div>` : '';
        const ph = adm && !paid ? waPhone(c, S.contacts.get(m.id)) : '';
        const wa = ph ? `<div><a class="lnk" target="_blank" rel="noopener noreferrer" href="${esc(waLink(ph, personalText(c, D, m)))}">Relancer sur WhatsApp</a></div>` : '';
        return `<li class="row${me && m.id === me.id ? ' is-me' : ''}"><span class="av" aria-hidden="true">${esc(initials(m.name))}</span><div class="grow"><div class="name">${memberLink(m)}${i === D.cur ? ' <span class="pill now">Bénéficiaire</span>' : ''}</div>
          <div class="sub num">${paid ? 'Complet : ' + money(c.amount) + (rec && (rec.done_on || rec.paid_on) ? ' le ' + esc(fmtShort(rec.done_on || rec.paid_on)) : '') : a > 0 ? `Versé ${money(a)} sur ${money(c.amount)}, reste ${money(rest)}` : `Rien versé, ${money(c.amount)} attendus`}</div>
          <div class="mbar${paid ? ' full' : ''}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Cotisation de ${esc(m.name)}"><i style="width:${pct}%"></i></div>${hist}${penLine}${ctl}${wa}</div>
          <span class="pill ${paid ? 'ok' : a > 0 ? 'part' : 'wait'}">${paid ? 'Complet' : a > 0 ? pct + '%' : 'En attente'}</span></li>`;
      }).join('') + '</ul></section>';
  }

  // ----- calendar -----
  // Date on which every member had paid a round in full (null while someone is missing): the calendar ticks the days from then until the planned end.
  function roundDone(c, r, rows) {
    if (!S.members.length) return null;
    let last = '';
    for (const m of S.members) {
      let sum = 0, on = null;
      rows.forEach(x => { if (x.round === r && x.id === m.id) { sum += x.a; if (on === null && sum >= c.amount) on = x.at; } });
      if (on === null) return null;
      if (on > last) last = on;
    }
    return last || roundStart(c, r);
  }
  // Report of one day: what was paid that day, and who has paid (or not) in the rounds concerned.
  function dayDialog(iso) {
    const c = S.cfg, D = derive(), today = todayISO(), rows = paymentRows(), eff = iso < today ? iso : today;
    const roundIdx = Math.floor(dayDiff(iso, c.start_date) / c.interval_days);
    const ends = []; for (let k = 0; k < D.n; k++) if (roundEnd(c, k) === iso) ends.push(k);
    const paidToday = rows.filter(x => x.at === iso);
    const shown = [...new Set([...ends, ...paidToday.map(x => x.round), ...(roundIdx >= 0 && roundIdx < D.n ? [roundIdx] : [])])].sort((x, y) => x - y);   // ended that day, paid that day, running that day
    const day = `<h3 style="margin-top:14px">Versements enregistrés ce jour</h3>` + (paidToday.length ? '<ul class="list">' + paidToday.map(x => `<li class="row"><div class="grow"><div class="name">${esc(x.name)}</div><div class="sub">Tour ${x.round + 1} · ${esc(methodName(x.m))}</div></div><div class="num">${money(x.a)}</div></li>`).join('') + '</ul>' : '<p class="hint">Aucun versement enregistré ce jour.</p>');
    const blocks = shown.map(k => {
      const ben = S.members[k], start = roundStart(c, k), end = roundEnd(c, k), out = S.out.get(k), done = roundDone(c, k, rows);
      let head = `<h3 style="margin-top:14px">Tour ${k + 1} · ${esc(ben ? ben.name : '')}</h3><p class="sub">Du ${esc(fmtShort(start))} au ${esc(fmtShort(end))}</p>`;
      if (ends.includes(k)) head += `<p><b>Jour de remise</b> · ${out ? `cagnotte remise à ${esc(ben.name)}${out.paid_on ? ' le ' + esc(fmtShort(out.paid_on)) : ''}` : iso <= today ? 'cagnotte pas encore remise' : 'remise prévue ce jour-là'}</p>`;
      if (done) head += `<p class="okline">✓ Cagnotte complète${done < end ? ` depuis le ${esc(fmtShort(done))}, avant la date prévue (${esc(fmtShort(end))})` : ''}</p>`;
      if (eff < start) return head + '<p class="hint">Ce tour n\'a pas encore commencé.</p>';
      const st = S.members.map(m => { const cum = rows.reduce((t, x) => t + (x.round === k && x.id === m.id && x.at <= eff ? x.a : 0), 0); return { m, cum, full: cum >= c.amount }; });
      const nFull = st.filter(x => x.full).length, nPart = st.filter(x => !x.full && x.cum > 0).length, nNone = st.length - nFull - nPart;
      return head + `<p class="hint">${iso > today ? 'Jour à venir : situation à ce jour' : 'Situation à la fin de ce jour'} · ${nFull} complet${nFull > 1 ? 's' : ''}, ${nPart} partiel${nPart > 1 ? 's' : ''}, ${nNone} sans versement</p><ul class="list">` + st.map(x => `<li class="row"><div class="grow name">${esc(x.m.name)}</div>${x.full ? '<span class="pill ok">Complet</span>' : x.cum > 0 ? `<span class="pill now">Partiel</span><span class="sub num">${money(x.cum)} / ${money(c.amount)}</span>` : '<span class="pill warn">Non versé</span>'}</li>`).join('') + '</ul>';
    }).join('');
    $('modalBody').innerHTML = `<h2>${esc(fmtDate(iso))}</h2>${shown.length ? '' : '<p class="sub">Aucun tour ce jour-là.</p>'}${blocks}${day}<div class="dlg-actions"><button data-m="close">Fermer</button></div>`;
    $('modal').showModal();
  }

  // Month grid: every day of a round is tinted, the day a round ends (the payout day) carries a badge "T<n>", and the next rounds are listed below.
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const monthKey = iso => iso.slice(0, 7);
  const shiftMonth = (key, n) => { const d = new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1 + n, 1)); return toISO(d).slice(0, 7); };
  function calGrid(D) {
    const c = S.cfg, today = todayISO(), first = monthKey(c.start_date), last = monthKey(roundEnd(c, D.n - 1));
    let key = ui.calMonth || monthKey(today); if (key < first) key = first; if (key > last) key = last; ui.calMonth = key;
    const y = +key.slice(0, 4), m0 = +key.slice(5, 7) - 1, lead = (new Date(Date.UTC(y, m0, 1)).getUTCDay() + 6) % 7, days = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
    const roundOf = iso => { const k = Math.floor(dayDiff(iso, c.start_date) / c.interval_days); return k >= 0 && k < D.n ? k : -1; };
    const endsOn = new Map(); for (let r = 0; r < D.n; r++) endsOn.set(roundEnd(c, r), r);
    const rows = paymentRows(), doneOn = []; for (let r = 0; r < D.n; r++) doneOn.push(roundDone(c, r, rows));
    const hasPay = new Set(rows.map(x => x.at));
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<div class="cd out" aria-hidden="true"></div>');
    for (let d = 1; d <= days; d++) {
      const iso = key + '-' + pad(d), r = roundOf(iso), e = endsOn.get(iso), cls = ['cd'];
      if (r >= 0) { cls.push('r' + (r % 3)); if (S.out.has(r)) cls.push('served'); else if (r === D.cur) cls.push('cur'); }
      if (iso === today) cls.push('today');
      const ticked = r >= 0 && doneOn[r] !== null && iso >= doneOn[r]; if (ticked) cls.push('paid');
      if (hasPay.has(iso)) cls.push('haspay');
      let label = d + ' ' + MONTHS[m0];
      if (r >= 0) label += ', tour ' + (r + 1) + ' de ' + (S.members[r] ? S.members[r].name : '');
      if (ticked) label += ', cagnotte complète';
      let badge = '';
      if (e !== undefined) { cls.push('end'); const got = S.out.has(e); badge = `<b class="cb${got ? ' got' : ''}">${got ? '✓' : ''}T${e + 1}</b>`; label += ', remise du tour ' + (e + 1) + (S.members[e] ? ' à ' + S.members[e].name : '') + (got ? ' (faite)' : ''); }
      cells.push(`<button type="button" class="${cls.join(' ')}" data-act="calday" data-date="${iso}" title="${esc(label)} : voir le rapport du jour" aria-label="${esc(label)} : voir le rapport du jour"><span>${d}${ticked ? ' <i class="tk">✓</i>' : ''}</span>${badge}</button>`);
    }
    const nav = (act, dis, txt, aria) => `<button type="button" class="mini" data-act="${act}" aria-label="${aria}"${dis ? ' disabled' : ''}>${txt}</button>`;
    return `<div class="calhead">${nav('calprev', key <= first, '‹', 'Mois précédent')}<h3>${MONTHS[m0]} ${y}</h3>${nav('calnext', key >= last, '›', 'Mois suivant')}${key === monthKey(today) ? '' : '<button type="button" class="mini" data-act="caltoday">Aujourd\'hui</button>'}</div>
      <div class="calgrid" role="group" aria-label="Calendrier de ${MONTHS[m0]} ${y}">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(w => `<div class="cw" aria-hidden="true">${w}</div>`).join('')}${cells.join('')}</div>
      <p class="hint" style="margin:10px 0 0">Touchez un jour pour voir son rapport : qui a versé et qui n'a pas versé.</p>
      <p class="calkey"><span><i class="tk">✓</i>Tour entièrement payé</span><span><i class="k cur"></i>Tour en cours</span><span><i class="k r0"></i>Tours à venir</span><span><i class="k served"></i>Remise faite</span><span><b class="cb">T2</b>Jour de remise</span></p>`;
  }
  function viewCal(D) {
    const c = S.cfg, me = myRow();
    if (!D.n) return '<section class="panel"><h2>Calendrier des tours</h2><p class="empty">Le calendrier apparaîtra quand les membres seront ajoutés.</p></section>';
    const next = [], allRows = paymentRows();
    for (let r = D.cur; r < D.n && next.length < 3; r++) next.push(r);
    const nextCards = next.length ? `<div class="nextrounds"><h3>${D.cur < D.n ? 'Prochains tours' : ''}</h3>${next.map(r => {
      const m = S.members[r], end = roundEnd(c, r), cur = r === D.cur;
      return `<div class="nr${cur ? ' cur' : ''}${me && m.id === me.id ? ' is-me' : ''}"><div class="nrn num">T${r + 1}</div><div class="grow"><div class="name">${esc(m.name)}${me && m.id === me.id ? ' (vous)' : ''}</div><div class="sub">Du <b>${esc(fmtShort(roundStart(c, r)))}</b> au <b>${esc(fmtShort(end))}</b> · remise ${esc(rel(end))}${roundDone(c, r, allRows) !== null ? ' · <b class="okline">✓ cagnotte complète</b>' : ''}</div></div><span class="pill ${cur ? 'now' : ''}">${cur ? 'En cours' : 'À venir'}</span></div>`;
    }).join('')}</div>` : '';
    const list = '<ul class="list">' + S.members.map((m, r) => {
      const ov = S.out.get(r), isCur = r === D.cur, amtv = ov ? ov.amount : c.amount * D.n;
      const pill = ov ? '<span class="pill done">Reçu</span>' : isCur ? '<span class="pill now">En cours</span>' : '<span class="pill">À venir</span>';
      return `<li class="row wrap calrow${isCur ? ' cur' : ''}${me && m.id === me.id ? ' is-me' : ''}"><span class="rn num">${r + 1}</span><div class="grow"><div class="name">${memberLink(m)}</div><div class="sub">Du ${esc(fmtShort(roundStart(c, r)))} au ${esc(fmtShort(roundEnd(c, r)))} · ${money(amtv)}</div></div>${pill}${ov && isAdmin() ? `<button class="mini danger${ui.armed === 'unserve:' + m.id ? ' armed' : ''}" data-act="unserve" data-id="${esc(m.id)}">${ui.armed === 'unserve:' + m.id ? 'Confirmer' : 'Annuler la remise'}</button>` : ''}</li>`;
    }).join('') + '</ul>';
    return `<section class="panel calx"><h2>Calendrier des tours</h2>${nextCards}${calGrid(D)}</section><section class="panel" style="margin-top:14px"><h3>Tous les tours</h3>${list}</section>`;
  }

  // ----- live matrix -----
  function viewLive(D) {
    const c = S.cfg;
    if (!D.n) return '<section class="panel"><h2>Évolution en direct</h2><p class="empty">Rien à suivre pour le moment.</p></section>';
    const head = S.members.map((m, r) => `<th class="${r === D.cur ? 'cc' : ''}" title="${esc(m.name)}">${r + 1}</th>`).join('');
    const rows = S.members.map(m => {
      let got = 0;
      const cells = S.members.map((_, r) => {
        const a = paidOf(S.pay.get(r + '_' + m.id)), paid = a >= c.amount, part = !paid && a > 0; if (paid) got++;
        const cls = paid ? 'y' : part && r >= D.cur ? 'p' : r < D.cur ? 'n' : 'w', txt = paid ? '✓' : part ? Math.round(100 * a / c.amount) + '%' : r < D.cur ? '✗' : r === D.cur ? '·' : '';
        return `<td class="${cls}${r === D.cur ? ' cc' : ''}">${txt}</td>`;
      }).join('');
      return `<tr><td>${memberLink(m)}</td>${cells}<td class="num">${got}/${Math.min(D.cur + 1, D.n)}</td></tr>`;
    }).join('');
    const ev = [];
    S.pay.forEach(v => { const n = nameOf(v.member_id); if (!n) return; ev.push({ ts: Date.parse(v.updated_at) || 0, at: v.paid_on, t: v.amount >= c.amount ? `${n} a payé toute sa cotisation du tour ${v.round + 1} (${money(v.amount)})` : `${n} a versé ${money(v.amount)} sur ${money(c.amount)} (tour ${v.round + 1})` }); });
    S.out.forEach(v => { const n = nameOf(v.member_id); if (n) ev.push({ ts: Date.parse(v.created_at) || 0, at: v.paid_on, t: `${n} a reçu la cagnotte (tour ${v.round + 1})` }); });
    ev.sort((a, b) => (b.ts - a.ts) || String(b.at).localeCompare(String(a.at)));
    return `<section class="panel" id="live"><div class="livehead"><span class="dot" aria-hidden="true"></span><h2>Évolution en direct</h2></div>
      <div class="mxwrap"><table class="mx"><thead><tr><th>Membre</th>${head}<th>Payé</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="hint" style="margin-top:8px">Chaque colonne est un tour. ✓ payé en entier, un pourcentage = versement partiel, ✗ non payé, · en attente.</p>
      <div class="feed"><h3>Dernières nouvelles</h3>${ev.length ? '<ul class="list">' + ev.slice(0, 8).map(e => `<li class="row"><div class="grow">${esc(e.t)}</div><span class="sub">${e.at ? esc(fmtShort(e.at)) : ''}</span></li>`).join('') + '</ul>' : '<p class="hint">Rien pour l\'instant.</p>'}</div></section>`;
  }

  // ----- admin -----
  function viewAdmin(D) {
    const c = S.cfg;
    const invite = `<div><h3>Inviter des membres</h3><p class="hint" style="margin:6px 0 10px">Envoyez ce lien : la personne crée son compte et vous demande à rejoindre, vous validez ensuite sa demande.</p>
      <div class="invite-code" aria-label="Code d'invitation">${esc(c.code)}</div>
      <p style="margin:10px 0 0"><a class="lnk" target="_blank" rel="noopener noreferrer" href="${esc(waLink('', "Rejoignez notre tontine « " + c.name + " » sur Elongo : " + inviteLink()))}">Envoyer l'invitation sur WhatsApp</a> <button class="mini" data-act="copylink">Copier le lien</button></p>
      ${c.join_open ? '' : '<p class="hint" style="margin-top:8px">Les inscriptions sont fermées : réactivez-les dans les réglages.</p>'}</div>`;
    const exp = `<div><h3>Export</h3><p class="hint" style="margin:6px 0 10px">Un PDF avec la cagnotte, le calendrier, les cotisations du tour, le récapitulatif par membre, l'historique des versements et le tableau des paiements. Le fichier Excel (CSV) liste tous les versements avec leur date, leur tour et leur moyen de paiement.</p><div class="versrow"><button class="primary" id="pdfBtn" type="button" data-act="exportpdf">Exporter en PDF</button><button id="csvBtn" type="button" data-act="exportcsv">Exporter les versements (Excel)</button></div></div>`;
    const cfg = `<div><h3>Réglages de la tontine</h3><form class="grid" id="cfgForm" style="margin-top:12px">
      <label class="f">Nom du groupe<input data-d="s.name" value="${esc(dv('s.name', c.name))}" required maxlength="60"></label>
      <label class="f">Cotisation par membre<input data-d="s.amount" value="${esc(dv('s.amount', c.amount))}" type="number" min="1" step="any" required></label>
      <label class="f">Monnaie<input data-d="s.cur" value="${esc(dv('s.cur', c.currency))}" maxlength="8" required></label>
      <label class="f">Durée d'un tour (jours)<input data-d="s.days" value="${esc(dv('s.days', c.interval_days))}" type="number" min="1" max="365" step="1" required list="dayChoices"><datalist id="dayChoices"><option value="7"><option value="14"><option value="15"><option value="30"></datalist></label>
      <label class="f">Début du premier tour<input data-d="s.start" value="${esc(dv('s.start', c.start_date))}" type="date" required></label>
      <p class="hint" id="prev-s" style="grid-column:1/-1">${esc(tourPreview(dv('s.start', c.start_date), dv('s.days', c.interval_days), S.members.length))}</p>
      <label class="f">Pénalité de retard (0 = aucune)<input data-d="s.pen" value="${esc(dv('s.pen', c.penalty))}" type="number" min="0" step="any"></label>
      <label class="f">Rappel (jours avant la date)<input data-d="s.rem" value="${esc(dv('s.rem', c.reminder_days))}" type="number" min="0" max="30" step="1"></label>
      <div class="f">Inscriptions<label class="inl"><input type="checkbox" data-d="s.join" ${dv('s.join', c.join_open) ? 'checked' : ''}> Autoriser les demandes</label></div>
      <label class="f">Indicatif pays (WhatsApp)<input data-d="s.cc" value="${esc(dv('s.cc', c.country_code))}" inputmode="numeric" maxlength="4"></label>
      <button class="primary" type="submit">Enregistrer</button></form></div>`;
    const reqs = `<div><h3>Demandes d'inscription</h3><ul class="list" style="margin-top:8px">${S.pending.length ? S.pending.map(r => `<li class="row wrap"><div class="grow"><div class="name">${esc(r.name)}</div><div class="sub">${esc(S.contacts.get(r.id) || 'Sans numéro')}</div></div>
      ${S.members.some(m => !m.user_id) ? `<select class="msel" data-d="l.${esc(r.id)}" aria-label="Relier à un membre déjà dans la liste"><option value="">Nouveau membre</option>${S.members.filter(m => !m.user_id).map(m => `<option value="${esc(m.id)}"${dv('l.' + r.id, '') === m.id ? ' selected' : ''}>C'est : ${esc(m.name)}</option>`).join('')}</select>` : ''}
      <button class="mini primary" data-act="accept" data-id="${esc(r.id)}">Accepter</button><button class="mini danger" data-act="reject" data-id="${esc(r.id)}">Refuser</button></li>`).join('') : '<li class="hint">Aucune demande pour le moment.</li>'}</ul></div>`;
    const mem = `<div><h3>Membres et ordre de passage</h3><p class="hint" style="margin-top:6px">Les membres déjà servis ne peuvent plus être déplacés. Servi par erreur ? Cliquez sur « Pas encore servi ». Chaque membre cotise à chaque tour, y compris le bénéficiaire.</p>
      ${S.members.some(m => !m.user_id) ? `<p class="hint" style="margin-top:6px">Les membres « sans compte » ont été ajoutés à la main. Pour pouvoir en nommer un organisateur, il doit rejoindre la tontine avec le lien d'invitation et créer son compte. Quand vous acceptez sa demande, choisissez « C'est : » suivi de son nom pour relier son compte à sa ligne, au lieu de créer un doublon.</p>` : ''}
      <ul class="list" style="margin-top:8px">${S.members.length ? S.members.map((m, i) => {
        const served = S.out.has(i), ov = S.out.get(i);
        return `<li class="row wrap"><span class="rn num">${i + 1}</span><div class="grow name">${memberLink(m)}${m.is_organizer ? ' <span class="pill ok">Organisateur</span>' : ''}${m.user_id ? '' : ' <span class="sub">(sans compte)</span>'}</div>
          ${isCreator() && m.user_id && m.user_id !== S.user.id ? `<button class="mini${ui.armed === 'orga:' + m.id ? ' armed' : ''}" data-act="orga" data-id="${esc(m.id)}">${ui.armed === 'orga:' + m.id ? 'Confirmer' : m.is_organizer ? "Retirer l'organisateur" : 'Nommer organisateur'}</button>` : ''}
          <input class="ph" data-phone="${esc(m.id)}" value="${esc(S.contacts.get(m.id) || '')}" inputmode="tel" placeholder="Téléphone" aria-label="Téléphone de ${esc(m.name)}">
          ${served ? `<span class="pill done">Servi${ov && ov.paid_on ? ' le ' + esc(fmtShort(ov.paid_on)) : ''}</span><button class="mini danger${ui.armed === 'unserve:' + m.id ? ' armed' : ''}" data-act="unserve" data-id="${esc(m.id)}">${ui.armed === 'unserve:' + m.id ? 'Confirmer' : 'Pas encore servi'}</button>` : `<button class="mini" data-act="up" data-id="${esc(m.id)}" aria-label="Monter ${esc(m.name)}"${i <= D.cur || S.out.has(i - 1) ? ' disabled' : ''}>↑</button>
          <button class="mini" data-act="down" data-id="${esc(m.id)}" aria-label="Descendre ${esc(m.name)}"${i >= D.n - 1 || S.out.has(i + 1) ? ' disabled' : ''}>↓</button>
          <button class="mini danger${ui.armed === 'rm:' + m.id ? ' armed' : ''}" data-act="rm" data-id="${esc(m.id)}">${ui.armed === 'rm:' + m.id ? 'Confirmer' : 'Retirer'}</button>`}</li>`;
      }).join('') : '<li class="hint">Aucun membre. Ajoutez le premier ci-dessous.</li>'}</ul>
      <form class="addrow" id="addForm"><input data-d="a.name" value="${esc(dv('a.name', ''))}" maxlength="40" placeholder="Nom du nouveau membre" aria-label="Nom du nouveau membre" required>
      <input data-d="a.phone" value="${esc(dv('a.phone', ''))}" class="ph" inputmode="tel" placeholder="Téléphone (facultatif)" aria-label="Téléphone du nouveau membre"><button class="primary" type="submit">Ajouter</button></form></div>`;
    return `<section class="panel"><h2>Espace organisateur</h2><div class="adm">${invite}${reqs}${mem}${cfg}${exp}</div></section>`;
  }

  // ---------- Group chat ----------
  const EXT = { m4a: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', webm: 'audio/webm', pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  function allTopics() {
    const m = new Map([['general', { id: 'general', title: 'Général', author_id: null }]]);
    S.topics.forEach(t => m.set(t.id, t)); return m;
  }
  const seenKey = () => 'lisanga.seen.' + S.user.id + '.' + S.tid;
  function seenLoad() {
    if (ui.seen) return ui.seen;
    let v = null; try { v = JSON.parse(store.get(seenKey())); } catch (e) {}
    ui.seen = v && typeof v === 'object' ? v : { base: 0, t: {} }; if (!ui.seen.t) ui.seen.t = {};
    if (!ui.seen.base) { ui.seen.base = S.msgs.length ? S.msgs[S.msgs.length - 1].ts : Date.now(); store.set(seenKey(), JSON.stringify(ui.seen)); }
    return ui.seen;
  }
  const seenFor = tp => { const s = seenLoad(); return Math.max(s.base || 0, s.t[tp] || 0); };
  const unreadOf = tp => S.msgs.filter(m => m.tp === tp && m.author_id !== S.user.id && m.ts > seenFor(tp)).length;
  function totalUnread() { if (!S.tid || !S.user) return 0; seenLoad(); let n = 0; allTopics().forEach((_, id) => { n += unreadOf(id); }); return n; }
  const chatSkeleton = () => `<section class="panel chat-panel"><div class="livehead"><span class="dot" aria-hidden="true"></span><h2>Discussion du groupe</h2></div>
    <div id="topicBar" class="topics"></div>
    <form id="topicForm" class="addrow" style="margin:0"><input id="topicIn" list="topicNames" maxlength="50" autocomplete="off" placeholder="Nouveau sujet (ex. Jean, Retard de mars)" aria-label="Titre du nouveau sujet"><datalist id="topicNames"></datalist><button type="submit">Créer le sujet</button></form>
    <div id="topicHead" class="topichead"></div>
    <div id="chatlog" class="chatlog" role="log" aria-live="polite" tabindex="0"></div>
    <div id="pendingBox" class="pendbox" hidden></div>
    <form id="chatForm" class="addrow" style="margin:0"><input id="chatIn" maxlength="1000" autocomplete="off" placeholder="Écrire un message" aria-label="Votre message" style="min-width:12rem">
      <button type="button" class="mini" data-act="pickfile">Joindre</button><button type="button" class="mini" id="recBtn" data-act="voice">Vocal</button><button class="primary" type="submit" id="chatSend">Envoyer</button></form>
    <input id="fileIn" type="file" accept="image/*,audio/*,application/pdf" hidden><input id="voiceIn" type="file" accept="audio/*" capture hidden>
    <p class="hint" id="chatNote" hidden></p>
    <p class="hint">Photos, vocaux et PDF jusqu'à ${fmtSize(B.maxFile)}. Le bouton Vocal enregistre avec le micro de votre appareil.</p></section>`;
  function msgHtml(m) {
    const mine = m.author_id === S.user.id, a = m.att;
    let att = '';
    if (a) {
      const v = ui.att.get(a.path);
      const body = v ? (a.kind === 'image' ? `<img class="aimg" src="${v.url}" alt="${esc(a.name)}">` : a.kind === 'audio' ? `<audio controls src="${v.url}"></audio>` : `<a class="lnk" href="${v.url}" download="${esc(a.name)}">Enregistrer le document</a>`)
        : `<button type="button" class="mini" data-act="showatt" data-mid="${esc(m.id)}">${a.kind === 'audio' ? 'Écouter le vocal' : a.kind === 'image' ? 'Afficher la photo' : 'Ouvrir le document'} (${esc(fmtSize(a.size))})</button>`;
      att = `<div class="att"><span class="sub">${esc(a.name)}</span><br>${body}</div>`;
    }
    return `<div class="msg${mine ? ' me' : ''}"><b>${esc(m.author_name)}</b><span class="ts">${esc(fmtTime(m.ts))}</span>${m.body ? `<div class="t">${esc(m.body)}</div>` : ''}${att}${mine || isAdmin() ? `<button class="link" data-act="delmsg" data-mid="${esc(m.id)}">Supprimer</button>` : ''}</div>`;
  }
  function renderPending() {
    const b = $('pendingBox'); if (!b) return; const p = ui.pending; b.hidden = !p;
    if (p) b.innerHTML = `<span>Pièce jointe : ${esc(p.name)} (${esc(fmtSize(p.size))})</span><button type="button" class="mini" data-act="rmpending">Retirer</button>`;
  }
  function renderChatParts() {
    const topics = allTopics(); if (!topics.has(ui.topic)) ui.topic = 'general';
    const sn = seenLoad(), cur = topics.get(ui.topic), inCur = S.msgs.filter(m => m.tp === ui.topic);
    if (inCur.length) { const last = inCur[inCur.length - 1].ts; if ((sn.t[ui.topic] || 0) < last) { sn.t[ui.topic] = last; store.set(seenKey(), JSON.stringify(sn)); } }
    const act = id => S.msgs.reduce((x, m) => m.tp === id ? Math.max(x, m.ts) : x, 0);
    const list = [...topics.values()].sort((a, b) => a.id === 'general' ? -1 : b.id === 'general' ? 1 : (act(b.id) || Date.parse(b.created_at)) - (act(a.id) || Date.parse(a.created_at)));
    $('topicBar').innerHTML = list.map(t => { const u = unreadOf(t.id); return `<button type="button" class="chip${t.id === ui.topic ? ' on' : ''}${t.closed ? ' closed' : ''}" data-act="topic" data-id="${esc(t.id)}" aria-pressed="${t.id === ui.topic}">${esc(t.title)}${u ? ` <span class="pill now">${u}</span>` : ''}</button>`; }).join('');
    $('topicNames').innerHTML = S.members.map(m => `<option value="${esc(m.name)}">`).join('');
    const canClose = cur.id !== 'general' && (cur.author_id === S.user.id || isAdmin());
    $('topicHead').innerHTML = `<h3>${esc(cur.title)}</h3><span class="sub">${cur.id === 'general' ? 'Discussion libre pour tout le groupe' : 'Sujet ouvert par ' + esc(cur.author_name) + (cur.closed ? ', clos' : '')}</span>${canClose ? `<button type="button" class="mini" data-act="closetopic" data-id="${esc(cur.id)}">${cur.closed ? 'Rouvrir le sujet' : 'Clore le sujet'}</button>` : ''}`;
    const log = $('chatlog'), keep = log.scrollTop, near = log.scrollHeight - log.scrollTop - log.clientHeight < 60, first = !log.dataset.drawn || log.dataset.topic !== ui.topic;
    const shown = inCur.slice(-100);
    log.innerHTML = shown.length ? shown.map(msgHtml).join('') : '<p class="hint" style="margin:8px">Aucun message dans ce sujet. Écrivez le premier !</p>';
    log.dataset.drawn = '1'; log.dataset.topic = ui.topic;
    log.scrollTop = first || near ? log.scrollHeight : keep;
    const can = canChat(), open = !cur.closed;
    $('chatForm').hidden = !(can && open); $('topicForm').hidden = !can;
    $('chatNote').hidden = can && open;
    $('chatNote').textContent = !can ? 'Rejoignez la tontine pour participer à la discussion.' : 'Ce sujet est clos. Rouvrez-le pour y écrire.';
    renderPending(); updateRecBtn();
    chrome();
  }
  // Images are shrunk before upload; every attachment must end up under the size limit.
  async function shrinkImage(file) {
    const bmp = await createImageBitmap(file);
    for (const [side, q] of [[1280, .72], [1000, .55], [720, .5]]) {
      const k = Math.min(1, side / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', q));
      if (blob && blob.size <= B.maxFile) return blob;
    }
    throw { msg: 'Image trop lourde, même réduite.' };
  }
  async function attach(file) {
    try {
      let type = file.type || EXT[(file.name.split('.').pop() || '').toLowerCase()] || '';
      const kind = type.startsWith('image/') ? 'image' : type.startsWith('audio/') ? 'audio' : type === 'application/pdf' ? 'file' : '';
      if (!kind) throw { msg: 'Type non pris en charge. Choisissez une image, un audio ou un PDF.' };
      let blob = file, name = file.name;
      if (kind === 'image' && type !== 'image/gif') { blob = await shrinkImage(file); type = 'image/jpeg'; name = name.replace(/\.[^.]+$/, '') + '.jpg'; }
      if (blob.size > B.maxFile) throw { msg: 'Fichier trop lourd. Maximum ' + fmtSize(B.maxFile) + '.' };
      ui.pending = { blob, type, size: blob.size, name, kind }; renderPending();
    } catch (e) { toast(e && e.msg ? e.msg : 'Ce fichier ne peut pas être joint (format non lisible).'); }
  }
  function updateRecBtn() { const b = $('recBtn'); if (b) { b.textContent = ui.rec ? 'Arrêter ●' : 'Vocal'; b.classList.toggle('rec', !!ui.rec); } }
  async function toggleRec() {
    if (ui.rec) { ui.rec.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { $('voiceIn').click(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), mr = new MediaRecorder(stream), chunks = [];
      mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop()); clearTimeout(ui.recT); ui.rec = null; updateRecBtn();
        const type = (mr.mimeType || 'audio/webm').split(';')[0], ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm', d = new Date();
        if (chunks.length) attach(new File(chunks, 'vocal-' + pad(d.getHours()) + 'h' + pad(d.getMinutes()) + '.' + ext, { type }));
      };
      mr.start(); ui.rec = mr; ui.recT = setTimeout(() => { if (mr.state === 'recording') mr.stop(); }, 180000); updateRecBtn();
    } catch (e) { toast("Micro indisponible : choisissez un fichier audio."); $('voiceIn').click(); }
  }
  async function loadAtt(a) {
    if (ui.att.has(a.path)) return ui.att.get(a.path);
    const blob = await B.getFile(a.path), v = { url: URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: a.type })), blob };
    ui.att.set(a.path, v); return v;
  }

  // ---------- PDF export ----------
  // jsPDF's built-in font has no narrow no-break space, so numbers are rewritten with plain spaces.
  const pdfNum = n => num(n).replace(/[  ]/g, ' ');
  function exportPdf() {
    const c = S.cfg, D = derive();
    if (!c || !D.n) { toast('Rien à exporter pour le moment.'); return; }
    if (!(window.jspdf && window.jspdf.jsPDF)) { toast("Le module PDF ne s'est pas chargé. Rechargez la page."); return; }
    const m$ = n => pdfNum(n) + ' ' + c.currency, doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' }), teal = [19, 37, 91], M = { left: 40, right: 40 };
    let y = 50;
    doc.setFontSize(20); doc.text(c.name, 40, y); doc.setFontSize(10); y += 18;
    doc.text(`Cotisation ${m$(c.amount)} par membre, ${freqText(c)}. ${D.n} membres. Édité le ${fmtShort(todayISO())}.`, 40, y);
    const section = (title, opts) => {
      y = (doc.lastAutoTable ? doc.lastAutoTable.finalY : y) + 26;
      if (y > 760) { doc.addPage(); y = 50; }
      doc.setFontSize(13); doc.text(title, 40, y);
      doc.autoTable(Object.assign({ startY: y + 8, margin: M, styles: { fontSize: 9 }, headStyles: { fillColor: teal } }, opts));
    };
    const open = D.cur < D.n;
    if (open) {
      const pot = c.amount * D.n, got = D.got; let due = 0, settled = 0;
      S.members.forEach(m => { const r = S.pay.get(D.cur + '_' + m.id), p = penOf(c, D, m); if (p) { due += p; if (r && r.penalty_paid) settled += p; } });
      section(`Cagnotte du tour ${D.cur + 1} - ${D.benef.name}`, { head: [['Élément', 'Montant']], body: [
        ['Cagnotte attendue', m$(pot)], ['Déjà encaissé (' + D.paidIds.size + ' cotisations complètes sur ' + D.n + ')', m$(got)], ['Reste à encaisser', m$(pot - got)],
        ['Fin du tour', fmtDate(roundEnd(c, D.cur))], ...(c.penalty ? [['Pénalités dues', m$(due)], ['Pénalités réglées', m$(settled)]] : [])] });
    }
    section('Calendrier des tours', { head: [['Tour', 'Début', 'Fin', 'Bénéficiaire', 'Cagnotte', 'Statut']], body: S.members.map((m, r) => {
      const ov = S.out.get(r);
      return [r + 1, fmtShort(roundStart(c, r)), fmtShort(roundEnd(c, r)), m.name, m$(ov ? ov.amount : c.amount * D.n), ov ? 'Reçu le ' + fmtShort(ov.paid_on) : r === D.cur ? 'En cours' : 'À venir'];
    }) });
    if (open) section(`Cotisations du tour ${D.cur + 1}`, { head: [['Membre', 'Versé', 'Reste', 'Statut', 'Dernier versement', 'Moyen', 'Pénalité']], body: S.members.map(m => {
      const r = S.pay.get(D.cur + '_' + m.id), p = penOf(c, D, m), a = D.amt.get(m.id) || 0;
      return [m.name, m$(a), m$(Math.max(0, c.amount - a)), a >= c.amount ? 'Complet' : a > 0 ? 'Partiel' : 'Non payé', r && r.paid_on ? fmtShort(r.paid_on) : '-', r && r.log && r.log.length && r.log[r.log.length - 1].m ? methodName(r.log[r.log.length - 1].m) : '-', p ? m$(p) + (r && r.penalty_paid ? ' (réglée)' : '') : '-'];
    }) });
    const hist = paymentRows();
    if (hist.length) {
      const per = new Map(S.members.map(m => [m.id, { n: 0, sum: 0, by: new Map() }]));
      hist.forEach(r => { const o = per.get(r.id); if (!o) return; o.n++; o.sum += r.a; o.by.set(r.m, (o.by.get(r.m) || 0) + 1); });
      section('Récapitulatif par membre', { head: [['Membre', 'Versements', 'Total versé', 'Moyens de paiement']], body: S.members.map(m => { const o = per.get(m.id); return [m.name, o.n, m$(o.sum), o.n ? [...o.by].map(([k, n]) => methodName(k) + ' (' + n + ')').join(', ') : '-']; }) });
      section('Historique des versements', { head: [['Date', 'Tour', 'Membre', 'Montant', 'Moyen']], body: hist.map(r => [r.at ? fmtShort(r.at) : '-', r.round + 1, r.name, m$(r.a), methodName(r.m)]) });
    }
    section('Paiements par tour', { head: [['Membre', ...S.members.map((_, r) => String(r + 1))]], styles: { fontSize: 8, halign: 'center' }, columnStyles: { 0: { halign: 'left' } },
      body: S.members.map(m => [m.name, ...S.members.map((_, r) => { const a = paidOf(S.pay.get(r + '_' + m.id)); return a >= c.amount ? 'Payé' : a > 0 ? Math.round(100 * a / c.amount) + '%' : r < D.cur ? 'Non' : ''; })]) });
    const slug = c.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'tontine';
    doc.save('tontine-' + slug + '.pdf'); toast('PDF enregistré.');
  }

  // ----- every versement of the tontine, oldest first (PDF history and CSV export) -----
  function paymentRows() {
    const rows = [];
    S.pay.forEach(rec => {
      const m = S.allMembers.find(x => x.id === rec.member_id); if (!m) return;
      (Array.isArray(rec.log) && rec.log.length ? rec.log : [{ a: rec.amount, at: rec.paid_on }]).forEach(x => rows.push({ round: rec.round, name: m.name, id: m.id, a: Number(x.a), at: String(x.at || ''), m: x.m || '' }));
    });
    return rows.sort((a, b) => a.at.localeCompare(b.at) || a.round - b.round);
  }
  function exportCsv() {
    const c = S.cfg, rows = paymentRows();
    if (!c || !rows.length) { toast('Aucun versement à exporter.'); return; }
    const cell = v => { const s = String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };   // ';' separator and BOM: opens correctly in French Excel
    const lines = [['Date', 'Tour', 'Membre', 'Montant (' + c.currency + ')', 'Moyen de paiement'], ...rows.map(r => [r.at, r.round + 1, r.name, r.a, methodName(r.m)])].map(l => l.map(cell).join(';'));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'versements-' + todayISO() + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('Fichier des versements enregistré.');
  }

  // ----- member detail: number of payments, money paid, how it was sent -----
  function memberStats(id) {
    const rows = []; let total = 0;
    S.pay.forEach(rec => {
      if (rec.member_id !== id) return;
      total += rec.amount;
      (Array.isArray(rec.log) && rec.log.length ? rec.log : [{ a: rec.amount, at: rec.paid_on }]).forEach(x => rows.push({ round: rec.round, a: Number(x.a), at: x.at, m: x.m || '' }));
    });
    rows.sort((a, b) => String(b.at).localeCompare(String(a.at)) || b.round - a.round);
    const by = new Map();
    rows.forEach(r => { const o = by.get(r.m) || { n: 0, sum: 0 }; o.n++; o.sum += r.a; by.set(r.m, o); });
    return { rows, total, by };
  }
  function memberDialog(id) {
    const m = S.allMembers.find(x => x.id === id); if (!m || !S.cfg) return;
    const st = memberStats(id), idx = S.members.findIndex(x => x.id === id), D = derive(), n = st.rows.length;
    const where = idx < 0 ? '' : S.out.has(idx) ? `A reçu la cagnotte (tour ${idx + 1}).` : `Passe au tour ${idx + 1} sur ${D.n}.`;
    $('modalBody').innerHTML = `<h2>${esc(m.name)}</h2><p class="sub">${esc(where)}</p>
      <div class="statgrid"><div><div class="big num">${n}</div><div class="sub">versement${n > 1 ? 's' : ''}</div></div><div><div class="big num">${money(st.total)}</div><div class="sub">versé en tout</div></div></div>
      <h3>Moyens de paiement</h3>${n ? '<ul class="list">' + [...st.by].map(([k, o]) => `<li class="row"><div class="grow name">${esc(methodName(k))}</div><div class="sub num">${o.n} fois · ${money(o.sum)}</div></li>`).join('') + '</ul>' : '<p class="hint">Aucun versement pour l\'instant.</p>'}
      ${n ? '<h3 style="margin-top:14px">Détail des versements</h3><ul class="list">' + st.rows.map(r => `<li class="row"><div class="grow"><div class="name num">${money(r.a)}</div><div class="sub">${esc(r.at ? fmtShort(r.at) : '')} · Tour ${r.round + 1} · ${esc(methodName(r.m))}</div></div></li>`).join('') + '</ul>' : ''}
      <div class="dlg-actions"><button data-m="close">Fermer</button></div>`;
    $('modal').showModal();
  }

  // ---------- Actions ----------
  const eqPay = (round, member_id) => ({ tontine_id: S.tid, round, member_id });
  document.addEventListener('click', async ev => {
    const b = ev.target.closest('button[data-act]'); if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    try {
      if (act === 'authmode') { ui.authMode = b.dataset.mode; render(); return; }
      if (act === 'back') { go('#/tour'); return; }
      if (act === 'calprev' || act === 'calnext') { ui.calMonth = shiftMonth(ui.calMonth || monthKey(todayISO()), act === 'calnext' ? 1 : -1); render(); return; }
      if (act === 'caltoday') { ui.calMonth = ''; render(); return; }
      if (act === 'calday') { dayDialog(b.dataset.date); return; }
      if (act === 'topic') { ui.topic = id; renderChatParts(); return; }
      if (act === 'pickfile') { $('fileIn').click(); return; }
      if (act === 'member') { memberDialog(id); return; }
      if (act === 'pushon') { await enablePush(); return; }
      if (act === 'pushlater') { store.set('lisanga.pushlater', '1'); render(); return; }
      if (act === 'voice') { toggleRec(); return; }
      if (act === 'rmpending') { ui.pending = null; renderPending(); return; }
      if (act === 'exportpdf') { exportPdf(); return; }
      if (act === 'exportcsv') { exportCsv(); return; }
      if (act === 'cancelreq') { const r = myRow(); if (r) await B.remove('members', { id: r.id }); await bootstrap(); go('#/accueil'); return; }
      const D = derive();
      if (act === 'delmsg') {
        const m = S.msgs.find(x => x.id === b.dataset.mid); if (!m) return;
        await B.remove('messages', { id: m.id }); if (m.att) await B.removeFiles([m.att.path]).catch(() => {});
        await loadTable('messages');
      } else if (act === 'closetopic') {
        const t = S.topics.find(x => x.id === id); if (!t) return;
        await B.update('topics', { closed: !t.closed }, { id }); await loadTable('topics');
      } else if (act === 'showatt') {
        const m = S.msgs.find(x => x.id === b.dataset.mid); if (!m || !m.att) return;
        toast('Chargement…'); await loadAtt(m.att);
      } else if (act === 'accept') {
        const r = S.pending.find(x => x.id === id); if (!r) return;
        const lsel = document.querySelector('select[data-d="l.' + id + '"]'), target = lsel ? S.members.find(m => m.id === lsel.value && !m.user_id) : null;
        if (target) {   // the person is already in the list (added by hand): give that line the new account, keep its place and payments
          const phone = S.contacts.get(id);
          await B.remove('members', { id }); await B.update('members', { user_id: r.user_id }, { id: target.id });
          if (phone && !S.contacts.get(target.id)) await B.upsert('contacts', { member_id: target.id, tontine_id: S.tid, phone }, 'member_id');
          delete ui.draft['l.' + id]; await loadTable('members'); await loadTable('contacts');
          toast(target.name + ' est maintenant relié à son compte.'); return;
        }
        await B.update('members', { status: 'active', position: S.members.reduce((x, m) => Math.max(x, m.position), 0) + 1 }, { id });
        await loadTable('members'); toast(r.name + " a été ajouté à la fin de l'ordre de passage.");
      } else if (act === 'orga') {
        const m = S.members.find(x => x.id === id); if (!m || !isCreator()) return;
        if (ui.armed !== 'orga:' + id) { ui.armed = 'orga:' + id; render(); return; }
        ui.armed = ''; await B.update('members', { is_organizer: !m.is_organizer }, { id }); await loadTable('members');
        toast(m.is_organizer ? m.name + ' est maintenant organisateur.' : m.name + " n'est plus organisateur.");
      } else if (act === 'reject') { await B.remove('members', { id }); await loadTable('members');
      } else if (act === 'copy') {
        ui.copyText = reminderText(S.cfg, D);
        try { await navigator.clipboard.writeText(ui.copyText); toast('Rappel copié. Collez-le dans votre groupe.'); ui.copyText = ''; }
        catch (e) { toast('Copie automatique impossible. Copiez le texte affiché.'); }
      } else if (act === 'copylink') {
        try { await navigator.clipboard.writeText(inviteLink()); toast("Lien d'invitation copié."); } catch (e) { toast(inviteLink()); }
      } else if (act === 'pen') {
        ui.armed = ''; const rec = S.pay.get(D.cur + '_' + id);
        if (rec) { await B.update('payments', { penalty_paid: !rec.penalty_paid }, eqPay(D.cur, id)); await loadTable('payments'); }
      } else if (act === 'vers') {
        ui.armed = ''; const c = S.cfg, rec = S.pay.get(D.cur + '_' + id), have = paidOf(rec), inp = document.querySelector('input[data-d="v.' + id + '"]'), v = Number(inp ? inp.value : c.amount - have);
        if (!(v > 0)) { toast('Entrez un montant supérieur à 0.'); return; }
        const msel = document.querySelector('select[data-d="m.' + id + '"]'), method = msel ? msel.value : '';
        if (!METHODS[method]) { toast("Choisissez comment l'argent a été envoyé : M-Pesa, Orange Money, Airtel Money, Illico ou cash."); return; }
        store.set('lisanga.lastmethod', method);
        const add = Math.min(v, c.amount - have); if (add <= 0) { toast('Cette cotisation est déjà complète.'); return; }
        const total = have + add, today = todayISO();
        await B.upsert('payments', Object.assign(eqPay(D.cur, id), { amount: total, paid_on: today, done_on: total >= c.amount ? today : null, log: ((rec && rec.log) || []).slice(-19).concat([{ a: add, at: today, m: method }]), penalty_paid: !!(rec && rec.penalty_paid) }), 'tontine_id,round,member_id');
        notify({ kind: 'payment', tontine_id: S.tid, round: D.cur, member_id: id });
        delete ui.draft['v.' + id]; await loadTable('payments');
        toast(total >= c.amount ? 'Cotisation complète : ' + money(total) + '.' : 'Versement de ' + money(add) + ' enregistré, reste ' + money(c.amount - total) + '.');
      } else if (act === 'unvers') {
        ui.armed = ''; const rec = S.pay.get(D.cur + '_' + id); if (!rec) return;
        const log = (rec.log || []).slice(0, -1);
        if (!log.length) await B.remove('payments', eqPay(D.cur, id));
        else await B.upsert('payments', Object.assign(eqPay(D.cur, id), { amount: log.reduce((t, x) => t + x.a, 0), paid_on: log[log.length - 1].at, done_on: null, log, penalty_paid: rec.penalty_paid }), 'tontine_id,round,member_id');
        delete ui.draft['v.' + id]; await loadTable('payments'); toast('Dernier versement annulé.');
      } else if (act === 'payout') {
        if (ui.armed !== 'payout') { ui.armed = 'payout'; render(); return; }
        ui.armed = ''; await B.upsert('payouts', { tontine_id: S.tid, round: D.cur, member_id: D.benef.id, amount: D.got, paid_on: todayISO() }, 'tontine_id,round');
        notify({ kind: 'payout', tontine_id: S.tid, round: D.cur });
        await loadTable('payouts'); toast('Cagnotte remise à ' + D.benef.name + '.');
      } else if (act === 'undo') {
        if (D.cur < 1) return;
        if (ui.armed !== 'undo') { ui.armed = 'undo'; render(); return; }
        const who = S.members[D.cur - 1];
        ui.armed = ''; await B.remove('payouts', { tontine_id: S.tid, round: D.cur - 1 }); await loadTable('payouts'); toast('La remise à ' + (who ? who.name : 'ce membre') + ' est annulée : son tour est de nouveau en cours.');
      } else if (act === 'unserve') {
        const i = S.members.findIndex(m => m.id === id); if (i < 0 || !S.out.has(i)) return;
        if (ui.armed !== 'unserve:' + id) { ui.armed = 'unserve:' + id; render(); return; }
        ui.armed = ''; await B.remove('payouts', { tontine_id: S.tid, round: i }); await loadTable('payouts');
        toast('La remise à ' + S.members[i].name + ' est annulée : il n\'est plus marqué comme servi.');
      } else if (act === 'up' || act === 'down') {
        ui.armed = ''; const i = S.members.findIndex(m => m.id === id), j = act === 'up' ? i - 1 : i + 1;
        if (j < D.cur || j < 0 || j >= D.n || S.out.has(i) || S.out.has(j)) return;
        const a = S.members[i], o = S.members[j], pa = a.position === o.position ? a.position + 1 : a.position;
        await B.update('members', { position: o.position }, { id: a.id }); await B.update('members', { position: pa }, { id: o.id });
        if (a.position === o.position) await B.update('members', { position: o.position }, { id: a.id });
        await loadTable('members');
      } else if (act === 'rm') {
        if (ui.armed !== 'rm:' + id) { ui.armed = 'rm:' + id; render(); return; }
        ui.armed = ''; await B.remove('members', { id }); await loadTable('members'); await loadTable('payments');
      }
    } catch (e) { toast(friendly(e)); }
    render();
  });

  // Read form values from the DOM (autofill may not fire input events).
  const fv = f => { const o = {}; f.querySelectorAll('[data-d]').forEach(i => { o[i.dataset.d] = i.type === 'checkbox' ? i.checked : i.value; }); return o; };
  const clearDraft = prefix => Object.keys(ui.draft).forEach(k => { if (k.startsWith(prefix)) delete ui.draft[k]; });
  async function pickAfterJoin(tid) {
    await loadTontines(); S.tid = tid; S.cfg = S.tontines.find(t => t.id === tid) || null;
    if (!S.cfg) pickTontine(); await openTontine(); try { sessionStorage.removeItem('lisanga.code'); } catch (e) {}
    go(isAdmin() ? '#/organisateur' : '#/tour');
  }
  document.addEventListener('submit', async ev => {
    const f = ev.target; ev.preventDefault();
    try {
      if (f.id === 'authForm') {
        const email = f.email.value.trim(), password = f.password.value, err = $('authErr'); err.textContent = '';
        const btn = f.querySelector('button.primary'), label = btn.textContent, slow = setTimeout(() => { err.textContent = 'La connexion est lente, patientez un instant…'; }, 6000);
        if (btn.disabled) return;
        btn.disabled = true; btn.textContent = label.startsWith('Créer') ? 'Création…' : 'Connexion…';
        try {
          if (label.startsWith('Créer')) { const r = await B.signUp(email, password); if (r.needsConfirm) { err.textContent = 'Compte créé. Confirmez votre e-mail (lien reçu par message), puis connectez-vous.'; ui.authMode = 'in'; } }
          else await B.signIn(email, password);
        } catch (e) { err.textContent = friendly(e) + (/Invalid login credentials/i.test(String(e && e.message)) ? " Pas encore de compte ? Appuyez sur « Créer un compte », en haut." : ''); } finally { clearTimeout(slow); if (btn.isConnected) { btn.disabled = false; btn.textContent = label; } }
      } else if (f.id === 'createForm') {
        const v = fv(f), cfg = { name: v['c.name'].trim(), amount: Number(v['c.amount']), currency: (v['c.cur'] || 'FC').trim(), interval_days: Math.min(365, Math.max(1, Math.round(Number(v['c.days'])) || 30)), start_date: v['c.start'] || todayISO(), penalty: 0, reminder_days: 3, country_code: '243', join_open: true };
        const me = (v['c.me'] || '').trim();
        if (!cfg.name || !(cfg.amount > 0) || !me) { toast('Remplissez le nom du groupe, la cotisation et votre nom.'); return; }
        const [t] = await B.insert('tontines', cfg);
        if (v['c.part']) await B.insert('members', { tontine_id: t.id, user_id: S.user.id, name: me.slice(0, 40), position: 1, status: 'active' });
        clearDraft('c.'); await pickAfterJoin(t.id); toast('Tontine créée. Invitez maintenant les membres.');
      } else if (f.id === 'joinCodeForm') {
        const v = fv(f), code = (v['j.code'] || S.arg || '').trim(), name = (v['j.name'] || '').trim(); if (!code || !name) return;
        await B.rpc('join_tontine', { p_code: code, p_name: name, p_phone: (v['j.phone'] || '').trim() });
        await loadTontines(); const t = S.tontines.find(x => x.code === code.toLowerCase()) || S.tontines[S.tontines.length - 1];
        clearDraft('j.'); await pickAfterJoin(t.id); toast('Demande envoyée.');
      } else if (f.id === 'addForm') {
        const v = fv(f), name = (v['a.name'] || '').trim(), phone = (v['a.phone'] || '').trim(); if (!name) return;
        const [m] = await B.insert('members', { tontine_id: S.tid, name, position: S.members.reduce((x, k) => Math.max(x, k.position), 0) + 1, status: 'active' });
        if (phone) await B.upsert('contacts', { member_id: m.id, tontine_id: S.tid, phone: phone.slice(0, 30) }, 'member_id');
        clearDraft('a.'); await Promise.all([loadTable('members'), loadTable('contacts')]); render();
        const n = $('addForm') && $('addForm').querySelector('input'); if (n) n.focus();
      } else if (f.id === 'cfgForm') {
        const v = fv(f), g = k => v['s.' + k], c = S.cfg;
        const patch = { name: String(g('name')).trim(), amount: Number(g('amount')), currency: String(g('cur')).trim(), interval_days: Math.min(365, Math.max(1, Math.round(Number(g('days'))) || 30)), start_date: g('start'), penalty: Math.max(0, Number(g('pen')) || 0), reminder_days: Math.min(30, Math.max(0, Math.round(Number(g('rem'))) || 0)), country_code: String(g('cc')).replace(/\D/g, '') || '243', join_open: !!g('join') };
        if (!patch.name || !(patch.amount > 0) || !patch.start_date) return;
        await B.update('tontines', patch, { id: S.tid }); clearDraft('s.'); await loadTable('tontines'); render(); toast('Réglages enregistrés.');
      } else if (f.id === 'topicForm') {
        const title = $('topicIn').value.trim().slice(0, 50), n = chatName(); if (!title || !n) return;
        const ex = [...allTopics().values()].find(t => t.title.toLowerCase() === title.toLowerCase());
        if (ex) { ui.topic = ex.id; $('topicIn').value = ''; renderChatParts(); return; }
        const [t] = await B.insert('topics', { tontine_id: S.tid, title, author_name: n });
        await loadTable('topics'); ui.topic = t.id; $('topicIn').value = ''; renderChatParts(); $('chatIn').focus();
      } else if (f.id === 'chatForm') {
        const text = $('chatIn').value.trim(), n = chatName(), pend = ui.pending;
        if ((!text && !pend) || !n || ui.chatBusy) return;
        const cur = allTopics().get(ui.topic); if (cur && cur.closed) { toast('Ce sujet est clos.'); return; }
        ui.chatBusy = true; $('chatSend').disabled = true;
        try {
          let att = null;
          if (pend) {
            toast('Envoi du fichier…');
            const ext = (pend.name.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin', path = S.tid + '/' + S.user.id + '/' + rid() + '.' + ext;
            await B.putFile(path, pend.blob, pend.type); att = { path, name: pend.name, type: pend.type, size: pend.size, kind: pend.kind };
          }
          try { const [row] = await B.insert('messages', { tontine_id: S.tid, topic_id: ui.topic === 'general' ? null : ui.topic, author_name: n, body: text, att }); notify({ kind: 'message', message_id: row.id }); }
          catch (e) { if (att) await B.removeFiles([att.path]).catch(() => {}); throw e; }
          $('chatIn').value = ''; ui.pending = null; await loadTable('messages'); renderChatParts();
        } finally { ui.chatBusy = false; const s = $('chatSend'); if (s) s.disabled = false; const i = $('chatIn'); if (i) i.focus(); }
      }
    } catch (e) { toast(f.id === 'chatForm' && e && e.msg ? e.msg : friendly(e)); }
  });
  document.addEventListener('input', ev => {
    const i = ev.target; if (!i || !i.dataset || !i.dataset.d) return;
    ui.draft[i.dataset.d] = i.type === 'checkbox' ? i.checked : i.value;
    const m = /^([cs])\.(days|start)$/.exec(i.dataset.d), out = m && $('prev-' + m[1]);
    if (out) out.textContent = tourPreview(document.querySelector(`[data-d="${m[1]}.start"]`).value, document.querySelector(`[data-d="${m[1]}.days"]`).value, m[1] === 's' ? S.members.length : 0);
  });
  document.addEventListener('change', async ev => {
    const i = ev.target;
    if (i && (i.id === 'fileIn' || i.id === 'voiceIn')) { const f = i.files[0]; i.value = ''; if (f) attach(f); return; }
    if (i && i.dataset && i.dataset.d && i.type === 'checkbox') ui.draft[i.dataset.d] = i.checked;
    const p = i && i.closest && i.closest('input[data-phone]'); if (!p) return;
    const phone = p.value.trim().slice(0, 30);
    try {
      if (phone) await B.upsert('contacts', { member_id: p.dataset.phone, tontine_id: S.tid, phone }, 'member_id'); else await B.remove('contacts', { member_id: p.dataset.phone });
      await loadTable('contacts'); toast('Numéro enregistré.');
    } catch (e) { toast(friendly(e)); }
  });
  $('userChip').addEventListener('click', () => {
    const m = $('modal'), body = $('modalBody');
    body.innerHTML = `<h2>Mon compte</h2><p class="sub">${esc(S.user.email)}</p>
      ${S.tontines.length > 1 ? '<h3 style="margin-top:12px">Mes tontines</h3><ul class="list">' + S.tontines.map(t => `<li class="row"><div class="grow name">${esc(t.name)}</div>${t.id === S.tid ? '<span class="pill ok">Ouverte</span>' : `<button class="mini" data-m="open" data-id="${esc(t.id)}">Ouvrir</button>`}</li>`).join('') + '</ul>' : ''}
      ${ui.push.supported ? `<h3 style="margin-top:12px">Notifications</h3><p class="hint">${ui.push.subscribed ? 'Activées sur cet appareil : versements, remises de cagnotte et messages.' : ui.push.permission === 'denied' ? 'Bloquées par le navigateur. Autorisez-les dans les réglages du site.' : 'Désactivées sur cet appareil.'}</p>${ui.push.permission === 'denied' ? '' : ui.push.subscribed ? '<p><button class="mini" data-m="pushoff">Désactiver sur cet appareil</button></p>' : '<p><button class="mini primary" data-m="pushon">Activer les notifications</button></p>'}` : ''}
      ${lockSection()}
      <div class="dlg-actions"><button data-m="new">Créer ou rejoindre une autre tontine</button><button class="danger" data-m="out">Se déconnecter</button><button data-m="close">Fermer</button></div>`;
    m.showModal();
  });
  $('modal').addEventListener('click', async ev => {
    const b = ev.target.closest('button[data-m]'); if (!b) { if (ev.target === $('modal')) $('modal').close(); return; }
    if (b.dataset.m === 'pinform') { pinForm(); return; }
    if (b.dataset.m === 'pinsave' || b.dataset.m === 'pindel') { await pinAction(b.dataset.m); return; }
    $('modal').close();
    if (b.dataset.m === 'out') { await disablePush(); await B.signOut(); }
    else if (b.dataset.m === 'pushon') { try { await enablePush(); } catch (e) { toast('Impossible d\'activer les notifications sur cet appareil.'); } }
    else if (b.dataset.m === 'pushoff') { await disablePush(); await refreshPush(); toast('Notifications désactivées sur cet appareil.'); }
    else if (b.dataset.m === 'new') go('#/accueil');
    else if (b.dataset.m === 'open') { S.tid = b.dataset.id; S.cfg = S.tontines.find(t => t.id === S.tid); ui.topic = 'general'; ui.rendered = ''; ui.draft = {}; await openTontine(); go('#/tour'); }
  });
  window.addEventListener('hashchange', () => route());
  window.addEventListener('offline', () => { $('liveDot').classList.add('off'); toast('Hors connexion : les données ne se mettent plus à jour.'); });
  window.addEventListener('online', () => { $('liveDot').classList.remove('off'); if (S.tid) queue('*'); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.tid && S.loaded) queue('*'); });
  setInterval(() => { if (!document.hidden && S.tid && S.loaded && navigator.onLine !== false) queue('*'); }, 60000);

  // ---------- Unlock code ----------
  // Optional screen lock: each member can set a 4-6 digit code on this device. Only a salted hash is kept, in localStorage.
  const lockKey = uid => 'elongo.lock.' + uid;
  const getLock = () => { if (!S.user) return null; try { const v = JSON.parse(store.get(lockKey(S.user.id))); return v && v.hash ? v : null; } catch (e) { return null; } };
  async function hashPin(pin, salt) {
    const txt = salt + ':' + pin;
    try { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)); return [...new Uint8Array(d)].map(b => pad(b.toString(16))).join(''); }
    catch (e) { let h = 2166136261; for (const c of txt) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return 'f' + (h >>> 0).toString(16); }   // insecure context fallback
  }
  const newSalt = () => { try { return [...crypto.getRandomValues(new Uint8Array(8))].map(b => pad(b.toString(16))).join(''); } catch (e) { return String(Math.random()).slice(2); } };
  async function setLock(pin) { const salt = newSalt(); store.set(lockKey(S.user.id), JSON.stringify({ salt, hash: await hashPin(pin, salt), len: pin.length })); }
  const clearLock = () => { try { localStorage.removeItem(lockKey(S.user.id)); } catch (e) {} };
  const lockState = { fails: 0, until: 0, hiddenAt: 0 };
  function showLock() {
    const l = getLock(); if (!l) return;
    let el = $('lockScreen');
    if (!el) { el = document.createElement('div'); el.id = 'lockScreen'; el.className = 'lockscreen'; document.body.appendChild(el); }
    el.innerHTML = `<div class="lockbox"><img src="icons/icon-192.png" alt="" width="64" height="64"><h1>Elongo</h1><p class="sub">Entrez votre code pour continuer.</p>
      <input id="lockIn" type="password" inputmode="numeric" autocomplete="off" maxlength="6" aria-label="Code de déverrouillage">
      <p class="lock-err" id="lockErr" role="alert"></p>
      <button class="primary" id="lockGo">Déverrouiller</button><button class="mini" id="lockForgot">Code oublié ?</button></div>`;
    el.hidden = false; document.body.classList.add('locked');
    const inp = $('lockIn'); setTimeout(() => inp.focus(), 50);
    const err = t => { $('lockErr').textContent = t; };
    async function tryUnlock() {
      const wait = Math.ceil((lockState.until - Date.now()) / 1000);
      if (wait > 0) return err(`Trop d'essais. Réessayez dans ${wait} s.`);
      const cur = getLock(); if (!cur) return hideLock();
      if (await hashPin(inp.value, cur.salt) === cur.hash) { lockState.fails = 0; hideLock(); return; }
      inp.value = '';
      if (++lockState.fails >= 5) { lockState.fails = 0; lockState.until = Date.now() + 30000; err('Code incorrect 5 fois. Patientez 30 secondes.'); } else err('Code incorrect.');
    }
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, ''); if (inp.value.length === l.len) tryUnlock(); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
    $('lockGo').onclick = tryUnlock;
    $('lockForgot').onclick = async () => {
      if (!confirm('Pour retrouver l\'accès, vous allez être déconnecté puis vous reconnecter avec votre e-mail et votre mot de passe. Continuer ?')) return;
      clearLock(); hideLock(); await disablePush(); await B.signOut();
    };
  }
  function hideLock() { const el = $('lockScreen'); if (el) { el.hidden = true; el.innerHTML = ''; } document.body.classList.remove('locked'); }
  const isLocked = () => document.body.classList.contains('locked');
  function lockSection() {
    const has = !!getLock();
    return `<h3 style="margin-top:12px">Code de déverrouillage</h3>
      <p class="hint">${has ? 'Activé sur cet appareil : le code est demandé à l\'ouverture et après une absence.' : 'Protégez l\'appli sur cet appareil avec un code de 4 à 6 chiffres que vous choisissez.'}</p>
      <p><button class="mini ${has ? '' : 'primary'}" data-m="pinform">${has ? 'Changer ou supprimer le code' : 'Définir un code'}</button></p>`;
  }
  function pinForm() {
    const has = !!getLock(), f = (id, label) => `<label class="f">${label}<input id="${id}" type="password" inputmode="numeric" autocomplete="off" maxlength="6"></label>`;
    $('modalBody').innerHTML = `<h2>Code de déverrouillage</h2><p class="sub">4 à 6 chiffres, uniquement sur cet appareil.</p>
      ${has ? f('pinOld', 'Code actuel') : ''}${f('pinNew', has ? 'Nouveau code' : 'Code')}${f('pinNew2', 'Confirmer le code')}
      <p class="lock-err" id="pinErr" role="alert"></p>
      <div class="dlg-actions"><button class="primary" data-m="pinsave">Enregistrer</button>${has ? '<button class="danger" data-m="pindel">Supprimer le code</button>' : ''}<button data-m="close">Annuler</button></div>`;
  }
  async function pinAction(kind) {
    const err = t => { $('pinErr').textContent = t; };
    const cur = getLock(), val = id => ($(id) ? $(id).value : '');
    if (cur && await hashPin(val('pinOld'), cur.salt) !== cur.hash) return err('Le code actuel est incorrect.');
    if (kind === 'pindel') { clearLock(); $('modal').close(); toast('Code supprimé.'); return; }
    const a = val('pinNew');
    if (!/^\d{4,6}$/.test(a)) return err('Le code doit avoir 4 à 6 chiffres.');
    if (a !== val('pinNew2')) return err('Les deux codes ne sont pas identiques.');
    await setLock(a); $('modal').close(); toast('Code enregistré.');
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) lockState.hiddenAt = Date.now();
    else if (lockState.hiddenAt && Date.now() - lockState.hiddenAt > 60000 && getLock() && !isLocked()) { if ($('modal').open) $('modal').close(); showLock(); }
  });

  // ---------- Boot ----------
  (async () => {
    try { await B.init(); } catch (e) { toast(friendly(e)); }
    S.user = B.user;
    if (S.user && getLock()) showLock();
    B.onAuthChange(u => { if (!u || (isLocked() && (!S.user || u.id !== S.user.id))) hideLock(); S.user = u; ui.draft = {}; ui.authMode = null; bootstrap(); });
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
    await bootstrap();
    window.__lisanga = { S, ui };   // handy for debugging in the console
  })();
})();
