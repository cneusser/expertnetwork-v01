/** v1.5.0: PPTX-Beraterprofile (einzeln, Sammelprofil, Hidden-Link mit Freigabe-Schranke), PDF-Inline-View. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');

let server; let baseUrl; let adminCookie; let adrian; let project;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const isPptx = (buf) => buf[0] === 0x50 && buf[1] === 0x4b; // ZIP-Magic (PK)

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  await db('experts').where({ id: adrian.id }).update({ status: 'freigegeben' });
  [project] = await db('projects').insert({ tenant_id: adrian.tenant_id, name: 'PPTX-Test Carve-out', referenz: 'PHX-9001', status: 'offen', created_by: 1 }).returning('*');
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  })).headers.get('set-cookie');
});

after(async () => { server.close(); await db.destroy(); });

test('Einzelprofil als PPTX (Admin): gültige Datei mit richtigem Content-Type', async () => {
  const res = await fetch(`${baseUrl}/api/experts/${adrian.id}/profil-pptx`, { headers: { cookie: adminCookie } });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /presentationml/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(isPptx(buf) && buf.length > 5000, 'PPTX-Datei plausibel');
  // Ohne Login kein Zugriff
  const anon = await fetch(`${baseUrl}/api/experts/${adrian.id}/profil-pptx`);
  assert.strictEqual(anon.status, 401);
});

test('Sammelprofil je Projekt: erst nach Freigabe von Profilen möglich', async () => {
  // Ohne Freigaben → 400 mit Hinweis
  const leer = await fetch(`${baseUrl}/api/projects/${project.id}/profile-pptx`, { headers: { cookie: adminCookie } });
  assert.strictEqual(leer.status, 400);

  // Profil freigeben (anonymisiert) → PPTX kommt
  await db('project_releases').insert({ tenant_id: adrian.tenant_id, project_id: project.id, expert_id: adrian.id, anonymized: true, released_by: 1 });
  const res = await fetch(`${baseUrl}/api/projects/${project.id}/profile-pptx`, { headers: { cookie: adminCookie } });
  assert.strictEqual(res.status, 200);
  assert.ok(isPptx(Buffer.from(await res.arrayBuffer())));
});

test('Hidden-Link: PPTX nur über gültigen Token, nur freigegebene Profile', async () => {
  const share = await post(`/api/projects/${project.id}/share`, { gueltig_tage: 7 }, { cookie: adminCookie });
  assert.strictEqual(share.status, 201);
  const { link } = await share.json();

  const res = await fetch(`${baseUrl}/api/public/share/${link.token}/pptx`);
  assert.strictEqual(res.status, 200, 'Dritter erhält PPTX über den Freigabe-Link');
  assert.ok(isPptx(Buffer.from(await res.arrayBuffer())));

  const falsch = await fetch(`${baseUrl}/api/public/share/kein-echter-token/pptx`);
  assert.strictEqual(falsch.status, 404, 'ungültiger Token → kein Zugriff');
});

test('Dokumenten-Tresor: Ansehen (inline) liefert PDF ohne attachment-Disposition', async () => {
  const doc = await db('documents').where({ expert_id: adrian.id }).first();
  assert.ok(doc, 'Adrian hat Tresor-Dokumente');
  const res = await fetch(`${baseUrl}/api/experts/${adrian.id}/documents/${doc.id}/view`, { headers: { cookie: adminCookie } });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /^inline/);
  const anon = await fetch(`${baseUrl}/api/experts/${adrian.id}/documents/${doc.id}/view`);
  assert.strictEqual(anon.status, 401);
});
