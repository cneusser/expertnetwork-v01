/** v1.19.0: Skill-Verwaltung — Sammelfreigabe, Umbenennen, Merge, Löschen. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');

let server; let baseUrl; let adminCookie;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });

before(async () => {
  await db.migrate.latest();
  await seed();
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  })).headers.get('set-cookie');
});

after(async () => { server.close(); await db.destroy(); });

test('Sammelfreigabe, Umbenennen, Merge und Löschen der Skill-Taxonomie', async () => {
  const [ex] = await db('experts').insert({ tenant_id: 1, vorname: 'Skill', nachname: 'Test', email: 'skill@test.example', status: 'freigegeben' }).returning('*');
  const [a] = await db('skills').insert({ name: 'Change Management', kategorie: 'kompetenz', is_approved: false }).returning('*');
  const [b] = await db('skills').insert({ name: 'Change-Management', kategorie: 'kompetenz', is_approved: false }).returning('*');
  await db('expert_skills').insert([{ expert_id: ex.id, skill_id: a.id }, { expert_id: ex.id, skill_id: b.id }]);

  // Liste mit Verwendungszähler
  const liste = await (await fetch(`${baseUrl}/api/skills`, { headers: { cookie: adminCookie } })).json();
  assert.strictEqual(liste.skills.find((s) => s.id === a.id).verwendungen, 1);

  // Sammelfreigabe
  const frei = await post('/api/skills/freigeben-alle', {}, { cookie: adminCookie });
  assert.strictEqual(frei.status, 200);
  assert.ok((await frei.json()).anzahl >= 2);
  assert.strictEqual((await db('skills').where({ id: a.id }).first()).is_approved, true);

  // Umbenennen; Kollision wird abgewiesen
  assert.strictEqual((await fetch(`${baseUrl}/api/skills/${a.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ name: 'Change-Management' }),
  })).status, 409);
  const um = await fetch(`${baseUrl}/api/skills/${a.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ name: 'Change Management (Lead)', kategorie: 'rolle' }),
  });
  assert.strictEqual(um.status, 200);

  // Merge: b geht in a auf
  const merge = await post(`/api/skills/${b.id}/merge`, { ziel_id: a.id }, { cookie: adminCookie });
  assert.strictEqual(merge.status, 200);
  assert.strictEqual(await db('skills').where({ id: b.id }).first(), undefined, 'Quelle entfernt');
  assert.strictEqual((await db('expert_skills').where({ expert_id: ex.id })).length, 1, 'Zuordnung zusammengeführt');

  // Löschen
  assert.strictEqual((await fetch(`${baseUrl}/api/skills/${a.id}`, { method: 'DELETE', headers: { cookie: adminCookie } })).status, 200);
  assert.strictEqual((await db('expert_skills').where({ expert_id: ex.id })).length, 0);
  assert.strictEqual((await fetch(`${baseUrl}/api/skills`)).status, 401);
});
