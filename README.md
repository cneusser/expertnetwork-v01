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
5. Optional — „Mit LinkedIn anmelden" (OIDC, nur Login/Verknüpfung bestehender Konten, kein Scraping):
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

## Roadmap

Sprint 1 Expert Directory → 2 Verfügbarkeit + Erinnerungs-Loop → 3 Tagessätze → 4 Audit-Trail-UI → 5 Suche → 6 Projekte/Matching → 7 Kommunikation → 8 Vendor-Portal/Multi-Tenant → 9 KI (CV-Extraktion, Matching-Begründung). Details: `Rechercheberichte/Expertnetwork-Fable5-Bauprompt-2026-07-11.md`.
