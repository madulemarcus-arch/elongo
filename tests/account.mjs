// Tests of the password-reset Edge Function logic (supabase/functions/account/index.ts) without Deno or Supabase: node tests/account.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const { handle, tempPassword } = await import('../supabase/functions/account/index.ts');
const step = n => console.log('✓', n);

const OWNER = 'u-owner', ORGA = 'u-orga', ALICE = 'u-alice';
const T = { id: 't1', owner_id: OWNER }, OTHER = { id: 't2', owner_id: 'u-else' };
const members = [
  { id: 'm0', tontine_id: 't1', name: 'Marcus', user_id: OWNER },
  { id: 'm1', tontine_id: 't1', name: 'Alice', user_id: ALICE },
  { id: 'm2', tontine_id: 't1', name: 'Dora', user_id: null },
  { id: 'm9', tontine_id: 't2', name: 'Zed', user_id: 'u-zed' },
];
const set = [];
const deps = () => ({
  random: n => crypto.randomBytes(n),
  userIdFromToken: async tok => ({ 'tok-owner': OWNER, 'tok-orga': ORGA, 'tok-alice': ALICE })[tok] || null,
  getTontine: async id => ({ t1: T, t2: OTHER })[id] || null,
  getMember: async id => members.find(m => m.id === id) || null,
  isOrganizer: async (t, uid) => t.owner_id === uid || (t.id === 't1' && uid === ORGA),
  setPassword: async (uid, pw) => { set.push({ uid, pw }); },
});
const call = (body, token, method = 'POST') => handle(new Request('https://x/f', {
  method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: method === 'POST' ? JSON.stringify(body) : undefined,
}), deps());
const j = async r => ({ status: r.status, ...(await r.json()) });

// ---------- temporary password ----------
const pw = tempPassword(n => crypto.randomBytes(n));
assert.match(pw, /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
assert.notEqual(pw, tempPassword(n => crypto.randomBytes(n)));
step('temporary password alphabet');

// ---------- access rules ----------
assert.equal((await call({}, null, 'OPTIONS')).headers.get('access-control-allow-origin'), '*');
assert.deepEqual(await j(await call({ kind: 'resetpw', tontine_id: 't1', member_id: 'm1' }, null)), { status: 401, error: 'unauthorized' });
assert.deepEqual(await j(await call({ kind: 'resetpw', tontine_id: 't1', member_id: 'm1' }, 'tok-bad')), { status: 401, error: 'unauthorized' });
assert.equal((await call({}, 'tok-owner', 'GET')).status, 405);
assert.equal((await call({ kind: 'nope' }, 'tok-owner')).status, 400);
// a plain member cannot reset anybody
assert.deepEqual(await j(await call({ kind: 'resetpw', tontine_id: 't1', member_id: 'm0' }, 'tok-alice')), { status: 403, error: 'forbidden' });
// an organizer of another tontine has no power here
assert.deepEqual(await j(await call({ kind: 'resetpw', tontine_id: 't2', member_id: 'm9' }, 'tok-orga')), { status: 403, error: 'forbidden' });
assert.equal(set.length, 0, 'nothing was changed by the refused calls');
step('only organizers of the tontine');

// ---------- reset ----------
// a member of ANOTHER tontine cannot be reached through this one
assert.deepEqual(await j(await call({ kind: 'resetpw', tontine_id: 't1', member_id: 'm9' }, 'tok-owner')), { status: 404, error: 'not_found' });
assert.deepEqual(await j(await call({ kind: 'resetpw', tontine_id: 't1', member_id: 'nobody' }, 'tok-owner')), { status: 404, error: 'not_found' });
// a member added by hand has no account
assert.deepEqual(await j(await call({ kind: 'resetpw', tontine_id: 't1', member_id: 'm2' }, 'tok-owner')), { status: 409, error: 'no_account' });
// nobody resets their own password this way
assert.deepEqual(await j(await call({ kind: 'resetpw', tontine_id: 't1', member_id: 'm0' }, 'tok-owner')), { status: 400, error: 'self' });
assert.equal(set.length, 0);
// the principal organizer and a co-organizer can reset a member
for (const tok of ['tok-owner', 'tok-orga']) {
  set.length = 0;
  const r = await call({ kind: 'resetpw', tontine_id: 't1', member_id: 'm1' }, tok), b = await j(r);
  assert.equal(b.status, 200); assert.match(b.password, /^[a-z2-9]{8}$/);
  assert.deepEqual(set, [{ uid: ALICE, pw: b.password }], 'the password given to the organizer is the one stored');
  assert.equal(r.headers.get('cache-control'), 'no-store');
}
step('reset: scope, accounts, self');

// a failure of the auth admin API is reported, without leaking a password
const bad = await handle(new Request('https://x/f', { method: 'POST', headers: { authorization: 'Bearer tok-owner' }, body: JSON.stringify({ kind: 'resetpw', tontine_id: 't1', member_id: 'm1' }) }), { ...deps(), setPassword: async () => { throw new Error('boom'); } });
assert.equal(bad.status, 500); assert.ok(!('password' in await bad.json()));
step('server error');
console.log('All checks passed');
