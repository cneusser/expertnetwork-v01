/**
 * v1.23.0 — Abrechnung I.
 * Admin: Mandate anlegen und beenden, Leistungsnachweise erfassen und freigeben,
 * abrechnen (erzeugt Gutschrift und Rechnung), Belege als PDF, Versand per Mail,
 * Buchhaltungs-Export als CSV, Kennzahlen (Umsatz, Auszahlung, Marge).
 * Experte: eigene Mandate sehen, Tage eintragen und einreichen.
 */
const express = require('express');
const { z } = require('zod');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const { berechne, verkaufssatzCent, naechsteBelegNr } = require('../utils/billing');
const { buildBelegPdf, belegeCsv } = require('../utils/billingPdf');
const { getTemplate, render } = require('../utils/mailTemplates');
const { getMailProvider } = require('../providers/mail');

const router = express.Router();
router.use(requireAuth);

const PERIODE = /^\d{4}-(0[1-9]|1[0-2])$/;

function absenderDaten(tenant) {
  const b = (typeof tenant?.branding_json === 'string' ? JSON.parse(tenant.branding_json) : tenant?.branding_json) || {};
  return {
    firma: b.rechnung_firma || tenant?.name || 'Phalanx GmbH',
    strasse: b.rechnung_strasse || '', plz: b.rechnung_plz || '', ort: b.rechnung_ort || '',
    ustid: b.rechnung_ustid || '', hrb: b.rechnung_hrb || '', iban: b.rechnung_iban || '',
    bank: b.rechnung_bank || '', email: b.rechnung_email || '', telefon: b.rechnung_telefon || '',
  };
}

async function ladeMandat(id, tenantId) {
  return db('engagements as e')
    .join('projects as p', 'p.id', 'e.project_id')
    .join('experts as x', 'x.id', 'e.expert_id')
    .where('e.id', id).andWhere('e.tenant_id', tenantId)
    .select('e.*', 'p.name as projekt_name', 'p.referenz',
      'x.vorname', 'x.nachname', 'x.email as experte_email', 'x.user_id as experte_user_id')
    .first();
}

/* ---------------- Experte: eigene Mandate und Zeiterfassung ---------------- */

router.get('/meine-mandate', async (req, res) => {
  const expert = await db('experts').where({ user_id: req.user.id }).first();
  if (!expert) return res.json({ mandate: [] });
  const mandate = await db('engagements as e')
    .join('projects as p', 'p.id', 'e.project_id')
    .where('e.expert_id', expert.id)
    .select('e.id', 'e.titel', 'e.start', 'e.ende', 'e.status', 'e.tagessatz_experte_eur', 'p.name as projekt_name')
    .orderBy('e.created_at', 'desc');
  for (const m of mandate) {
    m.nachweise = await db('timesheets').where({ engagement_id: m.id }).orderBy('periode', 'desc');
  }
  res.json({ mandate });
});

const nachweisSchema = z.object({
  engagement_id: z.number().int(),
  periode: z.string().regex(PERIODE),
  tage: z.number().min(0).max(31),
  spesen_eur: z.number().int().min(0).max(100000).optional(),
  beschreibung: z.string().max(2000).nullable().optional(),
  einreichen: z.boolean().optional(),
});

