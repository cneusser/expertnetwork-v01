/**
 * v1.41.0 — Adressfelder nach deutschem Standard.
 *
 * Die Fälle sind nicht ausgedacht, sondern die, an denen Zerleger scheitern:
 * führende Null in der Postleitzahl, Buchstaben in der Hausnummer, Ziffern im
 * Straßennamen, Postfach, zwei Adressen in einem Feld, ausländische Formate.
 *
 * Die wichtigste Zusicherung steht am Ende: Der Trockenlauf verändert nichts,
 * und nichts wird automatisch übernommen.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const a = require('../utils/adresse');
const lauf = require('../utils/adresseLauf');

let server; let baseUrl; let adminCookie; let tenantId;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const get = (p, h = {}) => fetch(baseUrl + p, { headers: h });

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
});

after(async () => { server.close(); await db.destroy(); });

/* ------------------------------ Zerlegung -------------------------------- */

test('Der Normalfall wird sauber getrennt', () => {
  const r = a.zerlege('Helene-Lange-Straße 28, 91056 Erlangen');
  assert.strictEqual(r.einstufung, 'sicher');
  assert.strictEqual(r.felder.strasse, 'Helene-Lange-Straße');
  assert.strictEqual(r.felder.hausnummer, '28');
  assert.strictEqual(r.felder.plz, '91056');
  assert.strictEqual(r.felder.ort, 'Erlangen');
  assert.strictEqual(r.felder.land, 'DE');
});

test('Die führende Null der Postleitzahl bleibt erhalten', () => {
  const r = a.zerlege('Prager Straße 12, 01067 Dresden');
  assert.strictEqual(r.einstufung, 'sicher');
  assert.strictEqual(r.felder.plz, '01067', 'als Zahl wären das 1067 und Dresden läge nirgends');
  assert.strictEqual(typeof r.felder.plz, 'string');
});

test('Hausnummern sind keine Zahlen', () => {
  assert.strictEqual(a.zerlege('Hauptstraße 28a, 90402 Nürnberg').felder.hausnummer, '28a');
  assert.strictEqual(a.zerlege('Am Markt 3-5, 20095 Hamburg').felder.hausnummer, '3-5');
  assert.strictEqual(a.zerlege('Lindenallee 7 b, 10115 Berlin').felder.hausnummer, '7b');
});

test('Ein Adresszusatz bleibt ein Zusatz', () => {
  const r = a.zerlege('Industriestraße 4, Gebäude B, 3. OG, 70565 Stuttgart');
  assert.strictEqual(r.einstufung, 'sicher');
  assert.strictEqual(r.felder.strasse, 'Industriestraße');
  assert.strictEqual(r.felder.adresszusatz, 'Gebäude B, 3. OG');
  assert.strictEqual(r.felder.ort, 'Stuttgart');
});

test('Ziffern im Straßennamen werden gemeldet, nicht geraten', () => {
  const r = a.zerlege('Straße des 17. Juni 135, 10623 Berlin');
  assert.strictEqual(r.einstufung, 'melden', 'der Fall, an den man nicht denkt');
  assert.match(r.grund, /Ziffern in der Straße/);
});

test('Ein Postfach ist keine Hausanschrift', () => {
  assert.strictEqual(a.zerlege('Postfach 10 20 30, 90402 Nürnberg').einstufung, 'melden');
  assert.match(a.zerlege('Postfach 100, 12345 Musterstadt').grund, /Postfach/);
  assert.match(a.zerlege('P.O. Box 44, 12345 Musterstadt').grund, /Postfach/);
});

test('Zwei Adressen in einem Feld werden gemeldet', () => {
  const r = a.zerlege('Hauptstr. 1, 10115 Berlin, Nebenstr. 2, 20095 Hamburg');
  assert.strictEqual(r.einstufung, 'melden');
  assert.match(r.grund, /mehrere Postleitzahlen/);
});

test('Ausländische Formate werden gemeldet, nicht gebogen', () => {
  assert.match(a.zerlege('Kärntner Ring 12, 1010 Wien, Österreich').grund, /ausländisch/i);
  assert.match(a.zerlege('Bahnhofstrasse 9, CH-8001 Zürich').grund, /ausländisch/i);
});

test('Eine fehlende Hausnummer wird gemeldet', () => {
  const r = a.zerlege('Am Alten Hafen, 28217 Bremen');
  assert.strictEqual(r.einstufung, 'melden');
  assert.match(r.grund, /keine Hausnummer/);
  assert.strictEqual(r.felder.ort, 'Bremen', 'was sicher ist, steht trotzdem da');
});

