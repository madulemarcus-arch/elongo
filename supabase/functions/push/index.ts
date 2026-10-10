// Elongo : notifications push. Supabase Edge Function « push » (Deno).
//
// Appelée de deux façons :
//   1. par l'application (utilisateur connecté, en-tête Authorization) :
//        { kind: 'payment',  tontine_id, round, member_id }   versement enregistré (organisateur)
//        { kind: 'payout',   tontine_id, round }              cagnotte remise (organisateur)
//        { kind: 'message',  message_id }                     nouveau message (auteur du message)
//      Le texte de la notification est recomposé ici à partir de la base : un client ne peut pas envoyer de texte libre.
//   2. par la tâche planifiée de Supabase (pg_cron), avec l'en-tête x-cron-secret :
//        { kind: 'reminders' }                                rappels de cotisation (une fois par jour)
//
// Secrets à définir dans Supabase (Edge Functions > Secrets) : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET.
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
//
// Toute la logique est dans handle() et reçoit ses dépendances : tests/push.mjs la teste sans Deno ni Supabase.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n).replace(/[  ]/g, ' ');
const dayMs = 864e5;
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * dayMs).toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / dayMs);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export async function handle(req: Request, deps: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  try {
    if (body.kind === 'reminders') {
      if (!deps.cronSecret || req.headers.get('x-cron-secret') !== deps.cronSecret) return json({ error: 'forbidden' }, 403);
      return json(await reminders(deps));
    }

    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const uid = token ? await deps.userIdFromToken(token) : null;
    if (!uid) return json({ error: 'unauthorized' }, 401);

    if (body.kind === 'payment' || body.kind === 'payout') {
      const t = await deps.getTontine(body.tontine_id);
      if (!t || t.owner_id !== uid) return json({ error: 'forbidden' }, 403);   // only the organizer records payments
      const round = Number(body.round);
      const cur = t.currency;
      let text = '', member: any = null;
      if (body.kind === 'payment') {
        const p = await deps.getPayment(t.id, round, body.member_id);
        member = p && await deps.getMember(p.member_id);
        if (!p || !member || member.tontine_id !== t.id) return json({ sent: 0, failed: 0, removed: 0 });
        const amount = Number(p.amount);
        text = amount >= Number(t.amount)
          ? `${member.name} a payé toute sa cotisation (tour ${round + 1}).`
          : `${member.name} a versé ${fmt(amount)} ${cur} sur ${fmt(Number(t.amount))} ${cur} (tour ${round + 1}).`;
      } else {
        const o = await deps.getPayout(t.id, round);
        member = o && await deps.getMember(o.member_id);
        if (!o || !member || member.tontine_id !== t.id) return json({ sent: 0, failed: 0, removed: 0 });
        text = `${member.name} a reçu la cagnotte de ${fmt(Number(o.amount))} ${cur} (tour ${round + 1}).`;
      }
      const to = await deps.audience(t.id); to.delete(uid);
      return json(await deliver(deps, { title: t.name, body: text, url: './#/direct', tag: `${body.kind}-${t.id}-${round}-${body.member_id || ''}` }, to));
    }

    if (body.kind === 'message') {
      const m = await deps.getMessage(body.message_id);
      if (!m || m.author_id !== uid) return json({ error: 'forbidden' }, 403);   // only the author announces a message
      const t = await deps.getTontine(m.tontine_id);
      if (!t) return json({ sent: 0, failed: 0, removed: 0 });
      const topic = m.topic_id ? await deps.getTopic(m.topic_id) : null;
      const att = m.att && m.att.kind;
      const text = m.body ? clip(String(m.body), 110) : att === 'image' ? '📷 Photo' : att === 'audio' ? '🎤 Message vocal' : '📄 Document';
      const to = await deps.audience(t.id); to.delete(uid);
      return json(await deliver(deps, {
        title: `${m.author_name} · ${t.name}`, body: (topic ? topic.title + ' : ' : '') + text,
        url: './#/discussion', tag: `msg-${t.id}-${m.topic_id || 'general'}`,
      }, to));
    }
    return json({ error: 'unknown_kind' }, 400);
  } catch (e) {
    return json({ error: 'server_error', detail: String((e as any)?.message || e) }, 500);
  }
}

// Sends one payload to every device of the given users. Dead subscriptions (404/410) are removed.
async function deliver(deps: any, payload: unknown, userIds: Set<string>) {
  const out = { sent: 0, failed: 0, removed: 0 };
  if (!userIds.size) return out;
  const subs = await deps.subscriptionsFor([...userIds]);
  const data = JSON.stringify(payload);
  await Promise.all(subs.map(async (s: any) => {
    try { await deps.send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data); out.sent++; }
    catch (e: any) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) { out.removed++; try { await deps.deleteSubscription(s.user_id, s.endpoint); } catch { /* ignore */ } }
      else out.failed++;
    }
  }));
  return out;
}

