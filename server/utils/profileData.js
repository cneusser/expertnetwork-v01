/**
 * v1.5.0 — Gemeinsame Profil-Aufbereitung für PDF-Shortlist und
 * PPTX-Beraterprofile (einzeln, Sammelprofil, Hidden-Link).
 */
const { db } = require('../db/knex');
const storage = require('../providers/storage');

const ANSPRECHPARTNER =
  'Dr. Christian Neusser\nPhalanx GmbH\nHelene-Lange-Straße 28 · 91056 Erlangen\n+49 9131 920 60 75 · +49 151 625 00 802\nneusser@phalanx.de · https://phalanx.de';

/**
 * Baut einen Profil-Eintrag im Shortlist-Format.
 * anonymLabel: z. B. 'Experte A' — dann ohne Klarnamen und ohne Foto.
 */
async function expertToProfile(expert, { anonymLabel = null, mitFoto = false } = {}) {
  const skills = await db('expert_skills').join('skills', 'skills.id', 'expert_skills.skill_id')
    .where('expert_id', expert.id).select('skills.name', 'skills.kategorie');
  const avail = await db('availabilities').where({ expert_id: expert.id }).orderBy('created_at', 'desc').first();
  const branchen = skills.filter((s) => s.kategorie === 'branche').map((s) => s.name).join(', ');
  let foto = null;
  if (mitFoto && !anonymLabel && expert.foto_pfad && storage.exists(expert.foto_pfad)) {
    try {
      const chunks = [];
      for await (const c of storage.createReadStream(expert.foto_pfad)) chunks.push(c);
      foto = Buffer.concat(chunks);
    } catch { foto = null; }
  }
  return {
    anzeige_name: anonymLabel || `${expert.vorname} ${expert.nachname}`,
    rolle: expert.berufsbezeichnung,
    hintergrund: expert.kurzprofil,
    projekterfahrung: branchen ? `Branchenerfahrung: ${branchen}` : null,
    schwerpunkte: skills.filter((s) => ['kompetenz', 'rolle'].includes(s.kategorie)).map((s) => s.name).slice(0, 10),
    verfuegbarkeit: avail
      ? `${avail.status === 'ausgebucht' ? 'Auf Anfrage' : avail.ab_datum ? `ab ${new Date(avail.ab_datum).toLocaleDateString('de-DE')}` : 'kurzfristig'}${avail.auslastung_prozent ? ` (${avail.auslastung_prozent} %)` : ''}`
      : null,
    foto,
  };
}

/** Freigegebene (released) Profile eines Projekts — nur diese sieht ein Dritter. */
async function releasedProfiles(projectId, { mitFoto = false } = {}) {
  const releases = await db('project_releases').where({ project_id: projectId });
  const profiles = [];
  for (const r of releases) {
    const e = await db('experts').where({ id: r.expert_id }).first();
    if (!e) continue;
    profiles.push(await expertToProfile(e, {
      anonymLabel: r.anonymized ? `Experte ${String.fromCharCode(65 + profiles.length)}` : null,
      mitFoto,
    }));
  }
  return profiles;
}

module.exports = { expertToProfile, releasedProfiles, ANSPRECHPARTNER };
