const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { db } = require('../db/knex');
const { signSession, signPurposeToken, verifyToken } = require('../utils/tokens');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getMailProvider } = require('../providers/mail');
const { verificationMail, passwordResetMail } = require('../providers/mail/templates');
const { CONSENT_VERSION, CONSENT_ZWECK, CONSENT_TEXT, consentExpiry } = require('../consent');

const router = express.Router();
const DEFAULT_TENANT_SLUG = 'phalanx';

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const registerSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(10, 'Passwort: mindestens 10 Zeichen'),
  consent: z.literal(true, { errorMap: () => ({ message: 'Einwilligung erforderlich' }) }),
});

/** Einwilligungstext für das Registrierungsformular. */
router.get('/consent-text', (_req, res) => {
  res.json({ version: CONSENT_VERSION, zweck: CONSENT_ZWECK, text: CONSENT_TEXT });
});

/** Registrierung (Rolle expert) + Consent-Record + Verifizierungs-Mail. */
router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  const { email, password } = parsed.data;

  const tenant = await db('tenants').where({ slug: DEFAULT_TENANT_SLUG }).first();
  if (!tenant) return res.status(500).json({ error: 'Tenant fehlt (Seed ausführen)' });

  const existing = await db('users').where({ email: email.toLowerCase() }).first();
  if (existing) return res.status(409).json({ error: 'E-Mail-Adresse bereits registriert' });

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db('users')
    .insert({
      tenant_id: tenant.id,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      role: 'expert',
      is_approved: false,
    })
    .returning(['id', 'email', 'tenant_id']);

  await db('consents').insert({
    tenant_id: tenant.id,
    user_id: user.id,
    zweck: CONSENT_ZWECK,
    text_version: CONSENT_VERSION,
    expires_at: consentExpiry(),
  });

  await db('audit_log').insert({
    tenant_id: tenant.id,
    actor_id: user.id,
    action: 'user.register',
    resource: 'users',
    resource_id: user.id,
    new_value_json: JSON.stringify({ email: user.email, role: 'expert', consent: CONSENT_VERSION }),
    ip: req.ip,
  });

  const token = signPurposeToken(user.id, 'verify-email', '7d');
  try {
    await getMailProvider().send({ to: user.email, ...verificationMail(token) });
  } catch (e) {
    console.error('Mail-Versand fehlgeschlagen (Verifizierung):', e.message);
    return res.status(201).json({
      ok: true,
      message: 'Registrierung erfolgreich, aber die Bestätigungs-E-Mail konnte nicht versendet werden. Bitte kontaktieren Sie die Phalanx GmbH.',
    });
  }

  res.status(201).json({ ok: true, message: 'Registrierung erfolgreich. Bitte E-Mail bestätigen.' });
});

/** E-Mail-Verifizierung per Token-Link. */
router.post('/verify', async (req, res) => {
  try {
    const payload = verifyToken(req.body.token, 'verify-email');
    const user = await db('users').where({ id: payload.sub }).first();
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    if (!user.email_verified_at) {
      await db('users').where({ id: user.id }).update({ email_verified_at: db.fn.now() });
      await db('audit_log').insert({
        tenant_id: user.tenant_id,
        actor_id: user.id,
        action: 'user.verify_email',
        resource: 'users',
        resource_id: user.id,
        ip: req.ip,
      });
    }
    res.json({ ok: true, message: 'E-Mail-Adresse bestätigt.' });
  } catch {
    res.status(400).json({ error: 'Link ungültig oder abgelaufen' });
  }
});

/** Login → JWT im httpOnly-Cookie. */
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });

  const user = await db('users').where({ email: String(email).toLowerCase() }).first();
  const valid = user && (await bcrypt.compare(password, user.password_hash));
  if (!valid) return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
  if (!user.email_verified_at) {
    return res.status(403).json({ error: 'Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.' });
  }

  await db('audit_log').insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: 'auth.login',
    resource: 'users',
    resource_id: user.id,
    ip: req.ip,
  });

  res.cookie('session', signSession(user), cookieOpts);
  res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role, isApproved: user.is_approved } });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('session', { ...cookieOpts, maxAge: 0 });
  res.json({ ok: true });
});

/** Aktueller Benutzer (für Client-Bootstrapping). */
router.get('/me', requireAuth, async (req, res) => {
  const user = await db('users').where({ id: req.user.id }).first();
  if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      isApproved: user.is_approved,
      impersonated: Boolean(req.user.impersonatedBy),
    },
  });
});

