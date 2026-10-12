/**
 * v1.42.0 — Projektanfragen einlesen.
 *
 * Geprüft wird gegen vier Formate, die sich wirklich unterscheiden: die
 * Rundmail eines Personaldienstleisters mit Feldern und Aufzählungen, eine
 * formlose Mail eines Endkunden, ein knapper Dreizeiler und eine Anfrage ohne
 * jede Struktur.
 *
 * Die wichtigste Zusicherung: Was nicht dasteht, wird nicht erfunden. Der
 * Tagessatz fehlt in fast jeder Anfrage, und eine erfundene Zahl wäre
 * schlimmer als ein leeres Feld, weil sie aussieht wie eine Information.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const leser = require('../utils/anfrageLeser');

let server; let baseUrl; let adminCookie; let tenantId;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const get = (p, h = {}) => fetch(baseUrl + p, { headers: h });

/* ------------------------------ Die Formate ------------------------------- */

// 1. Rundmail eines Personaldienstleisters, mit Feldern und Aufzählung.
const SOLCOM = `Guten Tag Christian Neusser,
ich bin aktuell auf der Suche nach kompetenter Unterstützung für eines unserer Projekte.
SOLCOM zählt zu den führenden Technologiedienstleistern in den Bereichen Softwareentwicklung, IT und Engineering.
Über Ihre Rückmeldung zu der untenstehenden Projektanfrage würde ich mich sehr freuen.
Projekttitel: Interim-Projektleiter Bankenprüfung
Jobnummer:
Request-Nr: 76120
Einsatzort: Remote
Startdatum: 17.10.2026
Dauer: 1J
Auslastung: 100 %

Aufgabenbeschreibung:

Fachliche Weiterentwicklung der Themen Rechnungslegung, Kreditgeschäft und Prüfungsmethodik.

Must-haves (Erfahrung und Ausbildung):

+WP-Examen
+Erfahrung in der LSI-Prüfung
+Erfahrung in der Steuerung eines Teams
+Erfahrung mit Budgetverantwortung

Nice-to-have:

+Finanzerfahrung
+Erfahrung in der Einführung einer Prüfungssoftware z.B. CaseWare

Mit freundlichen Grüßen
Celine Schlindwein`;

// 2. Endkunde, formlos, mit Tagessatz und anderem Aufbau.
const ENDKUNDE = `Betreff: Interim CFO gesucht, Maschinenbau

Sehr geehrter Herr Neusser,

wir suchen für unsere Tochtergesellschaft in Chemnitz kurzfristig einen Interim CFO.
Hintergrund ist der Weggang des bisherigen Amtsinhabers.

Position: Interim CFO
Standort: Chemnitz
Beginn: 01.12.2026
Dauer: 6 bis 9 Monate
Auslastung: 4 Tage pro Woche
Tagessatz: bis 1.400 EUR

Anforderungen:
- Erfahrung als CFO im Maschinenbau
- Sanierungserfahrung, idealerweise StaRUG
- Verhandlungssicher mit Banken

Wünschenswert:
- SAP S/4HANA
- Englisch verhandlungssicher

Mit freundlichen Grüßen
Dr. Anneliese Hoffmann`;

// 3. Dreizeiler aus einem Telefonat.
const KURZ = `Projekt: Werkleiter Interim, Raum Stuttgart, Start 01.11.2026, 3 Monate, Vollzeit.
Anforderungen:
- Werkleitungserfahrung Automotive
- Erfahrung mit Verlagerungen`;

// 4. Ohne jede Struktur.
const FORMLOS = `Hallo Christian, wir bräuchten mal jemanden der sich mit Einkauf auskennt,
am besten jemand der schon mal eine Einkaufsorganisation neu aufgestellt hat.
Melde dich mal. Gruß Thomas`;

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

/* ------------------------------ Die Regeln -------------------------------- */

test('Die Rundmail wird vollständig gelesen', () => {
  const r = leser.leseMitRegeln(SOLCOM);
  assert.strictEqual(r.titel, 'Interim-Projektleiter Bankenprüfung');
  assert.strictEqual(r.referenz, '76120');
  assert.strictEqual(r.start, '2026-10-17');
  assert.strictEqual(r.dauer, '1 Jahr', '"1J" ist für Menschen nicht lesbar');
  assert.strictEqual(r.auslastung, '100 %');
  assert.strictEqual(r.arbeitsmodell, 'remote');
  assert.strictEqual(r.ort, null, 'Remote ist kein Ort, das ist ein Arbeitsmodell');
  assert.strictEqual(r.absender_name, 'Celine Schlindwein');
  assert.deepStrictEqual(r.must, [
    'WP-Examen', 'Erfahrung in der LSI-Prüfung',
    'Erfahrung in der Steuerung eines Teams', 'Erfahrung mit Budgetverantwortung',
  ]);
  assert.strictEqual(r.nice.length, 2);
});

