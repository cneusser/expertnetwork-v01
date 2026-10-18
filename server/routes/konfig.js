/**
 * v1.50.0 — Was der Browser wissen muss, bevor jemand angemeldet ist.
 *
 * Bisher standen solche Werte fest im Client, also im gebauten Bündel. Das
 * ging, solange sie sich nie änderten. Die Terminadresse ändert sich aber:
 * Sie zeigte auf Calendly, zeigt jetzt auf die Termin-App in Phalanx OS, und
 * der Link enthält einen Token, der irgendwann ein anderer ist.
 *
 * Deshalb hier und nicht im Code. Ein Wert, den man nur durch einen neuen
 * Build ändern kann, ändert irgendwann niemand mehr.
 *
 * Ohne Anmeldung erreichbar, denn der Terminknopf steht auch auf der
 * Anmeldeseite. Es stehen hier nur Dinge, die ohnehin jeder sieht, der auf
 * den Knopf klickt.
 */
const express = require('express');

const router = express.Router();

/**
 * Die Terminadresse.
 *
 * Der Standard zeigt auf die Termin-App in Phalanx OS. Über TERMIN_URL in
 * der Umgebung überschreibbar, ohne neuen Build.
 */
const TERMIN_STANDARD = 'https://phalanx-os-production.up.railway.app/api/termine/'
  + 'a9a267e1c8385afadc70e5fd2545c958bcf6cb0e73dd51e8?typ=8&fest=1';

function terminUrl() {
  const wert = String(process.env.TERMIN_URL || '').trim();
  if (!wert) return TERMIN_STANDARD;
  // Nur http und https. Ein falsch gesetzter Wert soll den Knopf nicht in
  // etwas verwandeln, das beim Klick etwas anderes tut als zu öffnen.
  return /^https?:\/\//i.test(wert) ? wert : TERMIN_STANDARD;
}

router.get('/', (_req, res) => {
  res.json({
    termin_url: terminUrl(),
    app_url: process.env.APP_URL || null,
  });
});

module.exports = { router, terminUrl, TERMIN_STANDARD };
