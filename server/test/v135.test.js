/**
 * v1.35.0 — Niemand soll mehr vor der Wand stehen.
 *
 * Der Anlass war ein echter Fall: Jemand wurde über LinkedIn angesprochen,
 * hatte ein Konto aus dem Einladungs-Upload, aber nie ein Passwort. Auf der
 * Anmeldeseite las er "E-Mail oder Passwort falsch" und wusste nicht weiter.
 * Von den eingeladenen Kontakten geht es 185 Menschen genauso, sobald sie es
 * versuchen.
 * Alle Namen sind erfunden.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const { CONSENT_ZWECK, CONSENT_VERSION, consentExpiry } = require('../consent');

let server; let baseUrl; let adminCookie; let tenantId;
let eingeladen; let mitPasswort;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const get = (p, h = {}) => fetch(baseUrl + p, { headers: h });
const seit = (n) => new Date(Date.now() - n * 86400000);

/** So entsteht ein eingeladener Kontakt: Konto mit Zufallspasswort, kein Consent. */
async function ladeEin(vorname, nachname, tage = 10) {
  const bcrypt = require('bcryptjs');
  const [u] = await db('users').insert({
    tenant_id: tenantId, email: `${vorname}.${nachname}@v135.example`.toLowerCase(),
    role: 'expert', is_approved: false, created_at: seit(tage),
    password_hash: await bcrypt.hash(require('crypto').randomBytes(24).toString('hex'), 10),
  }).returning('*');
  const [e] = await db('experts').insert({
    tenant_id: tenantId, user_id: u.id, vorname, nachname, email: u.email,
    status: 'eingeladen', invite_cycle_started_at: seit(tage), vorreg_prio: 'A',
    vorreg_angeschrieben_am: seit(tage).toISOString().slice(0, 10),
  }).returning('*');
  return { user: u, expert: e };
}

before(async () => {
  await db.migrate.latest();
  await seed();
  tenantId = (await db('tenants').where({ slug: 'phalanx' }).first()).id;
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  })).headers.get('set-cookie');

  eingeladen = await ladeEin('Roland', 'Habermeier', 12);

  // Zum Vergleich: jemand, der die Einladung angenommen hat und drin ist.
  mitPasswort = await ladeEin('Wiebke', 'Sonnleitner', 30);
  await db('consents').insert({
    tenant_id: tenantId, user_id: mitPasswort.user.id, zweck: CONSENT_ZWECK,
    text_version: CONSENT_VERSION, expires_at: consentExpiry(),
  });
  await db('audit_log').insert([
    { tenant_id: tenantId, actor_id: mitPasswort.user.id, action: 'auth.accept_invite', resource: 'users', resource_id: mitPasswort.user.id },
    { tenant_id: tenantId, actor_id: mitPasswort.user.id, action: 'auth.login', resource: 'users', resource_id: mitPasswort.user.id },
  ]);
});

after(async () => { server.close(); await db.destroy(); });

test('Wer eingeladen ist und nie eingewilligt hat, bekommt die Einladung statt eines Resets', async () => {
  const marke = Number((await db('mail_outbox').max('id as m').first()).m || 0);

  const res = await post('/api/auth/forgot-password', { email: eingeladen.user.email });
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.match(d.message, /Falls die Adresse existiert/, 'die Antwort verrät nicht, ob es das Konto gibt');

  const mail = await db('mail_outbox').where('id', '>', marke)
    .where({ to_email: eingeladen.user.email }).first();
  assert.ok(mail, 'es geht etwas raus');
  assert.strictEqual(mail.template_key, 'einladung_bestand',
    'die Einladung, nicht der Passwort-Reset, denn nur so kommt die Einwilligung zustande');
  assert.ok(await db('audit_log').where({ action: 'auth.einladung_statt_reset', resource_id: eingeladen.user.id }).first());
});

test('Wer schon eingewilligt hat, bekommt weiterhin den Passwort-Reset', async () => {
  const marke = Number((await db('mail_outbox').max('id as m').first()).m || 0);
  await post('/api/auth/forgot-password', { email: mitPasswort.user.email });

  const mail = await db('mail_outbox').where('id', '>', marke)
    .where({ to_email: mitPasswort.user.email }).first();
  assert.ok(mail);
  assert.strictEqual(mail.template_key, 'reset-password');
});

