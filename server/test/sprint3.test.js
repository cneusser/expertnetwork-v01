/** Sprint-3-Tests: Profil-Edit (Admin + Rechte), Satz-Erfassung mit Historie, Skill-Editor. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');

let server;
let baseUrl;
let adminCookie;
let adrian;

const req = (method) => (p, body, headers = {}) =>
  fetch(baseUrl + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const post = req('POST');
const put = req('PUT');
const del = req('DELETE');

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

test('Admin bearbeitet Profil — Audit enthält Alt- und Neuwert', async () => {
  const res = await put(`/api/experts/${adrian.id}`, { reisebereitschaft: 'DACH + Benelux' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const audit = await db('audit_log').where({ action: 'expert.update', resource_id: adrian.id }).orderBy('id', 'desc').first();
  assert.ok(audit.old_value_json && audit.new_value_json, 'Alt/Neu im Audit');
  assert.match(JSON.stringify(audit.new_value_json), /Benelux/);
});

test('Profil-Edit ohne Login und mit ungültigem Feld wird abgelehnt', async () => {
  const anon = await put(`/api/experts/${adrian.id}`, { vorname: 'X' });
  assert.strictEqual(anon.status, 401);
  const bad = await put(`/api/experts/${adrian.id}`, { arbeitsmodell: 'mondbasis' }, { cookie: adminCookie });
  assert.strictEqual(bad.status, 400);
});

test('Neuer Tagessatz erweitert die Historie (Insert-only)', async () => {
  const before1 = await db('rates').where({ expert_id: adrian.id }).count('* as c').first();
  const res = await post(`/api/experts/${adrian.id}/rates`,
    { kategorie: 'beratung', satz_von_eur: 1400, satz_bis_eur: 1600, gueltig_ab: '2026-08-01' },
    { cookie: adminCookie });
  assert.strictEqual(res.status, 201);
  const after1 = await db('rates').where({ expert_id: adrian.id }).count('* as c').first();
  assert.strictEqual(Number(after1.c), Number(before1.c) + 1);
  const invalid = await post(`/api/experts/${adrian.id}/rates`,
    { kategorie: 'beratung', satz_von_eur: 1600, satz_bis_eur: 1400, gueltig_ab: '2026-08-01' },
    { cookie: adminCookie });
  assert.strictEqual(invalid.status, 400, 'bis < von wird abgelehnt');
});

test('Skill hinzufügen und entfernen', async () => {
  const add = await post(`/api/experts/${adrian.id}/skills`, { name: 'IDW S6', kategorie: 'kompetenz' }, { cookie: adminCookie });
  assert.strictEqual(add.status, 201);
  const { skill } = await add.json();
  const linked = await db('expert_skills').where({ expert_id: adrian.id, skill_id: skill.id }).first();
  assert.ok(linked);
  const rm = await del(`/api/experts/${adrian.id}/skills/${skill.id}`, undefined, { cookie: adminCookie });
  assert.strictEqual(rm.status, 200);
  const gone = await db('expert_skills').where({ expert_id: adrian.id, skill_id: skill.id }).first();
  assert.ok(!gone);
});

test('Experte pflegt eigenes Profil, kann sich aber nicht selbst freigeben', async () => {
  // Adrian-Konto mit bekanntem Passwort ausstatten (Invite-Flow separat getestet)
  const bcrypt = require('bcryptjs');
  await db('users').where({ id: adrian.user_id }).update({
    password_hash: await bcrypt.hash('sprint3-test-pw', 10),
    email_verified_at: db.fn.now(),
    is_approved: true,
  });
  const login = await post('/api/auth/login', { email: adrian.email, password: 'sprint3-test-pw' });
  const cookie = login.headers.get('set-cookie');

  const res = await put('/api/experts/me', { kurzprofil: 'Aktualisiert durch Self-Service.', status: 'freigegeben' }, { cookie });
  assert.strictEqual(res.status, 200);
  const updated = await db('experts').where({ id: adrian.id }).first();
  assert.match(updated.kurzprofil, /Self-Service/);

  await db('experts').where({ id: adrian.id }).update({ status: 'registriert' });
  await put('/api/experts/me', { status: 'freigegeben' }, { cookie });
  const check = await db('experts').where({ id: adrian.id }).first();
  assert.strictEqual(check.status, 'registriert', 'status-Feld wird im Self-Service ignoriert');

  const rate = await post('/api/experts/me/rates', { kategorie: 'remote', satz_von_eur: 1200, gueltig_ab: '2026-08-01' }, { cookie });
  assert.strictEqual(rate.status, 201);
});
