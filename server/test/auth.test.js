/**
 * API-Smoke-Test Sprint 0 (node:test, ohne Zusatz-Framework):
 * Registrierung → Verifizierung → Login → /me → Audit-Log-Nachweis →
 * Append-only-Beweis (UPDATE auf audit_log muss scheitern).
 * Voraussetzung: DATABASE_URL zeigt auf eine (Test-)Postgres-DB.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const { outbox } = require('../providers/mail/stub');

let server;
let baseUrl;
const email = `test-${Date.now()}@example.com`;
const password = 'test-passwort-123';
let cookie;

before(async () => {
  await db.migrate.latest();
  await seed();
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await db.destroy();
});

const post = (p, body, headers = {}) =>
  fetch(baseUrl + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

test('Registrierung ohne Einwilligung wird abgelehnt', async () => {
  const res = await post('/api/auth/register', { email, password, consent: false });
  assert.strictEqual(res.status, 400);
});

test('Registrierung legt User, Consent und Audit-Eintrag an', async () => {
  const res = await post('/api/auth/register', { email, password, consent: true });
  assert.strictEqual(res.status, 201);

  const user = await db('users').where({ email }).first();
  assert.ok(user, 'User existiert');
  const consent = await db('consents').where({ user_id: user.id }).first();
  assert.ok(consent, 'Consent-Record existiert');
  assert.ok(new Date(consent.expires_at) > new Date(), 'Consent ist befristet');
  const audit = await db('audit_log').where({ action: 'user.register', resource_id: user.id }).first();
  assert.ok(audit, 'Audit-Eintrag existiert');
});

test('Login vor Verifizierung wird abgelehnt', async () => {
  const res = await post('/api/auth/login', { email, password });
  assert.strictEqual(res.status, 403);
});

test('E-Mail-Verifizierung über Token aus der Stub-Outbox', async () => {
  const mail = outbox.find((m) => m.to === email);
  assert.ok(mail, 'Verifizierungs-Mail wurde "versendet"');
  const token = decodeURIComponent(mail.text.split('token=')[1]);
  const res = await post('/api/auth/verify', { token });
  assert.strictEqual(res.status, 200);
});

test('Login setzt httpOnly-Session-Cookie, /me funktioniert', async () => {
  const res = await post('/api/auth/login', { email, password });
  assert.strictEqual(res.status, 200);
  cookie = res.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);

  const me = await fetch(baseUrl + '/api/auth/me', { headers: { cookie } });
  assert.strictEqual(me.status, 200);
  const body = await me.json();
  assert.strictEqual(body.user.email, email);
  assert.strictEqual(body.user.role, 'expert');
});

test('audit_log ist append-only (UPDATE wirft Fehler)', async () => {
  await assert.rejects(
    db('audit_log').where({ action: 'user.register' }).update({ action: 'manipuliert' }),
    /append-only/
  );
});

test('Falsches Passwort wird abgelehnt', async () => {
  const res = await post('/api/auth/login', { email, password: 'falsches-passwort' });
  assert.strictEqual(res.status, 401);
});
