/**
 * v1.47.1 — Der Tagessatz, und was neben ihm gilt.
 *
 * Aus einem echten Fall: Auf der ersten Vorlage stand "210 EUR" für einen
 * Interim-Geschäftsführer. Der hinterlegte Wert war 175, gemeint war ein
 * Stundensatz. Mit 20 Prozent Aufschlag wurden daraus 210 EUR am Tag.
 *
 * Zwei Dinge gingen schief: Der vom Kandidaten für dieses Projekt genannte
 * Satz wurde nicht verwendet, obwohl er seit v1.44.0 erhoben wird. Und eine
 * offensichtlich unmögliche Zahl ging ungeprüft zum Kunden.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const v = require('../utils/vorlage');

let server; let baseUrl; let adminCookie; let tenantId; let projektId;
const ids = {};

const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const put = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
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

  const alte = await db('projects').where({ tenant_id: tenantId }).andWhere('name', 'like', '%v1471%').select('id');
  if (alte.length) {
    const pIds = alte.map((p) => p.id);
    const vIds = (await db('vorlagen').whereIn('project_id', pIds).select('id')).map((x) => x.id);
    if (vIds.length) await db('vorlage_positionen').whereIn('vorlage_id', vIds).del();
    await db('vorlagen').whereIn('project_id', pIds).del();
    await db('applications').whereIn('project_id', pIds).del();
    await db('projects').whereIn('id', pIds).del();
  }
  await db('experts').where({ tenant_id: tenantId }).andWhere('nachname', 'like', 'Satz1471%').del();

  const [projekt] = await db('projects').insert({
    tenant_id: tenantId, name: 'Interim CRO v1471', status: 'offen', arbeitsmodell: 'vor_ort',
  }).returning('*');
  projektId = projekt.id;

  // Der Fall aus der Praxis: 175 im Tagessatzfeld, gemeint als Stundensatz.
  const [stunde] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Ralf', nachname: 'Satz1471Stundensatz', status: 'freigegeben',
    berufsbezeichnung: 'Geschäftsführer',
  }).returning('*');
  ids.stunde = stunde.id;
  await db('rates').insert({
    tenant_id: tenantId, expert_id: stunde.id, kategorie: 'interim',
    satz_von_eur: 175, gueltig_ab: '2026-01-01',
  });
  // Er hat für dieses Projekt 1.400 genannt, zzgl. Reisekosten.
  await db('applications').insert({
    tenant_id: tenantId, project_id: projekt.id, expert_id: stunde.id,
    status: 'interessiert', antwort: 'interessiert', antwort_am: new Date(),
    wunsch_satz_eur: 1400, antwort_notiz: 'zzgl. Reisekosten Es gibt noch etliche Punkte im Vorfeld zu klären',
  });

  // Jemand mit hinterlegtem Satz, ohne Wunschsatz.
  const [normal] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Petra', nachname: 'Satz1471Normal', status: 'freigegeben',
  }).returning('*');
  ids.normal = normal.id;
  await db('rates').insert({
    tenant_id: tenantId, expert_id: normal.id, kategorie: 'vor_ort',
    satz_von_eur: 1250, gueltig_ab: '2026-01-01',
  });

  // Jemand mit unplausiblem Satz und ohne Wunschsatz: bleibt "auf Anfrage".
  const [kaputt] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Ulrich', nachname: 'Satz1471Unplausibel', status: 'freigegeben',
  }).returning('*');
  ids.kaputt = kaputt.id;
  await db('rates').insert({
    tenant_id: tenantId, expert_id: kaputt.id, kategorie: 'interim',
    satz_von_eur: 190, gueltig_ab: '2026-01-01',
  });
});

after(async () => { server.close(); await db.destroy(); });

/* -------------------------- Die Plausibilität ---------------------------- */

test('Ein Stundensatz ist kein Tagessatz', () => {
  assert.strictEqual(v.satzPlausibel(175), false, 'der Fall aus der Praxis');
  assert.strictEqual(v.satzPlausibel(190), false);
  assert.strictEqual(v.satzPlausibel(399), false);
  assert.strictEqual(v.satzPlausibel(400), true, 'die Untergrenze gilt noch');
  assert.strictEqual(v.satzPlausibel(1400), true);
  assert.strictEqual(v.satzPlausibel(6000), true);
  assert.strictEqual(v.satzPlausibel(9000), false, 'nach oben ebenso');
  assert.strictEqual(v.satzPlausibel(null), false);
});

test('Der Spesenhinweis wird aus der Rückmeldung gelesen', () => {
  assert.strictEqual(v.spesenHinweis('zzgl. Reisekosten Es gibt noch Punkte'), 'zzgl. Reisekosten');
  assert.strictEqual(v.spesenHinweis('Tagessatz inkl. Reisekosten'), 'inkl. Reisekosten');
  assert.strictEqual(v.spesenHinweis('Spesen nach Aufwand'), 'zzgl. Reisekosten');
  assert.strictEqual(v.spesenHinweis('Klingt spannend'), null);
  assert.strictEqual(v.spesenHinweis('Klingt spannend', 'Anfahrt pauschal 250 EUR'),
    'Anfahrt pauschal 250 EUR', 'das Profil greift, wenn die Rückmeldung nichts sagt');
});

/* ------------------------------ Die Auswahl ------------------------------- */

test('Der Wunschsatz für dieses Projekt gewinnt', async () => {
  const s = await v.satzVon(db, ids.stunde, { kategorie: 'vor_ort', projektId });
  assert.strictEqual(s.cent, 140000, '1.400 aus der Rückmeldung, nicht 175 aus dem Profil');
  assert.strictEqual(s.quelle, 'wunsch');
});

