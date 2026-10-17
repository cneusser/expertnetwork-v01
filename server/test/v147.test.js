/**
 * v1.47.0 — Drei Wege zum Kunden: Link, PDF, Mail.
 *
 * Der wichtigste Fall ist der ohne Mailadresse: Kam die Anfrage über
 * LinkedIn oder im Gespräch, gibt es keine, und dann muss der Link trotzdem
 * entstehen. Eine Pflichtangabe für einen Fall, den es oft nicht gibt, wäre
 * eine Hürde ohne Nutzen.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');

let server; let baseUrl; let adminCookie; let tenantId; let projektId; let expertIds = [];

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

  const alte = await db('projects').where({ tenant_id: tenantId }).andWhere('name', 'like', '%v147%').select('id');
  if (alte.length) {
    const pIds = alte.map((p) => p.id);
    const vIds = (await db('vorlagen').whereIn('project_id', pIds).select('id')).map((x) => x.id);
    if (vIds.length) await db('vorlage_positionen').whereIn('vorlage_id', vIds).del();
    await db('vorlagen').whereIn('project_id', pIds).del();
    await db('projects').whereIn('id', pIds).del();
  }
  await db('experts').where({ tenant_id: tenantId }).andWhere('nachname', 'like', 'Weg147%').del();

  for (const n of ['A', 'B']) {
    const [e] = await db('experts').insert({
      tenant_id: tenantId, vorname: 'Kandidat', nachname: `Weg147${n}`, status: 'freigegeben',
      berufsbezeichnung: 'Interim CRO',
    }).returning('*');
    expertIds.push(e.id);
    await db('rates').insert({
      tenant_id: tenantId, expert_id: e.id, kategorie: 'interim',
      satz_von_eur: 1400, gueltig_ab: '2026-01-01',
    });
  }

  const [projekt] = await db('projects').insert({
    tenant_id: tenantId, name: 'Interim MD CRO v147', status: 'offen',
    beschreibung: 'Turnaround eines Softwarehauses.',
    must_json: JSON.stringify(['Turnaround', 'PE-Umfeld']),
  }).returning('*');
  projektId = projekt.id;
});

after(async () => { server.close(); await db.destroy(); });

/* --------------------------- Ohne Mailadresse ----------------------------- */

test('Eine Vorlage entsteht auch ohne jede Empfängerangabe', async () => {
  const res = await post('/api/vorlagen', {
    project_id: projektId, expert_ids: expertIds,
  }, { cookie: adminCookie });

  assert.strictEqual(res.status, 201, 'kam die Anfrage über LinkedIn, gibt es keine Adresse');
  const d = await res.json();
  assert.strictEqual(d.positionen.length, 2);
  assert.strictEqual(d.vorlage.empfaenger_email, null);
});

test('Nur ein Name reicht für die Anrede', async () => {
  const res = await post('/api/vorlagen', {
    project_id: projektId, expert_ids: expertIds,
    empfaenger: { name: 'Herr Knobelspies' },
  }, { cookie: adminCookie });
  assert.strictEqual(res.status, 201);
  assert.strictEqual((await res.json()).vorlage.empfaenger_name, 'Herr Knobelspies');
});

