/**
 * v1.16.0 — Provider-Hub I: Dienstleister-Provider (Vermittler, Beratungen,
 * Personaldienstleister) registrieren sich oeffentlich, werden vom Admin
 * freigegeben und pflegen ihr Profil selbst (Fokus, Tagessatz-Range,
 * Hauptprojekte). Der Profil-Digest an Provider folgt in v1.17.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const { signPurposeToken } = require('../utils/tokens');
const { getMailProvider } = require('../providers/mail');
const { verificationMail } = require('../providers/mail/templates');

const router = express.Router();

/** Oeffentliche Registrierung (Freigabe durch Admin, wie bei Kunden). */
router.post('/registrierung', async (req, res) => {
  const b = req.body || {};
  const email = String(b.email || '').toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
  if (!b.password || String(b.password).length < 10) return res.status(400).json({ error: 'Passwort: mindestens 10 Zeichen' });
  if (b.consent !== true) return res.status(400).json({ error: 'Zustimmung zur Datenverarbeitung erforderlich' });
  if (!b.firmenname || String(b.firmenname).length < 2) return res.status(400).json({ error: 'Firmenname erforderlich' });

  const tenant = await db('tenants').where({ slug: 'phalanx' }).first();
  if (await db('users').where({ email }).first()) return res.status(409).json({ error: 'E-Mail-Adresse bereits registriert' });

  const [user] = await db('users').insert({
    tenant_id: tenant.id, email, role: 'provider', is_approved: false,
    password_hash: await bcrypt.hash(String(b.password), 10),
  }).returning('*');

  const fokus = Array.isArray(b.fokus) ? b.fokus.map((f) => String(f).slice(0, 60)).slice(0, 15) : [];
  await db('provider_profiles').insert({
    tenant_id: tenant.id, user_id: user.id,
    firmenname: String(b.firmenname).slice(0, 150),
    ansprechpartner: b.ansprechpartner ? String(b.ansprechpartner).slice(0, 150) : null,
    telefon: b.telefon ? String(b.telefon).slice(0, 40) : null,
    webseite: b.webseite ? String(b.webseite).slice(0, 200) : null,
    fokus_json: JSON.stringify(fokus),
    tagessatz_von: b.tagessatz_von ? Number(b.tagessatz_von) : null,
    tagessatz_bis: b.tagessatz_bis ? Number(b.tagessatz_bis) : null,
    hauptprojekte: b.hauptprojekte ? String(b.hauptprojekte).slice(0, 3000) : null,
  });

  await db('audit_log').insert({
    tenant_id: tenant.id, actor_id: user.id, action: 'provider.register',
    resource: 'users', resource_id: user.id,
    new_value_json: JSON.stringify({ email, firmenname: b.firmenname }), ip: req.ip,
  });

  try {
    const token = signPurposeToken(user.id, 'verify-email', '7d');
    await getMailProvider().send({ to: email, ...verificationMail(token) }, { tenantId: tenant.id, templateKey: 'provider_verifizierung' });
  } catch (e) { console.error('Provider-Verifizierung:', e.message); }

  res.status(201).json({ ok: true, message: 'Registrierung eingegangen. Bitte E-Mail bestätigen, die Phalanx GmbH schaltet den Zugang anschließend frei.' });
});

/** Eigenes Profil (Rolle provider). */
router.get('/me', requireAuth, requireRole('provider'), async (req, res) => {
  const profil = await db('provider_profiles').where({ user_id: req.user.id }).first();
  if (!profil) return res.status(404).json({ error: 'Kein Provider-Profil vorhanden' });
  res.json({ profil, freigegeben: Boolean(req.user.isApproved ?? true) });
});

router.put('/me', requireAuth, requireRole('provider'), async (req, res) => {
  const profil = await db('provider_profiles').where({ user_id: req.user.id }).first();
  if (!profil) return res.status(404).json({ error: 'Kein Provider-Profil vorhanden' });
  const b = req.body || {};
  const updates = {};
  if (b.firmenname) updates.firmenname = String(b.firmenname).slice(0, 150);
  if (b.ansprechpartner !== undefined) updates.ansprechpartner = String(b.ansprechpartner || '').slice(0, 150) || null;
  if (b.telefon !== undefined) updates.telefon = String(b.telefon || '').slice(0, 40) || null;
  if (b.webseite !== undefined) updates.webseite = String(b.webseite || '').slice(0, 200) || null;
  if (Array.isArray(b.fokus)) updates.fokus_json = JSON.stringify(b.fokus.map((f) => String(f).slice(0, 60)).slice(0, 15));
  if (b.tagessatz_von !== undefined) updates.tagessatz_von = b.tagessatz_von ? Number(b.tagessatz_von) : null;
  if (b.tagessatz_bis !== undefined) updates.tagessatz_bis = b.tagessatz_bis ? Number(b.tagessatz_bis) : null;
  if (b.hauptprojekte !== undefined) updates.hauptprojekte = String(b.hauptprojekte || '').slice(0, 3000) || null;
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nichts zu ändern' });
  await db('provider_profiles').where({ id: profil.id }).update(updates);
  await req.audit({ action: 'provider.profil_update', resource: 'provider_profiles', resourceId: profil.id, newValue: Object.keys(updates) });
  res.locals.auditLogged = true;
  res.json({ ok: true });
});

