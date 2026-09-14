/**
 * v1.25.1 — Fehlimport über den Einladungs-Upload.
 * Geprüft werden: die reparierte Spaltenerkennung, die Sperre gegen
 * Vorregistrierungslisten im Einladungs-Upload und die Reparatur bestehender
 * Profile aus derselben Datei. Alle Namen sind erfunden.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const { repariereAusListe } = require('../utils/vorregistrierung');

let server; let baseUrl; let adminCookie; let tenantId;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });

function xlsxBuffer(rows) {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Import');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
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
});

after(async () => { server.close(); await db.destroy(); });

test('Einladungs-Upload liest Vorname und Nachname wieder getrennt', async () => {
  const buffer = xlsxBuffer([
    { Vorname: 'Achim', Nachname: 'Trautwein', 'E-Mail': 'achim.trautwein@example.org', Sprache: 'de' },
  ]);
  const form = new FormData();
  form.append('file', new Blob([buffer]), 'einladung.xlsx');
  const res = await fetch(`${baseUrl}/api/experts/invite-bulk`, { method: 'POST', headers: { cookie: adminCookie }, body: form });
  assert.strictEqual(res.status, 200);

  const expert = await db('experts').where({ email: 'achim.trautwein@example.org' }).first();
  assert.strictEqual(expert.vorname, 'Achim');
  assert.strictEqual(expert.nachname, 'Trautwein', 'nicht mehr "Achim Achim"');
});

test('Vorregistrierungsliste im Einladungs-Upload wird abgelehnt, bevor Mails rausgehen', async () => {
  const vorher = await db('mail_outbox').count('* as c').first();
  const buffer = xlsxBuffer([
    { Vorname: 'Gudrun', Nachname: 'Feldbacher', 'E-Mail': 'gudrun@feldbacher.example', Sprache: 'de',
      LinkedIn: 'https://www.linkedin.com/in/gudrun-feldbacher', Firma: 'Feldbacher Interim',
      Berufsbezeichnung: 'Interim CFO', Quelle: 'Testliste', Prio: 'A', Kanal: 'linkedin', 'Letzter Kontakt': '2026-04-01' },
  ]);
  const form = new FormData();
  form.append('file', new Blob([buffer]), 'vorreg.xlsx');
  const res = await fetch(`${baseUrl}/api/experts/invite-bulk`, { method: 'POST', headers: { cookie: adminCookie }, body: form });
  assert.strictEqual(res.status, 409);
  assert.match((await res.json()).error, /Liste vorregistrieren/);

  const nachher = await db('mail_outbox').count('* as c').first();
  assert.strictEqual(Number(vorher.c), Number(nachher.c), 'keine einzige Mail');
  assert.strictEqual(await db('experts').where({ email: 'gudrun@feldbacher.example' }).first(), undefined);
});

test('Reparatur stellt Namen richtig, ergänzt Angaben und stoppt den Zyklus', async () => {
  // Zustand nach dem Fehlimport nachstellen: Nachname gleich Vorname, Zyklus läuft
  const [kaputt] = await db('experts').insert({
    tenant_id: tenantId, status: 'eingeladen', vorname: 'Reinhild', nachname: 'Reinhild',
    email: 'reinhild@stollberg-interim.example', name_key: 'reinhild|reinhild',
    invite_cycle_started_at: new Date(), invite_zyklus: 'neu',
  }).returning('*');
  // Ein Profil, das schon in Ordnung ist, darf nicht angefasst werden
  const [heil] = await db('experts').insert({
    tenant_id: tenantId, status: 'eingeladen', vorname: 'Bruno', nachname: 'Kaltenbrunner',
    email: 'bruno@kaltenbrunner.example', firma: 'Eigene Firma', name_key: 'bruno|kaltenbrunner',
  }).returning('*');

  const zeilen = [
    { vorname: 'Reinhild', nachname: 'Stollberg', email: 'reinhild@stollberg-interim.example',
      linkedin: 'https://DE.linkedin.com/in/reinhild-stollberg/?x=1', firma: 'Stollberg Interim',
      berufsbezeichnung: 'Interim CRO', quelle: 'Testliste', prio: 'a', kanal: 'linkedin', letzter_kontakt: '2026-03-11' },
    { vorname: 'Bruno', nachname: 'Kaltenbrunner', email: 'bruno@kaltenbrunner.example', firma: 'Andere Firma' },
    { vorname: 'Niemand', nachname: 'Unbekannt', email: 'niemand@example.org' },
    { vorname: 'Ohne', nachname: 'Adresse', email: '' },
  ];
  const e = await repariereAusListe(zeilen, { tenantId, zyklusStoppen: true });
  assert.strictEqual(e.repariert.length, 1);
  assert.strictEqual(e.nicht_gefunden.length, 2, 'unbekannte Adresse und Zeile ohne E-Mail');

  const r = await db('experts').where({ id: kaputt.id }).first();
  assert.strictEqual(r.vorname, 'Reinhild');
  assert.strictEqual(r.nachname, 'Stollberg');
  assert.strictEqual(r.name_key, 'reinhild|stollberg');
  assert.strictEqual(r.firma, 'Stollberg Interim');
  assert.strictEqual(r.berufsbezeichnung, 'Interim CRO');
  assert.strictEqual(r.linkedin, 'linkedin.com/in/reinhild-stollberg');
  assert.strictEqual(r.vorreg_prio, 'A');
  assert.strictEqual(r.invite_cycle_started_at, null, 'Zyklus gestoppt');
  assert.strictEqual(r.status, 'eingeladen', 'Status bleibt, die Einladung ist ja raus');

  const b = await db('experts').where({ id: heil.id }).first();
  assert.strictEqual(b.firma, 'Eigene Firma', 'vorhandene Angaben werden nicht überschrieben');
  assert.strictEqual(b.nachname, 'Kaltenbrunner');

  // Zweiter Lauf ändert nichts mehr
  const e2 = await repariereAusListe(zeilen, { tenantId, zyklusStoppen: true });
  assert.strictEqual(e2.repariert.length, 0);
  assert.ok(await db('audit_log').where({ action: 'expert.import_reparatur' }).first());
});

test('Reparatur über die Route inklusive CSV und Rechteschutz', async () => {
  await db('experts').insert({
    tenant_id: tenantId, status: 'eingeladen', vorname: 'Wilfried', nachname: 'Wilfried',
    email: 'wilfried@dorn-consulting.example', name_key: 'wilfried|wilfried',
  });
  const buffer = xlsxBuffer([
    { Vorname: 'Wilfried', Nachname: 'Dorn', 'E-Mail': 'wilfried@dorn-consulting.example', Sprache: 'de',
      LinkedIn: 'https://www.linkedin.com/in/wilfried-dorn', Firma: 'Dorn Consulting',
      Berufsbezeichnung: 'Interim CEO', Quelle: 'Testliste', Prio: 'B', Kanal: 'linkedin', 'Letzter Kontakt': '' },
  ]);
  const form = new FormData();
  form.append('file', new Blob([buffer]), 'reparatur.xlsx');
  const res = await fetch(`${baseUrl}/api/experts/import-reparatur`, { method: 'POST', headers: { cookie: adminCookie }, body: form });
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.strictEqual(d.repariert, 1);
  assert.strictEqual(d.namen_korrigiert, 1);
  assert.match(d.csv, /"Wilfried";"Dorn"/);
  assert.strictEqual((await db('experts').where({ email: 'wilfried@dorn-consulting.example' }).first()).nachname, 'Dorn');

  const ohneLogin = await fetch(`${baseUrl}/api/experts/import-reparatur`, { method: 'POST', body: new FormData() });
  assert.strictEqual(ohneLogin.status, 401);
});

test('Wer schon eingeladen ist, bekommt über den allgemeinen Link die Einladung erneut', async () => {
  const bcrypt = require('bcryptjs');
  const [user] = await db('users').insert({
    tenant_id: tenantId, email: 'elfriede@bergmiller.example', role: 'expert', is_approved: false,
    password_hash: await bcrypt.hash('zufall', 10),
  }).returning('*');
  await db('experts').insert({
    tenant_id: tenantId, user_id: user.id, vorname: 'Elfriede', nachname: 'Bergmiller',
    email: 'elfriede@bergmiller.example', status: 'eingeladen', name_key: 'elfriede|bergmiller',
  });

  const res = await post('/api/auth/register', {
    email: 'elfriede@bergmiller.example', password: 'ein-gutes-passwort', consent: true,
    vorname: 'Elfriede', nachname: 'Bergmiller',
  });
  assert.strictEqual(res.status, 200, 'keine Wand, sondern ein Weg');
  const d = await res.json();
  assert.strictEqual(d.einladung_erneut, true);
  assert.match(d.message, /Postfach/);

  const mail = await db('mail_outbox').where({ to_email: 'elfriede@bergmiller.example', template_key: 'einladung_neu' })
    .orderBy('id', 'desc').first();
  assert.ok(mail, 'Einladung ist erneut raus');
  assert.match(mail.body_html, /einladung\?token=/);
  assert.strictEqual(await db('users').where({ email: 'elfriede@bergmiller.example' }).count('* as c').first().then((x) => Number(x.c)), 1,
    'kein zweites Konto');

  // Wer die Einladung angenommen hat, bekommt weiterhin die klare Abfuhr
  await db('consents').insert({
    tenant_id: tenantId, user_id: user.id, zweck: 'talentpool', text_version: 'test',
    expires_at: new Date(Date.now() + 86400000 * 100),
  });
  const zweiter = await post('/api/auth/register', {
    email: 'elfriede@bergmiller.example', password: 'ein-gutes-passwort', consent: true,
    vorname: 'Elfriede', nachname: 'Bergmiller',
  });
  assert.strictEqual(zweiter.status, 409);
});
