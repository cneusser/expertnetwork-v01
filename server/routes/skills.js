/**
 * v1.19.0 — Skill-Taxonomie pflegen (nur Admin): Liste mit Verwendungszaehler,
 * Sammelfreigabe, Umbenennen, Kategorie aendern, Zusammenfuehren (Merge) und
 * Loeschen. Merge haengt alle Zuordnungen um und entfernt den Doppel-Begriff.
 */
const express = require('express');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const KATEGORIEN = ['kompetenz', 'technologie', 'rolle', 'branche', 'zertifikat'];

/** Alle Skills mit Verwendungszaehler, optional nur Vorschlaege. */
router.get('/', async (req, res) => {
  let q = db('skills as s')
    .leftJoin('expert_skills as es', 'es.skill_id', 's.id')
    .groupBy('s.id')
    .select('s.id', 's.name', 's.kategorie', 's.is_approved')
    .count('es.expert_id as verwendungen')
    .orderBy('s.name');
  if (req.query.nur === 'vorschlaege') q = q.where('s.is_approved', false);
  const rows = (await q).map((r) => ({ ...r, verwendungen: Number(r.verwendungen) }));
  res.json({ skills: rows, kategorien: KATEGORIEN });
});

/** Sammelfreigabe: alle Vorschlaege auf einmal bestaetigen. */
router.post('/freigeben-alle', async (req, res) => {
  const anzahl = await db('skills').where({ is_approved: false }).update({ is_approved: true });
  await req.audit({ action: 'skill.freigeben_alle', resource: 'skills', resourceId: null, newValue: { anzahl } });
  res.locals.auditLogged = true;
  res.json({ ok: true, anzahl, message: `${anzahl} Skill-Vorschlag/Vorschläge freigegeben.` });
});

/** Umbenennen, Kategorie setzen, freigeben. */
router.put('/:id(\\d+)', async (req, res) => {
  const skill = await db('skills').where({ id: Number(req.params.id) }).first();
  if (!skill) return res.status(404).json({ error: 'Skill nicht gefunden' });
  const updates = {};
  if (req.body?.name) {
    const name = String(req.body.name).trim().slice(0, 80);
    const doppelt = await db('skills').whereRaw('lower(name) = lower(?)', [name]).whereNot('id', skill.id).first();
    if (doppelt) return res.status(409).json({ error: `"${name}" existiert bereits. Bitte stattdessen zusammenführen.` });
    updates.name = name;
  }
  if (req.body?.kategorie && KATEGORIEN.includes(req.body.kategorie)) updates.kategorie = req.body.kategorie;
  if (req.body?.is_approved !== undefined) updates.is_approved = Boolean(req.body.is_approved);
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nichts zu ändern' });
  await db('skills').where({ id: skill.id }).update(updates);
  await req.audit({ action: 'skill.update', resource: 'skills', resourceId: skill.id, oldValue: { name: skill.name }, newValue: updates });
  res.locals.auditLogged = true;
  res.json({ ok: true });
});

/** Zusammenfuehren: Quelle geht im Ziel auf, Zuordnungen wandern mit. */
router.post('/:id(\\d+)/merge', async (req, res) => {
  const quelle = await db('skills').where({ id: Number(req.params.id) }).first();
  const ziel = await db('skills').where({ id: Number(req.body?.ziel_id) }).first();
  if (!quelle || !ziel) return res.status(404).json({ error: 'Skill nicht gefunden' });
  if (quelle.id === ziel.id) return res.status(400).json({ error: 'Quelle und Ziel sind identisch' });

  const zuordnungen = await db('expert_skills').where({ skill_id: quelle.id });
  for (const z of zuordnungen) {
    await db('expert_skills').insert({ expert_id: z.expert_id, skill_id: ziel.id })
      .onConflict(['expert_id', 'skill_id']).ignore();
  }
  await db('expert_skills').where({ skill_id: quelle.id }).delete();
  await db('project_skills').where({ skill_id: quelle.id }).delete().catch(() => {});
  await db('skills').where({ id: quelle.id }).delete();

  await req.audit({ action: 'skill.merge', resource: 'skills', resourceId: ziel.id, oldValue: { quelle: quelle.name }, newValue: { ziel: ziel.name, umgehaengt: zuordnungen.length } });
  res.locals.auditLogged = true;
  res.json({ ok: true, message: `"${quelle.name}" wurde in "${ziel.name}" zusammengeführt (${zuordnungen.length} Zuordnung(en)).` });
});

/** Loeschen inklusive aller Zuordnungen. */
router.delete('/:id(\\d+)', async (req, res) => {
  const skill = await db('skills').where({ id: Number(req.params.id) }).first();
  if (!skill) return res.status(404).json({ error: 'Skill nicht gefunden' });
  await db('expert_skills').where({ skill_id: skill.id }).delete();
  await db('project_skills').where({ skill_id: skill.id }).delete().catch(() => {});
  await db('skills').where({ id: skill.id }).delete();
  await req.audit({ action: 'skill.delete', resource: 'skills', resourceId: skill.id, oldValue: { name: skill.name } });
  res.locals.auditLogged = true;
  res.json({ ok: true });
});

module.exports = router;
