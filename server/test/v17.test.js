/** v1.7.0: Funnel-Endpoint (Pipeline-Status über alle Projekte + Kunden-Freigaben). */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');

let server; let baseUrl; let adminCookie; let adrian; let project;

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  [project] = await db('projects').insert({ tenant_id: adrian.tenant_id, name: 'Funnel-Test', referenz: 'PHX-9100', status: 'offen', created_by: 1 }).returning('*');
  await db('applications').insert({ tenant_id: adrian.tenant_id, project_id: project.id, expert_id: adrian.id, status: 'im_gespraech', matching_score: 72 });
  await db('project_releases').insert({ tenant_id: adrian.tenant_id, project_id: project.id, expert_id: adrian.id, anonymized: true, released_by: 1 });
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL || 'admin@phalanx.example', password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026' }),
  });
  adminCookie = login.headers.get('set-cookie');
});

after(async () => { server.close(); await db.destroy(); });

test('Funnel gruppiert nach Pipeline-Status und listet Kunden-Freigaben', async () => {
  const res = await fetch(`${baseUrl}/api/projects/funnel`, { headers: { cookie: adminCookie } });
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.ok(d.stufen.includes('im_gespraech'));
  const karte = d.funnel.im_gespraech.find((k) => k.expert_id === adrian.id);
  assert.ok(karte, 'Adrian steht in "im Gespräch"');
  assert.strictEqual(karte.referenz, 'PHX-9100');
  assert.strictEqual(karte.matching_score, 72);
  assert.ok(d.funnel.beworben.every((k) => k.expert_id !== adrian.id), 'nicht doppelt in anderer Stufe');
  const frei = d.freigegeben_an_kunden.find((r) => r.expert_id === adrian.id && r.project_id === project.id);
  assert.ok(frei, 'Freigabe an Kunden gelistet');

  const anon = await fetch(`${baseUrl}/api/projects/funnel`);
  assert.strictEqual(anon.status, 401, 'nur mit Login');
});

test('Geschlossene Projekte erscheinen nicht im Funnel', async () => {
  await db('projects').where({ id: project.id }).update({ status: 'geschlossen' });
  const d = await (await fetch(`${baseUrl}/api/projects/funnel`, { headers: { cookie: adminCookie } })).json();
  assert.ok((d.funnel.im_gespraech || []).every((k) => k.project_id !== project.id));
  await db('projects').where({ id: project.id }).update({ status: 'offen' });
});
