/**
 * Verfügbarkeit — Kern von Sprint 2.
 * Öffentliche Token-Routen (Ein-Klick aus der Erinnerungs-Mail, KEIN Login)
 * + Self-Service für angemeldete Experten. Insert-only: jeder Stand ist eine
 * neue Zeile, die Historie bleibt vollständig (Audit-Prinzip).
 */
const express = require('express');
const { z } = require('zod');
const { db } = require('../db/knex');
const { verifyToken } = require('../utils/tokens');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const updateSchema = z.object({
  status: z.enum(['sofort', 'ab_datum', 'teilweise', 'ausgebucht']),
  ab_datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  auslastung_prozent: z.union([z.literal(20), z.literal(40), z.literal(60), z.literal(80), z.literal(100)]).nullable().optional(),
  kommentar: z.string().max(300).optional(),
});

function expertFromToken(token) {
  const payload = verifyToken(token, 'confirm-availability');
  return db('experts').where({ id: payload.sub }).first();
}

async function insertAvailability(expert, data, source) {
  const [row] = await db('availabilities')
    .insert({
      tenant_id: expert.tenant_id,
      expert_id: expert.id,
      status: data.status,
      ab_datum: data.ab_datum || null,
      auslastung_prozent: data.auslastung_prozent || null,
      kommentar: data.kommentar || null,
      confirmed_at: db.fn.now(),
      source,
    })
    .returning('*');
  await db('audit_log').insert({
    tenant_id: expert.tenant_id,
    actor_id: expert.user_id,
    action: 'availability.update',
    resource: 'availabilities',
    resource_id: row.id,
    new_value_json: JSON.stringify(data),
  });
  return row;
}

/** Kontext für die öffentliche Bestätigungsseite. */
router.get('/context', async (req, res) => {
  try {
    const expert = await expertFromToken(req.query.token);
    if (!expert) return res.status(404).json({ error: 'Profil nicht gefunden' });
    const latest = await db('availabilities').where({ expert_id: expert.id }).orderBy('created_at', 'desc').first();
    res.json({ vorname: expert.vorname, latest });
  } catch {
    res.status(400).json({ error: 'Link ungültig oder abgelaufen' });
  }
});

/** Ein-Klick: „Ja, unverändert" — bestätigt den letzten Stand neu. */
router.post('/confirm', async (req, res) => {
  try {
    const expert = await expertFromToken(req.body.token);
    const latest = await db('availabilities').where({ expert_id: expert.id }).orderBy('created_at', 'desc').first();
    if (!latest) return res.status(400).json({ error: 'Keine Verfügbarkeit hinterlegt — bitte „Ändern" nutzen' });
    await insertAvailability(expert, {
      status: latest.status,
      ab_datum: latest.ab_datum ? new Date(latest.ab_datum).toISOString().slice(0, 10) : null,
      auslastung_prozent: latest.auslastung_prozent,
      kommentar: 'Bestätigt per Ein-Klick-Link',
    }, 'reminder_link');
    res.json({ ok: true, message: 'Vielen Dank — Ihre Verfügbarkeit ist bestätigt.' });
  } catch {
    res.status(400).json({ error: 'Link ungültig oder abgelaufen' });
  }
});

/** „Ändern…" aus der Mail — neuer Stand ohne Login. */
router.post('/update', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Ungültige Angaben' });
  try {
    const expert = await expertFromToken(req.body.token);
    await insertAvailability(expert, parsed.data, 'reminder_link');
    res.json({ ok: true, message: 'Vielen Dank — Ihre Verfügbarkeit ist aktualisiert.' });
  } catch {
    res.status(400).json({ error: 'Link ungültig oder abgelaufen' });
  }
});

/** Self-Service (angemeldeter Experte). */
router.post('/self', requireAuth, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Ungültige Angaben' });
  const expert = await db('experts').where({ user_id: req.user.id }).first();
  if (!expert) return res.status(404).json({ error: 'Kein Expertenprofil vorhanden' });
  const row = await insertAvailability(expert, parsed.data, 'self');
  res.status(201).json({ ok: true, availability: row });
});

module.exports = router;
