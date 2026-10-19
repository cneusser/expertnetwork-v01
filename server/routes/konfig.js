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
const { db } = require('../db/knex');
const { requireAuth, requireRole, optionalAuth } = require('../middleware/auth');

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
    // v1.51.0: Der Knopf zeigt auf unsere eigene Umleitung, damit wir
    // mitzählen können. Die Zieladresse steht trotzdem dabei, für den Fall,
    // dass jemand sie braucht.
    termin_url: '/api/konfig/termin',
    termin_ziel: terminUrl(),
    app_url: process.env.APP_URL || null,
  });
});

/**
 * v1.51.0 — Der Terminknopf, über uns geleitet.
 *
 * Warum eine Umleitung und kein Zähler im Browser: Ein Zähler, der im
 * Browser läuft, zählt nicht, wenn jemand den Link kopiert, in einem neuen
 * Tab öffnet oder einen Blocker benutzt. Die Umleitung zählt genau das, was
 * wirklich passiert, nämlich dass jemand weggeht.
 *
 * Was dabei gespeichert wird: dass geklickt wurde, wann, und von welcher
 * Seite aus. Keine IP-Adresse, kein Browserkennzeichen. Wir wollen wissen,
 * ob der Knopf benutzt wird, nicht von wem.
 *
 * Was in Phalanx OS danach passiert, ob also tatsächlich gebucht wird, sieht
 * nur Phalanx OS. Diese Zahl sagt "so viele sind losgegangen", nicht "so
 * viele sind angekommen".
 */
router.get('/termin', optionalAuth, async (req, res) => {
  try {
    await db('klicks').insert({
      tenant_id: req.user?.tenantId || null,
      was: 'termin',
      woher: String(req.query.woher || '').slice(0, 60) || null,
      user_id: req.user?.id || null,
    });
  } catch {
    // Ein fehlgeschlagener Zähler darf niemanden am Terminieren hindern.
  }
  res.redirect(302, terminUrl());
});

/** Wie oft wurde geklickt. Für die Verwaltung. */
router.get('/klicks', requireAuth, requireRole('admin'), async (req, res) => {
  const was = String(req.query.was || 'termin');
  const seit = new Date(Date.now() - 90 * 86400000);

  const zeilen = await db('klicks').where({ was }).andWhere('created_at', '>=', seit)
    .select('created_at', 'woher', 'user_id');

  // Je Monat, damit man eine Entwicklung sieht statt einer Zahl.
  const monate = {};
  for (const z of zeilen) {
    const d = new Date(z.created_at);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monate[m] = (monate[m] || 0) + 1;
  }

  res.json({
    was,
    gesamt: zeilen.length,
    zeitraum_tage: 90,
    monate: Object.entries(monate).sort().map(([monat, anzahl]) => ({ monat, anzahl })),
    // Angemeldet oder nicht: Ein Klick von einem Experten im eigenen Konto
    // bedeutet etwas anderes als einer von der Anmeldeseite.
    angemeldet: zeilen.filter((z) => z.user_id).length,
    anonym: zeilen.filter((z) => !z.user_id).length,
    woher: Object.entries(zeilen.reduce((m, z) => {
      const w = z.woher || 'unbekannt';
      m[w] = (m[w] || 0) + 1; return m;
    }, {})).sort((a, b) => b[1] - a[1]).map(([seite, anzahl]) => ({ seite, anzahl })),
  });
});

module.exports = { router, terminUrl, TERMIN_STANDARD };
