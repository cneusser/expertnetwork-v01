# Phalanx Expert Network

Privates Freelancer-Relationship-Management (FRM) der Phalanx GmbH — ein CRM für externe Experten (Interim Manager, Berater, Projektleiter). Schwesterprojekt von Capitalmatch (`phalanx-v01`), gleicher Stack, eigenständig deploybar.

**Stand: Sprint 0** — Fundament: Auth (Registrierung, E-Mail-Verifizierung, Login, Passwort-Reset), DSGVO-Consent-Records, append-only Audit-Log, MailProvider-Interface, Scheduler-Hook, leere Dashboards (Admin/Experte).

## Stack

React (Vite) · Node/Express · PostgreSQL (Knex-Migrations) · Railway

## Lokale Entwicklung

Voraussetzungen: Node ≥ 20, laufendes PostgreSQL.

```bash
# 1) Datenbank anlegen
createdb expertnetwork

# 2) Env konfigurieren
cp .env.example server/.env    # DATABASE_URL + JWT_SECRET anpassen

# 3) Installieren & starten (zwei Terminals)
npm run install:all
npm run dev:server             # Port 3001 — führt Migrationen + Seed automatisch aus
npm run dev:client             # Port 5173 — proxied /api an den Server
```

Ohne `RESEND_API_KEY` landen alle Mails als `[MAIL-STUB]` in der Server-Konsole — der Verifizierungslink lässt sich dort herauskopieren.

**Admin-Zugang:** wird bei jedem Start idempotent geseedet (`ADMIN_EMAIL` / `ADMIN_PASSWORD`, Defaults siehe `.env.example` — in Produktion zwingend setzen).

## Tests

```bash
DATABASE_URL=postgres://...testdb... npm test
```

Deckt ab: Registrierung inkl. Consent-Pflicht, Verifizierung, Login/Session-Cookie, `/me`, Append-only-Beweis des Audit-Logs.

## Deploy auf Railway

1. Neues Railway-Projekt `expertnetwork-v01`, **Region EU** (DSGVO).
2. GitHub-Repo verbinden (Auto-Deploy bei Push).
3. **PostgreSQL-Plugin** hinzufügen; Railway setzt `DATABASE_URL` automatisch — im Service als Variable referenzieren (`${{Postgres.DATABASE_URL}}`).
4. Service-Variablen setzen: `JWT_SECRET` (langer Zufallswert), `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `APP_URL` (öffentliche URL), `NODE_ENV=production`, optional `MAIL_PROVIDER=resend` + `RESEND_API_KEY` + `MAIL_FROM`.
5. Optional — Zwei-Wege-Kommunikation (Antworten empfangen, v1.14):
   Railway-Variablen `INBOUND_KEY` (langer Zufallswert) und `MAIL_REPLY_TO` (z. B. antwort@reply.phalanx.de) setzen.
   Bei Brevo eine Inbound-Domain einrichten (MX-Record der Subdomain laut Brevo-Hilfe „Inbound parsing") und den
   Webhook per API registrieren: URL `https://<domain>/api/mails/inbound?key=<INBOUND_KEY>`.
6. Optional — „Mit LinkedIn anmelden" (OIDC, nur Login/Verknüpfung bestehender Konten, kein Scraping):
   LinkedIn Developer Portal → App anlegen → Produkt „Sign In with LinkedIn using OpenID Connect" →
   Redirect-URL `https://<domain>/api/auth/linkedin/callback` eintragen → Railway-Variablen
   `LINKEDIN_CLIENT_ID` und `LINKEDIN_CLIENT_SECRET` setzen. Der Button erscheint automatisch.
5. Build-Command: `npm run build` · Start-Command: `npm start`.
   Migrationen + Seed laufen automatisch beim Serverstart — kein manueller Migrationsschritt nötig.

## Architekturprinzipien (gelten für alle folgenden Sprints)

