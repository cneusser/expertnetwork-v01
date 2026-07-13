/**
 * Sprint 5 — Suche (nur Admin).
 * Volltext (FTS, deutsch, Boolean-Syntax) + Facettenfilter + gespeicherte Suchen.
 */
const express = require('express');
const { z } = require('zod');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const { toTsQuery } = require('../utils/boolquery');
const { freshness } = require('../utils/freshness');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

/** Facetten-Grunddaten für die Filter-UI (alle Skills, gruppiert). */
router.get('/meta', async (_req, res) => {
  const skills = await db('skills').where({ is_approved: true }).orderBy('name');
  res.json({ skills });
});

const { executeSearch } = require('../utils/searchRunner');

router.get('/', async (req, res) => {
  try {
    res.json(await executeSearch(req.user.tenantId, req.query));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* -------- Gespeicherte Suchen -------- */

const savedSchema = z.object({ name: z.string().min(1).max(80), params: z.record(z.any()) });

router.get('/saved', async (req, res) => {
  const rows = await db('saved_searches').where({ user_id: req.user.id }).orderBy('created_at', 'desc');
  res.json({ searches: rows });
});

router.post('/saved', async (req, res) => {
  const parsed = savedSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Name und Parameter erforderlich' });
  const [row] = await db('saved_searches')
    .insert({
      tenant_id: req.user.tenantId,
      user_id: req.user.id,
      name: parsed.data.name,
      params_json: JSON.stringify(parsed.data.params),
    })
    .returning('*');
  await req.audit({ action: 'search.saved', resource: 'saved_searches', resourceId: row.id, newValue: { name: row.name } });
  res.locals.auditLogged = true;
  res.status(201).json({ ok: true, search: row });
});

router.delete('/saved/:id(\\d+)', async (req, res) => {
  await db('saved_searches').where({ id: Number(req.params.id), user_id: req.user.id }).delete();
  res.json({ ok: true });
});


/** v1.4.0 — Suchagent: gespeicherte Suche beobachtet den Pool und meldet neue Treffer per Mail. */
router.post('/saved/:id(\\d+)/agent', async (req, res) => {
  const row = await db('saved_searches').where({ id: Number(req.params.id), user_id: req.user.id }).first();
  if (!row) return res.status(404).json({ error: 'Gespeicherte Suche nicht gefunden' });
  const aktiv = !row.agent_aktiv;
  // Beim Aktivieren aktuellen Stand als Basis merken — gemeldet wird nur, was NEU dazukommt.
  let lastIds = row.last_result_ids || [];
  if (aktiv) {
    try {
      const { results } = await executeSearch(row.tenant_id, row.params_json || {});
      lastIds = results.map((r) => r.id);
    } catch { lastIds = []; }
  }
  await db('saved_searches').where({ id: row.id }).update({
    agent_aktiv: aktiv, last_result_ids: JSON.stringify(lastIds), last_run_at: db.fn.now(),
  });
  await req.audit({ action: aktiv ? 'search.agent_on' : 'search.agent_off', resource: 'saved_searches', resourceId: row.id, newValue: { name: row.name } });
  res.locals.auditLogged = true;
  res.json({ ok: true, agent_aktiv: aktiv });
});

module.exports = router;
