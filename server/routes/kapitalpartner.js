/**
 * v1.31.0 — Kapitalpartner.
 *
 * Verzeichnis der Finanzierer im Netzwerk. Zwei Zugänge:
 *   öffentlich  POST /api/public/kapitalpartner-bewerbung  (in routes/public.js)
 *   Admin       alles hier
 *
 * Von hier geht nie eine Mail an einen Kapitalpartner raus. Das Verzeichnis
 * ist eine Nachschlagequelle für den Fall, dass ein Mandat Finanzierung
 * braucht. Den Kontakt stellt Christian selbst her.
 */
const express = require('express');
const { z } = require('zod');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

/* Die fachlichen Listen stehen hier und nicht in der Datenbank, weil sie
   Teil der Suchlogik sind. Freitext kommt über objektarten_json dazu. */
const FINANZIERUNGSARTEN = [
  'leasing', 'mietkauf', 'sale_and_lease_back', 'factoring',
  'mezzanine', 'working_capital', 'darlehen', 'beteiligung', 'buergschaft',
];
const BONITAET = [
  'normal',                    // Standardgeschäft, kann fast jeder
  'schwach',                   // angeschlagene Bilanz, noch kein Verfahren
  'sanierung',                 // laufende Sanierung, IDW S6
  'starug',                    // Restrukturierungsverfahren nach StaRUG
  'eigenverwaltung',           // Insolvenz in Eigenverwaltung
  'insolvenz',                 // Regelinsolvenz
];
const STATUS = ['neu', 'in_pruefung', 'freigegeben', 'abgelehnt'];

const liste = (wert, erlaubt = null) => {
  if (!Array.isArray(wert)) return [];
  const sauber = wert.map((x) => String(x).trim().toLowerCase().slice(0, 60)).filter(Boolean);
  return [...new Set(erlaubt ? sauber.filter((x) => erlaubt.includes(x)) : sauber)].slice(0, 30);
};

const schema = z.object({
  firmenname: z.string().min(2).max(200),
  anrede: z.string().max(20).nullable().optional(),
  vorname: z.string().max(100).nullable().optional(),
  nachname: z.string().max(100).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  telefon: z.string().max(40).nullable().optional(),
  webseite: z.string().max(300).nullable().optional(),
  linkedin: z.string().max(300).nullable().optional(),
  finanzierungsarten: z.array(z.string()).optional(),
  objektarten: z.array(z.string()).optional(),
  branchen: z.array(z.string()).optional(),
  bonitaet: z.array(z.string()).optional(),
  volumen_von_eur: z.number().int().min(0).max(1000000000).nullable().optional(),
  volumen_bis_eur: z.number().int().min(0).max(1000000000).nullable().optional(),
  regionen: z.string().max(200).nullable().optional(),
  entscheidung_tage: z.number().int().min(0).max(365).nullable().optional(),
  beschreibung: z.string().max(3000).nullable().optional(),
  referenzen: z.string().max(2000).nullable().optional(),
  notiz: z.string().max(2000).nullable().optional(),
  status: z.enum(STATUS).optional(),
});

/** Aus dem geprüften Formular ein Datenbankfeld-Objekt machen. */
function baueDatensatz(d) {
  const feld = {};
  const uebernehmen = ['firmenname', 'anrede', 'vorname', 'nachname', 'email', 'telefon',
    'webseite', 'linkedin', 'regionen', 'beschreibung', 'referenzen', 'notiz',
    'volumen_von_eur', 'volumen_bis_eur', 'entscheidung_tage', 'status'];
  for (const k of uebernehmen) if (d[k] !== undefined) feld[k] = d[k] || null;
  if (d.finanzierungsarten !== undefined) feld.finanzierungsarten_json = JSON.stringify(liste(d.finanzierungsarten, FINANZIERUNGSARTEN));
  if (d.bonitaet !== undefined) feld.bonitaet_json = JSON.stringify(liste(d.bonitaet, BONITAET));
  if (d.objektarten !== undefined) feld.objektarten_json = JSON.stringify(liste(d.objektarten));
  if (d.branchen !== undefined) feld.branchen_json = JSON.stringify(liste(d.branchen));
  return feld;
}

