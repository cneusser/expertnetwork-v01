/**
 * v1.39.0 — Projektabgleich mit Phalanx OS, Stufe 1.
 *
 * Geprüft wird gegen eine gemockte Gegenstelle: Phalanx OS läuft hier nicht
 * mit, und ein Test, der ein fremdes System braucht, läuft irgendwann gar
 * nicht mehr.
 *
 * Die Fälle sind die aus dem Auftrag, soweit sie Stufe 1 betreffen: Eine
 * unbekannte Nummer wird abgewiesen und nicht angelegt. Ein Abruf ohne
 * gültigen Schlüssel wird abgewiesen und protokolliert. Abgeschlossene
 * Projekte bleiben wählbar. Dazu die Form der Nummer und die Zusicherung,
 * dass der Schlüssel nirgends austritt.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const px = require('../utils/phalanxProjekte');

let server; let baseUrl; let adminCookie; let tenantId; let mandatId;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const put = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const get = (p, h = {}) => fetch(baseUrl + p, { headers: h });

/* --------------------------- Gemocktes Phalanx OS -------------------------- */

const PROJEKTE = [
  { nummer: '30012', name: 'Restrukturierung Maschinenbau', kategorie: 'Beratung', phase: 'Umsetzung', offen: true },
  { nummer: '10004', name: 'Wachstumsfinanzierung Nord', kategorie: 'Kapitalisierung', phase: 'Ansprache', offen: true },
  // Abgeschlossen, bleibt trotzdem in der Liste: Nachträgliche Stunden kommen vor.
  { nummer: '20007', name: 'Seed-Runde Sensorik', kategorie: 'StartUp', phase: 'Abschluss', offen: false },
];

const echtesFetch = global.fetch;
let letzteKopfzeilen = null;
let modus = 'ok'; // ok | kein_schluessel | nicht_erreichbar

function mockAn() {
  global.fetch = async (url, opt = {}) => {
    const u = String(url);
    if (!u.includes('/api/extern/projekte')) return echtesFetch(url, opt);
    letzteKopfzeilen = opt.headers || {};
    if (modus === 'kein_schluessel') return new Response('nope', { status: 401 });
    if (modus === 'nicht_erreichbar') throw new Error('connect ECONNREFUSED');
    return new Response(JSON.stringify({ projekte: PROJEKTE }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
}

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

  process.env.PHALANX_OS_BASE_URL = 'https://os.example.invalid';
  process.env.PHALANX_OS_API_KEY = 'test-schluessel-nur-hier';
  px.cacheLeeren();
  mockAn();

  const [experte] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Gudrun', nachname: 'Mandat139', status: 'freigegeben',
  }).returning('*');
  const [projekt] = await db('projects').insert({
    tenant_id: tenantId, name: 'Interim Einkaufsleitung v139', status: 'offen',
  }).returning('*');
  const [mandat] = await db('engagements').insert({
    tenant_id: tenantId, project_id: projekt.id, expert_id: experte.id,
    tagessatz_experte_eur: 1200, status: 'aktiv',
  }).returning('*');
  mandatId = mandat.id;
});

after(async () => {
  global.fetch = echtesFetch;
  delete process.env.PHALANX_OS_BASE_URL;
  delete process.env.PHALANX_OS_API_KEY;
  server.close();
  await db.destroy();
});

/* --------------------------------- Fälle ---------------------------------- */

test('Die Form der Nummer wird erkannt, bevor jemand gefragt wird', () => {
  assert.strictEqual(px.nummerGueltig('30012'), true);
  assert.strictEqual(px.nummerGueltig('3001'), false, 'vier Stellen');
  assert.strictEqual(px.nummerGueltig('300123'), false, 'sechs Stellen');
  assert.strictEqual(px.nummerGueltig('50001'), false, 'Kategorie 50 gibt es nicht');
  assert.strictEqual(px.nummerGueltig(''), false);
  assert.strictEqual(px.nummerGueltig(null), false);
  assert.strictEqual(px.kategorieVon('20007'), 'StartUp');
  assert.strictEqual(px.kategorieVon('10004'), 'Kapitalisierung');
});

