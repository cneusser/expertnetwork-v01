/** Deutsche Mail-Templates für Sprint 0. */
const APP_URL = () => process.env.APP_URL || 'http://localhost:5173';

const layout = (inner) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a2332;">
    <div style="padding:24px 0;border-bottom:2px solid #0f2a4a;">
      <span style="font-size:18px;font-weight:700;color:#0f2a4a;">Phalanx</span>
      <span style="font-size:18px;font-weight:300;color:#5a6472;"> Expert Network</span>
    </div>
    <div style="padding:24px 0;line-height:1.6;">${inner}</div>
    <div style="padding:16px 0;border-top:1px solid #e3e6ea;font-size:12px;color:#8a93a0;">
      Phalanx GmbH · Diese E-Mail wurde automatisch versendet.
    </div>
  </div>`;

const button = (href, label) =>
  `<a href="${href}" style="display:inline-block;background:#0f2a4a;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">${label}</a>`;

function verificationMail(token) {
  const url = `${APP_URL()}/verify?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Bitte bestätigen Sie Ihre E-Mail-Adresse',
    html: layout(`
      <p>Guten Tag,</p>
      <p>vielen Dank für Ihre Registrierung im Phalanx Expert Network.
      Bitte bestätigen Sie Ihre E-Mail-Adresse:</p>
      <p>${button(url, 'E-Mail-Adresse bestätigen')}</p>
      <p style="font-size:13px;color:#5a6472;">Der Link ist 7 Tage gültig.
      Falls Sie sich nicht registriert haben, ignorieren Sie diese E-Mail.</p>`),
    text: `Bitte bestätigen Sie Ihre E-Mail-Adresse: ${url}`,
  };
}

function passwordResetMail(token) {
  const url = `${APP_URL()}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Passwort zurücksetzen — Phalanx Expert Network',
    html: layout(`
      <p>Guten Tag,</p>
      <p>Sie haben das Zurücksetzen Ihres Passworts angefordert:</p>
      <p>${button(url, 'Neues Passwort vergeben')}</p>
      <p style="font-size:13px;color:#5a6472;">Der Link ist 1 Stunde gültig.
      Falls Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.</p>`),
    text: `Passwort zurücksetzen: ${url}`,
  };
}

module.exports = { verificationMail, passwordResetMail };
