/**
 * v1.26.0 — Ansprache-Cockpit.
 * Arbeitsfläche für die persönliche Ansprache über LinkedIn: wer heute dran ist,
 * was zurückkam, wie viele ankommen. Von hier geht nie eine Mail raus.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, RotateCcw, Download, ExternalLink } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const REAKTION = { offen: 'offen', interesse: 'Interesse', spaeter: 'später', absage: 'Absage', keine: 'keine Reaktion' };
const BADGE = { offen: 'eingeladen', interesse: 'freigegeben', spaeter: 'registriert', absage: 'inaktiv', keine: 'inaktiv' };
const fmt = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '');

export default function AdminAnsprache() {
  const [daten, setDaten] = useState(null);
  const [trichter, setTrichter] = useState(null);
  const [msg, setMsg] = useState(null);
  const [tab, setTab] = useState('faellig');
  const [filter, setFilter] = useState({ prio: '', kanal: '', pensum: 20, wiedervorlage_tage: 10 });
  const [auswahl, setAuswahl] = useState([]);

  const laden = async () => {
    try {
      const p = new URLSearchParams(Object.entries(filter).filter(([, v]) => v !== '' && v != null));
      const [a, t] = await Promise.all([
        api.get(`/api/ansprache/arbeitsliste?${p}`),
        api.get('/api/ansprache/trichter'),
      ]);
      setDaten(a); setTrichter(t);
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  };
  useEffect(() => { laden(); }, [filter.prio, filter.kanal, filter.pensum, filter.wiedervorlage_tage]);

  const schritt = async (id, body, still = false) => {
    try {
      await api.post(`/api/ansprache/${id}/schritt`, body);
      if (!still) setMsg({ ok: true, text: 'Notiert.' });
      await laden();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  };

  const liste = tab === 'faellig' ? daten?.faellig : daten?.wiedervorlage;

  return (
    <Layout>
      <h1><Send size={22} style={{ verticalAlign: '-3px' }} /> Ansprache</h1>
      <p className="sub">
        Deine Arbeitsliste für die persönliche Ansprache über LinkedIn. Von hier geht keine Mail raus,
        Du schreibst selbst und notierst hier, was zurückkam.
      </p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      {trichter && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, margin: '16px 0' }}>
          {[['Vorbereitet', trichter.gesamt.vorbereitet], ['Angeschrieben', trichter.gesamt.angeschrieben],
            ['Reagiert', `${trichter.gesamt.reagiert} (${trichter.gesamt.quote_reaktion} %)`],
            ['Registriert', `${trichter.gesamt.registriert} (${trichter.gesamt.quote_registrierung} %)`],
            ['Freigegeben', trichter.gesamt.freigegeben]].map(([label, wert]) => (
              <div className="card" key={label} style={{ padding: 14 }}>
                <div className="muted" style={{ fontSize: 12 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)', marginTop: 4 }}>{wert}</div>
              </div>
            ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="field" style={{ flex: '0 0 110px', marginBottom: 0 }}><label>Prio</label>
          <select value={filter.prio} onChange={(e) => setFilter({ ...filter, prio: e.target.value })}>
            <option value="">alle</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
          </select></div>
        <div className="field" style={{ flex: '0 0 130px', marginBottom: 0 }}><label>Kanal</label>
          <select value={filter.kanal} onChange={(e) => setFilter({ ...filter, kanal: e.target.value })}>
            <option value="">alle</option><option value="linkedin">LinkedIn</option><option value="email">E-Mail</option>
          </select></div>
        <div className="field" style={{ flex: '0 0 110px', marginBottom: 0 }}><label>Tagespensum</label>
          <select value={filter.pensum} onChange={(e) => setFilter({ ...filter, pensum: Number(e.target.value) })}>
            {[10, 20, 30, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select></div>
        <div className="field" style={{ flex: '0 0 150px', marginBottom: 0 }}><label>Wiedervorlage nach</label>
          <select value={filter.wiedervorlage_tage} onChange={(e) => setFilter({ ...filter, wiedervorlage_tage: Number(e.target.value) })}>
            {[7, 10, 14, 21, 30].map((n) => <option key={n} value={n}>{n} Tagen</option>)}
          </select></div>
        <a className="btn" style={{ width: 'auto', textDecoration: 'none', padding: '9px 16px', marginBottom: 0 }}
          href="/api/ansprache/export.csv"><Download size={15} style={{ verticalAlign: '-2px' }} /> Stand als CSV</a>
      </div>

      {daten && (
        <p className="muted" style={{ fontSize: 13 }}>
          {daten.zahlen.faellig_gesamt} noch nie angeschrieben · {daten.zahlen.angeschrieben_gesamt} angeschrieben ·{' '}
          {daten.zahlen.wartet} warten noch auf Antwort · {daten.zahlen.heute_angeschrieben} heute erledigt
        </p>
      )}

      <div className="tabs" style={{ margin: '10px 0 14px' }}>
        {[['faellig', `Heute dran (${daten?.faellig.length || 0})`],
          ['wiedervorlage', `Wiedervorlage (${daten?.wiedervorlage.length || 0})`],
          ['trichter', 'Auswertung']].map(([k, l]) => (
            <button key={k} type="button" className={`tab ${tab === k ? 'tab-active' : ''}`}
              onClick={() => { setTab(k); setAuswahl([]); }}>{l}</button>
          ))}
      </div>

      {tab !== 'trichter' && liste && (
        <>
          {auswahl.length > 0 && (
            <p style={{ marginBottom: 10 }}>
              <strong>{auswahl.length} ausgewählt</strong>{' '}
              <button type="button" className="btn" style={{ width: 'auto', padding: '7px 16px' }}
                onClick={async () => {
                  try {
                    const d = await api.post('/api/ansprache/angeschrieben', { ids: auswahl });
                    setMsg({ ok: true, text: d.message }); setAuswahl([]); await laden();
                  } catch (e) { setMsg({ ok: false, text: e.message }); }
                }}>Alle als angeschrieben notieren</button>
            </p>
          )}
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 28 }}>
                  <input type="checkbox" title="Alle sichtbaren auswählen"
                    checked={liste.length > 0 && auswahl.length === liste.length}
                    onChange={(e) => setAuswahl(e.target.checked ? liste.map((x) => x.id) : [])} />
                </th>
                <th>Name</th><th>Position</th><th>Prio</th><th>Letzter Kontakt</th>
                <th>Angeschrieben</th><th>Reaktion</th><th>Notiz</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((p) => (
                <tr key={p.id}>
                  <td><input type="checkbox" checked={auswahl.includes(p.id)}
                    onChange={(e) => setAuswahl(e.target.checked ? [...auswahl, p.id] : auswahl.filter((x) => x !== p.id))} /></td>
                  <td>
                    <Link to={`/admin/experten/${p.id}`}><strong>{p.vorname} {p.nachname}</strong></Link>
                    {p.linkedin && (
                      <>{' '}<a href={`https://${p.linkedin}`} target="_blank" rel="noreferrer" title="LinkedIn-Profil öffnen">
                        <ExternalLink size={13} style={{ verticalAlign: '-2px' }} /></a></>
                    )}
                    <br /><span className="muted" style={{ fontSize: 12 }}>{p.firma}</span>
                  </td>
                  <td style={{ fontSize: 13, maxWidth: 260 }}>{(p.berufsbezeichnung || '').slice(0, 90)}</td>
                  <td>{p.vorreg_prio}</td>
                  <td style={{ fontSize: 13 }}>{fmt(p.vorreg_letzter_kontakt)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {p.vorreg_angeschrieben_am ? fmt(p.vorreg_angeschrieben_am) : (
                      <button type="button" className="btn" style={{ width: 'auto', padding: '5px 12px', fontSize: 13 }}
                        onClick={() => schritt(p.id, { angeschrieben: true })}>heute</button>
                    )}
                  </td>
                  <td>
                    <select value={p.vorreg_reaktion || 'offen'} style={{ fontSize: 12 }}
                      onChange={(e) => schritt(p.id, {
                        reaktion: e.target.value,
                        wiedervorlage: e.target.value === 'spaeter'
                          ? new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10) : undefined,
                      })}>
                      {Object.entries(REAKTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    {p.vorreg_reaktion !== 'offen' && (
                      <><br /><span className={`status status-${BADGE[p.vorreg_reaktion]}`}>{fmt(p.vorreg_reaktion_am)}</span></>
                    )}
                    {p.vorreg_wiedervorlage && (
                      <><br /><span className="muted" style={{ fontSize: 11 }}>
                        <RotateCcw size={11} style={{ verticalAlign: '-1px' }} /> {fmt(p.vorreg_wiedervorlage)}</span></>
                    )}
                  </td>
                  <td>
                    <button type="button" className="tab" style={{ padding: 0, color: 'var(--navy)', fontSize: 13, textAlign: 'left' }}
                      onClick={() => {
                        const wert = window.prompt('Notiz (nur intern, 500 Zeichen):', p.vorreg_notiz || '');
                        if (wert === null) return;
                        schritt(p.id, { notiz: wert });
                      }}>{p.vorreg_notiz ? p.vorreg_notiz.slice(0, 40) : 'notieren'}</button>
                  </td>
                </tr>
              ))}
              {!liste.length && (
                <tr><td colSpan={8} className="muted">
                  {tab === 'faellig'
                    ? 'Für heute ist die Liste leer. Entweder alle angeschrieben oder die Filter greifen zu eng.'
                    : 'Niemand fällig. Wiedervorlagen erscheinen hier, sobald die Frist abgelaufen ist.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {tab === 'trichter' && trichter && (
        <>
          <h3 style={{ color: 'var(--navy)', fontSize: 16 }}>Nach Priorität</h3>
          <Tabelle zeilen={trichter.nach_prio} />
          <h3 style={{ color: 'var(--navy)', fontSize: 16, marginTop: 22 }}>Nach Kanal</h3>
          <Tabelle zeilen={trichter.nach_kanal} />
          <h3 style={{ color: 'var(--navy)', fontSize: 16, marginTop: 22 }}>Nach Liste</h3>
          <Tabelle zeilen={trichter.nach_quelle} />
          <h3 style={{ color: 'var(--navy)', fontSize: 16, marginTop: 22 }}>Reaktionen</h3>
          <p style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {Object.entries(trichter.reaktionen).map(([k, v]) => (
              <span key={k}><span className={`status status-${BADGE[k]}`}>{REAKTION[k]}</span> {v}</span>
            ))}
          </p>
        </>
      )}
    </Layout>
  );
}

function Tabelle({ zeilen }) {
  return (
    <table className="table">
      <thead><tr>
        <th />
        <th>Vorbereitet</th><th>Angeschrieben</th><th>Reagiert</th><th>Registriert</th><th>Freigegeben</th>
        <th>Antwortquote</th><th>Registrierungsquote</th>
      </tr></thead>
      <tbody>
        {zeilen.map((z) => (
          <tr key={z.schluessel}>
            <td><strong>{z.schluessel}</strong></td>
            <td>{z.vorbereitet}</td><td>{z.angeschrieben}</td><td>{z.reagiert}</td>
            <td>{z.registriert}</td><td>{z.freigegeben}</td>
            <td>{z.quote_reaktion} %</td><td>{z.quote_registrierung} %</td>
          </tr>
        ))}
        {!zeilen.length && <tr><td colSpan={8} className="muted">Noch keine Daten.</td></tr>}
      </tbody>
    </table>
  );
}
