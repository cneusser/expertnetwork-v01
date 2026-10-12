/**
 * v1.42.0 — Projektanfragen: einlesen, prüfen, übernehmen.
 *
 * Der Ablauf hat bewusst drei Schritte statt einem.
 *
 *   lesen      Text hinein, Entwurf heraus. Verändert nichts.
 *   prüfen     Du siehst, was gelesen wurde, und korrigierst.
 *   übernehmen Erst jetzt entsteht ein Projekt.
 *
 * Ein einziger Knopf, der aus einer Mail ein fertiges Projekt macht und
 * Experten anschreibt, wäre schneller und einmal im Monat peinlich. Die
 * Anfragen sind nie gleich gebaut, und eine schief gelesene Anfrage sieht
 * genauso ordentlich aus wie eine richtig gelesene.
 */
const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const { lies } = require('../utils/anfrageLeser');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

/* ------------------------------ Text holen -------------------------------- */

/**
 * Text aus einer hochgeladenen Datei.
 *
 * PDF über die vorhandene Strecke aus der CV-Extraktion, damit es nicht zwei
 * Wege zum selben Ziel gibt. DOCX ist ein ZIP mit XML darin, das lesen wir
 * ohne weitere Abhängigkeit.
 */
async function textAusDatei(datei) {
  const name = (datei.originalname || '').toLowerCase();

  if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.eml')) {
    return datei.buffer.toString('utf8');
  }
  if (name.endsWith('.pdf')) {
    const pdfParse = require('pdf-parse');
    const d = await pdfParse(datei.buffer);
    return d.text || '';
  }
  if (name.endsWith('.docx')) {
    // Ein DOCX ist ein ZIP mit XML darin. jszip liegt ohnehin im Haus (der
    // DSGVO-Export nutzt es), deshalb keine weitere Abhängigkeit nur fürs
    // Auspacken von zwei Dateien.
    const JSZip = require('jszip');
    const zip = await JSZip.loadAsync(datei.buffer);
    const xml = await zip.file('word/document.xml')?.async('string');
    if (!xml) throw new Error('Die Word-Datei lässt sich nicht lesen.');
    return xml
      // Absatzende und Zeilenumbruch zu echten Umbrüchen, sonst klebt der
      // ganze Text in einer Zeile und die Aufzählungen sind verloren.
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<w:tab[^>]*\/>/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  throw new Error('Nur PDF, Word (.docx) oder Text. Sonst bitte den Text einfügen.');
}

/* -------------------------------- Lesen ----------------------------------- */

/**
 * Eine Anfrage einlesen und als Entwurf ablegen.
 *
 * Der Rohtext wird aufbewahrt. Wenn später jemand fragt, ob da wirklich
 * "WP-Examen" stand, soll die Antwort nachlesbar sein.
 */
router.post('/', upload.single('datei'), async (req, res) => {
  let rohtext = String(req.body?.text || '');
  let eingang = 'eingefuegt';
  let dateiname = null;

  if (req.file) {
    try {
      rohtext = await textAusDatei(req.file);
      eingang = 'datei';
      dateiname = req.file.originalname;
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }
  if (rohtext.trim().length < 20) {
    return res.status(400).json({ error: 'Da steht zu wenig, um eine Anfrage daraus zu lesen.' });
  }

  const { felder, luecken, leser } = await lies(rohtext);

  // Dieselbe Rundmail kommt gern zweimal. Wir legen sie trotzdem an, weisen
  // aber darauf hin: Eine Neuauflage derselben Suche ist eine Information.
  let doppelt = null;
  if (felder.referenz) {
    doppelt = await db('anfragen')
      .where({ tenant_id: req.user.tenantId, referenz: felder.referenz })
      .orderBy('id', 'desc').first();
  }

  const [a] = await db('anfragen').insert({
    tenant_id: req.user.tenantId,
    rohtext, eingang, dateiname,
    absender_firma: felder.absender_firma || null,
    absender_name: felder.absender_name || null,
    absender_email: felder.absender_email || null,
    referenz: felder.referenz || null,
    gelesen_json: JSON.stringify(felder),
    luecken_json: JSON.stringify(luecken),
    leser,
    created_by: req.user.id,
  }).returning('*');

  await req.audit({
    action: 'anfrage.gelesen', resource: 'anfrage', resourceId: a.id,
    newValue: { referenz: felder.referenz, titel: felder.titel, leser, luecken: luecken.length },
  });
  res.locals.auditLogged = true;

  res.status(201).json({
    ok: true,
    anfrage: { ...a, gelesen: felder, luecken },
    doppelt: doppelt ? { id: doppelt.id, am: doppelt.created_at, status: doppelt.status } : null,
    message: luecken.length
      ? `Gelesen, ${luecken.length} Angaben fehlen. Bitte prüfen.`
      : 'Gelesen. Bitte prüfen und übernehmen.',
  });
});

/* ------------------------------- Ansehen ---------------------------------- */

router.get('/', async (req, res) => {
  const status = req.query.status || 'neu';
  const roh = await db('anfragen').where({ tenant_id: req.user.tenantId })
    .modify((q) => { if (status !== 'alle') q.andWhere('status', status); })
    .orderBy('id', 'desc').limit(100);

  res.json({
    anfragen: roh.map((a) => ({
      ...a,
      rohtext: undefined, // in der Liste nicht nötig, spart Übertragung
      gelesen: alsObjekt(a.gelesen_json),
      luecken: alsObjekt(a.luecken_json) || [],
    })),
  });
});

router.get('/:id(\\d+)', async (req, res) => {
  const a = await db('anfragen').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!a) return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  res.json({ anfrage: { ...a, gelesen: alsObjekt(a.gelesen_json), luecken: alsObjekt(a.luecken_json) || [] } });
});