test('Kein Tagessatz heißt kein Tagessatz', () => {
  const r = leser.leseMitRegeln(SOLCOM);
  assert.strictEqual(r.tagessatz_bis_eur, null, 'die Anfrage nennt keinen, also steht da keiner');
});

test('Das Format des Endkunden wird genauso gelesen', () => {
  const r = leser.leseMitRegeln(ENDKUNDE);
  assert.strictEqual(r.titel, 'Interim CFO');
  assert.strictEqual(r.start, '2026-12-01');
  assert.strictEqual(r.dauer, '6 bis 9 Monate', 'die Spanne bleibt eine Spanne');
  assert.strictEqual(r.auslastung, '4 Tage pro Woche');
  assert.strictEqual(r.ort, 'Chemnitz');
  assert.strictEqual(r.tagessatz_bis_eur, 1400);
  assert.ok(r.must.some((m) => /CFO im Maschinenbau/.test(m)));
  assert.ok(r.nice.some((n) => /SAP/.test(n)));
  assert.strictEqual(r.absender_name, 'Dr. Anneliese Hoffmann');
});

test('Auch ein Dreizeiler ergibt etwas', () => {
  const r = leser.leseMitRegeln(KURZ);
  assert.strictEqual(r.titel, 'Werkleiter Interim, Raum Stuttgart, Start 01.11.2026, 3 Monate, Vollzeit.');
  assert.strictEqual(r.start, '2026-11-01');
  assert.strictEqual(r.must.length, 2);
});

test('Ohne Struktur bleibt vieles leer, und das ist richtig so', () => {
  const r = leser.leseMitRegeln(FORMLOS);
  assert.strictEqual(r.titel, null);
  assert.strictEqual(r.start, null);
  assert.strictEqual(r.tagessatz_bis_eur, null);
  assert.strictEqual(r.must.length, 0, 'lieber nichts als etwas Erfundenes');
});

test('Einzelne Leser arbeiten für sich', () => {
  assert.strictEqual(leser.alsDatum('17.10.2026'), '2026-10-17');
  assert.strictEqual(leser.alsDatum('2026-10-17'), '2026-10-17');
  assert.strictEqual(leser.alsDatum('demnächst'), null);

  assert.strictEqual(leser.leseReferenz('Request-Nr: 76120'), '76120');
  assert.strictEqual(leser.leseReferenz('Referenz Nr. ABC-998'), 'ABC-998');
  assert.strictEqual(leser.leseReferenz('kein Hinweis'), null);

  assert.strictEqual(leser.leseDauer('Dauer: 3M'), '3 Monate');
  assert.strictEqual(leser.leseDauer('Dauer: zunächst 6 Monate mit Option'), 'zunächst 6 Monate mit Option');

  // Eine Jahreszahl ist kein Tagessatz, und ein zweistelliger Wert auch nicht.
  assert.strictEqual(leser.leseTagessatz('Budget: 2026'), null);
  assert.strictEqual(leser.leseTagessatz('Rate: 85'), null);
  assert.strictEqual(leser.leseTagessatz('Tagessatz bis 1.250 EUR'), 1250);
});

test('Der Projekttitel wird nicht aus dem Fließtext geraten', () => {
  // "Über Ihre Projektanfrage würde ich mich freuen" hat genau das einmal getan.
  assert.strictEqual(leser.leseTitel('Über Ihre Projektanfrage würde ich mich sehr freuen.'), null);
  assert.strictEqual(leser.leseTitel('Projekttitel: Interim CRO'), 'Interim CRO');
});

/* ------------------------------ Die Strecke ------------------------------- */