router.use(requireAuth, requireRole('admin'));

/** Die Auswahllisten für die Oberfläche, damit sie nur an einer Stelle stehen. */
router.get('/listen', (_req, res) => res.json({
  finanzierungsarten: FINANZIERUNGSARTEN, bonitaet: BONITAET, status: STATUS,
}));

/**
 * Verzeichnis mit Filtern. Der Filter, auf den es ankommt, ist `bonitaet`:
 * damit findet man die Handvoll Partner, die auch im Verfahren noch
 * finanzieren, statt durch alle zu blättern.
 */
router.get('/', async (req, res) => {
  const q = db('kapitalpartner').where({ tenant_id: req.user.tenantId });

  const status = String(req.query.status || '').toLowerCase();
  if (STATUS.includes(status)) q.andWhere('status', status);

  const art = String(req.query.finanzierungsart || '').toLowerCase();
  if (FINANZIERUNGSARTEN.includes(art)) q.andWhereRaw('finanzierungsarten_json @> ?', [JSON.stringify([art])]);

  const bon = String(req.query.bonitaet || '').toLowerCase();
  if (BONITAET.includes(bon)) q.andWhereRaw('bonitaet_json @> ?', [JSON.stringify([bon])]);

  // Volumen: gesucht wird, wer den Betrag abdeckt, offene Grenzen zählen mit.
  const betrag = Number(req.query.volumen);
  if (Number.isFinite(betrag) && betrag > 0) {
    q.andWhere(function deckungab() {
      this.whereNull('volumen_von_eur').orWhere('volumen_von_eur', '<=', betrag);
    }).andWhere(function deckungbis() {
      this.whereNull('volumen_bis_eur').orWhere('volumen_bis_eur', '>=', betrag);
    });
  }

  const suche = String(req.query.suche || '').trim().toLowerCase();
  if (suche) {
    q.andWhere(function volltext() {
      const wie = `%${suche}%`;
      this.whereRaw('lower(firmenname) LIKE ?', [wie])
        .orWhereRaw('lower(coalesce(beschreibung, \'\')) LIKE ?', [wie])
        .orWhereRaw('lower(objektarten_json::text) LIKE ?', [wie])
        .orWhereRaw('lower(branchen_json::text) LIKE ?', [wie]);
    });
  }

  const partner = await q.orderBy([{ column: 'status' }, { column: 'firmenname' }]);
  const alle = await db('kapitalpartner').where({ tenant_id: req.user.tenantId }).select('status', 'bonitaet_json');
  res.json({
    partner,
    zahlen: {
      gesamt: alle.length,
      freigegeben: alle.filter((p) => p.status === 'freigegeben').length,
      offen: alle.filter((p) => ['neu', 'in_pruefung'].includes(p.status)).length,
      // Die Zahl, die zählt: wer finanziert noch, wenn es eng wird?
      im_verfahren: alle.filter((p) => {
        const b = typeof p.bonitaet_json === 'string' ? JSON.parse(p.bonitaet_json) : (p.bonitaet_json || []);
        return b.some((x) => ['sanierung', 'starug', 'eigenverwaltung', 'insolvenz'].includes(x));
      }).length,
    },
  });
});

router.get('/:id(\\d+)', async (req, res) => {
  const p = await db('kapitalpartner').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!p) return res.status(404).json({ error: 'Kapitalpartner nicht gefunden' });
  res.json({ partner: p });
});

router.post('/', async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const [p] = await db('kapitalpartner').insert({
    ...baueDatensatz(parsed.data), tenant_id: req.user.tenantId, quelle: 'admin',
  }).returning('*');
  await req.audit({ action: 'kapitalpartner.angelegt', resource: 'kapitalpartner', resourceId: p.id, newValue: { firmenname: p.firmenname } });
  res.locals.auditLogged = true;
  res.status(201).json({ ok: true, partner: p, message: `${p.firmenname} angelegt.` });
});

