/**
 * Sprint 7 — Kommunikation (nur Admin).
 * Einzel-/Serienmail mit Platzhaltern ({briefanrede}, {vorname}, {nachname},
 * {firma}, {projekt}), Terminanfrage mit Slots + hinterlegtem Teams-Link.
 * Jede versendete Mail landet personalisiert in der Kommunikationshistorie.
 */
const express = require('express');
const { z } = require('zod');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getMailProvider } = require('../providers/mail');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const sendSchema = z.object({
  expert_ids: z.array(z.number().int()).min(1).max(100),
  typ: z.enum(['einzelmail', 'serienmail', 'terminanfrage']),
  betreff: z.string().min(2).max(200),
  body: z.string().min(2).max(10000),
  projekt_id: z.number().int().nullable().optional(),
  slots: z.array(z.string().max(80)).max(5).optional(), // Terminvorschläge (Freitext/ISO)
});

function briefanrede(e) {
  const titel = e.titel ? `${e.titel} ` : '';
  if (e.anrede === 'herr') return `Sehr geehrter Herr ${titel}${e.nachname}`;
  if (e.anrede === 'frau') return `Sehr geehrte Frau ${titel}${e.nachname}`;
  return `Guten Tag ${titel}${e.vorname} ${e.nachname}`;
}

function personalize(text, expert, projekt) {
  return text
    .replaceAll('{briefanrede}', briefanrede(expert))
    .replaceAll('{vorname}', expert.vorname || '')
    .replaceAll('{nachname}', expert.nachname || '')
    .replaceAll('{firma}', expert.firma || '')
    .replaceAll('{projekt}', projekt?.name || '');
}

const mailLayout = (inner) => `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a2332;">
    <div style="padding:24px 0;border-bottom:2px solid #0f2a4a;">
      <span style="font-size:18px;font-weight:700;color:#0f2a4a;">Phalanx</span>
      <span style="font-size:18px;font-weight:300;color:#5a6472;"> Expert Network</span>
    </div>
    <div style="padding:24px 0;line-height:1.6;white-space:pre-line;">${inner}</div>
    <div style="padding:16px 0;border-top:1px solid #e3e6ea;font-size:12px;color:#8a93a0;">Phalanx GmbH</div>
  </div>`;

/** Teams-Link des Mandanten (Konfigurationsfeld). */
router.get('/settings', async (req, res) => {
  const tenant = await db('tenants').where({ id: req.user.tenantId }).first();
  const branding = typeof tenant.branding_json === 'string' ? JSON.parse(tenant.branding_json || '{}') : (tenant.branding_json || {});
  res.json({ teams_link: branding.teams_link || '' });
});

router.put('/settings', async (req, res) => {
  const teams_link = String(req.body?.teams_link || '').slice(0, 300);
  const tenant = await db('tenants').where({ id: req.user.tenantId }).first();
  const branding = typeof tenant.branding_json === 'string' ? JSON.parse(tenant.branding_json || '{}') : (tenant.branding_json || {});
  branding.teams_link = teams_link;
  await db('tenants').where({ id: tenant.id }).update({ branding_json: JSON.stringify(branding) });
  await req.audit({ action: 'settings.teams_link', resource: 'tenants', resourceId: tenant.id, newValue: { teams_link } });
  res.locals.auditLogged = true;
  res.json({ ok: true });
});

/** Versand (einzeln, Serie oder Terminanfrage). */
router.post('/send', async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const { expert_ids, typ, betreff, body, projekt_id, slots = [] } = parsed.data;

  const projekt = projekt_id ? await db('projects').where({ id: projekt_id, tenant_id: req.user.tenantId }).first() : null;
  const tenant = await db('tenants').where({ id: req.user.tenantId }).first();
  const branding = typeof tenant.branding_json === 'string' ? JSON.parse(tenant.branding_json || '{}') : (tenant.branding_json || {});

  const results = [];
  for (const id of expert_ids) {
    const expert = await db('experts').where({ id, tenant_id: req.user.tenantId }).first();
    if (!expert || !expert.email) {
      results.push({ expert_id: id, ok: false, fehler: 'Kein Profil / keine E-Mail' });
      continue;
    }
    let text = personalize(`${body}`, expert, projekt);
    if (typ === 'terminanfrage') {
      const slotText = slots.length ? `\n\nTerminvorschläge:\n${slots.map((s) => `• ${s}`).join('\n')}` : '';
      const teams = branding.teams_link ? `\n\nBesprechungslink (Microsoft Teams):\n${branding.teams_link}` : '';
      text += `${slotText}${teams}\n\nBitte antworten Sie kurz, welcher Termin passt.`;
    }
    const subject = personalize(betreff, expert, projekt);
    let status = 'gesendet';
    let fehler = null;
    try {
      await getMailProvider().send({ to: expert.email, subject, html: mailLayout(text), text });
    } catch (e) {
      status = 'fehlgeschlagen';
      fehler = e.message.slice(0, 250);
    }
    await db('communications').insert({
      tenant_id: req.user.tenantId,
      expert_id: expert.id,
      typ,
      betreff: subject,
      body: text,
      projekt_id: projekt?.id || null,
      sent_by: req.user.id,
      status,
      fehler,
    });
    results.push({ expert_id: id, ok: status === 'gesendet', fehler });
  }

  await req.audit({
    action: `communication.${typ}`,
    resource: 'communications',
    newValue: { betreff, empfaenger: expert_ids.length, gesendet: results.filter((r) => r.ok).length },
  });
  res.locals.auditLogged = true;
  res.json({ ok: true, results, gesendet: results.filter((r) => r.ok).length, fehlgeschlagen: results.filter((r) => !r.ok).length });
});

/** Historie (gesamt oder je Experte). */
router.get('/', async (req, res) => {
  let q = db('communications as c')
    .leftJoin('users as u', 'u.id', 'c.sent_by')
    .leftJoin('projects as p', 'p.id', 'c.projekt_id')
    .where('c.tenant_id', req.user.tenantId)
    .select('c.*', 'u.email as sender_email', 'p.name as projekt_name')
    .orderBy('c.sent_at', 'desc')
    .limit(200);
  if (req.query.expert_id) q = q.where('c.expert_id', Number(req.query.expert_id));
  res.json({ rows: await q });
});

module.exports = router;
