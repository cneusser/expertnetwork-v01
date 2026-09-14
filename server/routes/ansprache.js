/**
 * v1.26.0 — Ansprache-Cockpit.
 *
 * Arbeitsfläche für die persönliche Ansprache über LinkedIn. Drei Bereiche:
 *   /arbeitsliste  wer heute dran ist, sortiert nach Priorität und Alter
 *   /reaktion      was zurückkam, ein Klick je Person
 *   /trichter      wie viele von der Liste tatsächlich ankommen
 *
 * Es geht von hier aus nie eine Mail raus. Das ist der Sinn der Sache.
 */
const express = require('express');
const { z } = require('zod');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const { VORREG, merkeAusschluss } = require('../utils/vorregistrierung');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const REAKTIONEN = ['offen', 'interesse', 'spaeter', 'absage', 'keine'];
const HEUTE = () => new Date().toISOString().slice(0, 10);
const VOR_TAGEN = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/** Felder, die das Cockpit braucht. Bewusst schmal, die Liste wird lang. */
const FELDER = [
  'id', 'vorname', 'nachname', 'firma', 'berufsbezeichnung', 'linkedin', 'email', 'status',
  'vorreg_prio', 'vorreg_kanal', 'vorreg_quelle', 'vorreg_letzter_kontakt',
  'vorreg_angeschrieben_am', 'vorreg_reaktion', 'vorreg_reaktion_am', 'vorreg_wiedervorlage',
  'vorreg_notiz', 'vorreg_importiert_am', 'vorreg_zusammengefuehrt_am',
  'vorreg_ausgeschlossen_am', 'vorreg_ausschluss_grund',
];

/**
 * Arbeitsliste. Vier Körbe, die sich gegenseitig ausschließen:
 *   faellig      noch nie angeschrieben, nach Priorität und letztem Kontakt
 *   wiedervorlage  angeschrieben, keine Reaktion, Frist abgelaufen
 *   wartet       angeschrieben, Frist läuft noch
 *   erledigt     Reaktion da oder registriert
 */
router.get('/arbeitsliste', async (req, res) => {
  const tage = Math.min(Math.max(Number(req.query.wiedervorlage_tage) || 10, 1), 90);
  const pensum = Math.min(Math.max(Number(req.query.pensum) || 20, 1), 200);
  const prio = String(req.query.prio || '').toUpperCase();
  const kanal = String(req.query.kanal || '').toLowerCase();

  const basis = () => {
    const q = db('experts').where({ tenant_id: req.user.tenantId })
      .whereIn('status', [VORREG, 'eingeladen'])
      .whereNull('vorreg_zusammengefuehrt_am')
      .whereNull('vorreg_ausgeschlossen_am'); // v1.26.1: wer raus ist, ist raus
    if (['A', 'B', 'C'].includes(prio)) q.andWhere('vorreg_prio', prio);
    if (['linkedin', 'email'].includes(kanal)) q.andWhere('vorreg_kanal', kanal);
    return q;
  };

  const faellig = await basis().whereNull('vorreg_angeschrieben_am')
    .orderByRaw("coalesce(vorreg_prio, 'Z') asc, vorreg_letzter_kontakt desc nulls last")
    .limit(pensum).select(FELDER);

  const wiedervorlage = await basis().whereNotNull('vorreg_angeschrieben_am')
    .where('vorreg_reaktion', 'offen')
    .where(function fenster() {
      this.where('vorreg_wiedervorlage', '<=', HEUTE())
        .orWhere(function ohneDatum() {
          this.whereNull('vorreg_wiedervorlage').andWhere('vorreg_angeschrieben_am', '<=', VOR_TAGEN(tage));
        });
    })
    .orderByRaw("coalesce(vorreg_prio, 'Z') asc, vorreg_angeschrieben_am asc")
    .limit(pensum).select(FELDER);

  const zaehle = async (q) => Number((await q.count('* as c').first()).c);
  const zahlen = {
    faellig_gesamt: await zaehle(basis().whereNull('vorreg_angeschrieben_am')),
    angeschrieben_gesamt: await zaehle(basis().whereNotNull('vorreg_angeschrieben_am')),
    wartet: await zaehle(basis().whereNotNull('vorreg_angeschrieben_am').where('vorreg_reaktion', 'offen')
      .where(function fenster() {
        this.where('vorreg_wiedervorlage', '>', HEUTE())
          .orWhere(function ohneDatum() {
            this.whereNull('vorreg_wiedervorlage').andWhere('vorreg_angeschrieben_am', '>', VOR_TAGEN(tage));
          });
      })),
    heute_angeschrieben: await zaehle(basis().where('vorreg_angeschrieben_am', HEUTE())),
  };

  res.json({ faellig, wiedervorlage, zahlen, einstellung: { pensum, wiedervorlage_tage: tage } });
});