router.put('/:id(\\d+)', async (req, res) => {
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const alt = await db('kapitalpartner').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!alt) return res.status(404).json({ error: 'Kapitalpartner nicht gefunden' });

  const feld = baueDatensatz(parsed.data);
  if (!Object.keys(feld).length) return res.status(400).json({ error: 'Keine Änderungen übergeben' });
  if (feld.status === 'freigegeben' && alt.status !== 'freigegeben') feld.freigegeben_am = new Date();
  feld.updated_at = new Date();

  const [p] = await db('kapitalpartner').where({ id: alt.id }).update(feld).returning('*');
  await req.audit({ action: 'kapitalpartner.geaendert', resource: 'kapitalpartner', resourceId: p.id, newValue: feld });
  res.locals.auditLogged = true;
  res.json({ ok: true, partner: p, message: 'Gespeichert.' });
});

router.delete('/:id(\\d+)', async (req, res) => {
  const p = await db('kapitalpartner').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!p) return res.status(404).json({ error: 'Kapitalpartner nicht gefunden' });
  await db('kapitalpartner').where({ id: p.id }).delete();
  await req.audit({ action: 'kapitalpartner.geloescht', resource: 'kapitalpartner', resourceId: p.id, oldValue: { firmenname: p.firmenname } });
  res.locals.auditLogged = true;
  res.json({ ok: true, message: `${p.firmenname} gelöscht.` });
});

/**
 * Einen bestehenden Kontakt zum Kapitalpartner machen.
 *
 * Der Fall aus der Praxis: Jemand steht als Interim Manager in der Ansprache,
 * antwortet aber, dass er sich dort nicht sieht und lieber finanzieren möchte.
 * Der Kontakt wandert dann herüber, wird aus der Ansprache genommen und taucht
 * in keiner Arbeitsliste mehr auf. Das Expertenprofil bleibt bestehen, gelöscht
 * wird hier nichts.
 */
router.post('/aus-experte/:expertId(\\d+)', async (req, res) => {
  const e = await db('experts').where({ id: Number(req.params.expertId), tenant_id: req.user.tenantId }).first();
  if (!e) return res.status(404).json({ error: 'Kontakt nicht gefunden' });

  const schon = await db('kapitalpartner').where({ expert_id: e.id }).first();
  if (schon) return res.status(409).json({ error: `${schon.firmenname} ist bereits als Kapitalpartner angelegt.` });

  const [p] = await db('kapitalpartner').insert({
    tenant_id: req.user.tenantId, expert_id: e.id, user_id: e.user_id || null,
    firmenname: e.firma || `${e.vorname} ${e.nachname}`,
    anrede: e.anrede || null, vorname: e.vorname, nachname: e.nachname,
    email: e.email || null, telefon: e.telefon || e.mobil || null, linkedin: e.linkedin || null,
    beschreibung: e.berufsbezeichnung || null,
    status: 'in_pruefung', quelle: 'umgewandelt',
  }).returning('*');

  // Aus der Ansprache nehmen, ohne den Datensatz anzurühren.
  if (!e.vorreg_ausgeschlossen_am) {
    await db('experts').where({ id: e.id }).update({
      vorreg_ausgeschlossen_am: new Date(),
      vorreg_ausschluss_grund: 'Kapitalpartner, keine Interim-Ansprache',
      zielgruppe: 'kapitalpartner',
    });
  }

  await req.audit({
    action: 'kapitalpartner.aus_experte', resource: 'kapitalpartner', resourceId: p.id,
    newValue: { expert_id: e.id, firmenname: p.firmenname },
  });
  res.locals.auditLogged = true;
  res.status(201).json({
    ok: true, partner: p,
    message: `${p.firmenname} ist jetzt Kapitalpartner und aus der Interim-Ansprache raus. Bitte noch die Finanzierungsarten ergänzen.`,
  });
});

module.exports = { router, FINANZIERUNGSARTEN, BONITAET, STATUS, schema, baueDatensatz };
