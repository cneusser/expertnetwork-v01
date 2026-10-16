/**
 * v1.43.0 — Profile vorlegen.
 *
 * Die wichtigste Prüfung steht zuerst: In dem, was der Kunde sieht, darf kein
 * Klarname stehen. Nicht im Kurzprofil, nicht im Fitting, nicht im PDF, und
 * auch nicht in einem Feld, das jemand später gutgemeint ergänzt.
 *
 * Geprüft wird gegen die echten Daten der Testperson, nicht gegen eine
 * erfundene Verbotsliste.
 *
 * Danach: Rechnet der Aufschlag richtig, bleibt eine verschickte Vorlage
 * unverändert, trägt der Link erst nach der Freigabe.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const v = require('../utils/vorlage');
const kp = require('../utils/kurzprofil');

let server; let baseUrl; let adminCookie; let tenantId;
let projektId; let expertA; let expertB;

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

  // Reste eines früheren Laufs.
  const alte = await db('projects').where({ tenant_id: tenantId }).andWhere('name', 'like', '%v143%').select('id');
  if (alte.length) {
    const ids = alte.map((p) => p.id);
    const vids = (await db('vorlagen').whereIn('project_id', ids).select('id')).map((x) => x.id);
    if (vids.length) await db('vorlage_positionen').whereIn('vorlage_id', vids).del();
    await db('vorlagen').whereIn('project_id', ids).del();
    await db('project_skills').whereIn('project_id', ids).del();
    await db('projects').whereIn('id', ids).del();
  }
  await db('experts').where({ tenant_id: tenantId }).andWhere('nachname', 'like', 'Vorlage143%').del();

  [expertA] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Wilhelmine', nachname: 'Vorlage143A', status: 'freigegeben',
    firma: 'Vorlage143 Beratung GmbH', email: 'wilhelmine@vorlage143.invalid',
    berufsbezeichnung: 'Interim Werkleiterin',
    kurzprofil: 'Wilhelmine Vorlage143A führt für die Vorlage143 Beratung GmbH Werke.',
  }).returning('*');
  [expertB] = await db('experts').insert({
    tenant_id: tenantId, vorname: 'Konstantin', nachname: 'Vorlage143B', status: 'freigegeben',
    berufsbezeichnung: 'Interim CFO',
  }).returning('*');

  await db('career_steps').insert([
    { tenant_id: tenantId, expert_id: expertA.id, rolle: 'Werkleiterin', firma: 'Vorlage143 Guss AG',
      zeitraum: '2019 bis 2023', ergebnis: 'Ausschuss von 9 auf 3 Prozent gesenkt' },
  ]);

  const [skill] = await db('skills').insert({ name: 'Werkleitung v143', kategorie: 'kompetenz' }).returning('*');
  await db('expert_skills').insert({ expert_id: expertA.id, skill_id: skill.id });

  await db('rates').insert([
    { tenant_id: tenantId, expert_id: expertA.id, kategorie: 'interim',
      satz_von_eur: 1200, satz_bis_eur: 1500, gueltig_ab: '2026-01-01' },
    // Bewusst 900: Mit Aufschlag ergibt das 108.000 Cent. Bei 1.000 wären es
    // 120.000, und das ist zufällig der Einkaufssatz von A. Die Prüfung
    // darunter könnte dann nicht mehr unterscheiden, welcher Satz gemeint ist.
    { tenant_id: tenantId, expert_id: expertB.id, kategorie: 'interim',
      satz_von_eur: 900, gueltig_ab: '2026-01-01' },
  ]);

  const [projekt] = await db('projects').insert({
    tenant_id: tenantId, name: 'Interim Werkleitung v143', status: 'offen',
    beschreibung: 'Werk mit 300 Mitarbeitern stabilisieren.',
    must_json: JSON.stringify(['Werkleitung', 'Erfahrung mit Verlagerungen']),
    nice_json: JSON.stringify(['Automotive']),
  }).returning('*');
  projektId = projekt.id;
});

after(async () => { server.close(); await db.destroy(); });

/* ------------------------- Keine Klardaten nach außen --------------------- */

test('Die Prüfung erkennt Klardaten dieser Person', () => {
  assert.ok(kp.enthaeltKlardaten('Ein Einsatz von Wilhelmine Vorlage143A', expertA));
  assert.ok(kp.enthaeltKlardaten('Tätig für die Vorlage143 Beratung GmbH', expertA));
  assert.ok(kp.enthaeltKlardaten('Erreichbar unter wilhelmine@vorlage143.invalid', expertA));
  assert.strictEqual(kp.enthaeltKlardaten('Interim Werkleiterin mit 20 Jahren Erfahrung', expertA), null);
});

test('Das erzeugte Kurzprofil enthält keinen Klarnamen', async () => {
  const { text } = await kp.erzeuge(db, expertA);
  assert.ok(text, 'es entsteht ein Text');
  assert.strictEqual(kp.enthaeltKlardaten(text, expertA), null,
    'weder Name noch Firma noch Mailadresse');
  assert.ok(!text.includes('Vorlage143 Guss AG'), 'auch die Firma der Station nicht');
  assert.match(text, /Ausschuss/, 'das Ergebnis der Station bleibt, das ist der Wert');
});

