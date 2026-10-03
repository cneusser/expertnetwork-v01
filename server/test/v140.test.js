/**
 * v1.40.0 — Projektabgleich mit Phalanx OS, Stufe 2 und 3: die Stunden.
 *
 * Die Prüfungen aus dem Auftrag:
 *   Dieselbe Zeile zweimal gesendet ergibt einen Eintrag, nicht zwei.
 *   Ein abgerechneter Eintrag wird nicht verändert, und die Antwort sagt warum.
 *   Eine unbekannte Projektnummer wird abgewiesen, nicht angelegt.
 *   Kein Klarname und kein Honorarsatz in der Nutzlast.
 *   Ein Abgleich ohne gültigen Schlüssel wird abgewiesen und protokolliert.
 *
 * Die gemockte Gegenstelle führt eine echte Tabelle mit eindeutiger
 * source_ref. Ein Mock, der nur "ok" sagt, würde die Wiederholsicherheit gar
 * nicht prüfen, und genau die ist hier der Punkt.
 *
 * Geprüft wird gegen die Daten dieses Experten, nicht gegen eine erfundene
 * Verbotsliste.
 */
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const pz = require('../utils/phalanxZeiten');
const pk = require('../utils/phalanxKuerzel');
const px = require('../utils/phalanxProjekte');

let server; let baseUrl; let adminCookie; let tenantId;
let mandatId; let experteId; let nachweisId;

const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const put = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });

/* ------------------------- Gemocktes Phalanx OS --------------------------- */

const PROJEKTE = [
  { nummer: '30077', name: 'Werkleitung Guss', kategorie: 'Beratung', phase: 'Umsetzung', offen: true },
];

/** Die Zeittabelle drüben: source_ref ist eindeutig, wie in der echten. */
let osZeiten = new Map();
let osAbgerechnet = new Set(); // source_refs mit billed_at
let osAufrufe = 0;
let letzteNutzlast = null;
let modus = 'ok'; // ok | kein_schluessel | nicht_erreichbar

const echtesFetch = global.fetch;

