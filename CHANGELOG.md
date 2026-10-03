# Changelog

Versionsschema: v\<Major>.\<Sprint>.\<Patch>. Sprintabschluss endet auf .0, Korrekturen zählen den Patch hoch.

## v1.40.1 — Sag, was wirklich fehlt

Die Anbindung an Phalanx OS meldete „Discovery fehlgeschlagen (401)". Tatsächlich stand in `PHALANX_OS_BASE_URL` die Rücksprungadresse dieser Anwendung, also fragte ExpertNetwork die Discovery bei sich selbst ab. Mit „401" sucht man an der falschen Stelle, und zwar lange.

- Die Basis-Adresse wird jetzt geprüft, bevor überhaupt jemand gefragt wird. Zeigt sie auf diese Anwendung selbst oder enthält sie einen Pfad, steht genau das da, samt dem, was stattdessen hingehört.
- Die Verwaltungsseite zeigt den Hinweis über den Prüfknöpfen, nicht erst als Ergebnis eines Versuchs.
- Scheitert die Discovery doch, steht die abgefragte Adresse in der Meldung. Ohne sie sieht man nicht, dass die falsche Stelle gefragt wurde.
- Der Projektabgleich aus v1.39.0 nutzt dieselbe Basis und damit dieselbe Prüfung.

Eine Fehlermeldung, die nur den Statuscode nennt, ist eine halbe Fehlermeldung.

## v1.40.0 — Projektabgleich, Stufe 2 und 3: die Stunden

Was in Stufe 1 zugeordnet wurde, wird jetzt übergeben. Auf Knopfdruck und einmal täglich von allein, mit derselben Funktion: Ein zweiter Weg, der dasselbe anders macht, ist ein zweiter Weg, der anders kaputtgeht.

**Zur Form der Zeit, denn hier treffen zwei Welten aufeinander.** Phalanx OS führt Zeiten als Minuten an einem Tag, ExpertNetwork als Tage in einem Monat, weil die Interim-Abrechnung auf Tagessätzen beruht und hier niemand Stundenzettel schreibt. Aus 12,5 Tagen im September wird deshalb **ein** Eintrag über 6.000 Minuten, datiert auf den Monatsletzten, mit der Periode in der Beschreibung. Das sieht drüben grob aus, und das ist Absicht: Die Alternative wäre gewesen, die Tage auf Arbeitstage zu verteilen. Dann stünden in der Projektakte zwölf schöne Einträge, von denen kein einziger stimmt. Zahlen, die genauer aussehen als sie sind, richten mehr Schaden an als grobe Zahlen, denen man die Grobheit ansieht.

- **Wiederholsicher.** `extern_kennung` ist die Zeilennummer des Nachweises und ändert sich nie. Drüben entsteht daraus eine eindeutige `source_ref`, und eine zweimal gesendete Zeile aktualisiert den vorhandenen Eintrag, statt einen zweiten anzulegen. Die Absicherung liegt in der Datenbank der Gegenstelle, nicht in unserem Code: Eine Prüfung im Code lässt sich umgehen, eine Eindeutigkeit in der Tabelle nicht.
- **Ein abgerechneter Eintrag ist unantastbar.** Antwortet Phalanx OS mit 409, wird nichts verändert, der Grund steht am Nachweis und im Protokoll. Eine Rechnung, deren Positionen sich nachträglich ändern, ist schlimmer als eine fehlende Korrektur.
- **Gelöscht wird über die Schnittstelle nichts.** Eine zurückgenommene Zeile geht als null Minuten mit Stornovermerk hinaus. Sonst fehlte in der Abrechnung eine Position, die jemand schon gesehen hat.
- **Kein Klarname, keine Mailadresse, kein Honorarsatz.** Nach drüben geht ein Kürzel aus drei Buchstaben des Vor- und Nachnamens: Martin Schumacher wird MARSCH. Einmal vergeben, bleibt es, auch bei Namenswechsel, denn drüben hängen Zeiteinträge daran. Das Kürzel ist pseudonym, nicht anonym, und das ist nötig: Sonst könnte in der Projektakte niemand mehr sagen, wessen Stunden das sind.
- Die Nutzlast wird **vor jedem Versand** gegen die echten Daten dieses Experten geprüft, nicht gegen eine erfundene Liste. Ein Feld, das jemand in zwei Jahren gutgemeint ergänzt, fällt damit sofort auf, statt still mitzureisen.
- Offene Nachweise gehen nicht hinaus. Was der Experte noch bearbeitet, hat in einer fremden Projektakte nichts verloren.
- Der Tageslauf schickt nur, was sich geändert hat, und ein einzelner Fehlschlag bricht ihn nicht ab.

