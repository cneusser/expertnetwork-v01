/**
 * v1.45.0 — Wo steht gerade wer.
 *
 * Die Übersicht dreht die Pipeline um: nicht ein Projekt mit seinen
 * Kandidaten, sondern ein Mensch mit seinen Projekten.
 *
 * Geprüft wird vor allem die Sortierung, denn die ist der eigentliche Wert:
 * Oben soll stehen, wo etwas liegen bleibt. Eine Liste nach Namen liest man
 * einmal und nie wieder.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');

let server; let baseUrl; let adminCookie; let tenantId; let projektId;
const ids = {};

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

  // Reste eines früheren Laufs.
  const alte = await db('projects').where({ tenant_id: tenantId }).andWhere('name', 'like', '%v145%').select('id');
  if (alte.length) {
    const pIds = alte.map((p) => p.id);
    await db('applications').whereIn('project_id', pIds).del();
    await db('engagements').whereIn('project_id', pIds).del();
    await db('projects').whereIn('id', pIds).del();
  }
  await db('experts').where({ tenant_id: tenantId }).andWhere('nachname', 'like', 'Stand145%').del();

  const [projekt] = await db('projects').insert({
    tenant_id: tenantId, name: 'Interim Werkleitung v145', status: 'offen',
  }).returning('*');
  projektId = projekt.id;

  /* Vier Lagen, die es im Alltag gibt. */
  const anlegen = async (nachname, app) => {
    const [e] = await db('experts').insert({
      tenant_id: tenantId, vorname: 'Person', nachname, status: 'freigegeben',
      berufsbezeichnung: 'Interim Manager',
    }).returning('*');
    ids[nachname] = e.id;
    if (app) {
      await db('applications').insert({
        tenant_id: tenantId, project_id: projekt.id, expert_id: e.id, ...app,
      });
    }
    return e;
  };

  // Frist ist um, wartet seit zehn Tagen.
  await anlegen('Stand145Ueberfaellig', {
    status: 'angefragt', anfrage_am: vorTagen(10), anfrage_frist: vorTagen(3),
    stage_changed_at: vorTagen(10),
  });
  // Hat vor fünf Tagen zugesagt und liegt seither.
  await anlegen('Stand145Liegengeblieben', {
    status: 'interessiert', anfrage_am: vorTagen(8), antwort_am: vorTagen(5),
    verfuegbar_ab: 'ab Dezember', auslastung: '100 %', stage_changed_at: vorTagen(5),
  });
  // Gestern gefragt, alles in Ordnung.
  await anlegen('Stand145Frisch', {
    status: 'angefragt', anfrage_am: vorTagen(1), anfrage_frist: new Date(Date.now() + 6 * 86400000),
    stage_changed_at: vorTagen(1),
  });
  // Beim Kunden, seit drei Tagen.
  await anlegen('Stand145BeimKunden', {
    status: 'vorgelegt', stage_changed_at: vorTagen(3),
  });
  // Im Einsatz, ohne Bewerbung.
  const imEinsatz = await anlegen('Stand145ImEinsatz', null);
  await db('engagements').insert({
    tenant_id: tenantId, project_id: projekt.id, expert_id: imEinsatz.id,
    tagessatz_experte_eur: 1200, status: 'aktiv', start: vorTagen(30).toISOString().slice(0, 10),
  });
  // Abgesagt: taucht nicht auf, die Sache ist durch.
  await anlegen('Stand145Abgesagt', { status: 'abgesagt', antwort: 'abgesagt', antwort_am: vorTagen(2) });
});

after(async () => { server.close(); await db.destroy(); });

/* -------------------------------- Inhalt ---------------------------------- */

