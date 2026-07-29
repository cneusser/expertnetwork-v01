/** v1.13.0: Self-Service komplett — eigener Dokumenten-Upload, Skill-Vorschläge, eigenes PPTX. */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');

let server; let baseUrl; let adminCookie; let expertCookie; let adrian;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
  adrian = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  await db('experts').where({ id: adrian.id }).update({ status: 'freigegeben' });
  await db('users').where({ id: adrian.user_id }).update({
    password_hash: await bcrypt.hash('v113-test-pass', 10), email_verified_at: db.fn.now(), is_approved: true,
  });
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  })).headers.get('set-cookie');
  expertCookie = (await post('/api/auth/login', { email: adrian.email, password: 'v113-test-pass' })).headers.get('set-cookie');
});

after(async () => { server.close(); await db.destroy(); });

test('Experte lädt eigenes Dokument hoch: PDF ok mit Version, Fake-PDF abgelehnt', async () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
  const fd = new FormData();
  fd.append('kategorie', 'zertifikat');
  fd.append('file', new Blob([pdf], { type: 'application/pdf' }), 'zert.pdf');
  const res = await fetch(`${baseUrl}/api/experts/me/documents`, { method: 'POST', headers: { cookie: expertCookie }, body: fd });
  assert.strictEqual(res.status, 201);
  const { document: doc } = await res.json();
  assert.strictEqual(doc.kategorie, 'zertifikat');
  assert.ok(doc.version >= 1);

  const fd2 = new FormData();
  fd2.append('file', new Blob([Buffer.from('kein pdf, nur text')], { type: 'application/pdf' }), 'fake.pdf');
  const bad = await fetch(`${baseUrl}/api/experts/me/documents`, { method: 'POST', headers: { cookie: expertCookie }, body: fd2 });
  assert.strictEqual(bad.status, 400);

  const anon = await fetch(`${baseUrl}/api/experts/me/documents`, { method: 'POST', body: fd });
  assert.strictEqual(anon.status, 401);
});

test('Skill-Vorschlag: neuer Begriff wartet auf Freigabe, Freigabe macht ihn offiziell, Ablehnung räumt auf', async () => {
  const res = await post('/api/experts/me/skills', { name: 'Wasserstoff-Logistik', kategorie: 'branche' }, { cookie: expertCookie });
  assert.strictEqual(res.status, 201);
  const d = await res.json();
  assert.strictEqual(d.skill.is_approved, false, 'neuer Begriff unbestätigt');
  assert.ok(d.hinweis, 'Hinweis auf Prüfung');

  // Admin sieht den Vorschlag samt Verwendungszähler
  const liste = await (await fetch(`${baseUrl}/api/experts/skill-vorschlaege`, { headers: { cookie: adminCookie } })).json();
  const v = liste.vorschlaege.find((s) => s.name === 'Wasserstoff-Logistik');
  assert.ok(v && v.verwendungen === 1);

  // Freigeben
  await post(`/api/experts/skill-vorschlaege/${v.id}`, { aktion: 'freigeben' }, { cookie: adminCookie });
  assert.strictEqual((await db('skills').where({ id: v.id }).first()).is_approved, true);

  // Bekannter, freigegebener Begriff wird ohne Hinweis verknüpft
  const res2 = await post('/api/experts/me/skills', { name: 'wasserstoff-logistik' }, { cookie: expertCookie });
  assert.strictEqual((await res2.json()).hinweis, null);

  // Ablehnung: neuer Vorschlag anlegen und ablehnen → Skill + Verknüpfungen weg
  const res3 = await post('/api/experts/me/skills', { name: 'Buzzword-Bingo', kategorie: 'kompetenz' }, { cookie: expertCookie });
  const buzz = (await res3.json()).skill;
  await post(`/api/experts/skill-vorschlaege/${buzz.id}`, { aktion: 'ablehnen' }, { cookie: adminCookie });
  assert.strictEqual(await db('skills').where({ id: buzz.id }).first(), undefined);
  assert.strictEqual((await db('expert_skills').where({ skill_id: buzz.id })).length, 0);

  // Eigenen Skill entfernen
  const del = await fetch(`${baseUrl}/api/experts/me/skills/${v.id}`, { method: 'DELETE', headers: { cookie: expertCookie } });
  assert.strictEqual(del.status, 200);
  assert.strictEqual((await db('expert_skills').where({ expert_id: adrian.id, skill_id: v.id })).length, 0);
});

test('Eigenes Profil-PPTX (Experte): gültige Datei, ohne Login gesperrt', async () => {
  const res = await fetch(`${baseUrl}/api/experts/me/profil-pptx`, { headers: { cookie: expertCookie } });
  assert.strictEqual(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf[0] === 0x50 && buf[1] === 0x4b && buf.length > 5000, 'PPTX plausibel');
  const anon = await fetch(`${baseUrl}/api/experts/me/profil-pptx`);
  assert.strictEqual(anon.status, 401);
});
