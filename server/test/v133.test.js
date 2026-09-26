/**
 * v1.33.0 — Verfügbarkeitsnachfrage nach Aussagewert statt nach Kalender.
 *
 * Der Anlass kam aus der Praxis: Ein Experte hatte "verfügbar ab 1.10." gemeldet
 * und wurde daraufhin fünfmal im Abstand von zwei Wochen gefragt, ob das noch
 * stimmt. Er konnte jedes Mal nur dasselbe antworten.
 * Alle Namen sind erfunden.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { db } = require('../db/knex');
const { seed } = require('../db/seed');
const { app } = require('../index');
const { naechsteNachfrage, nachfrageFaellig, angabeGiltNoch } = require('../utils/verfuegbarkeit');
const { freshness } = require('../utils/freshness');
const { runAvailabilityReminders } = require('../jobs');
const { CONSENT_ZWECK, CONSENT_VERSION, consentExpiry } = require('../consent');

let server; let baseUrl; let tenantId;
const TAG = 86400000;
const vorTagen = (n) => new Date(Date.now() - n * TAG);
const inTagen = (n) => new Date(Date.now() + n * TAG);
const alsTag = (d) => new Date(d).toLocaleDateString('sv-SE');

/** Ein Experte mit Konto und gültiger Einwilligung, sonst schweigt der Job ohnehin. */
async function expertMitKonto(vorname, nachname) {
  const [u] = await db('users').insert({
    tenant_id: tenantId, email: `${vorname}.${nachname}@v133.example`.toLowerCase(),
    role: 'expert', is_approved: true, password_hash: 'x', email_verified_at: new Date(),
  }).returning('*');
  await db('consents').insert({
    tenant_id: tenantId, user_id: u.id, zweck: CONSENT_ZWECK,
    text_version: CONSENT_VERSION, expires_at: consentExpiry(),
  });
  const [e] = await db('experts').insert({
    tenant_id: tenantId, user_id: u.id, vorname, nachname,
    email: u.email, status: 'freigegeben',
  }).returning('*');
  return e;
}

const meldung = (expert, status, felder = {}) => db('availabilities').insert({
  tenant_id: tenantId, expert_id: expert.id, status, source: 'self', ...felder,
});

