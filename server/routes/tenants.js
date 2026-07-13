/**
 * Sprint 8 — Mandanten- und Kunden-Verwaltung.
 * Mandanten anlegen: NUR Plattform-Admin (Rolle 'admin', nicht tenant_owner).
 * Vendor-Konten: Admin/Tenant-Owner im eigenen Mandanten.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const strictAdmin = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Nur Plattform-Administratoren' });

const tenantSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/, 'Slug: nur Kleinbuchstaben, Ziffern, Bindestrich'),
  name: z.string().min(2).max(120),
  owner_email: z.string().email(),
  owner_password: z.string().min(10),
});

router.get('/', strictAdmin, async (_req, res) => {
  const tenants = await db('tenants').orderBy('id');
  const out = [];
  for (const t of tenants) {
    const users = await db('users').where({ tenant_id: t.id }).count('* as c').first();
    const experts = await db('experts').where({ tenant_id: t.id }).count('* as c').first();
    out.push({ id: t.id, slug: t.slug, name: t.name, users: Number(users.c), experts: Number(experts.c) });
  }
  res.json({ tenants: out });
});

/** Neuen Mandanten inkl. Tenant-Owner anlegen (Plattform-Admin). */
router.post('/', strictAdmin, async (req, res) => {
  const parsed = tenantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const { slug, name, owner_email, owner_password } = parsed.data;
  if (await db('tenants').where({ slug }).first()) return res.status(409).json({ error: 'Slug bereits vergeben' });
  if (await db('users').where({ email: owner_email.toLowerCase() }).first()) {
    return res.status(409).json({ error: 'E-Mail-Adresse bereits vergeben' });
  }
  const [tenant] = await db('tenants').insert({ slug, name }).returning('*');
  await db('users').insert({
    tenant_id: tenant.id,
    email: owner_email.toLowerCase(),
    password_hash: await bcrypt.hash(owner_password, 10),
    role: 'tenant_owner',
    email_verified_at: db.fn.now(),
    is_approved: true,
  });
  await req.audit({ action: 'tenant.create', resource: 'tenants', resourceId: tenant.id, newValue: { slug, name, owner: owner_email } });
  res.locals.auditLogged = true;
  res.status(201).json({ ok: true, tenant });
});

/** Vendor-Konto im eigenen Mandanten anlegen (Admin/Tenant-Owner). */
router.post('/vendors', requireRole('admin'), async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const password = String(req.body?.password || '');
  const firma = String(req.body?.firma || '').slice(0, 150);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
  if (password.length < 10) return res.status(400).json({ error: 'Passwort: mindestens 10 Zeichen' });
  if (await db('users').where({ email }).first()) return res.status(409).json({ error: 'E-Mail-Adresse bereits vergeben' });
  const [user] = await db('users').insert({
    tenant_id: req.user.tenantId,
    email,
    password_hash: await bcrypt.hash(password, 10),
    role: 'vendor',
    email_verified_at: db.fn.now(),
    is_approved: true,
  }).returning(['id', 'email']);
  await req.audit({ action: 'vendor.create', resource: 'users', resourceId: user.id, newValue: { email, firma } });
  res.locals.auditLogged = true;
  res.status(201).json({ ok: true, vendor: user });
});

router.get('/vendors', requireRole('admin'), async (req, res) => {
  const vendors = await db('users as u')
    .leftJoin('vendor_profiles as vp', 'vp.user_id', 'u.id')
    .where({ 'u.tenant_id': req.user.tenantId, 'u.role': 'vendor' })
    .select('u.id', 'u.email', 'u.is_approved', 'u.created_at', 'vp.firmenname', 'vp.branche');
  res.json({ vendors });
});

/** Kunden-Zugang freigeben (v1.1.0). */
router.post('/vendors/:id(\\d+)/approve', requireRole('admin'), async (req, res) => {
  const vendor = await db('users').where({ id: Number(req.params.id), tenant_id: req.user.tenantId, role: 'vendor' }).first();
  if (!vendor) return res.status(404).json({ error: 'Kunde nicht gefunden' });
  await db('users').where({ id: vendor.id }).update({ is_approved: true });
  await req.audit({ action: 'vendor.approve', resource: 'users', resourceId: vendor.id });
  res.locals.auditLogged = true;
  res.json({ ok: true, message: 'Zugang freigegeben.' });
});

/** Gebühren-Defaults des Mandanten (v1.1.0). */
router.get('/settings', requireRole('admin'), async (req, res) => {
  const tenant = await db('tenants').where({ id: req.user.tenantId }).first();
  const b = typeof tenant.branding_json === 'string' ? JSON.parse(tenant.branding_json || '{}') : (tenant.branding_json || {});
  res.json({ gebuehr_modell_default: b.gebuehr_modell_default || 'gu_anteil', gebuehr_prozent_default: b.gebuehr_prozent_default ?? 15 });
});

router.put('/settings', requireRole('admin'), async (req, res) => {
  const modell = String(req.body?.gebuehr_modell_default || 'gu_anteil');
  const prozent = Number(req.body?.gebuehr_prozent_default);
  if (!['gu_anteil', 'erfolg'].includes(modell) || !(prozent >= 0 && prozent <= 50)) {
    return res.status(400).json({ error: 'Ungültige Gebühren-Einstellung' });
  }
  const tenant = await db('tenants').where({ id: req.user.tenantId }).first();
  const b = typeof tenant.branding_json === 'string' ? JSON.parse(tenant.branding_json || '{}') : (tenant.branding_json || {});
  b.gebuehr_modell_default = modell;
  b.gebuehr_prozent_default = prozent;
  await db('tenants').where({ id: tenant.id }).update({ branding_json: JSON.stringify(b) });
  await req.audit({ action: 'settings.gebuehren', resource: 'tenants', resourceId: tenant.id, newValue: { modell, prozent } });
  res.locals.auditLogged = true;
  res.json({ ok: true });
});

module.exports = router;
