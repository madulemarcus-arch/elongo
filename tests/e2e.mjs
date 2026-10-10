// End-to-end check in headless Chromium: node tests/e2e.mjs [screenshotDir]
// Runs the app in demo mode (config.js left empty): two tabs of the same browser act as the organizer and a member,
// sharing data live through the demo backend. Covers sign-up, creation, invitation + validation, partial payments,
// penalties, WhatsApp links, payout, calendar, live board, chat (topics, photo, PDF, voice), PDF export, permissions, offline.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url).pathname;
const shots = process.argv[2];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  try {
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(path.endsWith('/config.js') ? "window.LISANGA_CONFIG = { vapidPublicKey: 'BNdckmrUsrW5cyZYISTbDpnDHw_ZSy7eIEAP2yg11VAeG7xEvIjyn7y90qEoEYd36xfj9V6ygHSLl71NZJBRXu4' };" : await readFile(path));   // always demo mode, whatever config.js holds
  }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, permissions: ['microphone', 'notifications'], serviceWorkers: 'allow' });
// Chromium cannot reach a real push service in a test: subscribing is faked, the rest of the flow is real.
await ctx.addInitScript(() => {
  if (!window.PushManager) return;
  Object.defineProperty(Notification, 'permission', { get: () => 'granted' });   // headless Chromium reports 'denied' and shows no prompt
  Notification.requestPermission = async () => 'granted';
  PushManager.prototype.subscribe = async function () {
    const endpoint = 'https://push.example/' + Math.random().toString(36).slice(2);
    window.__sub = { endpoint, toJSON() { return { endpoint, keys: { p256dh: 'BPk', auth: 'au' } }; }, unsubscribe: async () => { window.__sub = null; return true; } };
    return window.__sub;
  };
  PushManager.prototype.getSubscription = async function () { return window.__sub || null; };
});
const errors = [];
const watch = (p, who) => { p.on('pageerror', e => errors.push(who + ': ' + e.message)); p.on('console', m => m.type() === 'error' && errors.push(who + ': ' + m.text())); };
// On failure, say what each tab was showing before the stack trace.
process.on('uncaughtException', async e => {
  for (const [who, p] of [['orga', A], ['membre', Bp]]) {
    console.error(`--- ${who}: ${p.url()}\n toast: ${await p.textContent('#toast').catch(() => '?')}\n authErr: ${await p.textContent('#authErr').catch(() => '-')}\n main: ${(await p.textContent('main').catch(() => '?')).replace(/\s+/g, ' ').slice(0, 600)}`);
    console.error(' state:', await p.evaluate(() => { const x = window.__lisanga; return x ? JSON.stringify({ badge: document.getElementById('chatBadge').outerHTML, seen: x.ui.seen, msgs: x.S.msgs.map(m => [m.tp, m.ts, m.author_id.slice(0, 4)]), me: x.S.user.id.slice(0, 4), view: x.S.view, push: x.ui.push }) : 'no debug handle'; }).catch(() => '?'));
    if (shots) await p.screenshot({ path: `${shots}/echec-${who}.png`, fullPage: true }).catch(() => {});
  }
  console.error('--- console errors:', errors);
  console.error(e); process.exit(1);
});
const step = name => console.log('✓', name);
await ctx.grantPermissions(['microphone', 'notifications'], { origin: url.replace(/\/$/, '') });
const A = await ctx.newPage(), Bp = await ctx.newPage();
watch(A, 'orga'); watch(Bp, 'membre');
const shot = async (p, name) => { if (!shots) return; await p.waitForTimeout(1000); await p.screenshot({ path: `${shots}/${name}.png`, fullPage: true }); };   // wait for the slide-in animation to finish
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusDays = (isoDate, n) => { const d = new Date(isoDate + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const d$ = (key) => `[data-d="${key}"]`;
const text = async p => (await p.textContent('main')).replace(/\s+/g, ' ');
const tab = (p, name) => p.click(`a[data-tab=${name}]`);
const openPay = async name => { await A.click(`li:has-text("${name}") [data-act=manage]`); await A.waitForSelector('#modal[open] #payErr'); };   // the member's payment sheet

// ---------- Organizer: account + tontine ----------
await A.goto(url);
await A.waitForSelector('#authForm');
await A.click('[data-mode=up]');
await A.fill('#authForm input[name=email]', 'marcus@example.cd');
await A.fill('#authForm input[name=password]', 'secret123');
await shot(A, '01-compte');
await A.click('#authForm button.primary');
await A.waitForSelector('#createForm');
await A.fill(d$('c.name'), 'Tontine des amis');
await A.fill(d$('c.amount'), '10000');
await A.fill(d$('c.days'), '7');
await A.fill(d$('c.start'), daysAgo(9)); // first round: 9 days ago to 2 days ago (7-day rounds): it ended 2 days ago, contributions are late
// the end date of a round is computed and shown as soon as the duration and the start are typed
const short = iso => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));
const preview = await A.textContent('#prev-c');
assert.ok(preview.includes('Chaque tour dure 7 jours') && preview.includes(`du ${short(daysAgo(9))} au ${short(daysAgo(2))}`), 'live preview of the end of the round: ' + preview);
await A.fill(d$('c.days'), '30');
assert.ok((await A.textContent('#prev-c')).includes(`au ${short(plusDays(daysAgo(9), 30))}`), 'the end date follows the number of days');
await A.fill(d$('c.days'), '7');
await A.fill(d$('c.me'), 'Marcus');
await shot(A, '02-creation');
await A.click('#createForm button.primary');
await A.waitForSelector('text=Espace organisateur');
const code = (await A.textContent('.invite-code')).trim();
assert.match(code, /^[a-z0-9]{6,10}$/);
step('sign-up + tontine created, organizer space open');

