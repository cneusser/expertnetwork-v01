/** v1.8.0: Einladungs-Funnel — Einzel-/Bulk-Einladung, Vorlagen-CRUD, Outbox. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const { signPurposeToken } = require('../utils/tokens');

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

test('Einzel-Einladung: legt Konto + Profil an, Mail landet in der Outbox, Annahme schaltet frei', async () => {
  const res = await post('/api/experts/invite-neu', { vorname: 'Nina', nachname: 'Neuland', email: 'nina@neuland.example' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 201);

  const expert = await db('experts').where({ email: 'nina@neuland.example' }).first();
  assert.strictEqual(expert.status, 'eingeladen');
  assert.ok(expert.user_id, 'Konto angelegt');

  const outbox = await db('mail_outbox').where({ to_email: 'nina@neuland.example' }).first();
  assert.ok(outbox, 'Versand protokolliert');
  assert.strictEqual(outbox.template_key, 'einladung_neu');
  assert.ok(['gesendet', 'stub'].includes(outbox.status));
  assert.ok(!outbox.subject.includes('—') && !outbox.body_html.includes('—'), 'keine Gedankenstriche in der Mail');
  assert.match(outbox.body_html, /Hallo Nina/); // v1.15.1: Du-Form, Anrede nur mit Vornamen

  // Dublette wird abgewiesen
  const dupe = await post('/api/experts/invite-neu', { vorname: 'Nina', nachname: 'Neuland', email: 'nina@neuland.example' }, { cookie: adminCookie });
  assert.strictEqual(dupe.status, 400);

  // Funnel-Abschluss: Einladung annehmen → freigegeben + Consent
  const token = signPurposeToken(expert.user_id, 'expert-invite', '14d');
  const acc = await post('/api/auth/accept-invite', { token, password: 'nina-passwort-1', consent: true });
  assert.strictEqual(acc.status, 200);
  assert.strictEqual((await db('experts').where({ id: expert.id }).first()).status, 'freigegeben');
});

test('Bulk-Einladung per XLSX: lädt gültige Zeilen ein, überspringt Dubletten/Fehler', async () => {
  const XLSX = require('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    ['Vorname', 'Nachname', 'E-Mail'],
    ['Bernd', 'Beispiel', 'bernd@beispiel.example'],
    ['Nina', 'Neuland', 'nina@neuland.example'], // Dublette
    ['Kaputt', 'Kaputt', 'keine-mail'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Kontakte');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'kontakte.xlsx');
  const res = await fetch(`${baseUrl}/api/experts/invite-bulk`, { method: 'POST', headers: { cookie: adminCookie }, body: fd });
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.deepStrictEqual(d.eingeladen, ['bernd@beispiel.example']);
  assert.strictEqual(d.uebersprungen.length, 2);
  assert.ok(await db('experts').where({ email: 'bernd@beispiel.example' }).first());
});

test('Vorlagen: anpassen wirkt auf den Versand, {{link}} ist Pflicht, Reset stellt Standard her', async () => {
  const list = await (await fetch(`${baseUrl}/api/mails/templates`, { headers: { cookie: adminCookie } })).json();
  assert.ok(list.templates.find((t) => t.key === 'einladung_neu'));

  // Ohne {{link}} → abgelehnt
  const bad = await fetch(`${baseUrl}/api/mails/templates/einladung_neu`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ subject: 'X', body_text: 'ohne Link' }),
  });
  assert.strictEqual(bad.status, 400);

  // Anpassen und einladen → angepasster Text im Versand
  const ok = await fetch(`${baseUrl}/api/mails/templates/einladung_neu`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ subject: 'Hallo {{vorname}}, Phalanx ruft', body_text: 'Individueller Text für {{vorname}}.\n\n{{link}}' }),
  });
  assert.strictEqual(ok.status, 200);
  await post('/api/experts/invite-neu', { vorname: 'Tina', nachname: 'Test', email: 'tina@test.example' }, { cookie: adminCookie });
  const mail = await db('mail_outbox').where({ to_email: 'tina@test.example' }).first();
  assert.strictEqual(mail.subject, 'Hallo Tina, Phalanx ruft');
  assert.match(mail.body_html, /Individueller Text für Tina/);

  const reset = await post('/api/mails/templates/einladung_neu/reset', {}, { cookie: adminCookie });
  assert.strictEqual(reset.status, 200);
  const after1 = await (await fetch(`${baseUrl}/api/mails/templates`, { headers: { cookie: adminCookie } })).json();
  assert.strictEqual(after1.templates.find((t) => t.key === 'einladung_neu').angepasst, false);
});

test('Outbox-API listet Versand mit Status; nur für Admin', async () => {
  const d = await (await fetch(`${baseUrl}/api/mails/outbox`, { headers: { cookie: adminCookie } })).json();
  assert.ok(d.outbox.length >= 3);
  assert.ok(d.outbox.every((m) => m.to_email && m.subject && m.status));
  const anon = await fetch(`${baseUrl}/api/mails/outbox`);
  assert.strictEqual(anon.status, 401);
});