const reaktionSchema = z.object({
  angeschrieben: z.boolean().optional(),
  angeschrieben_am: z.string().nullable().optional(),
  reaktion: z.enum(REAKTIONEN).optional(),
  wiedervorlage: z.string().nullable().optional(),
  notiz: z.string().max(500).nullable().optional(),
});

/**
 * Einen Kontakt fortschreiben. Alles optional, damit die Oberfläche mit einem
 * Klick "angeschrieben" setzen und mit dem nächsten die Reaktion nachtragen kann.
 */
router.post('/:id(\\d+)/schritt', async (req, res) => {
  const parsed = reaktionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const person = await db('experts').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!person) return res.status(404).json({ error: 'Kontakt nicht gefunden' });

  const { datumOderNull } = require('../utils/vorregistrierung');
  const d = parsed.data;
  const patch = {};

  if (d.angeschrieben === true) patch.vorreg_angeschrieben_am = HEUTE();
  if (d.angeschrieben === false) patch.vorreg_angeschrieben_am = null;
  if (d.angeschrieben_am !== undefined) patch.vorreg_angeschrieben_am = datumOderNull(d.angeschrieben_am);
  if (d.reaktion !== undefined) {
    patch.vorreg_reaktion = d.reaktion;
    patch.vorreg_reaktion_am = d.reaktion === 'offen' ? null : new Date();
    // Eine Reaktion beendet die Wiedervorlage, außer der Kontakt vertröstet uns.
    if (d.reaktion !== 'offen' && d.reaktion !== 'spaeter') patch.vorreg_wiedervorlage = null;
  }
  if (d.wiedervorlage !== undefined) patch.vorreg_wiedervorlage = datumOderNull(d.wiedervorlage);
  if (d.notiz !== undefined) patch.vorreg_notiz = d.notiz ? String(d.notiz).slice(0, 500) : null;
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nichts zu ändern' });

  await db('experts').where({ id: person.id }).update(patch);
  await req.audit({ action: 'expert.ansprache_schritt', resource: 'experts', resourceId: person.id, newValue: patch });
  res.locals.auditLogged = true;
  res.json({ ok: true, message: 'Notiert.' });
});

/** Mehrere auf einmal als angeschrieben markieren, für den Feierabend-Nachtrag. */
router.post('/angeschrieben', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean).slice(0, 500) : [];
  if (!ids.length) return res.status(400).json({ error: 'Keine Kontakte ausgewählt' });
  const { datumOderNull } = require('../utils/vorregistrierung');
  const datum = datumOderNull(req.body?.datum) || HEUTE();
  const anzahl = await db('experts').where({ tenant_id: req.user.tenantId }).whereIn('id', ids)
    .update({ vorreg_angeschrieben_am: datum });
  await req.audit({
    action: 'expert.ansprache_schritt', resource: 'experts',
    newValue: { angeschrieben_am: datum, anzahl, ids: ids.slice(0, 50) },
  });
  res.locals.auditLogged = true;
  res.json({ ok: true, anzahl, message: `${anzahl} Kontakt(e) als angeschrieben am ${datum} notiert.` });
});