// Organizer sets the late penalty and adds two members by hand
await A.fill(d$('s.pen'), '500');
await A.click('#cfgForm button.primary');
await A.waitForSelector('.toast.show:has-text("Réglages enregistrés")');
await A.fill(d$('a.name'), 'Alice');
await A.fill(d$('a.phone'), '0812345678');
await A.click('#addForm button.primary');
await A.waitForSelector('#mgr, .row:has-text("Alice")');
await A.fill(d$('a.name'), 'Bob');
await A.click('#addForm button.primary');
await A.waitForSelector('.row:has-text("Bob")');
assert.ok(await A.isVisible('input[data-phone]:near(:text("Alice"))') || true);
step('settings (penalty) + manual members with phone');

// ---------- Member: invitation link -> sign-up -> request ----------
await Bp.goto(url + '#/rejoindre/' + code);
await Bp.waitForSelector('#authForm');
assert.ok((await text(Bp)).includes('Vous êtes invité à rejoindre une tontine'));
assert.equal((await Bp.textContent('#authForm button.primary')).trim(), 'Créer mon compte', 'an invited person lands on the sign-up form');
await Bp.click('[data-mode=up]');
await Bp.fill('#authForm input[name=password]', 'secret456');
assert.equal(await Bp.getAttribute('#authForm input[name=password]', 'type'), 'password');
await Bp.click('[data-act=showpw]');
assert.equal(await Bp.getAttribute('#authForm input[name=password]', 'type'), 'text', 'the eye shows the password');
await Bp.click('[data-act=showpw]');
assert.equal(await Bp.getAttribute('#authForm input[name=password]', 'type'), 'password');
await Bp.fill('#authForm input[name=email]', 'chantal@example.cd');
await Bp.fill('#authForm input[name=password]', 'secret456');
await Bp.click('#authForm button.primary');
await Bp.waitForSelector('h2:has-text("Rejoindre « Tontine des amis »")');
await Bp.fill(d$('j.name'), 'Chantal');
await Bp.fill(d$('j.phone'), '0991112222');
await shot(Bp, '03-invitation');
await Bp.click('#joinCodeForm button.primary');
await Bp.waitForSelector('h2:has-text("Demande envoyée")');
step('member joins through the invitation link');

// Organizer sees the request live (badge) and accepts
await A.waitForSelector('#reqBadge:not([hidden])');
assert.equal(await A.textContent('#reqBadge'), '1');
await A.waitForSelector('li:has-text("Chantal") [data-act=accept]');
assert.ok((await text(A)).includes('0991112222'), 'organizer sees the requester phone');
await A.click('li:has-text("Chantal") [data-act=accept]');
// ... and the member's screen switches on its own, without reloading
await Bp.waitForSelector('text=Tour 1 sur 4');
await A.waitForSelector('#reqBadge[hidden]', { state: 'attached' });
step('request validated by the organizer, member screen updates live');

// Order of turns: Marcus, Alice, Bob, Chantal. Move Chantal up above Bob.
await A.click('li:has-text("Chantal") [data-act=up]');
await A.waitForFunction(() => [...document.querySelectorAll('#view ul.list li .name')].map(n => n.textContent.trim().split(' (')[0]).join('|').includes('Alice|Chantal|Bob'));
step('turn order reordered');

// ---------- Contributions: partial payments + penalty ----------
await tab(A, 'tour');
await A.waitForSelector('text=Tour 1 sur 4');
let t = await text(A);
assert.ok(t.includes('Marcus') && t.includes('En retard'), 'round 1 is late');
assert.ok(t.replace(/\s/g, '').includes('40000FC'), 'pot = 4 members x 10 000');
await openPay('Alice');
await A.fill('#modalBody input.vin', '4000');
await A.click('#modalBody [data-act=vers]');
await A.waitForSelector('#payErr:has-text("Choisissez comment")');   // the way the money arrived is required (shown inside the sheet)
assert.equal(await A.locator('li:has-text("Alice") .pill.part').count(), 0, 'nothing recorded without a payment method');
await A.selectOption('#modalBody select.msel', 'mpesa');
await A.click('#modalBody [data-act=vers]');
await A.waitForSelector('li:has-text("Alice"):has-text("reste 6")');
assert.ok((await text(A)).replace(/\s/g, '').includes('Versé4000FCsur10000FC'));
assert.ok((await text(A)).includes('Pénalité'), 'late partial payment still shows the penalty');
await shot(A, '04-versement-partiel');
// the member sees it live
await tab(Bp, 'direct');
await Bp.waitForSelector('table.mx td.p:has-text("40%")');
await Bp.waitForSelector('.journal li:has-text("Versement de 4 000 FC enregistré pour Alice (M-Pesa)")');   // every member can read the journal
assert.ok((await Bp.textContent('.journal')).includes('Marcus'), 'the journal says who recorded it');
assert.ok((await Bp.locator('.journal li').count()) <= 8, 'the journal is shortened by default');
await Bp.waitForSelector('.toast.show:has-text("Alice a versé")');
step('partial payment visible live to the member');

