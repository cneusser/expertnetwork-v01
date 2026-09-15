/**
 * v1.29.0 — Ansprache: Eingeladene zählen mit, Angeschriebene sind sichtbar,
 * Nachfolger werden vorgeschlagen.
 *
 * Der wichtigste Fall zuerst: Wer als eingeladener Kontakt angesprochen wurde
 * und danach ankommt, muss im Trichter als Erfolg erscheinen. Vorher fiel
 * genau diese Gruppe heraus, der Trichter stand auf null, während auf dem
 * Dashboard neue Profile auftauchten.
 * Alle Namen sind erfunden.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const { importiereListe, VORREG } = require('../utils/vorregistrierung');

let server; let baseUrl; let adminCookie; let tenantId; let ablage;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const get = (p, h = {}) => fetch(baseUrl + p, { headers: h });
const HEUTE = new Date().toISOString().slice(0, 10);
const TAG = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
/**
 * Ein DATE kommt als Date-Objekt zurück und wird beim Serialisieren nach UTC
 * verschoben. Um Mitternacht Ortszeit landet man dadurch im Vortag. Deshalb
 * hier in Ortszeit formatieren statt über toISOString.
 */
const alsTag = (d) => new Date(d).toLocaleDateString('sv-SE');

const LISTE = [
  { vorname: 'Roswitha', nachname: 'Tannenhauer', prio: 'A', kanal: 'linkedin', quelle: 'Testliste v129',
    linkedin: 'https://www.linkedin.com/in/roswitha-tannenhauer', firma: 'Tannenhauer Interim',
    berufsbezeichnung: 'Interim CFO' },
  { vorname: 'Egon', nachname: 'Wallmoden', prio: 'A', kanal: 'linkedin', quelle: 'Testliste v129',
    linkedin: 'https://www.linkedin.com/in/egon-wallmoden', firma: 'Wallmoden Holding',
    berufsbezeichnung: 'Suche Unternehmensnachfolge im Maschinenbau' },
  { vorname: 'Mechthild', nachname: 'Puschkat', prio: 'B', kanal: 'linkedin', quelle: 'Testliste v129',
    linkedin: 'https://www.linkedin.com/in/mechthild-puschkat', firma: 'Puschkat Beratung',
    berufsbezeichnung: 'Beraterin für Restrukturierung' },
];

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

  // Fremddaten aus anderen Testdateien aus dem Weg räumen, sonst stimmt keine Zahl.
  ablage = await db('tenants').where({ slug: 'test-ablage' }).first()
    || (await db('tenants').insert({ name: 'Test-Ablage', slug: 'test-ablage' }).returning('*'))[0];
  await db('ansprache_ausschluss').where({ tenant_id: tenantId }).update({ tenant_id: ablage.id });
  await db('experts').where({ tenant_id: tenantId })
    .where(function ausDerAnsprache() {
      this.whereNotNull('ansprache_seit').orWhereNotNull('vorreg_importiert_am')
        .orWhere('status', 'eingeladen');
    })
    .update({ tenant_id: ablage.id });

  await importiereListe(LISTE, { tenantId });
});

after(async () => { server.close(); await db.destroy(); });

test('Ein eingeladener Kontakt, der ankommt, zählt im Trichter als Erfolg', async () => {
  // So entsteht ein eingeladener Kontakt: über den Einladungs-Upload, mit Konto von Anfang an.
  const [u] = await db('users').insert({
    tenant_id: tenantId, email: 'gunthram@leitenmaier.example', role: 'expert',
    is_approved: true, password_hash: 'x',
  }).returning('*');
  const [gunthram] = await db('experts').insert({
    tenant_id: tenantId, user_id: u.id, vorname: 'Gunthram', nachname: 'Leitenmaier',
    email: 'gunthram@leitenmaier.example', status: 'eingeladen',
    invite_cycle_started_at: new Date(), ansprache_seit: new Date(),
  }).returning('*');

  const vorher = await (await get('/api/ansprache/trichter', { cookie: adminCookie })).json();
  assert.strictEqual(vorher.gesamt.vorbereitet, 4, 'drei vorbereitete plus ein eingeladener');
  assert.strictEqual(vorher.gesamt.registriert, 0);

  await post(`/api/ansprache/${gunthram.id}/schritt`, { angeschrieben: true }, { cookie: adminCookie });
  // Er meldet sich an und wird freigegeben, der Status wechselt.
  await db('experts').where({ id: gunthram.id }).update({ status: 'freigegeben' });

  const nachher = await (await get('/api/ansprache/trichter', { cookie: adminCookie })).json();
  assert.strictEqual(nachher.gesamt.vorbereitet, 4, 'er fällt nicht aus der Grundgesamtheit');
  assert.strictEqual(nachher.gesamt.registriert, 1, 'und erscheint als Ankunft');
  assert.strictEqual(nachher.gesamt.freigegeben, 1);
  assert.ok(nachher.gesamt.quote_registrierung > 0, 'die Quote springt an');
});

