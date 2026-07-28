/** v1.11.0: Assoziierte Partner — öffentliche Anfrage, Admin-Mail, Triage. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');

let server; let baseUrl; let adminCookie;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });

before(async () => {
  await db.migrate.latest();
  await seed();
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  })).headers.get('set-cookie');
});

after(async () => { server.close(); await db.destroy(); });

test('Öffentliche Partneranfrage: speichert, auditiert, informiert Admin per Mail', async () => {
  const res = await post('/api/public/partner-bewerbung', {
    vorname: 'Petra', nachname: 'Partner', email: 'petra@partner.example',
    telefon: '+49 170 000', fokus: ['recruiting', 'delivery', 'quatsch'],
    nachricht: 'Ich bringe zehn Jahre Restrukturierung mit.', consent: true,
  });
  assert.strictEqual(res.status, 201);

  const row = await db('partner_applications').where({ email: 'petra@partner.example' }).first();
  assert.strictEqual(row.status, 'neu');
  assert.deepStrictEqual(row.fokus_json, ['recruiting', 'delivery'], 'unbekannter Fokus wird verworfen');

  const mail = await db('mail_outbox').where({ template_key: 'partner_anfrage_intern' }).orderBy('id', 'desc').first();
  assert.ok(mail, 'Admin-Mail in der Outbox');
  assert.match(mail.subject, /Petra Partner/);
  assert.ok(!mail.body_html.includes('—'), 'keine Gedankenstriche');

  // Ohne Consent abgelehnt
  const bad = await post('/api/public/partner-bewerbung', { vorname: 'X', nachname: 'Y', email: 'x@y.example', consent: false });
  assert.strictEqual(bad.status, 400);
});

test('Admin-Triage: Liste sehen, Status wechseln; ohne Login kein Zugriff', async () => {
  const list = await fetch(`${baseUrl}/api/partner/bewerbungen`, { headers: { cookie: adminCookie } });
  assert.strictEqual(list.status, 200);
  const { bewerbungen } = await list.json();
  const petra = bewerbungen.find((b) => b.email === 'petra@partner.example');
  assert.ok(petra);

  const upd = await post(`/api/partner/bewerbungen/${petra.id}/status`, { status: 'angenommen' }, { cookie: adminCookie });
  assert.strictEqual(upd.status, 200);
  assert.strictEqual((await db('partner_applications').where({ id: petra.id }).first()).status, 'angenommen');

  const badStatus = await post(`/api/partner/bewerbungen/${petra.id}/status`, { status: 'kaputt' }, { cookie: adminCookie });
  assert.strictEqual(badStatus.status, 400);

  const anon = await fetch(`${baseUrl}/api/partner/bewerbungen`);
  assert.strictEqual(anon.status, 401);
});
