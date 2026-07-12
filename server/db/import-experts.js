/**
 * Idempotenter Import kuratierter Expertenprofile (Key: E-Mail).
 * Läuft bei jedem Serverstart nach dem Seed; existiert das Profil bereits,
 * werden nur fehlende Teile (z. B. verlorene Dateien nach Deploy ohne Volume)
 * nachgezogen — nie Duplikate.
 *
 * DSGVO-Hinweis (Art. 14): Die Profile werden vom Admin aus zugesandten
 * Unterlagen angelegt. Der Experte hat noch NICHT selbst eingewilligt —
 * deshalb wird KEIN consents-Record erzeugt; das Profil erscheint im Admin-UI
 * als "Einwilligung ausstehend". Transparente Information + Einladung zum
 * Self-Service folgen als Feature (Sprint 2/7); bis dahin manuell informieren.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('./knex');
const storage = require('../providers/storage');

const ASSETS = path.join(__dirname, '..', 'seed-assets');

const ADRIAN = {
  email: 'adrian@rethink-interim.ch',
  expert: {
    status: 'freigegeben',
    anrede: 'herr',
    vorname: 'Adrian',
    nachname: 'Spörri',
    firma: 'Rethink Interim GmbH',
    berufsbezeichnung: 'Interim Manager — Turnaround, Transformation & Qualitätsmanagement',
    kurzprofil:
      'Interim Manager mit 25+ Jahren Erfahrung in Qualitätsmanagement, Operational Excellence und ' +
      'Organisationstransformation im industriellen Produktionsumfeld. 14 Jahre in leitenden Linienfunktionen ' +
      'bei einem internationalen Marktführer (Condair Group), seit 2023 selbstständiger Interim Executive. ' +
      'Erfahren in der Führung mehrerer paralleler Mandate mit klar definierten Auslastungsgraden. ' +
      'Referenzerfolge: Termintreue 35% → 96% im Werks-Turnaround; Post-Akquisitions-Integration 30% unter ' +
      'Budget bei 100% Mitarbeiterretention; globales ISO-9001-Multi-Site-Zertifikat eingeführt.',
    adresse_json: JSON.stringify({ strasse: 'Dorfplatz 4a', plz: '8852', ort: 'Altendorf', land: 'Schweiz' }),
    mobil: '+41 79 703 98 37',
    email: 'adrian@rethink-interim.ch',
    linkedin: 'https://linkedin.com/in/adrian-spoerri',
    webseite: 'https://rethink-interim.ch',
    ort: 'Altendorf (SZ)',
    land: 'Schweiz',
    reisebereitschaft: 'DACH-Region',
    arbeitsmodell: 'hybrid',
    sprachen_json: JSON.stringify([
      { sprache: 'Deutsch', niveau: 'Muttersprache' },
      { sprache: 'Englisch', niveau: 'verhandlungssicher' },
      { sprache: 'Französisch', niveau: 'Grundkenntnisse' },
    ]),
  },
  skills: [
    // Rollen
    ['Interim Manager', 'rolle'], ['Werksleitung', 'rolle'], ['Qualitätsleitung', 'rolle'],
    ['Projektleitung', 'rolle'], ['Geschäftsführung', 'rolle'],
    // Kompetenzen
    ['Turnaround-Management', 'kompetenz'], ['Qualitätsmanagement', 'kompetenz'],
    ['Operational Excellence', 'kompetenz'], ['Post-Merger-Integration', 'kompetenz'],
    ['Prozessharmonisierung', 'kompetenz'], ['Lieferantenaudits', 'kompetenz'],
    ['Transformationsmanagement', 'kompetenz'], ['Risikomanagement', 'kompetenz'],
    ['Multi-Mandats-Management', 'kompetenz'],
    // Zertifikate/Normen
    ['IATF 16949', 'zertifikat'], ['ISO 9001', 'zertifikat'], ['ISO 14001', 'zertifikat'],
    ['ISO 45001', 'zertifikat'], ['EFQM Excellence Model', 'zertifikat'],
    // Technologien
    ['SAP', 'technologie'], ['MS Project', 'technologie'], ['ConSense IMS', 'technologie'],
    // Branchen
    ['Industrielle Produktion', 'branche'], ['Kunststofftechnik', 'branche'],
    ['Automotive-Zulieferer', 'branche'], ['Verpackungsindustrie', 'branche'],
    ['Bahn & Logistik', 'branche'],
  ],
  availabilities: [
    { status: 'teilweise', ab_datum: '2026-08-01', auslastung_prozent: 40, kommentar: 'Gemäß E-Mail vom 12.07.2026', source: 'admin' },
    { status: 'ab_datum', ab_datum: '2026-11-01', auslastung_prozent: 100, kommentar: 'Gemäß E-Mail vom 12.07.2026', source: 'admin' },
  ],
  rates: [
    { kategorie: 'interim', satz_von_eur: 1300, satz_bis_eur: 1500, gueltig_ab: '2026-07-12' },
  ],
  documents: [
    { file: 'adrian-spoerri/CV_Adrian_Spoerri_DE_20260711.pdf', kategorie: 'cv', sprache: 'de' },
    { file: 'adrian-spoerri/CV_Adrian_Spoerri_EN_20260711.pdf', kategorie: 'cv', sprache: 'en' },
    { file: 'adrian-spoerri/Executive_Profil_DE_20260711.pdf', kategorie: 'executive_profil', sprache: 'de' },
    { file: 'adrian-spoerri/Executive_Profil_EN_20260711.pdf', kategorie: 'executive_profil', sprache: 'en' },
    { file: 'adrian-spoerri/One_Pager_DE_20260711.pdf', kategorie: 'one_pager', sprache: 'de' },
    { file: 'adrian-spoerri/One_Pager_EN_20260711.pdf', kategorie: 'one_pager', sprache: 'en' },
  ],
};

async function importExpert(def) {
  const tenant = await db('tenants').where({ slug: 'phalanx' }).first();

  // User-Konto (Login für späteren Self-Service; Zufallspasswort, Reset per Mail möglich)
  let user = await db('users').where({ email: def.email }).first();
  if (!user) {
    [user] = await db('users')
      .insert({
        tenant_id: tenant.id,
        email: def.email,
        password_hash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10),
        role: 'expert',
        is_approved: true,
      })
      .returning('*');
  }

  let expert = await db('experts').where({ user_id: user.id }).first();
  if (!expert) {
    [expert] = await db('experts')
      .insert({ tenant_id: tenant.id, user_id: user.id, ...def.expert })
      .returning('*');
    await db('audit_log').insert({
      tenant_id: tenant.id,
      action: 'expert.import',
      resource: 'experts',
      resource_id: expert.id,
      new_value_json: JSON.stringify({ email: def.email, quelle: 'Admin-Import (zugesandte Unterlagen)' }),
    });
  }

  // Skills (fehlende ergänzen)
  for (const [name, kategorie] of def.skills) {
    let skill = await db('skills').where({ name }).first();
    if (!skill) [skill] = await db('skills').insert({ name, kategorie }).returning('*');
    await db('expert_skills')
      .insert({ expert_id: expert.id, skill_id: skill.id })
      .onConflict(['expert_id', 'skill_id'])
      .ignore();
  }

  // Verfügbarkeiten + Sätze nur beim Erstimport (Insert-only-Historie nicht duplizieren)
  const hasAvail = await db('availabilities').where({ expert_id: expert.id }).first();
  if (!hasAvail && def.availabilities.length) {
    for (const a of def.availabilities) {
      await db('availabilities').insert({ tenant_id: tenant.id, expert_id: expert.id, confirmed_at: db.fn.now(), ...a });
    }
  }
  const hasRate = await db('rates').where({ expert_id: expert.id }).first();
  if (!hasRate) {
    for (const r of def.rates) {
      await db('rates').insert({ tenant_id: tenant.id, expert_id: expert.id, ...r });
    }
  }

  // Dokumente: DB-Zeile + Datei; fehlende Dateien (z. B. nach Deploy ohne Volume)
  // werden aus den Seed-Assets wiederhergestellt.
  for (const d of def.documents) {
    const src = path.join(ASSETS, d.file);
    if (!fs.existsSync(src)) {
      console.warn(`Import: Seed-Asset fehlt: ${d.file}`);
      continue;
    }
    let doc = await db('documents')
      .where({ expert_id: expert.id, kategorie: d.kategorie, sprache: d.sprache, version: 1 })
      .first();
    const relPath = `experts/${expert.id}/${d.kategorie}-${d.sprache}-v1.pdf`;
    if (!doc) {
      await storage.save(relPath, await fs.promises.readFile(src));
      await db('documents').insert({
        tenant_id: tenant.id,
        expert_id: expert.id,
        kategorie: d.kategorie,
        sprache: d.sprache,
        filename: path.basename(d.file),
        version: 1,
        storage_ref: relPath,
        mimetype: 'application/pdf',
        size_bytes: fs.statSync(src).size,
      });
    } else if (!storage.exists(doc.storage_ref)) {
      await storage.save(doc.storage_ref, await fs.promises.readFile(src));
    }
  }

  console.log(`Import ok — ${def.expert.vorname} ${def.expert.nachname} (Experte #${expert.id})`);
}

/**
 * Klaus Müller — identifiziert aus dem E-Mail-Archiv ("CV wie vereinbart",
 * 23.01.2024, klaus.kl.mueller@gmail.com). Profildaten aus dem CV-Text extrahiert.
 * Original-PDF liegt in der Mail und wird vom Admin über den Tresor-Upload
 * ergänzt (Anhang war über die Mail-API nur als Text verfügbar).
 * Status 'registriert' + KEIN Consent → Profil zeigt "Einwilligung ausstehend",
 * DSGVO-konforme Einladung erfolgt per Admin-Button.
 */