test('Ohne Wunschsatz zählt der hinterlegte, passend zum Arbeitsmodell', async () => {
  const s = await v.satzVon(db, ids.normal, { kategorie: 'vor_ort', projektId });
  assert.strictEqual(s.cent, 125000);
  assert.strictEqual(s.quelle, 'kategorie');
});

test('Ein unmöglicher Satz wird gemeldet, nicht verwendet', async () => {
  const s = await v.satzVon(db, ids.kaputt, { kategorie: 'interim', projektId });
  assert.strictEqual(s.cent, null, 'lieber "auf Anfrage" als eine Zahl, die das Angebot entwertet');
  assert.strictEqual(s.quelle, 'unplausibel');
  assert.match(s.warnungen[0], /Stundensatz im Tagessatzfeld/);
});

/* ------------------------------ Die Vorlage ------------------------------- */

test('Die Vorlage zeigt 1.680 statt 210', async () => {
  const res = await post('/api/vorlagen', {
    project_id: projektId, expert_ids: [ids.stunde], aufschlag_prozent: 20,
  }, { cookie: adminCookie });
  assert.strictEqual(res.status, 201);
  const d = await res.json();

  const pos = d.positionen[0];
  assert.strictEqual(pos.satz_experte_cent, 140000);
  assert.strictEqual(pos.satz_kunde_cent, 168000, '1.400 plus 20 Prozent');
  assert.strictEqual(pos.satz_hinweis, 'zzgl. Reisekosten', 'was er ausdrücklich gesagt hat');
});

test('Ein unplausibler Satz wird beim Zusammenstellen gemeldet', async () => {
  const res = await post('/api/vorlagen', {
    project_id: projektId, expert_ids: [ids.kaputt],
  }, { cookie: adminCookie });
  const d = await res.json();

  assert.ok(d.hinweise.length >= 1, 'das kommt vor die Augen, bevor die Vorlage hinausgeht');
  assert.match(d.hinweise[0], /Ulrich Satz1471Unplausibel/);
  assert.match(d.hinweise[0], /auf Anfrage/);
  assert.strictEqual(d.positionen[0].satz_kunde_cent, null);
});

test('Der Satz lässt sich in Euro korrigieren', async () => {
  const vorl = await db('vorlagen').where({ project_id: projektId }).orderBy('id', 'desc').first();
  const pos = await db('vorlage_positionen').where({ vorlage_id: vorl.id }).first();

  const res = await put(`/api/vorlagen/${vorl.id}/positionen/${pos.id}`,
    { satz_kunde_eur: 1500, satz_hinweis: 'zzgl. Reisekosten' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);

  const nach = await db('vorlage_positionen').where({ id: pos.id }).first();
  assert.strictEqual(nach.satz_kunde_cent, 150000, 'in Euro gedacht, in Cent gespeichert');
  assert.strictEqual(nach.satz_hinweis, 'zzgl. Reisekosten');
});

test('Der Hinweis steht beim Kunden neben dem Satz', async () => {
  const anlegen = await (await post('/api/vorlagen', {
    project_id: projektId, expert_ids: [ids.stunde],
  }, { cookie: adminCookie })).json();
  await post(`/api/vorlagen/${anlegen.vorlage.id}/freigeben`, {}, { cookie: adminCookie });

  const vorl = await db('vorlagen').where({ id: anlegen.vorlage.id }).first();
  const d = await (await get(`/api/vorlagen/oeffentlich/${vorl.token}`)).json();

  assert.strictEqual(d.profile[0].tagessatz_cent, 168000);
  assert.strictEqual(d.profile[0].satz_hinweis, 'zzgl. Reisekosten');
});

/* ------------------- v1.47.2: zwei Namen, ein Schlüssel ------------------- */

test('Der Schlüssel darf unter beiden Namen stehen', () => {
  const px = require('../utils/phalanxProjekte');
  const pz = require('../utils/phalanxZeiten');
  const sichern = {
    basis: process.env.PHALANX_OS_BASE_URL,
    api: process.env.PHALANX_OS_API_KEY,
    sync: process.env.PHALANX_OS_SYNC_KEY,
  };

  try {
    process.env.PHALANX_OS_BASE_URL = 'https://os.example.invalid';
    delete process.env.PHALANX_OS_API_KEY;
    delete process.env.PHALANX_OS_SYNC_KEY;
    assert.strictEqual(px.eingerichtet(), false);
    assert.match(px.fehlendeVariablen().join(' '), /API_KEY oder .*SYNC_KEY/);

    // Nur der alte Name, wie er in Railway schon lag.
    process.env.PHALANX_OS_SYNC_KEY = 'aus-dem-sync-feld';
    assert.strictEqual(px.eingerichtet(), true, 'eine gesetzte Variable darf nicht als fehlend gelten');
    assert.strictEqual(px.schluesselName(), 'PHALANX_OS_SYNC_KEY');
    assert.strictEqual(pz.eingerichtet(), true, 'die Stundenübergabe nutzt denselben');

    // Stehen beide, gewinnt der ausdrückliche.
    process.env.PHALANX_OS_API_KEY = 'aus-dem-api-feld';
    assert.strictEqual(px.schluesselName(), 'PHALANX_OS_API_KEY');
  } finally {
    for (const [k, v] of Object.entries({
      PHALANX_OS_BASE_URL: sichern.basis,
      PHALANX_OS_API_KEY: sichern.api,
      PHALANX_OS_SYNC_KEY: sichern.sync,
    })) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});
