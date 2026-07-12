/**
 * Scheduler-Jobs Sprint 2 — täglicher Lauf:
 * 1) Verfügbarkeits-Reminder: letzte Bestätigung > 14 Tage → Ein-Klick-Mail
 *    (max. 1 Reminder je 14 Tage je Experte).
 * 2) Consent-Ablauf: läuft in <= 30 Tagen ab → Erneuerungs-Mail (max. 1 je 30 Tage);
 *    abgelaufen → Profil auf status 'inaktiv' sperren (+ Audit).
 * Der abgeleitete Status "nicht bestätigt" (> 21 Tage) wird NICHT gespeichert,
 * sondern in der API dynamisch berechnet (utils/freshness.js).
 */
const { db } = require('../db/knex');
const { signPurposeToken } = require('../utils/tokens');
const { getMailProvider } = require('../providers/mail');
const { availabilityReminderMail, reconsentMail } = require('../providers/mail/templates');

const DAYS = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const IN_DAYS = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function runAvailabilityReminders() {
  const experts = await db('experts')
    .whereIn('status', ['freigegeben', 'registriert'])
    .whereNotNull('email');
  let sent = 0;
  for (const expert of experts) {
    // DSGVO-Schranke: Erinnerungen nur an Experten mit aktiver Einwilligung.
    // Administrativ importierte Profile ohne Consent erhalten stattdessen
    // die Einladung (Art.-14-Information) — manuell per Admin-Button.
    if (!expert.user_id) continue;
    const consent = await db('consents')
      .where({ user_id: expert.user_id, zweck: 'talentpool' })
      .whereNull('revoked_at')
      .where('expires_at', '>', db.fn.now())
      .first();
    if (!consent) continue;
    const latest = await db('availabilities').where({ expert_id: expert.id }).orderBy('created_at', 'desc').first();
    const confirmedAt = latest?.confirmed_at ? new Date(latest.confirmed_at) : null;
    const due = !confirmedAt || confirmedAt < DAYS(14);
    const throttled = expert.last_availability_reminder_at && new Date(expert.last_availability_reminder_at) > DAYS(14);
    if (!due || throttled) continue;
    const token = signPurposeToken(expert.id, 'confirm-availability', '7d');
    await getMailProvider().send({ to: expert.email, ...availabilityReminderMail(token, expert.vorname) });
    await db('experts').where({ id: expert.id }).update({ last_availability_reminder_at: db.fn.now() });
    await db('audit_log').insert({
      tenant_id: expert.tenant_id,
      action: 'reminder.availability_sent',
      resource: 'experts',
      resource_id: expert.id,
    });
    sent++;
  }
  return { sent };
}

async function runConsentJobs() {
  const experts = await db('experts').whereNotNull('user_id').whereNot('status', 'inaktiv');
  let reminded = 0;
  let locked = 0;
  for (const expert of experts) {
    const consent = await db('consents')
      .where({ user_id: expert.user_id, zweck: 'talentpool' })
      .whereNull('revoked_at')
      .orderBy('expires_at', 'desc')
      .first();
    if (!consent) continue; // Admin-Import ohne Einwilligung → Einladungs-Flow, kein Auto-Lock

    if (new Date(consent.expires_at) < new Date()) {
      await db('experts').where({ id: expert.id }).update({ status: 'inaktiv' });
      await db('audit_log').insert({
        tenant_id: expert.tenant_id,
        action: 'consent.expired_lock',
        resource: 'experts',
        resource_id: expert.id,
        old_value_json: JSON.stringify({ status: expert.status }),
        new_value_json: JSON.stringify({ status: 'inaktiv' }),
      });
      locked++;
    } else if (new Date(consent.expires_at) < IN_DAYS(30)) {
      const throttled = expert.last_consent_reminder_at && new Date(expert.last_consent_reminder_at) > DAYS(30);
      if (throttled || !expert.email) continue;
      const token = signPurposeToken(expert.user_id, 'renew-consent', '30d');
      await getMailProvider().send({ to: expert.email, ...reconsentMail(token, expert.vorname, consent.expires_at) });
      await db('experts').where({ id: expert.id }).update({ last_consent_reminder_at: db.fn.now() });
      reminded++;
    }
  }
  return { reminded, locked };
}

module.exports = { runAvailabilityReminders, runConsentJobs };
