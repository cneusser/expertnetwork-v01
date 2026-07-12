/**
 * MailProvider-Interface: { send({ to, subject, html, text }) }
 * Provider: Brevo (empfohlen — EU-Anbieter, wie bei Capitalmatch) oder Resend.
 * Dev/Fallback: Stub, loggt Mails in die Konsole.
 * Microsoft Graph: als Alternative dokumentiert (README), bewusst nicht gebaut.
 */
const brevo = require('./brevo');
const resend = require('./resend');
const stub = require('./stub');

function getMailProvider() {
  if (process.env.MAIL_PROVIDER === 'brevo' && process.env.BREVO_API_KEY) {
    return brevo;
  }
  if (process.env.MAIL_PROVIDER === 'resend' && process.env.RESEND_API_KEY) {
    return resend;
  }
  return stub;
}

module.exports = { getMailProvider };
