/** Sprint-5-Tests: FTS, Boolean-Syntax, Facetten-/Satzfilter, gespeicherte Suchen. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { toTsQuery } = require('../utils/boolquery');
const { app } = require('../index');

let server;
let baseUrl;
let adminCookie;

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  // Vorherige Testläufe (Sprint 4: Widerruf) zurücksetzen — Suche blendet 'inaktiv' aus.
  await db('experts').where({ email: 'adrian@rethink-interim.ch' }).update({ status: 'freigegeben' });
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
      password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
    }),
  });
  adminCookie = res.headers.get('set-cookie');
});

after(async () => {
  server.close();
  await db.destroy();
});

const search = (qs) => fetch(`${baseUrl}/api/search?${qs}`, { headers: { cookie: adminCookie } }).then((r) => r.json());

test('Boolean-Parser übersetzt korrekt', () => {
  assert.strictEqual(toTsQuery('SAP AND (Interim OR CRO) NOT Automotive'), 'SAP:* & ( Interim:* | CRO:* ) & ! Automotive:*');
  assert.strictEqual(toTsQuery('Turnaround Qualität'), 'Turnaround:* & Qualität:*');
  assert.throws(() => toTsQuery('(SAP AND Interim'), /unausgeglichen/);
});

test('Volltext findet Adrian über Kurzprofil und Skills', async () => {
  const d1 = await search('q=Turnaround');
  assert.ok(d1.results.some((r) => r.nachname === 'Spörri'), 'Treffer über Skill/Profil');
  const d2 = await search('q=Blockchain');
  assert.strictEqual(d2.count, 0, 'kein Treffer für fremden Begriff');
});

test('Boolean: NOT schließt aus', async () => {
  const d = await search(`q=${encodeURIComponent('Turnaround NOT Qualitätsmanagement')}`);
  assert.strictEqual(d.count, 0, 'Adrian hat Qualitätsmanagement → ausgeschlossen');
});

test('Skill-Facette und Satz-Range filtern', async () => {
  const skill = await db('skills').where({ name: 'Qualitätsmanagement' }).first();
  const d1 = await search(`skills=${skill.id}`);
  assert.ok(d1.count >= 1);
  const d2 = await search('satz_min=1400&satz_max=1450');
  assert.ok(d2.results.some((r) => r.nachname === 'Spörri'), 'Range 1300–1500 überschneidet 1400–1450');
  const d3 = await search('satz_min=2000');
  assert.strictEqual(d3.count, 0);
});

test('Suche nur für Admin', async () => {
  const anon = await fetch(`${baseUrl}/api/search?q=x`);
  assert.strictEqual(anon.status, 401);
});

test('Gespeicherte Suchen: anlegen, laden, löschen', async () => {
  const create = await fetch(`${baseUrl}/api/search/saved`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ name: 'QM verfügbar', params: { q: 'Qualitätsmanagement', verfuegbar: 'jetzt' } }),
  });
  assert.strictEqual(create.status, 201);
  const { search: saved } = await create.json();
  const list = await fetch(`${baseUrl}/api/search/saved`, { headers: { cookie: adminCookie } }).then((r) => r.json());
  assert.ok(list.searches.some((s) => s.id === saved.id));
  const del = await fetch(`${baseUrl}/api/search/saved/${saved.id}`, { method: 'DELETE', headers: { cookie: adminCookie } });
  assert.strictEqual(del.status, 200);
});

test('Birdview: Admin schaltet in Experten-Sicht und zurück (auditiert)', async () => {
  const adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  const start = await fetch(`${baseUrl}/api/auth/impersonate/${adrian.user_id}`, {
    method: 'POST', headers: { cookie: adminCookie },
  });
  assert.strictEqual(start.status, 200);
  const expertCookie = start.headers.get('set-cookie');

  const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: expertCookie } }).then((r) => r.json());
  assert.strictEqual(me.user.role, 'expert');
  assert.strictEqual(me.user.impersonated, true);

  // In der Experten-Sicht kein Admin-Zugriff
  const denied = await fetch(`${baseUrl}/api/audit`, { headers: { cookie: expertCookie } });
  assert.strictEqual(denied.status, 403);

  const stop = await fetch(`${baseUrl}/api/auth/stop-impersonate`, { method: 'POST', headers: { cookie: expertCookie } });
  assert.strictEqual(stop.status, 200);
  const backCookie = stop.headers.get('set-cookie');
  const meBack = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: backCookie } }).then((r) => r.json());
  assert.strictEqual(meBack.user.role, 'admin');

  const audits = await db('audit_log').whereIn('action', ['auth.birdview_start', 'auth.birdview_stop']);
  assert.ok(audits.length >= 2, 'Start und Stop auditiert');
});

test('Experte kann Birdview nicht selbst starten', async () => {
  const adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  const start = await fetch(`${baseUrl}/api/auth/impersonate/${adrian.user_id}`, {
    method: 'POST', headers: { cookie: adminCookie },
  });
  const expertCookie = start.headers.get('set-cookie');
  const tryImp = await fetch(`${baseUrl}/api/auth/impersonate/${adrian.user_id}`, {
    method: 'POST', headers: { cookie: expertCookie },
  });
  assert.strictEqual(tryImp.status, 403);
});

test('Skill-Änderung aktualisiert den Suchindex (Trigger)', async () => {
  const adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  let [skill] = await db('skills').insert({ name: 'Wasserstofftechnik', kategorie: 'kompetenz' }).returning('*');
  await db('expert_skills').insert({ expert_id: adrian.id, skill_id: skill.id });
  const d = await search('q=Wasserstofftechnik');
  assert.ok(d.results.some((r) => r.id === adrian.id), 'neuer Skill sofort auffindbar');
});
