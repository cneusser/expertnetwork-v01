/**
 * v1.37.0 — Die Nachfrageseite: Kunden verwalten.
 *
 * Bis hierher gab es Kundenkonten, Kundenprofile, Kundenprojekte und
 * Kundenrechnungen, aber keine Stelle, an der man seine Kunden sieht. Vor
 * allem fehlte etwas, das niemandem auffiel, solange sich niemand registrierte:
 * Ein neues Kundenkonto entsteht mit `is_approved = false`, und das
 * Vendor-Portal weist es genau deshalb ab. Freigeben konnte man es nirgends.
 * Wer sich also angemeldet hätte, wäre auf unbestimmte Zeit ausgesperrt
 * gewesen, ohne dass es jemand bemerkt hätte.
 *
 * Die Akte bündelt, was verstreut lag: Stammdaten und Ansprechpartner aus dem
 * Profil, die eingereichten Projekte, welche Profile freigegeben wurden und
 * was der Kunde dazu gesagt hat, die laufenden Mandate und die gestellten
 * Rechnungen.
 */
const express = require('express');
const { z } = require('zod');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const alsObjekt = (wert) => {
  if (!wert) return {};
  if (typeof wert === 'object') return wert;
  try { return JSON.parse(wert); } catch { return {}; }
};

const name = (a) => [a.anrede, a.titel, a.vorname, a.nachname].filter(Boolean).join(' ').trim();

/**
 * Verzeichnis. Zahlen werden in wenigen Abfragen für alle geholt, nicht je
 * Kunde einzeln, damit die Seite auch bei vielen Kunden schnell bleibt.
 */
router.get('/', async (req, res) => {
  const t = req.user.tenantId;
  const status = String(req.query.status || '').toLowerCase();
  const suche = String(req.query.suche || '').trim().toLowerCase();

  const q = db('vendor_profiles as v')
    .join('users as u', 'u.id', 'v.user_id')
    .where('v.tenant_id', t)
    .select('v.id', 'v.user_id', 'v.firmenname', 'v.branche', 'v.telefon',
      'v.adresse_json', 'v.ansprechpartner_json', 'v.created_at',
      'u.email', 'u.is_approved', 'u.email_verified_at');

  if (status === 'wartet') q.andWhere('u.is_approved', false);
  if (status === 'frei') q.andWhere('u.is_approved', true);
  if (suche) {
    q.andWhere(function volltext() {
      const wie = `%${suche}%`;
      this.whereRaw('lower(v.firmenname) LIKE ?', [wie])
        .orWhereRaw('lower(u.email) LIKE ?', [wie])
        .orWhereRaw('lower(coalesce(v.branche, \'\')) LIKE ?', [wie])
        .orWhereRaw('lower(v.ansprechpartner_json::text) LIKE ?', [wie]);
    });
  }

  const kunden = await q.orderBy([{ column: 'u.is_approved' }, { column: 'v.firmenname' }]);
  const userIds = kunden.map((k) => k.user_id);

  const projekte = userIds.length
    ? await db('projects').where({ tenant_id: t }).whereIn('vendor_id', userIds)
      .select('vendor_id', 'status').then((rows) => rows.reduce((acc, p) => {
        acc[p.vendor_id] = acc[p.vendor_id] || { gesamt: 0, offen: 0 };
        acc[p.vendor_id].gesamt += 1;
        if (['offen', 'eingereicht'].includes(p.status)) acc[p.vendor_id].offen += 1;
        return acc;
      }, {}))
    : {};

  // Mandate und Umsatz laufen über das Projekt zum Kunden.
  const mandate = userIds.length
    ? await db('engagements as e').join('projects as p', 'p.id', 'e.project_id')
      .where('e.tenant_id', t).whereIn('p.vendor_id', userIds)
      .select('p.vendor_id', 'e.status').then((rows) => rows.reduce((acc, m) => {
        acc[m.vendor_id] = acc[m.vendor_id] || { gesamt: 0, aktiv: 0 };
        acc[m.vendor_id].gesamt += 1;
        if (m.status === 'aktiv') acc[m.vendor_id].aktiv += 1;
        return acc;
      }, {}))
    : {};

  const liste = kunden.map((k) => {
    const ap = alsObjekt(k.ansprechpartner_json);
    return {
      ...k,
      ansprechpartner: name(ap) || null,
      ansprechpartner_position: ap.position || null,
      adresse: alsObjekt(k.adresse_json),
      projekte: projekte[k.user_id] || { gesamt: 0, offen: 0 },
      mandate: mandate[k.user_id] || { gesamt: 0, aktiv: 0 },
      wartet_tage: k.is_approved ? null
        : Math.floor((Date.now() - new Date(k.created_at).getTime()) / 86400000),
    };
  });

  res.json({
    kunden: liste,
    zahlen: {
      gesamt: liste.length,
      wartet_auf_freigabe: liste.filter((k) => !k.is_approved).length,
      mit_aktivem_mandat: liste.filter((k) => k.mandate.aktiv > 0).length,
      ohne_projekt: liste.filter((k) => k.projekte.gesamt === 0 && k.is_approved).length,
    },
  });
});

