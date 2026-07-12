/** Sprint-9-Tests (Stub-Provider): Extraktion, Diff, selektives Übernehmen, Erklärung, Rechte. */
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

const post = (p, body, headers = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  await db('experts').where({ email: 'adrian@rethink-interim.ch' }).update({ status: 'freigegeben' });
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const admin = await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  });
  adminCookie = admin.headers.get('set-cookie');
  await db('users').where({ id: adrian.user_id }).update({
    password_hash: await bcrypt.hash('sprint9-test-pw', 10),
    email_verified_at: db.fn.now(),
    is_approved: true,
  });
  const login = await post('/api/auth/login', { email: adrian.email, password: 'sprint9-test-pw' });
  expertCookie = login.headers.get('set-cookie');
});

after(async () => {
  server.close();
  await db.destroy();
});

test('Extraktion liefert Diff mit Skill-Status, ändert aber NICHTS am Profil', async () => {
  const cvText = 'Interim Manager mit Fokus Qualitätsmanagement und SAP-Rollouts. '.repeat(3);
  const res = await post('/api/ai/extract', { cv_text: cvText }, { cookie: expertCookie });
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  const qm = d.suggestion.skills.find((s) => s.name === 'Qualitätsmanagement');
  assert.strictEqual(qm.status, 'vorhanden', 'bestehender Skill als vorhanden markiert');
  const neu = d.suggestion.skills.find((s) => s.name === 'Stub-Spezialkompetenz');
  assert.strictEqual(neu.status, 'neu_in_taxonomie', 'unbekannter Begriff markiert');

  const expert = await db('experts').where({ id: adrian.id }).first();
  assert.strictEqual(expert.berufsbezeichnung, adrian.berufsbezeichnung, 'Profil unverändert (kein Auto-Write)');
  const audit = await db('audit_log').where({ action: 'ai.extract' }).first();
  assert.ok(audit, 'Extraktion auditiert');
});

test('Apply übernimmt nur die Auswahl; neue Experten-Begriffe landen in der Freigabeliste', async () => {
  const res = await post('/api/ai/apply', {
    kurzprofil: 'Neues, per KI vorgeschlagenes und vom Experten bestätigtes Kurzprofil.',
    skills: [{ name: 'Stub-Spezialkompetenz', kategorie: 'kompetenz' }],
  }, { cookie: expertCookie });
  assert.strictEqual(res.status, 200);

  const expert = await db('experts').where({ id: adrian.id }).first();
  assert.match(expert.kurzprofil, /vom Experten bestätigtes/);
  assert.strictEqual(expert.berufsbezeichnung, adrian.berufsbezeichnung, 'nicht ausgewähltes Feld unverändert');

  const skill = await db('skills').where({ name: 'Stub-Spezialkompetenz' }).first();
  assert.strictEqual(skill.is_approved, false, 'Experten-Vorschlag → Admin-Freigabeliste');
  const linked = await db('expert_skills').where({ expert_id: adrian.id, skill_id: skill.id }).first();
  assert.ok(linked, 'Skill verknüpft');
  const audit = await db('audit_log').where({ action: 'ai.apply', resource_id: adrian.id }).first();
  assert.ok(audit?.old_value_json !== undefined, 'Apply mit Alt/Neu auditiert');
});

test('FTS findet den per KI bestätigten Skill sofort', async () => {
  const d = await fetch(`${baseUrl}/api/search?q=Stub-Spezialkompetenz`, { headers: { cookie: adminCookie } }).then((r) => r.json());
  assert.ok(d.results.some((r) => r.id === adrian.id));
});

test('KI-Begründung zum Matching (deterministischer Score + Stub-Text, gecacht)', async () => {
  const [project] = await db('projects').insert({
    tenant_id: adrian.tenant_id, name: 'KI-Testprojekt', status: 'offen', created_by: 1,
  }).returning('*');
  const r1 = await post(`/api/ai/explain/${project.id}/${adrian.id}`, {}, { cookie: adminCookie });
  assert.strictEqual(r1.status, 200);
  const d1 = await r1.json();
  assert.ok(d1.text.length > 20 && typeof d1.score === 'number');
  const d2 = await post(`/api/ai/explain/${project.id}/${adrian.id}`, {}, { cookie: adminCookie }).then((r) => r.json());
  assert.strictEqual(d2.cached, true, 'zweiter Abruf aus dem Cache');
});

test('Rechte: Experte darf keine fremden Profile extrahieren, keine Erklärungen abrufen', async () => {
  const explain = await post('/api/ai/explain/1/1', {}, { cookie: expertCookie });
  assert.strictEqual(explain.status, 403);
  const anon = await post('/api/ai/extract', { cv_text: 'x'.repeat(100) });
  assert.strictEqual(anon.status, 401);
});
