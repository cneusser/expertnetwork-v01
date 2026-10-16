/**
 * v1.44.0 — Kandidaten anonym anfragen.
 *
 * Die wichtigste Prüfung: Der Kandidat erfährt nicht, wer der Kunde ist. Das
 * ist keine Geheimniskrämerei, sondern die Geschäftsgrundlage. Wer weiß, wer
 * sucht, kann direkt anrufen.
 *
 * Geprüft wird gegen die tatsächlich bekannten Namen, also die aus der
 * Anfrage, aus bereits erstellten Vorlagen und vom eingetragenen Kunden.
 * Nicht gegen eine ausgedachte Liste.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const ka = require('../utils/kandidatenanfrage');

let server; let baseUrl; let adminCookie; let tenantId;
let projektId; let appA; let appB; let expertA;

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

  // Reste eines früheren Laufs.
  const alte = await db('projects').where({ tenant_id: tenantId }).andWhere('name', 'like', '%v144%').select('id');
  if (alte.length) {
    const ids = alte.map((p) => p.id);
    await db('applications').whereIn('project_id', ids).del();
    await db('anfragen').whereIn('project_id', ids).del();
    await db('projects').whereIn('id', ids).del();
  }
  await db('experts').where({ tenant_id: tenantId }).andWhere('nachname', 'like', 'Kandidat144%').del();

  [expertA] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Theodora', nachname: 'Kandidat144A', status: 'freigegeben',
    email: 'theodora@kandidat144.invalid', berufsbezeichnung: 'Interim Werkleiterin',
  }).returning('*');
  const [expertB] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Benedikt', nachname: 'Kandidat144B', status: 'freigegeben',
    berufsbezeichnung: 'Interim CFO', // bewusst ohne Mailadresse
  }).returning('*');

  const [projekt] = await db('projects').insert({
    tenant_id: tenantId, name: 'Interim Werkleitung v144', status: 'offen',
    beschreibung: 'Ein Werk mit 300 Mitarbeitern stabilisieren.',
    start: '2026-12-01', dauer: '6 Monate', auslastung: '100 %', arbeitsmodell: 'vor_ort',
    ort: 'Chemnitz',
    must_json: JSON.stringify(['Werkleitung', 'Sanierungserfahrung']),
    nice_json: JSON.stringify(['Automotive']),
  }).returning('*');
  projektId = projekt.id;

  // Die Anfrage, aus der das Projekt stammt. Hier steht der Auftraggeber.
  await db('anfragen').insert({
    tenant_id: tenantId, project_id: projekt.id, rohtext: 'egal',
    absender_firma: 'Zeppelin Personalvermittlung', absender_name: 'Celine Testfall',
    status: 'uebernommen',
  });

  [appA] = await db('applications').insert({
    tenant_id: tenantId, project_id: projekt.id, expert_id: expertA.id, status: 'vorgeschlagen',
  }).returning('*');
  [appB] = await db('applications').insert({
    tenant_id: tenantId, project_id: projekt.id, expert_id: expertB.id, status: 'vorgeschlagen',
  }).returning('*');
});

after(async () => { server.close(); await db.destroy(); });

/* ------------------------- Der Kunde bleibt draußen ----------------------- */

test('Die bekannten Kundennamen werden gefunden', async () => {
  const projekt = await db('projects').where({ id: projektId }).first();
  const namen = await ka.kundennamen(db, projekt);
  assert.ok(namen.includes('Zeppelin Personalvermittlung'), 'aus der Anfrage');
  assert.ok(namen.includes('Celine Testfall'));
  assert.ok(!namen.some((n) => n.length < 4), 'zu kurze Begriffe taugen nicht als Suchmuster');
});

