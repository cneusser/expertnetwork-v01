/**
 * v1.38.0 — Monatsbericht.
 *
 * Jeder Bereich hatte bisher seine eigenen Zahlen: das Dashboard den Pool, das
 * Cockpit den Trichter, die Abrechnung den Umsatz. Was fehlte, war der Blick
 * über die Zeit und über alles zusammen. Ob ein Netzwerk wächst, sieht man
 * nicht an einem Stichtag, sondern an der Reihe der Monate.
 *
 * Vier Bereiche, in der Reihenfolge, in der das Geschäft entsteht:
 *
 *   Netzwerk   wer kommt dazu, wie gepflegt sind die Profile
 *   Ansprache  wie viele werden angesprochen, wie viele reagieren
 *   Nachfrage  Anfragen von Kunden, vorgelegte Profile
 *   Geschäft   Mandate, berechneter Umsatz, Marge
 *
 * Der Bericht zeigt auch Nullen. Ein Monat ohne Mandat ist ein Ergebnis und
 * keine Lücke, die man verstecken müsste. Gerade in der Aufbauphase ist eine
 * ehrliche Null aussagekräftiger als eine geschönte Kennzahl.
 */
const express = require('express');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

/** Liste der Monate von A bis B, als YYYY-MM. */
function monate(von, bis) {
  const liste = [];
  const d = new Date(`${von}-01T00:00:00`);
  const ende = new Date(`${bis}-01T00:00:00`);
  while (d <= ende && liste.length < 60) {
    liste.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() + 1);
  }
  return liste;
}

/**
 * Monat eines Zeitpunkts, in Ortszeit.
 *
 * Über toISOString gerechnet rutscht der erste Tag eines Monats in jeder
 * Zeitzone östlich von UTC in den Vormonat, und dann steht ein Ereignis vom
 * 1. Oktober im September. Bei einem Monatsbericht ist das genau der Fehler,
 * den niemand bemerkt und der trotzdem alle Zahlen verschiebt.
 */
