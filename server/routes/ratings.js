/**
 * v1.15.0 — Bewertungen (nur Admin): internes Rating mit vier Kriterien
 * und Kundenbewertung per einmaligem Token-Link.
 */
const express = require('express');
const crypto = require('crypto');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getTemplate, render } = require('../utils/mailTemplates');
const { getMailProvider } = require('../providers/mail');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const KRITERIEN = ['fachlichkeit', 'zuverlaessigkeit', 'kommunikation', 'wirkung'];
const APP_URL = () =>
  process.env.APP_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:5173');

/** Bewertungen eines Experten inkl. Durchschnitten. */
router.get('/expert/:id(\\d+)', async (req, res) => {
  const rows = await db('ratings')
    .where({ expert_id: Number(req.params.id), tenant_id: req.user.tenantId })
    .orderBy('created_at', 'desc');
  const mitSternen = rows.filter((r) => r.sterne != null);
  const avg = (list) => (list.length ? Math.round((list.reduce((s, r) => s + r.sterne, 0) / list.length) * 10) / 10 : null);
  res.json({
    ratings: rows,
    schnitt_intern: avg(mitSternen.filter((r) => r.typ === 'intern')),
    schnitt_kunde: avg(mitSternen.filter((r) => r.typ === 'kunde')),
    offen_kunde: rows.filter((r) => r.typ === 'kunde' && !r.eingeloest_at).length,
  });
});

/** Internes Rating anlegen (vier Kriterien 1 bis 5, Gesamt = Durchschnitt). */
router.post('/intern', async (req, res) => {
  const expert = await db('experts').where({ id: Number(req.body?.expert_id), tenant_id: req.user.tenantId }).first();
  if (!expert) return res.status(404).json({ error: 'Experte nicht gefunden' });
  const werte = {};
  for (const k of KRITERIEN) {
    const v = Number(req.body?.[k]);
    if (!Number.isInteger(v) || v < 1 || v > 5) return res.status(400).json({ error: `Kriterium ${k}: Wert 1 bis 5 erforderlich` });
    werte[k] = v;
  }
  const sterne = Math.round((Object.values(werte).reduce((s, v) => s + v, 0) / KRITERIEN.length) * 10) / 10;
  const [row] = await db('ratings').insert({
    tenant_id: req.user.tenantId, expert_id: expert.id, typ: 'intern',
    project_id: req.body?.project_id ? Number(req.body.project_id) : null,
    sterne: Math.round(sterne), kriterien_json: JSON.stringify(werte),
    kommentar: req.body?.kommentar ? String(req.body.kommentar).slice(0, 2000) : null,
    created_by: req.user.id,
  }).returning('*');
  await req.audit({ action: 'rating.intern', resource: 'ratings', resourceId: row.id, newValue: { expert_id: expert.id, sterne: row.sterne } });
  res.locals.auditLogged = true;
  res.status(201).json({ ok: true, rating: row });
});

/** Kundenbewertung anfragen: Token-Link erzeugen und per Mail versenden. */
router.post('/kunde-link', async (req, res) => {
  const expert = await db('experts').where({ id: Number(req.body?.expert_id), tenant_id: req.user.tenantId }).first();
  if (!expert) return res.status(404).json({ error: 'Experte nicht gefunden' });
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Gültige Kunden-E-Mail erforderlich' });
  const projekt = req.body?.projekt ? String(req.body.projekt).slice(0, 200) : null;

  const token = crypto.randomBytes(16).toString('hex');
  const [row] = await db('ratings').insert({
    tenant_id: req.user.tenantId, expert_id: expert.id, typ: 'kunde',
    kunde_email: email, kommentar: null, token, created_by: req.user.id,
    kriterien_json: projekt ? JSON.stringify({ projekt }) : null,
  }).returning('*');

  const link = `${APP_URL()}/bewertung?token=${token}`;
  try {
    const tpl = await getTemplate(req.user.tenantId, 'kundenbewertung');
    const msg = render(tpl, {
      experte: `${expert.vorname} ${expert.nachname}`,
      projekt: projekt || 'unser gemeinsames Projekt',
      link, link_label: 'Bewertung abgeben',
    });
    await getMailProvider().send({ to: email, ...msg }, { tenantId: req.user.tenantId, templateKey: 'kundenbewertung' });
  } catch (err) {
    return res.status(502).json({ error: `Mail-Versand fehlgeschlagen: ${err.message}` });
  }
  await req.audit({ action: 'rating.kunde_angefragt', resource: 'ratings', resourceId: row.id, newValue: { expert_id: expert.id, email } });
  res.locals.auditLogged = true;
  res.status(201).json({ ok: true, message: `Bewertungslink an ${email} versendet.` });
});

module.exports = router;
