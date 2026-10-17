/**
 * v1.43.0 — Die Vorlage als PDF: One-Pager je Profil, Gesamtfassung für alle.
 *
 * Eine Seite je Profil, DIN A4, zum Ausdrucken und Weiterreichen. Wer drei
 * Profile vergleicht, legt sie nebeneinander, und das geht nur, wenn jedes
 * auf ein Blatt passt.
 *
 * Deshalb wird gekürzt statt umgebrochen: Lieber fünf Stationen als acht,
 * lieber ein knapper Text als ein zweites Blatt, auf dem der Rest steht und
 * das niemand mitdruckt.
 *
 * Farben und Aufbau wie in den Belegen aus v1.23.0 und dem Bericht aus
 * v1.38.0, damit die Papiere aus diesem Haus zusammenpassen.
 */
const PDFDocument = require('pdfkit');

const NAVY = '#142536';
const GOLD = '#c9a96e';
const GREY = '#5d6670';
const LINE = '#d8dde1';
const PAPIER = '#f7f5f0';

const RAND = 48;

const geld = (c) => (c ? `${Math.round(Number(c) / 100).toLocaleString('de-DE')} EUR` : 'auf Anfrage');

function datum(d) {
  return d ? new Date(d).toLocaleDateString('de-DE') : null;
}

/** Kopf und Fuß, auf jedem Blatt gleich. */
function rahmen(doc, { projektName, kennung = null, seite = null }) {
  const rechts = doc.page.width - RAND;

  doc.rect(0, 0, doc.page.width, 6).fill(NAVY);
  doc.fillColor(NAVY).fontSize(14).font('Helvetica-Bold').text('PHALANX', RAND, 24);
  doc.fillColor(GREY).fontSize(8).font('Helvetica').text('Expert Network', RAND, 41);

  doc.fillColor(GREY).fontSize(8)
    .text(projektName, 320, 24, { width: rechts - 320, align: 'right' });
  if (kennung) {
    doc.fillColor(GOLD).fontSize(9).font('Helvetica-Bold')
      .text(kennung, 320, 38, { width: rechts - 320, align: 'right', characterSpacing: 1.4 });
  }

  const fussY = doc.page.height - 48;
  doc.moveTo(RAND, fussY).lineTo(rechts, fussY).strokeColor(LINE).lineWidth(0.5).stroke();
  doc.fillColor(GREY).fontSize(7).font('Helvetica')
    .text('Phalanx GmbH · Helene-Lange-Straße 28 · 91056 Erlangen · neusser@phalanx.de · +49 9131 920 60 75\n'
      + 'Vertraulich. Die Angaben beruhen auf den Selbstauskünften der vorgestellten Person.',
    RAND, fussY + 7, { width: rechts - RAND - 60 });
  if (seite) {
    doc.fillColor(GREY).fontSize(7).text(seite, rechts - 60, fussY + 7, { width: 60, align: 'right' });
  }
}

/** Eine Überschrift im Hausstil. */
function kicker(doc, text, y) {
  doc.fillColor(GOLD).fontSize(7.5).font('Helvetica-Bold')
    .text(text.toUpperCase(), RAND, y, { characterSpacing: 2 });
  return y + 14;
}

/**
 * Ein Profil auf eine Seite.
 *
 * Gibt die Höhe zurück, bei der es endet, damit der Aufrufer weiß, ob noch
 * Platz ist.
 */
