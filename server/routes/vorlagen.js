/**
 * v1.43.0 — Vorlagen: Profile zu einer Anfrage zusammenstellen und zeigen.
 *
 * Zwei Zugänge in einer Datei, weil sie dasselbe betreffen:
 *   Admin        anlegen, bearbeiten, versenden, als PDF oder PPTX holen
 *   öffentlich   die Ansicht unter dem Token, ohne Konto
 *
 * Die öffentliche Seite sieht nur, was in der Vorlage eingefroren wurde. Sie
 * fragt nie das Profil ab: Was einmal verschickt wurde, bleibt, wie es
 * verschickt wurde.
 */
const express = require('express');
const { z } = require('zod');
const { db } = require('../db/knex');
const { requireAuth, requireRole } = require('../middleware/auth');
const vorlagen = require('../utils/vorlage');
const { buildOnePager, buildVorlagePdf } = require('../utils/vorlagePdf');
const { erzeuge: erzeugeKurzprofil } = require('../utils/kurzprofil');
const { getTemplate, render } = require('../utils/mailTemplates');
const { getMailProvider } = require('../providers/mail');
const kr = require('../utils/kundenreaktion');

const router = express.Router();

/* =========================== Öffentlich =================================== */

/**
 * Die Ansicht unter dem Token.
 *
 * Kein Konto, kein Login. Der Token ist 24 zufällige Bytes und steht in
 * keiner Suchmaschine, weil die Seite nicht verlinkt ist. Für eine
 * Profilübersicht ohne Klardaten ist das die richtige Abwägung: Ein
 * Anmeldezwang würde dazu führen, dass niemand hineinsieht.
 */
router.get('/oeffentlich/:token', async (req, res) => {
  const v = await db('vorlagen').where({ token: req.params.token }).first();
  if (!v) return res.status(404).json({ error: 'Diese Übersicht gibt es nicht.' });
  if (v.status === 'entwurf') return res.status(404).json({ error: 'Diese Übersicht ist noch nicht freigegeben.' });
  if (v.gueltig_bis && new Date(v.gueltig_bis) < new Date()) {
    return res.status(410).json({ error: 'Dieser Link ist abgelaufen. Bitte melden Sie sich bei uns.' });
  }
  res.json(await vorlagen.fuerEmpfaenger(db, v));
});

/** Ein Profil als One-Pager, DIN A4. */
router.get('/oeffentlich/:token/profil/:positionId(\\d+).pdf', async (req, res) => {
  const v = await db('vorlagen').where({ token: req.params.token }).first();
  if (!v || v.status === 'entwurf') return res.status(404).json({ error: 'Nicht gefunden' });

  const daten = await vorlagen.fuerEmpfaenger(db, v);
  const profil = daten.profile.find((p) => p.id === Number(req.params.positionId));
  if (!profil) return res.status(404).json({ error: 'Profil nicht gefunden' });

  const doc = buildOnePager({ profil, projekt: daten.projekt });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `inline; filename="${dateiname(daten.projekt.name, profil.kennung)}.pdf"`);
  doc.pipe(res); doc.end();
});

/** Alle Profile in einem PDF. */
router.get('/oeffentlich/:token/alle.pdf', async (req, res) => {
  const v = await db('vorlagen').where({ token: req.params.token }).first();
  if (!v || v.status === 'entwurf') return res.status(404).json({ error: 'Nicht gefunden' });

  const daten = await vorlagen.fuerEmpfaenger(db, v);
  const doc = buildVorlagePdf({ vorlage: v, projekt: daten.projekt, profile: daten.profile });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${dateiname(daten.projekt.name, 'Profile')}.pdf"`);
  doc.pipe(res); doc.end();
});

function dateiname(...teile) {
  return teile.join('-').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 80);
}

