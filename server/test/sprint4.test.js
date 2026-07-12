/** Sprint-4-Tests: Änderungsverlauf, globales Audit-Log (+CSV), DSGVO-Export, Widerruf. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');

let server;
let baseUrl;
let adminCookie;
let expertCookie;
let adrian;

const req = (method) => (p, body, headers = {}) =>
  fetch(baseUrl + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const post = req('POST');
const put = req('PUT');

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const admin = await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  });
  adminCookie = admin.headers.get('set-cookie');

  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  await db('users').where({ id: adrian.user_id }).update({
    password_hash: await bcrypt.hash('sprint4-test-pw', 10),
    email_verified_at: db.fn.now(),
    is_approved: true,
  });
  const login = await post('/api/auth/login', { email: adrian.email, password: 'sprint4-test-pw' });
  expertCookie = login.headers.get('set-cookie');

  // Eine Änderung erzeugen, damit Verlauf gefüllt ist
  await put(`/api/experts/${adrian.id}`, { ort: 'Altendorf SZ' }, { cookie: adminCookie });
});

after(async () => {
  server.close();
  await db.destroy();
});

test('Änderungsverlauf am Profil liefert Einträge mit Akteur', async () => {
  const res = await fetch(`${baseUrl}/api/experts/${adrian.id}/audit`, { headers: { cookie: adminCookie } });
  assert.strictEqual(res.status, 200);
  const { rows } = await res.json();
  assert.ok(rows.length >= 2, 'Import + Update im Verlauf');
  const update = rows.find((r) => r.action === 'expert.update');
  assert.ok(update && update.actor_email, 'Update mit Akteur-E-Mail');
});

test('Globales Audit-Log: nur Admin, Filter wirkt, CSV kommt', async () => {
  const anon = await fetch(`${baseUrl}/api/audit`);
  assert.strictEqual(anon.status, 401);
  const asExpert = await fetch(`${baseUrl}/api/audit`, { headers: { cookie: expertCookie } });
  assert.strictEqual(asExpert.status, 403);

  const res = await fetch(`${baseUrl}/api/audit?resource=experts`, { headers: { cookie: adminCookie } });
  const { rows } = await res.json();
  assert.ok(rows.length > 0 && rows.every((r) => r.resource === 'experts'));

  const csv = await fetch(`${baseUrl}/api/audit/export.csv`, { headers: { cookie: adminCookie } });
  assert.strictEqual(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(await csv.text(), /Zeitpunkt;Aktion/);
});

test('DSGVO-Export liefert ZIP mit Daten und Dokumenten', async () => {
  const res = await fetch(`${baseUrl}/api/experts/me/export`, { headers: { cookie: expertCookie } });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/zip/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.strictEqual(buf.subarray(0, 2).toString(), 'PK', 'ZIP-Signatur');
  assert.ok(buf.length > 100000, 'enthält die PDFs');
  const audit = await db('audit_log').where({ action: 'expert.data_export' }).first();
  assert.ok(audit, 'Export ist auditiert');
});

test('Widerruf sperrt Profil und setzt revoked_at', async () => {
  const res = await post('/api/auth/revoke-consent', {}, { cookie: expertCookie });
  assert.strictEqual(res.status, 200);
  const expert = await db('experts').where({ id: adrian.id }).first();
  assert.strictEqual(expert.status, 'inaktiv');
  const active = await db('consents').where({ user_id: adrian.user_id }).whereNull('revoked_at').first();
  assert.ok(!active, 'keine aktive Einwilligung mehr');
});
