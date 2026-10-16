/**
 * v1.44.0 — Kandidaten anfragen und ihre Antwort entgegennehmen.
 *
 * Zwei Zugänge:
 *   Admin        eine Auswahl aus der Pipeline anfragen
 *   öffentlich   der Kandidat antwortet unter seinem Token, ohne Login
 *
 * Ohne Login, weil die Alternative bedeutet hätte: erst anmelden, dann
 * antworten. Die Hälfte hätte das Passwort nicht zur Hand und nicht
 * geantwortet, und eine ausgebliebene Antwort sieht aus wie Desinteresse.
 */
const express = require('express');
const { z } = require('zod');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const ka = require('../utils/kandidatenanfrage');
const { getTemplate, render } = require('../utils/mailTemplates');
const { getMailProvider } = require('../providers/mail');

const router = express.Router();

/* =========================== Öffentlich =================================== */

/** Was der Kandidat sieht. Kein Kunde, kein Vermittler, kein Budget. */
router.get('/:token', async (req, res) => {
  const a = await db('applications').where({ anfrage_token: req.params.token }).first();
  if (!a) return res.status(404).json({ error: 'Diese Anfrage gibt es nicht.' });

  const projekt = await db('projects').where({ id: a.project_id }).first();
  const expert = await db('experts').where({ id: a.expert_id }).first();

  res.json({
    projekt: ka.kandidatenSicht(projekt),
    vorname: expert?.vorname || null,
    frist: a.anfrage_frist,
    bereits_geantwortet: a.antwort || null,
    antwort: a.antwort ? {
      interesse: a.antwort === 'interessiert',
      verfuegbar_ab: a.verfuegbar_ab,
      auslastung: a.auslastung,
      notiz: a.antwort_notiz,
    } : null,
  });
});

const antwortSchema = z.object({
  interesse: z.boolean(),
  verfuegbar_ab: z.string().max(80).nullable().optional(),
  auslastung: z.string().max(40).nullable().optional(),
  notiz: z.string().max(2000).nullable().optional(),
  wunsch_satz_eur: z.number().int().min(0).max(10000).nullable().optional(),
});

/** Die Antwort des Kandidaten. Lässt sich ändern, solange nichts weiterging. */
router.post('/:token', async (req, res) => {
  const parsed = antwortSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Bitte Interesse angeben.' });
  const d = parsed.data;

  const vorher = await db('applications').where({ anfrage_token: req.params.token }).first();
  if (!vorher) return res.status(404).json({ error: 'Diese Anfrage gibt es nicht.' });
  // Ist der Kandidat schon weiter, zählt der spätere Stand.
  if (['vorgelegt', 'im_gespraech', 'angeboten', 'besetzt'].includes(vorher.status)) {
    return res.status(409).json({
      error: 'Hier ist schon etwas in Bewegung. Melde dich bitte direkt bei Christian, dann klären wir das persönlich.',
    });
  }

  const r = await ka.antworte(db, {
    token: req.params.token,
    interesse: d.interesse,
    verfuegbarAb: d.verfuegbar_ab,
    auslastung: d.auslastung,
    notiz: d.notiz,
    wunschSatz: d.wunsch_satz_eur,
  });
  if (!r.ok) return res.status(404).json({ error: 'Diese Anfrage gibt es nicht.' });

  res.json({
    ok: true,
    message: d.interesse
      ? 'Danke, notiert. Ich melde mich, sobald es weitergeht.'
      : 'Danke für die Rückmeldung. Dann melde ich mich beim nächsten Mal mit etwas Passenderem.',
    spaet: r.spaet,
  });
});

/* ============================== Verwaltung ================================ */

router.use(requireAuth, requireRole('admin'));

const frageSchema = z.object({
  application_ids: z.array(z.number().int()).min(1).max(50),
  frist_tage: z.number().int().min(1).max(60).optional(),
});

/**
 * Eine Auswahl aus der Pipeline anfragen.
 *
 * Verrät die Projektbeschreibung den Auftraggeber, geht gar nichts hinaus.
 * Lieber eine Fehlermeldung als eine Mail, die das Geschäft kostet.
 */
router.post('/projekt/:projektId(\\d+)/fragen', async (req, res) => {
  const parsed = frageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Bitte mindestens einen Kandidaten wählen.' });

  const projekt = await db('projects')
    .where({ id: req.params.projektId, tenant_id: req.user.tenantId }).first();
  if (!projekt) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  const tenant = await db('tenants').where({ id: req.user.tenantId }).first();
  const tpl = await getTemplate(req.user.tenantId, 'projekt_anfrage');
  const mail = getMailProvider();
  const basis = (process.env.APP_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')).replace(/\/+$/, '');

  const e = await ka.frage(db, {
    tenantId: req.user.tenantId,
    projekt,
    applicationIds: parsed.data.application_ids,
    fristTage: parsed.data.frist_tage ?? 7,
    senden: async ({ an, vorname, token, frist, projekt: p }) => {
      const rahmen = [
        p.start ? `Start ${new Date(p.start).toLocaleDateString('de-DE')}` : null,
        p.dauer, p.auslastung,
        p.ort || (p.arbeitsmodell === 'remote' ? 'remote' : null),
      ].filter(Boolean).join(' · ');

      const anforderungen = [
        p.must.length ? `Gefordert:\n${p.must.map((m) => `· ${m}`).join('\n')}` : null,
        p.nice.length ? `Von Vorteil:\n${p.nice.map((n) => `· ${n}`).join('\n')}` : null,
      ].filter(Boolean).join('\n\n');

      const werte = {
        vorname: vorname || '',
        projekt_titel: p.titel,
        projekt_rahmen: rahmen,
        projekt_beschreibung: p.beschreibung || '',
        projekt_anforderungen: anforderungen,
        antwort_link: `${basis}/anfrage/${token}`,
        frist: new Date(frist).toLocaleDateString('de-DE'),
      };

      // render() nimmt die ganze Vorlage und liefert Betreff, Text und HTML.
      const fertig = render(tpl, werte);
      await mail.send({
        to: an,
        subject: fertig.subject,
        text: fertig.text,
        html: fertig.html,
      }, { tenantId: req.user.tenantId, einzelkorrespondenz: true, art: 'projekt_anfrage' });
    },
  });

  if (!e.ok) return res.status(400).json({ error: e.fehler, treffer: e.treffer });

  await req.audit({
    action: 'kandidat.angefragt', resource: 'project', resourceId: projekt.id,
    newValue: { gefragt: e.gefragt, erneut: e.erneut },
  });
  res.locals.auditLogged = true;

  const teile = [`${e.gefragt} angefragt`];
  if (e.erneut) teile.push(`${e.erneut} erinnert`);
  if (e.uebersprungen) teile.push(`${e.uebersprungen} haben schon geantwortet`);
  if (e.ohne_mail) teile.push(`${e.ohne_mail} ohne Mailadresse`);
  res.json({ ok: true, ...e, message: `${teile.join(', ')}.` });
});

/** Prüfen, ob die Beschreibung den Auftraggeber verrät, ohne etwas zu senden. */
router.get('/projekt/:projektId(\\d+)/anonym-pruefen', async (req, res) => {
  const projekt = await db('projects')
    .where({ id: req.params.projektId, tenant_id: req.user.tenantId }).first();
  if (!projekt) return res.status(404).json({ error: 'Projekt nicht gefunden' });
  res.json(await ka.pruefeAnonym(db, projekt));
});

module.exports = router;
