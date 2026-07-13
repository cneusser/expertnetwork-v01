/**
 * v1.2.0 — Öffentliche Routen (KEIN Login):
 * - Projektseite per Referenz (nur offene Projekte, Whitelist-Felder)
 * - Bewerbung ohne Konto (Piquano-Muster: Satz, Verfügbar-ab, Referenzprojekte, CV, AGB)
 * - Hidden-Link /api/public/share/:token: Projekt + kuratierte Profilkarten + PDF
 */
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('../db/knex');
const storage = require('../providers/storage');
const { isPdfBuffer } = require('../utils/isPdf');
const { buildShortlistPdf } = require('../utils/profilePdf');
const { CONSENT_VERSION, CONSENT_ZWECK, consentExpiry } = require('../consent');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const publicProject = (p, skills) => ({
  referenz: p.referenz,
  name: p.name,
  beschreibung: p.beschreibung,
  start: p.start,
  ende: p.ende,
  ort: p.ort,
  arbeitsmodell: p.arbeitsmodell,
  auslastung_prozent: p.auslastung_prozent,
  remote_anteil: p.remote_anteil,
  bewerbungsfrist: p.bewerbungsfrist,
  tagessatz_von_eur: p.tagessatz_von_eur,
  tagessatz_bis_eur: p.tagessatz_bis_eur,
  gebuehr_modell: p.gebuehr_modell,
  gebuehr_prozent: p.gebuehr_prozent,
  skills,
});

/** Öffentliche Projektseite. */
router.get('/projects/:referenz', async (req, res) => {
  const p = await db('projects').where({ referenz: String(req.params.referenz).toUpperCase(), status: 'offen' }).first();
  if (!p) return res.status(404).json({ error: 'Projekt nicht gefunden' });
  const skills = await db('project_skills').join('skills', 'skills.id', 'project_skills.skill_id')
    .where('project_id', p.id).pluck('skills.name');
  res.json({ project: publicProject(p, skills) });
});

/** Bewerbung ohne Konto — legt Experte (Status 'eingeladen') + Bewerbung an. */
router.post('/projects/:referenz/apply', upload.single('cv'), async (req, res) => {
  const p = await db('projects').where({ referenz: String(req.params.referenz).toUpperCase(), status: 'offen' }).first();
  if (!p) return res.status(404).json({ error: 'Projekt nicht gefunden' });
  if (p.bewerbungsfrist && new Date(p.bewerbungsfrist) < new Date()) {
    return res.status(400).json({ error: 'Die Bewerbungsfrist ist abgelaufen.' });
  }
  const b = req.body || {};
  const email = String(b.email || '').toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
  if (!b.vorname || !b.nachname) return res.status(400).json({ error: 'Vor- und Nachname erforderlich' });
  if (b.consent !== 'true' && b.consent !== true) return res.status(400).json({ error: 'Zustimmung zu AGB/Datenschutz erforderlich' });
  if (req.file && !isPdfBuffer(req.file.buffer)) return res.status(400).json({ error: 'CV muss ein gültiges PDF sein' });

  // Experte anlegen oder wiederverwenden (Key: E-Mail)
  let user = await db('users').where({ email }).first();
  if (!user) {
    [user] = await db('users').insert({
      tenant_id: p.tenant_id,
      email,
      password_hash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10),
      role: 'expert',
      is_approved: true,
    }).returning('*');
  }
  let expert = await db('experts').where({ user_id: user.id }).first();
  if (!expert) {
    [expert] = await db('experts').insert({
      tenant_id: p.tenant_id,
      user_id: user.id,
      status: 'eingeladen',
      vorname: String(b.vorname).slice(0, 100),
      nachname: String(b.nachname).slice(0, 100),
      email,
      kurzprofil: b.referenzprojekte ? `[Referenzprojekte aus Bewerbung ${p.referenz}]\n${String(b.referenzprojekte).slice(0, 2500)}` : null,
    }).returning('*');
  }

  // Einwilligung (AGB/Datenschutz-Checkbox der öffentlichen Bewerbung)
  await db('consents').insert({
    tenant_id: p.tenant_id, user_id: user.id, zweck: CONSENT_ZWECK,
    text_version: `${CONSENT_VERSION}-public-apply`, expires_at: consentExpiry(),
  });

  if (b.tagessatz && Number(b.tagessatz) > 0) {
    await db('rates').insert({
      tenant_id: p.tenant_id, expert_id: expert.id, kategorie: 'interim',
      satz_von_eur: Number(b.tagessatz), gueltig_ab: new Date().toISOString().slice(0, 10),
    });
  }
  if (b.verfuegbar_ab) {
    await db('availabilities').insert({
      tenant_id: p.tenant_id, expert_id: expert.id, status: 'ab_datum',
      ab_datum: String(b.verfuegbar_ab).slice(0, 10), confirmed_at: db.fn.now(), source: 'self',
      kommentar: `Aus Bewerbung ${p.referenz}`,
    });
  }
  if (req.file) {
    const last = await db('documents').where({ expert_id: expert.id, kategorie: 'cv' }).max('version as v').first();
    const version = (last?.v || 0) + 1;
    const relPath = `experts/${expert.id}/cv-bewerbung-v${version}-${Date.now()}.pdf`;
    await storage.save(relPath, req.file.buffer);
    await db('documents').insert({
      tenant_id: p.tenant_id, expert_id: expert.id, kategorie: 'cv', filename: req.file.originalname,
      version, storage_ref: relPath, mimetype: 'application/pdf', size_bytes: req.file.size,
    });
  }

  const existing = await db('applications').where({ project_id: p.id, expert_id: expert.id }).first();
  if (existing) return res.status(409).json({ error: 'Sie haben sich bereits beworben.' });
  await db('applications').insert({
    tenant_id: p.tenant_id, project_id: p.id, expert_id: expert.id, status: 'beworben',
    nachricht: String(b.nachricht || '').slice(0, 2000) || null,
  });
  await db('audit_log').insert({
    tenant_id: p.tenant_id, action: 'application.public_apply', resource: 'applications',
    new_value_json: JSON.stringify({ projekt: p.referenz, email }), ip: req.ip,
  });
  res.status(201).json({ ok: true, message: 'Bewerbung eingegangen — die Phalanx GmbH meldet sich innerhalb von 48 Stunden.' });
});

