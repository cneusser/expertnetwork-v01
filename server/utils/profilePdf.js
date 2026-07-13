/**
 * v1.2.0 — PDF-Shortlist im Phalanx-CI (Vorlage: Profil-Folien, Rheinmetall-Muster).
 * Pro Kandidat eine Seite (Rolle, Hintergrund, Projekterfahrung, Schwerpunkte,
 * "Honorar auf Anfrage"), abschließend die Ansprechpartner-Seite.
 */
const PDFDocument = require('pdfkit');

const NAVY = '#0f2a4a';
const GREY = '#5a6472';
const LIGHT = '#e3e6ea';

function header(doc, label) {
  doc.rect(0, 0, doc.page.width, 8).fill(NAVY);
  doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold').text('PHALANX', 50, 24);
  doc.fillColor(GREY).font('Helvetica').text(' Expert Network', 105, 24);
  doc.fillColor('#b23a48').fontSize(9).font('Helvetica-Bold').text(label, 50, 24, { align: 'right', width: doc.page.width - 100 });
  doc.moveTo(50, 42).lineTo(doc.page.width - 50, 42).strokeColor(LIGHT).stroke();
}

function section(doc, title, body, y) {
  doc.fillColor(NAVY).fontSize(10.5).font('Helvetica-Bold').text(title, 50, y);
  doc.fillColor('#1a2332').fontSize(9.5).font('Helvetica').text(body || '—', 50, doc.y + 3, { width: doc.page.width - 100, lineGap: 1.5 });
  return doc.y + 12;
}

/** profiles: [{ anzeige_name, rolle, hintergrund, projekterfahrung, schwerpunkte[], sprachen, verfuegbarkeit }] */
function buildShortlistPdf({ projektName, referenz, profiles, ansprechpartner }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Shortlist ${referenz || ''}` } });

  for (const p of profiles) {
    header(doc, 'PROFIL');
    doc.fillColor(NAVY).fontSize(16).font('Helvetica-Bold').text(p.anzeige_name, 50, 58);
    doc.fillColor(GREY).fontSize(10).font('Helvetica').text(`Rolle: ${p.rolle || '—'}`, 50, doc.y + 2);
    doc.fillColor(GREY).fontSize(8.5).text(`Projekt: ${projektName}${referenz ? ` · Referenz ${referenz}` : ''}`, 50, doc.y + 2);
    let y = doc.y + 14;
    y = section(doc, 'Persönlicher Hintergrund / Berufserfahrung', p.hintergrund, y);
    y = section(doc, 'Ausgewählte Projekterfahrung', p.projekterfahrung, y);
    y = section(doc, 'Beratungsschwerpunkte', (p.schwerpunkte || []).map((s) => `• ${s}`).join('\n'), y);
    if (p.verfuegbarkeit) y = section(doc, 'Verfügbarkeit', p.verfuegbarkeit, y);
    doc.fillColor(NAVY).fontSize(10).font('Helvetica-Bold').text('Honorar auf Anfrage', 50, Math.min(y + 6, doc.page.height - 80));
    doc.addPage();
  }

  header(doc, 'ANSPRECHPARTNER');
  doc.fillColor(NAVY).fontSize(16).font('Helvetica-Bold').text('Sprechen Sie uns gerne jederzeit an', 50, 70);
  doc.fillColor('#1a2332').fontSize(11).font('Helvetica').text(ansprechpartner, 50, doc.y + 14, { lineGap: 3 });
  doc.end();
  return doc; // Stream
}

module.exports = { buildShortlistPdf };