/** Nachweis anlegen oder ändern. Experte nur für eigene Mandate, Admin für alle. */
router.post('/nachweis', async (req, res) => {
  const parsed = nachweisSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Bitte Periode (YYYY-MM) und Tage prüfen' });
  const d = parsed.data;
  const mandat = await ladeMandat(d.engagement_id, req.user.tenantId);
  if (!mandat) return res.status(404).json({ error: 'Mandat nicht gefunden' });

  const istAdmin = ['admin', 'tenant_owner'].includes(req.user.role);
  if (!istAdmin) {
    const expert = await db('experts').where({ user_id: req.user.id }).first();
    if (!expert || expert.id !== mandat.expert_id) return res.status(403).json({ error: 'Kein Zugriff auf dieses Mandat' });
  }

  const vorhanden = await db('timesheets').where({ engagement_id: d.engagement_id, periode: d.periode }).first();
  if (vorhanden && ['freigegeben', 'abgerechnet'].includes(vorhanden.status) && !istAdmin) {
    return res.status(409).json({ error: 'Dieser Zeitraum ist bereits freigegeben und kann nicht mehr geändert werden' });
  }

  const werte = {
    tenant_id: req.user.tenantId, engagement_id: d.engagement_id, periode: d.periode,
    tage: d.tage, spesen_eur: d.spesen_eur || 0, beschreibung: d.beschreibung || null,
    status: d.einreichen ? 'eingereicht' : (vorhanden?.status || 'offen'),
    eingereicht_at: d.einreichen ? new Date() : (vorhanden?.eingereicht_at || null),
  };
  if (vorhanden) await db('timesheets').where({ id: vorhanden.id }).update(werte);
  else await db('timesheets').insert(werte);

  const nachweis = await db('timesheets').where({ engagement_id: d.engagement_id, periode: d.periode }).first();
  res.json({ ok: true, nachweis, message: d.einreichen ? 'Leistungsnachweis eingereicht. Danke!' : 'Gespeichert.' });
});

/* ---------------- Admin ---------------- */

router.use(requireRole('admin'));

const mandatSchema = z.object({
  project_id: z.number().int(),
  expert_id: z.number().int(),
  titel: z.string().max(150).nullable().optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ende: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  tagessatz_experte_eur: z.number().int().positive(),
  tagessatz_kunde_eur: z.number().int().positive().nullable().optional(),
  gebuehr_modell: z.enum(['gu_anteil', 'erfolg']).optional(),
  gebuehr_prozent: z.number().int().min(0).max(50).optional(),
  plan_tage: z.number().int().min(0).max(2000).nullable().optional(),
  ust_prozent: z.number().int().min(0).max(25).optional(),
  kunde_json: z.object({}).passthrough().optional(),
  experte_json: z.object({}).passthrough().optional(),
  notiz: z.string().max(2000).nullable().optional(),
});

/** Übersicht aller Mandate mit Zahlen. */
router.get('/mandate', async (req, res) => {
  const mandate = await db('engagements as e')
    .join('projects as p', 'p.id', 'e.project_id')
    .join('experts as x', 'x.id', 'e.expert_id')
    .where('e.tenant_id', req.user.tenantId)
    .select('e.*', 'p.name as projekt_name', 'p.referenz', 'x.vorname', 'x.nachname', 'x.email as experte_email')
    .orderBy('e.created_at', 'desc');
  for (const m of mandate) {
    m.verkaufssatz_eur = Math.round(verkaufssatzCent(m) / 100);
    m.nachweise = await db('timesheets').where({ engagement_id: m.id }).orderBy('periode', 'desc');
    m.belege = await db('invoices').where({ engagement_id: m.id }).orderBy('id', 'desc');
  }
  res.json({ mandate });
});

/** Kandidaten: besetzte Bewerbungen ohne Mandat. */
router.get('/besetzt-ohne-mandat', async (req, res) => {
  const rows = await db('applications as a')
    .join('projects as p', 'p.id', 'a.project_id')
    .join('experts as x', 'x.id', 'a.expert_id')
    .leftJoin('engagements as e', function join() {
      this.on('e.project_id', 'a.project_id').andOn('e.expert_id', 'a.expert_id');
    })
    .where('a.tenant_id', req.user.tenantId).andWhere('a.status', 'besetzt').whereNull('e.id')
    .select('a.project_id', 'a.expert_id', 'p.name as projekt_name', 'p.gebuehr_modell', 'p.gebuehr_prozent',
      'p.start', 'p.ende', 'p.tagessatz_von_eur', 'x.vorname', 'x.nachname');
  res.json({ kandidaten: rows });
});