/**
 * v1.49.0 — Der Kunde reagiert auf ein Profil.
 *
 * Ohne Konto, unter demselben Token wie die Übersicht. Die Alternative wäre
 * gewesen, ihm ein Portal zu geben; dann hätte er sich anmelden müssen, um
 * "passt nicht" zu sagen, und hätte es nicht getan.
 */
router.post('/oeffentlich/:token/profil/:posId(\\d+)/reaktion', async (req, res) => {
  const r = await kr.reagiere(db, {
    token: req.params.token,
    positionId: Number(req.params.posId),
    reaktion: String(req.body?.reaktion || ''),
    notiz: req.body?.notiz || null,
  });

  if (!r.ok) {
    const texte = {
      unbekannt: 'Unbekannte Angabe.',
      nicht_gefunden: 'Diese Übersicht gibt es nicht.',
      entwurf: 'Diese Übersicht ist noch nicht freigegeben.',
      abgelaufen: 'Dieser Link ist abgelaufen. Bitte melden Sie sich bei uns.',
      position_nicht_gefunden: 'Profil nicht gefunden.',
      absage_schon_draussen: 'Zu diesem Profil haben wir bereits abgesagt. Bitte melden Sie sich kurz bei uns, dann klären wir das persönlich.',
    };
    const status = r.grund === 'abgelaufen' ? 410
      : r.grund === 'absage_schon_draussen' ? 409 : 404;
    return res.status(status).json({ error: texte[r.grund] || 'Das hat nicht geklappt.' });
  }

  // Dich benachrichtigen, aber nur bei einer echten Änderung. Ein zweiter
  // Klick auf dasselbe ist keine Nachricht wert.
  if (r.geaendert && r.vorlage.benachrichtigen) {
    try {
      const stand = await kr.stand(db, r.vorlage.id);
      const projekt = await db('projects').where({ id: r.vorlage.project_id }).first();
      const tpl = await getTemplate(r.vorlage.tenant_id, 'vorlage_reaktion');
      const wasText = {
        gemerkt: 'gemerkt', einladen: 'möchte sprechen', abgelehnt: 'abgelehnt',
      }[r.reaktion];

      const fertig = render(tpl, {
        empfaenger: r.vorlage.empfaenger_firma || r.vorlage.empfaenger_name || 'Der Kunde',
        projekt_titel: projekt?.name || '',
        kennung: r.position.kennung,
        was: wasText,
        notiz: r.position.reaktion_notiz ? `Dazu: "${r.position.reaktion_notiz}"\n\n` : '',
        stand: `${stand.einladen} einladen, ${stand.gemerkt} gemerkt, ${stand.abgelehnt} abgelehnt, ${stand.offen} offen`,
        hinweis: stand.absagen_offen
          ? `${stand.absagen_offen} Absage(n) warten auf deine Freigabe, bevor sie hinausgehen.\n\n`
          : '',
        link: `${oeffentlicherLink(req, r.vorlage.token)}`,
      });

      const mail = getMailProvider();
      const an = process.env.ADMIN_EMAIL || 'neusser@phalanx.de';
      await mail.send({ to: an, subject: fertig.subject, text: fertig.text, html: fertig.html },
        { tenantId: r.vorlage.tenant_id, einzelkorrespondenz: true, art: 'vorlage_reaktion' });
    } catch {
      // Eine fehlgeschlagene Benachrichtigung darf die Reaktion des Kunden
      // nicht zunichtemachen. Sie steht in der Datenbank, das zählt.
    }
  }

  const antworten = {
    gemerkt: 'Gemerkt. Sie können jederzeit umentscheiden.',
    einladen: 'Danke, wir melden uns und stimmen einen Termin ab.',
    abgelehnt: 'Danke für die Rückmeldung, das hilft uns bei der nächsten Auswahl.',
  };
  res.json({ ok: true, reaktion: r.reaktion, message: antworten[r.reaktion] });
});

/* ============================== Verwaltung ================================ */

router.use(requireAuth, requireRole('admin'));