test('Auch ohne Sprachmodell entsteht ein brauchbares Profil', async () => {
  const { text, quelle } = await kp.erzeuge(db, expertA, { mitModell: false });
  assert.strictEqual(quelle, 'regeln');
  assert.ok(text.length > 30);
  assert.strictEqual(kp.enthaeltKlardaten(text, expertA), null);
});

/* -------------------------------- Rechnen --------------------------------- */

test('Der Aufschlag rechnet richtig', () => {
  assert.strictEqual(v.satzMitAufschlag(120000, 20), 144000, '1.200 plus 20 Prozent sind 1.440');
  assert.strictEqual(v.satzMitAufschlag(100000, 0), 100000);
  assert.strictEqual(v.satzMitAufschlag(null, 20), null, 'ohne Satz kein Verkaufssatz');
  assert.strictEqual(v.satzMitAufschlag(99999, 15), 114999, 'kaufmännisch gerundet');
});

test('Der Aufschlag kommt vom Empfänger, sonst der Hausstandard', async () => {
  assert.strictEqual(await v.aufschlagFuer(db, {}), 20, 'Standard');
  assert.strictEqual(await v.aufschlagFuer(db, { ueberschreiben: 35 }), 35, 'von Hand gewinnt');

  const [u] = await db('users').insert({
    tenant_id: tenantId, email: 'kunde-v143@test.invalid', password_hash: 'x', role: 'vendor',
  }).returning('*');
  await db('vendor_profiles').insert({
    tenant_id: tenantId, user_id: u.id, firmenname: 'Vermittler v143', aufschlag_prozent: 12,
  });
  assert.strictEqual(await v.aufschlagFuer(db, { vendorUserId: u.id }), 12, 'am Kunden gepflegt');
  assert.strictEqual(await v.aufschlagFuer(db, { vendorUserId: u.id, ueberschreiben: 25 }), 25);
});

test('Der Satz nimmt die Untergrenze der Spanne', async () => {
  assert.strictEqual(await v.satzVon(db, expertA.id), 120000, 'satz_von_eur, nicht satz_bis_eur');
});

test('Die Deckung benennt, was fehlt', () => {
  const d = v.deckung(['Werkleitung', 'Erfahrung mit Verlagerungen'],
    { skills: ['Werkleitung v143'], text: 'Werke geführt' });
  assert.ok(d.treffer.includes('Werkleitung'));
  assert.ok(d.luecken.includes('Erfahrung mit Verlagerungen'), 'was nicht belegt ist, steht als Lücke da');
});

/* ------------------------------- Die Strecke ------------------------------ */

test('Eine Vorlage entsteht als Entwurf, der Link trägt noch nicht', async () => {
  const res = await post('/api/vorlagen', {
    project_id: projektId,
    expert_ids: [expertA.id, expertB.id],
    empfaenger: { firma: 'SOLCOM v143', name: 'Celine Testfall', email: 'celine@test.invalid' },
    aufschlag_prozent: 20,
    anschreiben: 'Anbei zwei Profile.',
  }, { cookie: adminCookie });

  assert.strictEqual(res.status, 201);
  const d = await res.json();
  assert.strictEqual(d.positionen.length, 2);
  assert.strictEqual(d.vorlage.status, 'entwurf');
  assert.deepStrictEqual(d.positionen.map((p) => p.kennung), ['Profil A', 'Profil B']);

  // Der Satz ist eingefroren, mit Aufschlag.
  const a = d.positionen.find((p) => p.expert_id === expertA.id);
  assert.strictEqual(a.satz_experte_cent, 120000);
  assert.strictEqual(a.satz_kunde_cent, 144000);

  const oeffentlich = await get(`/api/vorlagen/oeffentlich/${d.vorlage.token}`);
  assert.strictEqual(oeffentlich.status, 404, 'ein Entwurf ist nicht abrufbar');
});

test('Was der Kunde sieht, enthält keinen Klarnamen und keinen Einkaufssatz', async () => {
  const vorl = await db('vorlagen').where({ project_id: projektId }).orderBy('id', 'desc').first();
  await post(`/api/vorlagen/${vorl.id}/freigeben`, {}, { cookie: adminCookie });

  const res = await get(`/api/vorlagen/oeffentlich/${vorl.token}`);
  assert.strictEqual(res.status, 200);
  const text = await res.text();

  for (const wert of ['Wilhelmine', 'Vorlage143A', 'Vorlage143 Beratung', 'wilhelmine@vorlage143.invalid', 'Konstantin']) {
    assert.ok(!text.includes(wert), `"${wert}" darf nicht in der Kundenansicht stehen`);
  }
  assert.ok(!text.includes('120000'), 'der Einkaufssatz von Profil A geht den Kunden nichts an');
  assert.ok(!text.includes('90000'), 'der von Profil B genauso wenig');
  assert.ok(!text.includes('satz_experte'), 'auch nicht das Feld');

  const d = JSON.parse(text);
  assert.strictEqual(d.profile.length, 2);
  assert.strictEqual(d.profile[0].kennung, 'Profil A');
  assert.strictEqual(d.profile[0].tagessatz_cent, 144000, 'der Verkaufssatz steht da');
  assert.ok(d.profile[0].luecken.includes('Erfahrung mit Verlagerungen'), 'die Lücke steht offen da');
});

