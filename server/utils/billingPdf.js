/**
 * v1.23.0 — Beleg-PDF (Gutschrift und Rechnung) im Phalanx-CI.
 * Pflichtangaben nach Paragraf 14 UStG: Aussteller, Empfaenger, Belegnummer,
 * Datum, Leistungszeitraum, Entgelt, Steuersatz und Steuerbetrag.
 * Bei Gutschriften steht der Hinweis auf Paragraf 14 Absatz 2 UStG im Fuss.
 */
const PDFDocument = require('pdfkit');

const NAVY = '#0f2a4a';
const GREY = '#5a6472';
const LIGHT = '#e3e6ea';

const geld = (c) => `${(Number(c || 0) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
const datum = (d) => new Date(d).toLocaleDateString('de-DE');

function adressBlock(e = {}) {
  return [e.firma, e.ansprechpartner, e.strasse, [e.plz, e.ort].filter(Boolean).join(' '), e.land]
    .filter(Boolean).join('\n');
}

/**
 * beleg: { typ, beleg_nr, datum, periode, empfaenger_json, positionen_json,
 *          netto_cent, ust_prozent, ust_cent, brutto_cent }
 * absender: { firma, strasse, plz, ort, ustid, hrb, iban, bank, email, telefon }
 */
function buildBelegPdf({ beleg, absender = {}, projektName, zahlungsziel_tage = 14 }) {
  const gutschrift = beleg.typ === 'gutschrift';
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `${gutschrift ? 'Gutschrift' : 'Rechnung'} ${beleg.beleg_nr}` } });

  doc.rect(0, 0, doc.page.width, 8).fill(NAVY);
  doc.fillColor(NAVY).fontSize(11).font('Helvetica-Bold').text('PHALANX', 50, 26);
  doc.fillColor(GREY).font('Helvetica').fontSize(9).text(absender.firma || 'Phalanx GmbH', 50, 42);

  doc.fillColor(GREY).fontSize(8).font('Helvetica')
    .text([absender.strasse, [absender.plz, absender.ort].filter(Boolean).join(' '), absender.email, absender.telefon]
      .filter(Boolean).join('\n'), 340, 26, { width: 205, align: 'right' });

  const empf = typeof beleg.empfaenger_json === 'string' ? JSON.parse(beleg.empfaenger_json) : (beleg.empfaenger_json || {});
  doc.fillColor(GREY).fontSize(7).text(
    [absender.firma, absender.strasse, [absender.plz, absender.ort].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
    50, 118);
  doc.fillColor('#1a2332').fontSize(10.5).font('Helvetica').text(adressBlock(empf) || '(kein Empfaenger hinterlegt)', 50, 132, { lineGap: 2 });

  doc.fillColor(NAVY).fontSize(17).font('Helvetica-Bold')
    .text(gutschrift ? 'Gutschrift' : 'Rechnung', 50, 226);
  doc.fillColor(GREY).fontSize(9).font('Helvetica').text(
    [`Belegnummer ${beleg.beleg_nr}`, `Datum ${datum(beleg.datum)}`,
      beleg.periode ? `Leistungszeitraum ${beleg.periode}` : null,
      projektName ? `Mandat ${projektName}` : null].filter(Boolean).join('   ·   '),
    50, doc.y + 4);

  doc.fillColor('#1a2332').fontSize(9.5).text(
    gutschrift
      ? 'wir rechnen die von dir erbrachten Leistungen wie folgt ab. Bitte stelle uns hierfuer keine eigene Rechnung.'
      : 'vielen Dank fuer Ihren Auftrag. Wir berechnen die erbrachten Leistungen wie folgt.',
    50, doc.y + 14, { width: doc.page.width - 100, lineGap: 2 });

  let y = doc.y + 18;
  doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor(LIGHT).stroke();
  y += 6;
  doc.fillColor(NAVY).fontSize(8.5).font('Helvetica-Bold');
  doc.text('Position', 50, y); doc.text('Menge', 330, y, { width: 50, align: 'right' });
  doc.text('Einzel', 385, y, { width: 70, align: 'right' }); doc.text('Betrag', 460, y, { width: 85, align: 'right' });
  y += 14;

  const positionen = typeof beleg.positionen_json === 'string' ? JSON.parse(beleg.positionen_json) : (beleg.positionen_json || []);
  doc.font('Helvetica').fillColor('#1a2332').fontSize(9);
  for (const p of positionen) {
    const h = doc.heightOfString(p.text, { width: 270 });
    doc.text(p.text, 50, y, { width: 270 });
    doc.text(String(p.menge).replace('.', ','), 330, y, { width: 50, align: 'right' });
    doc.text(geld(p.einzel_cent), 385, y, { width: 70, align: 'right' });
    doc.text(geld(p.betrag_cent), 460, y, { width: 85, align: 'right' });
    y += Math.max(h, 12) + 6;
  }

  doc.moveTo(330, y).lineTo(doc.page.width - 50, y).strokeColor(LIGHT).stroke();
  y += 8;
  const zeile = (label, wert, fett) => {
    doc.font(fett ? 'Helvetica-Bold' : 'Helvetica').fillColor(fett ? NAVY : '#1a2332').fontSize(fett ? 10.5 : 9.5);
    doc.text(label, 330, y, { width: 125, align: 'right' });
    doc.text(wert, 460, y, { width: 85, align: 'right' });
    y += fett ? 18 : 14;
  };
  zeile('Nettobetrag', geld(beleg.netto_cent));
  zeile(`Umsatzsteuer ${beleg.ust_prozent} Prozent`, geld(beleg.ust_cent));
  zeile('Gesamtbetrag', geld(beleg.brutto_cent), true);

  y += 8;
  doc.font('Helvetica').fillColor(GREY).fontSize(8.5);
  const fuss = [];
  if (gutschrift) {
    fuss.push('Gutschrift im Sinne des Paragrafen 14 Absatz 2 Satz 2 UStG. Der Betrag wird auf die hinterlegte Bankverbindung ueberwiesen.');
    fuss.push('Wenn etwas nicht stimmt, melde dich einfach, dann korrigieren wir das.');
  } else {
    fuss.push(`Zahlbar ohne Abzug innerhalb von ${zahlungsziel_tage} Tagen nach Rechnungsdatum.`);
    if (absender.iban) fuss.push(`Bankverbindung: ${absender.iban}${absender.bank ? `, ${absender.bank}` : ''}`);
  }
  if (absender.ustid) fuss.push(`Umsatzsteuer-Identifikationsnummer: ${absender.ustid}`);
  if (absender.hrb) fuss.push(absender.hrb);
  doc.text(fuss.join('\n'), 50, Math.min(y, doc.page.height - 120), { width: doc.page.width - 100, lineGap: 2 });

  doc.rect(0, doc.page.height - 26, doc.page.width, 26).fill(NAVY);
  doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica')
    .text(`${absender.firma || 'Phalanx GmbH'} · Phalanx Expert Network · ${beleg.beleg_nr}`,
      50, doc.page.height - 17, { width: doc.page.width - 100, align: 'center' });

  doc.end();
  return doc;
}

/** Buchhaltungs-Export als CSV mit Semikolon (Excel-freundlich, deutsche Dezimalzeichen). */
function belegeCsv(rows) {
  const kopf = ['Belegnummer', 'Typ', 'Datum', 'Periode', 'Empfaenger', 'Mandat', 'Netto', 'USt-Satz', 'USt', 'Brutto', 'Status'];
  const zahl = (c) => (Number(c || 0) / 100).toFixed(2).replace('.', ',');
  const zellen = rows.map((r) => {
    const e = typeof r.empfaenger_json === 'string' ? JSON.parse(r.empfaenger_json) : (r.empfaenger_json || {});
    return [r.beleg_nr, r.typ === 'gutschrift' ? 'Gutschrift' : 'Rechnung', datum(r.datum), r.periode || '',
      e.firma || e.ansprechpartner || '', r.projekt_name || '', zahl(r.netto_cent), `${r.ust_prozent}%`,
      zahl(r.ust_cent), zahl(r.brutto_cent), r.status]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';');
  });
  return `﻿${kopf.join(';')}\n${zellen.join('\n')}\n`;
}

module.exports = { buildBelegPdf, belegeCsv };