test('Abgeschlossene Projekte bleiben in der Liste und sind gekennzeichnet', async () => {
  modus = 'ok'; px.cacheLeeren();
  const res = await get('/api/phalanx-os/projekte', { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const d = await res.json();

  assert.strictEqual(d.projekte.length, 3, 'alle drei, auch das abgeschlossene');
  const zu = d.projekte.find((p) => p.nummer === '20007');
  assert.ok(zu, 'das abgeschlossene Projekt ist dabei');
  assert.strictEqual(zu.offen, false, 'und es ist als abgeschlossen erkennbar');
  assert.strictEqual(d.kategorien['30'], 'Beratung');
});

test('Der Schlüssel geht als Bearer mit und steht in keiner Antwort', async () => {
  modus = 'ok'; px.cacheLeeren();
  const res = await get('/api/phalanx-os/projekte', { cookie: adminCookie });
  const text = await res.text();

  assert.match(String(letzteKopfzeilen.Authorization), /^Bearer test-schluessel-nur-hier$/);
  assert.ok(!text.includes('test-schluessel-nur-hier'), 'der Schlüssel taucht in der Antwort nicht auf');
});

test('Eine unbekannte Nummer wird abgewiesen und nicht angelegt', async () => {
  modus = 'ok'; px.cacheLeeren();
  const res = await put(`/api/billing/mandate/${mandatId}/projektnummer`,
    { nummer: '30999' }, { cookie: adminCookie });

  assert.strictEqual(res.status, 404);
  const d = await res.json();
  assert.match(d.error, /kennt die Projektnummer 30999 nicht/);

  const m = await db('engagements').where({ id: mandatId }).first();
  assert.strictEqual(m.phalanx_projekt_nummer, null, 'nichts gespeichert');
});

test('Eine Nummer in falscher Form kommt gar nicht erst bis zur Gegenstelle', async () => {
  const res = await put(`/api/billing/mandate/${mandatId}/projektnummer`,
    { nummer: '999' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /fünf Ziffern/);
});

test('Eine bekannte Nummer wird gesetzt, der Name kommt von drüben', async () => {
  modus = 'ok'; px.cacheLeeren();
  const res = await put(`/api/billing/mandate/${mandatId}/projektnummer`,
    { nummer: '30012' }, { cookie: adminCookie });

  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.strictEqual(d.nummer, '30012');
  assert.strictEqual(d.projekt.name, 'Restrukturierung Maschinenbau');

  const m = await db('engagements').where({ id: mandatId }).first();
  assert.strictEqual(m.phalanx_projekt_nummer, '30012');
  // Der Name gehört Phalanx OS und wird hier nicht kopiert.
  assert.ok(!Object.keys(m).some((k) => k.includes('projekt_name_phalanx')), 'kein zweiter Projektname in unserer Tabelle');

  const spur = await db('audit_log').where({ action: 'phalanx.projektnummer_gesetzt' }).orderBy('id', 'desc').first();
  assert.ok(spur, 'die Zuordnung steht im Protokoll');
});

test('Ein abgeschlossenes Projekt lässt sich zuordnen, mit Hinweis', async () => {
  modus = 'ok'; px.cacheLeeren();
  const res = await put(`/api/billing/mandate/${mandatId}/projektnummer`,
    { nummer: '20007' }, { cookie: adminCookie });

  assert.strictEqual(res.status, 200, 'nachträgliche Stunden müssen möglich bleiben');
  const d = await res.json();
  assert.strictEqual(d.projekt.offen, false);
  assert.match(d.message, /abgeschlossen/);
});

test('Ohne gültigen Schlüssel wird abgewiesen und protokolliert', async () => {
  modus = 'kein_schluessel'; px.cacheLeeren();
  const vorher = Number((await db('audit_log').where({ action: 'phalanx.projekte_abgelehnt' }).count('* as n').first()).n);

  const res = await get('/api/phalanx-os/projekte', { cookie: adminCookie });
  assert.strictEqual(res.status, 502);
  const d = await res.json();
  assert.strictEqual(d.code, 'schluessel_abgelehnt');
  assert.ok(!JSON.stringify(d).includes('test-schluessel-nur-hier'));

  const nachher = Number((await db('audit_log').where({ action: 'phalanx.projekte_abgelehnt' }).count('* as n').first()).n);
  assert.strictEqual(nachher, vorher + 1, 'der abgelehnte Schlüssel hinterlässt eine Spur');
});

test('Ist die Gegenstelle still, wird nichts gespeichert', async () => {
  modus = 'ok'; px.cacheLeeren();
  await put(`/api/billing/mandate/${mandatId}/projektnummer`, { nummer: '30012' }, { cookie: adminCookie });

  modus = 'nicht_erreichbar'; px.cacheLeeren();
  const res = await put(`/api/billing/mandate/${mandatId}/projektnummer`,
    { nummer: '10004' }, { cookie: adminCookie });

  assert.strictEqual(res.status, 502);
  const m = await db('engagements').where({ id: mandatId }).first();
  assert.strictEqual(m.phalanx_projekt_nummer, '30012', 'die alte Zuordnung steht noch, die ungeprüfte wurde nicht gesetzt');
  assert.ok(m.phalanx_sync_fehler, 'der Grund steht am Mandat');
});

test('Lösen geht auch ohne erreichbare Gegenstelle', async () => {
  modus = 'nicht_erreichbar'; px.cacheLeeren();
  const res = await put(`/api/billing/mandate/${mandatId}/projektnummer`,
    { nummer: '' }, { cookie: adminCookie });

  assert.strictEqual(res.status, 200, 'eine falsche Zuordnung muss man immer zurücknehmen können');
  const m = await db('engagements').where({ id: mandatId }).first();
  assert.strictEqual(m.phalanx_projekt_nummer, null);
});

test('Die Mandatsliste bleibt benutzbar, wenn Phalanx OS ausfällt', async () => {
  modus = 'ok'; px.cacheLeeren();
  await put(`/api/billing/mandate/${mandatId}/projektnummer`, { nummer: '30012' }, { cookie: adminCookie });

  modus = 'nicht_erreichbar'; px.cacheLeeren();
  const res = await get('/api/billing/mandate', { cookie: adminCookie });
  assert.strictEqual(res.status, 200, 'die Abrechnung fällt nicht aus, weil ein fremdes System hustet');
  const d = await res.json();
  const m = d.mandate.find((x) => x.id === mandatId);
  assert.strictEqual(m.phalanx_projekt_nummer, '30012', 'die Nummer steht da');
  assert.strictEqual(m.phalanx_projekt, null, 'der Name fehlt, mehr nicht');
});

test('Die Zuordnung ist Verwaltungssache', async () => {
  assert.strictEqual((await get('/api/phalanx-os/projekte')).status, 401);
  assert.strictEqual((await put(`/api/billing/mandate/${mandatId}/projektnummer`, { nummer: '30012' })).status, 401);
});