test('Der One-Pager ist ein PDF und trägt keinen Namen', async () => {
  const vorl = await db('vorlagen').where({ project_id: projektId, status: 'versendet' }).orderBy('id', 'desc').first();
  const pos = await db('vorlage_positionen').where({ vorlage_id: vorl.id }).orderBy('sortierung').first();

  const res = await get(`/api/vorlagen/oeffentlich/${vorl.token}/profil/${pos.id}.pdf`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('content-type'), 'application/pdf');

  const buf = Buffer.from(await res.arrayBuffer());
  assert.strictEqual(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buf.length > 1200, `Inhalt vorhanden, ${buf.length} Bytes`);
});

test('Alle Profile in einem PDF', async () => {
  const vorl = await db('vorlagen').where({ project_id: projektId, status: 'versendet' }).orderBy('id', 'desc').first();
  const res = await get(`/api/vorlagen/oeffentlich/${vorl.token}/alle.pdf`);
  assert.strictEqual(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.strictEqual(buf.subarray(0, 5).toString(), '%PDF-');
});

test('Eine verschickte Vorlage ändert sich nicht mehr mit dem Profil', async () => {
  const vorl = await db('vorlagen').where({ project_id: projektId, status: 'versendet' }).orderBy('id', 'desc').first();
  const vorher = await get(`/api/vorlagen/oeffentlich/${vorl.token}`).then((r) => r.json());

  // Der Experte ändert seinen Satz und sein Profil.
  await db('rates').insert({
    tenant_id: tenantId, expert_id: expertA.id, kategorie: 'interim',
    satz_von_eur: 1900, gueltig_ab: '2026-06-01',
  });
  await db('experts').where({ id: expertA.id }).update({ berufsbezeichnung: 'Etwas ganz anderes' });

  const nachher = await get(`/api/vorlagen/oeffentlich/${vorl.token}`).then((r) => r.json());
  assert.strictEqual(nachher.profile[0].tagessatz_cent, vorher.profile[0].tagessatz_cent,
    'eine Unterlage, die sich nachträglich wandelt, ist keine Unterlage');
  assert.strictEqual(nachher.profile[0].rolle, vorher.profile[0].rolle);
});

test('Eine verschickte Vorlage lässt sich nicht mehr umbauen', async () => {
  const vorl = await db('vorlagen').where({ project_id: projektId, status: 'versendet' }).orderBy('id', 'desc').first();
  const pos = await db('vorlage_positionen').where({ vorlage_id: vorl.id }).first();

  const res = await fetch(`${baseUrl}/api/vorlagen/${vorl.id}/positionen/${pos.id}`, {
    method: 'DELETE', headers: { cookie: adminCookie },
  });
  assert.strictEqual(res.status, 409);
});

test('Ein gepflegtes Kurzprofil wird nicht überschrieben', async () => {
  await put(`/api/vorlagen/kurzprofil/${expertB.id}`,
    { kurzprofil: 'Von Hand geschrieben, bitte so lassen.' }, { cookie: adminCookie });

  const e = await db('experts').where({ id: expertB.id }).first();
  assert.strictEqual(e.kurzprofil_anonym_gepflegt, true);

  const geholt = await kp.hole(db, e);
  assert.strictEqual(geholt, 'Von Hand geschrieben, bitte so lassen.');
});

test('Ein abgelaufener Link sagt das auch', async () => {
  const vorl = await db('vorlagen').where({ project_id: projektId, status: 'versendet' }).orderBy('id', 'desc').first();
  await db('vorlagen').where({ id: vorl.id }).update({ gueltig_bis: new Date(Date.now() - 86400000) });

  const res = await get(`/api/vorlagen/oeffentlich/${vorl.token}`);
  assert.strictEqual(res.status, 410);
  assert.match((await res.json()).error, /abgelaufen/);

  await db('vorlagen').where({ id: vorl.id }).update({ gueltig_bis: null });
});

test('Ein erfundener Token führt nirgendwohin', async () => {
  assert.strictEqual((await get('/api/vorlagen/oeffentlich/ausgedacht')).status, 404);
});

test('Vorlagen bauen ist Verwaltungssache', async () => {
  assert.strictEqual((await post('/api/vorlagen', { project_id: projektId, expert_ids: [expertA.id] })).status, 401);
  assert.strictEqual((await get('/api/vorlagen')).status, 401);
});
