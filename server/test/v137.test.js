/**
 * v1.37.0 — Kundenverwaltung.
 *
 * Der wichtigste Fall zuerst: Ein Kundenkonto entsteht gesperrt, und das
 * Vendor-Portal weist es genau deshalb ab. Freigeben konnte man es bisher
 * nirgends. Wer sich registriert hätte, wäre auf unbestimmte Zeit ausgesperrt
 * gewesen, ohne dass es jemandem aufgefallen wäre.
 * Alle Namen und Firmen sind erfunden.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');

let server; let baseUrl; let adminCookie; let tenantId; let kunde;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const put = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const get = (p, h = {}) => fetch(baseUrl + p, { headers: h });

const REGISTRIERUNG = {
  email: 'einkauf@treuberg-maschinenbau.example',
  password: 'ein-gutes-passwort-2026',
  firmenname: 'Treuberg Maschinenbau GmbH',
  branche: 'Maschinenbau',
  telefon: '0911 4455667',
  ansprechpartner: { anrede: 'Frau', vorname: 'Hiltrud', nachname: 'Treuberg', position: 'Geschäftsführerin' },
  adresse: { strasse: 'Werkstraße 4', plz: '90402', ort: 'Nürnberg' },
  consent: true,
};

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

test('Wer sich als Kunde registriert, wartet erst einmal, und das Büro erfährt davon', async () => {
  const marke = Number((await db('mail_outbox').max('id as m').first()).m || 0);

  const res = await post('/api/auth/register-kunde', REGISTRIERUNG);
  assert.strictEqual(res.status, 201);

  const u = await db('users').where({ email: REGISTRIERUNG.email }).first();
  assert.ok(u, 'Konto angelegt');
  assert.strictEqual(u.role, 'vendor');
  assert.strictEqual(u.is_approved, false, 'gesperrt, bis jemand freigibt');

  kunde = await db('vendor_profiles').where({ user_id: u.id }).first();
  assert.strictEqual(kunde.firmenname, REGISTRIERUNG.firmenname);

  const mails = await db('mail_outbox').where('id', '>', marke).select('to_email', 'template_key');
  assert.ok(mails.some((m) => m.template_key === 'kunde_wartet_intern'),
    'das Büro wird informiert, sonst wartet jemand wochenlang unbemerkt');
});

test('Ohne Freigabe kommt der Kunde nicht in seinen Bereich', async () => {
  const anmeldung = await post('/api/auth/login',
    { email: REGISTRIERUNG.email, password: REGISTRIERUNG.password });
  // Die E-Mail ist noch nicht bestätigt, also kommt er schon hier nicht durch.
  assert.strictEqual(anmeldung.status, 403);

  await db('users').where({ email: REGISTRIERUNG.email }).update({ email_verified_at: new Date() });
  const zweiterVersuch = await post('/api/auth/login',
    { email: REGISTRIERUNG.email, password: REGISTRIERUNG.password });
  assert.strictEqual(zweiterVersuch.status, 200, 'anmelden geht, denn das Passwort stimmt');
  const kundenCookie = zweiterVersuch.headers.get('set-cookie');

  const portal = await get('/api/vendor/projects', { cookie: kundenCookie });
  assert.strictEqual(portal.status, 403, 'aber der Kundenbereich bleibt zu');
  assert.match((await portal.json()).error, /Freigabe/);
});

test('Das Verzeichnis zeigt, wer wartet', async () => {
  const d = await (await get('/api/kunden', { cookie: adminCookie })).json();
  const t = d.kunden.find((k) => k.firmenname === REGISTRIERUNG.firmenname);

  assert.ok(t, 'der neue Kunde steht in der Liste');
  assert.strictEqual(t.is_approved, false);
  assert.strictEqual(t.ansprechpartner, 'Frau Hiltrud Treuberg', 'aus dem Profil zusammengesetzt');
  assert.strictEqual(t.branche, 'Maschinenbau');
  assert.strictEqual(t.projekte.gesamt, 0);
  assert.ok(d.zahlen.wartet_auf_freigabe >= 1);

  const nurWartend = await (await get('/api/kunden?status=wartet', { cookie: adminCookie })).json();
  assert.ok(nurWartend.kunden.every((k) => !k.is_approved));

  const suche = await (await get('/api/kunden?suche=treuberg', { cookie: adminCookie })).json();
  assert.strictEqual(suche.kunden.length, 1);

  assert.strictEqual((await get('/api/kunden')).status, 401);
});

test('Freischalten öffnet den Kundenbereich und sagt dem Kunden Bescheid', async () => {
  const marke = Number((await db('mail_outbox').max('id as m').first()).m || 0);

  const res = await post(`/api/kunden/${kunde.id}/freigabe`, { frei: true }, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.strictEqual(d.frei, true);
  assert.strictEqual(d.benachrichtigt, true);

  const mail = await db('mail_outbox').where('id', '>', marke).where({ to_email: REGISTRIERUNG.email }).first();
  assert.ok(mail, 'der Kunde erfährt es');
  assert.strictEqual(mail.template_key, 'kunde_freigeschaltet');

  // Und jetzt kommt er hinein.
  const anmeldung = await post('/api/auth/login',
    { email: REGISTRIERUNG.email, password: REGISTRIERUNG.password });
  const portal = await get('/api/vendor/projects', { cookie: anmeldung.headers.get('set-cookie') });
  assert.strictEqual(portal.status, 200, 'der Kreis schließt sich');

  assert.ok(await db('audit_log').where({ action: 'kunde.freigegeben', resource_id: kunde.id }).first());
});

test('Sperren nimmt den Zugang wieder weg', async () => {
  const res = await post(`/api/kunden/${kunde.id}/freigabe`, { frei: false }, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).frei, false);

  const anmeldung = await post('/api/auth/login',
    { email: REGISTRIERUNG.email, password: REGISTRIERUNG.password });
  const portal = await get('/api/vendor/projects', { cookie: anmeldung.headers.get('set-cookie') });
  assert.strictEqual(portal.status, 403);

  assert.ok(await db('audit_log').where({ action: 'kunde.gesperrt', resource_id: kunde.id }).first());
  await post(`/api/kunden/${kunde.id}/freigabe`, { frei: true }, { cookie: adminCookie });
});

test('Die Akte bündelt Anfragen, vorgelegte Profile und Mandate', async () => {
  const u = await db('users').where({ email: REGISTRIERUNG.email }).first();
  const [projekt] = await db('projects').insert({
    tenant_id: tenantId, name: 'Interim CFO für die Sanierung', referenz: 'PHX-T1',
    status: 'offen', vendor_id: u.id, start: '2026-11-01',
  }).returning('*');
  const [experte] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Egbert', nachname: 'Rauschenbach', status: 'freigegeben',
  }).returning('*');
  await db('project_releases').insert({
    tenant_id: tenantId, project_id: projekt.id, expert_id: experte.id,
    anonymized: true, feedback: 'gespraech_angefragt', feedback_at: new Date(),
  });
  const [mandat] = await db('engagements').insert({
    tenant_id: tenantId, project_id: projekt.id, expert_id: experte.id,
    tagessatz_experte_eur: 1200, tagessatz_kunde_eur: 1450, status: 'aktiv',
  }).returning('*');
  await db('invoices').insert({
    tenant_id: tenantId, engagement_id: mandat.id, typ: 'rechnung', beleg_nr: 'R-V137-1',
    datum: '2026-11-30', netto_cent: 2900000, ust_prozent: 19, ust_cent: 551000,
    brutto_cent: 3451000, status: 'versendet',
  });

  const d = await (await get(`/api/kunden/${kunde.id}`, { cookie: adminCookie })).json();
  assert.strictEqual(d.projekte.length, 1);
  assert.strictEqual(d.projekte[0].name, 'Interim CFO für die Sanierung');
  assert.strictEqual(d.freigaben.length, 1);
  assert.strictEqual(d.freigaben[0].nachname, 'Rauschenbach');
  assert.strictEqual(d.freigaben[0].feedback, 'gespraech_angefragt');
  assert.strictEqual(d.mandate.length, 1);
  assert.strictEqual(d.rechnungen.length, 1);

  assert.strictEqual(d.zahlen.mandate_aktiv, 1);
  assert.strictEqual(d.zahlen.rueckmeldungen, 1);
  assert.strictEqual(d.zahlen.umsatz_brutto_cent, 3451000, 'Beträge bleiben in Cent, nichts rundet');
  assert.strictEqual(d.zahlen.offen_cent, 3451000, 'versendet gilt als noch offen');

  // Und in der Liste stehen die Zahlen ebenfalls.
  const liste = await (await get('/api/kunden', { cookie: adminCookie })).json();
  const t = liste.kunden.find((k) => k.firmenname === REGISTRIERUNG.firmenname);
  assert.strictEqual(t.projekte.gesamt, 1);
  assert.strictEqual(t.mandate.aktiv, 1);
});

test('Stammdaten pflegen und Rechteschutz', async () => {
  const res = await put(`/api/kunden/${kunde.id}`,
    { telefon: '0911 999888', branche: 'Maschinen- und Anlagenbau' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const neu = await db('vendor_profiles').where({ id: kunde.id }).first();
  assert.strictEqual(neu.telefon, '0911 999888');
  assert.strictEqual(neu.branche, 'Maschinen- und Anlagenbau');

  assert.strictEqual((await put(`/api/kunden/${kunde.id}`, {}, { cookie: adminCookie })).status, 400);
  assert.strictEqual((await put(`/api/kunden/${kunde.id}`, { telefon: '030' })).status, 401);
  assert.strictEqual((await post(`/api/kunden/${kunde.id}/freigabe`, { frei: true })).status, 401);
  assert.strictEqual((await get('/api/kunden/999999', { cookie: adminCookie })).status, 404);
});