function mockAn() {
  global.fetch = async (url, opt = {}) => {
    const u = String(url);
    if (!u.includes('/api/extern/')) return echtesFetch(url, opt);

    if (modus === 'nicht_erreichbar') throw new Error('connect ECONNREFUSED');
    if (modus === 'kein_schluessel') return new Response('nope', { status: 401 });

    if (u.includes('/api/extern/projekte')) {
      return new Response(JSON.stringify({ projekte: PROJEKTE }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /api/extern/zeiten
    osAufrufe += 1;
    const body = JSON.parse(opt.body);
    letzteNutzlast = body;

    if (!PROJEKTE.some((p) => p.nummer === body.nummer)) {
      return new Response(JSON.stringify({ error: 'Projekt unbekannt' }), { status: 404 });
    }

    const ref = `expertnetwork:${body.extern_kennung}`;
    if (osAbgerechnet.has(ref)) {
      return new Response(JSON.stringify({ error: 'Position ist bereits abgerechnet' }), { status: 409 });
    }
    // Eindeutige source_ref: zweimal dieselbe Zeile aktualisiert, legt nicht an.
    const neu = !osZeiten.has(ref);
    osZeiten.set(ref, { ...body, source_ref: ref });
    return new Response(JSON.stringify({ ok: true, source_ref: ref, angelegt: neu }), {
      status: neu ? 201 : 200, headers: { 'Content-Type': 'application/json' },
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
  process.env.PHALANX_OS_API_KEY = 'geheim-nur-im-test';
  px.cacheLeeren();
  mockAn();

  // Die Daten liegen im Mandanten des Admins, sonst sehen die Routen sie
  // nicht. Ein eigener Mandant wie in v138 geht hier also nicht.
  //
  // Stattdessen räumt die Datei ihre eigenen Reste weg, bevor sie neu anlegt.
  // Erkennungsmerkmal ist der Projektname, von innen nach außen gelöscht,
  // damit keine Fremdschlüssel brechen. Fremde Daten bleiben unberührt.
  const alteProjekte = await db('projects')
    .where({ tenant_id: tenantId }).andWhere('name', 'like', '%v140%').select('id');
  if (alteProjekte.length) {
    const ids = alteProjekte.map((p) => p.id);
    const alteMandate = await db('engagements').whereIn('project_id', ids).select('id', 'expert_id');
    const mIds = alteMandate.map((m) => m.id);
    if (mIds.length) {
      await db('invoices').whereIn('engagement_id', mIds).del();
      await db('timesheets').whereIn('engagement_id', mIds).del();
      await db('engagements').whereIn('id', mIds).del();
    }
    await db('projects').whereIn('id', ids).del();
    for (const x of alteMandate) {
      const nochDa = await db('engagements').where({ expert_id: x.expert_id }).first();
      if (!nochDa) await db('experts').where({ id: x.expert_id }).del();
    }
  }
  // Die Experten aus dem Kürzeltest hängen an keinem Mandat.
  await db('experts').where({ tenant_id: tenantId })
    .whereIn('nachname', ['Schneider', 'Schubert']).del();

  const [experte] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Martin', nachname: 'Schumacher',
    email: 'martin.schumacher@beispiel.invalid', status: 'freigegeben',
  }).returning('*');
  experteId = experte.id;

  const [projekt] = await db('projects').insert({
    tenant_id: tenantId, name: 'Interim Werkleitung v140', status: 'offen',
  }).returning('*');
  const [mandat] = await db('engagements').insert({
    tenant_id: tenantId, project_id: projekt.id, expert_id: experte.id,
    tagessatz_experte_eur: 1450, tagessatz_kunde_eur: 1750, status: 'aktiv',
    phalanx_projekt_nummer: '30077',
  }).returning('*');
  mandatId = mandat.id;

  const [nachweis] = await db('timesheets').insert({
    tenant_id: tenantId, engagement_id: mandat.id, periode: '2026-09',
    tage: 12.5, spesen_eur: 340, status: 'freigegeben',
    beschreibung: 'Werkleitung, Anlauf Linie 3',
  }).returning('*');
  nachweisId = nachweis.id;
});

beforeEach(() => { modus = 'ok'; px.cacheLeeren(); });

after(async () => {
  global.fetch = echtesFetch;
  delete process.env.PHALANX_OS_BASE_URL;
  delete process.env.PHALANX_OS_API_KEY;
  server.close();
  await db.destroy();
});

/* --------------------------------- Kürzel --------------------------------- */

test('Das Kürzel nimmt drei Buchstaben aus jedem Namensteil', () => {
  assert.strictEqual(pk.vorschlag('Martin', 'Schumacher'), 'MARSCH');
  assert.strictEqual(pk.vorschlag('Jürgen', 'Groß'), 'JUEGRO', 'Umlaute werden aufgelöst');
  assert.strictEqual(pk.vorschlag('Li', 'Wu'), 'LIWU', 'kurze Namen werden nicht künstlich verlängert');
  assert.strictEqual(pk.vorschlag('Ana-Maria', "O'Brien"), 'ANAOBR');
  assert.strictEqual(pk.vorschlag('', ''), 'EXP', 'ohne lateinische Buchstaben bleibt die Eindeutigkeit');
});

test('Gleiche Kürzel werden durchnummeriert, vergebene bleiben unverändert', async () => {
  // Ein Kürzel entsteht erst bei der ersten Übergabe. Martin Schumacher
  // bekommt seines hier vorab, damit der Gleichstand überhaupt eintritt.
  await pk.kuerzelFuer(db, await db('experts').where({ id: experteId }).first());

  const [a] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Marta', nachname: 'Schneider', status: 'freigegeben',
  }).returning('*');
  const [b] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Marc', nachname: 'Schubert', status: 'freigegeben',
  }).returning('*');

  const k1 = await pk.kuerzelFuer(db, a);
  const k2 = await pk.kuerzelFuer(db, b);
  assert.match(k1, /^MARSCH\d+$/, 'MARSCH hat Martin Schumacher schon, also durchnummeriert');
  assert.match(k2, /^MARSCH\d+$/);
  assert.notStrictEqual(k1, k2, 'und zwar verschieden');

  // Namenswechsel ändert das Kürzel nicht: Drüben hängen Zeiteinträge daran.
  await db('experts').where({ id: a.id }).update({ nachname: 'Wiesinger' });
  const erneut = await pk.kuerzelFuer(db, await db('experts').where({ id: a.id }).first());
  assert.strictEqual(erneut, k1, 'einmal vergeben, bleibt es');
});

