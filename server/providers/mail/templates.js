/** Deutsche Mail-Templates. */
// Basis-URL für Links in Mails: APP_URL, sonst Railway-Domain (automatisch
// injiziert), sonst lokale Dev-URL. Ohne korrekte URL zeigen Verifizierungs-,
// Reset- und Bestätigungslinks ins Leere.
const APP_URL = () =>
  process.env.APP_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:5173');

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

function availabilityReminderMail(token, vorname) {
  const url = `${APP_URL()}/verfuegbarkeit?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Bitte bestätigen Sie Ihre aktuelle Verfügbarkeit',
    html: layout(`
      <p>Guten Tag ${vorname},</p>
      <p>damit wir Sie bei passenden Mandaten berücksichtigen können, bitten wir Sie,
      Ihre aktuelle Verfügbarkeit kurz zu bestätigen oder zu aktualisieren —
      ein Klick genügt, keine Anmeldung nötig:</p>
      <p>${button(url, 'Verfügbarkeit bestätigen')}</p>
      <p style="font-size:13px;color:#5a6472;">Der Link ist 7 Tage gültig. Ohne Rückmeldung
      wird Ihr Profil als „nicht bestätigt" gekennzeichnet.</p>`),
    text: `Bitte bestätigen Sie Ihre Verfügbarkeit: ${url}`,
  };
}

function inviteMail(token, vorname) {
  const url = `${APP_URL()}/einladung?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Ihr Profil im Phalanx Expert Network — Zugang & Einwilligung',
    html: layout(`
      <p>Guten Tag ${vorname},</p>
      <p>die Phalanx GmbH hat auf Basis der von Ihnen zugesandten Unterlagen ein Profil
      für Sie im <strong>Phalanx Expert Network</strong> angelegt (Stammdaten, Qualifikationen,
      Tagessätze, Verfügbarkeit sowie Ihre Dokumente in einem geschützten Bereich).</p>
      <p>Gemäß Art. 13/14 DSGVO informieren wir Sie darüber transparent. Über den folgenden
      Link können Sie Ihre Einwilligung erteilen, ein Passwort vergeben und Ihr Profil
      anschließend jederzeit selbst einsehen und pflegen:</p>
      <p>${button(url, 'Zugang aktivieren & Einwilligung erteilen')}</p>
      <p style="font-size:13px;color:#5a6472;">Der Link ist 14 Tage gültig. Wenn Sie keine
      Aufnahme in das Netzwerk wünschen, genügt eine kurze Antwort — wir löschen Ihre
      Daten dann umgehend.</p>`),
    text: `Ihr Profil im Phalanx Expert Network — Zugang aktivieren: ${url}`,
  };
}

function reconsentMail(token, vorname, expiresAt) {
  const url = `${APP_URL()}/einladung?token=${encodeURIComponent(token)}&renew=1`;
  return {
    subject: 'Ihre Einwilligung läuft ab — Phalanx Expert Network',
    html: layout(`
      <p>Guten Tag ${vorname},</p>
      <p>Ihre Einwilligung zur Speicherung Ihres Profils im Phalanx Expert Network läuft am
      <strong>${new Date(expiresAt).toLocaleDateString('de-DE')}</strong> ab. Wenn Sie weiterhin
      für Mandate berücksichtigt werden möchten, erneuern Sie die Einwilligung bitte hier:</p>
      <p>${button(url, 'Einwilligung erneuern')}</p>
      <p style="font-size:13px;color:#5a6472;">Ohne Erneuerung wird Ihr Profil nach Ablauf
      gesperrt und anschließend gelöscht bzw. anonymisiert.</p>`),
    text: `Einwilligung erneuern: ${url}`,
  };
}

module.exports = { verificationMail, passwordResetMail, availabilityReminderMail, inviteMail, reconsentMail };
