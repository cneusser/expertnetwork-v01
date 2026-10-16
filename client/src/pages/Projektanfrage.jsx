/**
 * v1.44.0 — Die Seite, auf der ein Kandidat auf eine Projektanfrage antwortet.
 *
 * Ohne Login. Die Alternative wäre gewesen: erst anmelden, dann antworten.
 * Die Hälfte hätte das Passwort nicht zur Hand und gar nicht geantwortet, und
 * eine ausgebliebene Antwort sieht aus wie Desinteresse.
 *
 * Zwei Knöpfe, drei Felder, fertig. Wer absagt, soll das in fünf Sekunden
 * tun können, sonst sagt er gar nichts und man wartet.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import Logo from '../components/Logo';
import LegalFooter from '../components/LegalFooter';
import { api } from '../api/client';

const datum = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : null);

export default function Projektanfrage() {
  const { token } = useParams();
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState('');
  const [antwort, setAntwort] = useState(null); // true | false
  const [form, setForm] = useState({ verfuegbar_ab: '', auslastung: '', notiz: '', wunsch_satz_eur: '' });
  const [fertig, setFertig] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/api/kandidatenanfrage/${token}`)
      .then((d) => {
        setDaten(d);
        if (d.antwort) {
          setAntwort(d.antwort.interesse);
          setForm({
            verfuegbar_ab: d.antwort.verfuegbar_ab || '',
            auslastung: d.antwort.auslastung || '',
            notiz: d.antwort.notiz || '',
            wunsch_satz_eur: '',
          });
        }
      })
      .catch((e) => setFehler(e.message));
  }, [token]);

  const senden = async (interesse) => {
    setBusy(true); setFehler('');
    try {
      const d = await api.post(`/api/kandidatenanfrage/${token}`, {
        interesse,
        verfuegbar_ab: form.verfuegbar_ab || null,
        auslastung: form.auslastung || null,
        notiz: form.notiz || null,
        wunsch_satz_eur: form.wunsch_satz_eur ? Number(form.wunsch_satz_eur) : null,
      });
      setFertig(d.message);
    } catch (e) { setFehler(e.message); } finally { setBusy(false); }
  };

  if (fehler && !daten) {
    return (
      <div className="auth-wrap">
        <div className="auth-card" style={{ maxWidth: 520, margin: '60px auto' }}>
          <Logo variante="dunkel" form="stapel" zusatz="Expert Network" />
          <div className="msg msg-error" style={{ marginTop: 18 }}>{fehler}</div>
        </div>
      </div>
    );
  }
  if (!daten) return <div className="auth-wrap"><p className="sub" style={{ padding: 60, textAlign: 'center' }}>Laden…</p></div>;

  const p = daten.projekt;
  const rahmen = [
    p.start ? `Start ${datum(p.start)}` : null,
    p.dauer, p.auslastung,
    p.ort || (p.arbeitsmodell === 'remote' ? 'remote' : null),
  ].filter(Boolean);

  return (
    <div className="auth-wrap">
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 60px' }}>
        <Logo variante="dunkel" form="stapel" zusatz="Expert Network" />

        <span className="pxl-kicker" style={{ display: 'block', marginTop: 26 }}>Projektanfrage</span>
        <h1 style={{ marginTop: 6 }}>{p.titel}</h1>
        {rahmen.length > 0 && <p className="muted" style={{ marginTop: 4 }}>{rahmen.join('  ·  ')}</p>}

        {p.beschreibung && (
          <div className="card" style={{ marginTop: 18 }}>
            <h3>Aufgabe</h3>
            <p style={{ whiteSpace: 'pre-line', marginTop: 8 }}>{p.beschreibung}</p>
          </div>
        )}

        {(p.must?.length > 0 || p.nice?.length > 0) && (
          <div className="card" style={{ marginTop: 14 }}>
            {p.must?.length > 0 && (
              <>
                <h3>Gefordert</h3>
                <ul style={{ margin: '8px 0 0 18px' }}>{p.must.map((m) => <li key={m}>{m}</li>)}</ul>
              </>
            )}
            {p.nice?.length > 0 && (
              <>
                <h3 style={{ marginTop: 14 }}>Von Vorteil</h3>
                <ul style={{ margin: '8px 0 0 18px' }}>{p.nice.map((n) => <li key={n}>{n}</li>)}</ul>
              </>
            )}
          </div>
        )}

        {fertig ? (
          <div className="card" style={{ marginTop: 20, borderLeft: '3px solid var(--success)' }}>
            <h3>Danke</h3>
            <p style={{ marginTop: 8 }}>{fertig}</p>
          </div>
        ) : (
          <div className="card" style={{ marginTop: 20 }}>
            <h3>{daten.bereits_geantwortet ? 'Deine Antwort ändern' : 'Passt das zu dir?'}</h3>
            {daten.bereits_geantwortet && (
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                Du hast schon geantwortet. Wenn sich etwas geändert hat, kannst du das hier richtigstellen.
              </p>
            )}
            {daten.frist && (
              <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                Antwort erbeten bis {datum(daten.frist)}.
              </p>
            )}
            {fehler && <div className="msg msg-error">{fehler}</div>}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '14px 0' }}>
              <button type="button" className={`btn ${antwort === true ? '' : 'btn-zweitrangig'}`}
                style={{ width: 'auto', padding: '10px 20px', marginBottom: 0 }}
                onClick={() => setAntwort(true)}>
                <Check size={16} style={{ verticalAlign: '-3px' }} /> Interesse
              </button>
              <button type="button" className={`btn ${antwort === false ? '' : 'btn-zweitrangig'}`}
                style={{ width: 'auto', padding: '10px 20px', marginBottom: 0 }}
                onClick={() => setAntwort(false)}>
                <X size={16} style={{ verticalAlign: '-3px' }} /> Passt nicht
              </button>
            </div>

            {antwort === true && (
              <>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <div className="field" style={{ flex: '1 1 200px' }}>
                    <label>Ab wann könntest du?</label>
                    {/* Text und kein Datumsfeld: "ab Mitte November" und
                        "sofort, aber erst ab Februar voll" sind Antworten,
                        die ein Datumsfeld zerstören würde. */}
                    <input value={form.verfuegbar_ab} onChange={(e) => setForm({ ...form, verfuegbar_ab: e.target.value })}
                      placeholder="sofort, ab 1.12., Mitte November …" />
                  </div>
                  <div className="field" style={{ flex: '1 1 150px' }}>
                    <label>In welchem Umfang?</label>
                    <input value={form.auslastung} onChange={(e) => setForm({ ...form, auslastung: e.target.value })}
                      placeholder="100 %, 3 Tage pro Woche" />
                  </div>
                  <div className="field" style={{ flex: '0 0 170px' }}>
                    <label>Tagessatz <span className="muted">falls abweichend</span></label>
                    <input type="number" value={form.wunsch_satz_eur}
                      onChange={(e) => setForm({ ...form, wunsch_satz_eur: e.target.value })} placeholder="EUR" />
                  </div>
                </div>
              </>
            )}

            {antwort !== null && (
              <>
                <div className="field">
                  <label>Noch etwas dazu? <span className="muted">optional</span></label>
                  <textarea rows={3} value={form.notiz} onChange={(e) => setForm({ ...form, notiz: e.target.value })}
                    placeholder={antwort ? 'Was dich an der Aufgabe interessiert, oder was noch zu klären wäre.'
                      : 'Woran es liegt. Das hilft mir, dir beim nächsten Mal etwas Passenderes zu schicken.'} />
                </div>
                <button type="button" className="btn" style={{ width: 'auto', padding: '10px 22px' }}
                  disabled={busy} onClick={() => senden(antwort)}>
                  {busy ? 'Schickt…' : 'Antwort abschicken'}
                </button>
              </>
            )}
          </div>
        )}

        <p className="muted" style={{ fontSize: 12.5, marginTop: 20 }}>
          Den Auftraggeber nennen wir erst, wenn es konkret wird. Deine Antwort geht nur an uns,
          nicht an den Kunden.
        </p>
        <LegalFooter />
      </div>
    </div>
  );
}
