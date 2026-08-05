/** v1.20.0: Direktmail an ausgewählte Experten. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');

let server; let baseUrl; let adminCookie; let adrian; let malz;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  malz = await db('experts').where({ email: 'g.malzkorn@malzkorn-mc.de' }).first();
  await db('experts').where({ id: adrian.id }).update({ status: 'freigegeben' });
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  })).headers.get('set-cookie');
});

after(async () => { server.close(); await db.destroy(); });

test('Direktmail: Platzhalter gefüllt, Outbox und Audit, Consent-Schranke bei Freigegebenen', async () => {
  // Eingeladener Kontakt darf angeschrieben werden (Anbahnung)
  const res = await post('/api/experts/direktmail', {
    expert_ids: [malz.id], subject: 'Kurze Rückfrage, {{vorname}}',
    body_text: 'Hallo {{vorname}} {{nachname}},\n\nmagst du dein Profil noch vervollständigen?',
  }, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).gesendet, 1);
  const mail = await db('mail_outbox').where({ to_email: malz.email, template_key: 'direktmail' }).first();
  assert.match(mail.subject, /Kurze Rückfrage, /);
  assert.match(mail.body_html, new RegExp(malz.vorname));
  assert.ok(await db('audit_log').where({ action: 'expert.direktmail', resource_id: malz.id }).first(), 'auditiert');

  // Freigegebener ohne Einwilligung wird übersprungen (Consent sicher entfernen)
  await db('consents').where({ user_id: adrian.user_id }).delete();
  const ohne = await post('/api/experts/direktmail', {
    expert_ids: [adrian.id], subject: 'Test', body_text: 'Text',
  }, { cookie: adminCookie });
  const d = await ohne.json();
  assert.strictEqual(d.gesendet, 0);
  assert.match(d.uebersprungen[0], /Einwilligung/);

  // Mit Einwilligung geht es
  await db('consents').insert({
    tenant_id: adrian.tenant_id, user_id: adrian.user_id, zweck: 'talentpool',
    text_version: 't', expires_at: new Date(Date.now() + 86400000 * 30),
  });
  const mit = await post('/api/experts/direktmail', { expert_ids: [adrian.id], subject: 'Test 2', body_text: 'Text' }, { cookie: adminCookie });
  assert.strictEqual((await mit.json()).gesendet, 1);

  // Validierung und Zugriffsschutz
  assert.strictEqual((await post('/api/experts/direktmail', { expert_ids: [], subject: 'x', body_text: 'y' }, { cookie: adminCookie })).status, 400);
  assert.strictEqual((await post('/api/experts/direktmail', { expert_ids: [adrian.id] }, { cookie: adminCookie })).status, 400);
  assert.strictEqual((await post('/api/experts/direktmail', { expert_ids: [adrian.id], subject: 'a', body_text: 'b' })).status, 401);
});

test('Experten freigeben und zurücksetzen (Status + Konto)', async () => {
  const [ex] = await db('experts').insert({
    tenant_id: 1, vorname: 'Frei', nachname: 'Gabe', email: 'frei@gabe.example', status: 'registriert',
  }).returning('*');
  const [u] = await db('users').insert({
    tenant_id: 1, email: 'frei@gabe.example', role: 'expert', is_approved: false, password_hash: 'x',
  }).returning('*');
  await db('experts').where({ id: ex.id }).update({ user_id: u.id });

  const frei = await post('/api/experts/freigeben', { expert_ids: [ex.id], freigeben: true }, { cookie: adminCookie });
  assert.strictEqual(frei.status, 200);
  assert.strictEqual((await db('experts').where({ id: ex.id }).first()).status, 'freigegeben');
  assert.strictEqual((await db('users').where({ id: u.id }).first()).is_approved, true);
  assert.ok(await db('audit_log').where({ action: 'expert.freigegeben', resource_id: ex.id }).first());

  const zurueck = await post('/api/experts/freigeben', { expert_ids: [ex.id], freigeben: false }, { cookie: adminCookie });
  assert.strictEqual(zurueck.status, 200);
  assert.strictEqual((await db('experts').where({ id: ex.id }).first()).status, 'registriert');
  assert.strictEqual((await post('/api/experts/freigeben', { expert_ids: [ex.id] })).status, 401);
});

test('Standardmail aus dem Profil (Regelkommunikation)', async () => {
  const res = await post(`/api/experts/${malz.id}/standardmail`, { key: 'stammdaten_pflegen' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const mail = await db('mail_outbox').where({ to_email: malz.email, template_key: 'stammdaten_pflegen' }).first();
  assert.ok(mail, 'Standardmail in der Outbox');
  assert.match(mail.body_html, new RegExp(malz.vorname));
  assert.ok(!mail.body_html.includes('—'), 'keine Gedankenstriche');
  assert.ok(await db('audit_log').where({ action: 'expert.standardmail', resource_id: malz.id }).first());
  assert.strictEqual((await post(`/api/experts/${malz.id}/standardmail`, { key: 'gibtsnicht' }, { cookie: adminCookie })).status, 400);
  assert.strictEqual((await post(`/api/experts/${malz.id}/standardmail`, { key: 'wiedervorlage' })).status, 401);
});