function profilSeite(doc, { profil, projekt, seite = null }) {
  const rechts = doc.page.width - RAND;
  const breite = rechts - RAND;
  rahmen(doc, { projektName: projekt.name, kennung: profil.kennung, seite });

  let y = 68;

  // Rolle als Titel. Der Name steht nirgends, das ist der Punkt der Sache.
  doc.fillColor(NAVY).fontSize(19).font('Helvetica')
    .text(profil.rolle || profil.kennung, RAND, y, { width: breite });
  y = doc.y + 4;

  // Die Eckdaten in einer Zeile.
  const eck = [
    profil.verfuegbarkeit?.ab_datum ? `verfügbar ab ${datum(profil.verfuegbarkeit.ab_datum)}`
      : profil.verfuegbarkeit?.status === 'sofort' ? 'sofort verfügbar' : null,
    profil.verfuegbarkeit?.auslastung_prozent ? `${profil.verfuegbarkeit.auslastung_prozent} % Auslastung` : null,
    profil.tagessatz_cent
      ? `Tagessatz ${geld(profil.tagessatz_cent)}${profil.satz_hinweis ? ` ${profil.satz_hinweis}` : ''}`
      : 'Tagessatz auf Anfrage',
  ].filter(Boolean);
  doc.fillColor(GREY).fontSize(9).font('Helvetica').text(eck.join('  ·  '), RAND, y, { width: breite });
  y = doc.y + 12;

  doc.moveTo(RAND, y).lineTo(rechts, y).strokeColor(LINE).lineWidth(0.7).stroke();
  y += 14;

  /* ----------------------------- Einschätzung ---------------------------- */
  if (profil.fitting) {
    y = kicker(doc, 'Einschätzung zur Anfrage', y);
    doc.fillColor(NAVY).fontSize(10).font('Helvetica')
      .text(profil.fitting, RAND, y, { width: breite, lineGap: 1.5 });
    y = doc.y + 16;
  }

  /* ------------------------------- Profil -------------------------------- */
  if (profil.kurzprofil) {
    y = kicker(doc, 'Profil', y);
    // Auf eine Seite kürzen. Ein zweites Blatt wird nicht mitgedruckt.
    const text = String(profil.kurzprofil).slice(0, 2200);
    doc.fillColor(NAVY).fontSize(9.5).font('Helvetica')
      .text(text, RAND, y, { width: breite, lineGap: 1.4 });
    y = doc.y + 16;
  }

  /* ---------------------------- Anforderungen ---------------------------- */
  if (profil.treffer?.length || profil.luecken?.length) {
    y = kicker(doc, 'Abgleich mit den Anforderungen', y);

    for (const t of (profil.treffer || []).slice(0, 8)) {
      doc.fillColor('#2e7d5b').fontSize(9).font('Helvetica-Bold').text('+', RAND, y, { width: 10 });
      doc.fillColor(NAVY).font('Helvetica').text(t, RAND + 12, y, { width: breite - 12 });
      y = doc.y + 3;
    }
    // Die Lücken stehen mit da. Ein Kunde, der sie selbst findet, traut der
    // Vorlage nicht mehr, und beim nächsten Mal auch nicht.
    for (const l of (profil.luecken || []).slice(0, 5)) {
      doc.fillColor(GREY).fontSize(9).font('Helvetica-Bold').text('–', RAND, y, { width: 10 });
      doc.fillColor(GREY).font('Helvetica').text(`${l} (nicht belegt)`, RAND + 12, y, { width: breite - 12 });
      y = doc.y + 3;
    }
    y += 12;
  }

  /* ---------------------------- Schwerpunkte ----------------------------- */
  if (profil.schwerpunkte?.length) {
    y = kicker(doc, 'Schwerpunkte', y);
    doc.fillColor(NAVY).fontSize(9).font('Helvetica')
      .text(profil.schwerpunkte.slice(0, 12).join('  ·  '), RAND, y, { width: breite, lineGap: 1.4 });
    y = doc.y + 10;
  }

  return y;
}

/** Ein einzelnes Profil als One-Pager. */
function buildOnePager({ profil, projekt }) {
  const doc = new PDFDocument({
    size: 'A4', margin: RAND, autoFirstPage: true,
    info: { Title: `${projekt.name} · ${profil.kennung}` },
  });
  profilSeite(doc, { profil, projekt });
  return doc;
}

/**
 * Alle Profile in einem Dokument: eine Übersicht, dann je Profil ein Blatt.
 *
 * Die Übersicht vorn, weil die meisten zuerst wissen wollen, wie viele es
 * sind und was sie kosten, und erst dann lesen.
 */
