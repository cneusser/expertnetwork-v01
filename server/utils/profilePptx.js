/**
 * v1.5.0 — PPTX-Beraterprofile im Phalanx-CI (Navy/Anthrazit, Vorlage:
 * Profil-Folien im Rheinmetall-Muster). Eine Folie je Profil, abschließend
 * die Ansprechpartner-Folie. Nutzt dieselbe Profil-Datenstruktur wie die
 * PDF-Shortlist (utils/profilePdf.js).
 * Rückgabe: Promise<Buffer> (nodebuffer).
 */
const PptxGenJS = require('pptxgenjs');

const NAVY = '0F2A4A';
const ANTHRAZIT = '1A2332';
const GREY = '5A6472';
const LIGHT = 'E3E6EA';
const RED = 'B23A48';

function baseSlide(pptx, label) {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.12, fill: { color: NAVY } });
  slide.addText([
    { text: 'PHALANX', options: { bold: true, color: NAVY } },
    { text: ' Expert Network', options: { color: GREY } },
  ], { x: 0.4, y: 0.22, w: 4, h: 0.35, fontSize: 13, fontFace: 'Arial' });
  slide.addText(label, { x: 8.2, y: 0.22, w: 1.4, h: 0.35, fontSize: 10, bold: true, color: RED, align: 'right', fontFace: 'Arial' });
  slide.addShape('line', { x: 0.4, y: 0.62, w: 9.2, h: 0, line: { color: LIGHT, width: 1 } });
  return slide;
}

function sectionText(title, body) {
  return [
    { text: `${title}\n`, options: { bold: true, color: NAVY, fontSize: 12 } },
    { text: `${body || '—'}\n\n`, options: { color: ANTHRAZIT, fontSize: 11 } },
  ];
}

/**
 * profiles: [{ anzeige_name, rolle, hintergrund, projekterfahrung,
 *              schwerpunkte[], verfuegbarkeit, foto (Buffer|null) }]
 */
async function buildProfilePptx({ projektName, referenz, profiles, ansprechpartner }) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'PHX', width: 10, height: 5.63 });
  pptx.layout = 'PHX';
  pptx.author = 'Phalanx GmbH';
  pptx.title = projektName ? `Profile ${projektName}` : 'Beraterprofil';

  for (const p of profiles) {
    const slide = baseSlide(pptx, 'PROFIL');
    // Kopf: Name + Rolle (+ optional Foto rechts)
    slide.addText(p.anzeige_name, { x: 0.4, y: 0.75, w: 7.6, h: 0.5, fontSize: 22, bold: true, color: NAVY, fontFace: 'Arial' });
    slide.addText(`Rolle: ${p.rolle || '—'}${projektName ? `   ·   Projekt: ${projektName}${referenz ? ` (${referenz})` : ''}` : ''}`,
      { x: 0.4, y: 1.22, w: 7.6, h: 0.3, fontSize: 11, color: GREY, fontFace: 'Arial' });
    if (p.foto) {
      slide.addImage({ data: `image/png;base64,${p.foto.toString('base64')}`, x: 8.45, y: 0.75, w: 1.1, h: 1.1, rounding: true });
    }
    // Zwei Spalten: links Hintergrund/Erfahrung, rechts Schwerpunkte/Verfügbarkeit
    slide.addText([
      ...sectionText('Persönlicher Hintergrund / Berufserfahrung', p.hintergrund),
      ...sectionText('Ausgewählte Projekterfahrung', p.projekterfahrung),
    ], { x: 0.4, y: 1.7, w: 5.6, h: 3.5, valign: 'top', fontFace: 'Arial', lineSpacingMultiple: 1.05 });
    const schwerpunkte = (p.schwerpunkte || []).map((s) => `• ${s}`).join('\n');
    slide.addText([
      ...sectionText('Beratungsschwerpunkte', schwerpunkte),
      ...(p.verfuegbarkeit ? sectionText('Verfügbarkeit', p.verfuegbarkeit) : []),
    ], { x: 6.3, y: 1.7, w: 3.3, h: 3.0, valign: 'top', fontFace: 'Arial', lineSpacingMultiple: 1.05 });
    slide.addText('Honorar auf Anfrage', { x: 6.3, y: 4.95, w: 3.3, h: 0.35, fontSize: 11, bold: true, color: NAVY, fontFace: 'Arial' });
  }

  const kontakt = baseSlide(pptx, 'ANSPRECHPARTNER');
  kontakt.addText('Sprechen Sie uns gerne jederzeit an', { x: 0.4, y: 1.1, w: 9.2, h: 0.5, fontSize: 20, bold: true, color: NAVY, fontFace: 'Arial' });
  kontakt.addText(ansprechpartner, { x: 0.4, y: 1.8, w: 9.2, h: 2.5, fontSize: 13, color: ANTHRAZIT, fontFace: 'Arial', lineSpacingMultiple: 1.25, valign: 'top' });

  return pptx.write({ outputType: 'nodebuffer' });
}

module.exports = { buildProfilePptx };
