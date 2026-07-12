/**
 * Sprint-1-Tests: Import, Expertenliste (nur Admin), Detail, Tresor-Download.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { importAll } = require('../db/import-experts');
const { app } = require('../index');

let server;
let baseUrl;
let adminCookie;

before(async () => {
  await db.migrate.latest();
  await seed();
  await importAll();
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
  assert.strictEqual(res.status, 200, 'Admin-Login');
  adminCookie = res.headers.get('set-cookie');
});

after(async () => {
  server.close();
  await db.destroy();
});

test('Import ist idempotent (zweiter Lauf erzeugt keine Duplikate)', async () => {
  await importAll();
  const experts = await db('experts').where({ email: 'adrian@rethink-interim.ch' });
  assert.strictEqual(experts.length, 1);
  const docs = await db('documents').where({ expert_id: experts[0].id });
  assert.strictEqual(docs.length, 6, '6 Dokumente im Tresor');
});

test('Expertenliste nur für Admin', async () => {
  const anon = await fetch(baseUrl + '/api/experts');
  assert.strictEqual(anon.status, 401);
  const res = await fetch(baseUrl + '/api/experts', { headers: { cookie: adminCookie } });
  assert.strictEqual(res.status, 200);
  const { experts } = await res.json();
  const adrian = experts.find((e) => e.nachname === 'Spörri');
  assert.ok(adrian, 'Adrian Spörri in der Liste');
  assert.ok(adrian.skills.length >= 20, 'Skills getaggt');
  assert.strictEqual(adrian.availabilities.length, 2, 'Zwei Verfügbarkeits-Einträge');
  assert.strictEqual(adrian.rates[0].satz_von_eur, 1300);
  assert.strictEqual(adrian.rates[0].satz_bis_eur, 1500);
});

test('Detail liefert Konsens-Status und verbirgt storage_ref', async () => {
  const expert = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  const res = await fetch(`${baseUrl}/api/experts/${expert.id}`, { headers: { cookie: adminCookie } });
  const body = await res.json();
  assert.strictEqual(body.consent, null, 'Einwilligung ausstehend (Admin-Import)');
  assert.ok(body.documents.length === 6 && !('storage_ref' in body.documents[0]));
});

test('Tresor-Download: Admin ja, anonym nein', async () => {
  const expert = await db('experts').where({ email: 'adrian@rethink-interim.ch' }).first();
  const doc = await db('documents').where({ expert_id: expert.id, kategorie: 'cv', sprache: 'de' }).first();
  const anon = await fetch(`${baseUrl}/api/experts/${expert.id}/documents/${doc.id}/download`);
  assert.strictEqual(anon.status, 401);
  const res = await fetch(`${baseUrl}/api/experts/${expert.id}/documents/${doc.id}/download`, {
    headers: { cookie: adminCookie },
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /pdf/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.length > 100000, 'PDF vollständig ausgeliefert');
  assert.strictEqual(buf.subarray(0, 4).toString(), '%PDF');
});
