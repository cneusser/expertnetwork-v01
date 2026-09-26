# Changelog

Versionsschema: v\<Major>.\<Sprint>.\<Patch>. Sprintabschluss endet auf .0, Korrekturen zählen den Patch hoch.

## v1.34.2 — Logo gestapelt auf den Kartenseiten

- Auf der Anmeldung und allen übrigen Kartenseiten steht das Logo jetzt in seiner Originalform, also Blüte über der Wortmarke, mittig auf der Karte. Der Kopf der Anmeldung führt deshalb nur noch die Terminvereinbarung, sonst stünde die Marke zweimal da.
- Die Landingpages und die Kopfzeile der Anwendung behalten die quere Form mit dem Signet links, dort passt gestapelt nicht hin.
- Zentriert wird nur das Logo, nicht der Text. Auf Seiten wie Datenschutz stehen lange Absätze in derselben Karte, und zentrierter Fließtext liest sich schlecht.

## v1.34.1 — Das Original-Logo statt eines Nachbaus

- Der nachgezeichnete Blüten-Nachbau aus v1.34.0 ist raus. Verwendet wird jetzt die Originaldatei aus der Illustrator-Vorlage, unverändert.
- Drei Fassungen in `client/public`: das gestapelte Logo auf weißem Grund, dasselbe freigestellt (nur das äußere Weiß ist transparent, der weiße Kreis in der Blütenmitte bleibt erhalten) und das Signet allein für schmale Leisten.
- Auf dunklem Grund sitzt das Logo in einem hellen Feld, statt umgefärbt zu werden. Die Wortmarke ist anthrazit und wäre auf Navy nicht lesbar, und ein umgefärbtes Logo ist kein Logo mehr. phalanx.de löst es genauso.

## v1.34.0 — Marke: Logo, Phalanx-Look, Umschalter

- Das Logo ist jetzt echt vorhanden, als SVG statt als Textzeile: Signet mit den sechs Blütenblättern auf der geschliffenen Scheibe, daneben die Wortmarke in Kapitälchen. Scharf in jeder Größe, ohne zusätzlichen Netzaufruf, in einer hellen und einer dunklen Variante.
- Die Palette und die Schriftwahl kommen eins zu eins von phalanx.de und capitalmatch.de: `--pxl-navy`, `--pxl-gold`, `--pxl-papier` und die übrigen, Georgia für Überschriften, der goldene Kicker in Versalien. Die bisherigen Variablennamen zeigen jetzt auf diese Palette, deshalb bricht nichts.
- Alle Außenseiten laufen über den gemeinsamen Container und stehen damit auf der dunklen Phalanx-Bühne: Anmeldung, Mitmachen, Registrierung, Einladung, Partner, Kapitalpartner, Bewertung, Datenschutz und die öffentlichen Projektseiten.
- Die Arbeitsflächen bleiben bewusst hell. Tabellen und Formulare liest man dort stundenlang, und dafür taugt eine Marketing-Bühne nicht. Gemeinsam sind Logo, Farben und die Schrift der Überschriften.
- Markenumschalter unten links, auf jeder Seite: phalanx.de, christian-neusser.de, CapitalMatch und Expert Network, der aktuelle hervorgehoben.
- Terminvereinbarung ist überall erreichbar: im Kopf der Außenseiten, am Fuß der Landingpages und in der Kopfzeile der Anwendung.

## v1.33.0 — Verfügbarkeit: fragen, wenn es etwas zu fragen gibt

Aufgefallen an einer Akte mit fünf identischen Bestätigungen im Abstand von genau zwei Wochen. Der Experte hatte „verfügbar ab 1.10." gemeldet und konnte jedes Mal nur dasselbe antworten.

