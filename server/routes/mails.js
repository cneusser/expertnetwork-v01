/**
 * v1.8.0 — Mailvorlagen (einsehen, anpassen, zurücksetzen, Testversand)
 * und Outbox (Protokoll aller ausgehenden Mails). Nur Admin.
 */
const express = require('express');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const { DEFAULTS, EDITABLE_KEYS, getTemplate, render } = require('../utils/mailTemplates');
const { getMailProvider } = require('../providers/mail');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

/** Alle Vorlagen (wirksamer Stand + Standardtext zum Vergleich). */
router.get('/templates', async (req, res) => {
  const out = [];
  for (const key of EDITABLE_KEYS) {
    const tpl = await getTemplate(req.user.tenantId, key);
    out.push({ ...tpl, standard_subject: DEFAULTS[key].subject, standard_body: DEFAULTS[key].body_text });
  }
  res.json({ templates: out, platzhalter: ['{{vorname}}', '{{nachname}}', '{{link}}'] });
});

/** Vorlage anpassen (Subject + Text mit Platzhaltern). */
router.put('/templates/:key', async (req, res) => {
  const key = String(req.params.key);
  if (!EDITABLE_KEYS.includes(key)) return res.status(404).json({ error: 'Unbekannte Vorlage' });
  const subject = String(req.body?.subject || '').trim().slice(0, 200);
  const body = String(req.body?.body_text || '').trim().slice(0, 8000);
  if (!subject || !body) return res.status(400).json({ error: 'Betreff und Text erforderlich' });
  if (!body.includes('{{link}}')) return res.status(400).json({ error: 'Der Platzhalter {{link}} muss enthalten sein, sonst fehlt der Einladungslink.' });
  await db('mail_templates')
    .insert({ tenant_id: req.user.tenantId, key, subject, body_text: body, updated_by: req.user.id, updated_at: db.fn.now() })
    .onConflict(['tenant_id', 'key'])
    .merge({ subject, body_text: body, updated_by: req.user.id, updated_at: db.fn.now() });
  await req.audit({ action: 'mail_template.update', resource: 'mail_templates', resourceId: null, newValue: { key } });
  res.locals.auditLogged = true;
  res.json({ ok: true, message: 'Vorlage gespeichert.' });
});

/** Zurück auf den Standardtext. */
router.post('/templates/:key/reset', async (req, res) => {
  const key = String(req.params.key);
  if (!EDITABLE_KEYS.includes(key)) return res.status(404).json({ error: 'Unbekannte Vorlage' });
  await db('mail_templates').where({ tenant_id: req.user.tenantId, key }).delete();
  await req.audit({ action: 'mail_template.reset', resource: 'mail_templates', resourceId: null, newValue: { key } });
  res.locals.auditLogged = true;
  res.json({ ok: true, message: 'Vorlage auf Standard zurückgesetzt.' });
});

/** Testversand an die eigene Admin-Adresse (mit Beispieldaten). */
router.post('/templates/:key/test', async (req, res) => {
  const key = String(req.params.key);
  if (!EDITABLE_KEYS.includes(key)) return res.status(404).json({ error: 'Unbekannte Vorlage' });
  const tpl = await getTemplate(req.user.tenantId, key);
  const msg = render(tpl, { vorname: 'Max', nachname: 'Mustermann', link: 'https://example.org/einladung?token=TEST', link_label: 'Profil anlegen' });
  try {
    await getMailProvider().send({ to: req.user.email, ...msg }, { tenantId: req.user.tenantId, templateKey: `${key} (test)` });
  } catch (e) {
    return res.status(502).json({ error: `Testversand fehlgeschlagen: ${e.message}` });
  }
  res.json({ ok: true, message: `Testmail an ${req.user.email} versendet.` });
});

/** Outbox: die letzten 200 ausgehenden Mails, optional Volltext einer Mail. */
router.get('/outbox', async (req, res) => {
  const rows = await db('mail_outbox').orderBy('created_at', 'desc').limit(200)
    .select('id', 'to_email', 'subject', 'template_key', 'status', 'fehler', 'created_at');
  res.json({ outbox: rows });
});

router.get('/outbox/:id(\\d+)', async (req, res) => {
  const row = await db('mail_outbox').where({ id: Number(req.params.id) }).first();
  if (!row) return res.status(404).json({ error: 'Eintrag nicht gefunden' });
  res.json({ mail: row });
});

/* ============================== v1.14.0 Posteingang + Rundmail ============================== */

/** Posteingang: neueste zuerst, mit Ungelesen-Zähler. */
router.get('/inbox', async (_req, res) => {
  const rows = await db('mail_inbox').orderBy('created_at', 'desc').limit(200)
    .select('id', 'from_email', 'from_name', 'subject', 'expert_id', 'gelesen', 'beantwortet_at', 'created_at');
  const ungelesen = await db('mail_inbox').where({ gelesen: false }).count('* as c').first();
  res.json({ inbox: rows, ungelesen: Number(ungelesen.c) });
});

