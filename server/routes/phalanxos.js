/**
 * v1.32.0 — Verwaltung der Phalanx-OS-Anbindung.
 *
 * Zeigt, ob die Verbindung steht, was der letzte Abgleich gebracht hat und
 * welche Tags gezogen werden. Ein Knopf stößt einen Lauf von Hand an.
 *
 * Geheimnisse gehen hier nie raus. Die Antwort sagt, ob eine Variable gesetzt
 * ist, nie ihren Wert.
 */
const express = require('express');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const phalanxOs = require('../utils/phalanxOs');
const pool = require('../sync/phalanxpool');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

/** Stand der Anbindung, ohne Netzaufruf. Schnell genug für jeden Seitenaufruf. */
router.get('/', async (req, res) => {
  const laeufe = await db('phalanx_sync_lauf')
    .where({ tenant_id: req.user.tenantId })
    .orderBy('id', 'desc').limit(20);

  const letzterLesen = laeufe.find((l) => l.art === 'lesen' && l.beendet_am);
  const zahlen = await db('experts').where({ tenant_id: req.user.tenantId })
    .whereNotNull('pool_contact_id').count('* as c').first();
  const offenZuMelden = await db('experts').where({ tenant_id: req.user.tenantId })
    .whereIn('status', ['registriert', 'freigegeben']).whereNull('pool_gemeldet_am')
    .count('* as c').first();
  const ohneEinwilligung = await db('experts').where({ tenant_id: req.user.tenantId })
    .where('werbeeinwilligung', false).count('* as c').first();

  res.json({
    eingerichtet: phalanxOs.eingerichtet(),
    fehlende_variablen: phalanxOs.fehlendeVariablen(),
    basis_url: process.env.PHALANX_OS_BASE_URL || null,
    redirect_uri: phalanxOs.redirectUri(),
    tags: pool.TAGS(),
    intervall_minuten: Number(process.env.PHALANX_SYNC_INTERVALL_MIN || 30),
    letzter_lauf: letzterLesen || null,
    laeufe,
    zahlen: {
      aus_dem_pool: Number(zahlen.c),
      offen_zu_melden: Number(offenZuMelden.c),
      ohne_werbeeinwilligung: Number(ohneEinwilligung.c),
    },
  });
});

/** Lebenszeichen: Discovery, Token und ein Datensatz. Dauert ein paar Sekunden. */
router.get('/ping', async (_req, res) => {
  res.json(await phalanxOs.ping());
});

/**
 * Zahlen je Tag-Segment, ohne etwas zu verändern. Das ist der Blick, den
 * Christian vor dem ersten vollen Abgleich braucht.
 */
router.get('/probe', async (_req, res) => {
  if (!phalanxOs.eingerichtet()) {
    return res.status(503).json({ error: 'Phalanx OS ist nicht eingerichtet', fehlend: phalanxOs.fehlendeVariablen() });
  }
  const segmente = [];
  for (const tag of pool.TAGS()) {
    try {
      const kontakte = await phalanxOs.kontakte({ tag, limit: 200 });
      segmente.push({ tag, anzahl: kontakte.length, beispiel: kontakte.slice(0, 1).map((k) => pool.lesbar(k)) });
    } catch (e) {
      segmente.push({ tag, fehler: e.message });
    }
  }
  res.json({ segmente });
});

/** Abgleich von Hand anstoßen. */
router.post('/sync', async (req, res) => {
  if (!phalanxOs.eingerichtet()) {
    return res.status(503).json({ error: 'Phalanx OS ist nicht eingerichtet', fehlend: phalanxOs.fehlendeVariablen() });
  }
  const vollstaendig = req.body?.vollstaendig === true;
  const ergebnis = await pool.sync({ tenantId: req.user.tenantId, ausloeser: 'hand', vollstaendig });
  await req.audit({
    action: 'phalanx.sync_von_hand', resource: 'phalanx_sync_lauf', resourceId: ergebnis.lauf_id,
    newValue: { gelesen: ergebnis.gelesen, neu: ergebnis.neu, vollstaendig },
  });
  res.locals.auditLogged = true;
  res.json({
    ok: !ergebnis.fehlertext,
    ...ergebnis,
    message: ergebnis.fehlertext
      ? `Abgebrochen: ${ergebnis.fehlertext}`
      : `${ergebnis.gelesen} gelesen, ${ergebnis.neu} neu vorbereitet, ${ergebnis.angereichert} ergänzt, ${ergebnis.mehrdeutig} zum Prüfen.`,
  });
});

/** Ankünfte zurückmelden, von Hand. */
router.post('/melden', async (req, res) => {
  if (!phalanxOs.eingerichtet()) {
    return res.status(503).json({ error: 'Phalanx OS ist nicht eingerichtet', fehlend: phalanxOs.fehlendeVariablen() });
  }
  const ergebnis = await pool.melde({ tenantId: req.user.tenantId, ausloeser: 'hand' });
  await req.audit({
    action: 'phalanx.melden_von_hand', resource: 'phalanx_sync_lauf', resourceId: ergebnis.lauf_id,
    newValue: { gemeldet: ergebnis.gemeldet },
  });
  res.locals.auditLogged = true;
  res.json({ ok: true, ...ergebnis, message: `${ergebnis.gemeldet} von ${ergebnis.offen} zurückgemeldet.` });
});

module.exports = router;