- **Audit-Prinzip:** Jede Änderung läuft durch `middleware/audit.js`; `audit_log` ist per DB-Trigger append-only (UPDATE/DELETE unmöglich).
- **Consent-Prinzip:** DSGVO-Einwilligungen als versionierte Records (`consents`), befristet auf 24 Monate; Text in `server/consent.js` (juristisch prüfen lassen!).
- **Tenant-Prinzip:** Jede Tabelle trägt `tenant_id` (Default-Tenant `phalanx`); Zugriff über `forTenant()` in `db/knex.js`.
- **Provider-Interfaces:** Mail (`providers/mail`, Resend/Stub; Microsoft Graph als dokumentierte Alternative), OAuth (`providers/auth`, vorbereitet für Microsoft/LinkedIn), später Storage und LLM.

## Sicherheit (v1.0.0)

- **Brute-Force-Schutz:** Rate-Limit auf Login/Registrierung/Passwort-Reset (Default 30 Versuche / 15 min je IP, Env `AUTH_RATE_LIMIT`).
- **Session-Invalidierung:** Passwortänderung/-reset und Einwilligungs-Widerruf machen alle bestehenden Sessions des Kontos sofort ungültig (`token_version`).
- **CSRF:** SameSite=lax-Cookies plus Origin-Prüfung aller mutierenden Requests.
- **Header:** Helmet (nosniff, Frame-Schutz u. a.).
- **Uploads:** PDF-Magic-Bytes-Prüfung zusätzlich zum Mimetype, 10-MB-Limit.
- **Fehler:** zentraler Handler — keine Stacktraces an Clients.
- Offen (organisatorisch): juristische Prüfung von Einwilligungstext/AVV, Backup-Strategie für Postgres + Volume, Content-Security-Policy-Feintuning.

### Abhängigkeiten (Stand v1.24.1)

- **multer 2.x** statt 1.x (1.x ist abgekündigt und hat offene Meldungen). API unverändert, wir nutzen nur `memoryStorage` und `single()`.
- **node-cron 4.x** statt 3.x (zieht kein verwundbares `uuid` mehr nach).
- **xlsx 0.20.3 vom SheetJS-CDN**, nicht aus der npm-Registry. SheetJS veröffentlicht seit 0.19 nicht mehr auf npm, dort liegt nur noch das alte 0.18.5 mit Prototype Pollution und ReDoS. Deshalb steht in `server/package.json` eine Tarball-URL statt einer Versionsnummer. Wenn ein Build daran scheitert, ist `cdn.sheetjs.com` nicht erreichbar, nicht der Code kaputt.
- **overrides** in `server/package.json` heben `brace-expansion` und `image-size` auf die jeweils neueste Fassung an, auch wenn eine Abhängigkeit älter pinnt.
- **Bewusst offen:** `image-size` (über pptxgenjs) hat Meldungen zu Endlosschleifen in den ICNS-, JXL- und HEIF-Parsern, für die es noch keine korrigierte Fassung gibt. Wir sind nicht angreifbar, weil Bild-Uploads über die Magic Bytes hart auf PNG und JPEG begrenzt sind und nur diese Dateien je in eine PPTX wandern. Sobald image-size nachzieht, greift das Override automatisch.
- `npm warn config production Use --omit=dev instead` im Railway-Log ist keine Störung: npm leitet die Warnung aus `NODE_ENV=production` ab und schreibt sie nach stderr, Railway färbt stderr rot ein.

## Vorregistrierung aus Listen (v1.25.0)

Für Kontakte aus dem eigenen Netzwerk, die persönlich über LinkedIn angesprochen werden und keinen individuellen Einladungslink bekommen.

**Ablauf.** Liste als XLSX oder CSV unter Experten → „Liste vorregistrieren" hochladen. Erwartete Spalten, Reihenfolge egal, E-Mail optional: Vorname, Nachname, E-Mail, Sprache, LinkedIn, Firma, Berufsbezeichnung, Quelle, Prio, Kanal, Letzter Kontakt. Die Plattform legt Datensätze mit Status `vorregistriert` an, ohne Konto und ohne Einwilligung. **Es geht keine Mail raus.** Anschließend schreiben Sie die Personen selbst an und schicken allen denselben Link `/mitmachen`.

