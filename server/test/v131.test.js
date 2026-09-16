/**
 * v1.31.0 — Kapitalpartner.
 * Geprüft werden: Bewerbung über die öffentliche Seite ohne Konto, der
 * Bonitätsfilter als eigentliches Werkzeug, die Volumensuche mit offenen
 * Grenzen, Umwandlung eines Kontakts aus der Ansprache, Freigabe, Rechteschutz,
 * und die Zusage, dass an Kapitalpartner keine automatische Post geht.
 * Alle Namen und Firmen sind erfunden.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const { importiereListe } = require('../utils/vorregistrierung');

let server; let baseUrl; let adminCookie; let tenantId;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const put = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const get = (p, h = {}) => fetch(baseUrl + p, { headers: h });
/** jsonb kommt je nach Weg als Array oder als String zurück. */
const alsListe = (wert) => {
  if (Array.isArray(wert)) return wert;
  try { return JSON.parse(wert || '[]'); } catch { return []; }
};

const BEWERBUNG = {
  firmenname: 'Wiesengrund Leasing GmbH',
  anrede: 'herr', vorname: 'Konstantin', nachname: 'Wiesengrund',
  email: 'konstantin@wiesengrund-leasing.example', telefon: '0911 1234567',
  webseite: 'wiesengrund-leasing.example',
  finanzierungsarten: ['leasing', 'sale_and_lease_back', 'gibtsnicht'],
  bonitaet: ['normal', 'schwach', 'sanierung', 'eigenverwaltung'],
  objektarten: ['IT-Equipment', 'Kräne', 'Pflegeheimausstattung'],
  branchen: ['Bau', 'Pflege'],
  volumen_von_eur: 50000, volumen_bis_eur: 5000000,
  entscheidung_tage: 10,
  beschreibung: 'Wir finanzieren auch dort, wo Banken abwinken.',
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
  await db('kapitalpartner').where({ tenant_id: tenantId }).del();
});

after(async () => { server.close(); await db.destroy(); });

test('Bewerbung über die öffentliche Seite, ohne Konto und ohne Mail an den Absender', async () => {
  const vorher = Number((await db('mail_outbox').count('* as c').first()).c);

  assert.strictEqual((await post('/api/public/kapitalpartner-bewerbung', { ...BEWERBUNG, consent: false })).status, 400,
    'ohne Einwilligung geht nichts');
  assert.strictEqual((await post('/api/public/kapitalpartner-bewerbung', { ...BEWERBUNG, email: 'kaputt' })).status, 400);
  assert.strictEqual((await post('/api/public/kapitalpartner-bewerbung', { ...BEWERBUNG, firmenname: '' })).status, 400);

  const res = await post('/api/public/kapitalpartner-bewerbung', BEWERBUNG);
  assert.strictEqual(res.status, 201);

  const p = await db('kapitalpartner').where({ firmenname: BEWERBUNG.firmenname }).first();
  assert.strictEqual(p.status, 'neu', 'kommt nicht automatisch ins Verzeichnis');
  assert.strictEqual(p.quelle, 'landingpage');
  assert.strictEqual(p.volumen_bis_eur, 5000000);

  const arten = alsListe(p.finanzierungsarten_json);
  assert.deepStrictEqual(arten, ['leasing', 'sale_and_lease_back'], 'unbekannte Arten fliegen raus');
  assert.ok(alsListe(p.objektarten_json).includes('Kräne'), 'Objekte bleiben Freitext');

  // Eine interne Benachrichtigung ist in Ordnung, an den Kapitalpartner selbst geht nichts.
  const mails = await db('mail_outbox').orderBy('id', 'desc').limit(3);
  assert.ok(!mails.some((m) => m.to_email === BEWERBUNG.email), 'keine Post an den Absender');
  assert.ok(Number((await db('mail_outbox').count('* as c').first()).c) >= vorher);

  assert.ok(await db('audit_log').where({ action: 'kapitalpartner.anfrage', resource_id: p.id }).first());
});

test('Der Bonitätsfilter findet die, die auch im Verfahren noch finanzieren', async () => {
  // Ein zweiter Partner, der nur bei sauberer Bilanz mitgeht.
  await post('/api/kapitalpartner', {
    firmenname: 'Bodensee Mittelstandsfinanz AG',
    finanzierungsarten: ['darlehen'], bonitaet: ['normal'],
    volumen_von_eur: 1000000, volumen_bis_eur: 20000000,
  }, { cookie: adminCookie });

  const alle = await (await get('/api/kapitalpartner', { cookie: adminCookie })).json();
  assert.strictEqual(alle.zahlen.gesamt, 2);
  assert.strictEqual(alle.zahlen.im_verfahren, 1, 'nur einer geht bis ins Verfahren');

  const imVerfahren = await (await get('/api/kapitalpartner?bonitaet=eigenverwaltung', { cookie: adminCookie })).json();
  assert.deepStrictEqual(imVerfahren.partner.map((p) => p.firmenname), ['Wiesengrund Leasing GmbH']);

  const nurNormal = await (await get('/api/kapitalpartner?bonitaet=normal', { cookie: adminCookie })).json();
  assert.strictEqual(nurNormal.partner.length, 2, 'normale Bonität können beide');

  const leasing = await (await get('/api/kapitalpartner?finanzierungsart=leasing', { cookie: adminCookie })).json();
  assert.deepStrictEqual(leasing.partner.map((p) => p.firmenname), ['Wiesengrund Leasing GmbH']);

  const suche = await (await get('/api/kapitalpartner?suche=kräne', { cookie: adminCookie })).json();
  assert.strictEqual(suche.partner.length, 1, 'Suche greift auch in die Objektarten');
});

