/**
 * MailProvider-Interface: { send({ to, subject, html, text }) }
 * Provider: Brevo (empfohlen — EU-Anbieter, wie bei Capitalmatch) oder Resend.
 * Dev/Fallback: Stub, loggt Mails in die Konsole.
 * Microsoft Graph: als Alternative dokumentiert (README), bewusst nicht gebaut.
 */
const brevo = require('./brevo');
const resend = require('./resend');
const stub = require('./stub');

function realProvider() {
  if (process.env.MAIL_PROVIDER === 'brevo' && process.env.BREVO_API_KEY) return { p: brevo, stub: false };
  if (process.env.MAIL_PROVIDER === 'resend' && process.env.RESEND_API_KEY) return { p: resend, stub: false };
  return { p: stub, stub: true };
}

/**
 * v1.8.0 — Wrapper mit Outbox: JEDE ausgehende Mail wird in mail_outbox
 * protokolliert (gesendet | fehler | stub). Logging darf den Versand nie
 * blockieren, Fehler beim Loggen werden nur auf der Konsole vermerkt.
 */
function getMailProvider() {
  const { p, stub: isStub } = realProvider();
  return {
    async send(msg, meta = {}) {
      const log = async (status, fehler = null) => {
        try {
          const { db } = require('../../db/knex');
          await db('mail_outbox').insert({
            tenant_id: meta.tenantId || 1,
            to_email: msg.to,
            subject: msg.subject,
            body_html: msg.html || null,
            template_key: meta.templateKey || null,
            status,
            fehler,
          });
        } catch (e) { console.error('Outbox-Protokoll fehlgeschlagen:', e.message); }
      };
      try {
        await p.send(msg);
        await log(isStub ? 'stub' : 'gesendet');
      } catch (e) {
        await log('fehler', e.message);
        throw e;
      }
    },
  };
}

module.exports = { getMailProvider };
