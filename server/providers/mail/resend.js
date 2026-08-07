/** Resend-Implementierung des MailProvider-Interface (HTTP-API, kein SDK nötig). */
async function send({ to, subject, html, text, attachments }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || 'Phalanx Expert Network <noreply@phalanx.example>',
      to: [to],
      ...(process.env.MAIL_REPLY_TO ? { reply_to: process.env.MAIL_REPLY_TO } : {}),
      subject,
      html,
      text,
      ...(attachments?.length
        ? { attachments: attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') })) }
        : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend-Fehler ${res.status}: ${body}`);
  }
  return res.json();
}

module.exports = { send };
