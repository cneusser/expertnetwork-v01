/** v1.0.0-Härtungstests: Rate-Limit, Session-Invalidierung, Origin-Check, Magic Bytes, Header. */
process.env.AUTH_RATE_LIMIT = '8'; // niedriges Limit für den Test

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');

let server;
let baseUrl;
let adrian;

const post = (p, body, headers = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  await db('users').where({ id: adrian.user_id }).update({
    password_hash: await bcrypt.hash('hardening-pw-1', 10),
    email_verified_at: db.fn.now(),
    is_approved: true,
  });
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await db.destroy();
});

test('Sicherheits-Header (Helmet) gesetzt', async () => {
  const res = await fetch(baseUrl + '/api/health');
  assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('x-frame-options'), 'Clickjacking-Schutz');
});

test('Origin-Check blockt fremde Origins bei mutierenden Requests', async () => {
  const res = await post('/api/auth/login', { email: 'x@y.de', password: 'zzzzzzzzzz' }, { Origin: 'https://boese-seite.example' });
  assert.strictEqual(res.status, 403);
  const ok = await post('/api/auth/login', { email: 'x@y.de', password: 'zzzzzzzzzz' }, { Origin: `http://127.0.0.1:${server.address().port}` });
  assert.notStrictEqual(ok.status, 403, 'eigener Origin passiert');
});

test('Passwortänderung invalidiert alte Sessions (token_version)', async () => {
  const login1 = await post('/api/auth/login', { email: adrian.email, password: 'hardening-pw-1' });
  assert.strictEqual(login1.status, 200);
  const oldCookie = login1.headers.get('set-cookie');

  const change = await post('/api/auth/change-password', { current: 'hardening-pw-1', next: 'hardening-pw-2neu' }, { cookie: oldCookie });
  assert.strictEqual(change.status, 200);
  const freshCookie = change.headers.get('set-cookie');

  const staleMe = await fetch(baseUrl + '/api/auth/me', { headers: { cookie: oldCookie } });
  assert.strictEqual(staleMe.status, 401, 'alte Session ungültig');
  const freshMe = await fetch(baseUrl + '/api/auth/me', { headers: { cookie: freshCookie } });
  assert.strictEqual(freshMe.status, 200, 'eigene Session bleibt aktiv (frisches Cookie)');
});

test('Upload lehnt Nicht-PDF trotz PDF-Mimetype ab (Magic Bytes)', async () => {
  const admin = await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  });
  const cookie = admin.headers.get('set-cookie');
  const fd = new FormData();
  fd.append('file', new Blob(['kein pdf inhalt'], { type: 'application/pdf' }), 'fake.pdf');
  fd.append('kategorie', 'referenz');
  const res = await fetch(`${baseUrl}/api/experts/${adrian.id}/documents`, { method: 'POST', headers: { cookie }, body: fd });
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /kein gültiges PDF/);
});

test('Rate-Limit greift nach zu vielen Login-Versuchen', async () => {
  let got429 = false;
  for (let i = 0; i < 12; i++) {
    const res = await post('/api/auth/login', { email: 'brute@force.example', password: 'falschfalsch' });
    if (res.status === 429) { got429 = true; break; }
  }
  assert.ok(got429, '429 nach wiederholten Versuchen');
});
