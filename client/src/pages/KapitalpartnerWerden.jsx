/**
 * v1.31.0 — Öffentliche Seite "Kapitalpartner".
 *
 * Eigene Landingpage, weil die Ansprache eine andere ist als beim Expertennetz.
 * Hier wirbt niemand um ein Mandat, hier bietet jemand Geld an. Deshalb Sie-Form,
 * deshalb kein Wort über Tagessätze oder Verfügbarkeit, und deshalb steht die
 * Bonitätsfrage im Mittelpunkt: Wer auch im Verfahren noch finanziert, ist für
 * unsere Mandate mehr wert als zehn Häuser, die nur gute Bilanzen mögen.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, ShieldCheck, Timer } from 'lucide-react';
import Logo from '../components/Logo';
import LegalFooter from '../components/LegalFooter';
import { api } from '../api/client';
import { TerminKnopf } from '../components/MarkenUmschalter';

const FINANZIERUNG = {
  leasing: 'Leasing',
  mietkauf: 'Mietkauf',
  sale_and_lease_back: 'Sale and lease back',
  factoring: 'Factoring',
  working_capital: 'Working Capital',
  darlehen: 'Darlehen',
  mezzanine: 'Mezzanine',
  beteiligung: 'Beteiligung',
  buergschaft: 'Bürgschaft',
};

const BONITAET = {
  normal: 'Normale Bonität',
  schwach: 'Schwache Bonität, noch kein Verfahren',
  sanierung: 'Laufende Sanierung, Gutachten nach IDW S6',
  starug: 'Restrukturierung nach StaRUG',
  eigenverwaltung: 'Insolvenz in Eigenverwaltung',
  insolvenz: 'Regelinsolvenz',
};

export default function KapitalpartnerWerden() {
  const [f, setF] = useState({
    firmenname: '', anrede: '', vorname: '', nachname: '', email: '', telefon: '',
    webseite: '', linkedin: '', objektarten: '', branchen: '', regionen: '',
    volumen_von_eur: '', volumen_bis_eur: '', entscheidung_tage: '', beschreibung: '',
  });
  const [finanzierungsarten, setFinanzierungsarten] = useState([]);
  const [bonitaet, setBonitaet] = useState([]);
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fertig, setFertig] = useState(false);

  const um = (setzen, liste) => (wert) =>
    setzen(liste.includes(wert) ? liste.filter((x) => x !== wert) : [...liste, wert]);
  const feld = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  const kommaListe = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const zahl = (s) => (s === '' ? null : Number(String(s).replace(/[^\d]/g, '')));

  const senden = async (e) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const d = await api.post('/api/public/kapitalpartner-bewerbung', {
        ...f,
        objektarten: kommaListe(f.objektarten),
        branchen: kommaListe(f.branchen),
        volumen_von_eur: zahl(f.volumen_von_eur),
        volumen_bis_eur: zahl(f.volumen_bis_eur),
        entscheidung_tage: zahl(f.entscheidung_tage),
        finanzierungsarten, bonitaet, consent,
      });
      setMsg({ ok: true, text: d.message });
      setFertig(true);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const karten = [
    {
      icon: Banknote,
      titel: 'Sie finanzieren, wir kennen den Bedarf',
      text: 'Unsere Interim Manager und Berater sitzen in Mandaten, in denen investiert werden muss: Maschinen, Fuhrpark, IT, Ausstattung. Der Bedarf ist konkret und die Entscheider sitzen am Tisch.',
    },
    {
      icon: ShieldCheck,
      titel: 'Auch wenn die Bilanz nicht schön ist',
      text: 'Ein großer Teil unserer Mandate sind Sanierungen und Restrukturierungen. Wer dort noch finanziert, wo Banken längst abgewinkt haben, ist für uns besonders wertvoll. Genau danach fragen wir unten.',
    },
    {
      icon: Timer,
      titel: 'Kein Dauerauftrag, keine Pflege',
      text: 'Sie tragen sich einmal ein und hören von uns, wenn etwas passt. Keine regelmäßigen Abfragen, keine Newsletter, keine Erinnerungen. Wir melden uns mit einem Fall oder gar nicht.',
    },
  ];

  return (
    <div className="pxl-buehne">
      <header className="pxl-buehne-kopf">
        <Logo variante="dunkel" zusatz="Expert Network" />
        <span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <TerminKnopf />
          <Link to="/login" style={{ fontSize: 14 }}>Zur Anmeldung</Link>
        </span>
      </header>

      <div className="pxl-buehne-inhalt" style={{ maxWidth: 940, margin: '0 auto', width: '100%' }}>
      <span className="pxl-kicker">Kapital für den Mittelstand</span>
      <h1>Sie finanzieren. <span className="pxl-akzent">Wir kennen den Bedarf.</span></h1>
      <p style={{ color: 'var(--grey-600)', maxWidth: 720, margin: '8px 0 0', lineHeight: 1.6 }}>
        Sie finanzieren Objekte, Anlagen oder Umlaufvermögen und suchen Zugang zu Fällen, die
        wirklich entschieden werden? Dann tragen Sie sich hier ein. Wir vermitteln keine Leads
        im Dutzend, sondern melden uns, wenn in einem unserer Mandate ein konkreter Bedarf entsteht.
      </p>

      <div className="card-grid" style={{ margin: '24px 0 32px' }}>
        {karten.map(({ icon: Icon, titel, text }) => (
          <div className="card" key={titel}>
            <h3><Icon size={17} /> {titel}</h3>
            <p>{text}</p>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 20, color: 'var(--navy)', marginBottom: 6 }}>Ihre Angaben</h2>
      <p style={{ color: 'var(--grey-400)', fontSize: 13, marginBottom: 16 }}>
        Nur das Nötigste. Alles Weitere besprechen wir im Gespräch.
      </p>

      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      {!fertig && (
        <form onSubmit={senden} className="card" style={{ maxWidth: 820 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 320px' }}>
              <label>Firma *</label><input required maxLength={200} {...feld('firmenname')} />
            </div>
            <div className="field" style={{ flex: '0 0 120px' }}>
              <label>Anrede</label>
              <select {...feld('anrede')}>
                <option value="">bitte wählen</option>
                <option value="herr">Herr</option>
                <option value="frau">Frau</option>
                <option value="divers">Divers</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 200px' }}><label>Vorname</label><input maxLength={100} {...feld('vorname')} /></div>
            <div className="field" style={{ flex: '1 1 200px' }}><label>Nachname</label><input maxLength={100} {...feld('nachname')} /></div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 240px' }}><label>E-Mail *</label><input type="email" required maxLength={200} {...feld('email')} /></div>
            <div className="field" style={{ flex: '1 1 180px' }}><label>Telefon</label><input maxLength={40} {...feld('telefon')} /></div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 240px' }}><label>Webseite</label><input maxLength={300} placeholder="firma.de" {...feld('webseite')} /></div>
            <div className="field" style={{ flex: '1 1 240px' }}><label>LinkedIn</label><input maxLength={300} placeholder="linkedin.com/in/…" {...feld('linkedin')} /></div>
          </div>

          <div className="field">
            <label>Was finanzieren Sie? *</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
              {Object.entries(FINANZIERUNG).map(([k, label]) => (
                <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={finanzierungsarten.includes(k)}
                    onChange={() => um(setFinanzierungsarten, finanzierungsarten)(k)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Bis zu welcher Lage finanzieren Sie noch? *</label>
            <p style={{ color: 'var(--grey-600)', fontSize: 12.5, margin: '2px 0 6px' }}>
              Das ist für uns die wichtigste Angabe. Ein großer Teil unserer Mandate sind
              Sanierungsfälle, in denen klassische Finanzierer aussteigen.
            </p>
            <div style={{ display: 'grid', gap: 6 }}>
              {Object.entries(BONITAET).map(([k, label]) => (
                <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={bonitaet.includes(k)} onChange={() => um(setBonitaet, bonitaet)(k)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Welche Objekte oder Anlagen?</label>
            <input maxLength={400} placeholder="IT-Equipment, Kräne, Medizintechnik, Fuhrpark, durch Komma getrennt" {...feld('objektarten')} />
          </div>
          <div className="field">
            <label>Branchen mit besonderer Erfahrung</label>
            <input maxLength={400} placeholder="Bau, Pflege, Logistik, Maschinenbau, durch Komma getrennt" {...feld('branchen')} />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 150px' }}><label>Volumen ab (Euro)</label><input inputMode="numeric" placeholder="50000" {...feld('volumen_von_eur')} /></div>
            <div className="field" style={{ flex: '1 1 150px' }}><label>Volumen bis (Euro)</label><input inputMode="numeric" placeholder="5000000" {...feld('volumen_bis_eur')} /></div>
            <div className="field" style={{ flex: '1 1 150px' }}><label>Entscheidung in Tagen</label><input inputMode="numeric" placeholder="10" {...feld('entscheidung_tage')} /></div>
            <div className="field" style={{ flex: '1 1 200px' }}><label>Regionen</label><input maxLength={200} placeholder="DACH" {...feld('regionen')} /></div>
          </div>

          <div className="field">
            <label>Kurz zu Ihnen</label>
            <textarea rows={4} maxLength={3000} placeholder="Wie Sie arbeiten, was Sie von anderen unterscheidet, gern mit einem Beispiel."
              style={{ width: '100%', border: '1px solid var(--grey-200)', borderRadius: 6, padding: '9px 11px', fontSize: 14, fontFamily: 'inherit' }}
              {...feld('beschreibung')} />
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, margin: '4px 0 16px', cursor: 'pointer' }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              Ich bin einverstanden, dass die Phalanx GmbH meine Angaben speichert und verwendet, um mich
              bei passenden Finanzierungsanlässen anzusprechen. Einzelheiten stehen in der{' '}
              <Link to="/datenschutz">Datenschutzerklärung</Link>. Die Einwilligung kann ich jederzeit widerrufen.
            </span>
          </label>

          <button className="btn" style={{ width: 'auto' }} disabled={busy || !consent}>
            {busy ? 'Wird gesendet…' : 'Angaben senden'}
          </button>
        </form>
      )}

      <div style={{ marginTop: 40, paddingTop: 26, borderTop: '1px solid rgba(216,221,225,.18)' }}>
        <p style={{ marginBottom: 14 }}>Lieber erst sprechen? Fünfzehn Minuten reichen für die Einschätzung, ob es passt.</p>
        <TerminKnopf klasse="pxl-knopf pxl-knopf-leise" text="Termin vereinbaren" />
      </div>
      <LegalFooter />
      </div>
    </div>
  );
}