const anlegen = z.object({
  project_id: z.number().int(),
  expert_ids: z.array(z.number().int()).min(1).max(12),
  empfaenger: z.object({
    vendor_user_id: z.number().int().nullable().optional(),
    firma: z.string().max(200).nullable().optional(),
    name: z.string().max(200).nullable().optional(),
    email: z.string().email().nullable().optional(),
  }).optional(),
  aufschlag_prozent: z.number().int().min(0).max(200).nullable().optional(),
  anschreiben: z.string().max(3000).nullable().optional(),
  gueltig_tage: z.number().int().min(1).max(365).optional(),
});

/** Eine Vorlage bauen. Entsteht als Entwurf, der Link greift noch nicht. */
router.post('/', async (req, res) => {
  const parsed = anlegen.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Bitte Projekt und mindestens ein Profil wählen.' });
  const d = parsed.data;

  const projekt = await db('projects').where({ id: d.project_id, tenant_id: req.user.tenantId }).first();
  if (!projekt) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  const v = await vorlagen.baue(db, {
    tenantId: req.user.tenantId,
    projekt,
    expertIds: d.expert_ids,
    empfaenger: d.empfaenger || {},
    aufschlag: d.aufschlag_prozent ?? null,
    anschreiben: d.anschreiben || null,
    gueltigTage: d.gueltig_tage ?? 30,
    benutzerId: req.user.id,
  });

  const positionen = await db('vorlage_positionen').where({ vorlage_id: v.id }).orderBy('sortierung');
  await req.audit({
    action: 'vorlage.angelegt', resource: 'vorlage', resourceId: v.id,
    newValue: { projekt: projekt.name, profile: positionen.length, aufschlag: v.aufschlag_prozent },
  });
  res.locals.auditLogged = true;

  res.status(201).json({
    ok: true, vorlage: v, positionen,
    // Was beim Bauen aufgefallen ist, etwa ein Satz, der nach Stundensatz
    // aussieht. Gehört vor die Augen, bevor die Vorlage hinausgeht.
    hinweise: v.hinweise || [],
    message: `${positionen.length} Profile zusammengestellt, Aufschlag ${v.aufschlag_prozent} Prozent. Bitte prüfen und dann freigeben.`,
  });
});

/** Die Vorlage im Admin, mit allem, auch dem Einkaufssatz. */
router.get('/:id(\\d+)', async (req, res) => {
  const v = await db('vorlagen').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!v) return res.status(404).json({ error: 'Vorlage nicht gefunden' });

  const positionen = await db('vorlage_positionen as p')
    .join('experts as e', 'e.id', 'p.expert_id')
    .where('p.vorlage_id', v.id)
    .orderBy('p.sortierung')
    .select('p.*', 'e.vorname', 'e.nachname', 'e.firma');
  const projekt = await db('projects').where({ id: v.project_id }).first();

  res.json({
    vorlage: v, projekt,
    positionen: positionen.map((p) => ({
      ...p,
      profil: typeof p.profil_json === 'string' ? JSON.parse(p.profil_json || '{}') : (p.profil_json || {}),
      marge_cent: (p.satz_kunde_cent || 0) - (p.satz_experte_cent || 0),
    })),
    link: v.status === 'entwurf' ? null : oeffentlicherLink(req, v.token),
  });
});

/** Alle Vorlagen zu einem Projekt. */
router.get('/', async (req, res) => {
  const q = db('vorlagen').where({ tenant_id: req.user.tenantId });
  if (req.query.project_id) q.andWhere('project_id', Number(req.query.project_id));
  const liste = await q.orderBy('id', 'desc').limit(100);

  const ids = liste.map((v) => v.id);
  const zahlen = ids.length
    ? await db('vorlage_positionen').whereIn('vorlage_id', ids)
      .select('vorlage_id', 'reaktion').then((r) => r)
    : [];

  res.json({
    vorlagen: liste.map((v) => {
      const meine = zahlen.filter((z) => z.vorlage_id === v.id);
      return {
        ...v,
        profile: meine.length,
        reaktionen: {
          gemerkt: meine.filter((m) => m.reaktion === 'gemerkt').length,
          einladen: meine.filter((m) => m.reaktion === 'einladen').length,
          abgelehnt: meine.filter((m) => m.reaktion === 'abgelehnt').length,
        },
      };
    }),
  });
});