/** Konto ändern (alle Rollen): E-Mail-Adresse — auditiert mit Alt/Neu. */
router.put('/account', requireAuth, async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
  const user = await db('users').where({ id: req.user.id }).first();
  if (email === user.email) return res.json({ ok: true, message: 'Keine Änderung.' });
  const taken = await db('users').where({ email }).first();
  if (taken) return res.status(409).json({ error: 'E-Mail-Adresse bereits vergeben' });
  await db('users').where({ id: user.id }).update({ email });
  await db('experts').where({ user_id: user.id }).update({ email }); // Expertenprofil synchron halten
  await db('audit_log').insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: 'account.email_change',
    resource: 'users',
    resource_id: user.id,
    old_value_json: JSON.stringify({ email: user.email }),
    new_value_json: JSON.stringify({ email }),
    ip: req.ip,
  });
  res.json({ ok: true, message: 'E-Mail-Adresse geändert.' });
});

/** Passwort ändern (alle Rollen) — aktuelles Passwort erforderlich. */
router.post('/change-password', requireAuth, async (req, res) => {
  const { current, next } = req.body || {};
  if (!next || String(next).length < 10) return res.status(400).json({ error: 'Neues Passwort: mindestens 10 Zeichen' });
  const user = await db('users').where({ id: req.user.id }).first();
  if (!user || !(await bcrypt.compare(String(current || ''), user.password_hash))) {
    return res.status(401).json({ error: 'Aktuelles Passwort ist falsch' });
  }
  const newTv = (user.token_version || 0) + 1;
  await db('users').where({ id: user.id }).update({
    password_hash: await bcrypt.hash(String(next), 10),
    token_version: newTv, // alle anderen Sessions invalidieren …
  });
  // … die eigene Sitzung bleibt aktiv (frisches Cookie mit neuer Version)
  res.cookie('session', signSession({ ...user, token_version: newTv }), cookieOpts);
  await db('audit_log').insert({
    tenant_id: user.tenant_id,
    actor_id: user.id,
    action: 'account.password_change',
    resource: 'users',
    resource_id: user.id,
    ip: req.ip,
  });
  res.json({ ok: true, message: 'Passwort geändert.' });
});

/** Eigene Änderungshistorie (alle Rollen). */
router.get('/my-audit', requireAuth, async (req, res) => {
  const rows = await db('audit_log')
    .where({ actor_id: req.user.id })
    .orderBy('ts', 'desc')
    .limit(100);
  res.json({ rows: rows.map((r) => ({ ...r, actor_email: null })) });
});

/**
 * Birdview (Admin): in die Sicht eines Experten schalten.
 * Setzt eine Experten-Session mit Rücksprungmarke (impersonatedBy) — auditiert.
 */
router.post('/impersonate/:userId(\\d+)', requireAuth, requireRole('admin'), async (req, res) => {
  const target = await db('users')
    .where({ id: Number(req.params.userId), tenant_id: req.user.tenantId, role: 'expert' })
    .first();
  if (!target) return res.status(404).json({ error: 'Experten-Konto nicht gefunden' });
  await db('audit_log').insert({
    tenant_id: req.user.tenantId,
    actor_id: req.user.id,
    action: 'auth.birdview_start',
    resource: 'users',
    resource_id: target.id,
    ip: req.ip,
  });
  res.cookie('session', signSession(target, { impersonatedBy: req.user.id }), cookieOpts);
  res.json({ ok: true });
});

/** Birdview beenden — zurück zur Admin-Session. */
router.post('/stop-impersonate', requireAuth, async (req, res) => {
  if (!req.user.impersonatedBy) return res.status(400).json({ error: 'Kein Birdview aktiv' });
  const admin = await db('users').where({ id: req.user.impersonatedBy, role: 'admin' }).first();
  if (!admin) return res.status(400).json({ error: 'Admin-Konto nicht gefunden' });
  await db('audit_log').insert({
    tenant_id: admin.tenant_id,
    actor_id: admin.id,
    action: 'auth.birdview_stop',
    resource: 'users',
    resource_id: req.user.id,
    ip: req.ip,
  });
  res.cookie('session', signSession(admin), cookieOpts);
  res.json({ ok: true });
});

