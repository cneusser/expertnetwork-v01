/**
 * v1.28.0 — Dashboard: was zuletzt passiert ist.
 * Geprüft werden: die drei Listen, ihre Sortierung und Begrenzung, dass
 * vorbereitete und eingeladene Kontakte draußen bleiben, dass Übernommene mit
 * dem Tag der Zusammenführung zählen und nicht mit dem Importdatum, dass je
 * Person nur ein Eintrag erscheint, und dass die Kennzahlen den Pool von der
 * Ansprache trennen.
 * Alle Namen sind erfunden.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');

let server; let baseUrl; let adminCookie; let tenantId; let leute = {};
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const get = (p, h = {}) => fetch(baseUrl + p, { headers: h });
const put = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });

const vorTagen = (n) => new Date(Date.now() - n * 86400000);

/** Legt ein Profil an, auf Wunsch mit eigenem Konto. */
async function anlegen(vorname, nachname, felder = {}, mitKonto = false) {
  let userId = null;
  if (mitKonto) {
    const [u] = await db('users').insert({
      tenant_id: tenantId, email: `${vorname}.${nachname}@erfunden.example`.toLowerCase(),
      role: 'expert', is_approved: true, password_hash: 'x',
    }).returning('*');
    userId = u.id;
  }
  const [e] = await db('experts').insert({
    tenant_id: tenantId, user_id: userId, vorname, nachname,
    status: 'registriert', ...felder,
  }).returning('*');
  return e;
}

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

  // Alles, was frühere Testdateien hinterlassen haben, weit nach hinten schieben,
  // damit die Listen hier eindeutig sind. Das Datum der Zusammenführung gehört
  // dazu, weil danach sortiert wird, sobald es gesetzt ist.
  await db('experts').where({ tenant_id: tenantId }).update({ created_at: vorTagen(900) });
  await db('experts').where({ tenant_id: tenantId })
    .whereNotNull('vorreg_zusammengefuehrt_am')
    .update({ vorreg_zusammengefuehrt_am: vorTagen(900) });

  leute.frisch = await anlegen('Wanda', 'Kirschbaum', { firma: 'Kirschbaum Interim', created_at: vorTagen(1) });
  leute.mittel = await anlegen('Bodo', 'Nesselrode', { firma: 'Nesselrode GmbH', created_at: vorTagen(4) }, true);
  leute.alt = await anlegen('Ilse', 'Quandtberg', { firma: 'Quandtberg Beratung', created_at: vorTagen(40) }, true);

  // Übernommen: steht seit dem Import in der Datenbank, dabei ist sie erst seit gestern.
  leute.uebernommen = await anlegen('Hedwig', 'Ohlmüller', {
    firma: 'Ohlmüller Consulting', created_at: vorTagen(300),
    vorreg_zusammengefuehrt_am: vorTagen(2), vorreg_importiert_am: vorTagen(300),
  }, true);

  // Bleiben draußen: vorbereitet und eingeladen, beide ohne Konto.
  leute.vorreg = await anlegen('Traugott', 'Sedlmeier', {
    status: 'vorregistriert', created_at: vorTagen(1), vorreg_importiert_am: vorTagen(1),
  });
  leute.eingeladen = await anlegen('Roswitha', 'Bienenstock', {
    status: 'eingeladen', created_at: vorTagen(1),
  });
});

after(async () => { server.close(); await db.destroy(); });

test('Neu dazugekommen: jüngste zuerst, Übernommene zählen ab der Zusammenführung', async () => {
  const d = await (await get('/api/experts/aktivitaet', { cookie: adminCookie })).json();
  const namen = d.neu.map((p) => p.nachname);

  assert.ok(d.neu.length <= 5, 'höchstens fünf Einträge');
  assert.deepStrictEqual(namen.slice(0, 3), ['Kirschbaum', 'Ohlmüller', 'Nesselrode'],
    'ein Tag, zwei Tage, vier Tage — in dieser Reihenfolge');

  const hedwig = d.neu.find((p) => p.nachname === 'Ohlmüller');
  assert.strictEqual(hedwig.aus_vorregistrierung, true, 'als aus der Ansprache erkennbar');
  assert.ok(new Date(hedwig.dabei_seit) > vorTagen(3),
    'zählt ab der Zusammenführung, nicht ab dem Import vor 300 Tagen');

  assert.ok(!namen.includes('Sedlmeier'), 'vorbereitete Kontakte gehören nicht in den Pool');
  assert.ok(!namen.includes('Bienenstock'), 'eingeladene ohne Konto ebenso wenig');
});

test('Verfügbarkeit: je Person nur der jüngste Stand', async () => {
  const eintrag = (expert, status, created_at, extra = {}) => db('availabilities').insert({
    tenant_id: tenantId, expert_id: expert.id, status, created_at, confirmed_at: created_at, ...extra,
  });

  await eintrag(leute.alt, 'ausgebucht', vorTagen(20));
  await eintrag(leute.alt, 'sofort', vorTagen(2), { auslastung_prozent: 80 });
  await eintrag(leute.mittel, 'teilweise', vorTagen(6), { source: 'admin' });
  // Vorbereiteter Kontakt: hat gar kein Konto, darf hier nie auftauchen
  await eintrag(leute.vorreg, 'sofort', vorTagen(1));

  const d = await (await get('/api/experts/aktivitaet', { cookie: adminCookie })).json();
  const namen = d.verfuegbar.map((p) => p.nachname);

  assert.strictEqual(namen.filter((n) => n === 'Quandtberg').length, 1, 'nur ein Eintrag je Person');
  assert.ok(namen.indexOf('Quandtberg') < namen.indexOf('Nesselrode'), 'jüngste Meldung zuerst');
  assert.ok(!namen.includes('Sedlmeier'), 'vorbereitete Kontakte bleiben draußen');

  const ilse = d.verfuegbar.find((p) => p.nachname === 'Quandtberg');
  assert.strictEqual(ilse.verfuegbarkeit, 'sofort', 'der jüngste Stand gewinnt, nicht der älteste');
  assert.strictEqual(ilse.auslastung_prozent, 80);
  assert.strictEqual(d.verfuegbar.find((p) => p.nachname === 'Nesselrode').source, 'admin');
});

