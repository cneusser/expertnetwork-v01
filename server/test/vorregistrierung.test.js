/**
 * v1.25.0 — Vorregistrierung aus Kontaktlisten.
 * Geprüft werden: Import mit Dubletten über E-Mail, LinkedIn und Namen,
 * Idempotenz, Zusammenführung auf allen drei Wegen, kein Raten bei
 * mehrdeutigen Namen, Banner-Logik, Aufbewahrungsfrist und die Zusage,
 * dass an Vorregistrierte keine automatische Post geht.
 * Alle Namen in diesem Test sind erfunden.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const { importiereListe, findePerson, VORREG } = require('../utils/vorregistrierung');
const { nameKey, linkedinKey } = require('../utils/normalisieren');
const { runAvailabilityReminders, runProfilCheck, runInviteLifecycle, runVorregLoeschfrist } = require('../jobs');

let server; let baseUrl; let adminCookie; let tenantId;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });

/** Erfundene Liste, bewusst mit schmutzigen Schreibweisen. */
const LISTE = [
  { vorname: 'Roswitha', nachname: 'Kellerhals', email: '', sprache: 'de',
    linkedin: 'https://DE.linkedin.com/in/roswitha-kellerhals-42/?originalSubdomain=de',
    firma: 'Kellerhals Interim', berufsbezeichnung: 'Interim CFO', quelle: 'Testliste', prio: 'a',
    kanal: 'linkedin', letzter_kontakt: '2026-05-02' },
  { vorname: 'Dr. Ansgar', nachname: 'Wittkugel', email: 'ANSGAR@wittkugel-partner.example', sprache: 'de',
    linkedin: 'https://www.linkedin.com/in/ansgar-wittkugel', firma: 'Wittkugel & Partner',
    berufsbezeichnung: 'Restrukturierer', quelle: 'Testliste', prio: 'B', kanal: 'email', letzter_kontakt: '2026-06-14' },
  { vorname: 'Marlies', nachname: 'Obernhuber', email: '', sprache: 'de',
    linkedin: 'https://www.linkedin.com/in/marlies-obernhuber', firma: 'Obernhuber Consulting',
    berufsbezeichnung: 'Interim COO', quelle: 'Testliste', prio: 'A', kanal: 'linkedin', letzter_kontakt: '' },
  { vorname: '', nachname: 'Ohnevorname', email: '', linkedin: '', firma: '', berufsbezeichnung: '', quelle: '', prio: '', kanal: '', letzter_kontakt: '' },
];

before(async () => {
  await db.migrate.latest();
  await seed();
  const tenant = await db('tenants').where({ slug: 'phalanx' }).first();
  tenantId = tenant.id;
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await post('/api/auth/login', {
    email: process.env.ADMIN_EMAIL || 'admin@phalanx.example',
    password: process.env.ADMIN_PASSWORD || 'phalanx-admin-2026',
  })).headers.get('set-cookie');
});

after(async () => { server.close(); await db.destroy(); });

test('Import legt an, normalisiert und meldet fehlende Namen', async () => {
  const e = await importiereListe(LISTE, { tenantId });
  assert.strictEqual(e.angelegt.length, 3);
  assert.strictEqual(e.fehler.length, 1);
  assert.match(e.fehler[0].grund, /Vorname oder Nachname fehlt/);

  const roswitha = await db('experts').where({ tenant_id: tenantId, nachname: 'Kellerhals' }).first();
  assert.strictEqual(roswitha.status, VORREG);
  assert.strictEqual(roswitha.user_id, null, 'kein Konto');
  assert.strictEqual(roswitha.linkedin, 'linkedin.com/in/roswitha-kellerhals-42', 'LinkedIn normalisiert');
  assert.strictEqual(roswitha.name_key, 'roswitha|kellerhals');
  assert.strictEqual(roswitha.vorreg_prio, 'A', 'Prio in Großbuchstaben');
  assert.strictEqual(roswitha.vorreg_kanal, 'linkedin');
  assert.ok(roswitha.vorreg_importiert_am);

  const ansgar = await db('experts').where({ tenant_id: tenantId, nachname: 'Wittkugel' }).first();
  assert.strictEqual(ansgar.email, 'ansgar@wittkugel-partner.example', 'E-Mail klein');
  assert.strictEqual(ansgar.name_key, 'ansgar|wittkugel', 'akademischer Grad raus');
  assert.strictEqual(ansgar.vorname, 'Dr. Ansgar', 'Anzeigename bleibt wie geliefert');

  // Keine Einwilligung, kein Konto, also auch keine Consent-Zeile
  assert.strictEqual(await db('consents').where({ user_id: null }).first(), undefined);
});

