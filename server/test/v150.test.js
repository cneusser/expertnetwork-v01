/**
 * v1.50.0 — Die Terminadresse kommt vom Server.
 *
 * Sie zeigte auf Calendly, zeigt jetzt auf die Termin-App in Phalanx OS, und
 * der Link enthält einen Token, der irgendwann ein anderer ist. Ein Wert,
 * den man nur durch einen neuen Build ändern kann, ändert irgendwann niemand
 * mehr.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const konfig = require('../routes/konfig');

let server; let baseUrl;
const get = (p) => fetch(baseUrl + p);

before(async () => {
  await db.migrate.latest();
  await seed();
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.destroy(); });

test('Ohne Angabe zeigt der Termin auf Phalanx OS', () => {
  const sichern = process.env.TERMIN_URL;
  delete process.env.TERMIN_URL;
  const u = konfig.terminUrl();
  assert.match(u, /phalanx-os-production\.up\.railway\.app\/api\/termine\//);
  assert.ok(!u.includes('calendly'), 'Calendly ist abgelöst');
  if (sichern !== undefined) process.env.TERMIN_URL = sichern;
});

test('Die Adresse lässt sich ohne neuen Build ändern', () => {
  const sichern = process.env.TERMIN_URL;
  process.env.TERMIN_URL = 'https://phalanx-os-production.up.railway.app/api/termine/anderer-token?typ=3';
  assert.match(konfig.terminUrl(), /anderer-token/);
  if (sichern === undefined) delete process.env.TERMIN_URL; else process.env.TERMIN_URL = sichern;
});

test('Ein unbrauchbarer Wert führt nicht ins Leere', () => {
  const sichern = process.env.TERMIN_URL;
  for (const unsinn of ['javascript:alert(1)', 'ftp://irgendwo', 'nur text', '']) {
    process.env.TERMIN_URL = unsinn;
    assert.strictEqual(konfig.terminUrl(), konfig.TERMIN_STANDARD,
      `"${unsinn}" darf nicht in einen Knopf geraten`);
  }
  if (sichern === undefined) delete process.env.TERMIN_URL; else process.env.TERMIN_URL = sichern;
});

test('Die Konfiguration ist ohne Anmeldung erreichbar', async () => {
  // Der Terminknopf steht auch auf der Anmeldeseite.
  const res = await get('/api/konfig');
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  // v1.51.0: Der Knopf zeigt auf den eigenen Zählpfad, der von dort weiter
  // auf die Termin-App leitet. Das Ziel steht weiter dabei, falls jemand
  // den Umweg nicht gehen will.
  assert.strictEqual(d.termin_url, '/api/konfig/termin');
  assert.ok(d.termin_ziel.startsWith('https://'));
});

test('Es stehen keine Geheimnisse in der Konfiguration', async () => {
  const text = await (await get('/api/konfig')).text();
  for (const feld of ['secret', 'password', 'api_key', 'jwt', 'client_secret']) {
    assert.ok(!text.toLowerCase().includes(feld), `"${feld}" gehört hier nicht hin`);
  }
});