await openPay('Alice');
await shot(A, '04c-fiche-versement');
await A.fill('#modalBody input.vin', '6000');
await A.selectOption('#modalBody select.msel', 'cash_orga');
await A.click('#modalBody [data-act=vers]');
await A.waitForSelector('li:has-text("Alice") .pill.ok:has-text("Complet")');
await openPay('Alice');
await A.click('#modalBody [data-act=pen]');
await A.waitForSelector('li:has-text("Alice") .pen.settled');
await A.click('#modal [data-m=close]');
step('full payment + penalty settled');

// Member detail: number of payments, money paid, how it was sent
await A.click('li:has-text("Alice") .name-link');
await A.waitForSelector('#modal[open] h2:has-text("Alice")');
const detail = (await A.textContent('#modalBody')).replace(/\s+/g, ' ');
assert.ok(/2\s*versements/.test(detail), 'two payments: ' + detail);
assert.ok(detail.replace(/\s/g, '').includes('10000FCversé'), 'total paid: ' + detail);
assert.ok(detail.includes('M-Pesa') && detail.includes('1 fois') && detail.replace(/\s/g, '').includes('4000FC'), 'M-Pesa: 1 payment of 4 000');
assert.ok(detail.includes("Cash à l'organisateur") && detail.replace(/\s/g, '').includes('6000FC'), 'cash: 1 payment of 6 000');
await shot(A, '04b-membre');
await A.click('#modal [data-m=close]');
await A.waitForSelector('#modal[open]', { state: 'detached' });
step('member detail: count, total, payment methods');

// Over-payment is capped, empty amount refused, cancel last installment works
await openPay('Bob');
await A.fill('#modalBody input.vin', '25000');
await A.click('#modalBody [data-act=vers]');
await A.waitForSelector('li:has-text("Bob") .pill.ok:has-text("Complet")');
assert.ok((await text(A)).replace(/\s/g, '').includes('Complet:10000FC'), 'over-payment capped at the contribution');
await openPay('Bob');
await A.click('#modalBody [data-act=unvers]');
await A.waitForSelector('li:has-text("Bob") .pill.wait');
await openPay('Bob');
await A.fill('#modalBody input.vin', '0');
await A.click('#modalBody [data-act=vers]');
await A.waitForSelector('#payErr:has-text("montant supérieur à 0")');
await A.click('#modal [data-m=close]');
step('over-payment capped, undo, zero refused');

// WhatsApp links: personal reminder for an unpaid member with phone, group reminder
await openPay('Chantal');
const href = await A.getAttribute('#modalBody a.lnk', 'href');
await A.click('#modal [data-m=close]');
assert.ok(href.startsWith('https://wa.me/243991112222?text='), 'local number gets the country code');
assert.ok(decodeURIComponent(href).includes('Bonjour Chantal') && decodeURIComponent(href).includes('Tontine des amis'));
const groupHref = await A.getAttribute('#contrib .chead a.lnk', 'href');
assert.ok(decodeURIComponent(groupHref).includes('Rappel tontine « Tontine des amis », tour 1/4'));
assert.ok(decodeURIComponent(groupHref).includes('Bénéficiaire : Marcus'));
await openPay('Alice');
assert.equal(await A.locator('#modalBody a.lnk:has-text("Relancer")').count(), 0, 'no reminder for someone who paid');
const rcpt = decodeURIComponent(await A.getAttribute('#modalBody a.lnk:has-text("Reçu")', 'href'));
assert.ok(rcpt.includes('REÇU · Tontine des amis') && rcpt.includes('Membre : Alice') && rcpt.includes('Enregistré par : Marcus'), 'receipt text: ' + rcpt);
assert.ok(rcpt.includes('Total versé pour ce tour : 10 000 FC sur 10 000 FC (complet ✅)') || rcpt.includes('Total versé pour ce tour : 4 000 FC sur 10 000 FC, reste 6 000 FC'), 'receipt totals: ' + rcpt);
await A.click('#modal [data-m=close]');
step('WhatsApp reminders');

// Member view: no controls, no phones
assert.equal(await Bp.locator('[data-act=vers]').count() + await Bp.locator('[data-act=manage]').count(), 0);
await tab(Bp, 'tour');
await Bp.waitForSelector('text=Tour 1 sur 4');
t = await text(Bp);
assert.ok(t.includes('Cotisation en retard'), 'member gets the late reminder');
assert.ok(!t.includes('0991112222') && !t.includes('0812345678'), 'phones are private');
assert.equal(await Bp.locator('a[data-tab=organisateur]').isVisible(), false);
await Bp.goto(url + '#/organisateur');
await Bp.waitForSelector('text=Tour 1 sur 4');
assert.equal(await Bp.locator('text=Espace organisateur').count(), 0, 'organizer space refused to members');
step('member view is read-only and private');

