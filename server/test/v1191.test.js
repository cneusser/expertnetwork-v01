/** v1.19.1: Selbstregistrierung legt Expertenprofil an; manuelle Verfügbarkeits-Erinnerung. */
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

test('Selbstregistrierung legt jetzt auch ein Expertenprofil an', async () => {
  const res = await post('/api/auth/register', {
    email: 'wolfgang@selbst.example', password: 'selbstreg-pass-1', consent: true,
    vorname: 'Wolfgang', nachname: 'Schenk',
  });
  assert.strictEqual(res.status, 201);
  const user = await db('users').where({ email: 'wolfgang@selbst.example' }).first();
  const profil = await db('experts').where({ user_id: user.id }).first();
  assert.ok(profil, 'Expertenprofil angelegt');
  assert.strictEqual(profil.vorname, 'Wolfgang');
  assert.strictEqual(profil.nachname, 'Schenk');
  assert.strictEqual(profil.status, 'registriert');

  // Ohne Namensangabe: Fallback aus der E-Mail
  await post('/api/auth/register', { email: 'max.mustermann@ohne.example', password: 'ohne-namen-pass', consent: true });
  const u2 = await db('users').where({ email: 'max.mustermann@ohne.example' }).first();
  const p2 = await db('experts').where({ user_id: u2.id }).first();
  assert.ok(p2, 'auch ohne Namensfelder ein Profil');

  // Beide erscheinen in der Admin-Expertenliste
  const liste = await (await fetch(`${baseUrl}/api/experts`, { headers: { cookie: adminCookie } })).json();
  assert.ok(liste.experts.find((e) => e.email === 'wolfgang@selbst.example'));
});

test('Verfügbarkeits-Erinnerung manuell auslösen (Consent vorausgesetzt)', async () => {
  // Ohne Einwilligung abgelehnt (Consent zur Sicherheit entfernen)
  await db('consents').where({ user_id: adrian.user_id }).delete();
  const ohne = await post(`/api/experts/${adrian.id}/verfuegbarkeit-erinnerung`, {}, { cookie: adminCookie });
  assert.strictEqual(ohne.status, 400);

  await db('consents').insert({
    tenant_id: adrian.tenant_id, user_id: adrian.user_id, zweck: 'talentpool',
    text_version: 'test', expires_at: new Date(Date.now() + 86400000 * 30),
  });
  const res = await post(`/api/experts/${adrian.id}/verfuegbarkeit-erinnerung`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const mail = await db('mail_outbox').where({ to_email: adrian.email, template_key: 'verfuegbarkeit_erinnerung' }).first();
  assert.ok(mail, 'Erinnerung in der Outbox');
  assert.match(mail.subject, /verfügbar/i);
  assert.ok((await db('experts').where({ id: adrian.id }).first()).last_availability_reminder_at, 'Drosselung gesetzt');
  assert.strictEqual((await fetch(`${baseUrl}/api/experts/${adrian.id}/verfuegbarkeit-erinnerung`, { method: 'POST' })).status, 401);
});
