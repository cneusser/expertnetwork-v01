/**
 * v1.6.0 — Plattformspezifische Datenschutzerklärung (Art. 13/14 DSGVO).
 * Bewusst KEINE Kopie fremder Erklärungen: Der Text beschreibt exakt die
 * Verarbeitungen DIESER Plattform. Für die Unternehmens-Webseite gilt
 * ergänzend https://www.phalanx.de/de/datenschutz.
 */
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import LegalFooter from '../components/LegalFooter';

const H = ({ children }) => <h2 style={{ fontSize: 17, color: 'var(--navy)', margin: '26px 0 8px' }}>{children}</h2>;

export default function Datenschutz() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px', lineHeight: 1.65, fontSize: 14.5 }}>
      <Logo />
      <h1 style={{ color: 'var(--navy)', margin: '18px 0 4px' }}>Datenschutzerklärung</h1>
      <p className="muted" style={{ color: 'var(--grey-400, #8a93a0)' }}>für die Plattform „Phalanx Expert Network“ · Stand: Juli 2026</p>

      <H>1. Verantwortlicher</H>
      <p>
        Phalanx GmbH · Helene-Lange-Str. 28 · 91056 Erlangen<br />
        Vertreten durch: Christian Neusser · Handelsregister: HRB 14306, Registergericht Fürth<br />
        Telefon: +49 9131 920 60 75 · E-Mail: neusser@phalanx.de
      </p>

      <H>2. Zweck der Plattform</H>
      <p>
        Das Phalanx Expert Network ist das private Experten- und Interim-Manager-Netzwerk der
        Phalanx GmbH. Zweck der Datenverarbeitung ist die Aufnahme in den Talentpool, die Pflege
        von Profil-, Verfügbarkeits- und Honorardaten sowie die Vermittlung auf passende Projekte
        und Mandate unserer Kunden.
      </p>

      <H>3. Verarbeitete Daten und Rechtsgrundlagen</H>
      <p>
        <strong>Expertenprofile (Talentpool):</strong> Stammdaten, Kontaktdaten, Qualifikationen,
        Karrierestationen, Dokumente (z. B. CV), Verfügbarkeiten und Tagessätze — auf Grundlage
        Ihrer ausdrücklichen, versionierten Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Die
        Einwilligung ist auf 24 Monate befristet und muss danach erneuert werden; sie ist
        jederzeit widerrufbar (Profilbereich, Abschnitt „Datenschutz“).
      </p>
      <p>
        <strong>Administrativ aufgenommene Kontakte:</strong> Werden Profile aus bestehenden
        Geschäftskontakten angelegt, informieren wir gemäß Art. 14 DSGVO per Einladungs-E-Mail;
        die aktive Nutzung setzt Ihre Einwilligung voraus. Erinnerungs-E-Mails versenden wir nur
        an Personen mit aktiver Einwilligung.
      </p>
      <p>
        <strong>Kunden- und Projektdaten:</strong> Firmen-, Ansprechpartner- und Projektangaben
        zur Anbahnung und Durchführung von Vermittlungen (Art. 6 Abs. 1 lit. b DSGVO).
      </p>
      <p>
        <strong>Konto und Sicherheit:</strong> E-Mail, Passwort (verschlüsselt als Hash),
        Anmelde- und Änderungsprotokolle (Audit-Log) zur Nachvollziehbarkeit und Missbrauchs-
        abwehr (Art. 6 Abs. 1 lit. b und f DSGVO).
      </p>
      <p>
        <strong>Cookies:</strong> Ausschließlich technisch notwendige Sitzungs-Cookies für die
        Anmeldung. Kein Tracking, keine Analyse- oder Werbe-Cookies.
      </p>

      <H>4. Empfänger und Auftragsverarbeiter</H>
      <p>
        Hosting und Datenbank: Railway (Rechenzentrum in der EU). E-Mail-Versand: Brevo
        (Sendinblue GmbH, EU). KI-gestützte CV-Auswertung: erfolgt nur, wenn Sie oder wir aktiv
        ein Dokument zur Analyse hochladen; Vorschläge werden erst nach menschlicher Bestätigung
        übernommen. Optionale Anmeldung über LinkedIn („Sign in with LinkedIn“): Dabei erhält
        LinkedIn Kenntnis von Ihrem Login; wir erhalten von LinkedIn nur Name, E-Mail-Adresse und
        Profil-Kennung — kein Zugriff auf Ihr LinkedIn-Profil. Freigegebene Profile werden
        projektbezogen und — sofern vereinbart — anonymisiert an anfragende Unternehmen
        weitergegeben.
      </p>

      <H>5. Speicherdauer</H>
      <p>
        Profildaten: für die Dauer Ihrer Einwilligung (24 Monate, verlängerbar). Nach Widerruf
        oder Ablauf wird das Profil gesperrt und anschließend gelöscht bzw. anonymisiert;
        gesetzliche Aufbewahrungspflichten bleiben unberührt. Audit-Einträge werden bei Löschung
        personenbezogen anonymisiert.
      </p>

      <H>6. Ihre Rechte</H>
      <p>
        Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
        Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Im
        Profilbereich können Sie Ihre Daten selbst als ZIP exportieren und Ihre Einwilligung
        widerrufen — die Löschung erfolgt dann ohne weitere Schritte. Zudem besteht ein
        Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde, z. B. dem Bayerischen Landesamt
        für Datenschutzaufsicht (BayLDA), Ansbach.
      </p>

      <H>7. Weitere Informationen</H>
      <p>
        Für die Unternehmens-Webseite der Phalanx GmbH gilt die dortige{' '}
        <a href="https://www.phalanx.de/de/datenschutz" target="_blank" rel="noreferrer">Datenschutzerklärung</a>.
        Impressum: <a href="https://www.phalanx.de/de/impressum" target="_blank" rel="noreferrer">phalanx.de/de/impressum</a>.
      </p>

      <p style={{ marginTop: 28 }}><Link to="/login">← Zur Anmeldung</Link></p>
      <LegalFooter />
    </div>
  );
}
