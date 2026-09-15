# Changelog

Versionsschema: v\<Major>.\<Sprint>.\<Patch>. Sprintabschluss endet auf .0, Korrekturen zählen den Patch hoch.

## v1.28.0 — Dashboard zeigt, was zuletzt passiert ist

- Drei neue Listen auf dem Admin-Dashboard, je fünf Einträge, jeder anklickbar bis in die Expertenakte: neu dazugekommen, Verfügbarkeit aktualisiert, Profil angepasst.
- Bei „neu dazugekommen" zählt der Tag, an dem jemand wirklich dazugehört. Wer aus der Ansprache übernommen wurde, erscheint mit dem Datum der Zusammenführung statt mit dem Importdatum, und ist als „aus der Ansprache" gekennzeichnet.
- Bei „Profil angepasst" steht in jeder Zeile, was geändert wurde und ob die Person selbst gehandelt hat oder das Büro.
- Die Kennzahlen oben zählen nur noch Menschen mit eigenem Konto. Vorbereitete und eingeladene Kontakte stehen getrennt darunter, mit Weg zur Ansprache. Vorher liefen die 766 vorbereiteten Kontakte in „Einwilligung fehlt" und ließen den Pool voller aussehen, als er ist.
- Die Kennzahlen brauchten bisher über 2000 Datenbankabfragen je Aufruf, jetzt sind es fünf.
- BUGFIX: Ein Profil ließ sich nicht mehr löschen, sobald für die Person einmal ein Capitalmatch-Übergabelink erzeugt worden war. Das betraf die Art.-17-Löschung ebenso wie die 120-Tage-Frist für vorbereitete Kontakte. Der Fehler kam mit v1.27.0 und wäre erst in einigen Wochen aufgefallen.
- BUGFIX: Der Löschfrist-Job brach beim ersten Datensatz ab, der sich nicht löschen ließ, und alle folgenden Löschungen fielen still aus. Jetzt wird einzeln aufgeräumt, Fehlschläge werden protokolliert und im Ergebnis ausgewiesen.
- Test `v128.test.js`, dazu zwei Testdateien gegen Störungen aus der gemeinsamen Testdatenbank abgesichert.

## v1.27.1 — Capitalmatch-Domain bestätigt

- `CAPITALMATCH_URL` steht jetzt standardmäßig auf `https://www.capitalmatch.de`, die Adresse ist geprüft und gehört zur Phalanx GmbH. Die Variable überschreibt den Standard weiterhin.

## v1.27.0 — Übergabe an Capitalmatch

- Zielgruppe je Kontakt (Interim, CFO, Nachfolger) direkt in der Arbeitsliste.
- Für Nachfolger erzeugt ein Klick einen Übergabelink für Capitalmatch. In der URL steht ausschließlich eine Zufallskennung, Name, Firma und Position holt Capitalmatch server-zu-server mit gemeinsamem Schlüssel ab. Sieben Tage gültig, erneuter Aufruf liefert den schon verschickten Link zurück.
- Capitalmatch meldet die erfolgte Registrierung zurück, der Kontakt steht dann in der Ansprache auf Interesse.
- Ohne gesetzten `HANDOVER_KEY` ist die Maschinenstrecke geschlossen, nicht offen. Schlüsselvergleich in konstanter Zeit.
- Neuer Reiter „Capitalmatch" mit Stand je Übergabe: verschickt, geöffnet, registriert, abgelaufen.
- Migration 0031, Route `/api/handover` und `/api/ansprache/...`, Test `v127.test.js`. Gegenstelle in phalanx-v01 folgt.

## v1.26.1 — Kontakte aus der Ansprache nehmen