/* -------------------------------- Nutzlast -------------------------------- */

test('Aus Tagen im Monat wird ein Eintrag am Monatsletzten', () => {
  const e = pz.baueEintrag({
    nachweis: { id: 42, periode: '2026-09', tage: 12.5, status: 'freigegeben', beschreibung: 'Anlauf' },
    nummer: '30077', kuerzel: 'MARSCH',
  });
  assert.strictEqual(e.datum, '2026-09-30', 'September hat 30 Tage');
  assert.strictEqual(e.minuten, 6000, '12,5 Tage mal 480 Minuten');
  assert.strictEqual(e.extern_kennung, '42');
  assert.strictEqual(e.abrechenbar, true);
  assert.strictEqual(e.storniert, false);
  assert.match(e.beschreibung, /2026-09/, 'die Periode steht in der Beschreibung');
  assert.match(e.beschreibung, /12,5 Tage/);

  assert.strictEqual(pz.letzterTag('2026-02'), '2026-02-28');
  assert.strictEqual(pz.letzterTag('2028-02'), '2028-02-29', 'Schaltjahr');
  assert.strictEqual(pz.letzterTag('2026-12'), '2026-12-31');
});

test('Kein Klarname, keine Mailadresse, kein Honorarsatz in der Nutzlast', () => {
  const e = pz.baueEintrag({
    nachweis: { id: 42, periode: '2026-09', tage: 12.5, status: 'freigegeben', beschreibung: null },
    nummer: '30077', kuerzel: 'MARSCH',
  });

  // Gegen die echten Daten dieses Experten, nicht gegen eine erfundene Liste.
  pz.pruefeNutzlast(e, { verboteneWerte: ['Martin', 'Schumacher', 'martin.schumacher@beispiel.invalid'] });

  const text = JSON.stringify(e);
  assert.ok(!text.includes('Schumacher'));
  assert.ok(!text.includes('@'));
  assert.ok(!text.includes('1450'), 'der Einkaufssatz bleibt hier');
  assert.ok(!text.includes('1750'), 'der Verkaufssatz erst recht');
  assert.deepStrictEqual(Object.keys(e).sort(), [...pz.ERLAUBTE_FELDER].sort());
});

test('Ein Feld, das jemand später ergänzt, fällt auf', () => {
  const e = pz.baueEintrag({
    nachweis: { id: 1, periode: '2026-09', tage: 1, status: 'freigegeben' },
    nummer: '30077', kuerzel: 'MARSCH',
  });
  assert.throws(() => pz.pruefeNutzlast({ ...e, tagessatz_eur: 1450 }), /Unerlaubte Felder/);
  assert.throws(
    () => pz.pruefeNutzlast({ ...e, beschreibung: 'Einsatz Martin Schumacher' }, { verboteneWerte: ['Schumacher'] }),
    /nicht nach Phalanx OS/,
  );
});

/* -------------------------------- Übergabe -------------------------------- */

test('Dieselbe Zeile zweimal gesendet ergibt einen Eintrag, nicht zwei', async () => {
  osZeiten = new Map(); osAbgerechnet = new Set(); osAufrufe = 0;

  const r1 = await post(`/api/billing/nachweis/${nachweisId}/uebergeben`, {}, { cookie: adminCookie });
  assert.strictEqual(r1.status, 200);

  // Beim zweiten Mal von Hand wird wieder gesendet, und genau das ist der Test:
  // Drüben darf trotzdem nur ein Eintrag stehen.
  const r2 = await post(`/api/billing/nachweis/${nachweisId}/uebergeben`, {}, { cookie: adminCookie });
  assert.strictEqual(r2.status, 200);

  assert.strictEqual(osAufrufe, 2, 'zweimal gesendet');
  assert.strictEqual(osZeiten.size, 1, 'ein Eintrag drüben');
  const eintrag = [...osZeiten.values()][0];
  assert.strictEqual(eintrag.source_ref, `expertnetwork:${nachweisId}`);
  assert.strictEqual(eintrag.minuten, 6000);
});