test('Volumensuche findet, wer den Betrag abdeckt', async () => {
  const klein = await (await get('/api/kapitalpartner?volumen=200000', { cookie: adminCookie })).json();
  assert.deepStrictEqual(klein.partner.map((p) => p.firmenname), ['Wiesengrund Leasing GmbH'],
    'der eine beginnt erst bei einer Million');

  const gross = await (await get('/api/kapitalpartner?volumen=10000000', { cookie: adminCookie })).json();
  assert.deepStrictEqual(gross.partner.map((p) => p.firmenname), ['Bodensee Mittelstandsfinanz AG'],
    'und der andere hört bei fünf Millionen auf');

  // Ein Partner ohne Grenzen taucht bei jedem Betrag auf.
  await post('/api/kapitalpartner', { firmenname: 'Offenbach Objektfinanz', bonitaet: ['normal'] }, { cookie: adminCookie });
  const egal = await (await get('/api/kapitalpartner?volumen=42', { cookie: adminCookie })).json();
  assert.ok(egal.partner.some((p) => p.firmenname === 'Offenbach Objektfinanz'), 'offene Grenzen zählen mit');
});

test('Freigabe vermerkt den Zeitpunkt, Status lässt sich zurücknehmen', async () => {
  const p = await db('kapitalpartner').where({ firmenname: 'Wiesengrund Leasing GmbH' }).first();
  assert.strictEqual(p.freigegeben_am, null);

  const res = await put(`/api/kapitalpartner/${p.id}`, { status: 'freigegeben' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const frei = await db('kapitalpartner').where({ id: p.id }).first();
  assert.ok(frei.freigegeben_am, 'Zeitpunkt festgehalten');

  await put(`/api/kapitalpartner/${p.id}`, { status: 'in_pruefung' }, { cookie: adminCookie });
  assert.strictEqual((await db('kapitalpartner').where({ id: p.id }).first()).status, 'in_pruefung');

  assert.strictEqual((await put(`/api/kapitalpartner/${p.id}`, { status: 'quatsch' }, { cookie: adminCookie })).status, 400);
  assert.ok(await db('audit_log').where({ action: 'kapitalpartner.geaendert', resource_id: p.id }).first());
});

test('Ein Kontakt aus der Ansprache wird zum Kapitalpartner und ist dort raus', async () => {
  await importiereListe([{
    vorname: 'Ortrud', nachname: 'Silbereisen', prio: 'A', kanal: 'linkedin', quelle: 'Testliste v131',
    linkedin: 'https://www.linkedin.com/in/ortrud-silbereisen', firma: 'Silbereisen Objektleasing',
    berufsbezeichnung: 'Geschäftsführerin',
  }], { tenantId });
  const kontakt = await db('experts').where({ nachname: 'Silbereisen', tenant_id: tenantId }).first();

  const res = await post(`/api/kapitalpartner/aus-experte/${kontakt.id}`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 201);
  const d = await res.json();
  assert.strictEqual(d.partner.firmenname, 'Silbereisen Objektleasing', 'die Firma wird zum Namen');
  assert.strictEqual(d.partner.quelle, 'umgewandelt');
  assert.strictEqual(d.partner.status, 'in_pruefung');

  const danach = await db('experts').where({ id: kontakt.id }).first();
  assert.ok(danach, 'das Expertenprofil bleibt bestehen');
  assert.ok(danach.vorreg_ausgeschlossen_am, 'aber aus der Ansprache raus');
  assert.match(danach.vorreg_ausschluss_grund, /Kapitalpartner/);
  assert.strictEqual(danach.zielgruppe, 'kapitalpartner');

  // Aus der Arbeitsliste verschwunden
  const liste = await (await get('/api/ansprache/arbeitsliste?pensum=200', { cookie: adminCookie })).json();
  assert.ok(![...liste.faellig, ...liste.wiedervorlage].some((x) => x.id === kontakt.id));

  assert.strictEqual((await post(`/api/kapitalpartner/aus-experte/${kontakt.id}`, {}, { cookie: adminCookie })).status, 409,
    'zweimal umwandeln geht nicht');
});

test('Kapitalpartner bekommen keine Verfügbarkeitsabfrage und keine Erinnerungen', async () => {
  const { runAvailabilityReminders, runProfilCheck, runInviteLifecycle } = require('../jobs');
  const vorher = Number((await db('mail_outbox').count('* as c').first()).c);

  await runAvailabilityReminders();
  await runProfilCheck();
  await runInviteLifecycle();

  const nachher = await db('mail_outbox').orderBy('id', 'desc').limit(20);
  const adressen = nachher.map((m) => m.to_email);
  for (const p of await db('kapitalpartner').where({ tenant_id: tenantId }).whereNotNull('email')) {
    assert.ok(!adressen.includes(p.email), `an ${p.email} darf nichts gehen`);
  }
  assert.ok(Number((await db('mail_outbox').count('* as c').first()).c) >= vorher);
});

test('Das Verzeichnis ist dem Admin vorbehalten', async () => {
  assert.strictEqual((await get('/api/kapitalpartner')).status, 401);
  assert.strictEqual((await post('/api/kapitalpartner', { firmenname: 'Heimlich AG' })).status, 401);
  const p = await db('kapitalpartner').first();
  assert.strictEqual((await put(`/api/kapitalpartner/${p.id}`, { status: 'freigegeben' })).status, 401);
  assert.strictEqual(
    (await fetch(`${baseUrl}/api/kapitalpartner/${p.id}`, { method: 'DELETE' })).status, 401,
  );
});
