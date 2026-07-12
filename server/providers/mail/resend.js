/** Resend-Implementierung des MailProvider-Interface (HTTP-API, kein SDK nötig). */
async function send({ to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || 'Phalanx Expert Network <noreply@phalanx.example>',
      to: [to],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend-Fehler ${res.status}: ${body}`);
  }
  return res.json();
}

module.exports = { send };