test('Ein Objekt mit getrennten Feldern wird nur um die Hausnummer erleichtert', () => {
  const r = a.zerlege({ strasse: 'Königsallee 14', plz: '40212', ort: 'Düsseldorf', land: 'Deutschland' });
  assert.strictEqual(r.einstufung, 'sicher');
  assert.strictEqual(r.felder.strasse, 'Königsallee');
  assert.strictEqual(r.felder.hausnummer, '14');
  assert.strictEqual(r.felder.land, 'DE', 'Deutschland wird zum Code');
});

test('Das Land wird auf zwei Zeichen gebracht', () => {
  assert.strictEqual(a.landCode('Deutschland'), 'DE');
  assert.strictEqual(a.landCode('deutschland'), 'DE');
  assert.strictEqual(a.landCode('GER'), 'DE');
  assert.strictEqual(a.landCode('Österreich'), 'AT');
  assert.strictEqual(a.landCode('CH'), 'CH');
  assert.strictEqual(a.landCode(''), 'DE', 'Vorbelegung');
  assert.strictEqual(a.landCode('Absurdistan', null), null, 'nicht deutbar, das ist eine Meldung wert');
});

/* -------------------------------- Anzeige -------------------------------- */

test('Die Anzeige wird gerechnet, in deutscher Reihenfolge', () => {
  const zeilen = a.anzeigeZeilen({
    strasse: 'Helene-Lange-Straße', hausnummer: '28', plz: '91056', ort: 'Erlangen', land: 'DE',
  });
  assert.deepStrictEqual(zeilen, ['Helene-Lange-Straße 28', '91056 Erlangen']);
});

test('Das eigene Land steht nicht unter der eigenen Adresse', () => {
  const inland = a.anzeigeZeilen({ strasse: 'Hauptstr.', hausnummer: '1', plz: '10115', ort: 'Berlin', land: 'DE' });
  assert.ok(!inland.includes('Deutschland'), 'liest sich sonst wie ein Fehler');

  const ausland = a.anzeigeZeilen({ strasse: 'Kärntner Ring', hausnummer: '12', plz: '1010', ort: 'Wien', land: 'AT' });
  assert.strictEqual(ausland[ausland.length - 1], 'Österreich');
});

test('Der Zusatz steht zwischen Straße und Ort', () => {
  assert.deepStrictEqual(
    a.anzeigeZeilen({ strasse: 'Industriestraße', hausnummer: '4', adresszusatz: 'Gebäude B', plz: '70565', ort: 'Stuttgart' }),
    ['Industriestraße 4', 'Gebäude B', '70565 Stuttgart'],
  );
});

test('Fehlende Teile hinterlassen keine leeren Zeilen', () => {
  assert.deepStrictEqual(a.anzeigeZeilen({ plz: '10115', ort: 'Berlin' }), ['10115 Berlin']);
  assert.deepStrictEqual(a.anzeigeZeilen({}), []);
});

/* ------------------------------ Der Lauf --------------------------------- */

test('Der Trockenlauf verändert nichts', async () => {
  const [e] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Trocken', nachname: 'Lauf141', status: 'freigegeben',
    adresse_json: JSON.stringify({ strasse: 'Marienplatz 8', plz: '80331', ort: 'München' }),
  }).returning('*');

  const vorherVorschlaege = Number((await db('adresse_vorschlag').count('* as n').first()).n);
  const r = await lauf.lauf({ db, tenantId, schreiben: false });

  assert.ok(r.sicher >= 1, 'der Fall wäre sicher');
  const nachher = Number((await db('adresse_vorschlag').count('* as n').first()).n);
  assert.strictEqual(nachher, vorherVorschlaege, 'kein Vorschlag abgelegt');

  const unveraendert = await db('experts').where({ id: e.id }).first();
  assert.strictEqual(unveraendert.strasse, null, 'keine Spalte berührt');
  assert.ok(unveraendert.adresse_json, 'das Original steht noch da');
});

test('Der Lauf legt Vorschläge ab, übernimmt aber nichts', async () => {
  const [sicher] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Sicher', nachname: 'Fall141', status: 'freigegeben',
    adresse_json: JSON.stringify({ strasse: 'Königsallee 14', plz: '40212', ort: 'Düsseldorf' }),
  }).returning('*');
  const [unklar] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Unklar', nachname: 'Fall141', status: 'freigegeben',
    adresse_json: JSON.stringify({ strasse: 'Postfach 1234', plz: '40212', ort: 'Düsseldorf' }),
  }).returning('*');

  await lauf.lauf({ db, tenantId, schreiben: true });

  const vs = await db('adresse_vorschlag')
    .where({ tenant_id: tenantId, subjekt_typ: 'expert', subjekt_id: sicher.id }).first();
  assert.ok(vs, 'der sichere Fall hat einen Vorschlag');
  assert.strictEqual(vs.einstufung, 'sicher');
  assert.strictEqual(vs.status, 'offen', 'offen, nicht übernommen');

  const vu = await db('adresse_vorschlag')
    .where({ tenant_id: tenantId, subjekt_typ: 'expert', subjekt_id: unklar.id }).first();
  assert.strictEqual(vu.einstufung, 'melden');
  assert.match(vu.grund, /Postfach/);

  // Nichts geschrieben, in keinem der beiden Fälle.
  for (const id of [sicher.id, unklar.id]) {
    const e = await db('experts').where({ id }).first();
    assert.strictEqual(e.strasse, null, 'die Felder bleiben leer, bis jemand bestätigt');
  }
});