function alsObjekt(w) {
  if (!w) return null;
  if (typeof w === 'string') { try { return JSON.parse(w); } catch { return null; } }
  return w;
}

/* ------------------------------ Übernehmen -------------------------------- */

const uebernahme = z.object({
  titel: z.string().min(3).max(200),
  beschreibung: z.string().max(5000).nullable().optional(),
  ort: z.string().max(120).nullable().optional(),
  arbeitsmodell: z.enum(['remote', 'hybrid', 'vor_ort']).nullable().optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ende: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dauer: z.string().max(60).nullable().optional(),
  auslastung: z.string().max(40).nullable().optional(),
  tagessatz_bis_eur: z.number().int().min(0).max(10000).nullable().optional(),
  must: z.array(z.string().max(300)).max(30).optional(),
  nice: z.array(z.string().max(300)).max(30).optional(),
  skills: z.array(z.string().max(80)).max(25).optional(),
  oeffnen: z.boolean().optional(), // sofort auf offen statt Entwurf
});

/**
 * Aus der geprüften Anfrage ein Projekt machen.
 *
 * Die Skills werden angelegt, wenn es sie noch nicht gibt. Bei einer Anfrage
 * aus einer fremden Nische entstehen dabei neue Begriffe, und das ist richtig
 * so: Beim nächsten Mal ist der Begriff da und das Matching findet mehr.
 */
router.post('/:id(\\d+)/uebernehmen', async (req, res) => {
  const a = await db('anfragen').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!a) return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  if (a.status !== 'neu') return res.status(409).json({ error: `Diese Anfrage ist bereits ${a.status}.` });

  const parsed = uebernahme.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Bitte mindestens einen Titel angeben und die Felder prüfen.' });
  }
  const d = parsed.data;

  const [projekt] = await db('projects').insert({
    tenant_id: req.user.tenantId,
    name: d.titel,
    beschreibung: d.beschreibung || null,
    ort: d.ort || null,
    arbeitsmodell: d.arbeitsmodell || null,
    start: d.start || null,
    ende: d.ende || null,
    dauer: d.dauer || null,
    auslastung: d.auslastung || null,
    tagessatz_bis_eur: d.tagessatz_bis_eur ?? null,
    must_json: JSON.stringify(d.must || []),
    nice_json: JSON.stringify(d.nice || []),
    herkunft: 'anfrage',
    status: d.oeffnen ? 'offen' : 'entwurf',
    created_by: req.user.id,
  }).returning('*');

  // Skills anlegen und hängen. Neue Begriffe sind erwünscht.
  const begriffe = [...new Set((d.skills || []).map((s) => String(s).trim()).filter((s) => s.length > 1))];
  for (const name of begriffe) {
    let skill = await db('skills').whereRaw('lower(name) = ?', [name.toLowerCase()]).first();
    if (!skill) [skill] = await db('skills').insert({ name, kategorie: 'kompetenz' }).returning('*');
    await db('project_skills').insert({ project_id: projekt.id, skill_id: skill.id })
      .onConflict(['project_id', 'skill_id']).ignore();
  }

  await db('anfragen').where({ id: a.id })
    .update({ status: 'uebernommen', project_id: projekt.id, entschieden_am: new Date() });

  await req.audit({
    action: 'anfrage.uebernommen', resource: 'project', resourceId: projekt.id,
    newValue: { anfrage_id: a.id, referenz: a.referenz, titel: d.titel, skills: begriffe.length },
  });
  res.locals.auditLogged = true;

  res.status(201).json({
    ok: true, projekt, skills: begriffe.length,
    message: `Projekt angelegt mit ${begriffe.length} Suchbegriffen. ${d.oeffnen ? 'Es ist offen.' : 'Es steht als Entwurf.'}`,
  });
});

/**
 * Eine Anfrage ablehnen.
 *
 * Mit Grund, denn die Gründe sind die eigentliche Information: Wenn dreimal
 * "passt nicht zum Pool" dasteht, weißt du, welcher Vermittler dich falsch
 * einsortiert hat.
 */
router.post('/:id(\\d+)/ablehnen', async (req, res) => {
  const n = await db('anfragen').where({ id: req.params.id, tenant_id: req.user.tenantId, status: 'neu' })
    .update({
      status: 'abgelehnt',
      ablehnung_grund: String(req.body?.grund || '').slice(0, 500) || null,
      entschieden_am: new Date(),
    });
  if (!n) return res.status(404).json({ error: 'Anfrage nicht gefunden oder schon entschieden' });
  res.json({ ok: true, message: 'Abgelehnt. Der Text bleibt gespeichert.' });
});

module.exports = router;
