/**
 * v1.24.2 — Anmeldung für administrativ angelegte Konten.
 * Fall Adrian Spörri: importiertes Konto, nie ein Passwort gehabt, E-Mail nie
 * bestätigt. Geprüft werden: Suche unabhängig von der Schreibweise, Reset
 * bestätigt die Adresse, Zugangslink aus der Expertenakte, Kontostatus.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');
const { signPurposeToken } = require('../utils/tokens');

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

test('Adresse mit Großbuchstaben sperrt niemanden mehr aus', async () => {
  // Zustand wie im Import aus einer Excel-Liste
  await db('users').where({ id: adrian.user_id }).update({ email: 'Adrian@Rethink-Interim.CH', email_verified_at: null });

  const vergessen = await post('/api/auth/forgot-password', { email: 'adrian@rethink-interim.ch' });
  assert.strictEqual(vergessen.status, 200);
  const mail = await db('mail_outbox').where({ subject: 'Passwort zurücksetzen' }).orderBy('id', 'desc').first();
  assert.ok(mail, 'Reset-Mail wurde erzeugt, obwohl die Adresse anders geschrieben war');
  assert.match(mail.to_email, /rethink-interim/i);

  // Reset setzen und damit zugleich die Adresse bestätigen
  const token = signPurposeToken(adrian.user_id, 'reset-password', '1h');
  const reset = await post('/api/auth/reset-password', { token, password: 'ein-gutes-passwort' });
  assert.strictEqual(reset.status, 200);
  const user = await db('users').where({ id: adrian.user_id }).first();
  assert.ok(user.email_verified_at, 'Klick auf den Link bestätigt die Adresse');

  // Anmeldung klappt jetzt, auch mit abweichender Schreibweise in der Eingabe
  const login = await post('/api/auth/login', { email: '  ADRIAN@rethink-interim.ch ', password: 'ein-gutes-passwort' });
  assert.strictEqual(login.status, 200, 'Anmeldung unabhängig von Schreibweise und Leerzeichen');
  assert.strictEqual((await post('/api/auth/login', { email: 'adrian@rethink-interim.ch', password: 'falsch' })).status, 401);
});

test('Migration räumt vorhandene Adressen auf', async () => {
  const user = await db('users').where({ id: adrian.user_id }).first();
  assert.strictEqual(user.email, 'Adrian@Rethink-Interim.CH', 'Ausgangslage für die Migration');
  await db('knex_migrations').where('name', 'like', '%0027%').delete();
  await db.migrate.latest();
  assert.strictEqual((await db('users').where({ id: adrian.user_id }).first()).email, 'adrian@rethink-interim.ch');
});

test('Zugangslink aus der Expertenakte und Kontostatus', async () => {
  const detail = await (await fetch(`${baseUrl}/api/experts/${adrian.id}`, { headers: { cookie: adminCookie } })).json();
  assert.ok(detail.konto, 'Kontostatus liegt der Akte bei');
  assert.strictEqual(detail.konto.email_bestaetigt, true);
  assert.strictEqual(detail.konto.passwort_gesetzt, true);
  assert.strictEqual(detail.konto.email_weicht_ab, null);

  const res = await post(`/api/experts/${adrian.id}/konto/zugang-link`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const mail = await db('mail_outbox').where({ template_key: 'zugang_link' }).orderBy('id', 'desc').first();
  assert.ok(mail, 'Zugangslink liegt in der Outbox');
  assert.strictEqual(mail.to_email, 'adrian@rethink-interim.ch');
  assert.match(mail.body_html, /reset-password\?token=/);
  assert.ok(!mail.body_html.includes('—'), 'keine Gedankenstriche');
  assert.ok(await db('audit_log').where({ action: 'expert.zugang_link', resource_id: adrian.id }).first());

  // Fremde Adresse, die schon zu einem anderen Konto gehört, wird abgewiesen
  const admin = await db('users').where({ role: 'admin' }).first();
  assert.strictEqual((await post(`/api/experts/${adrian.id}/konto/zugang-link`,
    { email: admin.email }, { cookie: adminCookie })).status, 409);
  assert.strictEqual((await post(`/api/experts/${adrian.id}/konto/zugang-link`, {})).status, 401);
});