Offen bleibt bewusst: Tagesgenaue Erfassung. Sollte sie kommen, ändert sich nur der Erzeuger der Nutzlast, die Wiederholsicherheit bleibt wie sie ist.

## v1.39.0 — Projektabgleich mit Phalanx OS, Stufe 1: die Zuordnung

Phalanx OS ist die führende Akte für Projekte, Nummern, Zeiten und Abrechnung. ExpertNetwork führt Experten, Anfragen und Mandate. Was fehlte, war die Verbindung: Ein Mandat gehört fast immer zu einem Projekt, das drüben geführt wird.

Diese Stufe stellt nur die Zuordnung her. Noch werden keine Stunden übergeben. Allein eine saubere Zuordnung ist schon die halbe Miete, und sie lässt sich prüfen, bevor Zahlen fließen.

- Die Projektnummer sitzt **am Mandat**, nicht am Experten. Ein Experte arbeitet im Lauf der Zeit für mehrere Projekte, am Experten wäre die Nummer schon beim zweiten Mandat falsch.
- Ausgewählt statt abgetippt. Die Liste kommt aus Phalanx OS, gruppiert nach Kategorie (Kapitalisierung 10, StartUp 20, Beratung 30, Akademie 40).
- **Abgeschlossene Projekte bleiben wählbar**, gekennzeichnet. Nachträgliche Stunden auf ein abgeschlossenes Projekt kommen vor und sollen nicht daran scheitern, dass das Projekt aus der Auswahl verschwunden ist.
- Beim Speichern wird die Nummer gegen Phalanx OS geprüft. Eine unbekannte Nummer wird abgewiesen und drüben **nicht angelegt**. Wer hier Nummern erfände, hätte am Ende zwei Projektverzeichnisse, die sich widersprechen.
- Projektname, Kategorie und Phase gehören Phalanx OS. Sie werden angezeigt, aber nicht kopiert: Eine Kopie wäre nach der ersten Umbenennung drüben falsch, und niemand würde es merken.
- Konnte nicht geprüft werden, wird nicht gespeichert. Eine ungeprüfte Nummer sieht aus wie eine geprüfte, und genau das wäre das Problem. Der Grund steht am Mandat.
- Lösen geht immer, auch bei gestörter Verbindung. Eine falsche Zuordnung muss man zurücknehmen können.
- Fällt Phalanx OS aus, bleibt die Abrechnung benutzbar. Dann steht nur die Nummer da statt Nummer und Name. Eine Abrechnungsübersicht darf nicht ausfallen, weil ein fremdes System hustet.
- Der Schlüssel (`PHALANX_OS_API_KEY`) steht ausschließlich in der Umgebung, wird nie protokolliert und taucht in keiner Antwort und keiner Fehlermeldung auf. Ein abgelehnter Schlüssel hinterlässt einen Protokolleintrag, denn das ist der Fall, bei dem jemand nachsehen muss.

Getrennt von der Datenpool-Anbindung aus v1.32.0: Der Pool läuft über OIDC mit Client-Geheimnis, der Projektabgleich über einen Bearer-Schlüssel. Zwei Verfahren, zwei Dateien. In einer Datei stünden zwei Arten von Geheimnis nebeneinander, und spätestens beim Protokollieren verwechselt das jemand.

## v1.38.1 — Lesbar auf dunklem Grund

Mit v1.34.0 sind die Außenseiten auf die dunkle Bühne gezogen. Ein paar Stellen hatten ihre Farben aber fest verdrahtet und färbten weiter für hellen Grund. Das Ergebnis war heller Text auf hellem Kasten und dunkelblaue Schrift auf dunkelblauem Grund.

