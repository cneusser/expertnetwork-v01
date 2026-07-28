/** v1.12.0: Match-Alerts, Funnel-Kennzahlen, Einladungs-Lebenszyklus mit Auto-Löschung. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');
const { runInviteLifecycle } = require('../jobs');

let server; let baseUrl; let adminCookie; let adrian;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const put = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  await db('experts').where({ id: adrian.id }).update({ status: 'freigegeben' });
  // Aktive Einwilligung für Adrian (Voraussetzung für Match-Alerts)
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

after(async () => { server.close(); await db.destroy(); });

test('Match-Alert: Projekt öffnen benachrichtigt passende Experten genau einmal', async () => {
  // Projekt mit Adrians Top-Skills anlegen (Entwurf), dann öffnen
  const skillIds = await db('expert_skills').where({ expert_id: adrian.id }).pluck('skill_id');
  const create = await post('/api/projects', {
    name: 'Alert-Test Interim QM', beschreibung: 'Test', skill_ids: skillIds.slice(0, 8),
  }, { cookie: adminCookie });
  assert.strictEqual(create.status, 201);
  const { project } = await create.json();

  const open1 = await put(`/api/projects/${project.id}`, { status: 'offen' }, { cookie: adminCookie });
  assert.strictEqual(open1.status, 200);
  await new Promise((r) => setTimeout(r, 400)); // Alerts laufen asynchron

  const alert = await db('match_alerts').where({ project_id: project.id, expert_id: adrian.id }).first();
  assert.ok(alert, 'Alert-Dedupe-Eintrag vorhanden');
  assert.ok(alert.score >= 60, `Schwelle erreicht (${alert.score})`);
  const mail = await db('mail_outbox').where({ to_email: adrian.email, template_key: 'projekt_match' }).first();
  assert.ok(mail, 'Match-Mail in der Outbox');
  assert.ok(!mail.body_html.includes('—'), 'keine Gedankenstriche');

  // Erneut schließen und öffnen → keine zweite Mail (Dedupe)
  await put(`/api/projects/${project.id}`, { status: 'entwurf' }, { cookie: adminCookie });
  await put(`/api/projects/${project.id}`, { status: 'offen' }, { cookie: adminCookie });
  await new Promise((r) => setTimeout(r, 400));
  const mails = await db('mail_outbox').where({ to_email: adrian.email, template_key: 'projekt_match' });
  assert.strictEqual(mails.length, 1, 'keine Doppelmeldung');
});

test('Funnel: Verweildauer, Stagnation und Conversion-Kennzahlen', async () => {
  const [p] = await db('projects').insert({ tenant_id: adrian.tenant_id, name: 'Funnel-KPI-Test', status: 'offen', created_by: 1 }).returning('*');
  const [a] = await db('applications').insert({
    tenant_id: adrian.tenant_id, project_id: p.id, expert_id: adrian.id, status: 'im_gespraech',
    stage_changed_at: new Date(Date.now() - 40 * 86400000), // 40 Tage alt → stagnant
  }).returning('*');

  const d = await (await fetch(`${baseUrl}/api/projects/funnel`, { headers: { cookie: adminCookie } })).json();
  const karte = d.funnel.im_gespraech.find((k) => k.id === a.id);
  assert.ok(karte.tage_in_stufe >= 39, 'Verweildauer berechnet');
  assert.strictEqual(karte.stagnant, true, 'Stagnation markiert (> 30 Tage)');
  assert.ok(d.reached.vorgeschlagen >= d.reached.im_gespraech, 'Conversion monoton');
  assert.ok(d.counts.im_gespraech >= 1);

  // Board-Aktion: Status + nächster Schritt; stage_changed_at springt auf jetzt
  const upd = await post(`/api/projects/funnel/${a.id}`, { status: 'angeboten', next_step: 'Vertrag senden' }, { cookie: adminCookie });
  assert.strictEqual(upd.status, 200);
  const nach = await db('applications').where({ id: a.id }).first();
  assert.strictEqual(nach.status, 'angeboten');
  assert.strictEqual(nach.next_step, 'Vertrag senden');
  assert.ok(Date.now() - new Date(nach.stage_changed_at).getTime() < 60000, 'Verweildauer neu gestartet');
});

test('Lebenszyklus: Bestandskontakte anschreiben, erinnern (Tag 7), löschen (Tag 14)', async () => {
  const malz = await db('experts').where({ email: 'g.malzkorn@malzkorn-mc.de' }).first();
  assert.strictEqual(malz.status, 'eingeladen');

  // Einmalaktion: Nachfass + Zyklusstart
  const start = await post('/api/experts/invite-zyklus-start', {}, { cookie: adminCookie });
  assert.strictEqual(start.status, 200);
  const d1 = await start.json();
  assert.ok(d1.angeschrieben >= 1, 'Bestandskontakte angeschrieben');
  const nachfass = await db('mail_outbox').where({ to_email: malz.email, template_key: 'einladung_bestand_nachfass' }).first();
  assert.ok(nachfass, 'Nachfass-Mail in der Outbox');
  assert.ok(!nachfass.body_html.includes('—'), 'keine Gedankenstriche');

  // Zweiter Aufruf: niemand doppelt (alle stecken im Zyklus)
  const d2 = await (await post('/api/experts/invite-zyklus-start', {}, { cookie: adminCookie })).json();
  assert.strictEqual(d2.angeschrieben, 0, 'keine Doppelmails');

  // Tag 8 simulieren → genau eine Erinnerung
  await db('experts').where({ id: malz.id }).update({ invite_cycle_started_at: new Date(Date.now() - 8 * 86400000) });
  const r1 = await runInviteLifecycle();
  assert.ok(r1.erinnert >= 1, 'Erinnerung verschickt');
  const erinnerung = await db('mail_outbox').where({ to_email: malz.email, template_key: 'einladung_erinnerung' });
  assert.strictEqual(erinnerung.length, 1);
  const r2 = await runInviteLifecycle();
  const erinnerung2 = await db('mail_outbox').where({ to_email: malz.email, template_key: 'einladung_erinnerung' });
  assert.strictEqual(erinnerung2.length, 1, 'keine erneute Erinnerung am selben Tag');

  // Tag 15 simulieren → DSGVO-Löschung samt Konto und Lösch-Nachweis
  await db('experts').where({ id: malz.id }).update({ invite_cycle_started_at: new Date(Date.now() - 15 * 86400000) });
  const r3 = await runInviteLifecycle();
  assert.ok(r3.geloescht >= 1, 'gelöscht');
  assert.strictEqual(await db('experts').where({ id: malz.id }).first(), undefined, 'Profil weg');
  assert.strictEqual(await db('users').where({ id: malz.user_id }).first(), undefined, 'Konto weg');
  const nachweis = await db('audit_log').where({ action: 'expert.dsgvo_delete' }).orderBy('id', 'desc').first();
  assert.match(nachweis.new_value_json.grund || JSON.parse(JSON.stringify(nachweis.new_value_json)).grund, /automatische/i);
});

test('Neue Einladung startet den Zyklus "neu" automatisch', async () => {
  await post('/api/experts/invite-neu', { vorname: 'Zita', nachname: 'Zyklus', email: 'zita@zyklus.example' }, { cookie: adminCookie });
  const zita = await db('experts').where({ email: 'zita@zyklus.example' }).first();
  assert.strictEqual(zita.invite_zyklus, 'neu');
  assert.ok(zita.invite_cycle_started_at, 'Zyklusstart gesetzt');

  // Tag 22: zwei Erinnerungen fällig (Tag 7 + 21), aber erst Stufe zählen
  await db('experts').where({ id: zita.id }).update({ invite_cycle_started_at: new Date(Date.now() - 22 * 86400000) });
  await runInviteLifecycle();
  const z = await db('experts').where({ id: zita.id }).first();
  assert.strictEqual(z.invite_reminders_sent, 2, 'beide Erinnerungsstufen erfasst');
  // Tag 29 → Löschung
  await db('experts').where({ id: zita.id }).update({ invite_cycle_started_at: new Date(Date.now() - 29 * 86400000) });
  const r = await runInviteLifecycle();
  assert.ok(r.geloescht >= 1);
  assert.strictEqual(await db('experts').where({ id: zita.id }).first(), undefined);
});
