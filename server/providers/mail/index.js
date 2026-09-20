/**
 * MailProvider-Interface: { send({ to, subject, html, text }) }
 * Provider: Brevo (empfohlen — EU-Anbieter, wie bei Capitalmatch) oder Resend.
 * Dev/Fallback: Stub, loggt Mails in die Konsole.
 * Microsoft Graph: als Alternative dokumentiert (README), bewusst nicht gebaut.
 */
const brevo = require('./brevo');
const resend = require('./resend');
const stub = require('./stub');

function realProvider() {
  if (process.env.MAIL_PROVIDER === 'brevo' && process.env.BREVO_API_KEY) return { p: brevo, stub: false };
  if (process.env.MAIL_PROVIDER === 'resend' && process.env.RESEND_API_KEY) return { p: resend, stub: false };
  return { p: stub, stub: true };
}

/**
 * v1.32.0 — Werbeeinwilligung nach § 7 UWG, zentral geprüft.
 *
 * Adressen, die aus dem LinkedIn-Import des Phalanx-OS-Pools stammen, tragen
 * keine Werbeeinwilligung. Einzelkorrespondenz ist zulässig, automatisierte
 * Post nicht: kein Newsletter, kein Einladungszyklus, keine Erinnerung.
 *
 * Diese Prüfung sitzt bewusst hier und nicht im Einladungsjob. Jede ausgehende
 * Mail läuft durch diese eine Funktion. Eine Sperre im Job hätte der nächste
 * Job umgangen, den wir schreiben, und es wäre niemandem aufgefallen. Hier ist
 * der sichere Zustand der Standard: Wer eine Mail verschickt, ohne sich Gedanken
 * zu machen, wird gestoppt. Einzelkorrespondenz aus der Oberfläche setzt
 * `einzelkorrespondenz: true` und sagt damit ausdrücklich, was sie tut.
 *
 * Ein Fehler bei der Prüfung selbst darf nicht dazu führen, dass die Mail
 * trotzdem rausgeht. Deshalb gilt im Zweifel: nicht senden.
 */
async function werbungErlaubt(adresse) {
  if (!adresse) return { erlaubt: false, grund: 'keine Adresse' };
  try {
    const { db } = require('../../db/knex');
    const profil = await db('experts')
      .whereRaw('lower(trim(email)) = ?', [String(adresse).trim().toLowerCase()])
      .select('werbeeinwilligung', 'pool_contact_id').first();
    if (!profil) return { erlaubt: true, grund: null }; // kein Profil, also kein Pool-Kontakt
    if (profil.werbeeinwilligung) return { erlaubt: true, grund: null };
    return {
      erlaubt: false,
      grund: 'keine Werbeeinwilligung (§ 7 UWG), Kontakt stammt aus dem Datenpool',
    };
  } catch (e) {
    console.error('Einwilligungsprüfung fehlgeschlagen, Versand gestoppt:', e.message);
    return { erlaubt: false, grund: 'Einwilligung nicht prüfbar' };
  }
}

/**
 * v1.8.0 — Wrapper mit Outbox: JEDE ausgehende Mail wird in mail_outbox
 * protokolliert (gesendet | fehler | stub | gesperrt). Logging darf den Versand
 * nie blockieren, Fehler beim Loggen werden nur auf der Konsole vermerkt.
 */
function getMailProvider() {
  const { p, stub: isStub } = realProvider();
  return {
    async send(msg, meta = {}) {
      const log = async (status, fehler = null) => {
        try {
          const { db } = require('../../db/knex');
          await db('mail_outbox').insert({
            tenant_id: meta.tenantId || 1,
            to_email: msg.to,
            subject: msg.subject,
            body_html: msg.html || null,
            template_key: meta.templateKey || null,
            status,
            fehler,
          });
        } catch (e) { console.error('Outbox-Protokoll fehlgeschlagen:', e.message); }
      };

      if (!meta.einzelkorrespondenz) {
        const { erlaubt, grund } = await werbungErlaubt(msg.to);
        if (!erlaubt) {
          await log('gesperrt', grund);
          console.warn(`Mail an ${msg.to} nicht verschickt: ${grund}`);
          return; // kein Fehler nach außen, der Aufrufer soll nicht scheitern
        }
      }

      try {
        await p.send(msg);
        await log(isStub ? 'stub' : 'gesendet');
      } catch (e) {
        await log('fehler', e.message);
        throw e;
      }
    },
  };
}

module.exports = { getMailProvider, werbungErlaubt };
