/** v1.14.0: Zwei-Wege-Kommunikation — Inbound-Webhook, Posteingang, Antwort, Rundmail. */
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
  process.env.INBOUND_KEY = 'test-inbound-geheim';
  await db.migrate.latest();
  await seed();
  await importAll();
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  await db('experts').where({ id: adrian.id }).update({ status: 'freigegeben' });
  await db('consents').insert({
    tenant_id: adrian.tenant_id, user_id: adrian.user_id, zweck: 'talentpool',
    text_version: 'test', expires_at: new Date(Date.now() + 86400000 * 100),
  });
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  })).headers.get('set-cookie');
});

after(async () => { delete process.env.INBOUND_KEY; server.close(); await db.destroy(); });

test('Inbound-Webhook: Schlüssel-Schutz, Speicherung, Experten-Zuordnung', async () => {
  const payload = {
    items: [{
      From: { Address: 'ADRIAN@rethink-interim.ch', Name: 'Adrian Spörri' },
      Subject: 'Re: Ihre Einladung',
      RawTextBody: 'Klingt gut, ich bin dabei. Ab November wieder voll verfügbar.',
      RawHtmlBody: '<p>Klingt gut, ich bin dabei.</p>',
    }],
  };
  const ohneKey = await post('/api/mails/inbound', payload);
  assert.strictEqual(ohneKey.status, 401);
  const falsch = await post('/api/mails/inbound?key=falsch', payload);
  assert.strictEqual(falsch.status, 401);

  const res = await post('/api/mails/inbound?key=test-inbound-geheim', payload);
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).gespeichert, 1);

  const row = await db('mail_inbox').where({ from_email: 'adrian@rethink-interim.ch' }).first();
  assert.ok(row, 'Nachricht gespeichert');
  assert.strictEqual(row.expert_id, adrian.id, 'Experte über Absenderadresse zugeordnet');
  assert.strictEqual(row.gelesen, false);
});

test('Posteingang: Liste mit Ungelesen-Zähler, Lesen markiert, Antwort landet in der Outbox', async () => {
  const inbox = await (await fetch(`${baseUrl}/api/mails/inbox`, { headers: { cookie: adminCookie } })).json();
  assert.ok(inbox.ungelesen >= 1);
  const mail = inbox.inbox.find((m) => m.from_email === 'adrian@rethink-interim.ch');
  assert.ok(mail);

  const detail = await (await fetch(`${baseUrl}/api/mails/inbox/${mail.id}`, { headers: { cookie: adminCookie } })).json();
  assert.match(detail.mail.body_text, /dabei/);
  assert.strictEqual((await db('mail_inbox').where({ id: mail.id }).first()).gelesen, true, 'als gelesen markiert');

  const antwort = await post(`/api/mails/inbox/${mail.id}/antwort`, { text: 'Sehr gut, wir melden uns mit dem nächsten Mandat.' }, { cookie: adminCookie });
  assert.strictEqual(antwort.status, 200);
  const out = await db('mail_outbox').where({ to_email: 'adrian@rethink-interim.ch', template_key: 'antwort' }).orderBy('id', 'desc').first();
  assert.ok(out, 'Antwort in der Outbox');
  assert.match(out.subject, /^Re:/);
  assert.ok((await db('mail_inbox').where({ id: mail.id }).first()).beantwortet_at, 'als beantwortet markiert');

  const anon = await fetch(`${baseUrl}/api/mails/inbox`);
  assert.strictEqual(anon.status, 401);
});

test('Rundmail: nur an Experten mit aktiver Einwilligung, Platzhalter gefüllt', async () => {
  const emp = await (await fetch(`${baseUrl}/api/mails/rundmail/empfaenger?status=freigegeben`, { headers: { cookie: adminCookie } })).json();
  assert.strictEqual(emp.anzahl, 1, 'nur Adrian hat Consent');
  assert.deepStrictEqual(emp.emails, ['adrian@rethink-interim.ch']);

  const res = await post('/api/mails/rundmail', {
    status: 'freigegeben', subject: 'Neuigkeiten für {{vorname}}',
    body_text: 'Guten Tag {{vorname}} {{nachname}},\n\nkurzes Update aus dem Netzwerk.',
  }, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).gesendet, 1);

  const out = await db('mail_outbox').where({ template_key: 'rundmail' }).orderBy('id', 'desc').first();
  assert.strictEqual(out.subject, 'Neuigkeiten für Adrian');
  assert.match(out.body_html, /Adrian Spörri/);
  assert.ok(!out.body_html.includes('—'), 'keine Gedankenstriche');

  // Eingeladene ohne Consent bleiben außen vor (Malzkorn & Co.)
  const alle = await (await fetch(`${baseUrl}/api/mails/rundmail/empfaenger?status=alle`, { headers: { cookie: adminCookie } })).json();
  assert.strictEqual(alle.anzahl, 1, 'Consent-Schranke greift auch bei "alle"');
});
