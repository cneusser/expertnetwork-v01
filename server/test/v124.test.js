/**
 * v1.24.0 — Dokumente löschen (Admin und Experte), verwaiste Einträge aufräumen,
 * Quartalscheck "Profil noch aktuell?" mit 90-Tage-Takt und Consent-Schranke.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');
const { runProfilCheck } = require('../jobs');
const storage = require('../providers/storage');

let server; let baseUrl; let adminCookie; let adrian;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const del = (p, h = {}) => fetch(baseUrl + p, { method: 'DELETE', headers: h });

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
});

after(async () => { server.close(); await db.destroy(); });

test('Admin löscht ein Dokument samt Datei', async () => {
  const relPath = `experts/${adrian.id}/testloeschen.pdf`;
  await storage.save(relPath, Buffer.from('%PDF-1.4 Testinhalt'));
  const [doc] = await db('documents').insert({
    tenant_id: adrian.tenant_id, expert_id: adrian.id, kategorie: 'referenz',
    filename: 'Zu löschen.pdf', version: 1, storage_ref: relPath, mimetype: 'application/pdf', size_bytes: 19,
  }).returning('*');

  assert.strictEqual((await del(`/api/experts/${adrian.id}/documents/${doc.id}`)).status, 401);
  const res = await del(`/api/experts/${adrian.id}/documents/${doc.id}`, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(await db('documents').where({ id: doc.id }).first(), undefined);
  assert.strictEqual(storage.exists(relPath), false, 'Datei ist mit weg');
  assert.ok(await db('audit_log').where({ action: 'document.delete', resource_id: doc.id }).first());
  assert.strictEqual((await del(`/api/experts/${adrian.id}/documents/${doc.id}`, { cookie: adminCookie })).status, 404);
});

test('Verwaiste Einträge werden erkannt, angezeigt und aufgeräumt', async () => {
  const [verwaist] = await db('documents').insert({
    tenant_id: adrian.tenant_id, expert_id: adrian.id, kategorie: 'cv',
    filename: 'Verlorener Lebenslauf.pdf', version: 9, storage_ref: 'experts/999/weg.pdf',
    mimetype: 'application/pdf', size_bytes: 100,
  }).returning('*');

  const detail = await (await fetch(`${baseUrl}/api/experts/${adrian.id}`, { headers: { cookie: adminCookie } })).json();
  const eintrag = detail.documents.find((d) => d.id === verwaist.id);
  assert.strictEqual(eintrag.datei_fehlt, true, 'Tresor markiert den verwaisten Eintrag');
  assert.strictEqual(eintrag.storage_ref, undefined, 'interner Pfad bleibt verborgen');

  const check = await (await fetch(`${baseUrl}/api/experts/speicher-check`, { headers: { cookie: adminCookie } })).json();
  assert.ok(check.fehlend >= 1);

  const auf = await post('/api/experts/speicher-check/aufraeumen', {}, { cookie: adminCookie });
  assert.strictEqual(auf.status, 200);
  assert.ok((await auf.json()).geloescht >= 1);
  assert.strictEqual(await db('documents').where({ id: verwaist.id }).first(), undefined);
  assert.ok(await db('audit_log').where({ action: 'document.delete_verwaist', resource_id: adrian.id }).first());

  const nachher = await (await fetch(`${baseUrl}/api/experts/speicher-check`, { headers: { cookie: adminCookie } })).json();
  assert.strictEqual(nachher.fehlend, 0, 'danach ist nichts mehr verwaist');
});

test('Quartalscheck: nur mit Einwilligung, nur alle 90 Tage', async () => {
  // Geteilte Test-Datenbank: Einwilligungen aus vorherigen Testdateien wegräumen,
  // sonst zählt der Job Empfänger mit, die hier nichts zu suchen haben.
  await db('consents').delete();
  await db('experts').update({ letzter_profilcheck_at: new Date() });
  await db('experts').where({ id: adrian.id }).update({ status: 'freigegeben', letzter_profilcheck_at: null });

  const ohne = await runProfilCheck();
  assert.strictEqual(ohne.gesendet, 0, 'ohne Einwilligung geht nichts raus');

  await db('consents').insert({
    tenant_id: adrian.tenant_id, user_id: adrian.user_id, zweck: 'talentpool',
    text_version: 'test', expires_at: new Date(Date.now() + 86400000 * 100),
  });
  const erster = await runProfilCheck();
  assert.ok(erster.gesendet >= 1);
  const out = await db('mail_outbox').where({ to_email: adrian.email, template_key: 'profil_check' }).first();
  assert.ok(out, 'Quartalsmail in der Outbox');
  assert.match(out.subject, /stimmt dein Profil noch/);
  assert.ok(!out.body_html.includes('—'), 'keine Gedankenstriche');
  assert.ok(await db('audit_log').where({ action: 'reminder.profil_check', resource_id: adrian.id }).first());

  const zweiter = await runProfilCheck();
  assert.strictEqual(zweiter.gesendet, 0, 'kein zweiter Anlauf innerhalb der 90 Tage');

  await db('experts').where({ id: adrian.id })
    .update({ letzter_profilcheck_at: new Date(Date.now() - 91 * 86400000) });
  const spaeter = await runProfilCheck();
  assert.ok(spaeter.gesendet >= 1, 'nach 90 Tagen fragen wir wieder nach');
});
