/** v1.2.0: öffentliche Projektseite, Bewerbung ohne Konto, Hidden-Link + PDF. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');

let server;
let baseUrl;
let adminCookie;
let projekt;
let shareToken;

const post = (p, body, headers = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  const adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  await db('experts').where({ id: adrian.id }).update({ status: 'freigegeben' });
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const res = await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  });
  adminCookie = res.headers.get('set-cookie');
  const create = await post('/api/projects', {
    name: 'Öffentliches Testmandat', beschreibung: 'Turnaround-Begleitung.', status: 'offen',
    tagessatz_von_eur: 1200, tagessatz_bis_eur: 1500, gebuehr_modell: 'gu_anteil', gebuehr_prozent: 20,
  }, { cookie: adminCookie });
  projekt = (await create.json()).project;
  await post(`/api/projects/${projekt.id}/releases`, {
    expert_id: adrian.id, anonymized: true,
  }, { cookie: adminCookie });
});

after(async () => {
  server.close();
  await db.destroy();
});

test('Öffentliche Projektseite: Whitelist-Felder, keine Interna', async () => {
  const d = await fetch(`${baseUrl}/api/public/projects/${projekt.referenz}`).then((r) => r.json());
  assert.strictEqual(d.project.name, 'Öffentliches Testmandat');
  assert.ok(!('budget_eur' in d.project) && !('vendor_id' in d.project) && !('id' in d.project), 'keine internen Felder');
  assert.strictEqual(d.project.gebuehr_prozent, 20);
});

test('Bewerbung ohne Konto legt Experte, Satz, Verfügbarkeit und Bewerbung an', async () => {
  const fd = new FormData();
  fd.append('vorname', 'Petra');
  fd.append('nachname', 'Beispiel');
  fd.append('email', 'petra.beispiel@test.example');
  fd.append('tagessatz', '1400');
  fd.append('verfuegbar_ab', '2026-09-01');
  fd.append('referenzprojekte', 'Projekt A: Turnaround Maschinenbau. Projekt B: PMI Automotive.');
  fd.append('consent', 'true');
  const res = await fetch(`${baseUrl}/api/public/projects/${projekt.referenz}/apply`, { method: 'POST', body: fd });
  assert.strictEqual(res.status, 201);

  const expert = await db('experts').where({ email: 'petra.beispiel@test.example' }).first();
  assert.ok(expert && expert.status === 'eingeladen');
  assert.ok(await db('rates').where({ expert_id: expert.id }).first(), 'Satz erfasst');
  assert.ok(await db('applications').where({ expert_id: expert.id, project_id: projekt.id }).first(), 'Bewerbung da');
  assert.ok(await db('consents').where({ user_id: expert.user_id }).first(), 'Einwilligung dokumentiert');

  const again = await fetch(`${baseUrl}/api/public/projects/${projekt.referenz}/apply`, { method: 'POST', body: fd });
  assert.strictEqual(again.status, 409, 'Doppelbewerbung abgefangen');
});

test('Hidden-Link: erzeugen, anonym abrufen, Zähler, PDF, Widerruf', async () => {
  const create = await post(`/api/projects/${projekt.id}/share`, { gueltig_tage: 14 }, { cookie: adminCookie });
  assert.strictEqual(create.status, 201);
  const link = (await create.json()).link;
  shareToken = link.token;

  const view = await fetch(`${baseUrl}/api/public/share/${shareToken}`).then((r) => r.json());
  assert.strictEqual(view.project.name, 'Öffentliches Testmandat');
  assert.strictEqual(view.profiles.length, 1);
  assert.match(view.profiles[0].anzeige_name, /^Experte [A-Z]$/, 'anonymisiert');
  assert.ok(!JSON.stringify(view.profiles).includes('Spörri'), 'kein Klarname');

  const after1 = await db('share_links').where({ id: link.id }).first();
  assert.strictEqual(after1.zugriffe, 1, 'Zugriff gezählt');

  const pdf = await fetch(`${baseUrl}/api/public/share/${shareToken}/pdf`);
  assert.strictEqual(pdf.status, 200);
  assert.match(pdf.headers.get('content-type'), /application\/pdf/);
  const buf = Buffer.from(await pdf.arrayBuffer());
  assert.strictEqual(buf.subarray(0, 4).toString(), '%PDF', 'echtes PDF');
  assert.ok(buf.length > 2000, 'PDF mit Inhalt');

  const revoke = await fetch(`${baseUrl}/api/projects/${projekt.id}/share/${link.id}`, { method: 'DELETE', headers: { cookie: adminCookie } });
  assert.strictEqual(revoke.status, 200);
  const gone = await fetch(`${baseUrl}/api/public/share/${shareToken}`);
  assert.strictEqual(gone.status, 404, 'widerrufener Link tot');
});
