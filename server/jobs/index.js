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
const { availabilityReminderMail, reconsentMail, searchAgentMail } = require('../providers/mail/templates');

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

/**
 * v1.4.0 — Suchagent: führt aktive gespeicherte Suchen aus und meldet dem
 * Besitzer per Mail, welche Experten seit dem letzten Lauf NEU in die
 * Treffermenge gekommen sind (interne Admin-Mail, keine Experten-Mail —
 * daher keine Consent-Schranke nötig).
 */
async function runSearchAgents() {
  const { executeSearch } = require('../utils/searchRunner');
  const agents = await db('saved_searches').where({ agent_aktiv: true });
  let notified = 0;
  for (const a of agents) {
    let results;
    try {
      ({ results } = await executeSearch(a.tenant_id, a.params_json || {}));
    } catch (e) {
      console.error(`Suchagent "${a.name}" (#${a.id}):`, e.message);
      continue;
    }
    const ids = results.map((r) => r.id);
    const known = new Set(a.last_result_ids || []);
    const neu = results.filter((r) => !known.has(r.id));
    await db('saved_searches').where({ id: a.id }).update({
      last_result_ids: JSON.stringify(ids), last_run_at: db.fn.now(),
    });
    if (!neu.length) continue;
    const owner = await db('users').where({ id: a.user_id }).first();
    if (owner) {
      try {
        await getMailProvider().send({ to: owner.email, ...searchAgentMail(a.name, neu.map((n) => ({ vorname: n.vorname, nachname: n.nachname, berufsbezeichnung: n.berufsbezeichnung }))) });
      } catch (e) { console.error('Suchagent-Mail fehlgeschlagen:', e.message); }
    }
    await db('audit_log').insert({
      tenant_id: a.tenant_id, action: 'search.agent_hit', resource: 'saved_searches', resource_id: a.id,
      new_value_json: JSON.stringify({ neue_treffer: neu.map((n) => n.id) }),
    });
    notified++;
  }
  return { agents: agents.length, notified };
}

module.exports = { runAvailabilityReminders, runConsentJobs, runSearchAgents };