test('Der Tageslauf schickt nur, was sich geändert hat', async () => {
  // Erst alles auf Stand bringen, dann prüfen, dass ein zweiter Lauf schweigt.
  await pz.gleicheAb({ db, tenantId });
  osAufrufe = 0;
  const e1 = await pz.gleicheAb({ db, tenantId });
  assert.ok(e1.unveraendert >= 1, 'der Nachweis ist auf Stand');
  assert.strictEqual(e1.uebergeben, 0, 'nichts hat sich geändert');
  assert.strictEqual(osAufrufe, 0, 'also wurde nichts gesendet');

  await db('timesheets').where({ id: nachweisId }).update({ tage: 14 });
  const e2 = await pz.gleicheAb({ db, tenantId });
  assert.strictEqual(e2.uebergeben, 1);
  assert.strictEqual([...osZeiten.values()][0].minuten, 6720, '14 Tage');
  assert.strictEqual(osZeiten.size, 1, 'weiterhin ein Eintrag');

  await db('timesheets').where({ id: nachweisId }).update({ tage: 12.5 });
  await pz.gleicheAb({ db, tenantId });
});

test('Ein abgerechneter Eintrag wird nicht verändert, und die Antwort sagt warum', async () => {
  // Drüben auf abgerechnet setzen, wie es nach einer gestellten Rechnung wäre.
  osAbgerechnet.add(`expertnetwork:${nachweisId}`);
  const vorher = JSON.stringify([...osZeiten.values()][0]);

  await db('timesheets').where({ id: nachweisId }).update({ tage: 99 });
  const res = await post(`/api/billing/nachweis/${nachweisId}/uebergeben`, {}, { cookie: adminCookie });

  assert.strictEqual(res.status, 409);
  const d = await res.json();
  assert.match(d.error, /bereits abgerechnet/);
  assert.strictEqual(JSON.stringify([...osZeiten.values()][0]), vorher, 'drüben unverändert');

  const spur = await db('audit_log').where({ action: 'phalanx.zeit_bereits_abgerechnet' }).orderBy('id', 'desc').first();
  assert.ok(spur, 'es gibt einen Protokolleintrag');

  const n = await db('timesheets').where({ id: nachweisId }).first();
  assert.match(n.phalanx_fehler, /abgerechnet/, 'der Grund steht am Nachweis');

  osAbgerechnet.delete(`expertnetwork:${nachweisId}`);
  await db('timesheets').where({ id: nachweisId }).update({ tage: 12.5 });
});

test('Gelöscht wird nicht, storniert schon', async () => {
  await db('timesheets').where({ id: nachweisId }).update({ tage: 0 });
  const res = await post(`/api/billing/nachweis/${nachweisId}/uebergeben`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);

  const eintrag = [...osZeiten.values()][0];
  assert.strictEqual(eintrag.minuten, 0, 'auf null gesetzt');
  assert.strictEqual(eintrag.storniert, true, 'und als storniert gekennzeichnet');
  assert.strictEqual(osZeiten.size, 1, 'die Position ist noch da, nur eben leer');
  assert.match(eintrag.beschreibung, /storniert/);

  await db('timesheets').where({ id: nachweisId }).update({ tage: 12.5 });
  await post(`/api/billing/nachweis/${nachweisId}/uebergeben`, {}, { cookie: adminCookie });
});

test('Eine unbekannte Projektnummer wird abgewiesen, nicht angelegt', async () => {
  const anzahlVorher = osZeiten.size;
  // Am Mandat vorbei direkt in die Datenbank, damit die Prüfung aus v1.39.0
  // nicht greift: Geprüft wird hier, was die Übergabe selbst tut.
  await db('engagements').where({ id: mandatId }).update({ phalanx_projekt_nummer: '30999' });

  const res = await post(`/api/billing/nachweis/${nachweisId}/uebergeben`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 502);
  assert.strictEqual(osZeiten.size, anzahlVorher, 'drüben wurde nichts angelegt');

  await db('engagements').where({ id: mandatId }).update({ phalanx_projekt_nummer: '30077' });
});