**Dublettenprüfung** in dieser Reihenfolge: E-Mail gegen Konten und Profile, dann normalisierte LinkedIn-URL, dann Namensschlüssel. Ein Treffer wird nicht angelegt, sondern mit dem Status des vorhandenen Datensatzes gemeldet. Der Import ist beliebig oft wiederholbar. Das Ergebnis gibt es als CSV mit Vorname, Nachname, LinkedIn, Ergebnis, vorhandenem Status und Experten-ID.

**Zuordnung bei der Registrierung.** Meldet sich jemand über den allgemeinen Link an, sucht die Plattform den vorbereiteten Datensatz über dieselben drei Wege und übernimmt ihn, statt ein zweites Profil anzulegen. Bei mehreren Namenstreffern wird nicht geraten: Der Fall landet in der Warteliste „Zuordnung prüfen", wo Sie ihn mit einem Klick auflösen. Nach der Übernahme geht einmalig die Vorlage `profil_ergaenzen` raus, und im Dashboard steht ein Banner, bis drei Skills, ein Tagessatz und eine Verfügbarkeit hinterlegt sind.

**Kommandozeile** für große Listen oder den Lauf gegen die Produktion:

```
node server/scripts/vorregistrierung-import.js <datei.xlsx> [--ergebnis pfad.csv] [--probe]
```

`--probe` liest und prüft, schreibt aber nichts. Auf Railway über `railway run` starten, dann kommt die Datenbankverbindung aus der Umgebung und niemand muss Zugangsdaten weiterreichen.

**Datenschutz.** Vorbereitete Kontaktdaten stammen aus bestehenden geschäftlichen Verbindungen und stützen sich auf Art. 6 Abs. 1 lit. f DSGVO. Sie erhalten keine automatische Post: Verfügbarkeits-Erinnerung, Quartalscheck, Einladungszyklus und Consent-Job schließen den Status ausdrücklich aus. Ohne Registrierung werden die Datensätze nach 120 Tagen automatisch gelöscht (`VORREG_LOESCHFRIST_TAGE`, Job `vorreg-loeschfrist`, mit Audit-Eintrag). Der Einwilligungstext (Version `2026-09-v2`) nennt die Zusammenführung ausdrücklich; die juristische Prüfung steht aus. Auskunft nach Art. 15 und Löschung nach Art. 17 umfassen die Vorreg-Felder, weil beide auf dem vollständigen Datensatz arbeiten.

## Ansprache-Cockpit (v1.26.0)

Arbeitsfläche für die persönliche Ansprache über LinkedIn, erreichbar unter Ansprache. Von dort geht **keine** Mail raus, das ist Absicht.

- **Heute dran:** vorbereitete Kontakte, die noch nie angeschrieben wurden, sortiert nach Priorität und letztem Kontakt, begrenzt auf ein einstellbares Tagespensum. Ein Klick auf „heute" notiert das Datum, der LinkedIn-Link öffnet das Profil im neuen Tab.
- **Wiedervorlage:** angeschrieben, keine Reaktion, Frist abgelaufen (einstellbar, Standard zehn Tage). Wer reagiert hat, verschwindet.
- **Reaktion** je Kontakt in einem Schritt: offen, Interesse, später, Absage, keine Reaktion. „Später" setzt automatisch eine Wiedervorlage in 60 Tagen. Dazu eine interne Notizzeile.
- **Sammelaktion** für den Feierabend-Nachtrag: mehrere auswählen und mit einem Klick als angeschrieben notieren, wahlweise rückdatiert.
- **Auswertung:** Trichter von vorbereitet über angeschrieben, reagiert, registriert bis freigegeben, mit Antwort- und Registrierungsquote, aufgeschlüsselt nach Priorität, Kanal und Herkunftsliste.
- **Export** des gesamten Standes als CSV, passend zur eigenen Outreach-Liste.

Migration 0029, Route `/api/ansprache`, Test `v126.test.js`.

## Roadmap

Sprint 1 Expert Directory → 2 Verfügbarkeit + Erinnerungs-Loop → 3 Tagessätze → 4 Audit-Trail-UI → 5 Suche → 6 Projekte/Matching → 7 Kommunikation → 8 Vendor-Portal/Multi-Tenant → 9 KI (CV-Extraktion, Matching-Begründung). Details: `Rechercheberichte/Expertnetwork-Fable5-Bauprompt-2026-07-11.md`.
