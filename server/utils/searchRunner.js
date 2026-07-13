/**
 * v1.4.0 — Gemeinsame Such-Ausführung für die Admin-Suche (Route) und den
 * Suchagenten (Scheduler-Job). params entspricht den Query-Parametern der
 * Suchseite (Strings). Wirft bei ungültiger Boolean-Syntax.
 */
const { db } = require('../db/knex');
const { toTsQuery } = require('./boolquery');
const { freshness } = require('./freshness');

async function executeSearch(tenantId, params) {
  const today = new Date().toISOString().slice(0, 10);
  let query = db('experts').where({ tenant_id: tenantId }).whereNot('status', 'inaktiv');

  // Volltext mit Boolean-Syntax
  if (params.q) {
    const ts = toTsQuery(String(params.q)); // wirft bei ungültiger Syntax
    if (ts) query = query.whereRaw(`search_vector @@ to_tsquery('german', ?)`, [ts]);
  }

  // Skill-Facetten (AND-Logik: Experte muss ALLE gewählten Skills haben)
  const skillIds = String(params.skills || '').split(',').filter(Boolean).map(Number);
  for (const sid of skillIds) {
    query = query.whereIn('id', db('expert_skills').select('expert_id').where('skill_id', sid));
  }

  if (params.arbeitsmodell) query = query.where('arbeitsmodell', String(params.arbeitsmodell));
  if (params.ort) query = query.whereILike('ort', `%${params.ort}%`);
  if (params.sprache) query = query.whereRaw('sprachen_json::text ILIKE ?', [`%${params.sprache}%`]);

  // Tagessatz-Range: es existiert ein aktueller Satz, der sich mit [min,max] überschneidet
  const satzMin = Number(params.satz_min) || null;
  const satzMax = Number(params.satz_max) || null;
  if (satzMin || satzMax) {
    query = query.whereIn('id', function () {
      this.select('expert_id').from('rates');
      if (satzMax) this.where('satz_von_eur', '<=', satzMax);
      if (satzMin) this.whereRaw('COALESCE(satz_bis_eur, satz_von_eur) >= ?', [satzMin]);
    });
  }

  const experts = await query.orderBy('nachname');

  // Anreicherung + Nachfilter (Verfügbarkeit, Ampel) — Pool-Größen erlauben das in JS.
  const results = [];
  for (const e of experts) {
    const avails = await db('availabilities').where({ expert_id: e.id }).orderBy('created_at', 'desc');
    const latestAvail = avails[0] || null;
    const latestRate = await db('rates').where({ expert_id: e.id }).orderBy('created_at', 'desc').first();
    const latestCv = await db('documents').where({ expert_id: e.id, kategorie: 'cv' }).orderBy('uploaded_at', 'desc').first();
    const skills = await db('expert_skills').join('skills', 'skills.id', 'expert_skills.skill_id')
      .where('expert_id', e.id).select('skills.id', 'skills.name', 'skills.kategorie');
    const f = freshness({
      availabilityConfirmedAt: latestAvail?.confirmed_at,
      rateCreatedAt: latestRate?.created_at,
      cvUploadedAt: latestCv?.uploaded_at,
    });

    if (params.verfuegbar === 'jetzt') {
      const current = avails.find((a) => !a.ab_datum || new Date(a.ab_datum).toISOString().slice(0, 10) <= today) || latestAvail;
      if (!current || !['sofort', 'teilweise'].includes(current.status) || f.nichtBestaetigt) continue;
    }
    if (params.verfuegbar === 'ab_datum' && params.ab_datum) {
      const ok = avails.some((a) => a.ab_datum && new Date(a.ab_datum).toISOString().slice(0, 10) <= String(params.ab_datum) && a.status !== 'ausgebucht');
      if (!ok && (!latestAvail || latestAvail.status === 'ausgebucht')) continue;
    }
    if (params.ampel && f.ampel !== params.ampel) continue;

    results.push({ ...e, search_vector: undefined, skills, availabilities: avails, latestRate, freshness: f });
  }

  // Facetten-Zählung über die Treffermenge (für die Sidebar)
  const facetCounts = {};
  for (const r of results) for (const s of r.skills) facetCounts[s.id] = (facetCounts[s.id] || 0) + 1;

  return { count: results.length, results, facetCounts };
}



module.exports = { executeSearch };