const KLAUS = {
  email: 'klaus.kl.mueller@gmail.com',
  expert: {
    status: 'registriert',
    anrede: 'herr',
    vorname: 'Klaus',
    nachname: 'Müller',
    firma: 'Selbständiger Berater / Senior Manager BearingPoint',
    berufsbezeichnung: 'Interim Manager & Berater — Transport, Logistik & ÖPNV',
    kurzprofil:
      'Transport- und Logistikprofi mit mehr als 20 Jahren Führungserfahrung in General Management, ' +
      'Produktion, IT und Financial Controlling. Ehemaliger Vorstand Bus der DB Regio AG (Umsatz bis ' +
      '1,1 Mrd. €, 8.500 Mitarbeitende, 35 Busgesellschaften); zuvor Leiter Regionalnetze DB Netz AG ' +
      '(13.000 km Infrastruktur) und kaufmännischer Geschäftsführer DB Fuhrparkservice/DB Rent. ' +
      'Exzellent vernetzt in Bahn und ÖPNV. Referenzerfolge: Overheadkosten −20 %, Kostensenkungs- ' +
      'programm 175 Mio. €, Einführung agiler Managementmethoden, Lean Target Operating Model. ' +
      'Seit 2021 selbständiger Berater, seit 2022 Senior Manager bei BearingPoint (Aufbau Transport-Sektor). ' +
      'Lehraufträge Controlling (HS Koblenz) und Personalwirtschaft (HfWU Nürtingen).',
    adresse_json: JSON.stringify({ strasse: 'Herrenhahnweg 10a', plz: '56410', ort: 'Montabaur', land: 'Deutschland' }),
    mobil: '+49 171 555 67 41',
    email: 'klaus.kl.mueller@gmail.com',
    linkedin: 'https://www.linkedin.com/in/klaus-m%C3%BCller-9253a58b/',
    webseite: 'https://www.xing.com/profile/Klaus_Mueller146/cv',
    ort: 'Montabaur',
    land: 'Deutschland',
    reisebereitschaft: 'Deutschland',
    arbeitsmodell: 'hybrid',
    sprachen_json: JSON.stringify([
      { sprache: 'Deutsch', niveau: 'Muttersprache' },
      { sprache: 'Englisch', niveau: 'verhandlungssicher' },
    ]),
  },
  skills: [
    ['Interim Manager', 'rolle'], ['Geschäftsführung', 'rolle'], ['Vorstand', 'rolle'],
    ['Aufsichtsrat/Beirat', 'rolle'], ['Projektleitung', 'rolle'],
    ['Controlling', 'kompetenz'], ['Turnaround-Management', 'kompetenz'],
    ['Prozessoptimierung', 'kompetenz'], ['Lean Management', 'kompetenz'],
    ['Internationales Projektmanagement', 'kompetenz'], ['Personalführung & -entwicklung', 'kompetenz'],
    ['IT-Management', 'kompetenz'], ['Instandhaltungsmanagement', 'kompetenz'],
    ['Stakeholder-Management', 'kompetenz'],
    ['Bahn & Logistik', 'branche'], ['ÖPNV & Mobilität', 'branche'], ['Transport', 'branche'],
    ['SAP', 'technologie'], ['MS Project', 'technologie'], ['SharePoint', 'technologie'],
  ],
  availabilities: [], // unbekannt — wird nach Einladung vom Experten selbst gepflegt
  rates: [], // unbekannt
  documents: [], // Original-CV-PDF aus der Mail vom 23.01.2024 per Tresor-Upload ergänzen
};

async function importAll() {
  await importExpert(ADRIAN);
  await importExpert(KLAUS);
}

if (require.main === module) {
  importAll()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { importAll };
