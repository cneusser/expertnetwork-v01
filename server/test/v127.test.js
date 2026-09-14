/**
 * v1.27.0 — Übergabe an Capitalmatch.
 * Geprüft werden: Zielgruppe setzen, Link erzeugen und wiederverwenden, Abruf
 * nur mit Schlüssel, Vorbelegung ohne interne Felder, Rückmeldung, Ablauf und
 * die Zusage, dass in der URL keine Personendaten stehen.
 * Alle Namen sind erfunden.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const { importiereListe } = require('../utils/vorregistrierung');

let server; let baseUrl; let adminCookie; let tenantId; let nachfolger;
const SCHLUESSEL = 'test-handover-schluessel-sehr-lang';
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const get = (p, h = {}) => fetch(baseUrl + p, { headers: h });

before(async () => {
  process.env.HANDOVER_KEY = SCHLUESSEL;
  process.env.CAPITALMATCH_URL = 'https://capitalmatch.phalanx.example';
  await db.migrate.latest();
  await seed();
  tenantId = (await db('tenants').where({ slug: 'phalanx' }).first()).id;
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  })).headers.get('set-cookie');

  await importiereListe([{
    vorname: 'Eberhard', nachname: 'Tannenbaum', prio: 'A', kanal: 'linkedin', quelle: 'Testliste',
    linkedin: 'https://www.linkedin.com/in/eberhard-tannenbaum', firma: 'Tannenbaum Beteiligungen',
    berufsbezeichnung: 'Suche Unternehmensnachfolge im Maschinenbau', email: 'eberhard@tannenbaum.example',
  }], { tenantId });
  nachfolger = await db('experts').where({ nachname: 'Tannenbaum' }).first();
  await db('experts').where({ id: nachfolger.id })
    .update({ anrede: 'herr', vorreg_notiz: 'interne Notiz, darf nicht rausgehen' });
});

after(async () => {
  delete process.env.HANDOVER_KEY; delete process.env.CAPITALMATCH_URL;
  server.close(); await db.destroy();
});

test('Zielgruppe setzen und Übergabelink erzeugen', async () => {
  const z = await fetch(`${baseUrl}/api/ansprache/${nachfolger.id}/zielgruppe`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ zielgruppe: 'nachfolger' }),
  });
  assert.strictEqual(z.status, 200);
  assert.strictEqual((await db('experts').where({ id: nachfolger.id }).first()).zielgruppe, 'nachfolger');

  const res = await post(`/api/ansprache/${nachfolger.id}/uebergabe`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.match(d.link, /^https:\/\/capitalmatch\.phalanx\.example\/start\?u=/);
  assert.strictEqual(d.wiederverwendet, false);

  // Entscheidend: in der URL stehen keine Personendaten
  const kennung = new URL(d.link).searchParams.get('u');
  assert.ok(kennung.length >= 24, 'Kennung ist lang genug');
  for (const geheim of ['Eberhard', 'Tannenbaum', 'tannenbaum.example', 'Maschinenbau']) {
    assert.ok(!d.link.includes(geheim), `"${geheim}" darf nicht in der URL stehen`);
  }

  // Zweiter Aufruf gibt denselben Link zurück, damit der verschickte gültig bleibt
  const nochmal = await (await post(`/api/ansprache/${nachfolger.id}/uebergabe`, {}, { cookie: adminCookie })).json();
  assert.strictEqual(nochmal.link, d.link);
  assert.strictEqual(nochmal.wiederverwendet, true);
  assert.strictEqual(await db('handover_tokens').where({ expert_id: nachfolger.id }).count('* as c').first().then((x) => Number(x.c)), 1);

  assert.strictEqual((await post(`/api/ansprache/${nachfolger.id}/uebergabe`, {})).status, 401);
});

test('Abruf der Vorbelegung nur mit Schlüssel und ohne interne Felder', async () => {
  const token = (await db('handover_tokens').where({ expert_id: nachfolger.id }).first()).token;

  assert.strictEqual((await get(`/api/handover/${token}`)).status, 401, 'ohne Schlüssel gesperrt');
  assert.strictEqual((await get(`/api/handover/${token}`, { 'X-Handover-Key': 'falsch' })).status, 401);
  assert.strictEqual((await get(`/api/handover/${token}`, { 'X-Handover-Key': `${SCHLUESSEL}x` })).status, 401,
    'auch ein Schlüssel mit Anhängsel wird abgewiesen');

  const res = await get(`/api/handover/${token}`, { 'X-Handover-Key': SCHLUESSEL });
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.strictEqual(d.person.vorname, 'Eberhard');
  assert.strictEqual(d.person.firma, 'Tannenbaum Beteiligungen');
  assert.strictEqual(d.person.anrede, 'herr');
  assert.strictEqual(d.person.herkunft, 'Phalanx Expert Network');

  // Nur die Felder, die Capitalmatch braucht
  const roh = JSON.stringify(d);
  assert.ok(!roh.includes('interne Notiz'), 'Notizen gehen nicht mit');
  assert.ok(!roh.includes('vorreg_prio'), 'keine internen Vermerke');
  assert.strictEqual(d.person.tagessatz, undefined);

  assert.ok((await db('handover_tokens').where({ token }).first()).abgerufen_at, 'Abruf ist vermerkt');
  assert.ok(await db('audit_log').where({ action: 'expert.uebergabe_abgerufen', resource_id: nachfolger.id }).first());

  assert.strictEqual((await get('/api/handover/gibtsnicht', { 'X-Handover-Key': SCHLUESSEL })).status, 404);
});

test('Rückmeldung setzt die Ansprache auf Interesse', async () => {
  const token = (await db('handover_tokens').where({ expert_id: nachfolger.id }).first()).token;
  const res = await post(`/api/handover/${token}/eingeloest`, {}, { 'X-Handover-Key': SCHLUESSEL });
  assert.strictEqual(res.status, 200);

  const person = await db('experts').where({ id: nachfolger.id }).first();
  assert.strictEqual(person.vorreg_reaktion, 'interesse');
  assert.ok(person.vorreg_reaktion_am);
  assert.ok((await db('handover_tokens').where({ token }).first()).eingeloest_at);

  // Zweimal melden schadet nicht
  assert.strictEqual((await post(`/api/handover/${token}/eingeloest`, {}, { 'X-Handover-Key': SCHLUESSEL })).status, 200);
  assert.strictEqual((await post(`/api/handover/${token}/eingeloest`, {})).status, 401);
});

test('Abgelaufene Kennung gibt nichts mehr heraus', async () => {
  const token = (await db('handover_tokens').where({ expert_id: nachfolger.id }).first()).token;
  await db('handover_tokens').where({ token }).update({ expires_at: new Date(Date.now() - 86400000) });
  assert.strictEqual((await get(`/api/handover/${token}`, { 'X-Handover-Key': SCHLUESSEL })).status, 410);

  // Danach gibt es einen frischen Link
  const neu = await (await post(`/api/ansprache/${nachfolger.id}/uebergabe`, {}, { cookie: adminCookie })).json();
  assert.strictEqual(neu.wiederverwendet, false);
});

test('Übersicht zeigt den Stand, ohne Schlüssel ist die Strecke zu', async () => {
  const d = await (await get('/api/ansprache/uebergaben', { cookie: adminCookie })).json();
  assert.strictEqual(d.zahlen.gesamt, 2);
  assert.strictEqual(d.zahlen.eingeloest, 1);
  assert.strictEqual(d.eingerichtet, true);
  assert.strictEqual(d.uebergaben[0].nachname, 'Tannenbaum');
  assert.strictEqual((await get('/api/ansprache/uebergaben')).status, 401);

  const alt = process.env.HANDOVER_KEY;
  delete process.env.HANDOVER_KEY;
  const token = (await db('handover_tokens').where({ expert_id: nachfolger.id }).orderBy('id', 'desc').first()).token;
  assert.strictEqual((await get(`/api/handover/${token}`, { 'X-Handover-Key': alt })).status, 503,
    'ohne eingerichteten Schlüssel bleibt die Strecke zu, nicht offen');
  process.env.HANDOVER_KEY = alt;
});