/**
 * v1.26.1 — Kontakt aus der Ansprache nehmen.
 *
 * Für Menschen, die im Netzwerk wertvoll sind, aber nie auf ein Mandat gehen
 * werden. Der Datensatz bleibt zunächst stehen, verschwindet aber aus jeder
 * Arbeitsliste. Gleichzeitig wandert ein schlanker Eintrag auf die Merkliste,
 * damit die Person beim nächsten Import nicht wieder auftaucht. Löschen kannst
 * Du sie danach jederzeit in der Expertenliste, die Merkliste bleibt.
 */
router.post('/:id(\\d+)/rausnehmen', async (req, res) => {
  const person = await db('experts').where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!person) return res.status(404).json({ error: 'Kontakt nicht gefunden' });
  if (person.user_id && ['registriert', 'freigegeben'].includes(person.status)) {
    return res.status(409).json({
      error: 'Diese Person hat ein aktives Konto. Hier geht es nur um die Ansprache. '
        + 'Für aktive Profile nutze die Ausschlussliste in der Expertenakte oder lösche das Profil.',
    });
  }
  const grund = String(req.body?.grund || '').slice(0, 300) || null;

  await db('experts').where({ id: person.id })
    .update({ vorreg_ausgeschlossen_am: new Date(), vorreg_ausschluss_grund: grund });
  const eintrag = await merkeAusschluss(req.user.tenantId, person, { grund, actorId: req.user.id });

  await req.audit({
    action: 'expert.ansprache_ausschluss', resource: 'experts', resourceId: person.id,
    newValue: { grund, merkliste_id: eintrag.id },
  });
  res.locals.auditLogged = true;
  res.json({
    ok: true,
    message: `${person.vorname} ${person.nachname} ist aus der Ansprache raus und steht auf der Merkliste.`,
  });
});

/** Merkliste ansehen. */
router.get('/ausschluss', async (req, res) => {
  const eintraege = await db('ansprache_ausschluss').where({ tenant_id: req.user.tenantId })
    .orderBy('created_at', 'desc').select('*');
  const profile = await db('experts').where({ tenant_id: req.user.tenantId })
    .whereNotNull('vorreg_ausgeschlossen_am')
    .select('id', 'vorname', 'nachname', 'firma', 'berufsbezeichnung', 'status',
      'vorreg_ausgeschlossen_am', 'vorreg_ausschluss_grund');
  res.json({ eintraege, profile });
});

/** Ausschluss zurücknehmen: Merklisteneintrag weg, Datensatz wieder in der Liste. */
router.delete('/ausschluss/:id(\\d+)', async (req, res) => {
  const eintrag = await db('ansprache_ausschluss')
    .where({ id: Number(req.params.id), tenant_id: req.user.tenantId }).first();
  if (!eintrag) return res.status(404).json({ error: 'Eintrag nicht gefunden' });

  await db('ansprache_ausschluss').where({ id: eintrag.id }).delete();
  const zurueck = await db('experts').where({ tenant_id: req.user.tenantId })
    .whereNotNull('vorreg_ausgeschlossen_am')
    .where(function passt() {
      if (eintrag.name_key) this.orWhere('name_key', eintrag.name_key);
      if (eintrag.linkedin) this.orWhereRaw('lower(trim(linkedin)) = ?', [eintrag.linkedin]);
      if (eintrag.email) this.orWhereRaw('lower(trim(email)) = ?', [eintrag.email]);
    })
    .update({ vorreg_ausgeschlossen_am: null, vorreg_ausschluss_grund: null });

  await req.audit({
    action: 'expert.ansprache_ausschluss_zurueck', resource: 'ansprache_ausschluss', resourceId: eintrag.id,
    oldValue: { anzeige_name: eintrag.anzeige_name, grund: eintrag.grund },
  });
  res.locals.auditLogged = true;
  res.json({ ok: true, message: `${eintrag.anzeige_name} ist wieder in der Ansprache${zurueck ? '' : ' (kein Profil mehr vorhanden)'}.` });
});

/**
 * Trichter. Zeigt, wie viele von der vorbereiteten Liste tatsächlich ankommen,
 * aufgeschlüsselt nach Priorität und Kanal. Grundmenge sind alle Datensätze aus
 * einer Vorregistrierung, auch die inzwischen registrierten.
 */
