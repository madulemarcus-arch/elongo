// Data layer. Two interchangeable backends expose the same small API to app.js:
//   - Supabase (production): accounts, Postgres tables protected by RLS, Realtime, Storage. Used when config.js is filled in.
//   - Demo (no server): same tables in localStorage, shared between tabs through BroadcastChannel. For trying the app out and for tests/e2e.mjs.
// API: init, user, onAuthChange, signUp, signIn, signOut, select, insert, update, upsert, remove, rpc, subscribe, putFile, getFile, removeFiles.
// Rows keep the snake_case column names of supabase/schema.sql.
(function () {
  const cfg = window.LISANGA_CONFIG || {};
  const TABLES = ['tontines', 'members', 'contacts', 'payments', 'payouts', 'topics', 'messages', 'journal'];

  // ---------- Supabase ----------
  function supabaseBackend() {
    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    const B = { mode: 'supabase', maxFile: 5 * 1024 * 1024, user: null };
    const listeners = new Set();
    const unwrap = ({ data, error }) => { if (error) throw error; return data; };
    const setUser = s => { B.user = s && s.user ? { id: s.user.id, email: s.user.email } : null; };
    const fire = () => listeners.forEach(f => f(B.user));
    B.init = async () => {
      let session = null;
      try { session = unwrap(await sb.auth.getSession()).session; } catch (e) { session = null; }
      if (!session && navigator.onLine === false) {   // an expired token cannot be renewed without network: recognise the person from what the phone kept, so the app opens (offline)
        try { const k = Object.keys(localStorage).find(x => /^sb-.*-auth-token$/.test(x)), v = k && JSON.parse(localStorage.getItem(k)); if (v && v.user) session = { user: v.user }; } catch (e) { /* nothing kept */ }
      }
      setUser(session);
      sb.auth.onAuthStateChange((ev, s) => {
        if (!s && navigator.onLine === false && ev !== 'SIGNED_OUT') return;   // a failed renewal without network is not a sign-out
        const prev = B.user && B.user.id; setUser(s);
        if ((B.user && B.user.id) !== prev) fire();
      });
    };
    B.onAuthChange = f => { listeners.add(f); };
    B.signUp = async (email, password) => {
      const d = unwrap(await sb.auth.signUp({ email, password }));
      return { needsConfirm: !d.session };   // without a session the project requires e-mail confirmation first
    };
    B.signIn = async (email, password) => { unwrap(await sb.auth.signInWithPassword({ email, password })); };
    B.signOut = async () => { await sb.auth.signOut(); };
    const filtered = (q, eq) => { for (const [k, v] of Object.entries(eq || {})) q = q.eq(k, v); return q; };
    B.select = async (table, { eq, order, limit } = {}) => {
      let q = filtered(sb.from(table).select('*'), eq);
      (order || []).forEach(([c, asc]) => { q = q.order(c, { ascending: asc !== false }); });
      if (limit) q = q.limit(limit);
      return unwrap(await q);
    };
    B.insert = async (table, rows) => unwrap(await sb.from(table).insert(rows).select());
    B.update = async (table, patch, eq) => unwrap(await filtered(sb.from(table).update(patch), eq).select());
    B.upsert = async (table, row, onConflict) => unwrap(await sb.from(table).upsert(row, { onConflict }).select());
    B.remove = async (table, eq) => unwrap(await filtered(sb.from(table).delete(), eq).select());
    B.rpc = async (name, args) => unwrap(await sb.rpc(name, args));
    // Edge Function call (push notifications). Failures never block the app.
    B.invoke = async (name, body) => { try { const r = await sb.functions.invoke(name, { body }); return r.data || null; } catch (e) { return null; } };
    // cb(table) fires on any change of that table for this tontine, and cb('*') after a reconnection.
    B.subscribe = (tid, cb) => {
      const ch = sb.channel('lisanga-' + tid + '-' + Math.random().toString(36).slice(2, 6));
      TABLES.forEach(t => ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: (t === 'tontines' ? 'id' : 'tontine_id') + '=eq.' + tid }, () => cb(t)));
      let first = true;
      ch.subscribe(st => { if (st === 'SUBSCRIBED') { if (!first) cb('*'); first = false; } });
      return () => { sb.removeChannel(ch); };
    };
    B.putFile = async (path, blob, type) => { unwrap(await sb.storage.from('lisanga').upload(path, blob, { contentType: type, upsert: false })); };
    B.getFile = async path => unwrap(await sb.storage.from('lisanga').download(path));
    B.removeFiles = async paths => { if (paths.length) await sb.storage.from('lisanga').remove(paths); };
    return B;
  }

  // ---------- Demo ----------
  function demoBackend() {
    const KEY = 'lisanga.demo.v1', FKEY = 'lisanga.demo.files.';
    const B = { mode: 'demo', maxFile: 1500000, user: null };
    const listeners = new Set(), subs = new Set();
    const bc = 'BroadcastChannel' in window ? new BroadcastChannel('lisanga-demo') : null;
    const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : r & 3 | 8).toString(16); }));
    const load = () => { try { return Object.assign({ users: [] }, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { return { users: [] }; } };
    const save = d => localStorage.setItem(KEY, JSON.stringify(d));
    const T = (d, t) => d[t] || (d[t] = []);
    const err = (message, code) => Object.assign(new Error(message), { code });
    const must = () => { if (!B.user) throw err('not_authenticated'); return B.user.id; };
    const match = (r, eq) => Object.entries(eq || {}).every(([k, v]) => r[k] === v);
    const tid = (t, r) => t === 'tontines' ? r.id : r.tontine_id;
    const copy = x => JSON.parse(JSON.stringify(x));
    const notify = (t, id) => { subs.forEach(s => { if (s.tid === id) s.cb(t); }); if (bc) bc.postMessage({ t, id }); };
    if (bc) bc.onmessage = e => subs.forEach(s => { if (s.tid === e.data.id) s.cb(e.data.t); });
    const isCreator = (d, id) => !!B.user && T(d, 'tontines').some(x => x.id === id && x.owner_id === B.user.id);
    // organizer = creator or active member named organizer (rules of schema.sql: is_owner / is_creator / guard_organizers)
    const isOwner = (d, id) => isCreator(d, id) || (!!B.user && T(d, 'members').some(m => m.tontine_id === id && m.user_id === B.user.id && m.status === 'active' && m.is_organizer));
    const isActive = (d, id) => isOwner(d, id) || T(d, 'members').some(m => m.tontine_id === id && m.user_id === B.user.id && m.status === 'active');
    // Reading rules copied from schema.sql so the demo behaves like the real thing for the screens: phones are for the organizer only,
    // pending requesters only see themselves.
    const visible = (d, t, r) => {
      if (!B.user) return false;
      if (t === 'push_subscriptions') return r.user_id === B.user.id;
      const id = tid(t, r), own = isOwner(d, id), mem = T(d, 'members').find(m => m.tontine_id === id && m.user_id === B.user.id);
      if (t === 'contacts') return own;
      if (t === 'tontines') return own || !!mem;
      if (t === 'members') return own || (mem && mem.status === 'active') || r.user_id === B.user.id;
      return own || (mem && mem.status === 'active');
    };
    const pk = { payments: ['tontine_id', 'round', 'member_id'], payouts: ['tontine_id', 'round'], contacts: ['member_id'], push_subscriptions: ['user_id', 'endpoint'] };
    const sameKey = (t, a, b) => (pk[t] || ['id']).every(k => a[k] === b[k]);
    const now = () => new Date().toISOString();
    // New row = column defaults of schema.sql, overridden by the given values.
    const finish = (t, row) => {
      const base = t === 'tontines' ? { id: uuid(), owner_id: must(), currency: 'FC', interval_days: 30, penalty: 0, reminder_days: 3, country_code: '243', join_open: true, code: Math.random().toString(36).slice(2, 10), created_at: now() }
        : t === 'members' ? { id: uuid(), position: 0, status: 'active', user_id: null, is_organizer: false, created_at: now() }
        : t === 'topics' ? { id: uuid(), author_id: must(), created_at: now(), closed: false }
        : t === 'messages' ? { id: uuid(), author_id: must(), created_at: now(), topic_id: null, body: '', att: null }
        : t === 'payments' ? { penalty_paid: false, done_on: null, log: [], updated_at: now() }
        : t === 'payouts' ? { created_at: now() }
        : t === 'journal' ? { id: uuid(), by_id: must(), created_at: now() }
        : t === 'push_subscriptions' ? { user_id: must(), created_at: now() } : {};
      return Object.assign(base, row);
    };
    const denied = () => err('new row violates row-level security policy', '42501');
    const check = (t, d, row) => {
      if (t === 'tontines') { if (row.owner_id !== B.user.id) throw denied(); if (!(row.amount > 0)) throw err('amount check', '23514'); }
      else if (['members', 'contacts', 'payments', 'payouts'].includes(t)) { if (!isOwner(d, row.tontine_id)) throw denied(); }
      else if (t === 'journal') { if (!isOwner(d, row.tontine_id) || row.by_id !== B.user.id) throw denied(); }
      else if (t === 'topics') {
        if (!isActive(d, row.tontine_id) || row.author_id !== B.user.id) throw denied();
        if (T(d, t).some(x => x.tontine_id === row.tontine_id && x.title.toLowerCase() === row.title.toLowerCase())) throw err('duplicate key', '23505');
      } else if (t === 'messages') {
        if (!isActive(d, row.tontine_id) || row.author_id !== B.user.id) throw denied();
        if (!row.body && !row.att) throw err('check', '23514');
        const tp = row.topic_id && T(d, 'topics').find(x => x.id === row.topic_id);
        if (row.topic_id && (!tp || tp.closed)) throw denied();
      }
    };
    B.init = async () => {
      try { const s = JSON.parse(sessionStorage.getItem('lisanga.demo.user')); if (s && load().users.some(u => u.id === s.id)) B.user = s; } catch (e) {}
    };
    B.onAuthChange = f => { listeners.add(f); };
    const setUser = u => {
      B.user = u ? { id: u.id, email: u.email } : null;
      try { if (u) sessionStorage.setItem('lisanga.demo.user', JSON.stringify(B.user)); else sessionStorage.removeItem('lisanga.demo.user'); } catch (e) {}
      listeners.forEach(f => f(B.user));
    };
    B.signUp = async (email, password) => {
      const d = load(); email = email.trim().toLowerCase();
      if (d.users.some(u => u.email === email)) throw err('User already registered');
      const u = { id: uuid(), email, password }; d.users.push(u); save(d); setUser(u); return { needsConfirm: false };
    };
    B.signIn = async (email, password) => {
      const u = load().users.find(x => x.email === email.trim().toLowerCase() && x.password === password);
      if (!u) throw err('Invalid login credentials'); setUser(u);
    };
    B.signOut = async () => setUser(null);
    B.select = async (t, { eq, order, limit } = {}) => {
      const d = load(); let rows = T(d, t).filter(r => match(r, eq) && visible(d, t, r));
      (order || []).slice().reverse().forEach(([c, asc]) => { rows = rows.slice().sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc === false ? -1 : 1)); });
      return copy(limit ? rows.slice(0, limit) : rows);
    };
    B.insert = async (t, rows) => {
      must(); const d = load(), out = [];
      for (const r of [].concat(rows)) { const row = finish(t, r); check(t, d, row); T(d, t).push(row); out.push(row); }
      save(d); out.forEach(r => notify(t, tid(t, r))); return copy(out);
    };
    B.update = async (t, patch, eq) => {
      must(); const d = load(), out = [];
      if (t === 'tontines' && patch.amount !== undefined && !(patch.amount > 0)) throw err('amount check', '23514');
      if (t === 'tontines' && patch.owner_id !== undefined) throw err('owner_locked');
      T(d, t).forEach(r => {
        if (!match(r, eq) || !visible(d, t, r)) return;
        const allowed = t === 'topics' ? r.author_id === B.user.id || isOwner(d, r.tontine_id) : t === 'messages' || t === 'journal' ? false : isOwner(d, tid(t, r));
        if (allowed && t === 'members' && patch.is_organizer !== undefined && patch.is_organizer !== !!r.is_organizer) {
          if (!isCreator(d, r.tontine_id)) throw err('creator_only');
          if (patch.is_organizer && (!r.user_id || (patch.status || r.status) !== 'active')) throw err('organizer_needs_account');
        }
        if (allowed) { Object.assign(r, patch); out.push(r); }
      });
      save(d); out.forEach(r => notify(t, tid(t, r))); return copy(out);
    };
    B.upsert = async (t, row, onConflict) => {
      must(); const d = load(), list = T(d, t), i = list.findIndex(r => sameKey(t, r, row));
      const n = Object.assign(finish(t, {}), i >= 0 ? list[i] : {}, row, t === 'payments' ? { updated_at: now() } : {}); check(t, d, n);
      if (i >= 0) list[i] = n; else list.push(n);
      save(d); notify(t, tid(t, n)); return [copy(n)];
    };
    B.remove = async (t, eq) => {
      must(); const d = load(), gone = [];
      d[t] = T(d, t).filter(r => {
        if (!match(r, eq) || !visible(d, t, r)) return true;
        const ok = t === 'push_subscriptions' ? r.user_id === B.user.id : t === 'tontines' ? isCreator(d, r.id) : t === 'members' ? (r.is_organizer ? isCreator(d, r.tontine_id) : isOwner(d, r.tontine_id)) || (r.user_id === B.user.id && r.status === 'pending')
          : t === 'journal' ? false : t === 'topics' || t === 'messages' ? r.author_id === B.user.id || isOwner(d, r.tontine_id) : isOwner(d, tid(t, r));
        if (ok) gone.push(r); return !ok;
      });
      gone.forEach(g => {   // cascades of schema.sql
        if (t === 'members') ['contacts', 'payments', 'payouts'].forEach(x => { d[x] = T(d, x).filter(r => r.member_id !== g.id); });
        if (t === 'topics') d.messages = T(d, 'messages').filter(r => r.topic_id !== g.id);
        if (t === 'tontines') ['members', 'contacts', 'payments', 'payouts', 'topics', 'messages', 'journal'].forEach(x => { d[x] = T(d, x).filter(r => r.tontine_id !== g.id); });
      });
      save(d); gone.forEach(r => notify(t, tid(t, r))); return copy(gone);
    };
    B.rpc = async (name, a) => {
      const uid = must(), d = load(), code = String(a.p_code || '').trim().toLowerCase(), t = T(d, 'tontines').find(x => x.code === code);
      if (name === 'tontine_preview') return t ? [{ name: t.name, join_open: t.join_open }] : [];
      if (name === 'join_tontine') {
        const nm = String(a.p_name || '').trim().slice(0, 40), ph = String(a.p_phone || '').trim().slice(0, 30);
        if (!t) throw err('invalid_code'); if (!t.join_open) throw err('join_closed'); if (!nm) throw err('name_required');
        if (t.owner_id === uid || T(d, 'members').some(m => m.tontine_id === t.id && m.user_id === uid)) throw err('already_joined');
        const m = { id: uuid(), tontine_id: t.id, user_id: uid, name: nm, position: 0, status: 'pending', created_at: now() };
        T(d, 'members').push(m); if (ph) T(d, 'contacts').push({ member_id: m.id, tontine_id: t.id, phone: ph });
        save(d); notify('members', t.id); notify('contacts', t.id); return m.id;
      }
      throw err('unknown rpc ' + name);
    };
    B.invoke = async () => null;   // no server in demo mode: nobody to notify
    B.subscribe = (id, cb) => { const s = { tid: id, cb }; subs.add(s); return () => subs.delete(s); };
    B.putFile = async (path, blob) => {
      const url = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(blob); });
      try { localStorage.setItem(FKEY + path, url); } catch (e) { throw err('quota', 'quota_exceeded'); }
    };
    B.getFile = async path => { const u = localStorage.getItem(FKEY + path); if (!u) throw err('not_found'); return (await fetch(u)).blob(); };
    B.removeFiles = async paths => paths.forEach(p => localStorage.removeItem(FKEY + p));
    return B;
  }

  window.Backend = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase ? supabaseBackend() : demoBackend();
})();