- Die Erinnerung richtet sich nicht mehr nach dem Kalender, sondern nach dem Aussagewert der Angabe. Wer ein Datum in der Zukunft nennt, wird eine Woche vor diesem Termin gefragt und nicht alle vierzehn Tage. Ist der Termin erreicht oder vorbei, wird gefragt, denn dann ist offen, ob die Person wirklich frei ist.
- „Sofort" und „teilweise" altern weiter in vierzehn Tagen, weil sie etwas über heute sagen. „Ausgebucht" ändert sich selten und altert in dreißig Tagen.
- Ein Deckel von neunzig Tagen sorgt dafür, dass auch ein Termin weit in der Zukunft nicht dazu führt, dass ein Profil einschläft.
- Der Frische-Score kennt dieselbe Regel. Wer aus gutem Grund nicht gefragt wird, gilt nicht plötzlich als „nicht bestätigt" und verschwindet damit aus „Verfügbar jetzt". Die alte Aufrufform bleibt unverändert gültig.
- In der Expertenakte werden aufeinanderfolgende identische Angaben zu einer Zeile zusammengefasst, mit allen Bestätigungsdaten daneben. Fünf gleiche Zeilen waren keine Historie, sondern Rauschen. Ein echter Wechsel bleibt eine eigene Zeile.
- Neue Datei `utils/verfuegbarkeit.js` als gemeinsame Regel für Job, Frische-Score, Suche und Matching. Test `v133.test.js`.

## v1.32.0 — Anbindung an Phalanx OS, Teil A

- **Anmeldung über Phalanx OS** für Admin- und Staff-Konten: Authorization Code Flow mit PKCE (S256), vollständige Prüfung des ID-Tokens gegen `jwks_uri` inklusive Aussteller, Empfänger, Ablauf und Einmalkennung. Ohne neue Abhängigkeit gebaut, weil `openid-client` v6 reines ESM ist und der Server CommonJS. Verknüpft wird über `sub`, nie über die E-Mail. Neue Konten entstehen über diesen Weg nicht, und die Rolle hier gilt, nicht die in Phalanx OS. Die Experten-Registrierung bleibt unverändert.
- **Datenpool-Abgleich** alle 30 Minuten (`PHALANX_SYNC_INTERVALL_MIN`, 0 schaltet ab), mit `updated_since`-Polling je konfiguriertem Tag. Die Dublettenprüfung ist dieselbe, die Listenimport und Selbstregistrierung schon nutzen, deshalb entstehen keine Duplikate zwischen den Wegen. Treffer werden ergänzt, nie überschrieben. Unbekannte kommen als `vorregistriert` mit Quelle `phalanx-pool` an, mehrdeutige Namen in die Warteliste „Zuordnung prüfen". Gelöscht wird nichts.
- **Rückmeldung** der Ankünfte per idempotentem Upsert mit `source_id`. Als Job statt als Haken an jeder Statuswechselstelle, damit keine vergessen wird. Fehler bleiben in der Warteschlange und blockieren nie einen Nutzerfluss.
- **Werbeeinwilligung nach § 7 UWG** zentral im Mail-Wrapper geprüft, nicht in einzelnen Jobs. Automatisierte Post an Adressen ohne Einwilligung wird abgewiesen und in der Outbox mit Status `gesperrt` protokolliert. Einzelkorrespondenz und transaktionale Mails gehen weiter durch. Der Listenimport setzt die Sperre ebenfalls, mit der Registrierung fällt sie.
- Kontakte aus dem Pool nimmt der Einladungszyklus vom automatischen Löschen aus, weil das CRM sie als führende Quelle weiterführt.
- Verwaltungsseite mit Verbindungsprüfung, Zahlen je Tag-Segment, Knopf „Jetzt synchronisieren" und Lauf-Protokoll. Kennzeichen „Phalanx-Netzwerk" in der Expertenliste.
- Der Scheduler kann jetzt auch Intervalljobs, bisher gab es nur den Tageslauf um 06:00.
- Migration 0034, Modul `server/sync/phalanxpool.js`, Test `v132.test.js` gegen Fixtures statt gegen das Netz. README-Abschnitt ergänzt.

## v1.31.0 — Kapitalpartner

Rückmeldung aus der Ansprache: Ein Kontakt sieht sich nicht als Interim Manager, möchte aber als Finanzierer ins Netzwerk. Für diese Rolle passte bisher nichts.

