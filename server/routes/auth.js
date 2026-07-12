const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { db } = require('../db/knex');
const { signSession, signPurposeToken, verifyToken } = require('../utils/tokens');
const { requireAuth } = require('../middleware/auth');
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
  await getMailProvider().send({ to: user.email, ...verificationMail(token) });

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
  res.json({ user: { id: user.id, email: user.email, role: user.role, isApproved: user.is_approved } });
});

/** Passwort vergessen — antwortet immer gleich (kein User-Enumeration-Leak). */
router.post('/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase();
  const user = email ? await db('users').where({ email }).first() : null;
  if (user) {
    const token = signPurposeToken(user.id, 'reset-password', '1h');
    await getMailProvider().send({ to: user.email, ...passwordResetMail(token) });
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
    await db('users').where({ id: user.id }).update({ password_hash: await bcrypt.hash(password, 10) });
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

module.exports = router;
