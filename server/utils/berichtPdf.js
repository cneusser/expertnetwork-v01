/**
 * v1.38.0 — Der Monatsbericht als ein Blatt.
 *
 * Bewusst eine Seite. Ein Bericht, den man nicht in zwei Minuten überblickt,
 * wird nicht gelesen, und ein Bericht, der nicht gelesen wird, ändert nichts.
 * Deshalb steht oben, was gerade ist, darunter die Reihe der Monate, und ganz
 * unten die eine Zeile, die zusammenfasst, wohin es geht.
 *
 * Farben und Schrift wie in den Belegen aus v1.23.0, damit die Papiere aus
 * diesem Haus zusammenpassen.
 */
const PDFDocument = require('pdfkit');

const NAVY = '#142536';
const GOLD = '#c9a96e';
const GREY = '#5d6670';
const LINE = '#d8dde1';

const geld = (c) => `${(Number(c || 0) / 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })} EUR`;
const monatName = (m) => {
  const [j, mo] = String(m).split('-');
  const namen = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  return `${namen[Number(mo) - 1] || mo} ${String(j).slice(2)}`;
};

function buildBerichtPdf({ daten, mandant = 'Phalanx GmbH' }) {
  const doc = new PDFDocument({ size: 'A4', margin: 46, info: { Title: `Bericht ${daten.zeitraum.von} bis ${daten.zeitraum.bis}` } });
  const rechts = doc.page.width - 46;

  doc.rect(0, 0, doc.page.width, 7).fill(NAVY);
  doc.fillColor(NAVY).fontSize(15).font('Helvetica-Bold').text('PHALANX', 46, 26);
  doc.fillColor(GREY).fontSize(8.5).font('Helvetica').text('Expert Network', 46, 45);
  doc.fillColor(GREY).fontSize(8.5)
    .text(`${mandant}\nErstellt am ${new Date().toLocaleDateString('de-DE')}`, 340, 26, { width: 209, align: 'right' });

  doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold')
    .text('BERICHT', 46, 74, { characterSpacing: 2.4 });
  doc.fillColor(NAVY).fontSize(17).font('Helvetica')
    .text(`${monatName(daten.zeitraum.von)} bis ${monatName(daten.zeitraum.bis)}`, 46, 88);

  let y = 122;
  doc.moveTo(46, y).lineTo(rechts, y).strokeColor(LINE).lineWidth(0.7).stroke();
  y += 16;

  /* ----------------------------- Stand heute ----------------------------- */
  doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold').text('STAND HEUTE', 46, y, { characterSpacing: 2 });
  y += 16;

  const kacheln = [
    ['Experten im Pool', String(daten.stand.pool)],
    ['Vorbereitete Kontakte', String(daten.stand.vorbereitet)],
    ['Kunden freigeschaltet', `${daten.stand.kunden_freigeschaltet} von ${daten.stand.kunden}`],
    ['Offene Anfragen', String(daten.stand.projekte_offen)],
    ['Laufende Mandate', String(daten.stand.mandate_aktiv)],
  ];
  const breite = (rechts - 46) / kacheln.length;
  kacheln.forEach(([label, wert], i) => {
    const x = 46 + i * breite;
    doc.fillColor(NAVY).fontSize(17).font('Helvetica-Bold').text(wert, x, y, { width: breite - 8 });
    doc.fillColor(GREY).fontSize(7.5).font('Helvetica').text(label, x, y + 21, { width: breite - 8 });
  });
  y += 48;

  /* --------------------------- Reihe der Monate -------------------------- */
  doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold').text('ENTWICKLUNG', 46, y, { characterSpacing: 2 });
  y += 16;

  const spalten = [
    { kopf: 'Monat', feld: 'monat', breite: 54, wert: (m) => monatName(m.monat) },
    { kopf: 'Zugänge', feld: 'zugaenge', breite: 52 },
    { kopf: 'Angeschr.', feld: 'angeschrieben', breite: 58 },
    { kopf: 'Reaktionen', feld: 'reaktionen', breite: 62 },
    { kopf: 'Quote', feld: 'quote_reaktion', breite: 46, wert: (m) => `${m.quote_reaktion} %` },
    { kopf: 'Anfragen', feld: 'anfragen', breite: 54 },
    { kopf: 'Profile', feld: 'profile_vorgelegt', breite: 46 },
    { kopf: 'Mandate', feld: 'mandate_gestartet', breite: 52 },
    { kopf: 'Umsatz', feld: 'umsatz_cent', breite: 78, wert: (m) => geld(m.umsatz_cent) },
  ];

  const zeile = (werte, fett = false, farbe = NAVY) => {
    let x = 46;
    doc.font(fett ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(farbe);
    spalten.forEach((s, i) => {
      doc.text(String(werte[i]), x, y, { width: s.breite - 4, align: i === 0 ? 'left' : 'right' });
      x += s.breite;
    });
    y += 15;
  };

  zeile(spalten.map((s) => s.kopf), true, GREY);
  doc.moveTo(46, y - 3).lineTo(rechts, y - 3).strokeColor(LINE).lineWidth(0.5).stroke();
  y += 2;

  for (const m of daten.monate) {
    zeile(spalten.map((s) => (s.wert ? s.wert(m) : m[s.feld])));
  }

  doc.moveTo(46, y).lineTo(rechts, y).strokeColor(LINE).lineWidth(0.7).stroke();
  y += 5;
  const g = daten.gesamt;
  zeile(['Summe', g.zugaenge, g.angeschrieben, g.reaktionen, `${g.quote_reaktion} %`,
    g.anfragen, g.profile_vorgelegt, g.mandate_gestartet, geld(g.umsatz_cent)], true);

  /* ------------------------------- Ergebnis ------------------------------ */
  y += 14;
  doc.fillColor(GOLD).fontSize(8).font('Helvetica-Bold').text('ERGEBNIS', 46, y, { characterSpacing: 2 });
  y += 16;

  const zeilen = [];
  if (g.umsatz_cent > 0) {
    zeilen.push(`Berechnet wurden ${geld(g.umsatz_cent)} netto, ausgezahlt ${geld(g.auszahlung_cent)}, `
      + `daraus eine Marge von ${geld(g.marge_cent)}.`);
  } else {
    zeilen.push('Im Berichtszeitraum wurde noch kein Umsatz berechnet. Das Netzwerk ist im Aufbau, '
      + 'die Zahlen darüber beschreiben diesen Aufbau.');
  }
  if (g.angeschrieben > 0) {
    zeilen.push(`${g.angeschrieben} Kontakte wurden persönlich angesprochen, ${g.reaktionen} haben geantwortet `
      + `(${g.quote_reaktion} Prozent).`);
  }
  if (g.zugaenge > 0) zeilen.push(`${g.zugaenge} Menschen sind neu ins Netzwerk gekommen.`);
  if (daten.stand.vorbereitet > 0) {
    zeilen.push(`${daten.stand.vorbereitet} vorbereitete Kontakte warten noch auf die persönliche Ansprache.`);
  }

  doc.fillColor(NAVY).fontSize(9).font('Helvetica');
  for (const z of zeilen) {
    doc.text(`· ${z}`, 46, y, { width: rechts - 46 });
    y = doc.y + 4;
  }

  if (daten.vergleich) {
    y += 8;
    const teil = daten.vergleich.felder
      .filter((f) => f.differenz !== 0)
      .map((f) => {
        const label = { zugaenge: 'Zugänge', angeschrieben: 'Ansprachen', reaktionen: 'Reaktionen',
          anfragen: 'Anfragen', mandate_gestartet: 'Mandate', umsatz_cent: 'Umsatz' }[f.feld];
        const wert = f.feld === 'umsatz_cent' ? geld(Math.abs(f.differenz)) : Math.abs(f.differenz);
        return `${label} ${f.differenz > 0 ? 'plus' : 'minus'} ${wert}`;
      });
    if (teil.length) {
      doc.fillColor(GREY).fontSize(8.5)
        .text(`${monatName(daten.vergleich.monat)} gegenüber ${monatName(daten.vergleich.vormonat)}: ${teil.join(', ')}.`,
          46, y, { width: rechts - 46 });
    }
  }

  const fussY = doc.page.height - 58;
  doc.moveTo(46, fussY).lineTo(rechts, fussY).strokeColor(LINE).lineWidth(0.5).stroke();
  doc.fillColor(GREY).fontSize(7.5).font('Helvetica')
    .text('Interne Auswertung des Phalanx Expert Network. Die Zahlen stammen unmittelbar aus der Plattform '
      + 'und sind nicht testiert.', 46, fussY + 8, { width: rechts - 46 });

  return doc;
}

module.exports = { buildBerichtPdf };
