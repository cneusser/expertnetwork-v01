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
    subject: 'Bitte bestätige deine E-Mail-Adresse',
    html: layout(`
      <p>Hallo,</p>
      <p>danke für deine Registrierung im Phalanx Expert Network. Ein Klick noch,
      dann ist deine E-Mail-Adresse bestätigt:</p>
      <p>${button(url, 'E-Mail-Adresse bestätigen')}</p>
      <p style="font-size:13px;color:#5a6472;">Der Link ist 7 Tage gültig. Wenn du dich nicht
      registriert hast, ignoriere diese Mail einfach.</p>`),
    text: `E-Mail-Adresse bestätigen: ${url}`,
  };
}

function passwordResetMail(token) {
  const url = `${APP_URL()}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Passwort zurücksetzen',
    html: layout(`
      <p>Hallo,</p>
      <p>du möchtest dein Passwort zurücksetzen? Hier entlang:</p>
      <p>${button(url, 'Neues Passwort vergeben')}</p>
      <p style="font-size:13px;color:#5a6472;">Der Link ist 1 Stunde gültig. Wenn du das nicht
      warst, kannst du diese Mail ignorieren, dein Passwort bleibt unverändert.</p>`),
    text: `Passwort zurücksetzen: ${url}`,
  };
}

function availabilityReminderMail(token, vorname) {
  const url = `${APP_URL()}/verfuegbarkeit?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Bist du gerade verfügbar? Bitte kurz deine Verfügbarkeit bestätigen',
    html: layout(`
      <p>Hallo ${vorname},</p>
      <p>damit wir dich bei passenden Mandaten auf dem Zettel haben, bestätige bitte kurz
      deine aktuelle Verfügbarkeit. Ein Klick genügt, keine Anmeldung nötig:</p>
      <p>${button(url, 'Verfügbarkeit bestätigen')}</p>
      <p style="font-size:13px;color:#5a6472;">Der Link ist 7 Tage gültig. Ohne Rückmeldung
      erscheint dein Profil als "nicht bestätigt".</p>`),
    text: `Verfügbarkeit bestätigen: ${url}`,
  };
}

function inviteMail(token, vorname) {
  const url = `${APP_URL()}/einladung?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Dein Profil im Phalanx Expert Network',
    html: layout(`
      <p>Hallo ${vorname},</p>
      <p>wir haben auf Basis deiner Unterlagen ein Profil für dich im
      <strong>Phalanx Expert Network</strong> angelegt. Darüber informieren wir dich
      transparent, wie es Art. 13 und 14 der DSGVO verlangen.</p>
      <p>Über den folgenden Link erteilst du deine Einwilligung, vergibst ein Passwort
      und pflegst dein Profil danach selbst:</p>
      <p>${button(url, 'Zugang aktivieren')}</p>
      <p style="font-size:13px;color:#5a6472;">Der Link ist 14 Tage gültig. Keine Aufnahme
      gewünscht? Eine kurze Antwort genügt, dann löschen wir deine Daten umgehend.</p>`),
    text: `Zugang aktivieren: ${url}`,
  };
}

function reconsentMail(token, vorname, expiresAt) {
  const url = `${APP_URL()}/einladung?renew=1&token=${encodeURIComponent(token)}`;
  return {
    subject: 'Deine Einwilligung läuft bald ab',
    html: layout(`
      <p>Hallo ${vorname},</p>
      <p>deine Einwilligung zur Speicherung deines Profils im Phalanx Expert Network läuft am
      <strong>${new Date(expiresAt).toLocaleDateString('de-DE')}</strong> ab. Wenn du weiter
      für Mandate berücksichtigt werden möchtest, erneuere sie bitte hier:</p>
      <p>${button(url, 'Einwilligung erneuern')}</p>
      <p style="font-size:13px;color:#5a6472;">Ohne Erneuerung wird dein Profil nach Ablauf
      gesperrt und anschließend gelöscht bzw. anonymisiert.</p>`),
    text: `Einwilligung erneuern: ${url}`,
  };
}

/** v1.4.0 — Suchagent meldet neue Treffer (interne Mail an den Admin). */
function searchAgentMail(searchName, hits) {
  const url = `${APP_URL()}/suche`;
  const items = hits.map((h) =>
    `<li><strong>${h.vorname} ${h.nachname}</strong>${h.berufsbezeichnung ? ` (${h.berufsbezeichnung})` : ''}</li>`).join('');
  return {
    subject: `Suchagent "${searchName}": ${hits.length} neue${hits.length === 1 ? 'r Treffer' : ' Treffer'}`,
    html: layout(`
      <p>Hallo,</p>
      <p>dein Suchagent <strong>${searchName}</strong> hat neue passende Experten gefunden:</p>
      <ul>${items}</ul>
      <p>${button(url, 'Zur Suche')}</p>`),
    text: `Suchagent "${searchName}": ${hits.map((h) => `${h.vorname} ${h.nachname}`).join(', ')}`,
  };
}

module.exports = { verificationMail, passwordResetMail, availabilityReminderMail, inviteMail, reconsentMail, searchAgentMail };