- Eigener Bereich „Kapitalpartner" mit eigener Tabelle. Keine Tagessätze, keine Verfügbarkeitsschleife, keine Profil-Erinnerung, keine automatischen Mails. Ein Leasinghaus ist immer verfügbar.
- Öffentliche Seite unter `/kapitalpartner` in Sie-Form, mit einer Erfassungsmaske, die zu Finanzierern passt: Finanzierungsarten, Objektarten, Branchen, Volumenbereich, Entscheidungsdauer.
- Das entscheidende Feld ist die Bonitätslage: normal, schwach, laufende Sanierung, StaRUG, Eigenverwaltung, Insolvenz. Fast jeder finanziert gute Bonität. Wertvoll für Sanierungsmandate sind die, die weitergehen, und genau danach lässt sich filtern.
- Verzeichnis im Admin mit Filtern nach Bonitätslage, Finanzierungsart, gesuchtem Betrag und Volltext über Objekte und Branchen. Die Volumensuche berücksichtigt offene Grenzen.
- Kennzahl „Finanzieren auch im Verfahren", weil das die Zahl ist, die im Ernstfall zählt.
- Knopf „Zu Kapitalpartner machen" in der Expertenakte. Der Kontakt wandert herüber, wird aus der Interim-Ansprache genommen und bekommt die Zielgruppe `kapitalpartner`. Das Expertenprofil bleibt bestehen, gelöscht wird nichts.
- Migration 0033, Route `/api/kapitalpartner`, öffentliche Route `/api/public/kapitalpartner-bewerbung`, Test `v131.test.js`.

## v1.30.0 — Tagessätze ändern, ohne zu suchen

Rückmeldung aus der Praxis vom ersten Experten im Self-Service: Tagessatz eintragen gewollt, „Bearbeiten" gesucht, nicht gefunden.

- Die Tagessatz-Übersicht zeigt jetzt getrennt, was aktuell gilt und was Historie ist. Vorher standen beide Gruppen ununterscheidbar in einer Tabelle.
- Neben jedem geltenden Satz ein Knopf „ändern". Er belegt das Formular mit den bisherigen Werten vor und springt dorthin. Ein Satz darüber erklärt, dass Sätze nie überschrieben, sondern fortgeschrieben werden und es deshalb kein Bearbeiten gibt.
- Frühere Sätze sind eingeklappt, die Übersicht bleibt ruhig.
- Wer noch keinen Satz hat, liest das jetzt im Klartext samt Grund, statt eine leere Tabelle zu sehen.
- Das Formular ist zweisprachig, bisher war es nur deutsch, obwohl die Seite umschaltbar ist.
- Die fehlenden Bausteine auf dem Experten-Dashboard sind anklickbar und führen direkt an die richtige Stelle. Dazu Sprungmarken für Kurzprofil, Skills, Dokumente, Ausbildung, Stationen und Tagessätze.

## v1.29.0 — Ansprache: Erfolge sichtbar, Nachfolger vorgeschlagen

- BUGFIX: Die Auswertung zählte nur die vorbereiteten Kontakte, die Arbeitsliste aber auch die eingeladenen. Wer aus der eingeladenen Gruppe ankam, tauchte nirgends als Erfolg auf. Der Trichter stand auf null, während auf dem Dashboard neue Profile erschienen. Die Herkunft aus der Ansprache steht jetzt in einem eigenen Feld und überlebt den Statuswechsel beim Ankommen. Migration 0032 trägt sie für alle bestehenden Kontakte nach.
- Neuer Reiter „Angeschrieben": alle, bei denen Du schon warst, neueste zuerst, mit Reaktion, Notiz und dem Vermerk, wer inzwischen angekommen ist. Das Datum lässt sich dort korrigieren.
- Neuer Reiter „Mögliche Nachfolger": Die Plattform durchsucht Position, Kurzprofil und Firmenname nach Hinweisen auf eine Nachfolgeabsicht und legt eine Vorschlagsliste vor. Neben jedem Namen steht das Wort, das den Vorschlag ausgelöst hat. Gesetzt wird nichts, die Zielgruppe entscheidest Du je Person.
- Auswertung zusätzlich nach Zielgruppe aufgeschlüsselt.
- In der Expertenakte steht jetzt, ob und wann die Person über LinkedIn angesprochen wurde, mit Reaktion, Wiedervorlage, Priorität, Herkunftsliste und der internen Notiz.
- Test `v129.test.js`.

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