router.post('/mandate', async (req, res) => {
  const parsed = mandatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Bitte Projekt, Experte und Tagessatz prüfen' });
  const d = parsed.data;
  const projekt = await db('projects').where({ id: d.project_id, tenant_id: req.user.tenantId }).first();
  const experte = await db('experts').where({ id: d.expert_id, tenant_id: req.user.tenantId }).first();
  if (!projekt || !experte) return res.status(404).json({ error: 'Projekt oder Experte nicht gefunden' });
  const doppelt = await db('engagements').where({ project_id: d.project_id, expert_id: d.expert_id }).first();
  if (doppelt) return res.status(409).json({ error: 'Für diese Kombination gibt es bereits ein Mandat' });

  const [row] = await db('engagements').insert({
    tenant_id: req.user.tenantId, project_id: d.project_id, expert_id: d.expert_id,
    titel: d.titel || projekt.name, start: d.start || projekt.start || null, ende: d.ende || projekt.ende || null,
    tagessatz_experte_eur: d.tagessatz_experte_eur, tagessatz_kunde_eur: d.tagessatz_kunde_eur || null,
    gebuehr_modell: d.gebuehr_modell || projekt.gebuehr_modell || 'gu_anteil',
    gebuehr_prozent: d.gebuehr_prozent ?? projekt.gebuehr_prozent ?? 15,
    plan_tage: d.plan_tage || null, ust_prozent: d.ust_prozent ?? 19,
    kunde_json: JSON.stringify(d.kunde_json || {}), experte_json: JSON.stringify(d.experte_json || {}),
    notiz: d.notiz || null, created_by: req.user.id,
  }).returning('*');
  res.status(201).json({ ok: true, mandat: row, message: 'Mandat angelegt.' });
});

router.put('/mandate/:id', async (req, res) => {
  const mandat = await ladeMandat(req.params.id, req.user.tenantId);
  if (!mandat) return res.status(404).json({ error: 'Mandat nicht gefunden' });
  const felder = ['titel', 'start', 'ende', 'tagessatz_experte_eur', 'tagessatz_kunde_eur', 'gebuehr_modell',
    'gebuehr_prozent', 'plan_tage', 'ust_prozent', 'status', 'notiz'];
  const patch = {};
  for (const f of felder) if (req.body[f] !== undefined) patch[f] = req.body[f];
  if (req.body.kunde_json) patch.kunde_json = JSON.stringify(req.body.kunde_json);
  if (req.body.experte_json) patch.experte_json = JSON.stringify(req.body.experte_json);
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nichts zu ändern' });
  await db('engagements').where({ id: mandat.id }).update(patch);
  res.json({ ok: true, message: 'Mandat aktualisiert.' });
});

/** Nachweis freigeben (Voraussetzung für die Abrechnung). */
router.post('/nachweis/:id/freigeben', async (req, res) => {
  const n = await db('timesheets').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!n) return res.status(404).json({ error: 'Leistungsnachweis nicht gefunden' });
  if (n.status === 'abgerechnet') return res.status(409).json({ error: 'Bereits abgerechnet' });
  await db('timesheets').where({ id: n.id }).update({ status: 'freigegeben', freigegeben_at: new Date() });
  res.json({ ok: true, message: `Zeitraum ${n.periode} freigegeben.` });
});

/** Vorschau der Beträge, ohne etwas zu speichern. */
router.get('/nachweis/:id/vorschau', async (req, res) => {
  const n = await db('timesheets').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!n) return res.status(404).json({ error: 'Leistungsnachweis nicht gefunden' });
  const mandat = await ladeMandat(n.engagement_id, req.user.tenantId);
  const schonBerechnet = await db('invoices').where({ engagement_id: mandat.id, typ: 'rechnung' }).first();
  res.json({ vorschau: berechne(mandat, n, { ersteRechnung: !schonBerechnet }) });
});