test('Zweiter Lauf legt nichts doppelt an (Idempotenz und drei Dublettenwege)', async () => {
  const vorher = await db('experts').where({ tenant_id: tenantId }).count('* as c').first();
  const e = await importiereListe(LISTE, { tenantId });
  const nachher = await db('experts').where({ tenant_id: tenantId }).count('* as c').first();
  assert.strictEqual(Number(vorher.c), Number(nachher.c), 'keine neuen Zeilen');
  assert.strictEqual(e.angelegt.length, 0);
  assert.strictEqual(e.vorhanden.length, 3);

  // Dieselben Personen in anderer Schreibweise, jeder Weg einzeln
  const variiert = [
    // nur E-Mail passt, Name und LinkedIn anders geschrieben
    { vorname: 'Ansgar', nachname: 'Wittkugel-Neu', email: 'ansgar@WITTKUGEL-PARTNER.example', linkedin: '' },
    // nur LinkedIn passt
    { vorname: 'Rosi', nachname: 'Kellerhals-Anders', email: '', linkedin: 'www.linkedin.com/in/roswitha-kellerhals-42/' },
    // nur der Name passt
    { vorname: 'Marlies', nachname: 'Obernhuber', email: '', linkedin: '' },
  ];
  const e2 = await importiereListe(variiert, { tenantId });
  assert.strictEqual(e2.angelegt.length, 0, 'alle drei als Dublette erkannt');
  assert.deepStrictEqual(e2.vorhanden.map((v) => v.erkannt_ueber), ['email', 'linkedin', 'name']);
});

test('Registrierung führt über E-Mail, LinkedIn und eindeutigen Namen zusammen', async () => {
  // 1. Weg E-Mail
  const r1 = await post('/api/auth/register', {
    email: 'ansgar@wittkugel-partner.example', password: 'ein-gutes-passwort', consent: true,
    vorname: 'Ansgar', nachname: 'Wittkugel',
  });
  assert.strictEqual(r1.status, 201);
  const ansgar = await db('experts').where({ email: 'ansgar@wittkugel-partner.example' }).first();
  assert.ok(ansgar.user_id, 'Konto verknüpft');
  assert.strictEqual(ansgar.status, 'registriert');
  assert.ok(ansgar.vorreg_zusammengefuehrt_am, 'als zusammengeführt markiert');
  assert.strictEqual(ansgar.firma, 'Wittkugel & Partner', 'Firma aus der Vorregistrierung übernommen');
  assert.strictEqual(await db('experts').where({ user_id: ansgar.user_id }).count('* as c').first().then((x) => Number(x.c)), 1,
    'genau ein Datensatz je Konto');
  assert.ok(await db('audit_log').where({ action: 'expert.vorregistrierung_zusammengefuehrt', resource_id: ansgar.id }).first());
  const willkommen = await db('mail_outbox').where({ template_key: 'profil_ergaenzen', to_email: ansgar.email }).first();
  assert.ok(willkommen, 'einmalige Willkommensmail');
  assert.ok(!willkommen.body_html.includes('—'), 'keine Gedankenstriche');

  // 2. Weg LinkedIn, fremde E-Mail
  const r2 = await post('/api/auth/register', {
    email: 'r.kellerhals@example.org', password: 'ein-gutes-passwort', consent: true,
    vorname: 'Roswitha', nachname: 'Kellerhals-Verheiratet',
    linkedin: 'https://www.linkedin.com/in/roswitha-kellerhals-42',
  });
  assert.strictEqual(r2.status, 201);
  const roswitha = await db('experts').where({ email: 'r.kellerhals@example.org' }).first();
  assert.ok(roswitha.vorreg_zusammengefuehrt_am, 'über LinkedIn zugeordnet');
  assert.strictEqual(roswitha.firma, 'Kellerhals Interim');
  assert.strictEqual(roswitha.nachname, 'Kellerhals-Verheiratet', 'aktueller Name gewinnt');
  assert.strictEqual(roswitha.name_key, 'roswitha|kellerhals-verheiratet', 'Schlüssel zieht nach');

  // 3. Weg Name, weder E-Mail noch LinkedIn bekannt
  const r3 = await post('/api/auth/register', {
    email: 'marlies@obernhuber-consulting.example', password: 'ein-gutes-passwort', consent: true,
    vorname: 'Marlies', nachname: 'Obernhuber',
  });
  assert.strictEqual(r3.status, 201);
  const marlies = await db('experts').where({ email: 'marlies@obernhuber-consulting.example' }).first();
  assert.ok(marlies.vorreg_zusammengefuehrt_am, 'über den Namen zugeordnet');
  assert.strictEqual(marlies.berufsbezeichnung, 'Interim COO');
});

