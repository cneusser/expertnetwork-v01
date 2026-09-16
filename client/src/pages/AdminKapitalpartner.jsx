/**
 * v1.31.0 — Verzeichnis der Kapitalpartner.
 *
 * Gebaut für eine einzige Frage im Ernstfall: Ein Mandat braucht Geld, die
 * Bilanz ist angeschlagen, wen rufe ich an? Deshalb steht der Bonitätsfilter
 * oben und nicht unten, und deshalb zeigt jede Zeile sofort, bis wohin der
 * Partner geht.
 */
import { useEffect, useState } from 'react';
import { Banknote, ExternalLink, Trash2 } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const FINANZIERUNG = {
  leasing: 'Leasing', mietkauf: 'Mietkauf', sale_and_lease_back: 'Sale and lease back',
  factoring: 'Factoring', working_capital: 'Working Capital', darlehen: 'Darlehen',
  mezzanine: 'Mezzanine', beteiligung: 'Beteiligung', buergschaft: 'Bürgschaft',
};
const BONITAET = {
  normal: 'normale Bonität', schwach: 'schwache Bonität', sanierung: 'Sanierung',
  starug: 'StaRUG', eigenverwaltung: 'Eigenverwaltung', insolvenz: 'Insolvenz',
};
/** Ab hier wird es für klassische Finanzierer unbequem. Genau das ist der Filter, der zählt. */
const IM_VERFAHREN = ['sanierung', 'starug', 'eigenverwaltung', 'insolvenz'];
const STATUS_LABEL = {
  neu: 'neu', in_pruefung: 'in Prüfung', freigegeben: 'freigegeben', abgelehnt: 'abgelehnt',
};
const STATUS_KLASSE = {
  neu: 'eingeladen', in_pruefung: 'registriert', freigegeben: 'freigegeben', abgelehnt: 'inaktiv',
};

const alsListe = (wert) => {
  if (Array.isArray(wert)) return wert;
  try { return JSON.parse(wert || '[]'); } catch { return []; }
};
const euro = (n) => (n == null ? null : Number(n).toLocaleString('de-DE'));

