/** Dev-Stub: loggt Mails statt zu versenden. Letzte Mail abrufbar für Tests. */
const outbox = [];

async function send({ to, subject, html, text, attachments }) {
  const mail = { to, subject, html, text, ts: new Date().toISOString(),
    attachments: (attachments || []).map((a) => ({ filename: a.filename, bytes: a.content?.length || 0 })) };
  outbox.push(mail);
  console.log(`[MAIL-STUB] an ${to}: ${subject}${mail.attachments.length ? ` (+${mail.attachments.length} Anhang)` : ''}`);
  return { id: `stub-${outbox.length}` };
}

module.exports = { send, outbox };
