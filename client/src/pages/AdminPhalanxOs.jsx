/**
 * v1.32.0 — Verwaltung der Phalanx-OS-Anbindung.
 *
 * Die Seite beantwortet drei Fragen ohne Umweg: Steht die Verbindung, was hat
 * der letzte Abgleich gebracht, und was muss noch zurückgemeldet werden.
 * Wenn die Anbindung nicht eingerichtet ist, steht hier im Klartext, welche
 * Variable fehlt, statt einer allgemeinen Fehlermeldung.
 */
import { useEffect, useState } from 'react';
import { Link2, RefreshCw, Upload, Activity } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const fmt = (d) => (d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function AdminPhalanxOs() {
  const [daten, setDaten] = useState(null);
  const [ping, setPing] = useState(null);
  const [probe, setProbe] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);

  const laden = () => api.get('/api/phalanx-os').then(setDaten).catch((e) => setMsg({ ok: false, text: e.message }));
  useEffect(() => { laden(); }, []);

  const tun = async (was, pfad, body) => {
    setBusy(was); setMsg(null);
    try {
      const d = await api.post(pfad, body || {});
      setMsg({ ok: d.ok !== false, text: d.message });
      await laden();
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(null); }
  };

  const l = daten?.letzter_lauf;

  return (
    <Layout>
      <h1><Link2 size={22} style={{ verticalAlign: '-3px' }} /> Phalanx-OS-Anbindung</h1>
      <p className="sub">
        Anmeldung über Phalanx OS und Abgleich mit dem Datenpool. Es wird nie etwas gelöscht,
        und an Kontakte aus dem Pool geht keine automatische Post.
      </p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      {daten && !daten.eingerichtet && (
        <div className="notice">
          <strong>Noch nicht eingerichtet.</strong> In Railway fehlen diese Variablen:{' '}
          {daten.fehlende_variablen.map((v) => <code key={v} style={{ marginRight: 6 }}>{v}</code>)}
          <br />
          Trag sie im Projekt Expert Network unter Variables ein. Die Werte bekommst Du in
          Phalanx OS unter Verwaltung, SSO-Clients. Als Redirect-URI dort bitte genau
          eintragen: <code>{daten.redirect_uri}</code>
        </div>
      )}

      {daten && (
        <div className="kpi-row">
          <div className="kpi"><div className="num">{daten.zahlen.aus_dem_pool}</div><div className="lbl">Kontakte aus dem Pool</div></div>
          <div className="kpi"><div className="num">{daten.zahlen.offen_zu_melden}</div><div className="lbl">Noch zurückzumelden</div></div>
          <div className="kpi"><div className="num">{daten.zahlen.ohne_werbeeinwilligung}</div><div className="lbl">Ohne Werbeeinwilligung</div></div>
          <div className="kpi">
            <div className="num">{daten.intervall_minuten || 'aus'}</div>
            <div className="lbl">{daten.intervall_minuten ? 'Minuten Takt' : 'Abgleich abgeschaltet'}</div>
          </div>
        </div>
      )}

      {daten && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>Verbindung</h3>
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            Basis: {daten.basis_url || 'nicht gesetzt'}<br />
            Rücksprungadresse: <code>{daten.redirect_uri}</code><br />
            Segmente: {daten.tags.map((t) => <span className="tag" key={t}>{t}</span>)}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" className="btn" style={{ width: 'auto', padding: '8px 16px' }}
              disabled={busy === 'ping'}
              onClick={async () => {
                setBusy('ping'); setPing(null);
                try { setPing(await api.get('/api/phalanx-os/ping')); }
                catch (e) { setPing({ ok: false, grund: e.message }); } finally { setBusy(null); }
              }}><Activity size={14} style={{ verticalAlign: '-2px' }} /> Verbindung prüfen</button>

            <button type="button" className="btn" style={{ width: 'auto', padding: '8px 16px' }}
              disabled={busy === 'probe' || !daten.eingerichtet}
              onClick={async () => {
                setBusy('probe'); setProbe(null);
                try { setProbe(await api.get('/api/phalanx-os/probe')); }
                catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(null); }
              }}>Zahlen je Segment</button>

            <button type="button" className="btn" style={{ width: 'auto', padding: '8px 16px' }}
              disabled={busy === 'sync' || !daten.eingerichtet}
              onClick={() => tun('sync', '/api/phalanx-os/sync')}>
              <RefreshCw size={14} style={{ verticalAlign: '-2px' }} /> Jetzt synchronisieren</button>

            <button type="button" className="tab" style={{ padding: 0, color: 'var(--navy)' }}
              disabled={busy === 'melden' || !daten.eingerichtet}
              onClick={() => tun('melden', '/api/phalanx-os/melden')}>
              <Upload size={13} style={{ verticalAlign: '-2px' }} /> Ankünfte zurückmelden</button>
          </div>

          {ping && (
            <p style={{ marginTop: 12, fontSize: 13.5 }}>
              {ping.ok
                ? <span className="status status-freigegeben">Verbindung steht, Aussteller {ping.issuer}, Leseprobe erfolgreich</span>
                : <span className="status status-inaktiv">Keine Verbindung: {ping.grund}</span>}
            </p>
          )}

          {probe && (
            <table className="table" style={{ marginTop: 12 }}>
              <thead><tr><th>Segment</th><th>Kontakte</th><th>Beispiel</th></tr></thead>
              <tbody>
                {probe.segmente.map((s) => (
                  <tr key={s.tag}>
                    <td><strong>{s.tag}</strong></td>
                    <td>{s.fehler ? <span className="muted">Fehler</span> : s.anzahl}</td>
                    <td style={{ fontSize: 12.5 }} className="muted">
                      {s.fehler || s.beispiel?.[0]
                        ? (s.fehler || `${s.beispiel[0].vorname} ${s.beispiel[0].nachname}, ${s.beispiel[0].firma || 'ohne Firma'}`)
                        : 'leer'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {l && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3>Letzter Abgleich</h3>
          <p style={{ fontSize: 13.5, marginTop: 6 }}>
            {fmt(l.gestartet_am)} · {l.ausloeser === 'hand' ? 'von Hand' : 'automatisch'}
            {l.fehlertext && <><br /><span className="status status-inaktiv">Abgebrochen: {l.fehlertext}</span></>}
          </p>
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            {l.gelesen} gelesen · <strong>{l.neu} neu vorbereitet</strong> · {l.angereichert} ergänzt ·{' '}
            {l.mehrdeutig} zum Prüfen · {l.fehler} Fehler
          </p>
          {l.mehrdeutig > 0 && (
            <p style={{ fontSize: 13, marginTop: 6 }}>
              Bei {l.mehrdeutig} Kontakten war der Name nicht eindeutig. Die haben wir nicht geraten,
              sie liegen in der Expertenliste unter „Zuordnung prüfen".
            </p>
          )}
        </div>
      )}

      {daten?.laeufe?.length > 0 && (
        <>
          <h2 className="abschnitt">Verlauf</h2>
          <table className="table">
            <thead><tr>
              <th>Zeitpunkt</th><th>Art</th><th>Auslöser</th><th>Gelesen</th><th>Neu</th>
              <th>Ergänzt</th><th>Geprüft</th><th>Gemeldet</th><th>Fehler</th>
            </tr></thead>
            <tbody>
              {daten.laeufe.map((x) => (
                <tr key={x.id}>
                  <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmt(x.gestartet_am)}</td>
                  <td style={{ fontSize: 12.5 }}>{x.art === 'melden' ? 'melden' : 'lesen'}</td>
                  <td style={{ fontSize: 12.5 }}>{x.ausloeser === 'hand' ? 'von Hand' : 'automatisch'}</td>
                  <td>{x.gelesen}</td><td>{x.neu}</td><td>{x.angereichert}</td>
                  <td>{x.mehrdeutig}</td><td>{x.gemeldet}</td>
                  <td>{x.fehler > 0 ? <span className="status status-inaktiv">{x.fehler}</span> : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Layout>
  );
}
