/** v1.0.2 + v1.1.0: Experten-Löschung (DSGVO), Kunden-Registrierung, Freigabe, Fristen, Feedback. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');
const { outbox } = require('../providers/mail/stub');

let server;
let baseUrl;
let adminCookie;
let vendorCookie;
let adrian;

const req = (method) => (p, body, headers = {}) =>
  fetch(baseUrl + p, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const post = req('POST');
const put = req('PUT');
const del = req('DELETE');

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  await db('experts').where({ id: adrian.id }).update({ status: 'freigegeben' });
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const res = await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  });
  adminCookie = res.headers.get('set-cookie');
});

after(async () => {
  server.close();
  await db.destroy();
});

test('Experten-Löschung: vollständig weg, Audit anonymisiert, Nachweis vorhanden', async () => {
  const opfer = await db('experts').where({ email: 'tbaugh@mycts.org' }).first();
  assert.ok(opfer, 'Import-Kontakt vorhanden');
  const res = await del(`/api/experts/${opfer.id}`, undefined, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  assert.ok(!(await db('experts').where({ id: opfer.id }).first()), 'Profil gelöscht');
  assert.ok(!(await db('users').where({ id: opfer.user_id }).first()), 'Konto gelöscht');
  const alteAudits = await db('audit_log').where({ resource: 'experts', resource_id: opfer.id });
  assert.ok(alteAudits.every((a) => JSON.stringify(a.new_value_json).includes('DSGVO')), 'Audit anonymisiert');
  assert.ok(await db('audit_log').where({ action: 'expert.dsgvo_delete' }).first(), 'Lösch-Nachweis');
});

test('Kunden-Registrierung → Freigabe-Gate → Admin-Freigabe → Projekt mit Frist', async () => {
  const reg = await post('/api/auth/register-kunde', {
    firmenname: 'Testkunde AG', branche: 'Maschinenbau',
    ansprechpartner: { anrede: 'frau', vorname: 'Eva', nachname: 'Muster', position: 'HR' },
    email: 'kunde-v11@test.example', password: 'kunden-pass-123', consent: true,
  });
  assert.strictEqual(reg.status, 201);

  const mail = outbox.findLast((m) => m.to === 'kunde-v11@test.example');
  const token = decodeURIComponent(mail.text.split('token=')[1]);
  await post('/api/auth/verify', { token });

  const login = await post('/api/auth/login', { email: 'kunde-v11@test.example', password: 'kunden-pass-123' });
  assert.strictEqual(login.status, 200);
  vendorCookie = login.headers.get('set-cookie');

  const blocked = await fetch(`${baseUrl}/api/vendor/projects`, { headers: { cookie: vendorCookie } });
  assert.strictEqual(blocked.status, 403, 'vor Freigabe gesperrt');

  const user = await db('users').where({ email: 'kunde-v11@test.example' }).first();
  const approve = await post(`/api/tenants/vendors/${user.id}/approve`, {}, { cookie: adminCookie });
  assert.strictEqual(approve.status, 200);

  const submit = await post('/api/vendor/projects', {
    name: 'Frist-Testprojekt',
    bewerbungsfrist: new Date(Date.now() - 3600000).toISOString(), // bereits abgelaufen
    auslastung_prozent: 50,
    remote_anteil: 80,
    tagessatz_von_eur: 1300,
    tagessatz_bis_eur: 1600,
  }, { cookie: vendorCookie });
  assert.strictEqual(submit.status, 201);
  const project = (await submit.json()).project;
  assert.match(project.referenz, /^PHX-[0-9A-F]{4}$/, 'Referenz generiert');
  assert.strictEqual(project.gebuehr_modell, 'gu_anteil', 'Gebühren-Default gesetzt');
});

test('Frist abgelaufen → Bewerbung abgelehnt; Kundenfeedback auf Freigabe', async () => {
  const project = await db('projects').where({ name: 'Frist-Testprojekt' }).first();
  await db('projects').where({ id: project.id }).update({ status: 'offen' });

  const bcrypt = require('bcryptjs');
  await db('users').where({ id: adrian.user_id }).update({
    password_hash: await bcrypt.hash('v11-test-pass', 10), email_verified_at: db.fn.now(), is_approved: true,
  });
  const login = await post('/api/auth/login', { email: adrian.email, password: 'v11-test-pass' });
  const expertCookie = login.headers.get('set-cookie');
  const apply = await post(`/api/projects/${project.id}/apply`, {}, { cookie: expertCookie });
  assert.strictEqual(apply.status, 400, 'Frist abgelaufen');
  assert.match((await apply.json()).error, /frist/i);

  const rel = await post(`/api/projects/${project.id}/releases`, { expert_id: adrian.id, anonymized: true }, { cookie: adminCookie });
  const release = (await rel.json()).release;
  const fb = await put(`/api/vendor/projects/${project.id}/releases/${release.id}`, { feedback: 'gespraech_angefragt' }, { cookie: vendorCookie });
  assert.strictEqual(fb.status, 200);
  const detail = await fetch(`${baseUrl}/api/vendor/projects/${project.id}`, { headers: { cookie: vendorCookie } }).then((r) => r.json());
  assert.strictEqual(detail.profiles[0].feedback, 'gespraech_angefragt');
});

test('Gebühren-Defaults einstellbar (Admin)', async () => {
  const putRes = await put('/api/tenants/settings', { gebuehr_modell_default: 'erfolg', gebuehr_prozent_default: 10 }, { cookie: adminCookie });
  assert.strictEqual(putRes.status, 200);
  const get = await fetch(`${baseUrl}/api/tenants/settings`, { headers: { cookie: adminCookie } }).then((r) => r.json());
  assert.strictEqual(get.gebuehr_modell_default, 'erfolg');
  assert.strictEqual(get.gebuehr_prozent_default, 10);
});