test('Reiter Angeschrieben zeigt alle, auch die schon Angekommenen', async () => {
  const roswitha = await db('experts').where({ nachname: 'Tannenhauer', tenant_id: tenantId }).first();
  await post(`/api/ansprache/${roswitha.id}/schritt`,
    { angeschrieben: true, reaktion: 'spaeter', wiedervorlage: TAG(60), notiz: 'meldet sich im November' },
    { cookie: adminCookie });

  const d = await (await get('/api/ansprache/angeschrieben', { cookie: adminCookie })).json();
  const namen = d.kontakte.map((p) => p.nachname);

  assert.ok(namen.includes('Leitenmaier'), 'der Angekommene bleibt sichtbar, er ist der Erfolg');
  assert.ok(namen.includes('Tannenhauer'));
  assert.ok(!namen.includes('Puschkat'), 'wer nie angeschrieben wurde, steht nicht hier');

  assert.strictEqual(d.zahlen.gesamt, 2);
  assert.strictEqual(d.zahlen.angekommen, 1);
  assert.strictEqual(d.zahlen.heute, 2, 'beide heute angeschrieben');

  const r = d.kontakte.find((p) => p.nachname === 'Tannenhauer');
  assert.strictEqual(alsTag(r.vorreg_angeschrieben_am), HEUTE);
  assert.strictEqual(r.vorreg_reaktion, 'spaeter');
  assert.strictEqual(r.vorreg_notiz, 'meldet sich im November');

  const nurOffen = await (await get('/api/ansprache/angeschrieben?reaktion=offen', { cookie: adminCookie })).json();
  assert.deepStrictEqual(nurOffen.kontakte.map((p) => p.nachname), ['Leitenmaier'], 'Filter greift');

  assert.strictEqual((await get('/api/ansprache/angeschrieben')).status, 401);
});

test('Nachfolger werden vorgeschlagen, aber nichts wird gesetzt', async () => {
  const d = await (await get('/api/ansprache/nachfolger-vorschlaege', { cookie: adminCookie })).json();
  const egon = d.vorschlaege.find((p) => p.nachname === 'Wallmoden');

  assert.ok(egon, 'wer Unternehmensnachfolge sucht, wird vorgeschlagen');
  assert.ok(egon.treffer.includes('nachfolge'), 'das auslösende Wort steht dabei');
  assert.ok(!d.vorschlaege.some((p) => p.nachname === 'Tannenhauer'), 'ein Interim CFO nicht');

  // Entscheidend: Der Vorschlag ändert nichts an den Daten.
  const unberuehrt = await db('experts').where({ id: egon.id }).first();
  assert.strictEqual(unberuehrt.zielgruppe, null, 'die Zielgruppe bleibt leer, bis Christian entscheidet');

  // Erst das Markieren setzt sie, danach ist der Vorschlag weg.
  const res = await fetch(`${baseUrl}/api/ansprache/${egon.id}/zielgruppe`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ zielgruppe: 'nachfolger' }),
  });
  assert.strictEqual(res.status, 200);

  const danach = await (await get('/api/ansprache/nachfolger-vorschlaege', { cookie: adminCookie })).json();
  assert.ok(!danach.vorschlaege.some((p) => p.id === egon.id), 'wer entschieden ist, verschwindet aus der Liste');
  assert.strictEqual(danach.zahlen.schon_markiert, 1);

  assert.strictEqual((await get('/api/ansprache/nachfolger-vorschlaege')).status, 401);
});

test('Die Auswertung schlüsselt nach Zielgruppe auf', async () => {
  const t = await (await get('/api/ansprache/trichter', { cookie: adminCookie })).json();
  const nachfolger = t.nach_zielgruppe.find((z) => z.schluessel === 'nachfolger');
  const offen = t.nach_zielgruppe.find((z) => z.schluessel === 'noch offen');

  assert.strictEqual(nachfolger.vorbereitet, 1, 'Egon ist als Nachfolger markiert');
  assert.strictEqual(offen.vorbereitet, 3, 'die übrigen drei sind noch unentschieden');
});

test('Frische Importe bekommen die Herkunft mit, ohne die Löschfrist zu verschieben', async () => {
  const neu = await db('experts')
    .where({ tenant_id: tenantId, nachname: 'Puschkat' }).first();
  assert.ok(neu.ansprache_seit, 'beim Import gesetzt');
  assert.ok(neu.vorreg_importiert_am, 'die Löschfrist läuft weiter über ihr eigenes Feld');
  assert.strictEqual(neu.status, VORREG);
});