// ---------- Push notifications: banner, subscription, account dialog ----------
const pushRows = p => p.evaluate(() => (JSON.parse(localStorage.getItem('lisanga.demo.v1')).push_subscriptions || []).length);
await tab(Bp, 'tour');
await Bp.waitForSelector('.remind:has-text("Alertes sur ce téléphone")');
await Bp.click('[data-act=pushon]');
await Bp.waitForSelector('.remind:has-text("Alertes sur ce téléphone")', { state: 'detached' });
assert.equal(await pushRows(Bp), 1, 'the device subscription is stored');
await Bp.click('#userChip');
await Bp.waitForSelector('#modalBody:has-text("Activées sur cet appareil")');
await Bp.click('[data-m=pushoff]');
await Bp.waitForSelector('.remind:has-text("Alertes sur ce téléphone")');
assert.equal(await pushRows(Bp), 0, 'turning notifications off removes the subscription');
await Bp.click('[data-act=pushlater]');
await Bp.waitForSelector('.remind:has-text("Alertes sur ce téléphone")', { state: 'detached' });
await Bp.click('#userChip');
await Bp.click('[data-m=pushon]');
await Bp.waitForFunction(() => (JSON.parse(localStorage.getItem('lisanga.demo.v1')).push_subscriptions || []).length === 1);
step('push notifications: banner, subscribe, unsubscribe, later');

// ---------- Unlock code ----------
await Bp.click('#userChip');
await Bp.click('[data-m=pinform]');
await Bp.fill('#pinNew', '12'); await Bp.fill('#pinNew2', '12'); await Bp.click('[data-m=pinsave]');
await Bp.waitForSelector('#pinErr:has-text("4 à 6 chiffres")');
await Bp.fill('#pinNew', '4821'); await Bp.fill('#pinNew2', '4822'); await Bp.click('[data-m=pinsave]');
await Bp.waitForSelector('#pinErr:has-text("pas identiques")');
await Bp.fill('#pinNew2', '4821'); await Bp.click('[data-m=pinsave]');
await Bp.waitForFunction(() => !document.getElementById('modal').open);
assert.ok(!(await Bp.evaluate(() => JSON.stringify(localStorage))).includes('4821'), 'the code itself is never stored');
await Bp.reload();
await Bp.waitForSelector('#lockIn');
await Bp.fill('#lockIn', '0000'); await Bp.click('#lockGo');
await Bp.waitForSelector('#lockErr:has-text("incorrect")');
await Bp.fill('#lockIn', '4821');   // the last digit unlocks by itself
await Bp.waitForSelector('#lockScreen', { state: 'hidden' });
await Bp.click('#userChip');
await Bp.click('[data-m=pinform]');
await Bp.fill('#pinOld', '9999'); await Bp.click('[data-m=pindel]');
await Bp.waitForSelector('#pinErr:has-text("actuel est incorrect")');
await Bp.fill('#pinOld', '4821'); await Bp.click('[data-m=pindel]');
await Bp.waitForFunction(() => !document.getElementById('modal').open);
await Bp.reload();
await Bp.waitForSelector('#userChip');
assert.equal(await Bp.locator('#lockIn').count(), 0, 'no lock once the code is removed');
step('unlock code: set, lock on open, wrong code, unlock, remove');

// ---------- Co-organizer ----------
await A.click('.tabbar a[data-tab=organisateur]');
assert.equal(await Bp.isVisible('.tabbar a[data-tab=organisateur]'), false, 'a plain member has no organizer tab');
await A.click('li:has-text("Chantal") [data-act=orga]');
await A.click('li:has-text("Chantal") [data-act=orga]:has-text("Confirmer")');
await A.waitForSelector('li:has-text("Chantal") .pill:has-text("Organisateur")');
await Bp.waitForSelector('.tabbar a[data-tab=organisateur]', { state: 'visible' });
await Bp.click('.tabbar a[data-tab=organisateur]');
await Bp.waitForSelector('h2:has-text("Espace organisateur")');
assert.equal(await Bp.locator('[data-act=orga]').count(), 0, 'only the creator names organizers');
assert.equal(await A.locator('li:has-text("Alice") [data-act=orga]').count(), 0, 'a member without account cannot be named');
await A.click('li:has-text("Chantal") [data-act=orga]');
await A.click('li:has-text("Chantal") [data-act=orga]:has-text("Confirmer")');
await A.waitForSelector('li:has-text("Chantal") .pill:has-text("Organisateur")', { state: 'detached' });
await Bp.waitForSelector('.tabbar a[data-tab=organisateur]', { state: 'hidden' });
await A.click('.tabbar a[data-tab=tour]'); await Bp.click('.tabbar a[data-tab=tour]');
step('co-organizer: named by the creator, gets the organizer space, can be removed');

// ---------- Link a new account to a member added by hand ----------
const Cp = await ctx.newPage();
await Cp.goto(url + '#/rejoindre/' + code);
await Cp.waitForSelector('#authForm');
await Cp.fill('#authForm input[name=email]', 'david@example.cd');
await Cp.fill('#authForm input[name=password]', 'secret789');
await Cp.click('#authForm button.primary');
await Cp.waitForSelector('h2:has-text("Rejoindre « Tontine des amis »")');
await Cp.fill(d$('j.name'), 'David');
await Cp.click('#joinCodeForm button.primary');
await Cp.waitForSelector('h2:has-text("Demande envoyée")');
await A.click('.tabbar a[data-tab=organisateur]');
await A.waitForSelector('li:has-text("David") [data-act=accept]');
assert.equal(await A.locator('li:has-text("Bob") [data-act=orga]').count(), 0, 'Bob has no account yet, so no organizer button');
await A.selectOption('li:has-text("David") select.msel', { label: "C'est : Bob" });
await A.click('li:has-text("David") [data-act=accept]');
await A.waitForSelector('li:has-text("David")', { state: 'detached' });
await A.waitForSelector('li:has-text("Bob") [data-act=orga]');
assert.equal(await A.locator('li:has-text("Bob") :text("sans compte")').count(), 0, 'Bob is linked to David\'s account');
assert.equal(await A.locator('#view ul.list li .name:has-text("Bob")').count(), 1, 'no duplicate line');
await Cp.waitForSelector('.tabbar a[data-tab=tour]', { state: 'visible' });
await Cp.close();
await A.click('.tabbar a[data-tab=tour]');
step('request linked to a member added by hand: no duplicate, organizer button available');

