/** v1.15.0: Bewertungen — internes Rating, Kunden-Link, öffentliche Einlösung. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');

let server; let baseUrl; let adminCookie; let adrian;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  })).headers.get('set-cookie');
});

after(async () => { server.close(); await db.destroy(); });

test('Internes Rating: vier Kriterien, Gesamt als Durchschnitt, Validierung', async () => {
  const res = await post('/api/ratings/intern', {
    expert_id: adrian.id, fachlichkeit: 5, zuverlaessigkeit: 5, kommunikation: 4, wirkung: 4,
    kommentar: 'Sehr starker Auftritt im Carve-out.',
  }, { cookie: adminCookie });
  assert.strictEqual(res.status, 201);
  const { rating } = await res.json();
  assert.strictEqual(rating.sterne, 5, 'Durchschnitt 4,5 gerundet auf 5');

  const bad = await post('/api/ratings/intern', { expert_id: adrian.id, fachlichkeit: 9, zuverlaessigkeit: 1, kommunikation: 1, wirkung: 1 }, { cookie: adminCookie });
  assert.strictEqual(bad.status, 400);

  const d = await (await fetch(`${baseUrl}/api/ratings/expert/${adrian.id}`, { headers: { cookie: adminCookie } })).json();
  assert.strictEqual(d.schnitt_intern, 5);
  const anon = await fetch(`${baseUrl}/api/ratings/expert/${adrian.id}`);
  assert.strictEqual(anon.status, 401);
});

test('Kundenbewertung: Link-Mail raus, öffentlich einlösen, nur einmal', async () => {
  const res = await post('/api/ratings/kunde-link', {
    expert_id: adrian.id, email: 'kunde@rheinmetall.example', projekt: 'Carve-out QM',
  }, { cookie: adminCookie });
  assert.strictEqual(res.status, 201);

  const mail = await db('mail_outbox').where({ to_email: 'kunde@rheinmetall.example', template_key: 'kundenbewertung' }).first();
  assert.ok(mail, 'Anfrage-Mail in der Outbox');
  assert.ok(!mail.body_html.includes('—'), 'keine Gedankenstriche');
  const token = mail.body_html.match(/token=([a-f0-9]+)/)[1];

  // Öffentliche Infoseite
  const info = await (await fetch(`${baseUrl}/api/public/bewertung/${token}`)).json();
  assert.match(info.experte, /Adrian/);
  assert.strictEqual(info.projekt, 'Carve-out QM');

  // Einlösen
  const abgabe = await post(`/api/public/bewertung/${token}`, { sterne: 5, kommentar: 'Hervorragende Arbeit.' });
  assert.strictEqual(abgabe.status, 200);
  const row = await db('ratings').where({ token }).first();
  assert.strictEqual(row.sterne, 5);
  assert.ok(row.eingeloest_at);

  // Zweite Abgabe gesperrt
  const doppelt = await post(`/api/public/bewertung/${token}`, { sterne: 1 });
  assert.strictEqual(doppelt.status, 410);
  // Ungültiger Token
  const falsch = await fetch(`${baseUrl}/api/public/bewertung/gibtsnicht`);
  assert.strictEqual(falsch.status, 404);

  const d = await (await fetch(`${baseUrl}/api/ratings/expert/${adrian.id}`, { headers: { cookie: adminCookie } })).json();
  assert.strictEqual(d.schnitt_kunde, 5);
  assert.strictEqual(d.offen_kunde, 0);
});

test('DSGVO: Bewertungen hängen an der Löschkaskade', async () => {
  const { deleteExpertCascade } = require('../utils/expertDeletion');
  const [ex] = await db('experts').insert({ tenant_id: adrian.tenant_id, vorname: 'Tessa', nachname: 'Test', email: 'tessa@test.example', status: 'freigegeben' }).returning('*');
  await db('ratings').insert({ tenant_id: adrian.tenant_id, expert_id: ex.id, typ: 'intern', sterne: 3 });
  await deleteExpertCascade(ex, { tenantId: adrian.tenant_id, grund: 'Test' });
  assert.strictEqual((await db('ratings').where({ expert_id: ex.id })).length, 0, 'Ratings mitgelöscht');
});
