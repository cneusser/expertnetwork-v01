/**
 * v1.49.0 — Was der Kunde mit einem Profil macht.
 *
 * Die wichtigste Zusicherung: Eine Absage geht nicht automatisch an den
 * Kandidaten. Zwischen der Entscheidung des Kunden und der Nachricht liegt
 * oft ein Gespräch, und eine Absage, die man nicht kommen sah, lässt sich
 * schwer zurückholen.
 *
 * Die zweite: Der Grund des Kunden bleibt im Haus. "Zu teuer" hilft dem
 * Kandidaten nicht und schadet der Beziehung zum Kunden, wenn es die Runde
 * macht.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const kr = require('../utils/kundenreaktion');

let server; let baseUrl; let adminCookie; let tenantId; let projektId;
let token; let positionen = []; const ids = {};

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

  const alte = await db('projects').where({ tenant_id: tenantId }).andWhere('name', 'like', '%v149%').select('id');
  if (alte.length) {
    const pIds = alte.map((p) => p.id);
    const vIds = (await db('vorlagen').whereIn('project_id', pIds).select('id')).map((x) => x.id);
    if (vIds.length) await db('vorlage_positionen').whereIn('vorlage_id', vIds).del();
    await db('vorlagen').whereIn('project_id', pIds).del();
    await db('applications').whereIn('project_id', pIds).del();
    await db('projects').whereIn('id', pIds).del();
  }
  await db('experts').where({ tenant_id: tenantId }).andWhere('nachname', 'like', 'Reaktion149%').del();

  const [projekt] = await db('projects').insert({
    tenant_id: tenantId, name: 'Interim CRO v149', status: 'offen',
  }).returning('*');
  projektId = projekt.id;

  for (const [schluessel, nachname, mail] of [
    ['mit', 'Reaktion149Mit', 'mit@reaktion149.invalid'],
    ['ohne', 'Reaktion149Ohne', null],
    ['dritt', 'Reaktion149Dritt', 'dritt@reaktion149.invalid'],
  ]) {
    const [e] = await db('experts').insert({
      tenant_id: tenantId, vorname: 'Kandidat', nachname, status: 'freigegeben',
      email: mail, berufsbezeichnung: 'Interim CRO',
    }).returning('*');
    ids[schluessel] = e.id;
    await db('rates').insert({
      tenant_id: tenantId, expert_id: e.id, kategorie: 'interim',
      satz_von_eur: 1300, gueltig_ab: '2026-01-01',
    });
    await db('applications').insert({
      tenant_id: tenantId, project_id: projekt.id, expert_id: e.id,
      status: 'interessiert', antwort: 'interessiert', antwort_am: new Date(),
    });
  }

  const anlegen = await (await post('/api/vorlagen', {
    project_id: projektId, expert_ids: [ids.mit, ids.ohne, ids.dritt],
    empfaenger: { firma: 'Knobelspies v149', name: 'Herr Knobelspies' },
  }, { cookie: adminCookie })).json();
  await post(`/api/vorlagen/${anlegen.vorlage.id}/freigeben`, {}, { cookie: adminCookie });

  const v = await db('vorlagen').where({ id: anlegen.vorlage.id }).first();
  token = v.token;
  positionen = await db('vorlage_positionen').where({ vorlage_id: v.id }).orderBy('sortierung');
});

/**
 * Die Position einer bestimmten Person. Nach Index zu greifen hat mich schon
 * einmal reingelegt: Profil B gehörte dem Kandidaten ohne Mailadresse, und
 * der Test prüfte etwas anderes, als er behauptete.
 */
const pos = (wer) => positionen.find((p) => p.expert_id === ids[wer]);

after(async () => { server.close(); await db.destroy(); });

/* ------------------------------ Die Reaktion ------------------------------ */

test('Der Kunde kann merken, ohne sich festzulegen', async () => {
  const p = pos('mit');
  const res = await post(`/api/vorlagen/oeffentlich/${token}/profil/${p.id}/reaktion`,
    { reaktion: 'gemerkt' });
  assert.strictEqual(res.status, 200);
  assert.match((await res.json()).message, /umentscheiden/);

  const nach = await db('vorlage_positionen').where({ id: p.id }).first();
  assert.strictEqual(nach.reaktion, 'gemerkt');
  assert.ok(nach.reaktion_am);

  // Gemerkt ändert den Pipeline-Status nicht: Der Kandidat liegt weiter
  // beim Kunden, und das ist genau der Zustand.
  const a = await db('applications').where({ project_id: projektId, expert_id: p.expert_id }).first();
  assert.strictEqual(a.status, 'interessiert');
});

test('Eine Einladung bringt den Kandidaten ins Gespräch', async () => {
  const p = pos('mit');
  const res = await post(`/api/vorlagen/oeffentlich/${token}/profil/${p.id}/reaktion`,
    { reaktion: 'einladen' });
  assert.strictEqual(res.status, 200);

  const a = await db('applications').where({ project_id: projektId, expert_id: p.expert_id }).first();
  assert.strictEqual(a.status, 'im_gespraech', 'der Stand steht an einer Stelle');
  assert.ok(a.stage_changed_at);
});

