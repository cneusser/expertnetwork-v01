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

module.exports = router;
