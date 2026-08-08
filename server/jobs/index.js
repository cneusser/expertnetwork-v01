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

/**
 * v1.12.0 — Einladungs-Lebenszyklus: Kontakte ohne Einwilligung werden erinnert
 * und danach DSGVO-konform geloescht (Datenminimierung).
 *   Zyklus 'neu':     Erinnerung Tag 7 und Tag 21, Loeschung ab Tag 28
 *   Zyklus 'bestand': Erinnerung Tag 7, Loeschung ab Tag 14
 * Der Zyklus endet automatisch mit Annahme der Einladung (Consent vorhanden).
 */
const ZYKLEN = { neu: [7, 21], bestand: [7] };

async function runInviteLifecycle() {
  const { getTemplate, render } = require('../utils/mailTemplates');
  const { deleteExpertCascade } = require('../utils/expertDeletion');
  const APP_URL = process.env.APP_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:5173');

  const kandidaten = await db('experts')
    .where({ status: 'eingeladen' })
    .whereNotNull('invite_cycle_started_at')
    .whereNotNull('user_id');

  let erinnert = 0;
  let geloescht = 0;
  for (const e of kandidaten) {
    const consent = await db('consents')
      .where({ user_id: e.user_id, zweck: 'talentpool' })
      .whereNull('revoked_at').where('expires_at', '>', db.fn.now()).first();
    if (consent) continue; // angenommen, Zyklus beendet

    const stufen = ZYKLEN[e.invite_zyklus] || ZYKLEN.neu;
    const tage = Math.floor((Date.now() - new Date(e.invite_cycle_started_at).getTime()) / 86400000);
    const loeschTag = stufen[stufen.length - 1] + 7;

    if (tage >= loeschTag) {
      await deleteExpertCascade(e, {
        tenantId: e.tenant_id,
        grund: `Einladung nicht angenommen, automatische Loeschung nach ${loeschTag} Tagen (Datenminimierung)`,
      });
      geloescht++;
      continue;
    }

    const faellig = stufen.filter((s) => tage >= s).length;
    if (faellig > e.invite_reminders_sent && e.email) {
      const token = signPurposeToken(e.user_id, 'expert-invite', '14d');
      const link = `${APP_URL}/einladung?token=${encodeURIComponent(token)}`;
      try {
        const tpl = await getTemplate(e.tenant_id, 'einladung_erinnerung');
        const msg = render(tpl, { vorname: e.vorname, nachname: e.nachname, link, link_label: 'Profil anlegen' });
        await getMailProvider().send({ to: e.email, ...msg }, { tenantId: e.tenant_id, templateKey: 'einladung_erinnerung' });
        await db('experts').where({ id: e.id }).update({ invite_reminders_sent: faellig });
        await db('audit_log').insert({
          tenant_id: e.tenant_id, action: 'invite.reminder_sent', resource: 'experts',
          resource_id: e.id, new_value_json: JSON.stringify({ stufe: faellig, tage }),
        });
        erinnert++;
      } catch (err) { console.error('Einladungs-Erinnerung fehlgeschlagen:', err.message); }
    }
  }
  return { erinnert, geloescht };
}

/**
 * v1.17.0 — Provider-Digest (montags): anonymisierte Karten fuer Experten
 * mit Opt-in. "Neu im Netzwerk" = freigegeben + Opt-in, noch nie im Digest.
 * "Wieder verfuegbar" = Verfuegbarkeit in den letzten 7 Tagen bestaetigt
 * (sofort/teilweise). Empfaenger: alle freigegebenen Provider.
 */
