/**
 * v1.38.0 — Monatsbericht.
 *
 * Geprüft werden: die Zuordnung der Ereignisse zu Monaten, die Reihenfolge der
 * Monate, der Vergleich des letzten vollen Monats gegen den davor, dass Nullen
 * stehen bleiben statt zu verschwinden, und dass das PDF wirklich ein PDF ist.
 * Alle Namen sind erfunden.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const { baueBericht, monate } = require('../routes/bericht');

let server; let baseUrl; let adminCookie; let tenantId;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const get = (p, h = {}) => fetch(baseUrl + p, { headers: h });

/** Fester Monat, damit der Test nicht am Kalender hängt. */
const M = (versatz) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + versatz);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const tagIn = (monat, tag = 15) => new Date(`${monat}-${String(tag).padStart(2, '0')}T12:00:00`);

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

  // Eigener Mandant für diesen Test. Alle Testdateien teilen sich eine
  // Datenbank, und ein Bericht rechnet über den gesamten Bestand. Wer hier
  // fremde Daten beiseite räumt, nimmt sie den Testdateien weg, die danach
  // laufen. Ein eigener Mandant lässt alles andere unberührt.
  const mandant = await db('tenants').where({ slug: 'bericht-v138' }).first()
    || (await db('tenants').insert({ name: 'Berichtstest', slug: 'bericht-v138' }).returning('*'))[0];
  tenantId = mandant.id;

  // Vorletzter Monat: zwei Zugänge, drei Ansprachen, eine Reaktion.
  for (const n of ['Hildebrand', 'Ottilie']) {
    await db('experts').insert({
      tenant_id: tenantId, vorname: n, nachname: `Zugang${n}`, status: 'freigegeben',
      created_at: tagIn(M(-2)),
    });
  }
  for (const n of ['Anspr1', 'Anspr2', 'Anspr3']) {
    await db('experts').insert({
      tenant_id: tenantId, vorname: n, nachname: 'Kontakt', status: 'vorregistriert',
      vorreg_importiert_am: tagIn(M(-2)), vorreg_angeschrieben_am: tagIn(M(-2)).toISOString().slice(0, 10),
      ...(n === 'Anspr1' ? { vorreg_reaktion: 'interesse', vorreg_reaktion_am: tagIn(M(-2), 20) } : {}),
      created_at: tagIn(M(-2)),
    });
  }

  // Letzter voller Monat: ein Zugang, eine Anfrage, ein Mandat, eine Rechnung.
  const [spaet] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Waltraud', nachname: 'Spaetzugang', status: 'registriert',
    created_at: tagIn(M(-1)),
  }).returning('*');
  const [projekt] = await db('projects').insert({
    tenant_id: tenantId, name: 'Interim Werkleitung', status: 'offen', created_at: tagIn(M(-1)),
  }).returning('*');
  await db('project_releases').insert({
    tenant_id: tenantId, project_id: projekt.id, expert_id: spaet.id,
    feedback: 'interessant', feedback_at: tagIn(M(-1), 20), created_at: tagIn(M(-1)),
  });
  const [mandat] = await db('engagements').insert({
    tenant_id: tenantId, project_id: projekt.id, expert_id: spaet.id,
    tagessatz_experte_eur: 1100, status: 'aktiv', start: tagIn(M(-1)).toISOString().slice(0, 10),
  }).returning('*');
  await db('invoices').insert([
    { tenant_id: tenantId, engagement_id: mandat.id, typ: 'rechnung', beleg_nr: 'R-V138-1',
      datum: tagIn(M(-1), 28).toISOString().slice(0, 10), netto_cent: 2000000, ust_prozent: 19,
      ust_cent: 380000, brutto_cent: 2380000, status: 'versendet' },
    { tenant_id: tenantId, engagement_id: mandat.id, typ: 'gutschrift', beleg_nr: 'G-V138-1',
      datum: tagIn(M(-1), 28).toISOString().slice(0, 10), netto_cent: 1650000, ust_prozent: 19,
      ust_cent: 313500, brutto_cent: 1963500, status: 'offen' },
    // Storniert, zählt nicht mit.
    { tenant_id: tenantId, engagement_id: mandat.id, typ: 'rechnung', beleg_nr: 'R-V138-2',
      datum: tagIn(M(-1), 28).toISOString().slice(0, 10), netto_cent: 999900, ust_prozent: 19,
      ust_cent: 189981, brutto_cent: 1189881, status: 'storniert' },
  ]);
});

after(async () => { server.close(); await db.destroy(); });

