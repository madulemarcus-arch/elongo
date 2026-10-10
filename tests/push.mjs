// Tests of the push Edge Function logic (supabase/functions/push/index.ts) without Deno or Supabase: node tests/push.mjs
// The database is a small in-memory fake; one test sends through the real web-push library to a local HTTPS endpoint
// and decrypts the message the way a browser would, to prove the payload format.
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
import webpush from 'web-push';
import ece from 'http_ece';

const { handle } = await import('../supabase/functions/push/index.ts');
const step = n => console.log('✓', n);

// ---------- fake database ----------
const OWNER = 'u-owner', ALICE = 'u-alice', BOB = 'u-bob', OUTSIDER = 'u-out';
const T = { id: 't1', name: 'Tontine des amis', owner_id: OWNER, amount: 10000, currency: 'FC', interval_days: 7, start_date: '2026-10-10', reminder_days: 3 };
const members = [
  { id: 'm0', tontine_id: 't1', name: 'Marcus', user_id: OWNER },
  { id: 'm1', tontine_id: 't1', name: 'Alice', user_id: ALICE },
  { id: 'm2', tontine_id: 't1', name: 'Bob', user_id: BOB },
  { id: 'm3', tontine_id: 't1', name: 'Dora', user_id: null },   // no account: never notified
];
const state = { payments: [], payouts: [], messages: [], topics: [{ id: 'tp1', title: 'Retard de mars' }], subs: [], sent: [], today: '2026-10-08', dead: new Set() };
const sub = (user_id, endpoint) => ({ user_id, endpoint, p256dh: 'p', auth: 'a' });
const reset = () => { Object.assign(state, { payments: [], payouts: [], messages: [], sent: [], today: '2026-10-08', dead: new Set(), subs: [sub(OWNER, 'e-owner'), sub(ALICE, 'e-alice'), sub(ALICE, 'e-alice-2'), sub(BOB, 'e-bob'), sub(OUTSIDER, 'e-out')] }); };
const deps = () => ({
  cronSecret: 's3cret',
  today: () => state.today,
  userIdFromToken: async tok => ({ 'tok-owner': OWNER, 'tok-alice': ALICE, 'tok-bob': BOB })[tok] || null,
  getTontine: async id => (id === 't1' ? T : null),
  getMember: async id => members.find(m => m.id === id) || null,
  getPayment: async (t, r, m) => state.payments.find(p => p.round === r && p.member_id === m) || null,
  getPayout: async (t, r) => state.payouts.find(p => p.round === r) || null,
  getMessage: async id => state.messages.find(m => m.id === id) || null,
  getTopic: async id => state.topics.find(t => t.id === id) || null,
  audience: async () => new Set(members.map(m => m.user_id).filter(Boolean)),
  subscriptionsFor: async ids => state.subs.filter(s => ids.includes(s.user_id)),
  deleteSubscription: async (u, e) => { state.subs = state.subs.filter(s => !(s.user_id === u && s.endpoint === e)); },
  listTontines: async () => [T],
  activeMembers: async () => members,
  payoutRounds: async () => state.payouts.map(p => p.round),
  paymentsOfRound: async (t, r) => new Map(state.payments.filter(p => p.round === r).map(p => [p.member_id, p.amount])),
  send: async (s, data) => { if (state.dead.has(s.endpoint)) throw Object.assign(new Error('gone'), { statusCode: 410 }); state.sent.push({ endpoint: s.endpoint, ...JSON.parse(data) }); },
});
const call = (body, { token, cron, method = 'POST' } = {}) => handle(new Request('https://x/f', {
  method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(cron ? { 'x-cron-secret': cron } : {}) },
  body: method === 'POST' ? JSON.stringify(body) : undefined,
}), deps());
const j = async r => ({ status: r.status, ...(await r.json()) });
const to = () => state.sent.map(s => s.endpoint).sort();

// ---------- access rules ----------
reset();
assert.equal((await call({}, { method: 'OPTIONS' })).headers.get('access-control-allow-origin'), '*');
assert.equal((await j(await call({ kind: 'payment' }))).status, 401, 'no token');
assert.equal((await j(await call({ kind: 'payment' }, { token: 'bad' }))).status, 401, 'bad token');
assert.equal((await j(await call({ kind: 'reminders' }, { cron: 'wrong' }))).status, 403, 'bad cron secret');
assert.equal((await j(await call({ kind: 'reminders' }, { token: 'tok-owner' }))).status, 403, 'a user token does not run reminders');
assert.equal((await j(await call({ kind: 'nope' }, { token: 'tok-owner' }))).status, 400);
assert.equal((await call({}, { method: 'GET' })).status, 405);
step('access rules');

