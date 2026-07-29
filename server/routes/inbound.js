/**
 * v1.14.0 — Brevo Inbound-Webhook: Antworten auf Plattform-Mails landen hier.
 * Absicherung über geteiltes Geheimnis in der URL (?key=INBOUND_KEY), da
 * Brevo keine Signatur mitschickt. Ohne gesetzten INBOUND_KEY ist der
 * Endpunkt deaktiviert. Zuordnung zum Experten/Konto über die Absenderadresse.
 */
const express = require('express');
const { db } = require('../db/knex');

const router = express.Router();

router.post('/inbound', async (req, res) => {
  if (!process.env.INBOUND_KEY) return res.status(503).json({ error: 'Posteingang nicht konfiguriert (INBOUND_KEY fehlt)' });
  if (String(req.query.key) !== process.env.INBOUND_KEY) return res.status(401).json({ error: 'Ungültiger Schlüssel' });

  // Brevo liefert { items: [...] }; defensiv auch Einzelobjekte akzeptieren.
  const items = Array.isArray(req.body?.items) ? req.body.items : [req.body];
  const tenant = await db('tenants').where({ slug: 'phalanx' }).first();
  let gespeichert = 0;

  for (const item of items) {
    const fromEmail = String(item?.From?.Address || item?.from?.address || item?.from || '').toLowerCase().trim();
    if (!fromEmail || !fromEmail.includes('@')) continue;
    const fromName = item?.From?.Name || item?.from?.name || null;
    const subject = String(item?.Subject || item?.subject || '(kein Betreff)').slice(0, 300);
    const bodyText = String(item?.ExtractedMarkdownMessage || item?.RawTextBody || item?.text || '').slice(0, 20000) || null;
    const bodyHtml = String(item?.RawHtmlBody || item?.html || '').slice(0, 100000) || null;

    const expert = await db('experts').whereRaw('lower(email) = ?', [fromEmail]).first();
    const user = expert ? null : await db('users').whereRaw('lower(email) = ?', [fromEmail]).first();

    await db('mail_inbox').insert({
      tenant_id: tenant?.id || 1,
      from_email: fromEmail,
      from_name: fromName ? String(fromName).slice(0, 150) : null,
      subject,
      body_text: bodyText,
      body_html: bodyHtml,
      expert_id: expert?.id || null,
      user_id: expert?.user_id || user?.id || null,
    });
    gespeichert++;
  }

  if (gespeichert) {
    await db('audit_log').insert({
      tenant_id: tenant?.id || 1, action: 'mail.inbound', resource: 'mail_inbox',
      new_value_json: JSON.stringify({ anzahl: gespeichert }),
    }).catch(() => {});
  }
  res.json({ ok: true, gespeichert });
});

module.exports = router;