router.get('/trichter', async (req, res) => {
  const roh = await db('experts').where({ tenant_id: req.user.tenantId })
    .whereNotNull('vorreg_importiert_am')
    .select('status', 'vorreg_prio', 'vorreg_kanal', 'vorreg_quelle', 'vorreg_angeschrieben_am',
      'vorreg_reaktion', 'vorreg_zusammengefuehrt_am', 'vorreg_ausgeschlossen_am', 'id');
  // Wer aus der Ansprache genommen wurde, verzerrt die Quoten nicht mehr.
  const ausgeschlossen = roh.filter((e) => e.vorreg_ausgeschlossen_am).length;
  const alle = roh.filter((e) => !e.vorreg_ausgeschlossen_am);

  const aktive = new Set(['registriert', 'freigegeben']);
  const stufen = (menge) => {
    const angeschrieben = menge.filter((e) => e.vorreg_angeschrieben_am);
    const reagiert = menge.filter((e) => e.vorreg_reaktion && !['offen', 'keine'].includes(e.vorreg_reaktion));
    const registriert = menge.filter((e) => aktive.has(e.status));
    return {
      vorbereitet: menge.length,
      angeschrieben: angeschrieben.length,
      reagiert: reagiert.length,
      registriert: registriert.length,
      freigegeben: menge.filter((e) => e.status === 'freigegeben').length,
      quote_reaktion: angeschrieben.length ? Math.round((reagiert.length / angeschrieben.length) * 1000) / 10 : 0,
      quote_registrierung: angeschrieben.length ? Math.round((registriert.length / angeschrieben.length) * 1000) / 10 : 0,
    };
  };

  const gruppiere = (feld, ersatz) => {
    const m = new Map();
    for (const e of alle) {
      const k = e[feld] || ersatz;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(e);
    }
    return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([k, v]) => ({ schluessel: k, ...stufen(v) }));
  };

  const reaktionen = {};
  for (const r of REAKTIONEN) reaktionen[r] = alle.filter((e) => (e.vorreg_reaktion || 'offen') === r).length;

  res.json({
    gesamt: { ...stufen(alle), ausgeschlossen },
    nach_prio: gruppiere('vorreg_prio', 'ohne Prio'),
    nach_kanal: gruppiere('vorreg_kanal', 'ohne Kanal'),
    nach_quelle: gruppiere('vorreg_quelle', 'ohne Quelle'),
    reaktionen,
  });
});

/** Stand der Ansprache als CSV, passend zur Outreach-Liste. */
router.get('/export.csv', async (req, res) => {
  const rows = await db('experts').where({ tenant_id: req.user.tenantId })
    .whereNotNull('vorreg_importiert_am')
    .orderByRaw("coalesce(vorreg_prio, 'Z') asc, nachname asc")
    .select(FELDER);

  const LABEL = { offen: 'offen', interesse: 'Interesse', spaeter: 'später', absage: 'Absage', keine: 'keine Reaktion' };
  const datum = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '');
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const kopf = ['Vorname', 'Nachname', 'Firma', 'LinkedIn', 'E-Mail', 'Prio', 'Kanal',
    'Angeschrieben am', 'Reaktion', 'Reaktion am', 'Wiedervorlage', 'Status', 'Nicht ansprechen', 'Notiz', 'Experten-ID'];
  const zeilen = rows.map((r) => [r.vorname, r.nachname, r.firma, r.linkedin, r.email,
    r.vorreg_prio, r.vorreg_kanal, datum(r.vorreg_angeschrieben_am), LABEL[r.vorreg_reaktion] || r.vorreg_reaktion,
    datum(r.vorreg_reaktion_am), datum(r.vorreg_wiedervorlage), r.status,
    r.vorreg_ausgeschlossen_am ? (r.vorreg_ausschluss_grund || 'ja') : '', r.vorreg_notiz, r.id]
    .map(q).join(';'));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ansprache-stand-${HEUTE()}.csv"`);
  res.send(`﻿${kopf.join(';')}\n${zeilen.join('\n')}\n`);
});

module.exports = router;
