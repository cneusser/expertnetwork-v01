/**
 * MailProvider-Interface: { send({ to, subject, html, text }) }
 * Default: Resend (MAIL_PROVIDER=resend + RESEND_API_KEY).
 * Dev/Fallback: Stub, loggt Mails in die Konsole.
 * Microsoft Graph: als Alternative dokumentiert (README), bewusst nicht gebaut.
 */
const resend = require('./resend');
const stub = require('./stub');

function getMailProvider() {
  if (process.env.MAIL_PROVIDER === 'resend' && process.env.RESEND_API_KEY) {
    return resend;
  }
  return stub;
}

module.exports = { getMailProvider };
