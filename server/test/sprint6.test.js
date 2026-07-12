/** Sprint-6-Tests: Projekt, Matching-Score + Begründung, Bewerbung, Pipeline, Konto. */
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
let projectId;

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
  await db('experts').where({ email: 'adrian@rethink-interim.ch' }).update({ status: 'freigegeben' });
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const admin = await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  });
  adminCookie = admin.headers.get('set-cookie');

  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  await db('users').where({ id: adrian.user_id }).update({
    password_hash: await bcrypt.hash('sprint6-test-pw', 10),
    email_verified_at: db.fn.now(),
    is_approved: true,
  });
  const login = await post('/api/auth/login', { email: adrian.email, password: 'sprint6-test-pw' });
  expertCookie = login.headers.get('set-cookie');
});

after(async () => {
  server.close();
  await db.destroy();
});

test('Projekt anlegen mit Skills (Admin)', async () => {
  const qm = await db('skills').where({ name: 'Qualitätsmanagement' }).first();
  const ta = await db('skills').where({ name: 'Turnaround-Management' }).first();
  const res = await post('/api/projects', {
    name: 'Interim QM-Leitung Werk Süd',
    beschreibung: 'Stabilisierung der Qualitätsorganisation nach Führungswechsel.',
    tagessatz_bis_eur: 1400,
    start: '2026-09-01',
    ende: '2027-02-28',
    ort: 'München',
    arbeitsmodell: 'hybrid',
    status: 'offen',
    skill_ids: [qm.id, ta.id],
  }, { cookie: adminCookie });
  assert.strictEqual(res.status, 201);
  projectId = (await res.json()).project.id;
});

test('Matching liefert Adrian mit Score und Begründung', async () => {
  const d = await fetch(`${baseUrl}/api/projects/${projectId}`, { headers: { cookie: adminCookie } }).then((r) => r.json());
  const m = d.matches.find((x) => x.expert.nachname === 'Spörri');
  assert.ok(m, 'Adrian als Vorschlag');
  assert.ok(m.score > 50 && m.score <= 100, `plausibler Score (${m.score})`);
  assert.strictEqual(m.breakdown.skills, 100, 'beide geforderten Skills vorhanden');
  assert.match(m.begruendung, /Skills 2\/2/);
  assert.match(m.begruendung, /Satz/);
});

test('Experte sieht offenes Projekt (ohne Budget) und bewirbt sich', async () => {
  const list = await fetch(`${baseUrl}/api/projects/offen`, { headers: { cookie: expertCookie } }).then((r) => r.json());
  const p = list.projects.find((x) => x.id === projectId);
  assert.ok(p && !('budget_eur' in p && p.budget_eur), 'Projekt sichtbar, Budget nicht exponiert');

  const apply = await post(`/api/projects/${projectId}/apply`, { nachricht: 'Sehr gerne — Profil passt exakt.' }, { cookie: expertCookie });
  assert.strictEqual(apply.status, 201);
  const again = await post(`/api/projects/${projectId}/apply`, {}, { cookie: expertCookie });
  assert.strictEqual(again.status, 409, 'Doppelbewerbung abgelehnt');
});

test('Pipeline: Statuswechsel auditiert; Bewerbung erscheint im Projekt', async () => {
  const d = await fetch(`${baseUrl}/api/projects/${projectId}`, { headers: { cookie: adminCookie } }).then((r) => r.json());
  const app1 = d.applications.find((a) => a.expert_id === adrian.id);
  assert.ok(app1 && app1.status === 'beworben' && app1.matching_score > 0);
  const upd = await put(`/api/projects/${projectId}/applications/${app1.id}`, { status: 'im_gespraech' }, { cookie: adminCookie });
  assert.strictEqual(upd.status, 200);
  const audit = await db('audit_log').where({ action: 'application.status', resource_id: app1.id }).first();
  assert.ok(audit, 'Statuswechsel im Audit');
});

test('Projekt-Endpunkte: Rechte (Experte kein Admin-Zugriff)', async () => {
  const res = await fetch(`${baseUrl}/api/projects`, { headers: { cookie: expertCookie } });
  assert.strictEqual(res.status, 403);
});

test('Konto: Passwort ändern (alle Rollen) + eigene Historie', async () => {
  const wrong = await post('/api/auth/change-password', { current: 'falsch', next: 'neues-passwort-123' }, { cookie: expertCookie });
  assert.strictEqual(wrong.status, 401);
  const ok = await post('/api/auth/change-password', { current: 'sprint6-test-pw', next: 'neues-passwort-123' }, { cookie: expertCookie });
  assert.strictEqual(ok.status, 200);
  const relogin = await post('/api/auth/login', { email: adrian.email, password: 'neues-passwort-123' });
  assert.strictEqual(relogin.status, 200);
  const hist = await fetch(`${baseUrl}/api/auth/my-audit`, { headers: { cookie: expertCookie } }).then((r) => r.json());
  assert.ok(hist.rows.some((r) => r.action === 'account.password_change'), 'Passwortänderung in eigener Historie');
});

test('Konto: E-Mail ändern synchronisiert Expertenprofil', async () => {
  const res = await put('/api/auth/account', { email: 'adrian.neu@rethink-interim.ch' }, { cookie: expertCookie });
  assert.strictEqual(res.status, 200);
  const expert = await db('experts').where({ id: adrian.id }).first();
  assert.strictEqual(expert.email, 'adrian.neu@rethink-interim.ch');
  // zurücksetzen für nachfolgende Läufe
  await put('/api/auth/account', { email: 'adrian@rethink-interim.ch' }, { cookie: expertCookie });
});
