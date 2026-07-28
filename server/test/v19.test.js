/** v1.9.0: Englische Einladungsstrecke — EN-Vorlage, Sprachwahl, lang=en im Link. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');

let server; let baseUrl; let adminCookie;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });

before(async () => {
  await db.migrate.latest();
  await seed();
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  })).headers.get('set-cookie');
});

after(async () => { server.close(); await db.destroy(); });

test('Englische Einladung: EN-Vorlage, EN-Betreff, Link mit lang=en', async () => {
  const res = await post('/api/experts/invite-neu',
    { vorname: 'James', nachname: 'Miller', email: 'james@miller.example', sprache: 'en' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 201);
  const mail = await db('mail_outbox').where({ to_email: 'james@miller.example' }).first();
  assert.strictEqual(mail.template_key, 'einladung_neu_en');
  assert.strictEqual(mail.subject, 'Invitation to the Phalanx Expert Network');
  assert.match(mail.body_html, /Hello James Miller/);
  assert.match(mail.body_html, /lang=en/, 'Einladungslink öffnet den Wizard auf Englisch');
  assert.ok(!mail.body_html.includes('—'), 'keine Gedankenstriche');
});

test('Deutsche Einladung bleibt Standard (ohne Sprachangabe)', async () => {
  await post('/api/experts/invite-neu', { vorname: 'Doris', nachname: 'Deutsch', email: 'doris@deutsch.example' }, { cookie: adminCookie });
  const mail = await db('mail_outbox').where({ to_email: 'doris@deutsch.example' }).first();
  assert.strictEqual(mail.template_key, 'einladung_neu');
  assert.ok(!mail.body_html.includes('lang=en'));
});

test('EN-Vorlagen erscheinen in der Vorlagen-Verwaltung und sind editierbar', async () => {
  const d = await (await fetch(`${baseUrl}/api/mails/templates`, { headers: { cookie: adminCookie } })).json();
  const keys = d.templates.map((t) => t.key);
  assert.ok(keys.includes('einladung_neu_en') && keys.includes('einladung_bestand_en'));
  const upd = await fetch(`${baseUrl}/api/mails/templates/einladung_neu_en`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ subject: 'Join Phalanx, {{vorname}}', body_text: 'Custom English text.\n\n{{link}}' }),
  });
  assert.strictEqual(upd.status, 200);
  await post('/api/experts/invite-neu', { vorname: 'Emma', nachname: 'English', email: 'emma@english.example', sprache: 'en' }, { cookie: adminCookie });
  const mail = await db('mail_outbox').where({ to_email: 'emma@english.example' }).first();
  assert.strictEqual(mail.subject, 'Join Phalanx, Emma');
  await post('/api/mails/templates/einladung_neu_en/reset', {}, { cookie: adminCookie });
});

test('Bulk mit Sprachspalte: EN-Zeile bekommt EN-Mail', async () => {
  const XLSX = require('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    ['Vorname', 'Nachname', 'E-Mail', 'Sprache'],
    ['Pierre', 'Beispiel', 'pierre@beispiel.example', 'en'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'K');
  const fd = new FormData();
  fd.append('file', new Blob([XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })]), 'k.xlsx');
  const res = await fetch(`${baseUrl}/api/experts/invite-bulk`, { method: 'POST', headers: { cookie: adminCookie }, body: fd });
  assert.strictEqual(res.status, 200);
  const mail = await db('mail_outbox').where({ to_email: 'pierre@beispiel.example' }).first();
  assert.strictEqual(mail.template_key, 'einladung_neu_en');
});