/** Kurzprofil oder Fitting einer Position ändern, vor dem Versand. */
router.put('/:id(\\d+)/positionen/:posId(\\d+)', async (req, res) => {
  const v = await db('vorlagen').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!v) return res.status(404).json({ error: 'Vorlage nicht gefunden' });

  const patch = {};
  for (const f of ['kurzprofil', 'fitting']) {
    if (typeof req.body[f] === 'string') patch[f] = req.body[f].slice(0, 6000);
  }
  if (req.body.satz_kunde_cent !== undefined) {
    patch.satz_kunde_cent = req.body.satz_kunde_cent === null ? null : Number(req.body.satz_kunde_cent);
  }
  // v1.47.1: Der Satz lässt sich auch in Euro setzen, denn so denkt man
  // darüber. Die Umrechnung in Cent gehört nicht in den Kopf des Benutzers.
  if (req.body.satz_kunde_eur !== undefined) {
    patch.satz_kunde_cent = req.body.satz_kunde_eur === null
      ? null : Math.round(Number(req.body.satz_kunde_eur) * 100);
  }
  if (typeof req.body.satz_hinweis === 'string') {
    patch.satz_hinweis = req.body.satz_hinweis.slice(0, 200) || null;
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nichts zu ändern' });

  const n = await db('vorlage_positionen').where({ id: req.params.posId, vorlage_id: v.id }).update(patch);
  if (!n) return res.status(404).json({ error: 'Position nicht gefunden' });
  res.json({ ok: true, message: 'Gespeichert.' });
});

/** Eine Position aus der Vorlage nehmen. */
router.delete('/:id(\\d+)/positionen/:posId(\\d+)', async (req, res) => {
  const v = await db('vorlagen').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!v) return res.status(404).json({ error: 'Vorlage nicht gefunden' });
  if (v.status !== 'entwurf') {
    return res.status(409).json({ error: 'Die Vorlage ist schon verschickt. Eine verschickte Übersicht ändert sich nicht mehr.' });
  }
  await db('vorlage_positionen').where({ id: req.params.posId, vorlage_id: v.id }).del();
  res.json({ ok: true, message: 'Entfernt.' });
});

/**
 * Die Vorlage freigeben: Ab jetzt trägt der Link.
 *
 * Verschickt wird hier noch nichts. Den Link gibst du weiter, wie du willst,
 * per Mail, im Gespräch, im Chat des Vermittlers.
 */
router.post('/:id(\\d+)/freigeben', async (req, res) => {
  const v = await db('vorlagen').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!v) return res.status(404).json({ error: 'Vorlage nicht gefunden' });

  const anzahl = Number((await db('vorlage_positionen').where({ vorlage_id: v.id }).count('* as n').first()).n);
  if (!anzahl) return res.status(400).json({ error: 'Die Vorlage enthält kein Profil.' });

  await db('vorlagen').where({ id: v.id }).update({ status: 'versendet', versendet_am: new Date() });
  await req.audit({
    action: 'vorlage.freigegeben', resource: 'vorlage', resourceId: v.id,
    newValue: { profile: anzahl, empfaenger: v.empfaenger_firma || v.empfaenger_email },
  });
  res.locals.auditLogged = true;

  res.json({
    ok: true, link: oeffentlicherLink(req, v.token),
    message: 'Der Link ist jetzt gültig. Du kannst ihn weitergeben.',
  });
});

/* ----------------- v1.47.0: Die drei Wege zum Kunden -------------------- */

