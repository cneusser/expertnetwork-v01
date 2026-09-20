/**
 * v1.32.0 — Anbindung an Phalanx OS.
 *
 * Der Pool wird nicht über das Netz angesprochen, sondern über Fixtures: die
 * Sync-Funktionen nehmen `holen` und `senden` entgegen, damit hier genau die
 * Antworten ankommen, die der Fall braucht.
 *
 * Geprüft werden: Anreichern über E-Mail, über LinkedIn und über einen
 * eindeutigen Namen, Neuanlage als vorregistriert, mehrdeutiger Name auf die
 * Warteliste, Idempotenz bei zweimaligem Lauf, die UWG-Sperre im Mail-Wrapper
 * und die Rückmeldung mit source_id.
 * Alle Namen sind erfunden.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const pool = require('../sync/phalanxpool');
const { nameKey } = require('../utils/normalisieren');

let server; let baseUrl; let adminCookie; let tenantId;
const post = (p, body, h = {}) =>
  fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const get = (p, h = {}) => fetch(baseUrl + p, { headers: h });

/** So sieht ein Kontakt aus dem Pool aus. */
const kontakt = (id, felder = {}) => ({
  id,
  salutation: 'herr',
  first_name: 'Vorname', last_name: 'Nachname',
  emails: [], emails_ohne_werbeeinwilligung: [],
  phones: [], positions: [], tags: ['LI:Interim'], fields: {},
  updated_at: '2026-09-18T10:00:00.000Z',
  ...felder,
});

const FIXTURES = {
  // Anreichern über die E-Mail
  perMail: kontakt('pool-1', {
    first_name: 'Reinhild', last_name: 'Waldschmidt',
    emails: ['reinhild@waldschmidt-v132.example'],
    fields: { 'LinkedIn-Profil': 'https://www.linkedin.com/in/reinhild-waldschmidt', 'LinkedIn-Position': 'Interim CFO' },
    positions: [{ title: 'Interim CFO', company: 'Waldschmidt Interim' }],
    tags: ['LI:Interim', 'LI:Prio-A'],
  }),
  // Anreichern über die LinkedIn-URL, die E-Mail ist eine andere
  perLinkedin: kontakt('pool-2', {
    first_name: 'Anselm', last_name: 'Kreidler',
    emails: ['anselm.privat@kreidler-v132.example'],
    fields: { 'LinkedIn-Profil': 'linkedin.com/in/anselm-kreidler', 'LinkedIn-Position': 'Restrukturierer' },
    tags: ['LI:Berater', 'LI:Prio-B'],
  }),
  // Anreichern über den eindeutigen Namen, ohne E-Mail und ohne LinkedIn
  perName: kontakt('pool-3', {
    first_name: 'Sigrun', last_name: 'Baumhauer',
    positions: [{ title: 'Head of Finance', company: 'Baumhauer Consulting' }],
    tags: ['LI:CFO/Finance'],
  }),
  // Neu, mit Adresse ohne Werbeeinwilligung
  neu: kontakt('pool-4', {
    first_name: 'Volkmar', last_name: 'Tiefenthaler',
    emails: ['volkmar@tiefenthaler-v132.example'],
    emails_ohne_werbeeinwilligung: ['volkmar@tiefenthaler-v132.example'],
    phones: ['0911 987654'],
    fields: { 'LinkedIn-Profil': 'https://www.linkedin.com/in/volkmar-tiefenthaler', 'LinkedIn-Position': 'Interim COO' },
    tags: ['LI:Interim', 'LI:Prio-A'],
  }),
  // Mehrdeutig: zwei Profile tragen denselben Namensschlüssel
  mehrdeutig: kontakt('pool-5', {
    first_name: 'Almut', last_name: 'Zwierlein',
    tags: ['LI:Interim'],
  }),
};