- Neben jedem Kontakt in der Arbeitsliste ein Symbol „aus der Ansprache nehmen", mit Grund. Die Person verschwindet aus allen Listen, der Datensatz bleibt.
- Eine schlanke Merkliste („Nicht ansprechen") überlebt das Löschen des Profils und filtert künftige Importe. Sie enthält nur, was zum Wiedererkennen nötig ist, und dient allein dazu, jemanden nicht zu kontaktieren.
- Jeder Ausschluss ist mit einem Klick zurücknehmbar, dann taucht der Datensatz wieder auf.
- Aktive Konten (registriert, freigegeben) lassen sich hier nicht herausnehmen, dafür gibt es die Ausschlussliste in der Expertenakte.
- Ausgeschlossene zählen im Trichter gesondert und verzerren die Quoten nicht mehr. Migration 0030.

## v1.26.0 — Ansprache-Cockpit

- Arbeitsliste für die persönliche Ansprache: „Heute dran" nach Priorität und Tagespensum, „Wiedervorlage" nach einstellbarer Frist, Reaktionen in einem Klick, interne Notiz, Sammelaktion für den Nachtrag.
- Trichter mit Antwort- und Registrierungsquote, aufgeschlüsselt nach Priorität, Kanal und Herkunftsliste. CSV-Export des gesamten Standes.
- Aus dem Cockpit geht keine Mail raus, mit Test abgesichert.
- Datenschutzerklärung um die Vorregistrierung ergänzt: Kategorien, berechtigtes Interesse nach Art. 6 Abs. 1 lit. f, Art.-14-Information bei der ersten Ansprache, Zusammenführung, 120-Tage-Löschung, Widerspruchsrecht. Speicherfristen für eingeladene Kontakte und Abrechnungsbelege ergänzt.
- Migration 0029, Route `/api/ansprache`, Test `v126.test.js`.

## v1.25.2 — Eingeladene laufen über den allgemeinen Link nicht mehr vor eine Wand

- Wer schon eingeladen wurde, aber nie ein Passwort vergeben hat, bekam bei der Registrierung über `/mitmachen` nur ein „E-Mail-Adresse bereits registriert". Jetzt geht die Einladung noch einmal raus, mit einem klaren Hinweis aufs Postfach. Wer die Einladung angenommen hat, bekommt weiterhin die eindeutige Abfuhr.

## v1.25.1 — Fehlerhafte Spaltenerkennung im Einladungs-Upload

- BUGFIX: Das Muster für den Nachnamen traf auch auf „vorname" zu, dadurch lasen Vor- und Nachname dieselbe Spalte. Betroffene standen als „Achim Achim" in der Liste. Die Muster sind jetzt verankert.
- Der Einladungs-Upload lehnt Dateien ab, die nach einer Vorregistrierungsliste aussehen (Spalten LinkedIn, Prio, Kanal, Quelle), bevor Einladungsmails rausgehen.
- Neu: „Import reparieren". Dieselbe Datei noch einmal hochladen, Namen werden richtiggestellt, Firma, Position und LinkedIn nachgetragen. Auf Wunsch wird der Einladungszyklus gestoppt. Es geht keine Mail raus.

## v1.25.0 — Vorregistrierung aus Kontaktlisten

- Neuer Status `vorregistriert`: vorbereitete Kontakte ohne Konto und ohne Einwilligung, für Menschen, die persönlich über LinkedIn angesprochen werden.
- Import als XLSX oder CSV über die Expertenliste oder über `server/scripts/vorregistrierung-import.js`. Dublettenprüfung über E-Mail, normalisierte LinkedIn-URL und Namensschlüssel, beliebig oft wiederholbar, Ergebnis als CSV.
- Zusammenführung bei der Selbstregistrierung über denselben Dreiklang. Genau ein Datensatz je Person. Mehrdeutige Namen kommen in die Warteliste „Zuordnung prüfen", statt geraten zu werden.
- Registrierungsformular fragt jetzt Vorname, Nachname und freiwillig das LinkedIn-Profil ab.
- Willkommensbanner im Dashboard und einmalige Mail `profil_ergaenzen` nach der Übernahme.
- Aufbewahrungsfrist von 120 Tagen (`VORREG_LOESCHFRIST_TAGE`) als Scheduler-Job, alle Regelmails schließen Vorregistrierte ausdrücklich aus.
- Einwilligungstext auf Version `2026-09-v2`, ergänzt um die Zusammenführung vorbereiteter Kontaktdaten.
- Migration 0028, neue Helfer `utils/normalisieren.js` und `utils/vorregistrierung.js`, Test `vorregistrierung.test.js`.

## v1.24.2 — Anmeldung für importierte Konten

- Anmeldung, Passwort-Reset und Registrierung vergleichen E-Mail-Adressen ohne Rücksicht auf Groß- und Kleinschreibung.
- Migration 0027 normalisiert vorhandene Adressen. Ein Passwort-Reset bestätigt zugleich die Adresse.
- Kontostatus und Knopf „Zugangslink senden" in der Expertenakte.

## v1.24.1 — Sicherheitsupdate der Abhängigkeiten

- multer 2.2.0, node-cron 4.6.0, xlsx 0.20.3 vom SheetJS-CDN, Overrides für brace-expansion und image-size.

## v1.24.0 — Dokumentenpflege und Quartalscheck

- Dokumente löschbar, verwaiste Einträge sichtbar und aufräumbar, Quartalscheck „Profil noch aktuell?".

## v1.23.0 — Abrechnung I

- Mandate, Leistungsnachweise, Gutschriften und Rechnungen als PDF, Kennzahlen und Buchhaltungs-Export.

Ältere Stände: siehe Git-Tags ab `v0.5.0`.
