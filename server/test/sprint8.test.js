/** Sprint-8-Tests: Mandanten-Isolation, Vendor-Flow (einreichen → freigeben → anonymisiert sehen). */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');

let server;
let baseUrl;
let adminCookie;
let vendorCookie;
let ownerBCookie;
let adrian;
let vendorProjectId;

const post = (p, body, headers = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const get = (p, headers = {}) => fetch(baseUrl + p, { headers });

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  await db('experts').where({ email: 'adrian@rethink-interim.ch' }).update({ status: 'freigegeben' });
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const res = await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  });
  adminCookie = res.headers.get('set-cookie');
});

after(async () => {
  server.close();
  await db.destroy();
});

test('Plattform-Admin legt Mandant B mit Tenant-Owner an', async () => {
  const res = await post('/api/tenants', {
    slug: 'beispiel-ag',
    name: 'Beispiel AG',
    owner_email: 'owner@beispiel-ag.example',
    owner_password: 'owner-passwort-123',
  }, { cookie: adminCookie });
  assert.strictEqual(res.status, 201);
  const login = await post('/api/auth/login', { email: 'owner@beispiel-ag.example', password: 'owner-passwort-123' });
  assert.strictEqual(login.status, 200);
  ownerBCookie = login.headers.get('set-cookie');
});

test('Mandanten-Isolation: Tenant-Owner B sieht keine Phalanx-Daten', async () => {
  const experts = await get('/api/experts', { cookie: ownerBCookie }).then((r) => r.json());
  assert.strictEqual(experts.experts.length, 0, 'keine fremden Experten');
  const detail = await get(`/api/experts/${adrian.id}`, { cookie: ownerBCookie });
  assert.strictEqual(detail.status, 404, 'fremdes Profil nicht abrufbar');
  const search = await get('/api/search?q=Turnaround', { cookie: ownerBCookie }).then((r) => r.json());
  assert.strictEqual(search.count, 0, 'Suche tenant-isoliert');
  const audit = await get('/api/audit', { cookie: ownerBCookie }).then((r) => r.json());
  assert.ok(audit.rows.every((r) => r.tenant_id !== adrian.tenant_id), 'Audit tenant-isoliert');
  const tenants = await get('/api/tenants', { cookie: ownerBCookie });
  assert.strictEqual(tenants.status, 403, 'Mandantenverwaltung nur Plattform-Admin');
});

test('Vendor-Konto anlegen, Vendor reicht Projekt ein', async () => {
  const create = await post('/api/tenants/vendors', {
    email: 'kunde@musterfirma.example', password: 'kunden-passwort-1', firma: 'Musterfirma GmbH',
  }, { cookie: adminCookie });
  assert.strictEqual(create.status, 201);
  const login = await post('/api/auth/login', { email: 'kunde@musterfirma.example', password: 'kunden-passwort-1' });
  vendorCookie = login.headers.get('set-cookie');

  const submit = await post('/api/vendor/projects', {
    name: 'Interim-Werksleitung Musterfirma',
    beschreibung: 'Stabilisierung der Produktion.',
    start: '2026-10-01',
    arbeitsmodell: 'vor_ort',
  }, { cookie: vendorCookie });
  assert.strictEqual(submit.status, 201);
  vendorProjectId = (await submit.json()).project.id;

  const adminView = await get('/api/projects', { cookie: adminCookie }).then((r) => r.json());
  const p = adminView.projects.find((x) => x.id === vendorProjectId);
  assert.ok(p && p.status === 'eingereicht', 'Admin sieht eingereichtes Projekt');
});

test('Vendor sieht nur freigegebene Profile — anonymisiert ohne Klarnamen', async () => {
  const before1 = await get(`/api/vendor/projects/${vendorProjectId}`, { cookie: vendorCookie }).then((r) => r.json());
  assert.strictEqual(before1.profiles.length, 0, 'vor Freigabe keine Profile');

  const rel = await post(`/api/projects/${vendorProjectId}/releases`, { expert_id: adrian.id, anonymized: true }, { cookie: adminCookie });
  assert.strictEqual(rel.status, 201);

  const after1 = await get(`/api/vendor/projects/${vendorProjectId}`, { cookie: vendorCookie }).then((r) => r.json());
  assert.strictEqual(after1.profiles.length, 1);
  const p = after1.profiles[0];
  assert.match(p.anzeige_name, /^Experte #\d+$/, 'anonymisierter Anzeigename');
  const json = JSON.stringify(p);
  assert.ok(!json.includes('Spörri') && !json.includes('rethink-interim'), 'kein Klarname/Kontakt im Payload');
  assert.ok(p.skills.length > 0 && p.satz, 'fachliche Infos vorhanden');
});

test('Vendor hat keinen Zugriff auf Admin-Ressourcen; fremde Projekte unsichtbar', async () => {
  const experts = await get('/api/experts', { cookie: vendorCookie });
  assert.strictEqual(experts.status, 403);
  const adminProject = await db('projects').where({ tenant_id: adrian.tenant_id }).whereNull('vendor_id').first();
  if (adminProject) {
    const res = await get(`/api/vendor/projects/${adminProject.id}`, { cookie: vendorCookie });
    assert.strictEqual(res.status, 404, 'fremdes Projekt für Vendor unsichtbar');
  }
});