before(async () => {
  await db.migrate.latest();
  await seed();
  tenantId = (await db('tenants').where({ slug: 'phalanx' }).first()).id;
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => { server.close(); await db.destroy(); });

test('Der Fall aus der Praxis: ein Datum in der Zukunft wird nicht alle 14 Tage abgefragt', async () => {
  // Die Lage aus der Akte: vor acht Wochen "ab 1.10." gemeldet, der Termin
  // liegt noch drei Wochen voraus. Genau hier kam bisher alle 14 Tage dieselbe
  // Frage, obwohl er nichts Neues sagen konnte.
  const angabe = {
    status: 'ab_datum',
    ab_datum: alsTag(inTagen(20)),
    confirmed_at: vorTagen(56),
  };

  assert.strictEqual(nachfrageFaellig(angabe), false,
    'nach acht Wochen wird trotzdem nicht gefragt, die Aussage gilt noch');
  assert.ok(angabeGiltNoch(angabe), 'und das Profil wird dafür nicht abgewertet');

  // Gegen den Termin selbst rechnen, nicht gegen die aktuelle Uhrzeit: Das
  // ab_datum ist Mitternacht, inTagen() traegt die Tageszeit mit, und je
  // nachdem wann der Test laeuft, ergibt die Differenz sonst 7 oder 8.
  const ziel = naechsteNachfrage(angabe);
  const termin = new Date(`${alsTag(inTagen(20))}T00:00:00`);
  const tageVorher = Math.round((termin.getTime() - ziel.getTime()) / TAG);
  assert.strictEqual(tageVorher, 7, 'gefragt wird eine Woche vor dem genannten Termin');
});

test('Sobald das genannte Datum näher rückt oder vorbei ist, wird gefragt', async () => {
  assert.strictEqual(nachfrageFaellig({
    status: 'ab_datum', ab_datum: alsTag(inTagen(3)), confirmed_at: vorTagen(40),
  }), true, 'drei Tage vorher ist die Frage fällig');

  assert.strictEqual(nachfrageFaellig({
    status: 'ab_datum', ab_datum: alsTag(vorTagen(5)), confirmed_at: vorTagen(40),
  }), true, 'nach dem Termin erst recht, jetzt ist offen ob er wirklich frei ist');

  // Aber nicht sofort nach der Meldung, auch wenn der Termin nah ist.
  assert.strictEqual(nachfrageFaellig({
    status: 'ab_datum', ab_datum: alsTag(inTagen(2)), confirmed_at: new Date(),
  }), false, 'wer heute gemeldet hat, wird nicht morgen wieder gefragt');
});

test('Die übrigen Status altern unterschiedlich schnell', async () => {
  assert.strictEqual(nachfrageFaellig({ status: 'sofort', confirmed_at: vorTagen(10) }), false);
  assert.strictEqual(nachfrageFaellig({ status: 'sofort', confirmed_at: vorTagen(15) }), true,
    'sofort verfügbar altert in 14 Tagen, das sagt etwas über heute');

  assert.strictEqual(nachfrageFaellig({ status: 'ausgebucht', confirmed_at: vorTagen(20) }), false,
    'ausgebucht ändert sich selten, 14 Tage wären Belästigung');
  assert.strictEqual(nachfrageFaellig({ status: 'ausgebucht', confirmed_at: vorTagen(31) }), true);

  assert.strictEqual(nachfrageFaellig(null), true, 'ohne jede Angabe wird gefragt');
});

test('Ein Termin weit in der Zukunft schläft nicht ewig, der Deckel greift', async () => {
  const weit = { status: 'ab_datum', ab_datum: alsTag(inTagen(400)), confirmed_at: vorTagen(95) };
  assert.strictEqual(nachfrageFaellig(weit), true,
    'nach 90 Tagen fragen wir trotzdem, sonst schläft das Profil ein');

  const nochNicht = { status: 'ab_datum', ab_datum: alsTag(inTagen(400)), confirmed_at: vorTagen(80) };
  assert.strictEqual(nachfrageFaellig(nochNicht), false);
});

test('Der Job schweigt bei gültiger Angabe und fragt bei überholter', async () => {
  const michael = await expertMitKonto('Michael', 'Wiesenkamp');
  const gerlinde = await expertMitKonto('Gerlinde', 'Ostermaier');

  // Michael wie in der Akte: ab 1.10., das ist noch zwei Monate hin.
  await meldung(michael, 'ab_datum', { ab_datum: alsTag(inTagen(60)), confirmed_at: vorTagen(56) });
  // Gerlinde sagte vor drei Wochen "sofort verfügbar", das ist überholt.
  await meldung(gerlinde, 'sofort', { confirmed_at: vorTagen(21) });

  const vorher = Number((await db('mail_outbox').count('* as c').first()).c);
  const marke = Number((await db('mail_outbox').max('id as m').first()).m || 0);
  const lauf = await runAvailabilityReminders();

  const raus = await db('mail_outbox').where('id', '>', marke).pluck('to_email');
  assert.ok(!raus.includes(michael.email), 'Michael bekommt keine Post, seine Angabe gilt');
  assert.ok(raus.includes(gerlinde.email), 'Gerlinde schon, ihre Angabe ist überholt');
  assert.strictEqual(lauf.sent, raus.length);
  assert.ok(Number((await db('mail_outbox').count('* as c').first()).c) > vorher);
});

test('Wer aus gutem Grund nicht gefragt wird, gilt trotzdem als bestätigt', async () => {
  // Das ist der Punkt, an dem beide Regeln zusammenpassen müssen. Sonst
  // verschwindet Michael aus "Verfügbar jetzt", nur weil seine Angabe in
  // Ordnung ist und wir ihn deshalb in Ruhe lassen.
  const angabe = { status: 'ab_datum', ab_datum: alsTag(inTagen(60)), confirmed_at: vorTagen(56) };

  const mitAngabe = freshness({
    availabilityConfirmedAt: angabe.confirmed_at, rateCreatedAt: vorTagen(30),
    cvUploadedAt: vorTagen(30), availability: angabe,
  });
  assert.strictEqual(mitAngabe.nichtBestaetigt, false, 'nicht als veraltet abgestempelt');
  assert.ok(mitAngabe.score >= 70, `Score bleibt gut, war ${mitAngabe.score}`);

  // Ohne den Datensatz gilt weiter die alte Regel, damit alte Aufrufe nicht brechen.
  const ohneAngabe = freshness({
    availabilityConfirmedAt: angabe.confirmed_at, rateCreatedAt: vorTagen(30), cvUploadedAt: vorTagen(30),
  });
  assert.strictEqual(ohneAngabe.nichtBestaetigt, true, 'alte Aufrufform unverändert');

  // Und eine wirklich überholte Angabe wird weiterhin abgewertet.
  const alt = { status: 'sofort', confirmed_at: vorTagen(40) };
  assert.strictEqual(freshness({
    availabilityConfirmedAt: alt.confirmed_at, rateCreatedAt: vorTagen(30),
    cvUploadedAt: vorTagen(30), availability: alt,
  }).nichtBestaetigt, true);
});
