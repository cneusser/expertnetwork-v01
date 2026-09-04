#!/usr/bin/env node
/**
 * v1.25.0 — Vorregistrierung von der Kommandozeile.
 *
 * Gleicher Rechenweg wie die Admin-Route, nur ohne Browser. Gedacht für große
 * Listen und für den Fall, dass der Import gegen die Produktion laufen soll,
 * ohne dass jemand Zugangsdaten weiterreicht.
 *
 * Aufruf (Datenbank kommt aus der Umgebung, bei Railway über railway run):
 *   node server/scripts/vorregistrierung-import.js <datei.xlsx|csv> [--ergebnis pfad.csv] [--probe]
 *
 *   --probe    liest und prüft die Datei, schreibt aber nichts in die Datenbank
 *   --ergebnis Pfad für die Ergebnis-CSV, Standard neben der Eingabedatei
 *
 * Es geht keine einzige Mail raus. Der Lauf ist wiederholbar, Dubletten werden
 * erkannt und nicht doppelt angelegt.
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  const datei = args.find((a) => !a.startsWith('--'));
  const probe = args.includes('--probe');
  const ergebnisArg = args.indexOf('--ergebnis');
  if (!datei) {
    console.error('Aufruf: node server/scripts/vorregistrierung-import.js <datei.xlsx|csv> [--ergebnis pfad.csv] [--probe]');
    process.exit(1);
  }
  if (!fs.existsSync(datei)) {
    console.error(`Datei nicht gefunden: ${datei}`);
    process.exit(1);
  }

  const { db } = require('../db/knex');
  const { leseDatei, importiereListe, ergebnisCsv, findePerson } = require('../utils/vorregistrierung');

  const gelesen = leseDatei(fs.readFileSync(datei));
  if (gelesen.fehlend.length) {
    console.error(`Spalten fehlen: ${gelesen.fehlend.join(', ')}`);
    process.exit(1);
  }
  console.log(`Gelesen: ${gelesen.zeilen.length} Zeilen aus ${path.basename(datei)}`);

  const tenant = await db('tenants').where({ slug: process.env.TENANT_SLUG || 'phalanx' }).first();
  if (!tenant) {
    console.error('Mandant nicht gefunden. TENANT_SLUG setzen oder Seed ausführen.');
    process.exit(1);
  }

  let ergebnis;
  if (probe) {
    ergebnis = { angelegt: [], vorhanden: [], fehler: [] };
    for (const z of gelesen.zeilen) {
      const fund = await findePerson(tenant.id, z);
      if (fund.treffer) {
        ergebnis.vorhanden.push({
          vorname: z.vorname, nachname: z.nachname, linkedin: z.linkedin,
          expert_id: fund.treffer.id, status: fund.treffer.status,
          erkannt_ueber: fund.weg, mehrdeutig: fund.mehrdeutig,
        });
      } else {
        ergebnis.angelegt.push({ id: '(Probe)', vorname: z.vorname, nachname: z.nachname, linkedin: z.linkedin });
      }
    }
    console.log('Probelauf, es wurde nichts geschrieben.');
  } else {
    ergebnis = await importiereListe(gelesen.zeilen, { tenantId: tenant.id });
  }

  const nachStatus = {};
  for (const v of ergebnis.vorhanden) nachStatus[v.status] = (nachStatus[v.status] || 0) + 1;
  console.log(`Angelegt:  ${ergebnis.angelegt.length}`);
  console.log(`Vorhanden: ${ergebnis.vorhanden.length}${Object.keys(nachStatus).length ? ` (${Object.entries(nachStatus).map(([s, n]) => `${s}: ${n}`).join(', ')})` : ''}`);
  console.log(`Fehler:    ${ergebnis.fehler.length}`);
  for (const f of ergebnis.fehler.slice(0, 10)) console.log(`  ${f.vorname} ${f.nachname}: ${f.grund}`);

  const zielPfad = ergebnisArg >= 0 && args[ergebnisArg + 1]
    ? args[ergebnisArg + 1]
    : path.join(path.dirname(datei), 'expertnetwork_import_ergebnis.csv');
  fs.mkdirSync(path.dirname(zielPfad), { recursive: true });
  fs.writeFileSync(zielPfad, ergebnisCsv(ergebnis));
  console.log(`Ergebnis-CSV: ${zielPfad}`);

  await db.destroy();
}

main().catch(async (e) => {
  console.error('Abbruch:', e.message);
  process.exit(1);
});