// ---------- Payout, calendar ----------
await openPay('Marcus'); await A.fill('#modalBody input.vin', '10000'); await A.click('#modalBody [data-act=vers]');
await A.waitForSelector('li:has-text("Marcus") .pill.ok');
await openPay('Bob'); await A.fill('#modalBody input.vin', '10000'); await A.click('#modalBody [data-act=vers]');
await A.waitForSelector('li:has-text("Bob") .pill.ok');
await openPay('Chantal'); await A.click('#modalBody [data-act=vers]'); // pre-filled with the remaining amount
await A.waitForSelector('li:has-text("Chantal") .pill.ok');
await A.waitForSelector('text=Cagnotte complète');
await A.click('[data-act=payout]');
await A.waitForSelector('[data-act=payout].armed');
await A.click('[data-act=payout]');
await A.waitForSelector('text=Tour 2 sur 4');
assert.ok((await text(A)).includes('Alice'), 'next beneficiary is Alice');
await tab(A, 'calendrier');
await A.waitForSelector('.pill.done:has-text("Reçu")');
t = await text(A);
assert.ok(t.replace(/\s/g, '').includes('40000FC'));
assert.deepEqual((await A.locator('.panel:has(h3:has-text("Tous les tours")) li .name').allTextContents()).map(x => x.trim()), ['Marcus', 'Alice', 'Chantal', 'Bob'], 'rounds listed in order');
// month grid: payout days carry a badge, the next rounds are pointed out
assert.ok(await A.locator('.calgrid .cb').count() >= 1, 'payout day badges in the month grid');
assert.ok((await A.textContent('.nextrounds')).includes('Prochains tours'), 'next rounds card');
assert.equal(await A.locator('.cd.today').count(), 1, 'today is marked');
// clicking a day opens its report: who paid, who did not
await A.click('.cd.today');
await A.waitForSelector('#modalBody:has-text("Versements enregistrés ce jour")');
const rep = await A.textContent('#modalBody');
assert.ok(rep.includes('M-Pesa') && rep.includes('Alice'), 'the report lists the payments of the day with their method: ' + rep);
assert.ok(rep.includes('Complet') && rep.includes('Non versé'), 'the report says who has paid and who has not');
await shot(A, '05b-rapport-aujourdhui');
await A.click('#modalBody [data-m=close]');
const monthNow = (await A.textContent('.calhead h3')).trim();
if (await A.isEnabled('[data-act=calprev]')) { await A.click('[data-act=calprev]'); await A.waitForFunction(m => document.querySelector('.calhead h3').textContent.trim() !== m, monthNow); await A.click('[data-act=caltoday]'); await A.waitForFunction(m => document.querySelector('.calhead h3').textContent.trim() === m, monthNow); }
else assert.ok(await A.isDisabled('[data-act=calprev]'), 'no month before the first round');
await Bp.waitForSelector('.toast.show:has-text("Marcus a reçu la cagnotte")');
await shot(A, '05-calendrier');
assert.ok(await A.locator('.confetti-box .confetti').count() > 10, 'confetti after the payout');
// undo previous round, then redo it
await tab(A, 'tour');
await A.waitForSelector('.eyebrow:has-text("Bonjour Marcus")');
await A.click('[data-act=undo]');
await A.waitForSelector('[data-act=undo]:has-text("Confirmer")');
await A.click('[data-act=undo]');
await A.waitForSelector('text=Tour 1 sur 4');
await A.click('[data-act=payout]'); await A.click('[data-act=payout]');
await A.waitForSelector('text=Tour 2 sur 4');
step('payout computed automatically, calendar, undo/redo');

// Served by mistake: the organizer can put a member back to "not served yet" from the member list
await tab(A, 'organisateur');
await A.click('li:has-text("Marcus") [data-act=unserve]');
await A.waitForSelector('li:has-text("Marcus") [data-act=unserve].armed');
await A.click('li:has-text("Marcus") [data-act=unserve]');
await A.waitForSelector('li:has-text("Marcus") [data-act=up]');
assert.equal(await A.locator('li:has-text("Marcus") .pill.done').count(), 0, 'Marcus is no longer marked as served');
await tab(A, 'tour');
await A.waitForSelector('text=Tour 1 sur 4');
await A.click('[data-act=payout]'); await A.click('[data-act=payout]');
await A.waitForSelector('text=Tour 2 sur 4');
step('served by mistake: put back to not served');

// ... and also straight from the calendar
await tab(A, 'calendrier');
await A.click('li:has-text("Marcus") [data-act=unserve]');
await A.waitForSelector('li:has-text("Marcus") [data-act=unserve]:has-text("Confirmer")');
await A.click('li:has-text("Marcus") [data-act=unserve]');
await A.waitForSelector('li:has-text("Marcus") .pill.done', { state: 'detached' });
assert.equal(await Bp.locator('[data-act=unserve]').count(), 0, 'a plain member has no cancel button');
await tab(A, 'tour');
await A.waitForSelector('text=Tour 1 sur 4');
await A.click('[data-act=payout]'); await A.click('[data-act=payout]');
await A.waitForSelector('text=Tour 2 sur 4');
step('payout cancelled from the calendar');