test('Was der Kandidat sieht, nennt keinen Auftraggeber', async () => {
  const projekt = await db('projects').where({ id: projektId }).first();
  const sicht = ka.kandidatenSicht(projekt);
  const text = JSON.stringify(sicht);

  assert.ok(!text.includes('Zeppelin'), 'der Vermittler steht nicht drin');
  assert.ok(!text.includes('Celine'));
  assert.ok(!('tagessatz_bis_eur' in sicht), 'das Budget wird nicht in einer Rundanfrage verhandelt');

  // Aber alles, was für die Entscheidung zählt, ist da.
  assert.strictEqual(sicht.titel, 'Interim Werkleitung v144');
  assert.strictEqual(sicht.ort, 'Chemnitz');
  assert.strictEqual(sicht.dauer, '6 Monate');
  assert.deepStrictEqual(sicht.must, ['Werkleitung', 'Sanierungserfahrung']);
});

test('Ein Kundenname in der Beschreibung verhindert den Versand', async () => {
  await db('projects').where({ id: projektId })
    .update({ beschreibung: 'Für Zeppelin Personalvermittlung ein Werk stabilisieren.' });

  const pruefung = await ka.pruefeAnonym(db, await db('projects').where({ id: projektId }).first());
  assert.strictEqual(pruefung.ok, false);
  assert.ok(pruefung.treffer.includes('Zeppelin Personalvermittlung'));
  assert.strictEqual(pruefung.stelle, 'beschreibung', 'und wo er steht');

  const res = await post(`/api/kandidatenanfrage/projekt/${projektId}/fragen`,
    { application_ids: [appA.id] }, { cookie: adminCookie });
  assert.strictEqual(res.status, 400, 'lieber eine Fehlermeldung als eine Mail, die das Geschäft kostet');
  assert.match((await res.json()).error, /Zeppelin/);

  const a = await db('applications').where({ id: appA.id }).first();
  assert.strictEqual(a.anfrage_token, null, 'es ging wirklich nichts hinaus');

  await db('projects').where({ id: projektId })
    .update({ beschreibung: 'Ein Werk mit 300 Mitarbeitern stabilisieren.' });
});

/* ------------------------------ Die Strecke ------------------------------- */

test('Eine Anfrage geht raus, der Status wandert mit', async () => {
  const res = await post(`/api/kandidatenanfrage/projekt/${projektId}/fragen`,
    { application_ids: [appA.id, appB.id], frist_tage: 5 }, { cookie: adminCookie });

  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.strictEqual(d.gefragt, 1, 'nur einer hat eine Mailadresse');
  assert.strictEqual(d.ohne_mail, 1);
  assert.match(d.meldungen[0], /Benedikt Kandidat144B/, 'und es steht da, wer fehlt');

  const a = await db('applications').where({ id: appA.id }).first();
  assert.ok(a.anfrage_token);
  assert.strictEqual(a.status, 'angefragt');
  assert.ok(a.anfrage_frist);

  const b = await db('applications').where({ id: appB.id }).first();
  assert.strictEqual(b.anfrage_token, null, 'ohne Mailadresse keine Anfrage');
  assert.strictEqual(b.status, 'vorgeschlagen');
});

test('Der Kandidat sieht unter seinem Token die Aufgabe, nicht den Kunden', async () => {
  const a = await db('applications').where({ id: appA.id }).first();
  const res = await get(`/api/kandidatenanfrage/${a.anfrage_token}`);
  assert.strictEqual(res.status, 200);

  const text = await res.text();
  assert.ok(!text.includes('Zeppelin'));
  assert.ok(!text.includes('Celine'));

  const d = JSON.parse(text);
  assert.strictEqual(d.vorname, 'Theodora', 'die eigene Anrede schon');
  assert.strictEqual(d.projekt.titel, 'Interim Werkleitung v144');
  assert.strictEqual(d.bereits_geantwortet, null);
});

