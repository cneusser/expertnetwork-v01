/**
 * Sprint-2-Tests: Ein-Klick-Bestätigung, Erinnerungs-Job (mit Drosselung),
 * Einladungs-Flow (Art.-14 + Einwilligung), Freshness in der Liste.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { runAvailabilityReminders } = require('../jobs');
const { signPurposeToken } = require('../utils/tokens');
const { app } = require('../index');
const { outbox } = require('../providers/mail/stub');

let server;
let baseUrl;
let adminCookie;
let adrian;

const post = (p, body, headers = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const res = await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  });
  adminCookie = res.headers.get('set-cookie');
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
});

after(async () => {
  server.close();
  await db.destroy();
});

test('Ein-Klick-Bestätigung ohne Login erzeugt neue bestätigte Zeile', async () => {
  const countBefore = await db('availabilities').where({ expert_id: adrian.id }).count('* as c').first();
  const token = signPurposeToken(adrian.id, 'confirm-availability', '7d');
  const ctx = await fetch(`${baseUrl}/api/availability/context?token=${encodeURIComponent(token)}`);
  assert.strictEqual(ctx.status, 200);
  const res = await post('/api/availability/confirm', { token });
  assert.strictEqual(res.status, 200);
  const countAfter = await db('availabilities').where({ expert_id: adrian.id }).count('* as c').first();
  assert.strictEqual(Number(countAfter.c), Number(countBefore.c) + 1);
});

test('Falscher Token-Zweck wird abgelehnt', async () => {
  const wrong = signPurposeToken(adrian.id, 'reset-password', '7d');
  const res = await post('/api/availability/confirm', { token: wrong });
  assert.strictEqual(res.status, 400);
});

test('Erinnerungs-Job: sendet bei veralteter Bestätigung, drosselt Wiederholung', async () => {
  // Bestätigung künstlich altern lassen (23 Tage) — direkt per SQL, da Insert-only.
  await db.raw(`update availabilities set confirmed_at = now() - interval '23 days' where expert_id = ?`, [adrian.id]);
  const r1 = await runAvailabilityReminders();
  assert.strictEqual(r1.sent, 1, 'Ein Reminder versendet');
  assert.ok(outbox.some((m) => m.to === adrian.email && /Verfügbarkeit/.test(m.subject)));
  const r2 = await runAvailabilityReminders();
  assert.strictEqual(r2.sent, 0, 'Zweiter Lauf gedrosselt (14-Tage-Sperre)');
});

test('Einladungs-Flow: Invite-Mail → Einwilligung + Passwort → Login möglich', async () => {
  const res = await post(`/api/experts/${adrian.id}/invite`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const mail = outbox.find((m) => m.to === adrian.email && /Einwilligung/.test(m.subject));
  assert.ok(mail, 'Invite-Mail versendet');
  const token = decodeURIComponent(mail.text.split('token=')[1]);

  const noConsent = await post('/api/auth/accept-invite', { token, password: 'adrian-test-123', consent: false });
  assert.strictEqual(noConsent.status, 400, 'Ohne Einwilligung abgelehnt');

  const ok = await post('/api/auth/accept-invite', { token, password: 'adrian-test-123', consent: true });
  assert.strictEqual(ok.status, 200);

  const consent = await db('consents').where({ user_id: adrian.user_id }).first();
  assert.ok(consent, 'Consent-Record angelegt');

  const login = await post('/api/auth/login', { email: adrian.email, password: 'adrian-test-123' });
  assert.strictEqual(login.status, 200, 'Experte kann sich anmelden');
  const cookie = login.headers.get('set-cookie');

  // Self-Service: Verfügbarkeit aktualisieren
  const self = await post('/api/availability/self', { status: 'teilweise', ab_datum: '2026-08-01', auslastung_prozent: 40 }, { cookie });
  assert.strictEqual(self.status, 201);
});

test('Liste enthält Freshness mit Ampel', async () => {
  const res = await fetch(baseUrl + '/api/experts', { headers: { cookie: adminCookie } });
  const { experts } = await res.json();
  const a = experts.find((e) => e.id === adrian.id);
  assert.ok(a.freshness && typeof a.freshness.score === 'number' && a.freshness.ampel);
});

test('Stats-Endpoint liefert Kennzahlen', async () => {
  const res = await fetch(baseUrl + '/api/experts/stats', { headers: { cookie: adminCookie } });
  assert.strictEqual(res.status, 200);
  const s = await res.json();
  assert.ok(s.gesamt >= 1 && 'verfuegbarJetzt' in s && 'nichtBestaetigt' in s && 'consentFehlt' in s);
});