test('Mehrdeutiger Name wird nicht geraten, sondern in die Warteliste gelegt', async () => {
  // Der Import selbst legt keine zwei Namensgleichen an, die zweite Zeile gilt als
  // Dublette. Mehrdeutigkeit entsteht aus Altbestand, deshalb hier direkt eingesetzt.
  const e1 = await importiereListe([
    { vorname: 'Tilo', nachname: 'Brenneisen', firma: 'Brenneisen Nord', berufsbezeichnung: 'Interim CEO',
      linkedin: 'https://www.linkedin.com/in/tilo-brenneisen-nord', quelle: 'Testliste', prio: 'A', kanal: 'linkedin' },
    { vorname: 'Tilo', nachname: 'Brenneisen', firma: 'Brenneisen Süd', berufsbezeichnung: 'Interim CTO',
      linkedin: 'https://www.linkedin.com/in/tilo-brenneisen-sued', quelle: 'Testliste', prio: 'B', kanal: 'linkedin' },
  ], { tenantId });
  assert.strictEqual(e1.angelegt.length, 1, 'Namensgleiche in einer Datei gelten als Dublette');
  assert.strictEqual(e1.vorhanden[0].erkannt_ueber, 'name');
  await db('experts').insert({
    tenant_id: tenantId, status: VORREG, vorname: 'Tilo', nachname: 'Brenneisen',
    firma: 'Brenneisen Süd', berufsbezeichnung: 'Interim CTO', name_key: 'tilo|brenneisen',
    linkedin: 'linkedin.com/in/tilo-brenneisen-sued', vorreg_quelle: 'Altbestand', vorreg_importiert_am: new Date(),
  });
  assert.strictEqual(await db('experts').where({ name_key: 'tilo|brenneisen' }).count('* as c').first().then((x) => Number(x.c)), 2);

  const res = await post('/api/auth/register', {
    email: 'tilo@brenneisen.example', password: 'ein-gutes-passwort', consent: true,
    vorname: 'Tilo', nachname: 'Brenneisen',
  });
  assert.strictEqual(res.status, 201);
  const neu = await db('experts').where({ email: 'tilo@brenneisen.example' }).first();
  assert.strictEqual(neu.vorreg_zusammengefuehrt_am, null, 'nichts geraten');
  assert.strictEqual(await db('experts').where({ name_key: 'tilo|brenneisen' }).count('* as c').first().then((x) => Number(x.c)), 3,
    'beide Vorbereiteten bleiben unangetastet');

  const warteliste = await (await fetch(`${baseUrl}/api/experts/vorregistrierung/zuordnung-pruefen`, { headers: { cookie: adminCookie } })).json();
  const fall = warteliste.faelle.find((f) => f.person.id === neu.id);
  assert.ok(fall, 'Fall steht in der Warteliste');
  assert.strictEqual(fall.kandidaten.length, 2);

  // Admin entscheidet: Nord
  const nord = fall.kandidaten.find((k) => k.firma === 'Brenneisen Nord');
  const zusammen = await post(`/api/experts/${neu.id}/vorregistrierung-zusammenfuehren`, { vorreg_id: nord.id }, { cookie: adminCookie });
  assert.strictEqual(zusammen.status, 200);
  assert.strictEqual(await db('experts').where({ id: neu.id }).first(), undefined, 'Minimalprofil ist weg');
  const gewinner = await db('experts').where({ id: nord.id }).first();
  assert.strictEqual(gewinner.firma, 'Brenneisen Nord');
  assert.ok(gewinner.user_id && gewinner.vorreg_zusammengefuehrt_am);
});