/**
 * Das PDF, aus der Verwaltung heraus.
 *
 * Geht auch im Entwurf: Du willst sehen, was der Kunde bekäme, bevor du es
 * freigibst. Die öffentliche Fassung bleibt wie sie ist und zeigt einen
 * Entwurf nicht.
 */
router.get('/:id(\\d+)/alle.pdf', async (req, res) => {
  const v = await db('vorlagen').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!v) return res.status(404).json({ error: 'Vorlage nicht gefunden' });

  const daten = await vorlagen.fuerEmpfaenger(db, v);
  const doc = buildVorlagePdf({ vorlage: v, projekt: daten.projekt, profile: daten.profile });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `attachment; filename="${dateiname('Phalanx-Profile', daten.projekt.name)}.pdf"`);
  doc.pipe(res); doc.end();
});

/** Ein einzelnes Profil als One-Pager, aus der Verwaltung. */
router.get('/:id(\\d+)/profil/:posId(\\d+).pdf', async (req, res) => {
  const v = await db('vorlagen').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!v) return res.status(404).json({ error: 'Vorlage nicht gefunden' });

  const daten = await vorlagen.fuerEmpfaenger(db, v);
  const profil = daten.profile.find((p) => p.id === Number(req.params.posId));
  if (!profil) return res.status(404).json({ error: 'Profil nicht gefunden' });

  const doc = buildOnePager({ profil, projekt: daten.projekt });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${dateiname(daten.projekt.name, profil.kennung)}.pdf"`);
  doc.pipe(res); doc.end();
});

/**
 * Die Vorlage per Mail verschicken.
 *
 * Nur wenn eine Adresse da ist. Kam die Anfrage über LinkedIn oder im
 * Gespräch, gibt es keine, und dann ist der Link der Weg. Eine Pflichtangabe
 * für einen Fall, den es oft nicht gibt, wäre eine Hürde ohne Nutzen.
 *
 * Das PDF hängt mit dran. Manche öffnen keinen Link, aber jeder öffnet einen
 * Anhang, und umgekehrt genauso. Beides zu schicken kostet nichts.
 */
router.post('/:id(\\d+)/versenden', async (req, res) => {
  const v = await db('vorlagen').where({ id: req.params.id, tenant_id: req.user.tenantId }).first();
  if (!v) return res.status(404).json({ error: 'Vorlage nicht gefunden' });

  const an = String(req.body?.email || v.empfaenger_email || '').trim();
  if (!an || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(an)) {
    return res.status(400).json({
      error: 'Für den Versand brauche ich eine Mailadresse. Ohne sie bleibt der Link, den du selbst weitergibst.',
    });
  }

  // Ein Entwurf wird mit dem Versand freigegeben: Eine Mail zu schicken und
  // den Link dann nicht gelten zu lassen, wäre der sicherste Weg zu einem
  // verärgerten Kunden.
  if (v.status === 'entwurf') {
    await db('vorlagen').where({ id: v.id }).update({ status: 'versendet', versendet_am: new Date() });
  }

  const daten = await vorlagen.fuerEmpfaenger(db, v);
  const link = oeffentlicherLink(req, v.token);
  const tpl = await getTemplate(req.user.tenantId, 'profilvorschlag');

  const werte = {
    anrede: req.body?.anrede || (v.empfaenger_name ? `Guten Tag ${v.empfaenger_name}` : 'Guten Tag'),
    projekt_titel: daten.projekt.name,
    anzahl: String(daten.profile.length),
    profil_wort: daten.profile.length === 1 ? 'ein Profil' : `${daten.profile.length} Profile`,
    anschreiben: v.anschreiben || '',
    link,
    link_label: 'Profile ansehen',
    gueltig_bis: v.gueltig_bis ? new Date(v.gueltig_bis).toLocaleDateString('de-DE') : '',
  };
  const fertig = render(tpl, werte);

  // Das PDF als Anhang, im Speicher gebaut.
  const doc = buildVorlagePdf({ vorlage: v, projekt: daten.projekt, profile: daten.profile });
  const puffer = await new Promise((fertigMachen, schiefgegangen) => {
    const teile = [];
    doc.on('data', (t) => teile.push(t));
    doc.on('end', () => fertigMachen(Buffer.concat(teile)));
    doc.on('error', schiefgegangen);
    doc.end();
  });

  const mail = getMailProvider();
  await mail.send({
    to: an,
    subject: fertig.subject,
    text: fertig.text,
    html: fertig.html,
    attachments: [{
      filename: `${dateiname('Phalanx-Profile', daten.projekt.name)}.pdf`,
      content: puffer,
      contentType: 'application/pdf',
    }],
  }, { tenantId: req.user.tenantId, einzelkorrespondenz: true, art: 'profilvorschlag' });

  await db('vorlagen').where({ id: v.id }).update({ empfaenger_email: an });
  await req.audit({
    action: 'vorlage.versendet', resource: 'vorlage', resourceId: v.id,
    newValue: { an, profile: daten.profile.length },
  });
  res.locals.auditLogged = true;

  res.json({ ok: true, link, message: `Verschickt an ${an}, mit dem PDF im Anhang.` });
});

