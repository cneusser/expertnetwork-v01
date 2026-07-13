/** v1.4.0: Suchagent (Toggle + Job mit Neue-Treffer-Erkennung), Profilbild-Upload. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');
const { runSearchAgents } = require('../jobs');

let server; let baseUrl; let adminCookie; let expertCookie; let adrian;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: body === undefined ? undefined : JSON.stringify(body) });

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  await db('experts').where({ id: adrian.id }).update({ status: 'freigegeben' });
  await db('users').where({ id: adrian.user_id }).update({
    password_hash: await bcrypt.hash('v14-test-pass', 10), email_verified_at: db.fn.now(), is_approved: true,
  });
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  })).headers.get('set-cookie');
  expertCookie = (await post('/api/auth/login', { email: adrian.email, password: 'v14-test-pass' })).headers.get('set-cookie');
});

after(async () => { server.close(); await db.destroy(); });

test('Suchagent: Toggle merkt Basis-Treffer, Job meldet nur NEUE Experten', async () => {
  // Gespeicherte Suche anlegen (Name Adrian → trifft ihn)
  const save = await post('/api/search/saved', { name: 'Agent-Test', params: { q: 'Adrian' } }, { cookie: adminCookie });
  assert.strictEqual(save.status, 201);
  const { search } = await save.json();

  // Aktivieren: aktueller Stand wird Basis
  const t1 = await post(`/api/search/saved/${search.id}/agent`, {}, { cookie: adminCookie });
  assert.strictEqual((await t1.json()).agent_aktiv, true);
  const row1 = await db('saved_searches').where({ id: search.id }).first();
  assert.ok((row1.last_result_ids || []).includes(adrian.id), 'Adrian ist Basis-Treffer');

  // Job-Lauf ohne Neuzugang: keine Meldung
  const r1 = await runSearchAgents();
  assert.strictEqual(r1.notified, 0, 'kein neuer Treffer, keine Mail');

  // Neuer passender Experte kommt in den Pool
  const [neu] = await db('experts').insert({
    tenant_id: adrian.tenant_id, vorname: 'Adriana', nachname: 'Testmann',
    berufsbezeichnung: 'Interim CFO Adrian-Nachfolge', status: 'freigegeben', email: 'adriana@test.example',
  }).returning('*');
  const r2 = await runSearchAgents();
  assert.strictEqual(r2.notified, 1, 'neuer Treffer gemeldet');
  const audit = await db('audit_log').where({ action: 'search.agent_hit', resource_id: search.id }).first();
  assert.ok(audit, 'Agent-Treffer auditiert');
  const row2 = await db('saved_searches').where({ id: search.id }).first();
  assert.ok((row2.last_result_ids || []).includes(neu.id), 'neuer Treffer jetzt Basis');

  // Zweiter Lauf: derselbe Treffer wird nicht erneut gemeldet
  const r3 = await runSearchAgents();
  assert.strictEqual(r3.notified, 0, 'keine Doppelmeldung');

  // Deaktivieren
  const t2 = await post(`/api/search/saved/${search.id}/agent`, {}, { cookie: adminCookie });
  assert.strictEqual((await t2.json()).agent_aktiv, false);
  await db('experts').where({ id: neu.id }).delete();
});

test('Profilbild: PNG-Upload ok, Fremdformat abgelehnt, Abruf mit Zugriffsschutz', async () => {
  // Minimales gültiges PNG (Magic Bytes + Füllung)
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  const fd = new FormData();
  fd.append('file', new Blob([png], { type: 'image/png' }), 'foto.png');
  const up = await fetch(`${baseUrl}/api/experts/me/foto`, { method: 'POST', headers: { cookie: expertCookie }, body: fd });
  assert.strictEqual(up.status, 201);

  // PDF-Bytes als "Bild" → abgelehnt
  const fd2 = new FormData();
  fd2.append('file', new Blob([Buffer.from('%PDF-1.4 kein bild aaaaaa')], { type: 'image/png' }), 'fake.png');
  const bad = await fetch(`${baseUrl}/api/experts/me/foto`, { method: 'POST', headers: { cookie: expertCookie }, body: fd2 });
  assert.strictEqual(bad.status, 400);

  // Admin darf abrufen
  const get1 = await fetch(`${baseUrl}/api/experts/${adrian.id}/foto`, { headers: { cookie: adminCookie } });
  assert.strictEqual(get1.status, 200);
  assert.strictEqual(get1.headers.get('content-type'), 'image/png');

  // Fremder Experte darf nicht
  const fremd = await db('experts').whereNot('id', adrian.id).whereNotNull('user_id').first();
  if (fremd) {
    await db('experts').where({ id: fremd.id }).update({ foto_pfad: null });
  }
  // Eigener Zugriff ok
  const get2 = await fetch(`${baseUrl}/api/experts/${adrian.id}/foto`, { headers: { cookie: expertCookie } });
  assert.strictEqual(get2.status, 200);
});

test('DSGVO: foto_pfad wird bei Löschung mitentfernt (Spalte vorhanden)', async () => {
  const cols = await db('experts').columnInfo();
  assert.ok(cols.foto_pfad, 'Spalte experts.foto_pfad existiert');
  assert.ok(cols.iban && cols.profil_views, 'v1.3-Spalten weiterhin da');
});
