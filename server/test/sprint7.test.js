/** Sprint-7-Tests: Personalisierung, Serienmail, Terminanfrage, Historie, Rechte. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');
const { outbox } = require('../providers/mail/stub');

let server;
let baseUrl;
let adminCookie;
let adrian;

const post = (p, body, headers = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const res = await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  });
  adminCookie = res.headers.get('set-cookie');
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
});

after(async () => {
  server.close();
  await db.destroy();
});

test('Einzelmail: Platzhalter werden personalisiert, Historie entsteht', async () => {
  const res = await post('/api/communications/send', {
    expert_ids: [adrian.id],
    typ: 'einzelmail',
    betreff: 'Mandat für {vorname}',
    body: '{briefanrede},\n\nwir haben ein passendes Mandat für Sie.',
  }, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.strictEqual(d.gesendet, 1);

  const mail = outbox.findLast((m) => m.to === adrian.email);
  assert.strictEqual(mail.subject, 'Mandat für Adrian');
  assert.match(mail.text, /Sehr geehrter Herr Spörri/);

  const row = await db('communications').where({ expert_id: adrian.id, typ: 'einzelmail' }).orderBy('id', 'desc').first();
  assert.ok(row && /Sehr geehrter Herr Spörri/.test(row.body), 'personalisierter Text in der Historie');
});

test('Terminanfrage: Slots + gespeicherter Teams-Link in der Mail', async () => {
  const set = await fetch(`${baseUrl}/api/communications/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ teams_link: 'https://teams.microsoft.com/l/meetup-join/phalanx-test' }),
  });
  assert.strictEqual(set.status, 200);

  const res = await post('/api/communications/send', {
    expert_ids: [adrian.id],
    typ: 'terminanfrage',
    betreff: 'Kennenlernen zum Projekt {projekt}',
    body: '{briefanrede},\n\nlassen Sie uns kurz sprechen.',
    slots: ['Di 21.07., 10:00 Uhr', 'Mi 22.07., 14:00 Uhr'],
  }, { cookie: adminCookie });
  assert.strictEqual((await res.json()).gesendet, 1);
  const mail = outbox.findLast((m) => m.to === adrian.email);
  assert.match(mail.text, /Terminvorschläge/);
  assert.match(mail.text, /Di 21\.07\./);
  assert.match(mail.text, /teams\.microsoft\.com/);
});

test('Historie-Endpoint filtert nach Experte; Rechte geprüft', async () => {
  const hist = await fetch(`${baseUrl}/api/communications?expert_id=${adrian.id}`, { headers: { cookie: adminCookie } }).then((r) => r.json());
  assert.ok(hist.rows.length >= 2 && hist.rows.every((r) => r.expert_id === adrian.id));
  const anon = await fetch(`${baseUrl}/api/communications`);
  assert.strictEqual(anon.status, 401);
});

test('Empfänger ohne E-Mail wird sauber als Fehler gemeldet', async () => {
  const tenant = await db('tenants').where({ slug: 'phalanx' }).first();
  const [ghost] = await db('experts').insert({
    tenant_id: tenant.id, vorname: 'Test', nachname: 'OhneMail', status: 'registriert',
  }).returning('*');
  const res = await post('/api/communications/send', {
    expert_ids: [ghost.id],
    typ: 'einzelmail',
    betreff: 'Testbetreff',
    body: 'Testinhalt',
  }, { cookie: adminCookie });
  const d = await res.json();
  assert.strictEqual(d.fehlgeschlagen, 1);
});
