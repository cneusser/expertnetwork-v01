/**
 * v1.36.0 — Die Monatsfrist aus Art. 14 DSGVO rechnet mit.
 *
 * Geprüft werden: die Fristberechnung je Kontakt, die Einschätzung ob das
 * Pensum reicht, dass Angeschriebene nicht mehr mitzählen, und der bewusste
 * Verzicht, der nur auf ausdrückliche Bestätigung löscht und niemanden
 * anfasst, der schon Post bekommen hat.
 * Alle Namen sind erfunden.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const { fristEnde, arbeitstageBis, lage } = require('../utils/artikel14');

let server; let baseUrl; let adminCookie; let tenantId;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const get = (p, h = {}) => fetch(baseUrl + p, { headers: h });
const vorTagen = (n) => new Date(Date.now() - n * 86400000);

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

  // Fremddaten aus anderen Testdateien beiseite, sonst stimmt keine Zahl.
  const ablage = await db('tenants').where({ slug: 'test-ablage' }).first()
    || (await db('tenants').insert({ name: 'Test-Ablage', slug: 'test-ablage' }).returning('*'))[0];
  await db('experts').where({ tenant_id: tenantId }).whereNotNull('vorreg_importiert_am')
    .update({ tenant_id: ablage.id });

  const basis = { tenant_id: tenantId, status: 'vorregistriert' };
  // Vor 20 Tagen importiert, noch nicht angeschrieben: Frist läuft in 10 Tagen ab.
  for (const [v, n, p] of [['Roswitha', 'Erlenkamp', 'A'], ['Detlef', 'Muhrmann', 'A'],
    ['Ortrun', 'Zehetmair', 'B'], ['Kuno', 'Pfeilschifter', 'C'], ['Adelgunde', 'Wiesinger', 'C']]) {
    await db('experts').insert({
      ...basis, vorname: v, nachname: n, vorreg_prio: p,
      vorreg_quelle: 'Testliste v136', vorreg_importiert_am: vorTagen(20),
    });
  }
  // Schon angeschrieben, also informiert.
  await db('experts').insert({
    ...basis, vorname: 'Gunhild', nachname: 'Aschenbrenner', vorreg_prio: 'A',
    vorreg_quelle: 'Testliste v136', vorreg_importiert_am: vorTagen(20),
    vorreg_angeschrieben_am: vorTagen(18).toISOString().slice(0, 10),
  });
  // Vor 40 Tagen importiert, nie angeschrieben: Frist ist vorbei.
  await db('experts').insert({
    ...basis, vorname: 'Sieghard', nachname: 'Dollinger', vorreg_prio: 'B',
    vorreg_quelle: 'Altliste', vorreg_importiert_am: vorTagen(40),
  });
});

after(async () => { server.close(); await db.destroy(); });

test('Die Frist endet einen Monat nach dem Import', async () => {
  const ende = fristEnde('2026-09-14T10:00:00.000Z');
  assert.strictEqual(ende.toISOString().slice(0, 10), '2026-10-14');

  // Monatsenden sauber behandeln, der 31. Januar hat keinen 31. Februar.
  assert.ok(fristEnde('2026-01-31') instanceof Date);
  assert.strictEqual(fristEnde(null), null);
  assert.strictEqual(fristEnde('quatsch'), null);
});

test('Arbeitstage zählen ohne Wochenende', async () => {
  // Montag bis zum Montag darauf sind fünf Arbeitstage.
  const montag = new Date('2026-10-05T09:00:00');
  const naechsterMontag = new Date('2026-10-12T09:00:00');
  assert.strictEqual(arbeitstageBis(naechsterMontag, montag), 5);
  assert.strictEqual(arbeitstageBis(montag, montag), 0);
});

test('Die Lage: wer zählt mit, wer nicht', async () => {
  const d = await (await get('/api/ansprache/frist?pensum=25', { cookie: adminCookie })).json();

  assert.strictEqual(d.informiert, 1, 'die Angeschriebene ist informiert');
  assert.strictEqual(d.offen, 5, 'fünf laufen noch');
  assert.strictEqual(d.abgelaufen, 1, 'bei einem ist die Frist vorbei');
  assert.strictEqual(d.ampel, 'rot', 'eine abgelaufene Frist ist immer rot');
  assert.ok(d.hinweis.includes('anwaltlichen'), 'keine Rechtsauskunft, sondern ein Verweis');

  const prioA = d.nach_prio.find((z) => z.prio === 'A');
  assert.strictEqual(prioA.offen, 2, 'Gunhild zählt nicht mehr mit, sie ist informiert');

  assert.strictEqual((await get('/api/ansprache/frist')).status, 401);
});

test('Die Einschätzung hängt am Pensum', async () => {
  const kontakte = Array.from({ length: 100 }, () => ({
    vorreg_importiert_am: vorTagen(20), vorreg_angeschrieben_am: null, vorreg_prio: 'A',
  }));

  const knapp = lage(kontakte, { pensum: 5 });
  assert.strictEqual(knapp.ampel, 'rot', 'fünf am Tag reichen für hundert in zehn Tagen nicht');
  assert.ok(knapp.noetig_pro_arbeitstag > 5, 'und die Zahl sagt, was nötig wäre');

  const reicht = lage(kontakte, { pensum: 50 });
  assert.strictEqual(reicht.ampel, 'gruen');

  const leer = lage([], { pensum: 25 });
  assert.strictEqual(leer.offen, 0);
  assert.strictEqual(leer.ampel, 'gruen');
  assert.strictEqual(leer.naechste_frist, null);
});

test('Vorschau zeigt, was ein Verzicht kosten würde', async () => {
  const alle = await (await get('/api/ansprache/frist/vorschau', { cookie: adminCookie })).json();
  assert.strictEqual(alle.anzahl, 6, 'alle noch nicht angeschriebenen');
  assert.ok(!alle.kontakte.some((k) => k.nachname === 'Aschenbrenner'), 'die Informierte ist nicht dabei');

  const nurC = await (await get('/api/ansprache/frist/vorschau?prio=C', { cookie: adminCookie })).json();
  assert.strictEqual(nurC.anzahl, 2);
  assert.deepStrictEqual(nurC.kontakte.map((k) => k.nachname).sort(), ['Pfeilschifter', 'Wiesinger']);
});

test('Verzicht löscht nur nach ausdrücklicher Bestätigung', async () => {
  const nurC = await (await get('/api/ansprache/frist/vorschau?prio=C', { cookie: adminCookie })).json();
  const ids = nurC.kontakte.map((k) => k.id);

  assert.strictEqual((await post('/api/ansprache/frist/verzichten', { ids }, { cookie: adminCookie })).status, 400,
    'ohne Bestätigungswort passiert nichts');
  assert.strictEqual((await post('/api/ansprache/frist/verzichten',
    { ids, bestaetigung: 'ja' }, { cookie: adminCookie })).status, 400);
  assert.strictEqual((await post('/api/ansprache/frist/verzichten',
    { ids: [], bestaetigung: 'LÖSCHEN' }, { cookie: adminCookie })).status, 400);
  assert.strictEqual(await db('experts').where({ nachname: 'Pfeilschifter' }).first() !== undefined, true,
    'bis hierher steht noch alles');

  const res = await post('/api/ansprache/frist/verzichten',
    { ids, bestaetigung: 'LÖSCHEN' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.strictEqual(d.geloescht, 2);

  assert.strictEqual(await db('experts').where({ nachname: 'Pfeilschifter' }).first(), undefined);
  assert.strictEqual(await db('experts').where({ nachname: 'Wiesinger' }).first(), undefined);

  // Entscheidend: keine Merkliste, damit ein späterer Import wieder möglich ist.
  assert.strictEqual(await db('ansprache_ausschluss').where({ anzeige_name: 'Kuno Pfeilschifter' }).first(), undefined,
    'wer aus Zeitgründen gelöscht wird, ist nicht unerwünscht');
  assert.ok(await db('audit_log').where({ action: 'expert.frist_verzicht' }).first());

  assert.strictEqual((await post('/api/ansprache/frist/verzichten', { ids, bestaetigung: 'LÖSCHEN' })).status, 401);
});

test('Wer schon angeschrieben wurde, wird nie gelöscht', async () => {
  const gunhild = await db('experts').where({ nachname: 'Aschenbrenner', tenant_id: tenantId }).first();
  const res = await post('/api/ansprache/frist/verzichten',
    { ids: [gunhild.id], bestaetigung: 'LÖSCHEN' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.strictEqual(d.geloescht, 0);
  assert.strictEqual(d.uebersprungen, 1);
  assert.ok(await db('experts').where({ id: gunhild.id }).first(), 'sie steht noch');
});
