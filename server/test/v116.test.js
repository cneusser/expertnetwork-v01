/** v1.16.0: Provider-Hub I — Registrierung, Freigabe-Gate, Profilpflege. */
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

test('Provider: Registrierung, Admin-Freigabe, Profilpflege', async () => {
  const res = await post('/api/provider/registrierung', {
    firmenname: 'Interim Partners Nord', ansprechpartner: 'Petra Provider',
    email: 'petra@ipn.example', password: 'provider-pass-1', consent: true,
    fokus: ['Restrukturierung', 'CFO'], tagessatz_von: 1200, tagessatz_bis: 1800,
    hauptprojekte: 'Interim-CFO-Besetzungen im Mittelstand.',
  });
  assert.strictEqual(res.status, 201);
  const user = await db('users').where({ email: 'petra@ipn.example' }).first();
  assert.strictEqual(user.role, 'provider');
  assert.strictEqual(user.is_approved, false, 'wartet auf Freigabe');
  const profil = await db('provider_profiles').where({ user_id: user.id }).first();
  assert.strictEqual(profil.firmenname, 'Interim Partners Nord');
  assert.deepStrictEqual(profil.fokus_json, ['Restrukturierung', 'CFO']);

  // Ohne Consent abgelehnt, Dublette abgelehnt
  assert.strictEqual((await post('/api/provider/registrierung', { firmenname: 'X', email: 'x@y.example', password: 'zehnzeichen!', consent: false })).status, 400);
  assert.strictEqual((await post('/api/provider/registrierung', { firmenname: 'XY GmbH', email: 'petra@ipn.example', password: 'zehnzeichen!', consent: true })).status, 409);

  // Admin sieht Liste und gibt frei
  const liste = await (await fetch(`${baseUrl}/api/provider`, { headers: { cookie: adminCookie } })).json();
  assert.ok(liste.provider.find((p) => p.firmenname === 'Interim Partners Nord'));
  const frei = await post(`/api/provider/${user.id}/freigabe`, { freigeben: true }, { cookie: adminCookie });
  assert.strictEqual(frei.status, 200);
  assert.strictEqual((await db('users').where({ id: user.id }).first()).is_approved, true);

  // Provider loggt sich ein (E-Mail als verifiziert setzen) und pflegt sein Profil
  await db('users').where({ id: user.id }).update({ email_verified_at: db.fn.now() });
  const login = await post('/api/auth/login', { email: 'petra@ipn.example', password: 'provider-pass-1' });
  assert.strictEqual(login.status, 200);
  const cookie = login.headers.get('set-cookie');

  const me = await (await fetch(`${baseUrl}/api/provider/me`, { headers: { cookie } })).json();
  assert.strictEqual(me.profil.firmenname, 'Interim Partners Nord');

  const upd = await fetch(`${baseUrl}/api/provider/me`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ tagessatz_bis: 2000, fokus: ['Restrukturierung', 'CFO', 'PMI'] }),
  });
  assert.strictEqual(upd.status, 200);
  const nach = await db('provider_profiles').where({ user_id: user.id }).first();
  assert.strictEqual(nach.tagessatz_bis, 2000);
  assert.strictEqual(nach.fokus_json.length, 3);

  // Fremde Rollen kommen nicht an Admin-Routen
  assert.strictEqual((await fetch(`${baseUrl}/api/provider`, { headers: { cookie } })).status, 403);
  assert.strictEqual((await fetch(`${baseUrl}/api/provider/me`)).status, 401);
});
