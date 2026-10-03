/**
 * v1.40.1 — Eine falsche Basis-Adresse wird als solche benannt.
 *
 * Aus einem echten Fall: In PHALANX_OS_BASE_URL stand die Rücksprungadresse
 * dieser Anwendung. ExpertNetwork fragte die Discovery damit bei sich selbst
 * ab und meldete "Discovery fehlgeschlagen (401)". Mit dieser Meldung sucht
 * man an der falschen Stelle, und zwar lange.
 */
const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const { basisProblem } = require('../utils/phalanxOs');

const sichern = { basis: process.env.PHALANX_OS_BASE_URL, app: process.env.APP_URL };
afterEach(() => {
  if (sichern.basis === undefined) delete process.env.PHALANX_OS_BASE_URL;
  else process.env.PHALANX_OS_BASE_URL = sichern.basis;
  if (sichern.app === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = sichern.app;
});

test('Die eigene Adresse als Basis wird erkannt', () => {
  process.env.APP_URL = 'https://experts.phalanx.de';
  process.env.PHALANX_OS_BASE_URL = 'https://experts.phalanx.de/api/auth/phalanx/callback';
  const p = basisProblem();
  assert.match(p, /zeigt auf diese Anwendung selbst/);
  assert.match(p, /experts\.phalanx\.de/, 'die Adresse steht in der Meldung');
});

test('Ein Pfad in der Basis wird erkannt', () => {
  process.env.APP_URL = 'https://experts.phalanx.de';
  process.env.PHALANX_OS_BASE_URL = 'https://phalanx-os-production.up.railway.app/oidc';
  assert.match(basisProblem(), /enthält einen Pfad \(\/oidc\)/);
});

test('Eine unbrauchbare Adresse wird erkannt', () => {
  process.env.PHALANX_OS_BASE_URL = 'phalanx-os-production.up.railway.app';
  assert.match(basisProblem(), /keine gültige Adresse/);
});

test('Die richtige Basis gibt keinen Grund zur Klage', () => {
  process.env.APP_URL = 'https://experts.phalanx.de';
  process.env.PHALANX_OS_BASE_URL = 'https://phalanx-os-production.up.railway.app';
  assert.strictEqual(basisProblem(), null);
  process.env.PHALANX_OS_BASE_URL = 'https://phalanx-os-production.up.railway.app/';
  assert.strictEqual(basisProblem(), null, 'ein abschließender Schrägstrich ist kein Pfad');
});

test('Eine fehlende Basis meldet hier nichts, das tut fehlendeVariablen()', () => {
  delete process.env.PHALANX_OS_BASE_URL;
  assert.strictEqual(basisProblem(), null);
});
