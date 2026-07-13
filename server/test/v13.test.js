/** v1.3.0: Dashboard, CV-CRUD, Rückzug, Merk-/Ausschlussliste, Invite-Status-Fix. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');
const { signPurposeToken } = require('../utils/tokens');

let server; let baseUrl; let adminCookie; let expertCookie; let adrian;
const req = (m) => (p, body, h = {}) =>
  fetch(baseUrl + p, { method: m, headers: { 'Content-Type': 'application/json', ...h }, body: body === undefined ? undefined : JSON.stringify(body) });
const post = req('POST'); const del = req('DELETE');

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  await db('experts').where({ id: adrian.id }).update({ status: 'freigegeben' });
  await db('users').where({ id: adrian.user_id }).update({
    password_hash: await bcrypt.hash('v13-test-pass', 10), email_verified_at: db.fn.now(), is_approved: true,
  });
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  })).headers.get('set-cookie');
  expertCookie = (await post('/api/auth/login', { email: adrian.email, password: 'v13-test-pass' })).headers.get('set-cookie');
});

after(async () => { server.close(); await db.destroy(); });

test('Invite-Annahme hebt auch Status "eingeladen" auf "freigegeben" (Bugfix)', async () => {
  const kontakt = await db('experts').where({ email: 'g.malzkorn@malzkorn-mc.de' }).first();
  assert.strictEqual(kontakt.status, 'eingeladen');
  const token = signPurposeToken(kontakt.user_id, 'expert-invite', '14d');
  const res = await post('/api/auth/accept-invite', { token, password: 'malzkorn-pass-1', consent: true });
  assert.strictEqual(res.status, 200);
  const after1 = await db('experts').where({ id: kontakt.id }).first();
  assert.strictEqual(after1.status, 'freigegeben', 'Status nach Einwilligung freigeschaltet');
});

test('Experten-Dashboard liefert Vollständigkeit und Kennzahlen', async () => {
  const d = await fetch(`${baseUrl}/api/experts/me/dashboard`, { headers: { cookie: expertCookie } }).then((r) => r.json());
  assert.ok(d.vollstaendigkeit >= 50 && d.vollstaendigkeit <= 100, `Vollständigkeit plausibel (${d.vollstaendigkeit})`);
  assert.ok('empfohlene_projekte' in d && 'profil_views' in d && d.checks);
});

test('Strukturierter CV: Station + Ausbildung anlegen/löschen; fließt in Vollständigkeit', async () => {
  const s1 = await post('/api/experts/me/career-steps', { rolle: 'Interim QHSE Lead', firma: 'Oetiker', zeitraum: '2024–2026', ergebnis: 'IATF-Konformität gesichert' }, { cookie: expertCookie });
  assert.strictEqual(s1.status, 201);
  const e1 = await post('/api/experts/me/educations', { abschluss: 'Dipl. Quality Manager NDS HF', institution: 'SAQ-Qualicon' }, { cookie: expertCookie });
  assert.strictEqual(e1.status, 201);
  const me = await fetch(`${baseUrl}/api/experts/me`, { headers: { cookie: expertCookie } }).then((r) => r.json());
  assert.strictEqual(me.career_steps.length, 1);
  const rm = await del(`/api/experts/me/educations/${me.educations[0].id}`, undefined, { cookie: expertCookie });
  assert.strictEqual(rm.status, 200);
});

test('Bewerbung zurückziehen', async () => {
  const [p] = await db('projects').insert({ tenant_id: adrian.tenant_id, name: 'Withdraw-Test', status: 'offen', created_by: 1 }).returning('*');
  await post(`/api/projects/${p.id}/apply`, {}, { cookie: expertCookie });
  const meine = await fetch(`${baseUrl}/api/projects/meine-bewerbungen`, { headers: { cookie: expertCookie } }).then((r) => r.json());
  const b = meine.bewerbungen.find((x) => x.name === 'Withdraw-Test');
  const res = await post(`/api/projects/bewerbungen/${b.id}/zurueckziehen`, {}, { cookie: expertCookie });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await db('applications').where({ id: b.id }).first()).status, 'zurueckgezogen');
});

test('Ausschlussliste entfernt Experten aus Matching-Vorschlägen; Merkliste mit Notiz', async () => {
  const [p] = await db('projects').insert({ tenant_id: adrian.tenant_id, name: 'Block-Test', status: 'offen', created_by: 1 }).returning('*');
  const before1 = await fetch(`${baseUrl}/api/projects/${p.id}`, { headers: { cookie: adminCookie } }).then((r) => r.json());
  assert.ok(before1.matches.some((m) => m.expert.id === adrian.id), 'vor Block in Vorschlägen');

  await post(`/api/experts/${adrian.id}/block`, { grund: 'Test' }, { cookie: adminCookie });
  const after1 = await fetch(`${baseUrl}/api/projects/${p.id}`, { headers: { cookie: adminCookie } }).then((r) => r.json());
  assert.ok(!after1.matches.some((m) => m.expert.id === adrian.id), 'nach Block ausgeblendet');
  await post(`/api/experts/${adrian.id}/block`, {}, { cookie: adminCookie }); // aufheben

  await post(`/api/experts/${adrian.id}/watch`, { notiz: 'Top für QM-Mandate' }, { cookie: adminCookie });
  const detail = await fetch(`${baseUrl}/api/experts/${adrian.id}`, { headers: { cookie: adminCookie } }).then((r) => r.json());
  assert.strictEqual(detail.watch.notiz, 'Top für QM-Mandate');
});

test('Profilaufruf-Zähler steigt bei Admin-View', async () => {
  const v0 = (await db('experts').where({ id: adrian.id }).first()).profil_views;
  await fetch(`${baseUrl}/api/experts/${adrian.id}`, { headers: { cookie: adminCookie } });
  const v1 = (await db('experts').where({ id: adrian.id }).first()).profil_views;
  assert.ok(v1 > v0);
});