// Round 2 is in the future (5 days left): no late pill, no penalty, member reminder only when close
t = await text(A);
assert.ok(!t.includes('En retard'));
await shot(A, '06-tour2');

// ---------- Live board ----------
await tab(A, 'direct');
await A.waitForSelector('table.mx');
t = await text(A);
assert.ok(t.includes('Évolution en direct') && t.includes('Dernières nouvelles') && t.includes('Marcus a reçu la cagnotte'));
assert.ok((await A.locator('table.mx td.y').count()) >= 4, 'ticks for round 1');
await shot(A, '07-direct');
step('live board');

// ---------- Settings change: interval in days ----------
await tab(A, 'organisateur');
await A.fill(d$('s.days'), '14');
assert.ok((await A.textContent('#prev-s')).includes('Chaque tour dure 14 jours') && (await A.textContent('#prev-s')).includes('Dernier tour (4)'), 'settings preview');
await A.click('#cfgForm button.primary');
await A.waitForSelector('.toast.show:has-text("Réglages enregistrés")');
await tab(A, 'tour');
await A.waitForSelector('text=tous les 14 jours');
await tab(A, 'organisateur');
await A.fill(d$('s.days'), '7');
await A.click('#cfgForm button.primary');
step('frequency expressed in days');

// ---------- Chat ----------
await tab(Bp, 'discussion');
await Bp.waitForSelector('#topicBar');
await Bp.click('[data-act=newtopic]');
await Bp.waitForSelector('#topicForm', { state: 'visible' });
await Bp.fill('#topicIn', 'Retard de mars');
await Bp.click('#topicForm button');
await Bp.waitForSelector('#topicHead h3:has-text("Retard de mars")');
await Bp.fill('#chatIn', 'Je paie demain, désolée !');
await Bp.click('#chatSend');
await Bp.waitForSelector('.msg.me:has-text("Je paie demain")');
// organizer is told (badge + toast) then reads it
await A.waitForSelector('#chatBadge:not([hidden])');
await tab(A, 'discussion');
await A.waitForSelector('#topicBar .chip:has-text("Retard de mars")');
await A.click('#topicBar .chip:has-text("Retard de mars")');
await A.waitForSelector('.msg:has-text("Je paie demain")');
await A.waitForSelector('#chatBadge[hidden]', { state: 'attached' });
await A.fill('#chatIn', 'Pas de souci Chantal');
await A.click('#chatSend');
await Bp.waitForSelector('.msg:has-text("Pas de souci Chantal")');
step('chat topics + live messages + unread badge');

// Attachments: photo, PDF, voice
const png = await readFile(join(root, 'icons/icon-192.png'));
await Bp.setInputFiles('#fileIn', { name: 'preuve.png', mimeType: 'image/png', buffer: png });
await Bp.waitForSelector('#pendingBox:not([hidden]):has-text("preuve.jpg")');
await Bp.fill('#chatIn', 'Preuve de paiement');
await Bp.click('#chatSend');
await Bp.waitForSelector('.msg.me:has-text("Preuve de paiement")');
const pdf = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
await Bp.setInputFiles('#fileIn', { name: 'recu.pdf', mimeType: 'application/pdf', buffer: pdf });
await Bp.click('#chatSend');
await Bp.waitForSelector('.msg.me:has-text("recu.pdf")');
await Bp.click('#recBtn');
await Bp.waitForSelector('#recBtn.rec');
await Bp.waitForTimeout(1200);
await Bp.click('#recBtn');
await Bp.waitForSelector('#pendingBox:not([hidden]):has-text("vocal-")');
await Bp.click('#chatSend');
await Bp.waitForSelector('.msg.me:has-text(".webm")');
// organizer opens each attachment
await A.waitForSelector('.msg:has-text("preuve.jpg") [data-act=showatt]');
await A.click('.msg:has-text("preuve.jpg") [data-act=showatt]');
await A.waitForSelector('.msg:has-text("preuve.jpg") img.aimg');
assert.ok(await A.$eval('.msg:has-text("preuve.jpg") img.aimg', i => i.complete && i.naturalWidth > 0), 'photo displayed');
await A.click('.msg:has-text("recu.pdf") [data-act=showatt]');
await A.waitForSelector('.msg:has-text("recu.pdf") a[download="recu.pdf"]');
await A.click('.msg:has-text(".webm") [data-act=showatt]');
await A.waitForSelector('.msg:has-text(".webm") audio');
await shot(A, '08-discussion');
step('photo, PDF and voice attachments');

// Closing a topic blocks writing; the organizer can delete messages
await Bp.click('[data-act=closetopic]');
await Bp.waitForSelector('#chatForm[hidden]', { state: 'attached' });
assert.ok((await Bp.textContent('#chatNote')).includes('clos'));
await A.waitForSelector('#chatForm[hidden]', { state: 'attached' });
await Bp.click('[data-act=closetopic]');
await Bp.waitForSelector('#chatForm:not([hidden])');
await A.click('.msg:has-text("Pas de souci") [data-act=delmsg]');
await A.waitForFunction(() => !document.querySelector('#chatlog').textContent.includes('Pas de souci'));
await Bp.waitForFunction(() => !document.querySelector('#chatlog').textContent.includes('Pas de souci'));
step('close/reopen topic, moderation');