/** Abrechnen: erzeugt Gutschrift (Experte) und Rechnung (Kunde) zum Nachweis. */
router.post('/nachweis/:id/abrechnen', async (req, res) => {
  const n = await db('timesheets').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!n) return res.status(404).json({ error: 'Leistungsnachweis nicht gefunden' });
  if (n.status === 'abgerechnet') return res.status(409).json({ error: 'Dieser Zeitraum ist bereits abgerechnet' });
  if (n.status !== 'freigegeben') return res.status(409).json({ error: 'Bitte den Leistungsnachweis zuerst freigeben' });
  if (Number(n.tage) <= 0) return res.status(400).json({ error: 'Ohne Tage lässt sich nichts abrechnen' });

  const mandat = await ladeMandat(n.engagement_id, req.user.tenantId);
  const schonBerechnet = await db('invoices').where({ engagement_id: mandat.id, typ: 'rechnung' }).first();
  const rechnung = berechne(mandat, n, { ersteRechnung: !schonBerechnet });
  const kunde = typeof mandat.kunde_json === 'string' ? JSON.parse(mandat.kunde_json) : (mandat.kunde_json || {});
  const experteAdr = typeof mandat.experte_json === 'string' ? JSON.parse(mandat.experte_json) : (mandat.experte_json || {});
  const heute = new Date().toISOString().slice(0, 10);
  const jahr = heute.slice(0, 4);

  const belege = [];
  await db.transaction(async (trx) => {
    for (const teil of [rechnung.gutschrift, rechnung.rechnung]) {
      const empfaenger = teil.typ === 'gutschrift'
        ? { firma: experteAdr.firma || `${mandat.vorname} ${mandat.nachname}`, ansprechpartner: `${mandat.vorname} ${mandat.nachname}`, ...experteAdr }
        : { firma: kunde.firma || '(Kunde bitte am Mandat hinterlegen)', ...kunde };
      const [row] = await trx('invoices').insert({
        tenant_id: req.user.tenantId, engagement_id: mandat.id, timesheet_id: n.id, typ: teil.typ,
        beleg_nr: await naechsteBelegNr(req.user.tenantId, teil.typ, jahr, trx),
        datum: heute, periode: n.periode,
        empfaenger_json: JSON.stringify(empfaenger), positionen_json: JSON.stringify(teil.positionen),
        netto_cent: teil.netto_cent, ust_prozent: teil.ust_prozent, ust_cent: teil.ust_cent, brutto_cent: teil.brutto_cent,
      }).returning('*');
      belege.push(row);
    }
    await trx('timesheets').where({ id: n.id }).update({ status: 'abgerechnet' });
    await trx('audit_log').insert({
      tenant_id: req.user.tenantId, actor_id: req.user.id, action: 'billing.abgerechnet',
      resource: 'engagements', resource_id: mandat.id,
      new_value_json: JSON.stringify({ periode: n.periode, belege: belege.map((b) => b.beleg_nr), marge_cent: rechnung.marge_cent }),
      ip: req.ip,
    });
  });

  res.locals.auditLogged = true;
  res.status(201).json({
    ok: true, belege, marge_cent: rechnung.marge_cent,
    message: `${n.periode} abgerechnet: ${belege.map((b) => b.beleg_nr).join(' und ')}.`,
  });
});

/** Belegliste mit Kennzahlen. */
router.get('/belege', async (req, res) => {
  const q = db('invoices as i')
    .join('engagements as e', 'e.id', 'i.engagement_id')
    .join('projects as p', 'p.id', 'e.project_id')
    .where('i.tenant_id', req.user.tenantId)
    .select('i.*', 'p.name as projekt_name').orderBy('i.id', 'desc');
  if (req.query.von) q.andWhere('i.datum', '>=', req.query.von);
  if (req.query.bis) q.andWhere('i.datum', '<=', req.query.bis);
  if (req.query.typ) q.andWhere('i.typ', req.query.typ);
  const belege = await q;
  const summe = (typ, feld) => belege.filter((b) => b.typ === typ && b.status !== 'storniert')
    .reduce((s, b) => s + Number(b[feld] || 0), 0);
  const umsatz = summe('rechnung', 'netto_cent');
  const auszahlung = summe('gutschrift', 'netto_cent');
  res.json({
    belege,
    kennzahlen: {
      umsatz_cent: umsatz, auszahlung_cent: auszahlung, marge_cent: umsatz - auszahlung,
      marge_prozent: umsatz ? Math.round(((umsatz - auszahlung) / umsatz) * 1000) / 10 : 0,
      offen_cent: belege.filter((b) => b.typ === 'rechnung' && b.status !== 'bezahlt' && b.status !== 'storniert')
        .reduce((s, b) => s + Number(b.brutto_cent), 0),
    },
  });
});

