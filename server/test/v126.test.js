/**
 * v1.26.0 — Ansprache-Cockpit.
 * Geprüft werden: Arbeitsliste mit Priorität und Pensum, Wiedervorlage nach
 * Frist, Reaktionen fortschreiben, Sammelaktion, Trichter mit Quoten, CSV und
 * die Zusage, dass aus dem Cockpit keine Mail rausgeht.
 * Alle Namen sind erfunden.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const { importiereListe, VORREG } = require('../utils/vorregistrierung');

let server; let baseUrl; let adminCookie; let tenantId;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const get = (p, h = {}) => fetch(baseUrl + p, { headers: h });
const TAG = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const LISTE = [
  { vorname: 'Hermine', nachname: 'Abendroth', prio: 'A', kanal: 'linkedin', quelle: 'Testliste',
    linkedin: 'https://www.linkedin.com/in/hermine-abendroth', firma: 'Abendroth Interim',
    berufsbezeichnung: 'Interim CFO', letzter_kontakt: '2026-08-01' },
  { vorname: 'Gunnar', nachname: 'Piechnik', prio: 'A', kanal: 'email', quelle: 'Testliste',
    email: 'gunnar@piechnik-interim.example', firma: 'Piechnik Interim', berufsbezeichnung: 'Interim COO' },
  { vorname: 'Sieglinde', nachname: 'Vormbaum', prio: 'B', kanal: 'linkedin', quelle: 'Testliste',
    linkedin: 'https://www.linkedin.com/in/sieglinde-vormbaum', firma: 'Vormbaum Beratung' },
  { vorname: 'Ortwin', nachname: 'Kleinschmidt', prio: 'C', kanal: 'linkedin', quelle: 'Zweitliste',
    linkedin: 'https://www.linkedin.com/in/ortwin-kleinschmidt', firma: 'Kleinschmidt Consulting' },
];

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
  await importiereListe(LISTE, { tenantId });
});

after(async () => { server.close(); await db.destroy(); });

test('Arbeitsliste sortiert nach Priorität und achtet auf das Pensum', async () => {
  const d = await (await get('/api/ansprache/arbeitsliste?pensum=2', { cookie: adminCookie })).json();
  assert.strictEqual(d.faellig.length, 2, 'Pensum begrenzt die Liste');
  assert.deepStrictEqual(d.faellig.map((p) => p.vorreg_prio), ['A', 'A'], 'A zuerst');
  assert.strictEqual(d.zahlen.faellig_gesamt, 4);
  assert.strictEqual(d.zahlen.angeschrieben_gesamt, 0);
  assert.strictEqual(d.wiedervorlage.length, 0);

  const nurB = await (await get('/api/ansprache/arbeitsliste?prio=B', { cookie: adminCookie })).json();
  assert.strictEqual(nurB.faellig.length, 1);
  assert.strictEqual(nurB.faellig[0].nachname, 'Vormbaum');

  const nurMail = await (await get('/api/ansprache/arbeitsliste?kanal=email', { cookie: adminCookie })).json();
  assert.deepStrictEqual(nurMail.faellig.map((p) => p.nachname), ['Piechnik']);

  assert.strictEqual((await get('/api/ansprache/arbeitsliste')).status, 401);
});

test('Angeschrieben und Reaktion fortschreiben, ohne dass eine Mail rausgeht', async () => {
  const vorherMails = Number((await db('mail_outbox').count('* as c').first()).c);
  const hermine = await db('experts').where({ nachname: 'Abendroth' }).first();

  const eins = await post(`/api/ansprache/${hermine.id}/schritt`, { angeschrieben: true }, { cookie: adminCookie });
  assert.strictEqual(eins.status, 200);
  let stand = await db('experts').where({ id: hermine.id }).first();
  assert.ok(stand.vorreg_angeschrieben_am, 'Datum gesetzt');
  assert.strictEqual(stand.vorreg_reaktion, 'offen');

  await post(`/api/ansprache/${hermine.id}/schritt`, { reaktion: 'interesse', notiz: 'Will im Oktober starten' }, { cookie: adminCookie });
  stand = await db('experts').where({ id: hermine.id }).first();
  assert.strictEqual(stand.vorreg_reaktion, 'interesse');
  assert.ok(stand.vorreg_reaktion_am);
  assert.strictEqual(stand.vorreg_notiz, 'Will im Oktober starten');
  assert.strictEqual(stand.vorreg_wiedervorlage, null, 'Reaktion beendet die Wiedervorlage');

  // "später" setzt eine Wiedervorlage und beendet sie nicht
  const ortwin = await db('experts').where({ nachname: 'Kleinschmidt' }).first();
  await post(`/api/ansprache/${ortwin.id}/schritt`,
    { angeschrieben: true, reaktion: 'spaeter', wiedervorlage: TAG(60) }, { cookie: adminCookie });
  const o = await db('experts').where({ id: ortwin.id }).first();
  assert.strictEqual(o.vorreg_reaktion, 'spaeter');
  assert.strictEqual(String(o.vorreg_wiedervorlage).slice(0, 10) !== 'null', true);
  assert.ok(o.vorreg_wiedervorlage, 'Wiedervorlage bleibt stehen');

  assert.strictEqual(Number((await db('mail_outbox').count('* as c').first()).c), vorherMails, 'keine einzige Mail');
  assert.ok(await db('audit_log').where({ action: 'expert.ansprache_schritt', resource_id: hermine.id }).first());
});

test('Wiedervorlage erscheint erst nach Ablauf der Frist', async () => {
  const gunnar = await db('experts').where({ nachname: 'Piechnik' }).first();
  await db('experts').where({ id: gunnar.id }).update({ vorreg_angeschrieben_am: TAG(-3) });

  let d = await (await get('/api/ansprache/arbeitsliste?wiedervorlage_tage=10', { cookie: adminCookie })).json();
  assert.ok(!d.wiedervorlage.some((p) => p.id === gunnar.id), 'nach drei Tagen noch nicht fällig');
  assert.ok(d.zahlen.wartet >= 1);

  await db('experts').where({ id: gunnar.id }).update({ vorreg_angeschrieben_am: TAG(-12) });
  d = await (await get('/api/ansprache/arbeitsliste?wiedervorlage_tage=10', { cookie: adminCookie })).json();
  assert.ok(d.wiedervorlage.some((p) => p.id === gunnar.id), 'nach zwölf Tagen fällig');
  assert.ok(!d.faellig.some((p) => p.id === gunnar.id), 'nicht doppelt in beiden Körben');

  // Wer reagiert hat, taucht nicht mehr auf
  await post(`/api/ansprache/${gunnar.id}/schritt`, { reaktion: 'absage' }, { cookie: adminCookie });
  d = await (await get('/api/ansprache/arbeitsliste?wiedervorlage_tage=10', { cookie: adminCookie })).json();
  assert.ok(!d.wiedervorlage.some((p) => p.id === gunnar.id), 'Absage beendet die Wiedervorlage');
});

test('Sammelaktion notiert mehrere auf einmal', async () => {
  const offen = await db('experts').where({ status: VORREG }).whereNull('vorreg_angeschrieben_am').pluck('id');
  const res = await post('/api/ansprache/angeschrieben', { ids: offen, datum: '2026-09-10' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.strictEqual(d.anzahl, offen.length);
  for (const id of offen) {
    const p = await db('experts').where({ id }).first();
    assert.ok(p.vorreg_angeschrieben_am, 'Datum gesetzt');
  }
  assert.strictEqual((await post('/api/ansprache/angeschrieben', { ids: [] }, { cookie: adminCookie })).status, 400);
});

test('Trichter rechnet Quoten und schlüsselt nach Prio, Kanal und Liste auf', async () => {
  const t = await (await get('/api/ansprache/trichter', { cookie: adminCookie })).json();
  assert.strictEqual(t.gesamt.vorbereitet, 4);
  assert.strictEqual(t.gesamt.angeschrieben, 4, 'alle vier sind angeschrieben');
  assert.strictEqual(t.gesamt.reagiert, 3, 'Interesse, später und Absage zählen, offen nicht');
  assert.strictEqual(t.gesamt.quote_reaktion, 75);

  const prioA = t.nach_prio.find((z) => z.schluessel === 'A');
  assert.strictEqual(prioA.vorbereitet, 2);
  const zweitliste = t.nach_quelle.find((z) => z.schluessel === 'Zweitliste');
  assert.strictEqual(zweitliste.vorbereitet, 1);
  assert.strictEqual(t.reaktionen.interesse, 1);
  assert.strictEqual(t.reaktionen.absage, 1);
  assert.strictEqual(t.reaktionen.offen, 1);
});

test('Registrierung zählt im Trichter als Ankunft', async () => {
  const res = await post('/api/auth/register', {
    email: 'hermine@abendroth-interim.example', password: 'ein-gutes-passwort', consent: true,
    vorname: 'Hermine', nachname: 'Abendroth',
  });
  assert.strictEqual(res.status, 201);

  const t = await (await get('/api/ansprache/trichter', { cookie: adminCookie })).json();
  assert.strictEqual(t.gesamt.registriert, 1, 'die Zusammengeführte zählt als registriert');
  assert.ok(t.gesamt.quote_registrierung > 0);

  // Wer angekommen ist, verschwindet aus der Arbeitsliste
  const d = await (await get('/api/ansprache/arbeitsliste', { cookie: adminCookie })).json();
  const hermine = await db('experts').where({ nachname: 'Abendroth' }).first();
  assert.ok(![...d.faellig, ...d.wiedervorlage].some((p) => p.id === hermine.id));
});

test('CSV-Export enthält den Stand der Ansprache', async () => {
  const res = await get('/api/ansprache/export.csv', { cookie: adminCookie });
  assert.strictEqual(res.headers.get('content-type'), 'text/csv; charset=utf-8');
  const csv = await res.text();
  assert.match(csv, /Vorname;Nachname;Firma;LinkedIn/);
  assert.match(csv, /"Vormbaum"/);
  assert.match(csv, /keine Reaktion|offen|Interesse|Absage/);
  assert.strictEqual((await get('/api/ansprache/export.csv')).status, 401);
});