- Der Kasten „Assoziierte Partner" auf der Anmeldeseite hatte seinen hellen Grund fest gesetzt, die Schrift aber von der dunklen Karte geerbt. Er war schlicht nicht zu lesen.
- **Der Einwilligungstext im Einladungsassistenten ebenfalls.** Das war der schwerwiegendste Fall: Ein Text, dem jemand zustimmen soll, muss lesbar sein, sonst ist die Zustimmung keine.
- Die Knöpfe „Mit Phalanx OS anmelden", „Später" im Einladungsassistenten und der Zweitknopf auf der Verfügbarkeitsseite standen in Navy auf Navy.
- Der Sprachumschalter DE/EN zeigte die gerade aktive Sprache dunkel auf dunkel, also genau die, die man sehen wollte.
- Die Zeile „Phalanx GmbH · Impressum · Datenschutz" stand rechts neben der Anmeldekarte statt darunter. Die Fläche war als Reihe gesetzt, und die Fußzeile ist ein Geschwister der Karte.
- Überschriften auf der Kundenregistrierung und der Kapitalpartnerseite waren aus demselben Grund unsichtbar.

Statt weiter Farben in einzelne Bausteine zu schreiben, gibt es jetzt drei Klassen, die hell und dunkel beide kennen: `hinweis-kante`, `lesetext` und `btn-zweitrangig`. Neue Seiten erben das, ohne dass jemand daran denken muss.

## v1.38.0 — Der Bericht: was über die Zeit passiert

Jeder Bereich hatte seine eigenen Zahlen. Das Dashboard den Pool, das Ansprache-Cockpit den Trichter, die Abrechnung den Umsatz. Was fehlte, war der Blick über die Zeit. Ob ein Netzwerk wächst, sieht man nicht an einem Stichtag, sondern an der Reihe der Monate.

- Neuer Bereich „Bericht" mit vier Ebenen in der Reihenfolge, in der das Geschäft entsteht: Netzwerk (wer kommt dazu), Ansprache (wer wird angesprochen, wer antwortet), Nachfrage (Anfragen, vorgelegte Profile, Rückmeldungen), Geschäft (Mandate, Umsatz, Marge).
- Zeitraum frei wählbar bis 24 Monate zurück, ohne Angabe die letzten sechs Monate.
- Verglichen wird der letzte volle Monat gegen den davor. Der laufende Monat taugt nicht zum Vergleich, er ist ja noch nicht vorbei.
- **Nullen bleiben stehen.** Ein Monat ohne Mandat ist ein Ergebnis und keine Lücke, die man verstecken müsste. In der Aufbauphase ist eine ehrliche Null aussagekräftiger als eine geschönte Kennzahl, und der Bericht sagt das auch so.
- Der Bericht als einseitiges PDF im Haus-Look, passend zu den Belegen aus v1.23.0. Ein Bericht, den man nicht in zwei Minuten überblickt, wird nicht gelesen.
- Storniertes bleibt draußen, Gutschriften an Experten gelten als Auszahlung, die Differenz ist die Marge. Alle Beträge in Cent, wie überall.
- Rechnung und Darstellung sind getrennt: `baueBericht()` ist eine reine Funktion, die JSON-Route und PDF-Export gemeinsam nutzen. So kann keine Ansicht andere Zahlen zeigen als die andere.
- Zeitzonen: Monate werden in Ortszeit gebildet. Über `toISOString` gerechnet rutscht der Monatserste in jeder Zeitzone östlich von UTC in den Vormonat, und dann steht ein Ereignis vom 1. Oktober im September. Bei einem Monatsbericht ist das genau der Fehler, den niemand bemerkt und der trotzdem alle Zahlen verschiebt.

## v1.37.0 — Die Nachfrageseite: Kunden verwalten

Beim Blick in den Bestand fiel etwas auf, das niemandem auffallen konnte, solange sich kein Kunde registrierte: Ein Kundenkonto entsteht mit `is_approved = false`, und das Kundenportal weist es genau deshalb ab. Freigeben ließ es sich nirgends. Wer sich angemeldet hätte, wäre auf unbestimmte Zeit ausgesperrt gewesen.

