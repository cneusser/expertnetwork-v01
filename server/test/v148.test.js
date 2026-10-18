/**
 * v1.48.0 — Aus einem Kontakt einen assoziierten Partner machen.
 *
 * Der Fall aus der Praxis: Ein Corporate-Finance-Berater mit großem
 * Netzwerk. Kein Interim Manager, also kein Expertenprofil. Auch kein
 * Kapitalpartner, denn dieses Verzeichnis führt Finanzierer, und er gibt
 * kein Kapital, er vermittelt es. Was er mitbringt, ist sein Netzwerk.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');

let server; let baseUrl; let adminCookie; let tenantId;
const ids = {};

const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });

before(async () => {
  await db.migrate.latest();
  await seed();
  tenantId = (await db('tenants').where({ slug: 'phalanx' }).first()).id;
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  })).headers.get('set-cookie');

  await db('partner_applications').where({ tenant_id: tenantId })
    .andWhere('nachname', 'like', 'Partner148%').del();
  await db('experts').where({ tenant_id: tenantId }).andWhere('nachname', 'like', 'Partner148%').del();

  const [mit] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Christoph', nachname: 'Partner148Mit', status: 'freigegeben',
    email: 'christoph@partner148.invalid', firma: 'Just Finance v148',
    telefon: '+49 211 111', linkedin: 'linkedin.com/in/partner148',
    berufsbezeichnung: 'Managing Director | Acquisition Finance',
  }).returning('*');
  ids.mit = mit.id;

  // Aus einem Listenimport, ohne Mailadresse. Kommt vor.
  const [ohne] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Ohne', nachname: 'Partner148Mail', status: 'vorregistriert',
  }).returning('*');
  ids.ohne = ohne.id;
});

after(async () => { server.close(); await db.destroy(); });

test('Ein Kontakt wird Partner und verlässt die Interim-Ansprache', async () => {
  const res = await post(`/api/partner/aus-experte/${ids.mit}`,
    { fokus: ['akquise'], notiz: 'Netzwerk in Acquisition Finance' }, { cookie: adminCookie });

  assert.strictEqual(res.status, 201);
  const d = await res.json();
  assert.strictEqual(d.partner.vorname, 'Christoph');
  assert.strictEqual(d.partner.firma, 'Just Finance v148');
  assert.strictEqual(d.partner.linkedin, 'linkedin.com/in/partner148');
  assert.strictEqual(d.partner.quelle, 'umgewandelt');
  assert.strictEqual(d.partner.expert_id, ids.mit);
  assert.strictEqual(d.partner.status, 'in_pruefung');

  const e = await db('experts').where({ id: ids.mit }).first();
  assert.ok(e, 'der Datensatz bleibt, nichts wird gelöscht');
  assert.ok(e.vorreg_ausgeschlossen_am, 'aber aus der Ansprache raus');
  assert.match(e.vorreg_ausschluss_grund, /Assoziierter Partner/);
  assert.strictEqual(e.zielgruppe, 'partner');

  const spur = await db('audit_log').where({ action: 'partner.aus_experte' }).orderBy('id', 'desc').first();
  assert.ok(spur, 'die Umwandlung steht im Protokoll');
});

test('Zweimal umwandeln geht nicht', async () => {
  const res = await post(`/api/partner/aus-experte/${ids.mit}`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 409);
  assert.match((await res.json()).error, /bereits als Partner/);
});

test('Ohne Mailadresse geht es auch, und die Meldung sagt es', async () => {
  const res = await post(`/api/partner/aus-experte/${ids.ohne}`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 201);

  const d = await res.json();
  assert.match(d.message, /Mailadresse nachtragen/, 'ehrlich statt stillschweigend');
  // Kein erfundener Wert, der wie eine Adresse aussieht und irgendwann
  // angeschrieben wird.
  assert.match(d.partner.email, /@phalanx\.invalid$/);
});

test('Ein unbekannter Kontakt wird abgewiesen', async () => {
  assert.strictEqual((await post('/api/partner/aus-experte/999999', {}, { cookie: adminCookie })).status, 404);
});

test('Umwandeln ist Verwaltungssache', async () => {
  assert.strictEqual((await post(`/api/partner/aus-experte/${ids.mit}`, {})).status, 401);
});