router.post('/belege/:id/status', async (req, res) => {
  const status = z.enum(['offen', 'versendet', 'bezahlt', 'storniert']).safeParse(req.body.status);
  if (!status.success) return res.status(400).json({ error: 'Unbekannter Status' });
  const beleg = await db('invoices').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!beleg) return res.status(404).json({ error: 'Beleg nicht gefunden' });
  await db('invoices').where({ id: beleg.id }).update({
    status: status.data,
    bezahlt_at: status.data === 'bezahlt' ? new Date() : null,
  });
  res.json({ ok: true, message: `${beleg.beleg_nr} ist jetzt ${status.data}.` });
});

/** Beleg als PDF. */
router.get('/belege/:id/pdf', async (req, res) => {
  const beleg = await db('invoices').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!beleg) return res.status(404).json({ error: 'Beleg nicht gefunden' });
  const mandat = await ladeMandat(beleg.engagement_id, req.user.tenantId);
  const tenant = await db('tenants').where({ id: req.user.tenantId }).first();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${beleg.beleg_nr}.pdf"`);
  buildBelegPdf({ beleg, absender: absenderDaten(tenant), projektName: mandat?.projekt_name }).pipe(res);
});

/** Beleg per Mail versenden (PDF im Anhang). */
router.post('/belege/:id/versenden', async (req, res) => {
  const beleg = await db('invoices').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!beleg) return res.status(404).json({ error: 'Beleg nicht gefunden' });
  const mandat = await ladeMandat(beleg.engagement_id, req.user.tenantId);
  const empfaenger = typeof beleg.empfaenger_json === 'string' ? JSON.parse(beleg.empfaenger_json) : (beleg.empfaenger_json || {});
  const gutschrift = beleg.typ === 'gutschrift';
  const an = req.body.email || (gutschrift ? mandat.experte_email : empfaenger.email);
  if (!an) return res.status(400).json({ error: 'Keine E-Mail-Adresse hinterlegt. Bitte am Mandat ergänzen.' });

  const tpl = await getTemplate(req.user.tenantId, gutschrift ? 'gutschrift_versand' : 'rechnung_versand');
  const msg = render(tpl, {
    vorname: mandat.vorname, nachname: mandat.nachname, mandat: mandat.projekt_name,
    periode: beleg.periode || '', beleg_nr: beleg.beleg_nr,
    betrag: `${(beleg.brutto_cent / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR`,
  });

  const tenant = await db('tenants').where({ id: req.user.tenantId }).first();
  const chunks = [];
  const pdf = buildBelegPdf({ beleg, absender: absenderDaten(tenant), projektName: mandat.projekt_name });
  await new Promise((resolve, reject) => {
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', resolve);
    pdf.on('error', reject);
  });

  await getMailProvider().send(
    { to: an, ...msg, attachments: [{ filename: `${beleg.beleg_nr}.pdf`, content: Buffer.concat(chunks) }] },
    { tenantId: req.user.tenantId, templateKey: gutschrift ? 'gutschrift_versand' : 'rechnung_versand' },
  );
  await db('invoices').where({ id: beleg.id }).update({ status: 'versendet', versendet_at: new Date() });
  res.json({ ok: true, message: `${beleg.beleg_nr} an ${an} versendet.` });
});

/** Buchhaltungs-Export als CSV. */
router.get('/export.csv', async (req, res) => {
  const q = db('invoices as i')
    .join('engagements as e', 'e.id', 'i.engagement_id')
    .join('projects as p', 'p.id', 'e.project_id')
    .where('i.tenant_id', req.user.tenantId)
    .select('i.*', 'p.name as projekt_name').orderBy('i.datum').orderBy('i.beleg_nr');
  if (req.query.von) q.andWhere('i.datum', '>=', req.query.von);
  if (req.query.bis) q.andWhere('i.datum', '<=', req.query.bis);
  const rows = await q;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="belege-${req.query.von || 'alle'}.csv"`);
  res.send(belegeCsv(rows));
});

module.exports = router;