/** Einzelne Mail lesen (markiert als gelesen). */
router.get('/inbox/:id(\\d+)', async (req, res) => {
  const row = await db('mail_inbox').where({ id: Number(req.params.id) }).first();
  if (!row) return res.status(404).json({ error: 'Nachricht nicht gefunden' });
  if (!row.gelesen) await db('mail_inbox').where({ id: row.id }).update({ gelesen: true });
  res.json({ mail: row });
});

/** Antwort direkt aus der Plattform (landet beim Absender, protokolliert in der Outbox). */
router.post('/inbox/:id(\\d+)/antwort', async (req, res) => {
  const row = await db('mail_inbox').where({ id: Number(req.params.id) }).first();
  if (!row) return res.status(404).json({ error: 'Nachricht nicht gefunden' });
  const text = String(req.body?.text || '').trim();
  if (text.length < 2) return res.status(400).json({ error: 'Antworttext erforderlich' });
  const subject = row.subject?.startsWith('Re:') ? row.subject : `Re: ${row.subject || 'Ihre Nachricht'}`;
  const msg = render({ subject, body_text: text }, {});
  try {
    await getMailProvider().send({ to: row.from_email, ...msg }, { tenantId: req.user.tenantId, templateKey: 'antwort' });
  } catch (e) {
    return res.status(502).json({ error: `Versand fehlgeschlagen: ${e.message}` });
  }
  await db('mail_inbox').where({ id: row.id }).update({ beantwortet_at: db.fn.now(), gelesen: true });
  await req.audit({ action: 'mail.antwort', resource: 'mail_inbox', resourceId: row.id, newValue: { an: row.from_email } });
  res.locals.auditLogged = true;
  res.json({ ok: true, message: `Antwort an ${row.from_email} versendet.` });
});

router.delete('/inbox/:id(\\d+)', async (req, res) => {
  await db('mail_inbox').where({ id: Number(req.params.id) }).delete();
  res.json({ ok: true });
});

/**
 * Rundmail an Segmente. DSGVO-Schranke: geht IMMER nur an Experten mit
 * aktiver Einwilligung. Platzhalter {{vorname}}, {{nachname}}.
 */
async function rundmailEmpfaenger(tenantId, statusFilter) {
  let q = db('experts').where({ tenant_id: tenantId }).whereNotNull('email').whereNotNull('user_id');
  if (statusFilter && statusFilter !== 'alle') q = q.where({ status: statusFilter });
  const experten = await q;
  const out = [];
  for (const e of experten) {
    const consent = await db('consents')
      .where({ user_id: e.user_id, zweck: 'talentpool' })
      .whereNull('revoked_at').where('expires_at', '>', db.fn.now()).first();
    if (consent) out.push(e);
  }
  return out;
}

router.get('/rundmail/empfaenger', async (req, res) => {
  const empfaenger = await rundmailEmpfaenger(req.user.tenantId, String(req.query.status || 'freigegeben'));
  res.json({ anzahl: empfaenger.length, emails: empfaenger.map((e) => e.email) });
});

router.post('/rundmail', async (req, res) => {
  const subject = String(req.body?.subject || '').trim().slice(0, 200);
  const body = String(req.body?.body_text || '').trim().slice(0, 8000);
  if (!subject || !body) return res.status(400).json({ error: 'Betreff und Text erforderlich' });
  const empfaenger = await rundmailEmpfaenger(req.user.tenantId, String(req.body?.status || 'freigegeben'));
  if (!empfaenger.length) return res.status(400).json({ error: 'Keine Empfänger mit aktiver Einwilligung im gewählten Segment.' });
  if (empfaenger.length > 500) return res.status(400).json({ error: 'Mehr als 500 Empfänger, bitte Segment verkleinern.' });

  let gesendet = 0;
  const fehler = [];
  for (const e of empfaenger) {
    const msg = render({ subject, body_text: body }, { vorname: e.vorname, nachname: e.nachname });
    try {
      await getMailProvider().send({ to: e.email, ...msg }, { tenantId: req.user.tenantId, templateKey: 'rundmail' });
      gesendet++;
    } catch (err) { fehler.push(`${e.email}: ${err.message}`); }
  }
  await req.audit({ action: 'mail.rundmail', resource: 'mail_outbox', resourceId: null, newValue: { subject, gesendet, fehler: fehler.length } });
  res.locals.auditLogged = true;
  res.json({ ok: true, gesendet, fehler, message: `Rundmail an ${gesendet} Empfänger versendet.` });
});

module.exports = router;
