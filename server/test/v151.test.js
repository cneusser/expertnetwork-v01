/**
 * v1.51.0 — Wurde der Link überhaupt geöffnet?
 *
 * "Verschickt vor drei Tagen, nie aufgerufen" ist etwas anderes als "zweimal
 * gelesen, keine Reaktion". Im ersten Fall liegt die Mail im Spam, im
 * zweiten überlegt jemand noch.
 *
 * Geprüft wird auch, was NICHT gespeichert wird: keine IP-Adresse, kein
 * Browserkennzeichen. Für die Frage "hat er reingeschaut" reicht ein Zähler,
 * alles weitere wäre eine Beobachtung des Kunden.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');

let server; let baseUrl; let adminCookie; let tenantId; let projektId; let token; let vorlageId;

const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const get = (p, h = {}) => fetch(baseUrl + p, { headers: h });

before(async () => {
  await db.migrate.latest();
  await seed();
  tenantId = (await db('tenants').where({ slug: 'phalanx' }).first()).id;
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  })).headers.get('set-cookie');

  // Wiederholfest aufräumen: erst die Kinder, dann die Eltern. Ohne die
  // Raten bleibt der Fremdschlüssel stehen, und der zweite Lauf scheitert
  // an Resten des ersten.
  await db('klicks').del();
  const alte = await db('projects').where({ tenant_id: tenantId }).andWhere('name', 'like', '%v151%').select('id');
  if (alte.length) {
    const pIds = alte.map((p) => p.id);
    const vIds = (await db('vorlagen').whereIn('project_id', pIds).select('id')).map((x) => x.id);
    if (vIds.length) await db('vorlage_positionen').whereIn('vorlage_id', vIds).del();
    await db('vorlagen').whereIn('project_id', pIds).del();
    await db('applications').whereIn('project_id', pIds).del();
    await db('projects').whereIn('id', pIds).del();
  }
  const alteE = (await db('experts').where({ tenant_id: tenantId })
    .andWhere('nachname', 'like', 'Zaehl151%').select('id')).map((x) => x.id);
  if (alteE.length) {
    await db('rates').whereIn('expert_id', alteE).del();
    await db('experts').whereIn('id', alteE).del();
  }

  const [e] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Kandidat', nachname: 'Zaehl151', status: 'freigegeben',
  }).returning('*');
  await db('rates').insert({
    tenant_id: tenantId, expert_id: e.id, kategorie: 'interim',
    satz_von_eur: 1400, gueltig_ab: '2026-01-01',
  });
  const [projekt] = await db('projects').insert({
    tenant_id: tenantId, name: 'Interim CRO v151', status: 'offen',
  }).returning('*');
  projektId = projekt.id;

  const anlegen = await (await post('/api/vorlagen', {
    project_id: projektId, expert_ids: [e.id],
  }, { cookie: adminCookie })).json();
  vorlageId = anlegen.vorlage.id;
  await post(`/api/vorlagen/${vorlageId}/freigeben`, {}, { cookie: adminCookie });
  token = (await db('vorlagen').where({ id: vorlageId }).first()).token;
});

after(async () => { server.close(); await db.destroy(); });

/* ------------------------- Aufrufe der Vorlage ---------------------------- */

test('Eine frisch verschickte Vorlage gilt als nicht geöffnet', async () => {
  const d = await (await get(`/api/vorlagen/${vorlageId}`, { cookie: adminCookie })).json();
  assert.strictEqual(d.vorlage.gelesen.aufrufe, 0);
  assert.strictEqual(d.vorlage.gelesen.nie_geoeffnet, true,
    'der Unterschied zwischen "nicht angekommen" und "kein Interesse"');
});

test('Jeder Aufruf wird gezählt, der erste gesondert vermerkt', async () => {
  await get(`/api/vorlagen/oeffentlich/${token}`);
  let v = await db('vorlagen').where({ id: vorlageId }).first();
  assert.strictEqual(v.aufrufe, 1);
  assert.ok(v.erst_geoeffnet_am);
  const erst = v.erst_geoeffnet_am;

  await get(`/api/vorlagen/oeffentlich/${token}`);
  await get(`/api/vorlagen/oeffentlich/${token}`);
  v = await db('vorlagen').where({ id: vorlageId }).first();
  assert.strictEqual(v.aufrufe, 3);
  assert.deepStrictEqual(v.erst_geoeffnet_am, erst, 'der erste Aufruf bleibt der erste');
  assert.ok(new Date(v.zuletzt_geoeffnet_am) >= new Date(erst));
});

