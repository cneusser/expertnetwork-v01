/**
 * v1.12.0 — Push-Matching nach Capitalmatch-Vorbild: Wird ein Projekt geöffnet,
 * werden passende Experten aktiv benachrichtigt statt nur passiv gelistet.
 * Schranken: Status freigegeben, aktive Einwilligung, Match-Score über der
 * Schwelle (MATCH_ALERT_MIN, Standard 60), auf keiner Ausschlussliste, und
 * je Projekt und Experte höchstens EINE Mail (match_alerts-Dedupe).
 */
const { db } = require('../db/knex');
const { computeMatch } = require('./matching');
const { freshness } = require('./freshness');
const { getMailProvider } = require('../providers/mail');
const { getTemplate, render } = require('./mailTemplates');

const APP_URL = () =>
  process.env.APP_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:5173');

async function sendProjectMatchAlerts(project) {
  const minScore = Number(process.env.MATCH_ALERT_MIN) || 60;
  const projectSkillIds = await db('project_skills').where({ project_id: project.id }).pluck('skill_id');
  const blocked = await db('blocklist').pluck('expert_id').catch(() => []);
  const experts = await db('experts')
    .where({ tenant_id: project.tenant_id, status: 'freigegeben' })
    .whereNotNull('user_id')
    .whereNotIn('id', blocked.length ? blocked : [0]);

  let gesendet = 0;
  for (const e of experts) {
    const consent = await db('consents')
      .where({ user_id: e.user_id, zweck: 'talentpool' })
      .whereNull('revoked_at').where('expires_at', '>', db.fn.now()).first();
    if (!consent || !e.email) continue;

    const [skills, latestAvail, latestRate, latestCv] = await Promise.all([
      db('expert_skills').where({ expert_id: e.id }).pluck('skill_id'),
      db('availabilities').where({ expert_id: e.id }).orderBy('created_at', 'desc').first(),
      db('rates').where({ expert_id: e.id }).orderBy('created_at', 'desc').first(),
      db('documents').where({ expert_id: e.id, kategorie: 'cv' }).orderBy('uploaded_at', 'desc').first(),
    ]);
    const f = freshness({
      availabilityConfirmedAt: latestAvail?.confirmed_at,
      rateCreatedAt: latestRate?.created_at,
      cvUploadedAt: latestCv?.uploaded_at,
    });
    const m = computeMatch({
      project, projectSkillIds, expertSkillIds: skills,
      latestAvail, latestRate, freshnessScore: f.score, nichtBestaetigt: f.nichtBestaetigt,
    });
    if (m.score < minScore) continue;

    // Dedupe: nur wenn dieser Experte für dieses Projekt noch nie alarmiert wurde.
    const inserted = await db('match_alerts')
      .insert({ project_id: project.id, expert_id: e.id, score: m.score })
      .onConflict(['project_id', 'expert_id']).ignore().returning('id');
    if (!inserted.length) continue;

    try {
      const tpl = await getTemplate(project.tenant_id, 'projekt_match');
      const msg = render(tpl, {
        vorname: e.vorname, nachname: e.nachname,
        projekt: `${project.name}${project.referenz ? ` (${project.referenz})` : ''}`,
        begruendung: m.begruendung || '',
        link: `${APP_URL()}/projekte`, link_label: 'Projekt ansehen',
      });
      await getMailProvider().send({ to: e.email, ...msg }, { tenantId: project.tenant_id, templateKey: 'projekt_match' });
      await db('audit_log').insert({
        tenant_id: project.tenant_id, action: 'project.match_alert', resource: 'projects',
        resource_id: project.id, new_value_json: JSON.stringify({ expert_id: e.id, score: m.score }),
      });
      gesendet++;
    } catch (err) {
      console.error('Match-Alert fehlgeschlagen:', err.message);
    }
  }
  return { gesendet, schwelle: minScore };
}

module.exports = { sendProjectMatchAlerts };