/** Passwort vergessen — antwortet immer gleich (kein User-Enumeration-Leak). */
router.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase();
  const user = email ? await db('users').where({ email }).first() : null;
  if (user) {
    try {
      const token = signPurposeToken(user.id, 'reset-password', '1h');
      await getMailProvider().send({ to: user.email, ...passwordResetMail(token) });
    } catch (e) {
      console.error('Mail-Versand fehlgeschlagen (Passwort-Reset):', e.message);
    }
  }
  res.json({ ok: true, message: 'Falls die Adresse existiert, wurde eine E-Mail versendet.' });
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body || {};
  if (!password || String(password).length < 10) {
    return res.status(400).json({ error: 'Passwort: mindestens 10 Zeichen' });
  }
  try {
    const payload = verifyToken(token, 'reset-password');
    const user = await db('users').where({ id: payload.sub }).first();
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    await db('users').where({ id: user.id }).update({
      password_hash: await bcrypt.hash(password, 10),
      token_version: (user.token_version || 0) + 1, // alle Sessions invalidieren
    });
    await db('audit_log').insert({
      tenant_id: user.tenant_id,
      actor_id: user.id,
      action: 'auth.reset_password',
      resource: 'users',
      resource_id: user.id,
      ip: req.ip,
    });
    res.json({ ok: true, message: 'Passwort geändert. Bitte neu anmelden.' });
  } catch {
    res.status(400).json({ error: 'Link ungültig oder abgelaufen' });
  }
});

/**
 * Einladung annehmen (öffentlich, Token aus der Invite-Mail):
 * Einwilligung erteilen + Passwort vergeben → Konto aktiv, E-Mail verifiziert.
 */
router.post('/accept-invite', async (req, res) => {
  const { token, password, consent } = req.body || {};
  if (consent !== true) return res.status(400).json({ error: 'Einwilligung erforderlich' });
  if (!password || String(password).length < 10) {
    return res.status(400).json({ error: 'Passwort: mindestens 10 Zeichen' });
  }
  try {
    const payload = verifyToken(token, 'expert-invite');
    const user = await db('users').where({ id: payload.sub }).first();
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    await db('users').where({ id: user.id }).update({
      password_hash: await bcrypt.hash(password, 10),
      email_verified_at: db.fn.now(),
      is_approved: true,
    });
    await db('consents').insert({
      tenant_id: user.tenant_id,
      user_id: user.id,
      zweck: CONSENT_ZWECK,
      text_version: CONSENT_VERSION,
      expires_at: consentExpiry(),
    });
    await db('experts').where({ user_id: user.id, status: 'registriert' }).update({ status: 'freigegeben' });
    await db('audit_log').insert({
      tenant_id: user.tenant_id,
      actor_id: user.id,
      action: 'user.accept_invite',
      resource: 'users',
      resource_id: user.id,
      new_value_json: JSON.stringify({ consent: CONSENT_VERSION }),
      ip: req.ip,
    });
    res.json({ ok: true, message: 'Zugang aktiviert. Sie können sich jetzt anmelden.' });
  } catch {
    res.status(400).json({ error: 'Link ungültig oder abgelaufen' });
  }
});

/** Einwilligung widerrufen (angemeldeter Experte) — DSGVO-Self-Service. */
router.post('/revoke-consent', requireAuth, async (req, res) => {
  await db('consents').where({ user_id: req.user.id }).whereNull('revoked_at').update({ revoked_at: db.fn.now() });
  await db('experts').where({ user_id: req.user.id }).update({ status: 'inaktiv' });
  await db('users').where({ id: req.user.id }).increment('token_version', 1); // Sessions beenden
  await db('audit_log').insert({
    tenant_id: req.user.tenantId,
    actor_id: req.user.id,
    action: 'consent.revoked',
    resource: 'consents',
    ip: req.ip,
  });
  res.json({
    ok: true,
    message: 'Einwilligung widerrufen. Ihr Profil ist gesperrt; die Phalanx GmbH wird Ihre Daten löschen bzw. anonymisieren.',
  });
});

/** Einwilligung erneuern (öffentlich, Token aus der Reconsent-Mail). */
router.post('/renew-consent', async (req, res) => {
  try {
    const payload = verifyToken(req.body.token, 'renew-consent');
    const user = await db('users').where({ id: payload.sub }).first();
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    await db('consents').insert({
      tenant_id: user.tenant_id,
      user_id: user.id,
      zweck: CONSENT_ZWECK,
      text_version: CONSENT_VERSION,
      expires_at: consentExpiry(),
    });
    await db('experts').where({ user_id: user.id, status: 'inaktiv' }).update({ status: 'freigegeben' });
    await db('audit_log').insert({
      tenant_id: user.tenant_id,
      actor_id: user.id,
      action: 'consent.renewed',
      resource: 'consents',
      new_value_json: JSON.stringify({ version: CONSENT_VERSION }),
      ip: req.ip,
    });
    res.json({ ok: true, message: 'Einwilligung erneuert — vielen Dank.' });
  } catch {
    res.status(400).json({ error: 'Link ungültig oder abgelaufen' });
  }
});

module.exports = router;