test('Ein zweiter Lauf stapelt keine Vorschläge', async () => {
  const vorher = Number((await db('adresse_vorschlag').where({ tenant_id: tenantId }).count('* as n').first()).n);
  await lauf.lauf({ db, tenantId, schreiben: true });
  const nachher = Number((await db('adresse_vorschlag').where({ tenant_id: tenantId }).count('* as n').first()).n);
  assert.strictEqual(nachher, vorher, 'je Subjekt und Herkunft ein offener Vorschlag');
});

test('Erst die Bestätigung schreibt, und das Original bleibt', async () => {
  const [e] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Bestaetigt', nachname: 'Fall141', status: 'freigegeben',
    adresse_json: JSON.stringify({ strasse: 'Prager Straße 12', plz: '01067', ort: 'Dresden' }),
  }).returning('*');
  await lauf.lauf({ db, tenantId, schreiben: true });

  const v = await db('adresse_vorschlag')
    .where({ tenant_id: tenantId, subjekt_typ: 'expert', subjekt_id: e.id, status: 'offen' }).first();
  const res = await post(`/api/adressen/vorschlaege/${v.id}/uebernehmen`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);

  const nachher = await db('experts').where({ id: e.id }).first();
  assert.strictEqual(nachher.strasse, 'Prager Straße');
  assert.strictEqual(nachher.hausnummer, '12');
  assert.strictEqual(nachher.plz, '01067', 'die führende Null hat überlebt');
  assert.strictEqual(nachher.adresse_ort, 'Dresden');
  assert.strictEqual(nachher.adresse_land, 'DE');
  assert.strictEqual(nachher.adresse_quelle, 'zerlegt');
  assert.ok(nachher.adresse_am);
  assert.match(nachher.adresse_roh, /Prager Straße 12/, 'das Original bleibt nachlesbar');

  const danach = await db('adresse_vorschlag').where({ id: v.id }).first();
  assert.strictEqual(danach.status, 'uebernommen');
});

test('Was schon in Feldern steht, wird nicht wieder in Frage gestellt', async () => {
  const e = await db('experts').where({ tenant_id: tenantId, nachname: 'Fall141', vorname: 'Bestaetigt' }).first();
  const r = await lauf.lauf({ db, tenantId, schreiben: false });
  assert.ok(r.schon_zerlegt >= 1);

  const v = await db('adresse_vorschlag')
    .where({ tenant_id: tenantId, subjekt_id: e.id, herkunft: 'zerleger', status: 'offen' }).first();
  assert.ok(!v, 'kein neuer Vorschlag für eine bestätigte Adresse');
});

test('Ein gemeldeter Fall lässt sich nicht einfach durchwinken', async () => {
  const v = await db('adresse_vorschlag')
    .where({ tenant_id: tenantId, einstufung: 'melden', status: 'offen' }).first();
  const res = await post(`/api/adressen/vorschlaege/${v.id}/uebernehmen`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 400, 'unvollständig, muss von Hand erfasst werden');

  // Und der Sammelknopf fasst ihn gar nicht erst an.
  const vorher = await db('adresse_vorschlag').where({ id: v.id }).first();
  await post('/api/adressen/vorschlaege/sichere-uebernehmen', {}, { cookie: adminCookie });
  const nachher = await db('adresse_vorschlag').where({ id: v.id }).first();
  assert.strictEqual(nachher.status, vorher.status, 'gemeldet bleibt gemeldet');
});

test('Von Hand geändert heißt erfasst, nicht zerlegt', async () => {
  const e = await db('experts').where({ tenant_id: tenantId, nachname: 'Fall141', vorname: 'Bestaetigt' }).first();
  const res = await fetch(`${baseUrl}/api/experts/${e.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ hausnummer: '12a' }),
  });
  assert.strictEqual(res.status, 200);
  const nachher = await db('experts').where({ id: e.id }).first();
  assert.strictEqual(nachher.hausnummer, '12a');
  assert.strictEqual(nachher.adresse_quelle, 'erfasst');
});

test('Die Adressverwaltung ist Verwaltungssache', async () => {
  assert.strictEqual((await get('/api/adressen/trockenlauf')).status, 401);
  assert.strictEqual((await post('/api/adressen/lauf', {})).status, 401);
});
