/**
 * v1.23.0 — Abrechnung: Mandate, Leistungsnachweise, Belege.
 * Ablauf auf einer Seite: Mandat aus einer besetzten Position anlegen,
 * Tage je Monat freigeben, abrechnen (Gutschrift + Rechnung entstehen zusammen),
 * Belege ansehen, versenden, auf bezahlt setzen, für die Buchhaltung exportieren.
 */
import { useEffect, useState } from 'react';
import { Receipt, Plus, FileText, Send, Download, Check } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const geld = (cent) => `${(Number(cent || 0) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
const heutePeriode = new Date().toISOString().slice(0, 7);

const NACHWEIS_LABEL = { offen: 'Offen', eingereicht: 'Eingereicht', freigegeben: 'Freigegeben', abgerechnet: 'Abgerechnet' };
const NACHWEIS_BADGE = { offen: 'eingeladen', eingereicht: 'registriert', freigegeben: 'freigegeben', abgerechnet: 'freigegeben' };
const BELEG_BADGE = { offen: 'eingeladen', versendet: 'registriert', bezahlt: 'freigegeben', storniert: 'inaktiv' };

export default function AdminAbrechnung() {
  const [mandate, setMandate] = useState(null);
  const [kandidaten, setKandidaten] = useState([]);
  const [belege, setBelege] = useState([]);
  const [kennzahlen, setKennzahlen] = useState(null);
  const [msg, setMsg] = useState(null);
  const [neu, setNeu] = useState(null);
  const [tab, setTab] = useState('mandate');
  const [zeitraum, setZeitraum] = useState({ von: '', bis: '' });

  const laden = async () => {
    try {
      const [m, k, b] = await Promise.all([
        api.get('/api/billing/mandate'),
        api.get('/api/billing/besetzt-ohne-mandat'),
        api.get(`/api/billing/belege${zeitraum.von || zeitraum.bis ? `?von=${zeitraum.von}&bis=${zeitraum.bis}` : ''}`),
      ]);
      setMandate(m.mandate); setKandidaten(k.kandidaten); setBelege(b.belege); setKennzahlen(b.kennzahlen);
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  };
  useEffect(() => { laden(); }, [zeitraum.von, zeitraum.bis]);

  const wrap = async (fn) => {
    try { const d = await fn(); setMsg({ ok: true, text: d?.message || 'Erledigt.' }); await laden(); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
  };

  const pdfOeffnen = (id) => window.open(`/api/billing/belege/${id}/pdf`, '_blank', 'noopener');

  return (
    <Layout>
      <h1><Receipt size={22} style={{ verticalAlign: '-3px' }} /> Abrechnung</h1>
      <p className="sub">Mandate, Leistungsnachweise und Belege. Aus einem freigegebenen Nachweis entstehen zwei Belege: die Gutschrift an den Interim Manager und die Rechnung an den Kunden.</p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      {kennzahlen && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, margin: '16px 0' }}>
          {[['Umsatz netto', geld(kennzahlen.umsatz_cent)], ['Auszahlung netto', geld(kennzahlen.auszahlung_cent)],
            ['Marge', `${geld(kennzahlen.marge_cent)} (${kennzahlen.marge_prozent} %)`], ['Offene Rechnungen', geld(kennzahlen.offen_cent)]]
            .map(([label, wert]) => (
              <div className="card" key={label} style={{ padding: 14 }}>
                <div className="muted" style={{ fontSize: 12 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)', marginTop: 4 }}>{wert}</div>
              </div>
            ))}
        </div>
      )}

      <div className="tabs" style={{ margin: '10px 0 16px' }}>
        {[['mandate', `Mandate (${mandate?.length || 0})`], ['belege', `Belege (${belege.length})`]].map(([k, l]) => (
          <button key={k} type="button" className={`tab ${tab === k ? 'tab-active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'mandate' && (
        <>
          {kandidaten.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3><Plus size={16} /> Besetzt, aber noch kein Mandat</h3>
              <p className="muted" style={{ fontSize: 13 }}>Für diese Besetzungen fehlt noch die Abrechnungsgrundlage.</p>
              {kandidaten.map((k) => (
                <div key={`${k.project_id}-${k.expert_id}`} style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <strong>{k.vorname} {k.nachname}</strong>
                  <span className="muted" style={{ fontSize: 13 }}>{k.projekt_name}</span>
                  <button type="button" className="tab" style={{ color: 'var(--navy)', padding: 0 }}
                    onClick={() => setNeu({
                      project_id: k.project_id, expert_id: k.expert_id, projekt_name: k.projekt_name,
                      name: `${k.vorname} ${k.nachname}`, tagessatz_experte_eur: k.tagessatz_von_eur || 1200,
                      tagessatz_kunde_eur: '', gebuehr_modell: k.gebuehr_modell || 'gu_anteil',
                      gebuehr_prozent: k.gebuehr_prozent ?? 15, plan_tage: '', ust_prozent: 19,
                      kunde: { firma: '', ansprechpartner: '', strasse: '', plz: '', ort: '', email: '', ustid: '' },
                      experte: { firma: '', strasse: '', plz: '', ort: '', ustid: '', iban: '' },
                    })}>Mandat anlegen</button>
                </div>
              ))}
            </div>
          )}

          {neu && (
            <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--navy)' }}>
              <h3>Mandat: {neu.name} · {neu.projekt_name}</h3>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                <div className="field" style={{ flex: '1 1 150px' }}><label>Tagessatz Experte (EUR)</label>
                  <input type="text" value={neu.tagessatz_experte_eur} onChange={(e) => setNeu({ ...neu, tagessatz_experte_eur: e.target.value })} /></div>
                <div className="field" style={{ flex: '1 1 150px' }}><label>Tagessatz Kunde (optional)</label>
                  <input type="text" value={neu.tagessatz_kunde_eur} onChange={(e) => setNeu({ ...neu, tagessatz_kunde_eur: e.target.value })} /></div>
                <div className="field" style={{ flex: '1 1 150px' }}><label>Gebührenmodell</label>
                  <select value={neu.gebuehr_modell} onChange={(e) => setNeu({ ...neu, gebuehr_modell: e.target.value })}>
                    <option value="gu_anteil">Aufschlag auf den Satz</option>
                    <option value="erfolg">Einmaliges Erfolgshonorar</option>
                  </select></div>
                <div className="field" style={{ flex: '1 1 110px' }}><label>Prozent</label>
                  <input type="text" value={neu.gebuehr_prozent} onChange={(e) => setNeu({ ...neu, gebuehr_prozent: e.target.value })} /></div>
                {neu.gebuehr_modell === 'erfolg' && (
                  <div className="field" style={{ flex: '1 1 110px' }}><label>Geplante Tage</label>
                    <input type="text" value={neu.plan_tage} onChange={(e) => setNeu({ ...neu, plan_tage: e.target.value })} /></div>
                )}
                <div className="field" style={{ flex: '1 1 110px' }}><label>USt in Prozent</label>
                  <input type="text" value={neu.ust_prozent} onChange={(e) => setNeu({ ...neu, ust_prozent: e.target.value })} /></div>
              </div>

              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>Rechnungsempfänger beim Kunden</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[['firma', 'Firma'], ['ansprechpartner', 'Ansprechpartner'], ['strasse', 'Straße'], ['plz', 'PLZ'], ['ort', 'Ort'], ['email', 'E-Mail'], ['ustid', 'USt-IdNr.']].map(([k, l]) => (
                  <div className="field" key={k} style={{ flex: k === 'plz' ? '0 0 90px' : '1 1 160px' }}><label>{l}</label>
                    <input type="text" value={neu.kunde[k]} onChange={(e) => setNeu({ ...neu, kunde: { ...neu.kunde, [k]: e.target.value } })} /></div>
                ))}
              </div>

              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>Angaben des Interim Managers für die Gutschrift</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[['firma', 'Firma'], ['strasse', 'Straße'], ['plz', 'PLZ'], ['ort', 'Ort'], ['ustid', 'USt-IdNr.'], ['iban', 'IBAN']].map(([k, l]) => (
                  <div className="field" key={k} style={{ flex: k === 'plz' ? '0 0 90px' : '1 1 160px' }}><label>{l}</label>
                    <input type="text" value={neu.experte[k]} onChange={(e) => setNeu({ ...neu, experte: { ...neu.experte, [k]: e.target.value } })} /></div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button type="button" className="btn" style={{ width: 'auto' }} onClick={() => wrap(async () => {
                  const d = await api.post('/api/billing/mandate', {
                    project_id: neu.project_id, expert_id: neu.expert_id,
                    tagessatz_experte_eur: Number(neu.tagessatz_experte_eur),
                    tagessatz_kunde_eur: neu.tagessatz_kunde_eur ? Number(neu.tagessatz_kunde_eur) : null,
                    gebuehr_modell: neu.gebuehr_modell, gebuehr_prozent: Number(neu.gebuehr_prozent),
                    plan_tage: neu.plan_tage ? Number(neu.plan_tage) : null, ust_prozent: Number(neu.ust_prozent),
                    kunde_json: neu.kunde, experte_json: neu.experte,
                  });
                  setNeu(null); return d;
                })}>Mandat speichern</button>
                <button type="button" className="tab" onClick={() => setNeu(null)}>Abbrechen</button>
              </div>
            </div>
          )}

          {mandate?.map((m) => <MandatKarte key={m.id} m={m} wrap={wrap} pdfOeffnen={pdfOeffnen} />)}
          {mandate && !mandate.length && !kandidaten.length && (
            <p className="muted">Noch keine Mandate. Sobald eine Bewerbung im Funnel auf besetzt steht, taucht sie hier zur Anlage auf.</p>
          )}
        </>
      )}

      {tab === 'belege' && (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
            <div className="field" style={{ flex: '0 0 160px' }}><label>Von</label>
              <input type="date" value={zeitraum.von} onChange={(e) => setZeitraum({ ...zeitraum, von: e.target.value })} /></div>
            <div className="field" style={{ flex: '0 0 160px' }}><label>Bis</label>
              <input type="date" value={zeitraum.bis} onChange={(e) => setZeitraum({ ...zeitraum, bis: e.target.value })} /></div>
            <a className="btn" style={{ width: 'auto', textDecoration: 'none', padding: '9px 16px', marginBottom: 14 }}
              href={`/api/billing/export.csv?von=${zeitraum.von}&bis=${zeitraum.bis}`}>
              <Download size={15} style={{ verticalAlign: '-2px' }} /> Buchhaltungs-Export
            </a>
          </div>
          <table className="table">
            <thead><tr><th>Beleg</th><th>Typ</th><th>Datum</th><th>Empfänger</th><th>Mandat</th><th>Netto</th><th>Brutto</th><th>Status</th><th /></tr></thead>
            <tbody>
              {belege.map((b) => {
                const e = typeof b.empfaenger_json === 'string' ? JSON.parse(b.empfaenger_json) : (b.empfaenger_json || {});
                return (
                  <tr key={b.id}>
                    <td><strong>{b.beleg_nr}</strong><br /><span className="muted" style={{ fontSize: 12 }}>{b.periode}</span></td>
                    <td>{b.typ === 'gutschrift' ? 'Gutschrift' : 'Rechnung'}</td>
                    <td>{new Date(b.datum).toLocaleDateString('de-DE')}</td>
                    <td>{e.firma || e.ansprechpartner || ''}</td>
                    <td style={{ fontSize: 13 }}>{b.projekt_name}</td>
                    <td>{geld(b.netto_cent)}</td>
                    <td><strong>{geld(b.brutto_cent)}</strong></td>
                    <td><span className={`status status-${BELEG_BADGE[b.status]}`}>{b.status}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="tab" style={{ padding: 0, color: 'var(--navy)' }} onClick={() => pdfOeffnen(b.id)}><FileText size={14} /> PDF</button>{' '}
                      <button type="button" className="tab" style={{ padding: 0, color: 'var(--navy)' }}
                        onClick={() => wrap(() => api.post(`/api/billing/belege/${b.id}/versenden`, {}))}><Send size={14} /> Senden</button>{' '}
                      {b.status !== 'bezahlt' && (
                        <button type="button" className="tab" style={{ padding: 0, color: 'var(--navy)' }}
                          onClick={() => wrap(() => api.post(`/api/billing/belege/${b.id}/status`, { status: 'bezahlt' }))}><Check size={14} /> Bezahlt</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!belege.length && <tr><td colSpan={9} className="muted">Noch keine Belege im gewählten Zeitraum.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </Layout>
  );
}

function MandatKarte({ m, wrap, pdfOeffnen }) {
  const [periode, setPeriode] = useState(heutePeriode);
  const [tage, setTage] = useState('');
  const [spesen, setSpesen] = useState('');

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3>{m.vorname} {m.nachname} · {m.projekt_name}</h3>
      <p className="muted" style={{ fontSize: 13 }}>
        Einkauf {m.tagessatz_experte_eur} EUR, Verkauf {m.verkaufssatz_eur} EUR je Tag ·{' '}
        {m.gebuehr_modell === 'gu_anteil' ? `Aufschlag ${m.gebuehr_prozent} Prozent` : `Erfolgshonorar ${m.gebuehr_prozent} Prozent auf ${m.plan_tage || 0} geplante Tage`} ·
        USt {m.ust_prozent} Prozent
      </p>

      <table className="table" style={{ marginTop: 8 }}>
        <thead><tr><th>Zeitraum</th><th>Tage</th><th>Spesen</th><th>Status</th><th /></tr></thead>
        <tbody>
          {m.nachweise.map((n) => (
            <tr key={n.id}>
              <td>{n.periode}</td>
              <td>{String(n.tage).replace('.', ',')}</td>
              <td>{n.spesen_eur ? `${n.spesen_eur} EUR` : ''}</td>
              <td><span className={`status status-${NACHWEIS_BADGE[n.status]}`}>{NACHWEIS_LABEL[n.status]}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {['offen', 'eingereicht'].includes(n.status) && (
                  <button type="button" className="tab" style={{ padding: 0, color: 'var(--navy)' }}
                    onClick={() => wrap(() => api.post(`/api/billing/nachweis/${n.id}/freigeben`, {}))}>Freigeben</button>
                )}
                {n.status === 'freigegeben' && (
                  <button type="button" className="tab" style={{ padding: 0, color: 'var(--navy)', fontWeight: 700 }}
                    onClick={async () => {
                      const v = await api.get(`/api/billing/nachweis/${n.id}/vorschau`);
                      const t = v.vorschau;
                      if (!window.confirm(`Abrechnen für ${n.periode}?\n\nGutschrift an ${m.vorname} ${m.nachname}: ${geld(t.gutschrift.brutto_cent)} brutto\nRechnung an den Kunden: ${geld(t.rechnung.brutto_cent)} brutto\nMarge: ${geld(t.marge_cent)}`)) return;
                      wrap(() => api.post(`/api/billing/nachweis/${n.id}/abrechnen`, {}));
                    }}>Abrechnen</button>
                )}
              </td>
            </tr>
          ))}
          {!m.nachweise.length && <tr><td colSpan={5} className="muted">Noch keine Leistungsnachweise.</td></tr>}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
        <div className="field" style={{ flex: '0 0 130px', marginBottom: 0 }}><label>Zeitraum</label>
          <input type="month" value={periode} onChange={(e) => setPeriode(e.target.value)} /></div>
        <div className="field" style={{ flex: '0 0 90px', marginBottom: 0 }}><label>Tage</label>
          <input type="text" value={tage} onChange={(e) => setTage(e.target.value)} /></div>
        <div className="field" style={{ flex: '0 0 110px', marginBottom: 0 }}><label>Spesen (EUR)</label>
          <input type="text" value={spesen} onChange={(e) => setSpesen(e.target.value)} /></div>
        <button type="button" className="tab" style={{ color: 'var(--navy)', paddingBottom: 10 }}
          onClick={() => wrap(async () => {
            const d = await api.post('/api/billing/nachweis', {
              engagement_id: m.id, periode, tage: Number(String(tage).replace(',', '.')) || 0,
              spesen_eur: Number(spesen) || 0,
            });
            setTage(''); setSpesen(''); return d;
          })}>Tage eintragen</button>
      </div>

      {m.belege.length > 0 && (
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          Belege:{' '}
          {m.belege.map((b) => (
            <button key={b.id} type="button" className="tab" style={{ padding: 0, color: 'var(--navy)', marginRight: 10 }}
              onClick={() => pdfOeffnen(b.id)}>{b.beleg_nr} ({geld(b.brutto_cent)})</button>
          ))}
        </p>
      )}
    </div>
  );
}