/** Steht für die Pool-API. Liefert je Tag nur, was dort hingehört. */
const holen = ({ tag }) => Promise.resolve(
  Object.values(FIXTURES).filter((k) => k.tags.includes(tag)),
);

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

  const leer = { tenant_id: tenantId, status: 'vorregistriert', vorreg_importiert_am: new Date() };
  // Diesen kennt der Bestand schon über die E-Mail, aber ohne LinkedIn und Firma.
  await db('experts').insert({
    ...leer, vorname: 'Reinhild', nachname: 'Waldschmidt',
    email: 'reinhild@waldschmidt-v132.example', name_key: nameKey('Reinhild', 'Waldschmidt'),
  });
  // Diesen über die LinkedIn-URL, seine Adresse hier ist eine dienstliche.
  await db('experts').insert({
    ...leer, vorname: 'Anselm', nachname: 'Kreidler',
    email: 'a.kreidler@grossekanzlei-v132.example',
    linkedin: 'linkedin.com/in/anselm-kreidler', name_key: nameKey('Anselm', 'Kreidler'),
  });
  // Diesen nur über den Namen.
  await db('experts').insert({
    ...leer, vorname: 'Sigrun', nachname: 'Baumhauer', name_key: nameKey('Sigrun', 'Baumhauer'),
  });
  // Zwei gleichnamige, damit der Name mehrdeutig wird.
  await db('experts').insert({ ...leer, vorname: 'Almut', nachname: 'Zwierlein', name_key: nameKey('Almut', 'Zwierlein') });
  await db('experts').insert({ ...leer, vorname: 'Almut', nachname: 'Zwierlein', name_key: nameKey('Almut', 'Zwierlein') });
});

after(async () => { server.close(); await db.destroy(); });

test('Erster Lauf: anreichern über E-Mail, LinkedIn und eindeutigen Namen, Rest neu', async () => {
  const e = await pool.sync({ tenantId, holen });

  assert.strictEqual(e.gelesen, 5, 'jeder Kontakt genau einmal, obwohl Tags sich überschneiden');
  assert.strictEqual(e.neu, 1, 'nur Tiefenthaler ist wirklich neu');
  assert.strictEqual(e.angereichert, 3);
  assert.strictEqual(e.mehrdeutig, 1);
  assert.strictEqual(e.fehler, 0);

  const reinhild = await db('experts').where({ nachname: 'Waldschmidt', tenant_id: tenantId }).first();
  assert.strictEqual(reinhild.pool_contact_id, 'pool-1', 'Pool-Kennung vermerkt');
  assert.strictEqual(reinhild.linkedin, 'linkedin.com/in/reinhild-waldschmidt', 'LinkedIn normalisiert übernommen');
  assert.strictEqual(reinhild.firma, 'Waldschmidt Interim');
  assert.strictEqual(reinhild.berufsbezeichnung, 'Interim CFO');
  assert.strictEqual(reinhild.vorreg_prio, 'A', 'Priorität aus dem Tag');

  const anselm = await db('experts').where({ nachname: 'Kreidler', tenant_id: tenantId }).first();
  assert.strictEqual(anselm.pool_contact_id, 'pool-2');
  assert.strictEqual(anselm.email, 'a.kreidler@grossekanzlei-v132.example',
    'eine gepflegte Adresse wird nie überschrieben');
  assert.strictEqual(anselm.berufsbezeichnung, 'Restrukturierer');

  const sigrun = await db('experts').where({ nachname: 'Baumhauer', tenant_id: tenantId }).first();
  assert.strictEqual(sigrun.pool_contact_id, 'pool-3', 'über den eindeutigen Namen gefunden');
  assert.strictEqual(sigrun.firma, 'Baumhauer Consulting');
});

test('Neuer Kontakt kommt als vorregistriert an, ohne Werbeeinwilligung', async () => {
  const v = await db('experts').where({ nachname: 'Tiefenthaler', tenant_id: tenantId }).first();
  assert.ok(v, 'angelegt');
  assert.strictEqual(v.status, 'vorregistriert', 'nie direkt als Experte');
  assert.strictEqual(v.vorreg_quelle, 'phalanx-pool');
  assert.strictEqual(v.pool_contact_id, 'pool-4');
  assert.strictEqual(v.vorreg_prio, 'A');
  assert.strictEqual(v.telefon, '0911 987654');
  assert.strictEqual(v.werbeeinwilligung, false,
    'die Adresse stand in emails_ohne_werbeeinwilligung');
  assert.ok(v.vorreg_importiert_am, 'die 120-Tage-Frist läuft');
  assert.ok(v.ansprache_seit, 'zählt im Trichter mit');
});