// Daily reminder for every member who has not paid the current round yet, from `reminder_days` before the date on.
async function reminders(deps: any) {
  const total = { sent: 0, failed: 0, removed: 0, tontines: 0 };
  const today: string = deps.today();
  for (const t of await deps.listTontines()) {
    const members = await deps.activeMembers(t.id);
    if (!members.length) continue;
    const served = new Set(await deps.payoutRounds(t.id));
    let cur = 0; while (served.has(cur)) cur++;
    if (cur >= members.length) continue;
    const days = dayDiff(addDays(t.start_date, (cur + 1) * t.interval_days - 1), today);   // the round ends the day before the next one starts
    if (days > Number(t.reminder_days)) continue;
    const paid: Map<string, number> = await deps.paymentsOfRound(t.id, cur);
    const price = Number(t.amount);
    total.tontines++;
    for (const m of members) {
      if (!m.user_id) continue;
      const rest = price - Number(paid.get(m.id) || 0);
      if (rest <= 0) continue;
      const when = days < 0 ? `en retard de ${-days} jour${days < -1 ? 's' : ''}` : days === 0 ? "attendue aujourd'hui" : days === 1 ? 'attendue demain' : `attendue dans ${days} jours`;
      const text = days < 0
        ? `Cotisation ${when} : il vous reste ${fmt(rest)} ${t.currency} à verser (tour ${cur + 1}).`
        : `Cotisation ${when} : ${fmt(rest)} ${t.currency} à verser (tour ${cur + 1}).`;
      const r = await deliver(deps, { title: t.name, body: text, url: './#/tour', tag: `rappel-${t.id}-${cur}` }, new Set([m.user_id]));
      total.sent += r.sent; total.failed += r.failed; total.removed += r.removed;
    }
  }
  return total;
}

// ---------- Deno wiring (not exercised by tests/push.mjs) ----------
const D = (globalThis as any).Deno;
if (D && D.serve) {
  let ready: Promise<any> | null = null;
  const setup = () => ready ||= (async () => {
    const { createClient } = await import('npm:@supabase/supabase-js@2');
    const webpush = (await import('npm:web-push@3.6.7')).default;
    const env = (k: string) => D.env.get(k) || '';
    webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:admin@example.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    const rows = async (q: any) => { const { data, error } = await q; if (error) throw error; return data || []; };
    const one = async (q: any) => { const { data, error } = await q; if (error) throw error; return data; };
    return {
      cronSecret: env('CRON_SECRET'),
      today: () => new Date().toISOString().slice(0, 10),
      userIdFromToken: async (token: string) => { const { data, error } = await admin.auth.getUser(token); return error ? null : data.user?.id ?? null; },
      getTontine: (id: string) => one(admin.from('tontines').select('*').eq('id', id).maybeSingle()),
      getMember: (id: string) => one(admin.from('members').select('id,tontine_id,name,user_id').eq('id', id).maybeSingle()),
      getPayment: (tid: string, round: number, mid: string) => one(admin.from('payments').select('*').eq('tontine_id', tid).eq('round', round).eq('member_id', mid).maybeSingle()),
      getPayout: (tid: string, round: number) => one(admin.from('payouts').select('*').eq('tontine_id', tid).eq('round', round).maybeSingle()),
      getMessage: (id: string) => one(admin.from('messages').select('*').eq('id', id).maybeSingle()),
      getTopic: (id: string) => one(admin.from('topics').select('title').eq('id', id).maybeSingle()),
      audience: async (tid: string) => {
        const t = await one(admin.from('tontines').select('owner_id').eq('id', tid).maybeSingle());
        const ms = await rows(admin.from('members').select('user_id').eq('tontine_id', tid).eq('status', 'active').not('user_id', 'is', null));
        const set = new Set<string>(ms.map((r: any) => r.user_id)); if (t) set.add(t.owner_id);
        return set;
      },
      subscriptionsFor: (ids: string[]) => rows(admin.from('push_subscriptions').select('*').in('user_id', ids)),
      deleteSubscription: (uid: string, endpoint: string) => rows(admin.from('push_subscriptions').delete().eq('user_id', uid).eq('endpoint', endpoint)),
      listTontines: () => rows(admin.from('tontines').select('*')),
      activeMembers: (tid: string) => rows(admin.from('members').select('id,name,user_id').eq('tontine_id', tid).eq('status', 'active').order('position').order('created_at')),
      payoutRounds: async (tid: string) => (await rows(admin.from('payouts').select('round').eq('tontine_id', tid))).map((r: any) => r.round),
      paymentsOfRound: async (tid: string, round: number) => new Map((await rows(admin.from('payments').select('member_id,amount').eq('tontine_id', tid).eq('round', round))).map((r: any) => [r.member_id, Number(r.amount)])),
      send: (sub: any, data: string) => webpush.sendNotification(sub, data, { TTL: 86400 }),
    };
  })();
  D.serve(async (req: Request) => handle(req, await setup()));
}