export default function AdminKapitalpartner() {
  const [daten, setDaten] = useState(null);
  const [filter, setFilter] = useState({ status: '', finanzierungsart: '', bonitaet: '', volumen: '', suche: '' });
  const [msg, setMsg] = useState(null);
  const [offen, setOffen] = useState(null);

  const laden = async () => {
    try {
      const p = new URLSearchParams(Object.entries(filter).filter(([, v]) => v !== ''));
      setDaten(await api.get(`/api/kapitalpartner?${p}`));
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  };
  useEffect(() => { laden(); }, [filter.status, filter.finanzierungsart, filter.bonitaet, filter.volumen, filter.suche]);

  const setzeStatus = async (p, status) => {
    try {
      const d = await api.put(`/api/kapitalpartner/${p.id}`, { status });
      setMsg({ ok: true, text: d.message }); await laden();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  };

  return (
    <Layout>
      <h1><Banknote size={22} style={{ verticalAlign: '-3px' }} /> Kapitalpartner</h1>
      <p className="sub">
        Finanzierer im Netzwerk: Leasing, Mietkauf, Factoring und Working Capital. Keine
        Verfügbarkeitsabfrage, keine Tagessätze, keine automatischen Mails. Den Kontakt stellst Du selbst her.
      </p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      {daten && (
        <div className="kpi-row">
          <div className="kpi"><div className="num">{daten.zahlen.gesamt}</div><div className="lbl">Partner gesamt</div></div>
          <div className="kpi"><div className="num">{daten.zahlen.freigegeben}</div><div className="lbl">Freigegeben</div></div>
          <div className="kpi"><div className="num">{daten.zahlen.offen}</div><div className="lbl">Warten auf Prüfung</div></div>
          <div className="kpi">
            <div className="num">{daten.zahlen.im_verfahren}</div>
            <div className="lbl">Finanzieren auch im Verfahren</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="field" style={{ flex: '0 0 170px', marginBottom: 0 }}><label>Bonitätslage</label>
          <select value={filter.bonitaet} onChange={(e) => setFilter({ ...filter, bonitaet: e.target.value })}>
            <option value="">alle</option>
            {Object.entries(BONITAET).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div className="field" style={{ flex: '0 0 170px', marginBottom: 0 }}><label>Finanzierungsart</label>
          <select value={filter.finanzierungsart} onChange={(e) => setFilter({ ...filter, finanzierungsart: e.target.value })}>
            <option value="">alle</option>
            {Object.entries(FINANZIERUNG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div className="field" style={{ flex: '0 0 150px', marginBottom: 0 }}><label>Deckt Betrag (Euro)</label>
          <input inputMode="numeric" placeholder="250000" value={filter.volumen}
            onChange={(e) => setFilter({ ...filter, volumen: e.target.value.replace(/[^\d]/g, '') })} /></div>
        <div className="field" style={{ flex: '0 0 140px', marginBottom: 0 }}><label>Status</label>
          <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            <option value="">alle</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}><label>Suche</label>
          <input placeholder="Firma, Objekt, Branche" value={filter.suche}
            onChange={(e) => setFilter({ ...filter, suche: e.target.value })} /></div>
      </div>

      <table className="table">
        <thead><tr>
          <th>Firma</th><th>Finanziert</th><th>Bis zu welcher Lage</th><th>Volumen</th>
          <th>Entscheidung</th><th>Status</th><th />
        </tr></thead>
        <tbody>
          {daten?.partner.map((p) => {
            const bon = alsListe(p.bonitaet_json);
            const hart = bon.filter((b) => IM_VERFAHREN.includes(b));
            return (
              <tr key={p.id}>
                <td>
                  <button type="button" className="tab" style={{ padding: 0, color: 'var(--navy)', fontWeight: 600, textAlign: 'left' }}
                    onClick={() => setOffen(offen === p.id ? null : p.id)}>{p.firmenname}</button>
                  {p.webseite && (
                    <>{' '}<a href={p.webseite.startsWith('http') ? p.webseite : `https://${p.webseite}`}
                      target="_blank" rel="noreferrer" title="Webseite öffnen">
                      <ExternalLink size={12} style={{ verticalAlign: '-1px' }} /></a></>
                  )}
                  <br />
                  <span className="muted" style={{ fontSize: 12 }}>
                    {[p.vorname, p.nachname].filter(Boolean).join(' ') || 'ohne Ansprechpartner'}
                    {p.email ? ` · ${p.email}` : ''}
                  </span>
                </td>
                <td style={{ fontSize: 12.5, maxWidth: 190 }}>
                  {alsListe(p.finanzierungsarten_json).map((a) => FINANZIERUNG[a] || a).join(', ') || <span className="muted">keine Angabe</span>}
                </td>
                <td style={{ fontSize: 12.5 }}>
                  {hart.length > 0
                    ? <span className="status status-freigegeben">{hart.map((b) => BONITAET[b]).join(', ')}</span>
                    : bon.length
                      ? <span className="muted">{bon.map((b) => BONITAET[b] || b).join(', ')}</span>
                      : <span className="muted">keine Angabe</span>}
                </td>
                <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                  {p.volumen_von_eur || p.volumen_bis_eur
                    ? `${euro(p.volumen_von_eur) || '?'} bis ${euro(p.volumen_bis_eur) || '?'} €`
                    : <span className="muted">offen</span>}
                </td>
                <td style={{ fontSize: 12.5 }}>
                  {p.entscheidung_tage != null ? `${p.entscheidung_tage} Tage` : <span className="muted">offen</span>}
                </td>
                <td>
                  <select value={p.status} style={{ fontSize: 12 }} onChange={(e) => setzeStatus(p, e.target.value)}>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <br /><span className={`status status-${STATUS_KLASSE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                </td>
                <td>
                  <button type="button" title="Löschen"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger, #b23a48)' }}
                    onClick={async () => {
                      if (!window.confirm(`${p.firmenname} wirklich löschen?`)) return;
                      try {
                        const d = await api.del(`/api/kapitalpartner/${p.id}`);
                        setMsg({ ok: true, text: d.message }); await laden();
                      } catch (e) { setMsg({ ok: false, text: e.message }); }
                    }}><Trash2 size={15} /></button>
                </td>
              </tr>
            );
          })}
          {daten && !daten.partner.length && (
            <tr><td colSpan={7} className="muted">
              Kein Treffer. Entweder greifen die Filter zu eng, oder es hat sich noch niemand eingetragen.
              Die öffentliche Seite liegt unter /kapitalpartner, den Link kannst Du direkt verschicken.
            </td></tr>
          )}
        </tbody>
      </table>

      {offen && daten?.partner.filter((p) => p.id === offen).map((p) => (
        <div className="card" key={p.id} style={{ marginTop: 16 }}>
          <h3>{p.firmenname}</h3>
          <p style={{ fontSize: 13.5, marginTop: 8 }}>{p.beschreibung || <span className="muted">Keine Beschreibung hinterlegt.</span>}</p>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            Objekte: {alsListe(p.objektarten_json).join(', ') || 'keine Angabe'}<br />
            Branchen: {alsListe(p.branchen_json).join(', ') || 'keine Angabe'}<br />
            Regionen: {p.regionen || 'keine Angabe'}
            {p.telefon && <><br />Telefon: {p.telefon}</>}
            {p.linkedin && <><br />LinkedIn: {p.linkedin}</>}
            <br />Herkunft: {p.quelle === 'landingpage' ? 'über die öffentliche Seite'
              : p.quelle === 'umgewandelt' ? 'aus einem Kontakt umgewandelt' : 'von Hand angelegt'}
          </p>
          {p.referenzen && <p style={{ fontSize: 13 }}>Referenzen: {p.referenzen}</p>}
          {p.notiz && <p style={{ fontSize: 13, color: 'var(--grey-600)' }}>Interne Notiz: {p.notiz}</p>}
          <button type="button" className="tab" style={{ padding: 0, color: 'var(--navy)', marginTop: 8 }}
            onClick={() => {
              const wert = window.prompt('Interne Notiz (geht nie nach außen):', p.notiz || '');
              if (wert === null) return;
              api.put(`/api/kapitalpartner/${p.id}`, { notiz: wert })
                .then(() => laden()).catch((e) => setMsg({ ok: false, text: e.message }));
            }}>Notiz bearbeiten</button>
        </div>
      ))}
    </Layout>
  );
}