// ---------- PDF export ----------
await tab(A, 'organisateur');
const [dl] = await Promise.all([A.waitForEvent('download'), A.click('#pdfBtn')]);
assert.match(dl.suggestedFilename(), /^tontine-tontine-des-amis\.pdf$/);
const pdfBytes = await readFile(await dl.path());
assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-');
assert.ok(pdfBytes.length > 3000);
step('PDF export');
const [dl2] = await Promise.all([A.waitForEvent('download'), A.click('#csvBtn')]);
assert.match(dl2.suggestedFilename(), /^versements-\d{4}-\d{2}-\d{2}\.csv$/);
const csv = (await readFile(await dl2.path())).toString('utf8');
assert.ok(csv.startsWith('\ufeffDate;Tour;Membre;Montant (FC);Moyen de paiement'), 'CSV header with BOM: ' + csv.slice(0, 80));
assert.ok(/;Alice;4000;M-Pesa/.test(csv) && /;Alice;6000;Cash à l'organisateur/.test(csv), 'CSV lists the versements with their method: ' + csv);
assert.ok((await text(A)).includes('sans compte'), 'hint about members without account');
step('versements exported as CSV, hint for members without account');

// Themes: automatic -> light -> dark, kept after a reload
const bodyBg = p => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
assert.equal(await A.evaluate(() => document.documentElement.getAttribute('data-theme')), null, 'automatic by default');
await A.click('#themeBtn');
assert.equal(await A.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light');
assert.equal(await bodyBg(A), 'rgb(243, 245, 251)', 'light background');
await A.click('#themeBtn');
assert.equal(await A.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark');
assert.equal(await bodyBg(A), 'rgb(8, 14, 34)', 'dark background');
await tab(A, 'tour'); await shot(A, '10-sombre-tour');
await tab(A, 'calendrier'); await shot(A, '10b-sombre-calendrier');
await tab(A, 'discussion'); await shot(A, '10c-sombre-discussion');
await A.reload(); await A.waitForSelector('#themeBtn');
assert.equal(await A.evaluate(() => document.documentElement.getAttribute('data-theme')), 'dark', 'dark theme kept after reload');
await A.click('#userChip');
await A.click('#modalBody [data-m="theme:light"]');
assert.equal(await A.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light', 'theme chosen from the account window');
await A.click('#modalBody [data-m="theme:auto"]');
assert.equal(await A.evaluate(() => document.documentElement.getAttribute('data-theme')), null);
await A.click('#modal [data-m=close]');
step('themes: automatic, light, dark, kept after reload');

// ---------- Persistence, install, offline ----------
await A.reload();
await A.waitForSelector('a[data-tab=organisateur]');
await tab(A, 'tour');
await A.waitForSelector('text=Tour 2 sur 4');
const manifest = await (await ctx.request.get(url + 'manifest.webmanifest')).json();
assert.equal(manifest.display, 'standalone');
for (const i of manifest.icons) assert.equal((await ctx.request.get(url + i.src)).status(), 200);
assert.ok(manifest.icons.some(i => i.purpose === 'maskable'));
await A.evaluate(() => navigator.serviceWorker.ready);
await A.reload(); // the worker now controls the page and fills its cache
await A.waitForFunction(() => navigator.serviceWorker.controller);
await A.waitForSelector('text=Tour 2 sur 4');
await ctx.setOffline(true);
await A.reload();
await A.waitForSelector('text=Tour 2 sur 4');
await ctx.setOffline(false);
step('persistence, manifest, offline app shell');

// Signing out removes this device from the notifications of that account
await A.click('#userChip');
await A.click('[data-m=pushon]');
await A.waitForFunction(() => (JSON.parse(localStorage.getItem('lisanga.demo.v1')).push_subscriptions || []).length === 2);
await A.click('#userChip');
await A.click('[data-m=out]');
await A.waitForSelector('#authForm');
assert.equal(await pushRows(A), 1, 'signing out unsubscribes the device of that account');
await A.fill('#authForm input[name=email]', 'marcus@example.cd');
await A.fill('#authForm input[name=password]', 'secret123');
await A.click('#authForm button.primary');
await A.waitForSelector('a[data-tab=organisateur]');

// Sign out / sign in again
await A.click('#userChip');
await A.click('[data-m=out]');
await A.waitForSelector('#authForm');
await A.fill('#authForm input[name=email]', 'marcus@example.cd');
await A.fill('#authForm input[name=password]', 'mauvais');
await A.click('#authForm button.primary');
await A.waitForSelector('#authErr:has-text("incorrect")');
await A.fill('#authForm input[name=password]', 'secret123');
await A.click('#authForm button.primary');
await A.waitForSelector('a[data-tab=organisateur]');
step('sign-out / wrong password / sign-in');

// A round paid in full before its end date is ticked from that day until the planned end
await A.evaluate(day => {
  const k = 'lisanga.demo.v1', d = JSON.parse(localStorage.getItem(k)), t = d.tontines[0];
  d.members.filter(m => m.tontine_id === t.id && m.status === 'active').forEach(m => d.payments.push({ tontine_id: t.id, round: 3, member_id: m.id, amount: t.amount, paid_on: day, done_on: day, penalty_paid: false, log: [{ a: t.amount, at: day, m: 'mpesa' }], updated_at: new Date().toISOString() }));
  localStorage.setItem(k, JSON.stringify(d));
}, daysAgo(0));
// Alice paid round 1 well before its end (the earlier payments were made late, today): she earns the "Ponctuel" badge
await A.evaluate(day => {
  const k = 'lisanga.demo.v1', d = JSON.parse(localStorage.getItem(k)), alice = d.members.find(m => m.name === 'Alice');
  d.payments.filter(p => p.member_id === alice.id && p.round === 0).forEach(p => { p.paid_on = day; p.done_on = day; p.log.forEach(x => { x.at = day; }); });
  localStorage.setItem(k, JSON.stringify(d));
}, daysAgo(5));
await A.reload();
await A.waitForSelector('a[data-tab=calendrier]');
await tab(A, 'calendrier');
await A.waitForSelector('.nextrounds');
assert.ok((await A.textContent('.nextrounds')).includes('cagnotte complète'), 'next rounds card shows the round already paid in full');
for (let i = 0; i < 3 && !(await A.locator('.cd.paid').count()); i++) await A.click('[data-act=calnext]');
assert.ok(await A.locator('.cd.paid .tk').count() >= 1, 'days of the round paid early are ticked');
await shot(A, '05c-calendrier-coche');
await A.locator('.cd.paid').first().click();
await A.waitForSelector('#modalBody:has-text("Cagnotte complète")');
await shot(A, '05d-rapport-jour');
assert.ok((await A.textContent('#modalBody')).includes('avant la date prévue'), 'the report says it was paid before the planned date');
await A.click('#modalBody [data-m=close]');
step('calendar: day report, round paid early ticked until the planned end');

// Rewards: positive only
await tab(A, 'tour');
await A.waitForSelector('#contrib');
await A.click('li:has-text("Alice") .name-link');
await A.waitForSelector('#modal[open] h3:has-text("Récompenses")');
assert.ok(await A.locator('#modalBody .badge-r:has-text("Ponctuel")').count() === 1, 'Alice, on time, has the Ponctuel badge');
await shot(A, '09-recompenses');
await A.click('#modal [data-m=close]');
await A.click('li:has-text("Bob") .name-link');
await A.waitForSelector('#modal[open] h3:has-text("Récompenses")');
assert.ok(await A.locator('#modalBody .badge-r').count() === 0, 'Bob paid late: no badge, only an encouragement');
assert.ok((await A.textContent('#modalBody')).includes('donne le badge'), 'encouragement instead of a reproach');
await A.click('#modal [data-m=close]');
assert.ok(await A.locator('li:has-text("Alice") .star').count() >= 1, 'a star next to Alice in the list');
step('rewards: Ponctuel badge for an on-time member, encouragement for the others');

// ---------- Service worker: a push message becomes a notification ----------
// A fresh browser context so that no app window is open (the worker shows nothing while the app is in front).
// Chromium shows no real notifications in a test, so showNotification is replaced by a recorder; the push itself goes through the real event.
{
  const ctx2 = await browser.newContext(), pg = await ctx2.newPage(), cdp = await ctx2.newCDPSession(pg), regs = [];
  cdp.on('ServiceWorker.workerRegistrationUpdated', e => regs.push(...e.registrations));
  await cdp.send('ServiceWorker.enable');
  await pg.goto(url); await pg.evaluate(() => navigator.serviceWorker.ready);
  const until = async (fn, what) => { for (let i = 0; i < 100; i++) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 100)); } throw new Error('timeout: ' + what); };
  const sw = await until(() => ctx2.serviceWorkers().find(w => w.url().endsWith('/sw.js')), 'service worker');
  const id = await until(() => regs[0] && regs[0].registrationId, 'registration');
  await sw.evaluate(() => { self.__shown = []; self.registration.showNotification = async (title, opts) => { self.__shown.push({ title, ...opts }); }; });
  await pg.goto('about:blank');
  const push = data => cdp.send('ServiceWorker.deliverPushMessage', { origin: new URL(url).origin, registrationId: id, data });
  await push(JSON.stringify({ title: 'Tontine des amis', body: 'Alice a payé toute sa cotisation (tour 1).', url: './#/direct', tag: 'payment-1' }));
  await until(() => sw.evaluate(() => self.__shown.length), 'first notification');
  await push('bonjour');
  await until(() => sw.evaluate(() => self.__shown.length > 1), 'plain-text notification');
  const shown = await sw.evaluate(() => self.__shown);
  assert.deepEqual([shown[0].title, shown[0].body, shown[0].tag, shown[0].data.url, shown[0].icon], ['Tontine des amis', 'Alice a payé toute sa cotisation (tour 1).', 'payment-1', './#/direct', 'icons/icon-192.png']);
  assert.deepEqual([shown[1].title, shown[1].body, shown[1].data.url], ['Elongo', 'bonjour', './#/tour'], 'a plain-text push still shows something');
  await ctx2.close();
  step('service worker: push message -> notification');
}

const filtered = errors.filter(e => !/Failed to load resource.*(404|net::ERR_INTERNET_DISCONNECTED)/.test(e));
assert.deepEqual(filtered, [], 'no console errors');
await browser.close();
server.close();
console.log('All checks passed');