test('Danach sagt die Verwaltung, dass gelesen wurde', async () => {
  const d = await (await get(`/api/vorlagen/${vorlageId}`, { cookie: adminCookie })).json();
  assert.strictEqual(d.vorlage.gelesen.aufrufe, 3);
  assert.strictEqual(d.vorlage.gelesen.nie_geoeffnet, false);
  assert.ok(d.vorlage.gelesen.erst_am);
});

test('Ein Entwurf zählt nicht mit', async () => {
  const e = await db('experts').where({ tenant_id: tenantId, nachname: 'Zaehl151' }).first();
  const anlegen = await (await post('/api/vorlagen', {
    project_id: projektId, expert_ids: [e.id],
  }, { cookie: adminCookie })).json();
  const v = await db('vorlagen').where({ id: anlegen.vorlage.id }).first();

  await get(`/api/vorlagen/oeffentlich/${v.token}`); // 404, ein Entwurf ist nicht abrufbar
  const nach = await db('vorlagen').where({ id: v.id }).first();
  assert.strictEqual(nach.aufrufe, 0);
  assert.strictEqual(nach.erst_geoeffnet_am, null);
});

/* --------------------------- Klicks auf Termin ---------------------------- */

test('Der Terminknopf leitet weiter und zählt dabei', async () => {
  const res = await fetch(`${baseUrl}/api/konfig/termin?woher=anmeldung`, { redirect: 'manual' });
  assert.strictEqual(res.status, 302);
  assert.match(res.headers.get('location'), /phalanx-os-production\.up\.railway\.app\/api\/termine\//);

  const zeilen = await db('klicks').where({ was: 'termin' });
  assert.strictEqual(zeilen.length, 1);
  assert.strictEqual(zeilen[0].woher, 'anmeldung');
});

test('Gespeichert wird nur, dass geklickt wurde, nicht von wem', async () => {
  const zeile = await db('klicks').where({ was: 'termin' }).first();
  const spalten = Object.keys(zeile);

  for (const verboten of ['ip', 'ip_adresse', 'user_agent', 'browser', 'fingerprint', 'session']) {
    assert.ok(!spalten.includes(verboten), `"${verboten}" gehört hier nicht hin`);
  }
  assert.deepStrictEqual(spalten.sort(),
    ['created_at', 'id', 'tenant_id', 'user_id', 'was', 'woher'].sort());
});

test('Die Auswertung fasst zusammen', async () => {
  await fetch(`${baseUrl}/api/konfig/termin?woher=kopfzeile`, { redirect: 'manual' });
  await fetch(`${baseUrl}/api/konfig/termin?woher=kopfzeile`, { redirect: 'manual' });

  const d = await (await get('/api/konfig/klicks?was=termin', { cookie: adminCookie })).json();
  assert.strictEqual(d.gesamt, 3);
  assert.strictEqual(d.anonym, 3, 'ohne Anmeldung geklickt');
  const kopf = d.woher.find((w) => w.seite === 'kopfzeile');
  assert.strictEqual(kopf.anzahl, 2);
  assert.ok(d.monate.length >= 1);
});

test('Ein kaputter Zähler hindert niemanden am Terminieren', async () => {
  // Die Umleitung muss auch dann greifen, wenn die Herkunft Unsinn ist.
  const res = await fetch(`${baseUrl}/api/konfig/termin?woher=${'x'.repeat(500)}`, { redirect: 'manual' });
  assert.strictEqual(res.status, 302, 'weitergeleitet wird immer');
});

test('Die Auswertung ist Verwaltungssache, die Umleitung nicht', async () => {
  assert.strictEqual((await get('/api/konfig/klicks')).status, 401);
  assert.strictEqual((await fetch(`${baseUrl}/api/konfig/termin`, { redirect: 'manual' })).status, 302);
});