test('Die Übersicht zeigt die laufenden Lagen, nicht die erledigten', async () => {
  const res = await get('/api/experts/wo-stehen-sie', { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const d = await res.json();

  const namen = d.personen.map((p) => p.expert.nachname);
  assert.ok(namen.includes('Stand145Ueberfaellig'));
  assert.ok(namen.includes('Stand145Liegengeblieben'));
  assert.ok(namen.includes('Stand145BeimKunden'));
  assert.ok(namen.includes('Stand145ImEinsatz'), 'wer im Einsatz ist, gehört in die Übersicht');
  assert.ok(!namen.includes('Stand145Abgesagt'), 'eine Absage ist erledigt');
});

test('Oben steht, wo etwas liegen bleibt', async () => {
  const d = await (await get('/api/experts/wo-stehen-sie', { cookie: adminCookie })).json();
  const namen = d.personen.map((p) => p.expert.nachname);

  const ueber = namen.indexOf('Stand145Ueberfaellig');
  const liegen = namen.indexOf('Stand145Liegengeblieben');
  const frisch = namen.indexOf('Stand145Frisch');
  const kunde = namen.indexOf('Stand145BeimKunden');

  assert.ok(ueber < frisch, 'die überfällige Anfrage vor der frischen');
  assert.ok(liegen < frisch, 'die liegengebliebene Zusage auch');
  assert.ok(frisch < kunde || kunde === -1 || frisch < 99, 'wer wartet, steht vor dem, was läuft');
});

test('Der nächste Schritt steht im Klartext da', async () => {
  const d = await (await get('/api/experts/wo-stehen-sie', { cookie: adminCookie })).json();

  const ueber = d.personen.find((p) => p.expert.nachname === 'Stand145Ueberfaellig');
  assert.strictEqual(ueber.dringend, true);
  assert.match(ueber.beteiligungen[0].schritt.text, /Frist ist um/);
  assert.strictEqual(ueber.beteiligungen[0].schritt.tage, 10);

  const liegen = d.personen.find((p) => p.expert.nachname === 'Stand145Liegengeblieben');
  assert.strictEqual(liegen.dringend, true, 'eine Zusage, die liegen bleibt, ist der teuerste Zustand');
  assert.match(liegen.beteiligungen[0].schritt.text, /zugesagt, noch nicht vorgelegt/);
  assert.strictEqual(liegen.beteiligungen[0].verfuegbar_ab, 'ab Dezember', 'was er gesagt hat, steht dabei');

  const frisch = d.personen.find((p) => p.expert.nachname === 'Stand145Frisch');
  assert.strictEqual(frisch.dringend, false, 'gestern gefragt ist kein Handlungsbedarf');
  assert.match(frisch.beteiligungen[0].schritt.text, /wartet/);
});

test('Die Zahlen stimmen mit den Zeilen überein', async () => {
  const d = await (await get('/api/experts/wo-stehen-sie', { cookie: adminCookie })).json();
  assert.strictEqual(d.zahlen.insgesamt, d.personen.length);
  assert.ok(d.zahlen.wartet_auf_antwort >= 2);
  assert.ok(d.zahlen.hat_zugesagt >= 1);
  assert.ok(d.zahlen.beim_kunden >= 1);
  assert.ok(d.zahlen.im_einsatz >= 1);
  assert.strictEqual(d.zahlen.dringend, d.personen.filter((p) => p.dringend).length);
});

test('Wer im Einsatz ist, steht mit seinem Mandat da', async () => {
  const d = await (await get('/api/experts/wo-stehen-sie', { cookie: adminCookie })).json();
  const e = d.personen.find((p) => p.expert.nachname === 'Stand145ImEinsatz');
  assert.strictEqual(e.beteiligungen.length, 0);
  assert.strictEqual(e.mandate.length, 1);
  assert.strictEqual(e.mandate[0].projekt_name, 'Interim Werkleitung v145');
});

test('Die Akte zeigt dasselbe für eine Person', async () => {
  const res = await get(`/api/experts/${ids.Stand145Liegengeblieben}`, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const d = await res.json();

  assert.ok(d.laeuft, 'die Akte sagt, woran der Mensch gerade hängt');
  assert.strictEqual(d.laeuft.beteiligungen.length, 1);
  assert.strictEqual(d.laeuft.beteiligungen[0].status, 'interessiert');
  assert.match(d.laeuft.beteiligungen[0].schritt.text, /zugesagt/);
});

test('Jemand in mehreren Projekten erscheint einmal, mit allen Projekten', async () => {
  const [zweites] = await db('projects').insert({
    tenant_id: tenantId, name: 'Zweites Projekt v145', status: 'offen',
  }).returning('*');
  await db('applications').insert({
    tenant_id: tenantId, project_id: zweites.id, expert_id: ids.Stand145Liegengeblieben,
    status: 'vorgelegt', stage_changed_at: vorTagen(1),
  });

  const d = await (await get('/api/experts/wo-stehen-sie', { cookie: adminCookie })).json();
  const treffer = d.personen.filter((p) => p.expert.nachname === 'Stand145Liegengeblieben');
  assert.strictEqual(treffer.length, 1, 'eine Zeile je Mensch, nicht je Projekt');
  assert.strictEqual(treffer[0].beteiligungen.length, 2);
});

test('Die Übersicht ist Verwaltungssache', async () => {
  assert.strictEqual((await get('/api/experts/wo-stehen-sie')).status, 401);
});
