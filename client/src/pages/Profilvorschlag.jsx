/**
 * v1.43.0 — Die Profilübersicht, die der Kunde unter seinem Link sieht.
 *
 * Kein Konto, kein Login. Oben die Anfrage, darunter die Profile mit je ein
 * bis zwei Sätzen zur Eignung. Ein Klick öffnet den One-Pager als PDF.
 *
 * Kein Name, keine Firma, keine Kontaktdaten. Was der Kunde braucht, um über
 * ein Gespräch zu entscheiden, steht da. Was er bräuchte, um am Netzwerk
 * vorbeizugehen, nicht.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, FileText, Calendar, Star, MessageSquare, X } from 'lucide-react';
import Logo from '../components/Logo';
import LegalFooter from '../components/LegalFooter';
import { api } from '../api/client';

const geld = (c) => (c ? `${Math.round(Number(c) / 100).toLocaleString('de-DE')} EUR` : 'auf Anfrage');
const datum = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : null);

export default function Profilvorschlag() {
  const { token } = useParams();
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState('');
  const [msg, setMsg] = useState('');

  const laden = () => api.get(`/api/vorlagen/oeffentlich/${token}`)
    .then(setDaten).catch((e) => setFehler(e.message));
  useEffect(() => { laden(); }, [token]);

  if (fehler) {
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

  const { projekt, profile, anschreiben, gueltig_bis: gueltigBis } = daten;
  const rahmen = [
    projekt.start ? `Start ${datum(projekt.start)}` : null,
    projekt.dauer, projekt.auslastung,
    projekt.ort || (projekt.arbeitsmodell === 'remote' ? 'remote' : null),
  ].filter(Boolean);

  return (
    <div className="auth-wrap">
      <div style={{ maxWidth: 940, margin: '0 auto', padding: '32px 20px 60px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <Logo variante="dunkel" form="stapel" zusatz="Expert Network" />
          <a className="btn" style={{ width: 'auto', padding: '9px 16px', textDecoration: 'none' }}
            href={`/api/vorlagen/oeffentlich/${token}/alle.pdf`} target="_blank" rel="noreferrer">
            <Download size={15} style={{ verticalAlign: '-2px' }} /> Alle Profile als PDF
          </a>
        </div>

        {msg && <div className="msg msg-success" style={{ marginTop: 18 }}>{msg}</div>}

        <span className="pxl-kicker" style={{ display: 'block', marginTop: 26 }}>Profilvorschlag</span>
        <h1 style={{ marginTop: 6 }}>{projekt.name}</h1>
        {rahmen.length > 0 && <p className="muted" style={{ marginTop: 4 }}>{rahmen.join('  ·  ')}</p>}

        {anschreiben && (
          <div className="card" style={{ marginTop: 20 }}>
            <p style={{ whiteSpace: 'pre-line', margin: 0 }}>{anschreiben}</p>
          </div>
        )}

        <h2 className="abschnitt" style={{ marginTop: 30 }}>
          {profile.length} {profile.length === 1 ? 'Profil' : 'Profile'}
        </h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
          Die Profile sind anonymisiert. Namen und Kontaktdaten geben wir weiter, sobald Sie ein
          Gespräch führen möchten.
        </p>

        {profile.map((p) => (
          <div className="card" key={p.id} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 420px' }}>
                <span className="pxl-kicker">{p.kennung}</span>
                <h3 style={{ margin: '4px 0 6px' }}>{p.rolle || p.kennung}</h3>
                {p.fitting && <p style={{ margin: '0 0 10px' }}>{p.fitting}</p>}

                {p.schwerpunkte?.length > 0 && (
                  <p style={{ margin: '0 0 8px' }}>
                    {p.schwerpunkte.slice(0, 8).map((s) => <span className="tag" key={s}>{s}</span>)}
                  </p>
                )}

                {/* Die Lücken stehen mit da. Ein Kunde, der sie selbst findet,
                    traut der Vorlage beim nächsten Mal nicht mehr. */}
                {p.luecken?.length > 0 && (
                  <p className="muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>
                    Nicht belegt: {p.luecken.slice(0, 3).join(', ')}
                  </p>
                )}
              </div>

              <div style={{ flex: '0 0 190px', textAlign: 'right' }}>
                <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--pxl-papier)' }}>
                  {geld(p.tagessatz_cent)}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {/* v1.47.1: Was sonst noch gilt, steht hier. Ein Kunde, der
                      nach Vertragsschluss von Reisekosten erfährt, fühlt sich
                      übervorteilt, auch wenn alles rechtens war. */}
                  Tagessatz zzgl. USt{p.satz_hinweis ? `, ${p.satz_hinweis}` : ''}
                </div>
                {p.verfuegbarkeit?.ab_datum && (
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                    <Calendar size={12} style={{ verticalAlign: '-1px' }} /> ab {datum(p.verfuegbarkeit.ab_datum)}
                    {p.verfuegbarkeit.auslastung_prozent ? `, ${p.verfuegbarkeit.auslastung_prozent} %` : ''}
                  </div>
                )}
                <a href={`/api/vorlagen/oeffentlich/${token}/profil/${p.id}.pdf`}
                  target="_blank" rel="noreferrer"
                  style={{ display: 'inline-block', marginTop: 12, fontSize: 13 }}>
                  <FileText size={13} style={{ verticalAlign: '-2px' }} /> Profil als PDF
                </a>
              </div>
            </div>

            {/* v1.49.0: Drei Antworten. "Gemerkt" gibt es, weil die
                Wirklichkeit so aussieht: Man liest drei Profile, findet zwei
                brauchbar und will vergleichen. Ohne diese Stufe klickt
                niemand, und dann wissen wir nichts. */}
            <Reaktion token={token} profil={p} melden={(t) => { setMsg(t); laden(); }} />
          </div>
        ))}

        <div className="card" style={{ marginTop: 24 }}>
          <h3>Wie es weitergeht</h3>
          <p style={{ marginTop: 8 }}>
            {profile.some((p) => p.reaktion === 'einladen')
              ? 'Wir melden uns und stimmen die Termine ab.'
              : 'Sagen Sie uns, welche Profile Sie kennenlernen möchten. Wir stellen den Kontakt her und stimmen die Termine ab.'}
          </p>
          <p style={{ marginTop: 10 }}>
            Dr. Christian Neusser · Phalanx GmbH<br />
            <a href="mailto:neusser@phalanx.de">neusser@phalanx.de</a> · +49 9131 920 60 75
          </p>
        </div>

        {gueltigBis && (
          <p className="muted" style={{ fontSize: 12, marginTop: 16, textAlign: 'center' }}>
            Dieser Link ist gültig bis {datum(gueltigBis)}.
          </p>
        )}
        <LegalFooter />
      </div>
    </div>
  );
}