const monatVon = (wert) => {
  if (!wert) return null;
  const d = new Date(wert);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const leer = () => ({
  zugaenge: 0, angeschrieben: 0, reaktionen: 0, registrierungen: 0,
  anfragen: 0, profile_vorgelegt: 0, rueckmeldungen: 0,
  mandate_gestartet: 0, umsatz_cent: 0, auszahlung_cent: 0,
});

/**
 * Bericht über einen Zeitraum. Ohne Angabe die letzten sechs Monate.
 */
/**
 * Die eigentliche Rechnung, ohne Express. So nutzen die JSON-Route und der
 * PDF-Export dieselbe Funktion, statt dass eine die andere über HTTP aufruft.
 */
async function baueBericht(t, { von: vonRoh, bis: bisRoh } = {}) {
  const heute = new Date();
  const standard = new Date(heute.getFullYear(), heute.getMonth() - 5, 1);
  const von = /^\d{4}-\d{2}$/.test(String(vonRoh || '')) ? vonRoh : monatVon(standard);
  const bis = /^\d{4}-\d{2}$/.test(String(bisRoh || '')) ? bisRoh : monatVon(heute);

  const reihe = monate(von, bis);
  const nach = Object.fromEntries(reihe.map((m) => [m, leer()]));
  const zaehle = (monat, feld, wert = 1) => {
    if (monat && nach[monat]) nach[monat][feld] += wert;
  };

  // --- Netzwerk -----------------------------------------------------------
  const experten = await db('experts').where({ tenant_id: t })
    .select('id', 'status', 'created_at', 'vorreg_zusammengefuehrt_am', 'vorreg_angeschrieben_am',
      'vorreg_reaktion', 'vorreg_reaktion_am', 'vorreg_importiert_am', 'pool_contact_id');

  const IM_POOL = ['registriert', 'freigegeben', 'inaktiv'];
  for (const e of experten) {
    if (IM_POOL.includes(e.status)) {
      // Dazugehört ab der Zusammenführung, sonst ab Anlage. Dieselbe Regel wie
      // auf dem Dashboard, sonst widersprechen sich die beiden Ansichten.
      zaehle(monatVon(e.vorreg_zusammengefuehrt_am || e.created_at), 'zugaenge');
      zaehle(monatVon(e.vorreg_zusammengefuehrt_am || e.created_at), 'registrierungen');
    }
    zaehle(monatVon(e.vorreg_angeschrieben_am), 'angeschrieben');
    if (e.vorreg_reaktion && !['offen', 'keine'].includes(e.vorreg_reaktion)) {
      zaehle(monatVon(e.vorreg_reaktion_am), 'reaktionen');
    }
  }

  // --- Nachfrage ----------------------------------------------------------
  const projekte = await db('projects').where({ tenant_id: t }).select('id', 'created_at', 'status', 'vendor_id');
  for (const p of projekte) zaehle(monatVon(p.created_at), 'anfragen');

  const freigaben = await db('project_releases').where({ tenant_id: t })
    .select('created_at', 'feedback', 'feedback_at');
  for (const f of freigaben) {
    zaehle(monatVon(f.created_at), 'profile_vorgelegt');
    if (f.feedback) zaehle(monatVon(f.feedback_at), 'rueckmeldungen');
  }

  // --- Geschäft -----------------------------------------------------------
  const mandate = await db('engagements').where({ tenant_id: t })
    .select('id', 'start', 'created_at', 'status');
  for (const m of mandate) zaehle(monatVon(m.start || m.created_at), 'mandate_gestartet');

  const belege = await db('invoices').where({ tenant_id: t }).whereNot('status', 'storniert')
    .select('typ', 'datum', 'netto_cent', 'brutto_cent');
  for (const b of belege) {
    const m = monatVon(b.datum);
    if (b.typ === 'rechnung') zaehle(m, 'umsatz_cent', Number(b.netto_cent) || 0);
    else zaehle(m, 'auszahlung_cent', Number(b.netto_cent) || 0);
  }

  // --- Stand heute, nicht je Monat ---------------------------------------
  const pool = experten.filter((e) => IM_POOL.includes(e.status));
  const vorbereitet = experten.filter((e) => e.status === 'vorregistriert').length;
  const kunden = await db('vendor_profiles as v').join('users as u', 'u.id', 'v.user_id')
    .where('v.tenant_id', t).select('u.is_approved');

  const monatsreihe = reihe.map((m) => ({
    monat: m,
    ...nach[m],
    marge_cent: nach[m].umsatz_cent - nach[m].auszahlung_cent,
    quote_reaktion: nach[m].angeschrieben
      ? Math.round((nach[m].reaktionen / nach[m].angeschrieben) * 1000) / 10 : 0,
  }));

  const summe = (feld) => monatsreihe.reduce((s, m) => s + m[feld], 0);
  const gesamt = {
    zugaenge: summe('zugaenge'), angeschrieben: summe('angeschrieben'),
    reaktionen: summe('reaktionen'), anfragen: summe('anfragen'),
    profile_vorgelegt: summe('profile_vorgelegt'), rueckmeldungen: summe('rueckmeldungen'),
    mandate_gestartet: summe('mandate_gestartet'),
    umsatz_cent: summe('umsatz_cent'), auszahlung_cent: summe('auszahlung_cent'),
  };
  gesamt.marge_cent = gesamt.umsatz_cent - gesamt.auszahlung_cent;
  gesamt.quote_reaktion = gesamt.angeschrieben
    ? Math.round((gesamt.reaktionen / gesamt.angeschrieben) * 1000) / 10 : 0;

  // Der letzte volle Monat gegen den davor. Der laufende Monat taugt nicht
  // zum Vergleich, er ist ja noch nicht vorbei.
  const letzterVoller = monatsreihe.length >= 2 ? monatsreihe[monatsreihe.length - 2] : null;
  const davor = monatsreihe.length >= 3 ? monatsreihe[monatsreihe.length - 3] : null;

  return {
    zeitraum: { von, bis, monate: reihe.length },
    monate: monatsreihe,
    gesamt,
    vergleich: letzterVoller && davor
      ? {
        monat: letzterVoller.monat, vormonat: davor.monat,
        felder: ['zugaenge', 'angeschrieben', 'reaktionen', 'anfragen', 'mandate_gestartet', 'umsatz_cent']
          .map((f) => ({ feld: f, jetzt: letzterVoller[f], vorher: davor[f], differenz: letzterVoller[f] - davor[f] })),
      }
      : null,
    stand: {
      pool: pool.length,
      vorbereitet,
      aus_dem_pool_uebernommen: experten.filter((e) => e.pool_contact_id).length,
      kunden: kunden.length,
      kunden_freigeschaltet: kunden.filter((k) => k.is_approved).length,
      projekte_offen: projekte.filter((p) => ['offen', 'eingereicht'].includes(p.status)).length,
      mandate_aktiv: mandate.filter((m) => m.status === 'aktiv').length,
    },
  };
}

router.get('/', async (req, res) => {
  res.json(await baueBericht(req.user.tenantId, req.query));
});

/** Derselbe Bericht als PDF, ein Blatt zum Ablegen oder Weitergeben. */
router.get('/pdf', async (req, res) => {
  const { buildBerichtPdf } = require('../utils/berichtPdf');
  const daten = await baueBericht(req.user.tenantId, req.query);
  const tenant = await db('tenants').where({ id: req.user.tenantId }).first();
  const doc = buildBerichtPdf({ daten, mandant: tenant?.name || 'Phalanx GmbH' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `attachment; filename="Phalanx-Bericht-${daten.zeitraum.von}-bis-${daten.zeitraum.bis}.pdf"`);
  doc.pipe(res);
  doc.end();
});

module.exports = { router, baueBericht, monate };