test('Banner erscheint nach der Zusammenführung und verschwindet mit den Angaben', async () => {
  // Anmeldung setzt eine bestätigte Adresse voraus, also erst den Link einlösen.
  const { signPurposeToken } = require('../utils/tokens');
  const user = await db('users').where({ email: 'ansgar@wittkugel-partner.example' }).first();
  const bestaetigt = await post('/api/auth/verify', { token: signPurposeToken(user.id, 'verify-email', '7d') });
  assert.strictEqual(bestaetigt.status, 200);
  const login = await post('/api/auth/login', { email: 'ansgar@wittkugel-partner.example', password: 'ein-gutes-passwort' });
  const cookie = login.headers.get('set-cookie');
  assert.strictEqual(login.status, 200);

  const vorher = await (await fetch(`${baseUrl}/api/experts/me/dashboard`, { headers: { cookie } })).json();
  assert.strictEqual(vorher.vorreg_banner, true);

  const expert = await db('experts').where({ email: 'ansgar@wittkugel-partner.example' }).first();
  // Der Seed bringt keine Skills mit, also drei erfundene anlegen.
  const skillIds = [];
  for (const name of ['Testkompetenz Alpha', 'Testkompetenz Beta', 'Testkompetenz Gamma']) {
    const [s] = await db('skills').insert({ name, kategorie: 'kompetenz', is_approved: true }).returning('id');
    skillIds.push(s.id || s);
  }
  for (const id of skillIds) await db('expert_skills').insert({ expert_id: expert.id, skill_id: id });
  await db('rates').insert({ tenant_id: tenantId, expert_id: expert.id, kategorie: 'interim', satz_von_eur: 1400,
    gueltig_ab: new Date().toISOString().slice(0, 10) });
  await db('availabilities').insert({ tenant_id: tenantId, expert_id: expert.id, status: 'sofort', confirmed_at: new Date() });

  const nachher = await (await fetch(`${baseUrl}/api/experts/me/dashboard`, { headers: { cookie } })).json();
  assert.strictEqual(nachher.vorreg_banner, false);
});

test('An Vorregistrierte geht keine automatische Post, und die Frist räumt auf', async () => {
  const vorregEmails = await db('experts').where({ status: VORREG }).whereNotNull('email').pluck('email');
  const vorher = await db('mail_outbox').count('* as c').first();
  await runAvailabilityReminders();
  await runProfilCheck();
  await runInviteLifecycle();
  const nachher = await db('mail_outbox').count('* as c').first();
  for (const mail of vorregEmails) {
    assert.strictEqual(await db('mail_outbox').where({ to_email: mail }).first(), undefined, `keine Mail an ${mail}`);
  }
  assert.ok(Number(nachher.c) >= Number(vorher.c));

  // Frist: ein alter Datensatz verschwindet, ein frischer bleibt
  await db('experts').insert({
    tenant_id: tenantId, status: VORREG, vorname: 'Frieda', nachname: 'Neuzugang',
    name_key: 'frieda|neuzugang', vorreg_quelle: 'Testliste', vorreg_importiert_am: new Date(),
  });
  const alt = await db('experts').where({ status: VORREG }).whereNot('nachname', 'Neuzugang').first();
  await db('experts').where({ id: alt.id }).update({ vorreg_importiert_am: new Date(Date.now() - 130 * 86400000) });
  const lauf = await runVorregLoeschfrist();
  assert.strictEqual(lauf.geloescht, 1);
  assert.strictEqual(lauf.tage, 120);
  assert.strictEqual(await db('experts').where({ id: alt.id }).first(), undefined);
  assert.ok(await db('audit_log').where({ action: 'expert.vorregistrierung_frist_geloescht', resource_id: alt.id }).first());
  assert.ok(await db('experts').where({ status: VORREG, nachname: 'Neuzugang' }).first(), 'frische Datensätze bleiben');
});