test('Mehrdeutiger Name wird nicht geraten, sondern vermerkt', async () => {
  const beide = await db('experts').where({ nachname: 'Zwierlein', tenant_id: tenantId });
  assert.strictEqual(beide.length, 2, 'es wurde kein dritter angelegt');
  assert.ok(beide.every((x) => !x.pool_contact_id), 'keinem wurde die Kennung zugeordnet');
  assert.ok(await db('audit_log').where({ action: 'phalanx.sync_mehrdeutig' }).first(),
    'der Fall ist protokolliert');
});

test('Zweiter Lauf legt nichts doppelt an', async () => {
  const vorher = Number((await db('experts').where({ tenant_id: tenantId }).count('* as c').first()).c);
  const e = await pool.sync({ tenantId, holen, vollstaendig: true });
  const nachher = Number((await db('experts').where({ tenant_id: tenantId }).count('* as c').first()).c);

  assert.strictEqual(nachher, vorher, 'kein einziger Datensatz kommt dazu');
  assert.strictEqual(e.neu, 0);
  assert.strictEqual(e.angereichert, 0, 'es gab nichts mehr zu ergänzen');
  assert.strictEqual(e.mehrdeutig, 1, 'der mehrdeutige Fall bleibt offen, das ist richtig');
});

test('An Pool-Kontakte geht keine automatische Post, Einzelkorrespondenz schon', async () => {
  const { getMailProvider } = require('../providers/mail');
  const v = await db('experts').where({ nachname: 'Tiefenthaler', tenant_id: tenantId }).first();

  await getMailProvider().send(
    { to: v.email, subject: 'Newsletter Oktober', html: '<p>Werbung</p>', text: 'Werbung' },
    { tenantId, templateKey: 'rundmail' },
  );
  const gesperrt = await db('mail_outbox').where({ to_email: v.email }).orderBy('id', 'desc').first();
  assert.strictEqual(gesperrt.status, 'gesperrt', 'die Sperre greift zentral im Wrapper');
  assert.match(gesperrt.fehler, /UWG/);

  await getMailProvider().send(
    { to: v.email, subject: 'Kurze Rückfrage', html: '<p>Hallo</p>', text: 'Hallo' },
    { tenantId, templateKey: 'direktmail', einzelkorrespondenz: true },
  );
  const erlaubt = await db('mail_outbox').where({ to_email: v.email }).orderBy('id', 'desc').first();
  assert.notStrictEqual(erlaubt.status, 'gesperrt', 'Einzelkorrespondenz bleibt möglich');

  // Und der Einladungszyklus fasst Pool-Kontakte gar nicht erst an.
  const { runInviteLifecycle } = require('../jobs');
  await db('experts').where({ id: v.id }).update({ status: 'eingeladen', invite_cycle_started_at: new Date(Date.now() - 400 * 86400000) });
  const [u] = await db('users').insert({
    tenant_id: tenantId, email: 'volkmar.konto@tiefenthaler-v132.example',
    role: 'expert', is_approved: false, password_hash: 'x',
  }).returning('*');
  await db('experts').where({ id: v.id }).update({ user_id: u.id });

  await runInviteLifecycle();
  assert.ok(await db('experts').where({ id: v.id }).first(),
    'der Zyklus hätte ihn nach 400 Tagen gelöscht, tut es bei Pool-Kontakten aber nicht');
  await db('experts').where({ id: v.id }).update({ status: 'vorregistriert', invite_cycle_started_at: null, user_id: null });
});