/** Eine Kundenakte mit allem, was an diesem Kunden hängt. */
router.get('/:id(\\d+)', async (req, res) => {
  const t = req.user.tenantId;
  const kunde = await db('vendor_profiles as v').join('users as u', 'u.id', 'v.user_id')
    .where({ 'v.id': Number(req.params.id), 'v.tenant_id': t })
    .select('v.*', 'u.email', 'u.is_approved', 'u.email_verified_at', 'u.created_at as konto_seit')
    .first();
  if (!kunde) return res.status(404).json({ error: 'Kunde nicht gefunden' });

  const projekte = await db('projects').where({ tenant_id: t, vendor_id: kunde.user_id })
    .orderBy('created_at', 'desc')
    .select('id', 'name', 'referenz', 'status', 'start', 'ende', 'tagessatz_bis_eur', 'created_at');

  const projektIds = projekte.map((p) => p.id);

  const freigaben = projektIds.length
    ? await db('project_releases as r')
      .join('experts as e', 'e.id', 'r.expert_id')
      .whereIn('r.project_id', projektIds)
      .select('r.id', 'r.project_id', 'r.anonymized', 'r.feedback', 'r.feedback_at', 'r.created_at',
        'e.id as expert_id', 'e.vorname', 'e.nachname', 'e.berufsbezeichnung')
      .orderBy('r.created_at', 'desc')
    : [];

  const mandate = projektIds.length
    ? await db('engagements as g').join('experts as e', 'e.id', 'g.expert_id')
      .whereIn('g.project_id', projektIds)
      .select('g.id', 'g.project_id', 'g.titel', 'g.status', 'g.start', 'g.ende',
        'g.tagessatz_kunde_eur', 'g.gebuehr_modell', 'g.gebuehr_prozent',
        'e.vorname', 'e.nachname')
      .orderBy('g.created_at', 'desc')
    : [];

  const rechnungen = mandate.length
    ? await db('invoices').whereIn('engagement_id', mandate.map((m) => m.id))
      .where({ typ: 'rechnung' })
      .select('id', 'engagement_id', 'beleg_nr', 'datum', 'periode', 'status', 'netto_cent', 'brutto_cent')
      .orderBy('datum', 'desc')
    : [];

  const ap = alsObjekt(kunde.ansprechpartner_json);
  res.json({
    kunde: {
      ...kunde,
      ansprechpartner: { ...ap, anzeige: name(ap) || null },
      adresse: alsObjekt(kunde.adresse_json),
    },
    projekte,
    freigaben,
    mandate,
    rechnungen,
    zahlen: {
      projekte: projekte.length,
      freigaben: freigaben.length,
      rueckmeldungen: freigaben.filter((f) => f.feedback).length,
      mandate_aktiv: mandate.filter((m) => m.status === 'aktiv').length,
      // Beträge liegen in Cent, damit nichts rundet. Erst hier für die Anzeige.
      umsatz_brutto_cent: rechnungen.reduce((s, r) => s + (Number(r.brutto_cent) || 0), 0),
      umsatz_netto_cent: rechnungen.reduce((s, r) => s + (Number(r.netto_cent) || 0), 0),
      offen_cent: rechnungen.filter((r) => ['offen', 'versendet'].includes(r.status))
        .reduce((s, r) => s + (Number(r.brutto_cent) || 0), 0),
    },
  });
});

/**
 * Freigeben oder sperren.
 *
 * Das ist der Teil, der komplett gefehlt hat. Ohne Freigabe weist das
 * Vendor-Portal jeden Aufruf mit einem Hinweis auf die ausstehende Prüfung ab,
 * und diese Prüfung konnte niemand abschließen.
 */