// ---------- payments ----------
reset();
state.payments.push({ round: 0, member_id: 'm1', amount: 4000 });
assert.equal((await j(await call({ kind: 'payment', tontine_id: 't1', round: 0, member_id: 'm1' }, { token: 'tok-alice' }))).status, 403, 'a member cannot announce payments');
let r = await j(await call({ kind: 'payment', tontine_id: 't1', round: 0, member_id: 'm1' }, { token: 'tok-owner' }));
assert.deepEqual([r.status, r.sent, r.failed], [200, 3, 0]);
assert.deepEqual(to(), ['e-alice', 'e-alice-2', 'e-bob'], 'everyone but the organizer who acted, every device, nobody outside the group');
assert.equal(state.sent[0].title, 'Tontine des amis');
assert.equal(state.sent[0].body, 'Alice a versé 4 000 FC sur 10 000 FC (tour 1).');
assert.equal(state.sent[0].url, './#/direct');
state.payments[0].amount = 10000; state.sent = [];
await call({ kind: 'payment', tontine_id: 't1', round: 0, member_id: 'm1' }, { token: 'tok-owner' });
assert.equal(state.sent[0].body, 'Alice a payé toute sa cotisation (tour 1).');
step('payment notifications');

// ---------- payout ----------
reset();
state.payouts.push({ round: 0, member_id: 'm0', amount: 40000 });
await call({ kind: 'payout', tontine_id: 't1', round: 0 }, { token: 'tok-owner' });
assert.equal(state.sent[0].body, 'Marcus a reçu la cagnotte de 40 000 FC (tour 1).');
assert.deepEqual(to(), ['e-alice', 'e-alice-2', 'e-bob']);
step('payout notification');

// ---------- messages ----------
reset();
state.messages.push({ id: 'g1', tontine_id: 't1', topic_id: null, author_id: ALICE, author_name: 'Alice', body: 'Je paie demain', att: null },
  { id: 'g2', tontine_id: 't1', topic_id: 'tp1', author_id: ALICE, author_name: 'Alice', body: '', att: { kind: 'audio' } });
assert.equal((await j(await call({ kind: 'message', message_id: 'g1' }, { token: 'tok-bob' }))).status, 403, 'only the author announces a message');
await call({ kind: 'message', message_id: 'g1' }, { token: 'tok-alice' });
assert.deepEqual(to(), ['e-bob', 'e-owner'], 'everyone but the author');
assert.equal(state.sent[0].title, 'Alice · Tontine des amis');
assert.equal(state.sent[0].body, 'Je paie demain');
state.sent = [];
await call({ kind: 'message', message_id: 'g2' }, { token: 'tok-alice' });
assert.equal(state.sent[0].body, 'Retard de mars : 🎤 Message vocal');
step('message notifications');

