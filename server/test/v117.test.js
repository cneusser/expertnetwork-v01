/** v1.17.0: Provider-Digest — Opt-in, anonymisierte Karten, Interesse-Funnel. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');
const { runProviderDigest } = require('../jobs');

let server; let baseUrl; let adrian; let providerCookie;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  await db('experts').where({ id: adrian.id }).update({ status: 'freigegeben' });
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  // Provider anlegen + freigeben + verifizieren
  await post('/api/provider/registrierung', {
    firmenname: 'Digest Provider GmbH', email: 'digest@provider.example',
    password: 'provider-pass-9', consent: true, fokus: ['CFO'],
  });
  const pUser = await db('users').where({ email: 'digest@provider.example' }).first();
  await db('users').where({ id: pUser.id }).update({ is_approved: true, email_verified_at: db.fn.now() });
  const login = await post('/api/auth/login', { email: 'digest@provider.example', password: 'provider-pass-9' });
  providerCookie = login.headers.get('set-cookie');
});

after(async () => { server.close(); await db.destroy(); });

test('Ohne Opt-in kein Digest und keine Karten; Opt-in macht das Profil sichtbar, anonymisiert', async () => {
  const leer = await runProviderDigest({ force: true });
  assert.strictEqual(leer.gesendet || 0, 0, 'ohne Opt-in nichts zu melden');

  // Adrian gibt Opt-in (auditiert)
  await db('experts').where({ id: adrian.id }).update({ provider_optin: true, provider_optin_at: db.fn.now() });

  const d = await runProviderDigest({ force: true });
  assert.strictEqual(d.neu, 1, 'Adrian als neu im Digest');
  assert.ok(d.gesendet >= 1, 'Digest an Provider versendet');
  const mail = await db('mail_outbox').where({ to_email: 'digest@provider.example', template_key: 'provider_digest' }).first();
  assert.ok(mail, 'Digest in der Outbox');
  assert.ok(!mail.body_html.includes('Spörri') && !mail.body_html.includes('Adrian '), 'kein Klarname im Digest');
  assert.match(mail.body_html, new RegExp(`Profil #${adrian.id}`));

  // Zweiter Lauf: kein Doppel-Digest. Verfügbarkeits-Bestätigung liegt im Test
  // noch im 7-Tage-Fenster (würde als "wieder verfügbar" zählen), also raus damit:
  await db('availabilities').where({ expert_id: adrian.id }).update({ confirmed_at: new Date(Date.now() - 10 * 86400000) });
  const d2 = await runProviderDigest({ force: true });
  assert.strictEqual(d2.gesendet || 0, 0, 'keine Doppelmeldung');

  // Karten im Portal: anonym, Interesse einmalig
  const karten = await (await fetch(`${baseUrl}/api/provider/profile-karten`, { headers: { cookie: providerCookie } })).json();
  const k = karten.karten.find((x) => x.expert_id === adrian.id);
  assert.ok(k, 'Karte sichtbar');
  assert.ok(!JSON.stringify(k).includes('Spörri'), 'Karte ohne Klarnamen');

  const int1 = await post('/api/provider/interesse', { expert_id: adrian.id }, { cookie: providerCookie });
  assert.strictEqual(int1.status, 201);
  const intern = await db('mail_outbox').where({ template_key: 'provider_interesse_intern' }).first();
  assert.ok(intern, 'Admin-Benachrichtigung raus');
  const int2 = await post('/api/provider/interesse', { expert_id: adrian.id }, { cookie: providerCookie });
  assert.strictEqual(int2.status, 409, 'Interesse nur einmal');

  // Opt-out nimmt das Profil raus
  await db('experts').where({ id: adrian.id }).update({ provider_optin: false });
  const karten2 = await (await fetch(`${baseUrl}/api/provider/profile-karten`, { headers: { cookie: providerCookie } })).json();
  assert.ok(!karten2.karten.find((x) => x.expert_id === adrian.id), 'nach Opt-out unsichtbar');

  // Ohne Login kein Zugriff
  assert.strictEqual((await fetch(`${baseUrl}/api/provider/profile-karten`)).status, 401);
});