/** Admin: Liste + Freigabe. */
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const rows = await db('provider_profiles as p')
    .join('users as u', 'u.id', 'p.user_id')
    .where('p.tenant_id', req.user.tenantId)
    .select('p.*', 'u.email', 'u.is_approved', 'u.email_verified_at')
    .orderBy('p.created_at', 'desc');
  res.json({ provider: rows });
});

router.post('/:userId(\\d+)/freigabe', requireAuth, requireRole('admin'), async (req, res) => {
  const user = await db('users').where({ id: Number(req.params.userId), role: 'provider', tenant_id: req.user.tenantId }).first();
  if (!user) return res.status(404).json({ error: 'Provider nicht gefunden' });
  const freigeben = req.body?.freigeben !== false;
  await db('users').where({ id: user.id }).update({ is_approved: freigeben });
  await req.audit({ action: freigeben ? 'provider.freigegeben' : 'provider.gesperrt', resource: 'users', resourceId: user.id });
  res.locals.auditLogged = true;
  res.json({ ok: true });
});

/** v1.17.0 — Anonymisierte Profilkarten (nur freigegebene Provider, nur Opt-in-Experten). */
router.get('/profile-karten', requireAuth, requireRole('provider'), async (req, res) => {
  const ich = await db('users').where({ id: req.user.id }).first();
  if (!ich?.is_approved) return res.status(403).json({ error: 'Zugang noch nicht freigegeben' });
  const experten = await db('experts').where({ status: 'freigegeben', provider_optin: true });
  const meine = await db('provider_interest').where({ provider_user_id: req.user.id }).pluck('expert_id');
  const karten = [];
  for (const e of experten) {
    const skills = await db('expert_skills').join('skills', 'skills.id', 'expert_skills.skill_id')
      .where('expert_id', e.id).where('skills.is_approved', true).pluck('skills.name');
    const avail = await db('availabilities').where({ expert_id: e.id }).orderBy('created_at', 'desc').first();
    karten.push({
      expert_id: e.id,
      kennung: `Profil #${e.id}`,
      rolle: e.berufsbezeichnung || 'Interim Manager',
      skills: skills.slice(0, 6),
      verfuegbar: avail ? (avail.status === 'ausgebucht' ? 'auf Anfrage' : avail.ab_datum ? `ab ${new Date(avail.ab_datum).toLocaleDateString('de-DE')}` : 'kurzfristig') : 'auf Anfrage',
      interesse_gemeldet: meine.includes(e.id),
    });
  }
  res.json({ karten });
});

/** Interesse melden: landet als Anfrage bei Phalanx, Klarnamen erst nach Freigabe. */
router.post('/interesse', requireAuth, requireRole('provider'), async (req, res) => {
  const ich = await db('users').where({ id: req.user.id }).first();
  if (!ich?.is_approved) return res.status(403).json({ error: 'Zugang noch nicht freigegeben' });
  const expert = await db('experts').where({ id: Number(req.body?.expert_id), status: 'freigegeben', provider_optin: true }).first();
  if (!expert) return res.status(404).json({ error: 'Profil nicht gefunden' });
  const inserted = await db('provider_interest')
    .insert({ tenant_id: expert.tenant_id, provider_user_id: req.user.id, expert_id: expert.id })
    .onConflict(['provider_user_id', 'expert_id']).ignore().returning('id');
  if (!inserted.length) return res.status(409).json({ error: 'Interesse bereits gemeldet' });
  const profil = await db('provider_profiles').where({ user_id: req.user.id }).first();
  try {
    const admin = await db('users').where({ tenant_id: expert.tenant_id, role: 'admin' }).orderBy('id').first();
    if (admin) {
      await getMailProvider().send({
        to: admin.email,
        subject: `Provider-Interesse: ${profil?.firmenname || req.user.email} an Profil #${expert.id}`,
        html: `<p>${profil?.firmenname || req.user.email} interessiert sich fuer Profil #${expert.id} (${expert.vorname} ${expert.nachname}, ${expert.berufsbezeichnung || ''}).</p><p>Kontakt: ${req.user.email}</p>`,
        text: `Provider-Interesse an Profil #${expert.id} von ${req.user.email}`,
      }, { tenantId: expert.tenant_id, templateKey: 'provider_interesse_intern' });
    }
  } catch (e) { console.error('Interesse-Mail:', e.message); }
  await req.audit({ action: 'provider.interesse', resource: 'experts', resourceId: expert.id, newValue: { provider: req.user.id } });
  res.locals.auditLogged = true;
  res.status(201).json({ ok: true, message: 'Danke, wir melden uns persoenlich mit den Details.' });
});

module.exports = router;
