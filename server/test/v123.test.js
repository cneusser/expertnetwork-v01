/**
 * v1.23.0 — Abrechnung I: Mandat, Leistungsnachweis, Gutschrift und Rechnung,
 * Beträge, Belegnummern, PDF, Buchhaltungs-Export, Rechteschutz.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');
const { berechne, verkaufssatzCent } = require('../utils/billing');

let server; let baseUrl; let adminCookie; let expertCookie; let adrian; let projektId; let mandatId;
const get = (p, h = {}) => fetch(baseUrl + p, { headers: h });
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  })).headers.get('set-cookie');

  // Experten-Login herstellen
  await db('users').where({ id: adrian.user_id }).update({ email_verified_at: new Date() });
  const bcrypt = require('bcryptjs');
  await db('users').where({ id: adrian.user_id }).update({ password_hash: await bcrypt.hash('test-passwort-123', 10) });
  const u = await db('users').where({ id: adrian.user_id }).first();
  expertCookie = (await post('/api/auth/login', { email: u.email, password: 'test-passwort-123' })).headers.get('set-cookie');

  const [p] = await db('projects').insert({
    tenant_id: adrian.tenant_id, name: 'Restrukturierung Musterwerk', status: 'besetzt',
    gebuehr_modell: 'gu_anteil', gebuehr_prozent: 20,
  }).returning('id');
  projektId = p.id || p;
  await db('applications').insert({
    tenant_id: adrian.tenant_id, project_id: projektId, expert_id: adrian.id, status: 'besetzt',
  });
});

after(async () => { server.close(); await db.destroy(); });

test('Rechenkern: Aufschlagsmodell und Erfolgshonorar', () => {
  const gu = { tagessatz_experte_eur: 1000, gebuehr_modell: 'gu_anteil', gebuehr_prozent: 20, ust_prozent: 19 };
  assert.strictEqual(verkaufssatzCent(gu), 120000);
  const r = berechne(gu, { periode: '2026-08', tage: 10, spesen_eur: 500 });
  assert.strictEqual(r.gutschrift.netto_cent, 1000 * 100 * 10 + 50000);
  assert.strictEqual(r.rechnung.netto_cent, 1200 * 100 * 10 + 50000);
  assert.strictEqual(r.marge_cent, 200 * 100 * 10);
  assert.strictEqual(r.rechnung.ust_cent, Math.round(r.rechnung.netto_cent * 0.19));

  const erfolg = { tagessatz_experte_eur: 1000, gebuehr_modell: 'erfolg', gebuehr_prozent: 10, plan_tage: 100, ust_prozent: 19 };
  const ohne = berechne(erfolg, { periode: '2026-08', tage: 5, spesen_eur: 0 });
  assert.strictEqual(ohne.marge_cent, 0, 'ohne erste Rechnung keine Gebuehr');
  const mit = berechne(erfolg, { periode: '2026-08', tage: 5, spesen_eur: 0 }, { ersteRechnung: true });
  assert.strictEqual(mit.marge_cent, 1000 * 100 * 100 * 0.10, 'einmaliges Erfolgshonorar auf das Volumen');
});

test('Mandat anlegen, Tage einreichen, freigeben, abrechnen', async () => {
  const kand = await (await get('/api/billing/besetzt-ohne-mandat', { cookie: adminCookie })).json();
  assert.ok(kand.kandidaten.some((k) => k.expert_id === adrian.id), 'besetzte Position ohne Mandat gefunden');

  const anlegen = await post('/api/billing/mandate', {
    project_id: projektId, expert_id: adrian.id, tagessatz_experte_eur: 1500,
    gebuehr_modell: 'gu_anteil', gebuehr_prozent: 20, ust_prozent: 19,
    kunde_json: { firma: 'Musterwerk GmbH', strasse: 'Werkstr. 1', plz: '90402', ort: 'Nürnberg', email: 'buchhaltung@musterwerk.example' },
    experte_json: { firma: 'Rethink Interim', ort: 'Zürich', iban: 'CH00 0000 0000 0000' },
  }, { cookie: adminCookie });
  assert.strictEqual(anlegen.status, 201);
  mandatId = (await anlegen.json()).mandat.id;

  // Zweites Mandat auf dieselbe Kombination wird abgelehnt
  assert.strictEqual((await post('/api/billing/mandate',
    { project_id: projektId, expert_id: adrian.id, tagessatz_experte_eur: 900 }, { cookie: adminCookie })).status, 409);

  // Experte trägt Tage ein und reicht ein
  const eigene = await (await get('/api/billing/meine-mandate', { cookie: expertCookie })).json();
  assert.strictEqual(eigene.mandate.length, 1);
  const einreichen = await post('/api/billing/nachweis',
    { engagement_id: mandatId, periode: '2026-07', tage: 12, spesen_eur: 300, einreichen: true }, { cookie: expertCookie });
  assert.strictEqual(einreichen.status, 200);
  const nachweis = (await einreichen.json()).nachweis;
  assert.strictEqual(nachweis.status, 'eingereicht');

  // Ohne Freigabe kein Beleg
  assert.strictEqual((await post(`/api/billing/nachweis/${nachweis.id}/abrechnen`, {}, { cookie: adminCookie })).status, 409);

  await post(`/api/billing/nachweis/${nachweis.id}/freigeben`, {}, { cookie: adminCookie });
  const vorschau = (await (await get(`/api/billing/nachweis/${nachweis.id}/vorschau`, { cookie: adminCookie })).json()).vorschau;
  assert.strictEqual(vorschau.gutschrift.netto_cent, 1500 * 100 * 12 + 30000);
  assert.strictEqual(vorschau.rechnung.netto_cent, 1800 * 100 * 12 + 30000);

  const abrechnen = await post(`/api/billing/nachweis/${nachweis.id}/abrechnen`, {}, { cookie: adminCookie });
  assert.strictEqual(abrechnen.status, 201);
  const d = await abrechnen.json();
  assert.strictEqual(d.belege.length, 2);
  assert.ok(d.belege.find((b) => b.typ === 'gutschrift').beleg_nr.startsWith('GS-'));
  assert.ok(d.belege.find((b) => b.typ === 'rechnung').beleg_nr.startsWith('RE-'));
  assert.strictEqual(d.marge_cent, 300 * 100 * 12);

  // Nachweis ist jetzt gesperrt, doppelte Abrechnung ausgeschlossen
  assert.strictEqual((await db('timesheets').where({ id: nachweis.id }).first()).status, 'abgerechnet');
  assert.strictEqual((await post(`/api/billing/nachweis/${nachweis.id}/abrechnen`, {}, { cookie: adminCookie })).status, 409);
  assert.ok(await db('audit_log').where({ action: 'billing.abgerechnet', resource_id: mandatId }).first());
});

test('Belegnummern laufen fort, Kennzahlen stimmen, PDF und Export funktionieren', async () => {
  await post('/api/billing/nachweis', { engagement_id: mandatId, periode: '2026-08', tage: 10 }, { cookie: adminCookie });
  const zweiter = await db('timesheets').where({ engagement_id: mandatId, periode: '2026-08' }).first();
  await post(`/api/billing/nachweis/${zweiter.id}/freigeben`, {}, { cookie: adminCookie });
  await post(`/api/billing/nachweis/${zweiter.id}/abrechnen`, {}, { cookie: adminCookie });

  const jahr = new Date().getFullYear();
  const nummern = await db('invoices').where({ typ: 'rechnung' }).orderBy('id').pluck('beleg_nr');
  assert.deepStrictEqual(nummern, [`RE-${jahr}-0001`, `RE-${jahr}-0002`]);

  const liste = await (await get('/api/billing/belege', { cookie: adminCookie })).json();
  assert.strictEqual(liste.belege.length, 4);
  assert.strictEqual(liste.kennzahlen.umsatz_cent - liste.kennzahlen.auszahlung_cent, liste.kennzahlen.marge_cent);
  assert.ok(liste.kennzahlen.marge_prozent > 0);

  const beleg = liste.belege.find((b) => b.typ === 'rechnung');
  const pdf = await get(`/api/billing/belege/${beleg.id}/pdf`, { cookie: adminCookie });
  assert.strictEqual(pdf.headers.get('content-type'), 'application/pdf');
  assert.ok((await pdf.arrayBuffer()).byteLength > 1000, 'PDF hat Inhalt');

  const csv = await (await get('/api/billing/export.csv', { cookie: adminCookie })).text();
  assert.match(csv, /Belegnummer;Typ;Datum/);
  assert.match(csv, new RegExp(`RE-${jahr}-0001`));
  assert.match(csv, /Musterwerk GmbH/);

  const versand = await post(`/api/billing/belege/${beleg.id}/versenden`, {}, { cookie: adminCookie });
  assert.strictEqual(versand.status, 200);
  const out = await db('mail_outbox').where({ template_key: 'rechnung_versand' }).first();
  assert.ok(out, 'Rechnungsversand in der Outbox');
  assert.ok(!out.body_html.includes('—'), 'keine Gedankenstriche');
  assert.strictEqual((await db('invoices').where({ id: beleg.id }).first()).status, 'versendet');
});

test('Rechte: Experten kommen nicht an fremde Mandate und nicht an die Belege', async () => {
  assert.strictEqual((await get('/api/billing/mandate', { cookie: expertCookie })).status, 403);
  assert.strictEqual((await get('/api/billing/belege', { cookie: expertCookie })).status, 403);
  assert.strictEqual((await get('/api/billing/mandate')).status, 401);

  const [fremd] = await db('experts').insert({
    tenant_id: adrian.tenant_id, vorname: 'Fremde', nachname: 'Person', email: 'fremd@example.org', status: 'freigegeben',
  }).returning('id');
  const [pid] = await db('projects').insert({ tenant_id: adrian.tenant_id, name: 'Fremdprojekt', status: 'offen' }).returning('id');
  const [e] = await db('engagements').insert({
    tenant_id: adrian.tenant_id, project_id: pid.id || pid, expert_id: fremd.id || fremd, tagessatz_experte_eur: 900,
  }).returning('id');
  const res = await post('/api/billing/nachweis',
    { engagement_id: e.id || e, periode: '2026-07', tage: 5 }, { cookie: expertCookie });
  assert.strictEqual(res.status, 403, 'fremdes Mandat ist tabu');
});
