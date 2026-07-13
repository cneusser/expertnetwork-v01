/** v1.6.0: LinkedIn OIDC — Status, Flow-Start, State-Schutz, Konto-Verknüpfung (Stub, kein Netz). */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');

let server; let baseUrl; let adrian; let adrianUser;
const get = (p, h = {}) => fetch(baseUrl + p, { redirect: 'manual', headers: h });

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  await db('users').where({ id: adrian.user_id }).update({ email_verified_at: db.fn.now(), is_approved: true });
  adrianUser = await db('users').where({ id: adrian.user_id }).first();
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  delete process.env.LINKEDIN_CLIENT_ID; delete process.env.LINKEDIN_CLIENT_SECRET; delete process.env.LINKEDIN_TEST_USERINFO;
  server.close(); await db.destroy();
});

test('Ohne Konfiguration: Status disabled, Flow-Start leitet mit Hinweis zurück', async () => {
  const st = await (await get('/api/auth/linkedin/status')).json();
  assert.strictEqual(st.enabled, false);
  const res = await get('/api/auth/linkedin');
  assert.strictEqual(res.status, 302);
  assert.match(res.headers.get('location'), /linkedin-nicht-konfiguriert/);
});

test('Mit Konfiguration: Redirect zu LinkedIn mit State-Cookie und korrekten Parametern', async () => {
  process.env.LINKEDIN_CLIENT_ID = 'test-client';
  process.env.LINKEDIN_CLIENT_SECRET = 'test-secret';
  const st = await (await get('/api/auth/linkedin/status')).json();
  assert.strictEqual(st.enabled, true);

  const res = await get('/api/auth/linkedin');
  assert.strictEqual(res.status, 302);
  const loc = res.headers.get('location');
  assert.match(loc, /^https:\/\/www\.linkedin\.com\/oauth\/v2\/authorization\?/);
  assert.match(loc, /client_id=test-client/);
  assert.match(loc, /scope=openid\+profile\+email/);
  assert.match(res.headers.get('set-cookie'), /li_state=/);
});

test('Callback: falscher State wird abgewiesen (CSRF-Schutz)', async () => {
  const start = await get('/api/auth/linkedin');
  const cookie = start.headers.get('set-cookie').split(';')[0];
  const res = await get('/api/auth/linkedin/callback?code=x&state=falscher-wert', { cookie });
  assert.strictEqual(res.status, 302);
  assert.match(res.headers.get('location'), /linkedin-state/);
});

test('Callback: verknüpft bestehendes Konto per E-Mail, setzt Session; kein Konto → Hinweis', async () => {
  // Stub: LinkedIn liefert Adrians E-Mail
  process.env.LINKEDIN_TEST_USERINFO = JSON.stringify({
    sub: 'li-sub-adrian', email: adrianUser.email, email_verified: true, name: 'Adrian Spörri',
  });
  let start = await get('/api/auth/linkedin');
  let cookie = start.headers.get('set-cookie').split(';')[0];
  const state = cookie.split('=')[1];
  const res = await get(`/api/auth/linkedin/callback?code=stub&state=${state}`, { cookie });
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.get('location'), '/dashboard');
  assert.match(res.headers.get('set-cookie'), /session=/);
  const linked = await db('users').where({ id: adrianUser.id }).first();
  assert.strictEqual(linked.linkedin_sub, 'li-sub-adrian', 'LinkedIn-Konto verknüpft');
  const audit = await db('audit_log').where({ action: 'auth.linkedin_linked', resource_id: adrianUser.id }).first();
  assert.ok(audit, 'Verknüpfung auditiert');

  // Zweiter Login: Match über sub (auch wenn LinkedIn eine andere E-Mail liefert)
  process.env.LINKEDIN_TEST_USERINFO = JSON.stringify({
    sub: 'li-sub-adrian', email: 'privat@anders.example', email_verified: true,
  });
  start = await get('/api/auth/linkedin');
  cookie = start.headers.get('set-cookie').split(';')[0];
  const res2 = await get(`/api/auth/linkedin/callback?code=stub&state=${cookie.split('=')[1]}`, { cookie });
  assert.strictEqual(res2.headers.get('location'), '/dashboard', 'Login über verknüpftes Konto');

  // Unbekannte E-Mail + unbekannter sub → keine Kontoanlage, klarer Hinweis
  process.env.LINKEDIN_TEST_USERINFO = JSON.stringify({
    sub: 'li-sub-fremd', email: 'unbekannt@nirgends.example', email_verified: true,
  });
  start = await get('/api/auth/linkedin');
  cookie = start.headers.get('set-cookie').split(';')[0];
  const res3 = await get(`/api/auth/linkedin/callback?code=stub&state=${cookie.split('=')[1]}`, { cookie });
  assert.match(res3.headers.get('location'), /linkedin-kein-konto/);
  assert.strictEqual(await db('users').where({ linkedin_sub: 'li-sub-fremd' }).first(), undefined, 'kein Auto-Konto (DSGVO)');
});