test('Eine unbekannte Adresse verrät sich nicht und löst nichts aus', async () => {
  const marke = Number((await db('mail_outbox').max('id as m').first()).m || 0);
  const res = await post('/api/auth/forgot-password', { email: 'gibtsnicht@v135.example' });
  assert.strictEqual(res.status, 200);
  assert.match((await res.json()).message, /Falls die Adresse existiert/);
  assert.strictEqual(await db('mail_outbox').where('id', '>', marke).first(), undefined);
});

test('Die Übersicht zeigt, wer feststeckt, und wer nicht', async () => {
  const d = await (await get('/api/experts/haengen-fest', { cookie: adminCookie })).json();
  const namen = d.kontakte.map((k) => k.nachname);

  assert.ok(namen.includes('Habermeier'), 'der Feststeckende ist dabei');
  assert.ok(!namen.includes('Sonnleitner'), 'wer angenommen hat und sich anmeldet, nicht');

  const roland = d.kontakte.find((k) => k.nachname === 'Habermeier');
  assert.strictEqual(roland.passwort_gesetzt, false);
  assert.strictEqual(roland.jemals_angemeldet, false);
  assert.strictEqual(roland.wartet_tage, 12, 'die Wartezeit steht dabei');
  assert.strictEqual(roland.konto_email, eingeladen.user.email);
  assert.strictEqual(roland.password_hash, undefined, 'der Hash geht nie nach außen');

  assert.ok(d.zahlen.gesamt >= 1);
  assert.strictEqual(d.zahlen.ohne_passwort, d.kontakte.filter((k) => !k.passwort_gesetzt).length);
  assert.strictEqual((await get('/api/experts/haengen-fest')).status, 401);
});

test('Sammelaktion lädt erneut ein und überspringt, wer schon drin ist', async () => {
  const marke = Number((await db('mail_outbox').max('id as m').first()).m || 0);

  const res = await post('/api/experts/erneut-einladen',
    { ids: [eingeladen.expert.id, mitPasswort.expert.id] }, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const d = await res.json();

  assert.strictEqual(d.verschickt.length, 1);
  assert.strictEqual(d.verschickt[0].email, eingeladen.user.email);
  assert.strictEqual(d.uebersprungen.length, 1);
  assert.match(d.uebersprungen[0].grund, /eingewilligt/);

  const raus = await db('mail_outbox').where('id', '>', marke).pluck('to_email');
  assert.ok(raus.includes(eingeladen.user.email));
  assert.ok(!raus.includes(mitPasswort.user.email));

  assert.strictEqual((await post('/api/experts/erneut-einladen', { ids: [] }, { cookie: adminCookie })).status, 400);
  assert.strictEqual((await post('/api/experts/erneut-einladen', { ids: [eingeladen.expert.id] })).status, 401);
  assert.ok(await db('audit_log').where({ action: 'expert.erneut_eingeladen' }).first());
});

test('Der ganze Weg: eingeladen, Zugang anfordern, annehmen, anmelden', async () => {
  const neu = await ladeEin('Gudrun', 'Lindenthal', 5);

  // Sie kann sich nicht anmelden, sie hat ja nie ein Passwort vergeben.
  const versuch = await post('/api/auth/login', { email: neu.user.email, password: 'geraten-1234' });
  assert.strictEqual(versuch.status, 401);

  // Also fordert sie den Zugang an und bekommt die Einladung.
  const marke = Number((await db('mail_outbox').max('id as m').first()).m || 0);
  await post('/api/auth/forgot-password', { email: neu.user.email });
  const mail = await db('mail_outbox').where('id', '>', marke).where({ to_email: neu.user.email }).first();
  assert.strictEqual(mail.template_key, 'einladung_bestand');

  // Über die Einladung vergibt sie Passwort und Einwilligung in einem Schritt.
  const { signPurposeToken } = require('../utils/tokens');
  const token = signPurposeToken(neu.user.id, 'expert-invite', '14d');
  const angenommen = await post('/api/auth/accept-invite',
    { token, password: 'ein-gutes-passwort-2026', consent: true });
  assert.strictEqual(angenommen.status, 200);

  // Und jetzt kommt sie hinein.
  const anmeldung = await post('/api/auth/login', { email: neu.user.email, password: 'ein-gutes-passwort-2026' });
  assert.strictEqual(anmeldung.status, 200, 'der Kreis schließt sich');

  // Und sie taucht nicht mehr in der Liste der Feststeckenden auf.
  const d = await (await get('/api/experts/haengen-fest', { cookie: adminCookie })).json();
  assert.ok(!d.kontakte.some((k) => k.nachname === 'Lindenthal'));
});