/** Hidden-Link: Projekt + kuratierte Profile für den Token laden. */
async function loadShare(token) {
  const link = await db('share_links').where({ token }).whereNull('revoked_at').first();
  if (!link) return null;
  if (link.expires_at && new Date(link.expires_at) < new Date()) return null;
  const project = await db('projects').where({ id: link.project_id }).first();
  const releases = await db('project_releases').where({ project_id: link.project_id });
  const profiles = [];
  for (const r of releases) {
    const e = await db('experts').where({ id: r.expert_id }).first();
    if (!e) continue;
    const skills = await db('expert_skills').join('skills', 'skills.id', 'expert_skills.skill_id')
      .where('expert_id', e.id).select('skills.name', 'skills.kategorie');
    const avail = await db('availabilities').where({ expert_id: e.id }).orderBy('created_at', 'desc').first();
    profiles.push({
      anzeige_name: r.anonymized ? `Experte ${String.fromCharCode(65 + profiles.length)}` : `${e.vorname} ${e.nachname}`,
      rolle: e.berufsbezeichnung,
      hintergrund: e.kurzprofil,
      projekterfahrung: (skills.filter((s) => s.kategorie === 'branche').map((s) => s.name).join(', ') || null)
        ? `Branchenerfahrung: ${skills.filter((s) => s.kategorie === 'branche').map((s) => s.name).join(', ')}`
        : null,
      schwerpunkte: skills.filter((s) => ['kompetenz', 'rolle'].includes(s.kategorie)).map((s) => s.name).slice(0, 10),
      verfuegbarkeit: avail
        ? `${avail.status === 'ausgebucht' ? 'Auf Anfrage' : avail.ab_datum ? `ab ${new Date(avail.ab_datum).toLocaleDateString('de-DE')}` : 'kurzfristig'}${avail.auslastung_prozent ? ` (${avail.auslastung_prozent} %)` : ''}`
        : null,
    });
  }
  return { link, project, profiles };
}

router.get('/share/:token', async (req, res) => {
  const data = await loadShare(String(req.params.token));
  if (!data) return res.status(404).json({ error: 'Link ungültig, abgelaufen oder widerrufen' });
  await db('share_links').where({ id: data.link.id }).increment('zugriffe', 1);
  await db('audit_log').insert({
    tenant_id: data.link.tenant_id, action: 'share.view', resource: 'share_links',
    resource_id: data.link.id, ip: req.ip,
  });
  res.json({
    project: { name: data.project.name, referenz: data.project.referenz, beschreibung: data.project.beschreibung, start: data.project.start, ort: data.project.ort },
    profiles: data.profiles,
    expires_at: data.link.expires_at,
  });
});

router.get('/share/:token/pdf', async (req, res) => {
  const data = await loadShare(String(req.params.token));
  if (!data) return res.status(404).json({ error: 'Link ungültig, abgelaufen oder widerrufen' });
  await db('audit_log').insert({
    tenant_id: data.link.tenant_id, action: 'share.pdf_download', resource: 'share_links',
    resource_id: data.link.id, ip: req.ip,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Phalanx-Shortlist-${data.project.referenz || data.project.id}.pdf"`);
  buildShortlistPdf({
    projektName: data.project.name,
    referenz: data.project.referenz,
    profiles: data.profiles,
    ansprechpartner: 'Dr. Christian Neusser\nPhalanx GmbH\nHelene-Lange-Straße 28 · 91056 Erlangen\n+49 9131 920 60 75 · +49 151 625 00 802\nneusser@phalanx.de · https://phalanx.de',
  }).pipe(res);
});

module.exports = router;