- Neuer Bereich „Kunden" mit Verzeichnis und Akte. Bisher gab es Kundenkonten, Kundenprofile, Kundenprojekte und Kundenrechnungen, aber keine Stelle, an der man seine Kunden sieht.
- **Freigabe und Sperre**, der Teil der komplett fehlte. Beim Freischalten bekommt der Kunde eine Nachricht, denn er wartet darauf.
- Wer wartet, steht ganz oben: auf der Kundenseite, auf dem Dashboard und als Mail ans Büro, sobald sich jemand registriert.
- Die Akte bündelt, was verstreut lag: Stammdaten und Ansprechpartner, eingereichte Anfragen, vorgelegte Profile samt Rückmeldung des Kunden, laufende Mandate und gestellte Rechnungen mit Umsatz und offenem Betrag.
- Beträge bleiben durchgehend in Cent und werden erst für die Anzeige umgerechnet.
- Stammdaten lassen sich pflegen, wenn am Telefon etwas Neues gesagt wird.
- Route `/api/kunden`, Test `v137.test.js`, darunter der ganze Weg von der Registrierung über die Freigabe bis ins Portal.

## v1.36.0 — Die Art.-14-Frist rechnet mit

Die Monatsfrist aus Art. 14 Abs. 3 DSGVO stand bisher nur im Wochenplan. Ein Dokument rechnet aber nicht mit, und 766 Kontakte mit je eigener Frist behält niemand im Kopf.

- Neuer Reiter „Frist" im Ansprache-Cockpit, dazu ein Hinweis ganz oben, sobald etwas ansteht. Angezeigt werden: wie viele informiert sind, wie viele noch offen, wie viele Fristen bereits abgelaufen sind, wann die nächste und die letzte endet, und wie viele Nachrichten je Arbeitstag nötig wären.
- Die Einschätzung rechnet gegen das eingestellte Tagespensum und sagt klar, ob es reicht, knapp wird oder nicht ausgeht. Arbeitstage zählen ohne Wochenenden.
- Wer angeschrieben wurde, gilt als informiert und zählt nicht mehr mit, denn der Datenschutz-Baustein steht in der Nachricht.
- Wenn die Zeit nicht reicht, gibt es den bewussten Verzicht: Kontakte einer Gruppe ansehen und löschen. Das passiert nur nach ausdrücklicher Bestätigung, erfasst nie jemanden mit bereits verschickter Nachricht und erzeugt keinen Eintrag auf der Merkliste. Diese Menschen sind nicht unerwünscht, es fehlt nur die Zeit, und ein späterer Import soll möglich bleiben.
- Die Rechnung trifft bewusst keine Rechtsauskunft und löscht nichts von allein. Beides steht als Hinweis dabei.
- Neue Datei `utils/artikel14.js`, Routen unter `/api/ansprache/frist`, Test `v136.test.js`.

## v1.35.0 — Niemand steht mehr vor der Wand

Anlass war ein Kontakt, der über LinkedIn angesprochen wurde, ein Konto aus dem Einladungs-Upload hatte, aber nie ein Passwort. Auf der Anmeldeseite las er nur „E-Mail oder Passwort falsch". Von den eingeladenen Kontakten geht es 185 Menschen genauso, sobald sie es versuchen.

- „Passwort vergessen" unterscheidet jetzt zwei Fälle: Wer ein Passwort hatte, bekommt weiterhin den Reset-Link. Wer eingeladen wurde und nie eingewilligt hat, bekommt die Einladung, denn nur über sie kommt die Einwilligung zustande. Ein Reset-Link hätte sie übersprungen. Die Antwort nach außen bleibt in beiden Fällen dieselbe, damit niemand herausfinden kann, welche Adressen existieren.
- Die Seite heißt deshalb jetzt „Zugang anfordern" und benennt beide Fälle.
- Auf der Anmeldeseite steht ein dauerhaft sichtbarer Hinweis für Eingeladene, unabhängig von der Eingabe. Auch er verrät nichts über vorhandene Adressen.
- Neue Übersicht in der Expertenliste: wer eingeladen wurde und nicht hineinkommt, sortiert nach Wartezeit, mit Sammelaktion „Einladung erneut senden" für bis zu fünfzig auf einmal. Wer bereits eingewilligt hat, wird übersprungen.
- Ob jemand ein eigenes Passwort hat, wird über das Audit-Log bestimmt und nicht über den Passwort-Hash. Beim Einladen wird ein echter bcrypt-Hash über einen Zufallswert gesetzt, am Hash ist also nichts abzulesen.
- Test `v135.test.js`, darunter der ganze Weg vom Feststecken bis zur erfolgreichen Anmeldung. Dazu ein zeitabhängiger Test aus v1.33.0 entschärft, der je nach Tageszeit kippte.

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