async function runProviderDigest({ force = false } = {}) {
  if (!force && new Date().getDay() !== 1) return { uebersprungen: 'nicht Montag' };
  const { getTemplate, render } = require('../utils/mailTemplates');
  const APP_URL = process.env.APP_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:5173');

  const basis = await db('experts').where({ status: 'freigegeben', provider_optin: true });
  const karte = async (e) => {
    const skills = await db('expert_skills').join('skills', 'skills.id', 'expert_skills.skill_id')
      .where('expert_id', e.id).where('skills.is_approved', true).pluck('skills.name');
    const avail = await db('availabilities').where({ expert_id: e.id }).orderBy('created_at', 'desc').first();
    const verf = avail
      ? (avail.status === 'ausgebucht' ? 'auf Anfrage' : avail.ab_datum ? `ab ${new Date(avail.ab_datum).toLocaleDateString('de-DE')}` : 'kurzfristig')
      : 'auf Anfrage';
    return `Profil #${e.id}: ${e.berufsbezeichnung || 'Interim Manager'} | ${skills.slice(0, 5).join(', ') || 'Profil auf Anfrage'} | verfuegbar ${verf}`;
  };

  const neue = basis.filter((e) => !e.digest_included_at);
  const seit = new Date(Date.now() - 7 * 86400000);
  const wieder = [];
  for (const e of basis) {
    if (neue.includes(e)) continue;
    const conf = await db('availabilities').where({ expert_id: e.id })
      .where('confirmed_at', '>', seit).whereIn('status', ['sofort', 'teilweise']).first();
    if (conf) wieder.push(e);
  }
  if (!neue.length && !wieder.length) return { gesendet: 0, grund: 'keine Neuigkeiten' };

  const zeilen = [];
  if (neue.length) {
    zeilen.push('Neu im Netzwerk:');
    for (const e of neue) zeilen.push(await karte(e));
  }
  if (wieder.length) {
    zeilen.push(neue.length ? '\nWieder verfuegbar:' : 'Wieder verfuegbar:');
    for (const e of wieder) zeilen.push(await karte(e));
  }

  const provider = await db('users').where({ role: 'provider', is_approved: true }).whereNotNull('email_verified_at');
  let gesendet = 0;
  for (const p of provider) {
    try {
      const tpl = await getTemplate(p.tenant_id, 'provider_digest');
      const msg = render(tpl, { inhalt: zeilen.join('\n'), link: `${APP_URL}/provider`, link_label: 'Zum Portal' });
      await getMailProvider().send({ to: p.email, ...msg }, { tenantId: p.tenant_id, templateKey: 'provider_digest' });
      gesendet++;
    } catch (err) { console.error('Provider-Digest:', err.message); }
  }
  if (gesendet || provider.length === 0) {
    for (const e of neue) await db('experts').where({ id: e.id }).update({ digest_included_at: db.fn.now() });
  }
  await db('audit_log').insert({
    tenant_id: 1, action: 'provider.digest', resource: 'mail_outbox',
    new_value_json: JSON.stringify({ provider: gesendet, neu: neue.length, wieder: wieder.length }),
  }).catch(() => {});
  return { gesendet, neu: neue.length, wieder: wieder.length };
}

/**
 * v1.24.0 — Quartalscheck: alle 90 Tage einmal freundlich nachfragen, ob das
 * Profil noch stimmt. Nur an Experten mit aktiver Einwilligung, gedrosselt auf
 * 50 Mails je Lauf, damit an einem Tag kein Schwall rausgeht.
 */
async function runProfilCheck({ tage = 90, maxProLauf = 50 } = {}) {
  const { getTemplate, render } = require('../utils/mailTemplates');
  const APP_URL = process.env.APP_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:5173');
  const kandidaten = await db('experts')
    .whereIn('status', ['freigegeben', 'registriert'])
    .whereNotNull('email').whereNotNull('user_id')
    .where(function where() {
      this.whereNull('letzter_profilcheck_at').orWhere('letzter_profilcheck_at', '<', DAYS(tage));
    })
    .orderBy('letzter_profilcheck_at', 'asc')
    .limit(maxProLauf);

  let gesendet = 0;
  for (const expert of kandidaten) {
    const consent = await db('consents')
      .where({ user_id: expert.user_id, zweck: 'talentpool' })
      .whereNull('revoked_at').where('expires_at', '>', db.fn.now()).first();
    if (!consent) continue; // DSGVO-Schranke, wie bei allen Regelmails
    try {
      const tpl = await getTemplate(expert.tenant_id, 'profil_check');
      const msg = render(tpl, {
        vorname: expert.vorname, nachname: expert.nachname,
        link: `${APP_URL}/profil`, link_label: 'Profil ansehen',
      });
      await getMailProvider().send({ to: expert.email, ...msg },
        { tenantId: expert.tenant_id, templateKey: 'profil_check' });
      await db('experts').where({ id: expert.id }).update({ letzter_profilcheck_at: db.fn.now() });
      await db('audit_log').insert({
        tenant_id: expert.tenant_id, action: 'reminder.profil_check',
        resource: 'experts', resource_id: expert.id,
      });
      gesendet++;
    } catch (err) { console.error('Profilcheck:', expert.email, err.message); }
  }
  return { gesendet, geprueft: kandidaten.length };
}

module.exports = { runAvailabilityReminders, runConsentJobs, runSearchAgents, runInviteLifecycle, runProviderDigest, runProfilCheck };