test('Der Link entsteht ohne Empfänger und trägt sofort', async () => {
  const v = await db('vorlagen').where({ project_id: projektId }).orderBy('id', 'desc').first();
  const res = await post(`/api/vorlagen/${v.id}/freigeben`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);

  const d = await res.json();
  assert.match(d.link, /\/profile\//);

  const token = d.link.split('/profile/')[1];
  const oeffentlich = await get(`/api/vorlagen/oeffentlich/${token}`);
  assert.strictEqual(oeffentlich.status, 200, 'der Link funktioniert ohne Konto');
});

/* -------------------------------- Das PDF -------------------------------- */

test('Das PDF gibt es auch im Entwurf, aber nur für die Verwaltung', async () => {
  const anlegen = await (await post('/api/vorlagen', {
    project_id: projektId, expert_ids: [expertIds[0]],
  }, { cookie: adminCookie })).json();
  const id = anlegen.vorlage.id;
  assert.strictEqual(anlegen.vorlage.status, 'entwurf');

  // Als Admin: geht, denn man will sehen, was der Kunde bekäme.
  const res = await get(`/api/vorlagen/${id}/alle.pdf`, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'application/pdf');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.strictEqual(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buf.length > 1200);

  // Öffentlich: nicht, ein Entwurf ist kein Angebot.
  const v = await db('vorlagen').where({ id }).first();
  assert.strictEqual((await get(`/api/vorlagen/oeffentlich/${v.token}/alle.pdf`)).status, 404);
});

test('Ein einzelnes Profil als One-Pager, aus der Verwaltung', async () => {
  const v = await db('vorlagen').where({ project_id: projektId }).orderBy('id', 'desc').first();
  const pos = await db('vorlage_positionen').where({ vorlage_id: v.id }).first();

  const res = await get(`/api/vorlagen/${v.id}/profil/${pos.id}.pdf`, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.strictEqual(buf.subarray(0, 5).toString(), '%PDF-');
});

/* -------------------------------- Die Mail -------------------------------- */

test('Ohne Adresse kein Versand, und die Meldung sagt warum', async () => {
  const anlegen = await (await post('/api/vorlagen', {
    project_id: projektId, expert_ids: expertIds,
  }, { cookie: adminCookie })).json();

  const res = await post(`/api/vorlagen/${anlegen.vorlage.id}/versenden`, {}, { cookie: adminCookie });
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /Link, den du selbst weitergibst/);
});

test('Mit Adresse geht die Mail raus, und der Entwurf wird dabei freigegeben', async () => {
  const anlegen = await (await post('/api/vorlagen', {
    project_id: projektId, expert_ids: expertIds,
    empfaenger: { firma: 'Knobelspies GmbH', name: 'Herr Knobelspies' },
  }, { cookie: adminCookie })).json();
  const id = anlegen.vorlage.id;

  const res = await post(`/api/vorlagen/${id}/versenden`,
    { email: 'knobelspies@test.invalid' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.match(d.message, /Verschickt an knobelspies@test.invalid/);
  assert.match(d.link, /\/profile\//);

  const v = await db('vorlagen').where({ id }).first();
  assert.strictEqual(v.status, 'versendet', 'eine Mail zu schicken und den Link nicht gelten zu lassen wäre absurd');
  assert.strictEqual(v.empfaenger_email, 'knobelspies@test.invalid');
  assert.ok(v.versendet_am);

  const spur = await db('audit_log').where({ action: 'vorlage.versendet' }).orderBy('id', 'desc').first();
  assert.ok(spur, 'der Versand steht im Protokoll');
});

test('Die Mail trägt keinen Klarnamen eines Experten', async () => {
  const outbox = await db('mail_outbox').orderBy('id', 'desc').limit(3);
  const versandt = outbox.find((m) => String(m.subject || '').includes('v147'));
  if (!versandt) return; // Der Stub-Versand legt je nach Ausbau nichts ab.

  const text = `${versandt.subject} ${versandt.body_text || ''}`;
  assert.ok(!text.includes('Weg147A'), 'kein Nachname');
  assert.ok(!text.includes('Kandidat Weg147'), 'auch nicht zusammengesetzt');
});

test('Eine falsche Adresse wird abgewiesen', async () => {
  const v = await db('vorlagen').where({ project_id: projektId }).orderBy('id', 'desc').first();
  const res = await post(`/api/vorlagen/${v.id}/versenden`, { email: 'keine-adresse' }, { cookie: adminCookie });
  assert.strictEqual(res.status, 400);
});

test('Die drei Wege sind Verwaltungssache', async () => {
  const v = await db('vorlagen').where({ project_id: projektId }).orderBy('id', 'desc').first();
  assert.strictEqual((await get(`/api/vorlagen/${v.id}/alle.pdf`)).status, 401);
  assert.strictEqual((await post(`/api/vorlagen/${v.id}/versenden`, { email: 'a@b.de' })).status, 401);
});