function buildVorlagePdf({ vorlage, projekt, profile }) {
  const doc = new PDFDocument({
    size: 'A4', margin: RAND, autoFirstPage: true,
    info: { Title: `Profilvorschlag ${projekt.name}` },
  });
  const rechts = doc.page.width - RAND;
  const breite = rechts - RAND;

  /* ------------------------------ Übersicht ------------------------------ */
  rahmen(doc, { projektName: projekt.name, seite: `1 von ${profile.length + 1}` });
  let y = 68;

  doc.fillColor(GOLD).fontSize(7.5).font('Helvetica-Bold')
    .text('PROFILVORSCHLAG', RAND, y, { characterSpacing: 2.2 });
  y += 15;
  doc.fillColor(NAVY).fontSize(21).font('Helvetica').text(projekt.name, RAND, y, { width: breite });
  y = doc.y + 6;

  const rahmendaten = [
    projekt.start ? `Start ${datum(projekt.start)}` : null,
    projekt.dauer, projekt.auslastung,
    projekt.ort || (projekt.arbeitsmodell === 'remote' ? 'remote' : null),
  ].filter(Boolean);
  if (rahmendaten.length) {
    doc.fillColor(GREY).fontSize(9.5).font('Helvetica')
      .text(rahmendaten.join('  ·  '), RAND, y, { width: breite });
    y = doc.y + 14;
  }

  if (vorlage.anschreiben) {
    doc.fillColor(NAVY).fontSize(10).font('Helvetica')
      .text(vorlage.anschreiben, RAND, y, { width: breite, lineGap: 2 });
    y = doc.y + 16;
  }

  doc.moveTo(RAND, y).lineTo(rechts, y).strokeColor(LINE).lineWidth(0.7).stroke();
  y += 14;

  y = kicker(doc, `${profile.length} ${profile.length === 1 ? 'Profil' : 'Profile'}`, y);

  for (const p of profile) {
    // Je Profil ein kurzer Block, drei bis vier Zeilen.
    doc.fillColor(GOLD).fontSize(8.5).font('Helvetica-Bold')
      .text(p.kennung, RAND, y, { width: 70, characterSpacing: 1.2 });
    doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold')
      .text(p.rolle || '', RAND + 76, y, { width: breite - 76 - 90 });
    doc.fillColor(NAVY).fontSize(10).font('Helvetica')
      .text(p.tagessatz_cent ? geld(p.tagessatz_cent) : 'auf Anfrage',
        rechts - 90, y, { width: 90, align: 'right' });
    if (p.satz_hinweis) {
      doc.fillColor(GREY).fontSize(7.5).text(p.satz_hinweis, rechts - 110, doc.y, { width: 110, align: 'right' });
    }
    y = doc.y + 2;

    if (p.fitting) {
      doc.fillColor(GREY).fontSize(9).font('Helvetica')
        .text(p.fitting, RAND + 76, y, { width: breite - 76, lineGap: 1.2 });
      y = doc.y + 4;
    }
    const verf = p.verfuegbarkeit?.ab_datum ? `verfügbar ab ${datum(p.verfuegbarkeit.ab_datum)}` : null;
    if (verf) {
      doc.fillColor(GREY).fontSize(8.5).text(verf, RAND + 76, y, { width: breite - 76 });
      y = doc.y + 2;
    }
    y += 8;
    doc.moveTo(RAND, y).lineTo(rechts, y).strokeColor(LINE).lineWidth(0.4).stroke();
    y += 10;

    // Reicht der Platz nicht mehr, bricht die Übersicht um.
    if (y > doc.page.height - 120 && p !== profile[profile.length - 1]) {
      doc.addPage();
      rahmen(doc, { projektName: projekt.name });
      y = 68;
    }
  }

  /* --------------------------- Je ein Blatt ------------------------------ */
  let nr = 2;
  for (const p of profile) {
    doc.addPage();
    profilSeite(doc, { profil: p, projekt, seite: `${nr} von ${profile.length + 1}` });
    nr += 1;
  }

  return doc;
}

module.exports = { buildOnePager, buildVorlagePdf, geld };