/* -------------------- v1.49.0: Absagen an Kandidaten --------------------- */

/**
 * Welche Absagen warten.
 *
 * Über alle Vorlagen hinweg, denn die Frage "wem muss ich noch absagen" hat
 * mit der einzelnen Vorlage nichts zu tun.
 */
router.get('/absagen/offen', async (req, res) => {
  const offen = await kr.offeneAbsagen(db, req.user.tenantId);
  res.json({
    absagen: offen.map((a) => ({
      ...a,
      // Wie lange der Mensch schon wartet. Das ist die eigentliche Zahl:
      // Eine Absage, die zwei Wochen liegt, ist schlimmer als eine schnelle.
      wartet_tage: a.reaktion_am
        ? Math.floor((Date.now() - new Date(a.reaktion_am)) / 86400000) : null,
      hat_mail: Boolean(a.email),
    })),
  });
});

/**
 * Eine Absage freigeben und verschicken.
 *
 * Zwei Schritte in einem Aufruf, aber bewusst nicht automatisch beim Klick
 * des Kunden: Zwischen seiner Entscheidung und der Nachricht liegt oft ein
 * Gespräch, das du noch führst.
 *
 * Der Grund des Kunden geht NICHT mit hinaus. "Zu teuer" oder "zu wenig
 * Branchenerfahrung" hilft dem Kandidaten nicht und schadet der Beziehung
 * zum Kunden, wenn es die Runde macht.
 */