test('Wer ankommt, wird mit source_id zurückgemeldet', async () => {
  const gesendet = [];
  const senden = async (d) => { gesendet.push(d); return { ok: true }; };

  const reinhild = await db('experts').where({ nachname: 'Waldschmidt', tenant_id: tenantId }).first();
  await db('experts').where({ id: reinhild.id })
    .update({ status: 'freigegeben', firma: 'Waldschmidt Interim', berufsbezeichnung: 'Interim CFO' });

  const e = await pool.melde({ tenantId, senden });
  assert.ok(e.gemeldet >= 1);

  const meldung = gesendet.find((g) => g.last_name === 'Waldschmidt');
  assert.ok(meldung, 'die Angekommene ist dabei');
  assert.strictEqual(meldung.source_id, `expert-${reinhild.id}`, 'idempotente Kennung');
  assert.strictEqual(meldung.first_name, 'Reinhild');
  assert.strictEqual(meldung.title, 'Interim CFO');
  assert.strictEqual(meldung.company.name, 'Waldschmidt Interim');

  assert.ok((await db('experts').where({ id: reinhild.id }).first()).pool_gemeldet_am, 'als gemeldet vermerkt');

  const nochmal = await pool.melde({ tenantId, senden });
  assert.ok(!gesendet.slice(e.gemeldet).some((g) => g.source_id === `expert-${reinhild.id}`),
    'zweimal melden passiert nicht');
  assert.strictEqual(nochmal.gemeldet, 0);
});

test('Ein Fehler beim Melden blockiert nichts und wird protokolliert', async () => {
  const kaputt = async () => { throw new Error('Gegenstelle antwortet nicht'); };
  const sigrun = await db('experts').where({ nachname: 'Baumhauer', tenant_id: tenantId }).first();
  await db('experts').where({ id: sigrun.id }).update({ status: 'registriert', pool_gemeldet_am: null });

  const e = await pool.melde({ tenantId, senden: kaputt });
  assert.strictEqual(e.gemeldet, 0);
  assert.ok(e.fehler >= 1);
  assert.strictEqual((await db('experts').where({ id: sigrun.id }).first()).pool_gemeldet_am, null,
    'bleibt in der Warteschlange, geht also beim nächsten Lauf wieder mit');

  const lauf = await db('phalanx_sync_lauf').where({ id: e.lauf_id }).first();
  assert.match(lauf.fehlertext, /antwortet nicht/);
});

test('Verwaltungsseite zeigt den Stand und ist dem Admin vorbehalten', async () => {
  const d = await (await get('/api/phalanx-os', { cookie: adminCookie })).json();
  assert.strictEqual(d.eingerichtet, false, 'ohne Umgebungsvariablen ist die Strecke zu');
  assert.ok(d.fehlende_variablen.includes('PHALANX_OS_CLIENT_SECRET'));
  assert.match(d.redirect_uri, /\/api\/auth\/phalanx\/callback$/);
  assert.ok(d.zahlen.aus_dem_pool >= 4);
  assert.ok(d.laeufe.length >= 2);
  assert.ok(!JSON.stringify(d).includes('CLIENT_SECRET=') , 'kein Geheimnis in der Antwort');

  assert.strictEqual((await get('/api/phalanx-os')).status, 401);
  assert.strictEqual((await post('/api/phalanx-os/sync', {})).status, 401);
  assert.strictEqual((await post('/api/phalanx-os/sync', {}, { cookie: adminCookie })).status, 503,
    'ohne Einrichtung sagt die Route das klar, statt es zu versuchen');
});

test('Der SSO-Knopf erscheint nur, wenn die Strecke eingerichtet ist', async () => {
  const d = await (await get('/api/auth/phalanx/status')).json();
  assert.strictEqual(d.enabled, false);
  assert.match(d.redirect_uri, /\/api\/auth\/phalanx\/callback$/);

  // Ohne Einrichtung landet der Start auf der Anmeldeseite, nicht im Nirgendwo.
  const res = await fetch(`${baseUrl}/api/auth/phalanx`, { redirect: 'manual' });
  assert.strictEqual(res.status, 302);
  assert.match(res.headers.get('location'), /phalanx-nicht-konfiguriert/);
});