test('Profil angepasst: zeigt, was geändert wurde und wer es war', async () => {
  const res = await put(`/api/experts/${leute.frisch.id}`, { ort: 'Bamberg' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);

  // Eine Änderung, die der Experte selbst gemacht hat
  await db('audit_log').insert({
    tenant_id: tenantId, actor_id: leute.mittel.user_id, action: 'cv.step_add',
    resource: 'experts', resource_id: leute.mittel.id,
  });

  const d = await (await get('/api/experts/aktivitaet', { cookie: adminCookie })).json();
  const bodo = d.profil.find((p) => p.nachname === 'Nesselrode');
  const wanda = d.profil.find((p) => p.nachname === 'Kirschbaum');

  assert.ok(bodo && wanda, 'beide Änderungen erscheinen');
  assert.strictEqual(bodo.selbst, true, 'vom Experten selbst');
  assert.strictEqual(bodo.was, 'Station im Lebenslauf ergänzt');
  assert.strictEqual(wanda.selbst, false, 'vom Büro');
  assert.strictEqual(wanda.was, 'Stammdaten geändert');
  assert.ok(d.profil.length <= 5);

  // Nachtrag beim selben Menschen ersetzt den alten Eintrag, statt ihn zu verdoppeln
  await put(`/api/experts/${leute.frisch.id}`, { ort: 'Coburg' }, { cookie: adminCookie });
  const nachher = await (await get('/api/experts/aktivitaet', { cookie: adminCookie })).json();
  assert.strictEqual(nachher.profil.filter((p) => p.nachname === 'Kirschbaum').length, 1);
});

test('Kennzahlen trennen den Pool von der Ansprache', async () => {
  const s = await (await get('/api/experts/stats', { cookie: adminCookie })).json();
  assert.ok(s.vorregistriert >= 1, 'vorbereitete Kontakte werden gezählt');
  assert.ok(s.eingeladen >= 1, 'eingeladene ebenso');

  const alle = Number((await db('experts').where({ tenant_id: tenantId }).count('* as c').first()).c);
  assert.ok(s.gesamt < alle, 'der Pool ist kleiner als die Gesamtzahl der Datensätze');
  assert.strictEqual(
    s.gesamt + s.vorregistriert + s.eingeladen, alle,
    'Pool plus Ansprache ergibt zusammen alle Datensätze',
  );
});

test('Beide Auswertungen sind dem Admin vorbehalten', async () => {
  assert.strictEqual((await get('/api/experts/aktivitaet')).status, 401);
  assert.strictEqual((await get('/api/experts/stats')).status, 401);
});

test('Die Löschfrist kommt auch an Kontakten mit Übergabelink vorbei', async () => {
  const { runVorregLoeschfrist } = require('../jobs');
  const laengstFaellig = new Date(Date.now() - 400 * 86400000);

  const mitLink = await anlegen('Gernot', 'Wiesenthaler', {
    status: 'vorregistriert', vorreg_importiert_am: laengstFaellig, created_at: laengstFaellig,
  });
  const ohneLink = await anlegen('Adelheid', 'Brummerloh', {
    status: 'vorregistriert', vorreg_importiert_am: laengstFaellig, created_at: laengstFaellig,
  });
  await db('handover_tokens').insert({
    tenant_id: tenantId, expert_id: mitLink.id, ziel: 'capitalmatch',
    token: 'kennung-fuer-den-loeschtest-0001',
    expires_at: new Date(Date.now() + 86400000),
  });

  const stand = await runVorregLoeschfrist();
  assert.strictEqual(stand.gescheitert, 0, 'kein Datensatz bleibt hängen');
  assert.strictEqual(await db('experts').where({ id: mitLink.id }).first(), undefined,
    'der Kontakt mit Übergabelink ist weg');
  assert.strictEqual(await db('experts').where({ id: ohneLink.id }).first(), undefined,
    'und der dahinter auch, der Job bricht nicht mehr ab');
  assert.strictEqual(
    await db('handover_tokens').where({ expert_id: mitLink.id }).first(), undefined,
    'der Übergabelink verschwindet mit',
  );
});

test('Nur der eigene Mandant erscheint', async () => {
  const fremd = await db('tenants').where({ slug: 'fremdfirma' }).first()
    || (await db('tenants').insert({ name: 'Fremdfirma', slug: 'fremdfirma' }).returning('*'))[0];
  const eindringling = await db('experts').insert({
    tenant_id: fremd.id, vorname: 'Kuno', nachname: 'Zwirnhuber', status: 'registriert',
  }).returning('*');
  await db('availabilities').insert({
    tenant_id: fremd.id, expert_id: eindringling[0].id, status: 'sofort', confirmed_at: new Date(),
  });
  await db('audit_log').insert({
    tenant_id: fremd.id, action: 'expert.update', resource: 'experts', resource_id: eindringling[0].id,
  });

  const d = await (await get('/api/experts/aktivitaet', { cookie: adminCookie })).json();
  const alleNamen = [...d.neu, ...d.verfuegbar, ...d.profil].map((p) => p.nachname);
  assert.ok(!alleNamen.includes('Zwirnhuber'), 'fremder Mandant bleibt unsichtbar');
});