test('Eine Absage geht NICHT automatisch an den Kandidaten', async () => {
  const p = pos('dritt'); // hat eine Mailadresse, die Absage kann also raus
  const res = await post(`/api/vorlagen/oeffentlich/${token}/profil/${p.id}/reaktion`,
    { reaktion: 'abgelehnt', notiz: 'zu teuer für unser Budget' });
  assert.strictEqual(res.status, 200);

  const nach = await db('vorlage_positionen').where({ id: p.id }).first();
  assert.strictEqual(nach.reaktion, 'abgelehnt');
  assert.strictEqual(nach.absage_verschickt_am, null, 'das Entscheidende an dieser Stufe');
  assert.strictEqual(nach.absage_grund_kunde, 'zu teuer für unser Budget');
});

test('Der Grund des Kunden bleibt im Haus', async () => {
  const res = await get(`/api/vorlagen/oeffentlich/${token}`);
  const text = await res.text();
  assert.ok(!text.includes('zu teuer'), 'der Grund steht nicht in der Kundenansicht');

  // Und erst recht nicht in dem, was der Kandidat bekommt. Geprüft wird das
  // beim Verschicken weiter unten.
  const offen = await (await get('/api/vorlagen/absagen/offen', { cookie: adminCookie })).json();
  const eintrag = offen.absagen.find((a) => a.kennung === pos('dritt').kennung);
  assert.ok(eintrag, 'für dich steht er sehr wohl da');
  assert.strictEqual(eintrag.absage_grund_kunde, 'zu teuer für unser Budget');
});

test('Der Kunde sieht keine Klarnamen, auch nach der Reaktion nicht', async () => {
  const text = await (await get(`/api/vorlagen/oeffentlich/${token}`)).text();
  for (const n of ['Reaktion149Mit', 'Reaktion149Ohne', 'Reaktion149Dritt']) {
    assert.ok(!text.includes(n), `"${n}" darf dort nicht stehen`);
  }
});

/* ------------------------------ Die Absage -------------------------------- */

test('Die Absage geht erst auf deinen Klick raus', async () => {
  const p = pos('dritt');
  const res = await post(`/api/vorlagen/absagen/${p.id}/verschicken`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  assert.match((await res.json()).message, /Absage an Kandidat Reaktion149Dritt/);

  const nach = await db('vorlage_positionen').where({ id: p.id }).first();
  assert.ok(nach.absage_verschickt_am);

  const spur = await db('audit_log').where({ action: 'kandidat.abgesagt' }).orderBy('id', 'desc').first();
  assert.ok(spur, 'eine Absage ist ein Vorgang und steht im Protokoll');
});

test('Zweimal absagen geht nicht', async () => {
  const res = await post(`/api/vorlagen/absagen/${pos('dritt').id}/verschicken`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 409);
});

test('Ohne Mailadresse wird das gesagt, nicht geraten', async () => {
  const p = pos('ohne');
  await post(`/api/vorlagen/oeffentlich/${token}/profil/${p.id}/reaktion`, { reaktion: 'abgelehnt' });
  const res = await post(`/api/vorlagen/absagen/${p.id}/verschicken`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /persönlich absagen/);
});

test('Selbst erledigt heißt erledigt, ohne Mail', async () => {
  const p = pos('ohne');
  const res = await post(`/api/vorlagen/absagen/${p.id}/selbst-erledigt`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  assert.match((await res.json()).message, /keine Mail/);

  const nach = await db('vorlage_positionen').where({ id: p.id }).first();
  assert.ok(nach.absage_verschickt_am, 'aus der Liste raus');
});

test('Nach einer verschickten Absage ändert der Kunde nichts mehr allein', async () => {
  const p = pos('dritt');
  const res = await post(`/api/vorlagen/oeffentlich/${token}/profil/${p.id}/reaktion`,
    { reaktion: 'einladen' });
  assert.strictEqual(res.status, 409);
  assert.match((await res.json()).error, /persönlich/);
});

/* ------------------------------ Die Übersicht ----------------------------- */

test('Der Stand zählt richtig', async () => {
  const v = await db('vorlagen').where({ token }).first();
  const s = await kr.stand(db, v.id);
  assert.strictEqual(s.gesamt, 3);
  assert.strictEqual(s.einladen, 1);
  assert.strictEqual(s.abgelehnt, 2);
  assert.strictEqual(s.offen, 0);
  assert.strictEqual(s.absagen_offen, 0, 'beide sind erledigt');
});

test('Ein Entwurf nimmt keine Reaktionen an', async () => {
  const anlegen = await (await post('/api/vorlagen', {
    project_id: projektId, expert_ids: [ids.mit],
  }, { cookie: adminCookie })).json();
  const v = await db('vorlagen').where({ id: anlegen.vorlage.id }).first();
  const p = await db('vorlage_positionen').where({ vorlage_id: v.id }).first();

  const res = await post(`/api/vorlagen/oeffentlich/${v.token}/profil/${p.id}/reaktion`,
    { reaktion: 'einladen' });
  assert.strictEqual(res.status, 404);
});

test('Eine unbekannte Antwort wird abgewiesen', async () => {
  const res = await post(`/api/vorlagen/oeffentlich/${token}/profil/${pos('mit').id}/reaktion`,
    { reaktion: 'vielleicht' });
  assert.strictEqual(res.status, 404);
});

test('Die Absageliste ist Verwaltungssache', async () => {
  assert.strictEqual((await get('/api/vorlagen/absagen/offen')).status, 401);
  assert.strictEqual((await post(`/api/vorlagen/absagen/${pos('mit').id}/verschicken`, {})).status, 401);
});