router.post('/absagen/:posId(\\d+)/verschicken', async (req, res) => {
  const p = await db('vorlage_positionen as p')
    .join('vorlagen as v', 'v.id', 'p.vorlage_id')
    .join('experts as e', 'e.id', 'p.expert_id')
    .join('projects as pr', 'pr.id', 'v.project_id')
    .where('p.id', req.params.posId).andWhere('v.tenant_id', req.user.tenantId)
    .select('p.*', 'e.vorname', 'e.nachname', 'e.email', 'e.id as expert_id',
      'pr.name as projekt_name', 'v.id as v_id')
    .first();

  if (!p) return res.status(404).json({ error: 'Nicht gefunden' });
  if (p.reaktion !== 'abgelehnt') return res.status(400).json({ error: 'Hier liegt keine Absage vor.' });
  if (p.absage_verschickt_am) return res.status(409).json({ error: 'Diese Absage ist schon raus.' });
  if (!p.email) {
    return res.status(400).json({
      error: `${p.vorname} ${p.nachname} hat keine Mailadresse hinterlegt. Bitte persönlich absagen.`,
    });
  }

  const tpl = await getTemplate(req.user.tenantId, 'kandidat_absage');
  const fertig = render(tpl, {
    vorname: p.vorname,
    projekt_titel: p.projekt_name,
    // Ein eigener Zusatz, falls du etwas sagen willst. Ohne ihn bleibt es
    // bei der kurzen Fassung, und das ist meistens richtig.
    zusatz: req.body?.zusatz ? `${String(req.body.zusatz).slice(0, 1000)}\n\n` : '',
  });

  const mail = getMailProvider();
  await mail.send({ to: p.email, subject: fertig.subject, text: fertig.text, html: fertig.html },
    { tenantId: req.user.tenantId, einzelkorrespondenz: true, art: 'kandidat_absage' });

  const jetzt = new Date();
  await db('vorlage_positionen').where({ id: p.id })
    .update({ absage_freigegeben_am: p.absage_freigegeben_am || jetzt, absage_verschickt_am: jetzt });

  await req.audit({
    action: 'kandidat.abgesagt', resource: 'expert', resourceId: p.expert_id,
    newValue: { projekt: p.projekt_name, kennung: p.kennung },
  });
  res.locals.auditLogged = true;

  res.json({ ok: true, message: `Absage an ${p.vorname} ${p.nachname} verschickt.` });
});

/** Eine Absage zurückhalten: Du sagst selbst ab, telefonisch oder im Termin. */
router.post('/absagen/:posId(\\d+)/selbst-erledigt', async (req, res) => {
  const p = await db('vorlage_positionen as p')
    .join('vorlagen as v', 'v.id', 'p.vorlage_id')
    .where('p.id', req.params.posId).andWhere('v.tenant_id', req.user.tenantId)
    .select('p.*').first();
  if (!p) return res.status(404).json({ error: 'Nicht gefunden' });

  const jetzt = new Date();
  await db('vorlage_positionen').where({ id: p.id })
    .update({ absage_freigegeben_am: jetzt, absage_verschickt_am: jetzt });
  res.json({ ok: true, message: 'Als erledigt vermerkt. Es geht keine Mail hinaus.' });
});

/** Ein Kurzprofil neu erzeugen, ausdrücklich. */
router.post('/kurzprofil/:expertId(\\d+)', async (req, res) => {
  const e = await db('experts').where({ id: req.params.expertId, tenant_id: req.user.tenantId }).first();
  if (!e) return res.status(404).json({ error: 'Experte nicht gefunden' });

  const { text, grund } = await erzeugeKurzprofil(db, e);
  if (!text) return res.status(400).json({ error: grund || 'Es ließ sich kein Kurzprofil bauen.' });

  await db('experts').where({ id: e.id }).update({
    kurzprofil_anonym: text, kurzprofil_anonym_am: new Date(), kurzprofil_anonym_gepflegt: false,
  });
  res.json({ ok: true, kurzprofil: text, message: 'Kurzprofil neu erzeugt. Bitte durchlesen.' });
});

/** Ein Kurzprofil von Hand setzen. Ab dann gilt es als gepflegt. */
router.put('/kurzprofil/:expertId(\\d+)', async (req, res) => {
  const text = String(req.body?.kurzprofil || '').slice(0, 6000);
  if (!text.trim()) return res.status(400).json({ error: 'Kein Text' });

  const n = await db('experts').where({ id: req.params.expertId, tenant_id: req.user.tenantId }).update({
    kurzprofil_anonym: text, kurzprofil_anonym_am: new Date(), kurzprofil_anonym_gepflegt: true,
  });
  if (!n) return res.status(404).json({ error: 'Experte nicht gefunden' });
  res.json({ ok: true, message: 'Gespeichert. Das Kurzprofil wird nicht mehr automatisch überschrieben.' });
});

function oeffentlicherLink(req, token) {
  const basis = process.env.APP_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `${req.protocol}://${req.get('host')}`);
  return `${basis.replace(/\/+$/, '')}/profile/${token}`;
}

module.exports = router;