test('Offene Nachweise gehen nicht hinaus', async () => {
  const [offen] = await db('timesheets').insert({
    tenant_id: tenantId, engagement_id: mandatId, periode: '2026-10',
    tage: 3, status: 'offen',
  }).returning('*');

  osAufrufe = 0;
  const e = await pz.gleicheAb({ db, tenantId });
  assert.ok(!e.meldungen.some((m) => m.includes('2026-10')), 'der offene Nachweis ist nicht dabei');
  const n = await db('timesheets').where({ id: offen.id }).first();
  assert.strictEqual(n.phalanx_gesendet_am, null, 'was noch bearbeitet wird, bleibt hier');

  await db('timesheets').where({ id: offen.id }).del();
});

test('Ohne Zuordnung keine Übergabe', async () => {
  const [experte] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Ohne', nachname: 'Zuordnung', status: 'freigegeben',
  }).returning('*');
  const [projekt] = await db('projects').insert({
    tenant_id: tenantId, name: 'Ohne Nummer v140', status: 'offen',
  }).returning('*');
  const [mandat] = await db('engagements').insert({
    tenant_id: tenantId, project_id: projekt.id, expert_id: experte.id,
    tagessatz_experte_eur: 900, status: 'aktiv',
  }).returning('*');
  const [n] = await db('timesheets').insert({
    tenant_id: tenantId, engagement_id: mandat.id, periode: '2026-09', tage: 5, status: 'freigegeben',
  }).returning('*');

  const res = await post(`/api/billing/nachweis/${n.id}/uebergeben`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /keinem Phalanx-OS-Projekt zugeordnet/);
});

test('Ohne gültigen Schlüssel wird abgewiesen und protokolliert', async () => {
  modus = 'kein_schluessel';
  const vorher = Number((await db('audit_log').where({ action: 'phalanx.zeiten_abgelehnt' }).count('* as n').first()).n);

  await db('timesheets').where({ id: nachweisId }).update({ tage: 13 });
  const res = await post(`/api/billing/nachweis/${nachweisId}/uebergeben`, {}, { cookie: adminCookie });

  assert.strictEqual(res.status, 502);
  const d = await res.json();
  assert.ok(!JSON.stringify(d).includes('geheim-nur-im-test'), 'der Schlüssel steht in keiner Antwort');

  const nachher = Number((await db('audit_log').where({ action: 'phalanx.zeiten_abgelehnt' }).count('* as n').first()).n);
  assert.strictEqual(nachher, vorher + 1, 'der abgelehnte Schlüssel hinterlässt eine Spur');

  modus = 'ok';
  await db('timesheets').where({ id: nachweisId }).update({ tage: 12.5 });
});

test('Ein Einzelfall bricht den Lauf nicht ab', async () => {
  // Zwei Nachweise, einer zeigt auf ein unbekanntes Projekt.
  const [experte] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Beate', nachname: 'Zweitmandat', status: 'freigegeben',
  }).returning('*');
  const [projekt] = await db('projects').insert({
    tenant_id: tenantId, name: 'Kaputte Nummer v140', status: 'offen',
  }).returning('*');
  const [mandat] = await db('engagements').insert({
    tenant_id: tenantId, project_id: projekt.id, expert_id: experte.id,
    tagessatz_experte_eur: 800, status: 'aktiv', phalanx_projekt_nummer: '30999',
  }).returning('*');
  await db('timesheets').insert({
    tenant_id: tenantId, engagement_id: mandat.id, periode: '2026-08', tage: 4, status: 'freigegeben',
  });

  await db('timesheets').where({ id: nachweisId }).update({ tage: 11 });
  const e = await pz.gleicheAb({ db, tenantId });

  assert.ok(e.fehler >= 1, 'der kaputte Fall fällt auf');
  assert.ok(e.uebergeben >= 1, 'der gute läuft trotzdem durch');
  const gut = await db('timesheets').where({ id: nachweisId }).first();
  assert.strictEqual(gut.phalanx_minuten, 11 * 480, 'und zwar mit dem neuen Stand');
  assert.strictEqual(gut.phalanx_fehler, null);

  await db('timesheets').where({ id: nachweisId }).update({ tage: 12.5 });
});

test('Die Übergabe ist angemeldeten Nutzern vorbehalten, der Sammellauf dem Admin', async () => {
  assert.strictEqual((await post(`/api/billing/nachweis/${nachweisId}/uebergeben`, {})).status, 401);
  assert.strictEqual((await post('/api/billing/phalanx-abgleich', {})).status, 401);
});