// ---------- reminders (tour 1 due 2026-10-10, 3 days notice) ----------
reset(); state.today = '2026-10-06';
r = await j(await call({ kind: 'reminders' }, { cron: 's3cret' }));
assert.equal(r.sent, 0, 'too early: 4 days before the date');
state.today = '2026-10-07';
state.payments.push({ round: 0, member_id: 'm0', amount: 10000 }, { round: 0, member_id: 'm1', amount: 4000 });
r = await j(await call({ kind: 'reminders' }, { cron: 's3cret' }));
assert.equal(r.status, 200);
assert.deepEqual(to(), ['e-alice', 'e-alice-2', 'e-bob'], 'members who owe, not the one who paid, not the one without account');
assert.equal(state.sent.find(s => s.endpoint === 'e-alice').body, 'Cotisation attendue dans 3 jours : 6 000 FC à verser (tour 1).');
assert.equal(state.sent.find(s => s.endpoint === 'e-bob').body, 'Cotisation attendue dans 3 jours : 10 000 FC à verser (tour 1).');
state.sent = []; state.today = '2026-10-09';
await call({ kind: 'reminders' }, { cron: 's3cret' });
assert.equal(state.sent[0].body, 'Cotisation attendue demain : 6 000 FC à verser (tour 1).');
state.sent = []; state.today = '2026-10-10';
await call({ kind: 'reminders' }, { cron: 's3cret' });
assert.match(state.sent[0].body, /^Cotisation attendue aujourd'hui/);
state.sent = []; state.today = '2026-10-12';
await call({ kind: 'reminders' }, { cron: 's3cret' });
assert.equal(state.sent[0].body, 'Cotisation en retard de 2 jours : il vous reste 6 000 FC à verser (tour 1).');
assert.equal(state.sent[0].tag, 'rappel-t1-0');
// everybody paid: nothing; round served: the next round is not due yet
state.sent = []; state.payments = [0, 1, 2].map(i => ({ round: 0, member_id: 'm' + i, amount: 10000 }));
await call({ kind: 'reminders' }, { cron: 's3cret' });
assert.equal(state.sent.length, 0, 'all paid');
state.payments = []; state.payouts.push({ round: 0, member_id: 'm0', amount: 40000 }); state.today = '2026-10-12';
await call({ kind: 'reminders' }, { cron: 's3cret' });
assert.equal(state.sent.length, 0, 'round 2 is due on 2026-10-17: too early');
state.today = '2026-10-15';
await call({ kind: 'reminders' }, { cron: 's3cret' });
assert.match(state.sent[0].body, /\(tour 2\)\.$/);
step('reminders');

// ---------- dead subscriptions are removed ----------
reset(); state.dead.add('e-alice-2'); state.dead.add('e-bob');
state.payments.push({ round: 0, member_id: 'm1', amount: 1000 });
r = await j(await call({ kind: 'payment', tontine_id: 't1', round: 0, member_id: 'm1' }, { token: 'tok-owner' }));
assert.deepEqual([r.sent, r.removed, r.failed], [1, 2, 0]);
assert.ok(!state.subs.some(s => s.endpoint === 'e-alice-2' || s.endpoint === 'e-bob'), 'expired devices are deleted');
assert.ok(state.subs.some(s => s.endpoint === 'e-alice'));
step('expired subscriptions cleaned up');

// ---------- real web-push, real encryption, a "browser" decrypts ----------
const dir = mkdtempSync(join(tmpdir(), 'push-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-subj', '/CN=localhost', '-days', '1'], { stdio: 'ignore' });
const got = [];
const server = createServer({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }, (req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => { got.push({ headers: req.headers, body: Buffer.concat(chunks) }); res.writeHead(201); res.end(); });
}).listen(0);
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const vapid = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:test@example.com', vapid.publicKey, vapid.privateKey);
const browser = crypto.createECDH('prime256v1'); browser.generateKeys();
const authSecret = crypto.randomBytes(16);
const realSub = { endpoint: `https://localhost:${server.address().port}/push/abc`, keys: { p256dh: browser.getPublicKey().toString('base64url'), auth: authSecret.toString('base64url') } };
reset(); state.subs = [{ user_id: ALICE, endpoint: realSub.endpoint, p256dh: realSub.keys.p256dh, auth: realSub.keys.auth }];
state.payments.push({ round: 0, member_id: 'm2', amount: 10000 });
const real = { ...deps(), subscriptionsFor: async () => state.subs, send: (s, data) => webpush.sendNotification(s, data, { TTL: 86400 }) };
const res = await handle(new Request('https://x/f', { method: 'POST', headers: { authorization: 'Bearer tok-owner' }, body: JSON.stringify({ kind: 'payment', tontine_id: 't1', round: 0, member_id: 'm2' }) }), real);
assert.deepEqual((await res.json()).sent, 1);
assert.equal(got.length, 1);
assert.match(got[0].headers.authorization, /^vapid t=.+, k=/, 'VAPID authorization header');
assert.equal(got[0].headers['content-encoding'], 'aes128gcm');
assert.equal(got[0].headers.ttl, '86400');
const clear = ece.decrypt(got[0].body, { version: 'aes128gcm', privateKey: browser, authSecret });
assert.equal(JSON.parse(clear.toString()).body, 'Bob a payé toute sa cotisation (tour 1).');
server.close();
step('real web-push: VAPID header + encrypted payload decrypts to the notification');

console.log('All checks passed');
