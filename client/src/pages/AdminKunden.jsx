/**
 * v1.37.0 — Die Nachfrageseite.
 *
 * Bisher gab es Kundenkonten, aber keinen Ort, an dem man seine Kunden sieht.
 * Vor allem: Ein neues Kundenkonto entsteht gesperrt, und freigeben konnte man
 * es nirgends. Wer sich registriert hätte, wäre auf unbestimmte Zeit
 * ausgesperrt gewesen, ohne dass es jemandem aufgefallen wäre. Deshalb steht
 * oben, wer wartet, und zwar bevor man irgendetwas anderes sieht.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Check, Ban, ExternalLink } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '—');
const euro = (cent) => `${((Number(cent) || 0) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export default function AdminKunden() {
  const [daten, setDaten] = useState(null);
  const [filter, setFilter] = useState({ status: '', suche: '' });
  const [msg, setMsg] = useState(null);
  const [akte, setAkte] = useState(null);
  const [busy, setBusy] = useState(null);

  const laden = async () => {
    try {
      const p = new URLSearchParams(Object.entries(filter).filter(([, v]) => v !== ''));
      setDaten(await api.get(`/api/kunden?${p}`));
    } catch (e) { setMsg({ ok: false, text: e.message }); }
  };
  useEffect(() => { laden(); }, [filter.status, filter.suche]);

  const oeffne = async (id) => {
    if (akte?.kunde?.id === id) return setAkte(null);
    try { setAkte(await api.get(`/api/kunden/${id}`)); }
    catch (e) { setMsg({ ok: false, text: e.message }); }
  };

  const freigabe = async (k, frei) => {
    const frage = frei
      ? `${k.firmenname} freischalten?\n\nDer Kunde kann danach Anfragen einstellen und freigegebene Profile ansehen. Er bekommt eine Mail darüber.`
      : `${k.firmenname} sperren?\n\nDer Zugang zum Kundenbereich wird sofort blockiert. Daten bleiben erhalten.`;
    if (!window.confirm(frage)) return;
    setBusy(k.id);
    try {
      const d = await api.post(`/api/kunden/${k.id}/freigabe`, { frei });
      setMsg({ ok: true, text: d.message });
      await laden();
      if (akte?.kunde?.id === k.id) setAkte(await api.get(`/api/kunden/${k.id}`));
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(null); }
  };

  const wartend = daten?.kunden.filter((k) => !k.is_approved) || [];

  return (
    <Layout>
      <h1><Building2 size={22} style={{ verticalAlign: '-3px' }} /> Kunden</h1>
      <p className="sub">
        Wer fragt nach: Unternehmen mit eigenem Zugang, ihre Anfragen, die freigegebenen Profile
        und die daraus entstandenen Mandate.
      </p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      {wartend.length > 0 && (
        <div className="notice">
          <strong>{wartend.length} Kunde(n) warten auf Freigabe.</strong> Ohne Freigabe kommen sie
          nicht in den Kundenbereich und sehen dort nur den Hinweis, dass ihr Zugang geprüft wird.
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {wartend.map((k) => (
              <button key={k.id} type="button" className="btn"
                style={{ width: 'auto', padding: '7px 14px', fontSize: 13 }}
                disabled={busy === k.id} onClick={() => freigabe(k, true)}>
                <Check size={14} style={{ verticalAlign: '-2px' }} /> {k.firmenname} freischalten
                {k.wartet_tage > 0 && ` (wartet ${k.wartet_tage} Tage)`}
              </button>
            ))}
          </div>
        </div>
      )}

      {daten && (
        <div className="kpi-row">
          <div className="kpi"><div className="num">{daten.zahlen.gesamt}</div><div className="lbl">Kunden</div></div>
          <div className="kpi">
            <div className="num" style={{ color: daten.zahlen.wartet_auf_freigabe > 0 ? 'var(--danger)' : undefined }}>
              {daten.zahlen.wartet_auf_freigabe}
            </div>
            <div className="lbl">Warten auf Freigabe</div>
          </div>
          <div className="kpi"><div className="num">{daten.zahlen.mit_aktivem_mandat}</div><div className="lbl">Mit laufendem Mandat</div></div>
          <div className="kpi"><div className="num">{daten.zahlen.ohne_projekt}</div><div className="lbl">Freigeschaltet, ohne Anfrage</div></div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="field" style={{ flex: '0 0 190px', marginBottom: 0 }}><label>Status</label>
          <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            <option value="">alle</option>
            <option value="wartet">wartet auf Freigabe</option>
            <option value="frei">freigeschaltet</option>
          </select></div>
        <div className="field" style={{ flex: '1 1 240px', marginBottom: 0 }}><label>Suche</label>
          <input placeholder="Firma, Branche, Ansprechpartner, E-Mail" value={filter.suche}
            onChange={(e) => setFilter({ ...filter, suche: e.target.value })} /></div>
      </div>

      <table className="table">
        <thead><tr>
          <th>Firma</th><th>Ansprechpartner</th><th>Anfragen</th><th>Mandate</th><th>Zugang</th><th />
        </tr></thead>
        <tbody>
          {daten?.kunden.map((k) => (
            <tr key={k.id}>
              <td>
                <button type="button" className="tab"
                  style={{ padding: 0, color: 'var(--navy)', fontWeight: 600, textAlign: 'left' }}
                  onClick={() => oeffne(k.id)}>{k.firmenname}</button>
                {k.branche && <><br /><span className="muted" style={{ fontSize: 12 }}>{k.branche}</span></>}
              </td>
              <td style={{ fontSize: 13 }}>
                {k.ansprechpartner || <span className="muted">ohne Angabe</span>}
                <br /><span className="muted" style={{ fontSize: 12 }}>{k.email}</span>
              </td>
              <td>{k.projekte.gesamt}{k.projekte.offen > 0 && <span className="muted"> ({k.projekte.offen} offen)</span>}</td>
              <td>{k.mandate.gesamt}{k.mandate.aktiv > 0 && <span className="muted"> ({k.mandate.aktiv} aktiv)</span>}</td>
              <td>
                {k.is_approved
                  ? <span className="status status-freigegeben">freigeschaltet</span>
                  : <span className="status status-eingeladen">wartet{k.wartet_tage ? ` ${k.wartet_tage} Tage` : ''}</span>}
                {!k.email_verified_at && <><br /><span className="muted" style={{ fontSize: 11 }}>E-Mail nicht bestätigt</span></>}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {k.is_approved ? (
                  <button type="button" className="tab" style={{ padding: 0, color: 'var(--danger)' }}
                    disabled={busy === k.id} onClick={() => freigabe(k, false)}>
                    <Ban size={13} style={{ verticalAlign: '-2px' }} /> sperren
                  </button>
                ) : (
                  <button type="button" className="tab" style={{ padding: 0, color: 'var(--navy)', fontWeight: 600 }}
                    disabled={busy === k.id} onClick={() => freigabe(k, true)}>
                    <Check size={13} style={{ verticalAlign: '-2px' }} /> freischalten
                  </button>
                )}
              </td>
            </tr>
          ))}
          {daten && !daten.kunden.length && (
            <tr><td colSpan={6} className="muted">
              Noch kein Kunde. Wer sich über „Als Kunde registrieren" anmeldet, erscheint hier
              und wartet auf Deine Freigabe.
            </td></tr>
          )}
        </tbody>
      </table>

      {akte && (
        <div className="card" style={{ marginTop: 18 }}>
          <h3>{akte.kunde.firmenname}</h3>
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            {akte.kunde.ansprechpartner.anzeige || 'ohne Ansprechpartner'}
            {akte.kunde.ansprechpartner.position && `, ${akte.kunde.ansprechpartner.position}`}
            <br />{akte.kunde.email}{akte.kunde.telefon && ` · ${akte.kunde.telefon}`}
            {akte.kunde.adresse?.strasse && (
              <><br />{akte.kunde.adresse.strasse}, {akte.kunde.adresse.plz} {akte.kunde.adresse.ort}</>
            )}
            <br />Konto seit {fmt(akte.kunde.konto_seit)}
          </p>

          <div className="kpi-row" style={{ marginTop: 14 }}>
            <div className="kpi"><div className="num">{akte.zahlen.projekte}</div><div className="lbl">Anfragen</div></div>
            <div className="kpi"><div className="num">{akte.zahlen.freigaben}</div><div className="lbl">Profile vorgelegt</div></div>
            <div className="kpi"><div className="num">{akte.zahlen.rueckmeldungen}</div><div className="lbl">Davon beantwortet</div></div>
            <div className="kpi"><div className="num">{euro(akte.zahlen.umsatz_brutto_cent)}</div><div className="lbl">Berechnet (brutto)</div></div>
          </div>
          {akte.zahlen.offen_cent > 0 && (
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              Davon noch offen oder versendet: {euro(akte.zahlen.offen_cent)}
            </p>
          )}

          {akte.projekte.length > 0 && (
            <>
              <h3 style={{ marginTop: 20, fontSize: 15 }}>Anfragen</h3>
              <table className="table">
                <thead><tr><th>Projekt</th><th>Referenz</th><th>Zeitraum</th><th>Status</th></tr></thead>
                <tbody>
                  {akte.projekte.map((p) => (
                    <tr key={p.id}>
                      <td><Link to={`/admin/projekte/${p.id}`}>{p.name}</Link></td>
                      <td style={{ fontSize: 12.5 }}>{p.referenz}</td>
                      <td style={{ fontSize: 12.5 }}>{fmt(p.start)} bis {fmt(p.ende)}</td>
                      <td><span className="status">{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {akte.freigaben.length > 0 && (
            <>
              <h3 style={{ marginTop: 20, fontSize: 15 }}>Vorgelegte Profile</h3>
              <table className="table">
                <thead><tr><th>Experte</th><th>Vorgelegt</th><th>Rückmeldung</th></tr></thead>
                <tbody>
                  {akte.freigaben.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <Link to={`/admin/experten/${f.expert_id}`}>{f.vorname} {f.nachname}</Link>
                        {f.anonymized && <span className="muted" style={{ fontSize: 12 }}> (anonymisiert)</span>}
                      </td>
                      <td style={{ fontSize: 12.5 }}>{fmt(f.created_at)}</td>
                      <td style={{ fontSize: 12.5 }}>
                        {f.feedback
                          ? <>{f.feedback} <span className="muted">am {fmt(f.feedback_at)}</span></>
                          : <span className="muted">steht aus</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {akte.mandate.length > 0 && (
            <>
              <h3 style={{ marginTop: 20, fontSize: 15 }}>Mandate</h3>
              <table className="table">
                <thead><tr><th>Experte</th><th>Zeitraum</th><th>Satz Kunde</th><th>Status</th></tr></thead>
                <tbody>
                  {akte.mandate.map((m) => (
                    <tr key={m.id}>
                      <td>{m.vorname} {m.nachname}</td>
                      <td style={{ fontSize: 12.5 }}>{fmt(m.start)} bis {fmt(m.ende)}</td>
                      <td>{m.tagessatz_kunde_eur ? `${m.tagessatz_kunde_eur} €` : <span className="muted">aus Modell</span>}</td>
                      <td><span className={`status status-${m.status === 'aktiv' ? 'freigegeben' : 'inaktiv'}`}>{m.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <p style={{ marginTop: 16 }}>
            <Link to="/admin/abrechnung">Zur Abrechnung</Link>
            {akte.kunde.is_approved && (
              <>{' · '}<a href="/vendor" target="_blank" rel="noreferrer">
                Kundenbereich ansehen <ExternalLink size={12} style={{ verticalAlign: '-1px' }} />
              </a></>
            )}
          </p>
        </div>
      )}
    </Layout>
  );
}