/**
 * v1.49.0 — Die Reaktion auf ein Profil.
 *
 * Drei Knöpfe, keine Pflicht. Wer nichts klickt, hat auch geantwortet,
 * nämlich noch nicht.
 *
 * Bei einer Absage wird nach dem Grund gefragt, aber freiwillig. Der Grund
 * bleibt bei uns und geht nicht an den Kandidaten: "zu teuer" hilft ihm
 * nicht und schadet der Beziehung zum Kunden, wenn es die Runde macht.
 */
function Reaktion({ token, profil, melden }) {
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');
  const [grundOffen, setGrundOffen] = useState(false);
  const [grund, setGrund] = useState('');

  const senden = async (reaktion, notiz = null) => {
    setBusy(true); setFehler('');
    try {
      const d = await api.post(`/api/vorlagen/oeffentlich/${token}/profil/${profil.id}/reaktion`,
        { reaktion, notiz });
      melden(d.message);
      setGrundOffen(false);
    } catch (e) { setFehler(e.message); } finally { setBusy(false); }
  };

  const aktiv = (r) => profil.reaktion === r;
  const stil = (r) => ({
    width: 'auto', padding: '7px 14px', marginBottom: 0, fontSize: 13,
    ...(aktiv(r) ? {} : { background: 'transparent', border: '1px solid rgba(216,221,225,.3)', color: 'rgba(247,245,240,.85)' }),
  });

  return (
    <div style={{ borderTop: '1px solid rgba(216,221,225,.15)', marginTop: 14, paddingTop: 12 }}>
      {fehler && <div className="msg msg-error" style={{ fontSize: 13 }}>{fehler}</div>}

      {!grundOffen ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn" style={stil('einladen')} disabled={busy}
            onClick={() => senden('einladen')}>
            <MessageSquare size={14} style={{ verticalAlign: '-2px' }} /> Kennenlernen
          </button>
          <button type="button" className="btn" style={stil('gemerkt')} disabled={busy}
            onClick={() => senden('gemerkt')}>
            <Star size={14} style={{ verticalAlign: '-2px' }} /> Merken
          </button>
          <button type="button" className="btn" style={stil('abgelehnt')} disabled={busy}
            onClick={() => setGrundOffen(true)}>
            <X size={14} style={{ verticalAlign: '-2px' }} /> Passt nicht
          </button>

          {profil.reaktion && (
            <span className="muted" style={{ fontSize: 12.5, marginLeft: 4 }}>
              {profil.reaktion === 'einladen' && 'Sie möchten dieses Profil kennenlernen.'}
              {profil.reaktion === 'gemerkt' && 'Gemerkt.'}
              {profil.reaktion === 'abgelehnt' && 'Abgelehnt.'}
            </span>
          )}
        </div>
      ) : (
        <div>
          <div className="field" style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13 }}>
              Woran liegt es? <span className="muted">freiwillig, bleibt bei uns</span>
            </label>
            <input value={grund} onChange={(e) => setGrund(e.target.value)}
              placeholder="zu teuer, zu wenig Branchenerfahrung, Zeitpunkt passt nicht …" />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" style={{ width: 'auto', padding: '7px 14px', marginBottom: 0 }}
              disabled={busy} onClick={() => senden('abgelehnt', grund || null)}>Absage abschicken</button>
            <button type="button" className="tab" style={{ color: 'rgba(247,245,240,.6)' }}
              onClick={() => setGrundOffen(false)}>Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}