test('Eine Anfrage wird gelesen und als Entwurf abgelegt, ohne Projekt', async () => {
  const vorher = Number((await db('projects').where({ tenant_id: tenantId }).count('* as n').first()).n);

  const res = await post('/api/anfragen', { text: SOLCOM }, { cookie: adminCookie });
  assert.strictEqual(res.status, 201);
  const d = await res.json();

  assert.strictEqual(d.anfrage.gelesen.titel, 'Interim-Projektleiter Bankenprüfung');
  assert.strictEqual(d.anfrage.status, 'neu');
  assert.ok(d.anfrage.luecken.some((l) => /Tagessatz/.test(l)), 'der fehlende Satz wird gemeldet');

  const nachher = Number((await db('projects').where({ tenant_id: tenantId }).count('* as n').first()).n);
  assert.strictEqual(nachher, vorher, 'gelesen ist noch nicht übernommen');

  const a = await db('anfragen').where({ id: d.anfrage.id }).first();
  assert.match(a.rohtext, /LSI-Prüfung/, 'der Rohtext bleibt nachlesbar');
});

test('Dieselbe Referenz ein zweites Mal wird bemerkt', async () => {
  const res = await post('/api/anfragen', { text: SOLCOM }, { cookie: adminCookie });
  const d = await res.json();
  assert.ok(d.doppelt, 'die Rundmail kam schon einmal');
  assert.ok(d.doppelt.id);
});

test('Erst das Übernehmen legt ein Projekt an', async () => {
  const gelesen = await (await post('/api/anfragen', { text: ENDKUNDE }, { cookie: adminCookie })).json();
  const g = gelesen.anfrage.gelesen;

  const res = await post(`/api/anfragen/${gelesen.anfrage.id}/uebernehmen`, {
    titel: g.titel, beschreibung: g.beschreibung, ort: g.ort,
    start: g.start, dauer: g.dauer, auslastung: g.auslastung,
    tagessatz_bis_eur: g.tagessatz_bis_eur,
    must: g.must, nice: g.nice,
    skills: ['Interim CFO', 'Sanierung', 'Maschinenbau'],
    oeffnen: true,
  }, { cookie: adminCookie });

  assert.strictEqual(res.status, 201);
  const d = await res.json();
  assert.strictEqual(d.projekt.name, 'Interim CFO');
  assert.strictEqual(d.projekt.status, 'offen');
  assert.strictEqual(d.projekt.herkunft, 'anfrage');
  assert.strictEqual(d.projekt.tagessatz_bis_eur, 1400);
  assert.strictEqual(d.projekt.dauer, '6 bis 9 Monate');
  assert.strictEqual(d.skills, 3);

  // Die Suchbegriffe hängen am Projekt und sind angelegt worden.
  const verknuepft = await db('project_skills').where({ project_id: d.projekt.id });
  assert.strictEqual(verknuepft.length, 3, 'neue Begriffe entstehen, und das ist erwünscht');

  const a = await db('anfragen').where({ id: gelesen.anfrage.id }).first();
  assert.strictEqual(a.status, 'uebernommen');
  assert.strictEqual(a.project_id, d.projekt.id);
});

test('Zweimal übernehmen geht nicht', async () => {
  const a = await db('anfragen').where({ tenant_id: tenantId, status: 'uebernommen' }).first();
  const res = await post(`/api/anfragen/${a.id}/uebernehmen`, { titel: 'Nochmal' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 409);
});

test('Ablehnen behält den Text und den Grund', async () => {
  const gelesen = await (await post('/api/anfragen', { text: FORMLOS }, { cookie: adminCookie })).json();
  const res = await post(`/api/anfragen/${gelesen.anfrage.id}/ablehnen`,
    { grund: 'passt nicht zum Pool' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);

  const a = await db('anfragen').where({ id: gelesen.anfrage.id }).first();
  assert.strictEqual(a.status, 'abgelehnt');
  assert.strictEqual(a.ablehnung_grund, 'passt nicht zum Pool');
  assert.match(a.rohtext, /Einkaufsorganisation/, 'der Text bleibt, die Gründe sind die Information');
});

test('Zu wenig Text wird abgewiesen', async () => {
  const res = await post('/api/anfragen', { text: 'Hallo' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 400);
});

test('Ohne Titel entsteht kein Projekt', async () => {
  const gelesen = await (await post('/api/anfragen', { text: KURZ }, { cookie: adminCookie })).json();
  const res = await post(`/api/anfragen/${gelesen.anfrage.id}/uebernehmen`, { titel: '' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 400);
});

test('Anfragen sind Verwaltungssache', async () => {
  assert.strictEqual((await get('/api/anfragen')).status, 401);
  assert.strictEqual((await post('/api/anfragen', { text: SOLCOM })).status, 401);
});