test('Import über die Route: Datei, Ergebnis-CSV und Rechteschutz', async () => {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { Vorname: 'Sieglinde', Nachname: 'Habermeier', 'E-Mail': '', Sprache: 'de',
      LinkedIn: 'https://www.linkedin.com/in/sieglinde-habermeier', Firma: 'Habermeier Interim',
      Berufsbezeichnung: 'Interim CRO', Quelle: 'Testliste', Prio: 'A', Kanal: 'linkedin', 'Letzter Kontakt': '2026-07-01' },
  ]), 'Import');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const form = new FormData();
  form.append('file', new Blob([buffer]), 'liste.xlsx');
  const res = await fetch(`${baseUrl}/api/experts/vorregistrierung-import`, { method: 'POST', headers: { cookie: adminCookie }, body: form });
  assert.strictEqual(res.status, 200);
  const d = await res.json();
  assert.strictEqual(d.angelegt, 1);
  assert.match(d.csv, /"Sieglinde";"Habermeier"/);
  assert.match(d.csv, /neu vorregistriert/);
  assert.ok(await db('audit_log').where({ action: 'expert.vorregistrierung_import' }).first());

  // Angeschrieben am pflegen
  const sieglinde = await db('experts').where({ nachname: 'Habermeier' }).first();
  const put = await fetch(`${baseUrl}/api/experts/${sieglinde.id}/vorreg`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ vorreg_angeschrieben_am: '2026-09-04' }),
  });
  assert.strictEqual(put.status, 200);
  const gepflegt = new Date((await db('experts').where({ id: sieglinde.id }).first()).vorreg_angeschrieben_am);
  // Ortszeit lesen, sonst rutscht das Datum in östlichen Zeitzonen einen Tag zurück.
  const alsText = `${gepflegt.getFullYear()}-${String(gepflegt.getMonth() + 1).padStart(2, '0')}-${String(gepflegt.getDate()).padStart(2, '0')}`;
  assert.strictEqual(alsText, '2026-09-04');

  const ohneLogin = await fetch(`${baseUrl}/api/experts/vorregistrierung-import`, { method: 'POST', body: new FormData() });
  assert.strictEqual(ohneLogin.status, 401);
});

test('Schlüssel: Titel, Umlaute und LinkedIn-Varianten', () => {
  assert.strictEqual(nameKey('Prof. Dr. Änne', 'Öztürk-Weiß'), 'aenne|oeztuerk-weiss');
  assert.strictEqual(nameKey('Dipl.-Ing. Kurt', 'Groß'), 'kurt|gross');
  assert.strictEqual(nameKey('Hans H.', 'Meier'), nameKey('Hans', 'Meier'));
  assert.strictEqual(nameKey('Dr.', 'Ohnevorname'), null, 'ohne echten Vornamen kein Schlüssel');
  assert.strictEqual(linkedinKey('https://DE.linkedin.com/in/Test-Person/?trk=x'), 'linkedin.com/in/test-person');
  assert.strictEqual(linkedinKey('https://xing.com/profile/x'), null);
});

test('Suche findet niemanden über einen leeren Schlüssel', async () => {
  const fund = await findePerson(tenantId, { email: '', linkedin: '', vorname: 'Dr.', nachname: '' });
  assert.strictEqual(fund.treffer, null);
});