const statusSchema = z.object({ frei: z.boolean(), notiz: z.string().max(300).optional() });

router.post('/:id(\\d+)/freigabe', async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const kunde = await db('vendor_profiles').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!kunde) return res.status(404).json({ error: 'Kunde nicht gefunden' });

  const user = await db('users').where({ id: kunde.user_id }).first();
  if (!user) return res.status(404).json({ error: 'Zugehöriges Konto nicht gefunden' });
  if (user.role !== 'vendor') return res.status(409).json({ error: 'Dieses Konto ist kein Kundenkonto' });

  await db('users').where({ id: user.id }).update({ is_approved: parsed.data.frei });
  await req.audit({
    action: parsed.data.frei ? 'kunde.freigegeben' : 'kunde.gesperrt',
    resource: 'vendor_profiles', resourceId: kunde.id,
    newValue: { firmenname: kunde.firmenname, notiz: parsed.data.notiz || null },
  });
  res.locals.auditLogged = true;

  // Bei der Freigabe erfährt der Kunde davon, denn er wartet darauf. Das ist
  // eine Antwort auf seine eigene Registrierung, keine Werbung.
  let benachrichtigt = false;
  if (parsed.data.frei && user.email) {
    try {
      const { getMailProvider } = require('../providers/mail');
      const APP_URL = process.env.APP_URL
        || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:5173');
      await getMailProvider().send({
        to: user.email,
        subject: 'Ihr Zugang zum Phalanx Expert Network ist freigeschaltet',
        html: `<p>Guten Tag,</p>
<p>Ihr Zugang für <strong>${kunde.firmenname}</strong> ist ab sofort freigeschaltet.
Sie können Ihre Anfrage einstellen und vorgeschlagene Profile ansehen.</p>
<p><a href="${APP_URL}/vendor">Zum Kundenbereich</a></p>
<p>Bei Fragen erreichen Sie uns jederzeit direkt.</p>
<p>Herzliche Grüße<br />Dr. Christian Neusser<br />Phalanx GmbH</p>`,
        text: `Ihr Zugang für ${kunde.firmenname} ist freigeschaltet: ${APP_URL}/vendor`,
      }, { tenantId: req.user.tenantId, templateKey: 'kunde_freigeschaltet', einzelkorrespondenz: true });
      benachrichtigt = true;
    } catch (e) {
      console.error('Freigabe-Mail an Kunden fehlgeschlagen:', e.message);
    }
  }

  res.json({
    ok: true,
    frei: parsed.data.frei,
    benachrichtigt,
    message: parsed.data.frei
      ? `${kunde.firmenname} ist freigeschaltet${benachrichtigt ? ' und wurde per Mail informiert' : ', die Mail konnte allerdings nicht zugestellt werden'}.`
      : `${kunde.firmenname} ist gesperrt und kommt nicht mehr in den Kundenbereich.`,
  });
});

/** Stammdaten pflegen, wenn am Telefon etwas Neues gesagt wird. */
const profilSchema = z.object({
  firmenname: z.string().min(2).max(200).optional(),
  branche: z.string().max(120).nullable().optional(),
  telefon: z.string().max(40).nullable().optional(),
  adresse_json: z.object({}).passthrough().optional(),
  ansprechpartner_json: z.object({}).passthrough().optional(),
});

router.put('/:id(\\d+)', async (req, res) => {
  const parsed = profilSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const kunde = await db('vendor_profiles').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!kunde) return res.status(404).json({ error: 'Kunde nicht gefunden' });

  const patch = { ...parsed.data };
  if (patch.adresse_json) patch.adresse_json = JSON.stringify(patch.adresse_json);
  if (patch.ansprechpartner_json) patch.ansprechpartner_json = JSON.stringify(patch.ansprechpartner_json);
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Keine Änderungen übergeben' });

  const [neu] = await db('vendor_profiles').where({ id: kunde.id }).update(patch).returning('*');
  await req.audit({ action: 'kunde.geaendert', resource: 'vendor_profiles', resourceId: kunde.id, newValue: patch });
  res.locals.auditLogged = true;
  res.json({ ok: true, kunde: neu, message: 'Gespeichert.' });
});

module.exports = router;