test('Die Monatsreihe ist lückenlos, auch wenn nichts passiert ist', async () => {
  assert.deepStrictEqual(monate('2026-01', '2026-04'), ['2026-01', '2026-02', '2026-03', '2026-04']);
  assert.deepStrictEqual(monate('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepStrictEqual(monate('2026-05', '2026-05'), ['2026-05']);
});

test('Ereignisse landen in dem Monat, in dem sie passiert sind', async () => {
  const d = await baueBericht(tenantId, { von: M(-3), bis: M(0) });
  const vorletzter = d.monate.find((m) => m.monat === M(-2));
  const letzter = d.monate.find((m) => m.monat === M(-1));

  assert.strictEqual(vorletzter.zugaenge, 2);
  assert.strictEqual(vorletzter.angeschrieben, 3);
  assert.strictEqual(vorletzter.reaktionen, 1);
  assert.strictEqual(vorletzter.quote_reaktion, 33.3, 'eine von drei');
  assert.strictEqual(vorletzter.umsatz_cent, 0, 'in diesem Monat kein Umsatz, und das steht auch so da');

  assert.strictEqual(letzter.zugaenge, 1);
  assert.strictEqual(letzter.anfragen, 1);
  assert.strictEqual(letzter.profile_vorgelegt, 1);
  assert.strictEqual(letzter.rueckmeldungen, 1);
  assert.strictEqual(letzter.mandate_gestartet, 1);
});

test('Umsatz und Marge, Storniertes bleibt draußen', async () => {
  const d = await baueBericht(tenantId, { von: M(-3), bis: M(0) });
  const letzter = d.monate.find((m) => m.monat === M(-1));

  assert.strictEqual(letzter.umsatz_cent, 2000000, 'nur die gültige Rechnung');
  assert.strictEqual(letzter.auszahlung_cent, 1650000, 'die Gutschrift an den Experten');
  assert.strictEqual(letzter.marge_cent, 350000);
  assert.strictEqual(d.gesamt.umsatz_cent, 2000000);
  assert.strictEqual(d.gesamt.marge_cent, 350000);
});

test('Verglichen wird der letzte volle Monat, nicht der laufende', async () => {
  const d = await baueBericht(tenantId, { von: M(-3), bis: M(0) });
  assert.ok(d.vergleich, 'es gibt einen Vergleich');
  assert.strictEqual(d.vergleich.monat, M(-1), 'der letzte volle');
  assert.strictEqual(d.vergleich.vormonat, M(-2));

  const zugaenge = d.vergleich.felder.find((f) => f.feld === 'zugaenge');
  assert.strictEqual(zugaenge.jetzt, 1);
  assert.strictEqual(zugaenge.vorher, 2);
  assert.strictEqual(zugaenge.differenz, -1);

  const umsatz = d.vergleich.felder.find((f) => f.feld === 'umsatz_cent');
  assert.strictEqual(umsatz.differenz, 2000000);
});

test('Der Stand heute steht neben der Entwicklung', async () => {
  const d = await baueBericht(tenantId, {});
  assert.strictEqual(d.stand.pool, 3, 'zwei freigegeben plus eine registriert, Vorbereitete zählen nicht');
  assert.strictEqual(d.stand.vorbereitet, 3);
  assert.strictEqual(d.stand.mandate_aktiv, 1);
  assert.strictEqual(d.stand.projekte_offen, 1);
  assert.strictEqual(d.zeitraum.monate, 6, 'ohne Angabe die letzten sechs Monate');
});

test('Die Route antwortet und ist dem Admin vorbehalten', async () => {
  // Die Route läuft als Admin des Phalanx-Mandanten und sieht deshalb dessen
  // Zahlen, nicht die des Testmandanten. Geprüft wird hier die Strecke, die
  // Rechnung selbst steht in den Tests darüber.
  const res = await get(`/api/bericht?von=${M(-3)}&bis=${M(0)}`, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.strictEqual(d.monate.length, 4);
  assert.ok(Array.isArray(d.monate) && d.stand && d.gesamt);

  assert.strictEqual((await get('/api/bericht')).status, 401);
  assert.strictEqual((await get('/api/bericht/pdf')).status, 401);
});

test('Das PDF ist ein PDF und trägt den Zeitraum im Namen', async () => {
  const res = await get(`/api/bericht/pdf?von=${M(-3)}&bis=${M(0)}`, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition'), new RegExp(`Phalanx-Bericht-${M(-3)}`));

  const buf = Buffer.from(await res.arrayBuffer());
  assert.strictEqual(buf.subarray(0, 5).toString(), '%PDF-', 'echte PDF-Kennung');
  assert.ok(buf.length > 1200, `Datei hat Inhalt, ${buf.length} Bytes`);
});

test('Ein Zeitraum ohne jedes Ereignis liefert Nullen statt Fehler', async () => {
  const d = await baueBericht(tenantId, { von: '2020-01', bis: '2020-03' });
  assert.strictEqual(d.monate.length, 3);
  assert.ok(d.monate.every((m) => m.zugaenge === 0 && m.umsatz_cent === 0));
  assert.strictEqual(d.gesamt.quote_reaktion, 0, 'keine Division durch null');
  assert.ok(d.stand.pool > 0, 'der Stand heute bleibt davon unberührt');
});