test('Zusage mit Verfügbarkeit, ohne Login', async () => {
  const a = await db('applications').where({ id: appA.id }).first();
  const res = await post(`/api/kandidatenanfrage/${a.anfrage_token}`, {
    interesse: true, verfuegbar_ab: 'ab Mitte Dezember', auslastung: '4 Tage pro Woche',
    notiz: 'Klingt passend, Chemnitz ist machbar.', wunsch_satz_eur: 1350,
  });
  assert.strictEqual(res.status, 200);

  const nach = await db('applications').where({ id: appA.id }).first();
  assert.strictEqual(nach.antwort, 'interessiert');
  assert.strictEqual(nach.status, 'interessiert');
  assert.strictEqual(nach.verfuegbar_ab, 'ab Mitte Dezember', 'Text und kein Datum, das ist der Punkt');
  assert.strictEqual(nach.auslastung, '4 Tage pro Woche');
  assert.strictEqual(nach.wunsch_satz_eur, 1350);
  assert.ok(nach.antwort_am);
});

test('Die Antwort lässt sich ändern, solange nichts weiterging', async () => {
  const a = await db('applications').where({ id: appA.id }).first();
  const res = await post(`/api/kandidatenanfrage/${a.anfrage_token}`, {
    interesse: false, notiz: 'Hat sich leider überschnitten.',
  });
  assert.strictEqual(res.status, 200);

  const nach = await db('applications').where({ id: appA.id }).first();
  assert.strictEqual(nach.antwort, 'abgesagt');
  assert.strictEqual(nach.status, 'abgesagt');
  assert.strictEqual(nach.antwort_notiz, 'Hat sich leider überschnitten.');

  // Zurück auf Zusage für die folgenden Fälle.
  await post(`/api/kandidatenanfrage/${a.anfrage_token}`, { interesse: true, verfuegbar_ab: 'sofort' });
});

test('Ist der Kandidat schon weiter, ändert er nichts mehr allein', async () => {
  const a = await db('applications').where({ id: appA.id }).first();
  await db('applications').where({ id: appA.id }).update({ status: 'im_gespraech' });

  const res = await post(`/api/kandidatenanfrage/${a.anfrage_token}`, { interesse: false });
  assert.strictEqual(res.status, 409);
  assert.match((await res.json()).error, /persönlich/);

  await db('applications').where({ id: appA.id }).update({ status: 'interessiert' });
});

test('Wer geantwortet hat, wird nicht noch einmal behelligt', async () => {
  const res = await post(`/api/kandidatenanfrage/projekt/${projektId}/fragen`,
    { application_ids: [appA.id] }, { cookie: adminCookie });
  const d = await res.json();
  assert.strictEqual(d.uebersprungen, 1);
  assert.strictEqual(d.gefragt, 0);
});

test('Eine Erinnerung nutzt denselben Link', async () => {
  const [expertC] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Cornelius', nachname: 'Kandidat144C', status: 'freigegeben',
    email: 'cornelius@kandidat144.invalid',
  }).returning('*');
  const [appC] = await db('applications').insert({
    tenant_id: tenantId, project_id: projektId, expert_id: expertC.id, status: 'vorgeschlagen',
  }).returning('*');

  await post(`/api/kandidatenanfrage/projekt/${projektId}/fragen`,
    { application_ids: [appC.id] }, { cookie: adminCookie });
  const erst = (await db('applications').where({ id: appC.id }).first()).anfrage_token;

  const res = await post(`/api/kandidatenanfrage/projekt/${projektId}/fragen`,
    { application_ids: [appC.id] }, { cookie: adminCookie });
  const d = await res.json();
  assert.strictEqual(d.erneut, 1, 'als Erinnerung gezählt');

  const zweit = (await db('applications').where({ id: appC.id }).first()).anfrage_token;
  assert.strictEqual(zweit, erst, 'ein zweiter Token würde den ersten entwerten');
});

test('Ein erfundener Token führt nirgendwohin', async () => {
  assert.strictEqual((await get('/api/kandidatenanfrage/ausgedacht')).status, 404);
  assert.strictEqual((await post('/api/kandidatenanfrage/ausgedacht', { interesse: true })).status, 404);
});

test('Anfragen verschicken ist Verwaltungssache', async () => {
  assert.strictEqual((await post(`/api/kandidatenanfrage/projekt/${projektId}/fragen`,
    { application_ids: [appA.id] })).status, 401);
});
