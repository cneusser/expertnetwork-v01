/** v1.22.0: Speicher-Check findet fehlende Dateien und schreibt Betroffene an. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');

let server; let baseUrl; let adminCookie; let adrian;
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
});

after(async () => { server.close(); await db.destroy(); });

test('Speicher-Check erkennt fehlende Dateien und fordert sie per Mail nach', async () => {
  // Dokument mit nicht existierender Datei anlegen
  await db('documents').insert({
    tenant_id: adrian.tenant_id, expert_id: adrian.id, kategorie: 'cv',
    filename: 'Verlorener CV.pdf', version: 1, storage_ref: 'experts/999/gibtsnicht.pdf',
    mimetype: 'application/pdf', size_bytes: 1234,
  });

  const check = await (await fetch(`${baseUrl}/api/experts/speicher-check`, { headers: { cookie: adminCookie } })).json();
  assert.ok(check.fehlend >= 1, 'fehlende Datei erkannt');
  const treffer = check.betroffen.find((b) => b.expert_id === adrian.id);
  assert.ok(treffer, 'Adrian als betroffen gelistet');
  assert.ok(treffer.dateien.some((d) => d.filename === 'Verlorener CV.pdf'));
  assert.match(check.hinweis, /Volume/);

  const mail = await post('/api/experts/speicher-check/anschreiben', {}, { cookie: adminCookie });
  assert.strictEqual(mail.status, 200);
  assert.ok((await mail.json()).gesendet >= 1);
  const out = await db('mail_outbox').where({ to_email: adrian.email, template_key: 'datei_erneut_hochladen' }).first();
  assert.ok(out, 'Nachforderung in der Outbox');
  assert.match(out.body_html, /Verlorener CV\.pdf/);
  assert.ok(!out.body_html.includes('—'), 'keine Gedankenstriche');
  assert.ok(await db('audit_log').where({ action: 'expert.datei_nachforderung', resource_id: adrian.id }).first());

  assert.strictEqual((await fetch(`${baseUrl}/api/experts/speicher-check`)).status, 401);
});
