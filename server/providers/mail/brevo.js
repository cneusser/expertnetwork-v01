/**
 * Brevo-Implementierung des MailProvider-Interface (HTTP-API v3, kein SDK).
 * Env: BREVO_API_KEY, MAIL_FROM (z. B. "Phalanx Expert Network <noreply@phalanx.de>").
 * Analog zur Capitalmatch-Anbindung — gleicher Account/gleiche Domain nutzbar.
 */
function parseFrom() {
  const raw = process.env.MAIL_FROM || 'Phalanx Expert Network <noreply@phalanx.example>';
  const m = raw.match(/^(.*)<(.+)>$/);
  return m ? { name: m[1].trim(), email: m[2].trim() } : { name: 'Phalanx Expert Network', email: raw.trim() };
}

async function send({ to, subject, html, text }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: parseFrom(),
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo-Fehler ${res.status}: ${body}`);
  }
  return res.json();
}

module.exports = { send };
