/** Dev-Stub: loggt Mails statt zu versenden. Letzte Mail abrufbar für Tests. */
const outbox = [];

async function send({ to, subject, html, text }) {
  const mail = { to, subject, html, text, ts: new Date().toISOString() };
  outbox.push(mail);
  console.log(`[MAIL-STUB] an ${to}: ${subject}`);
  return { id: `stub-${outbox.length}` };
}

module.exports = { send, outbox };
