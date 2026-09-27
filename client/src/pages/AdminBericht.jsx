/**
 * v1.38.0 — Monatsbericht.
 *
 * Die Zahlen gab es alle schon, aber verstreut und immer nur als Stichtag.
 * Ob etwas wächst, sieht man erst an der Reihe der Monate. Nullen bleiben
 * stehen: In der Aufbauphase ist eine ehrliche Null aussagekräftiger als eine
 * hübsch gerechnete Kennzahl.
 */
import { useEffect, useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../api/client';

const geld = (c) => `${((Number(c) || 0) / 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`;
const monatName = (m) => {
  const [j, mo] = String(m).split('-');
  const namen = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return `${namen[Number(mo) - 1] || mo} ${j}`;
};
const kurz = (m) => {
  const [j, mo] = String(m).split('-');
  const namen = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  return `${namen[Number(mo) - 1] || mo} ${String(j).slice(2)}`;
};

const monatOptionen = () => {
  const liste = [];
  const d = new Date();
  for (let i = 0; i < 24; i += 1) {
    liste.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return liste;
};

export default function AdminBericht() {
  const [daten, setDaten] = useState(null);
  const [fehler, setFehler] = useState('');
  const heute = new Date();
  // Monat in Ortszeit bilden. Über toISOString rutscht der Monatserste in
  // jeder Zeitzone östlich von UTC in den Vormonat.
  const alsMonat = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const [zeitraum, setZeitraum] = useState({
    von: alsMonat(new Date(heute.getFullYear(), heute.getMonth() - 5, 1)),
    bis: alsMonat(heute),
  });

  useEffect(() => {
    api.get(`/api/bericht?von=${zeitraum.von}&bis=${zeitraum.bis}`)
      .then(setDaten).catch((e) => setFehler(e.message));
  }, [zeitraum.von, zeitraum.bis]);

  const optionen = monatOptionen();
  // Für die Balken den größten Wert je Reihe finden, sonst ist alles gleich hoch.
  const hoechst = (feld) => Math.max(1, ...(daten?.monate || []).map((m) => m[feld] || 0));

  return (
    <Layout>
      <h1><BarChart3 size={22} style={{ verticalAlign: '-3px' }} /> Bericht</h1>
      <p className="sub">
        Netzwerk, Ansprache, Nachfrage und Geschäft über die Zeit. In dieser Reihenfolge
        entsteht auch das Geschäft.
      </p>
      {fehler && <div className="msg msg-error">{fehler}</div>}

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="field" style={{ flex: '0 0 150px', marginBottom: 0 }}><label>Von</label>
          <select value={zeitraum.von} onChange={(e) => setZeitraum({ ...zeitraum, von: e.target.value })}>
            {optionen.map((m) => <option key={m} value={m}>{monatName(m)}</option>)}
          </select></div>
        <div className="field" style={{ flex: '0 0 150px', marginBottom: 0 }}><label>Bis</label>
          <select value={zeitraum.bis} onChange={(e) => setZeitraum({ ...zeitraum, bis: e.target.value })}>
            {optionen.map((m) => <option key={m} value={m}>{monatName(m)}</option>)}
          </select></div>
        <a className="btn" style={{ width: 'auto', padding: '9px 16px', textDecoration: 'none', marginBottom: 0 }}
          href={`/api/bericht/pdf?von=${zeitraum.von}&bis=${zeitraum.bis}`}>
          <Download size={15} style={{ verticalAlign: '-2px' }} /> Als PDF
        </a>
      </div>

      {daten && (
        <>
          <div className="kpi-row">
            <div className="kpi"><div className="num">{daten.stand.pool}</div><div className="lbl">Experten im Pool</div></div>
            <div className="kpi"><div className="num">{daten.stand.vorbereitet}</div><div className="lbl">Vorbereitete Kontakte</div></div>
            <div className="kpi">
              <div className="num">{daten.stand.kunden_freigeschaltet}</div>
              <div className="lbl">Kunden freigeschaltet{daten.stand.kunden > daten.stand.kunden_freigeschaltet
                ? ` (von ${daten.stand.kunden})` : ''}</div>
            </div>
            <div className="kpi"><div className="num">{daten.stand.projekte_offen}</div><div className="lbl">Offene Anfragen</div></div>
            <div className="kpi"><div className="num">{daten.stand.mandate_aktiv}</div><div className="lbl">Laufende Mandate</div></div>
          </div>

          <h2 className="abschnitt" style={{ marginTop: 26 }}>Entwicklung</h2>
          <table className="table">
            <thead><tr>
              <th>Monat</th><th>Zugänge</th><th>Angeschrieben</th><th>Reaktionen</th><th>Quote</th>
              <th>Anfragen</th><th>Profile vorgelegt</th><th>Mandate</th><th>Umsatz netto</th>
            </tr></thead>
            <tbody>
              {daten.monate.map((m) => (
                <tr key={m.monat}>
                  <td><strong>{kurz(m.monat)}</strong></td>
                  <td>
                    {m.zugaenge}
                    {m.zugaenge > 0 && (
                      <span style={{
                        display: 'inline-block', height: 6, borderRadius: 3, marginLeft: 8,
                        width: `${Math.round((m.zugaenge / hoechst('zugaenge')) * 46)}px`,
                        background: 'var(--pxl-primaer)', verticalAlign: 'middle',
                      }} />
                    )}
                  </td>
                  <td>{m.angeschrieben}</td>
                  <td>{m.reaktionen}</td>
                  <td>{m.angeschrieben ? `${m.quote_reaktion} %` : <span className="muted">—</span>}</td>
                  <td>{m.anfragen}</td>
                  <td>{m.profile_vorgelegt}</td>
                  <td>{m.mandate_gestartet}</td>
                  <td>{m.umsatz_cent ? geld(m.umsatz_cent) : <span className="muted">—</span>}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--grey-200)' }}>
                <td><strong>Summe</strong></td>
                <td><strong>{daten.gesamt.zugaenge}</strong></td>
                <td><strong>{daten.gesamt.angeschrieben}</strong></td>
                <td><strong>{daten.gesamt.reaktionen}</strong></td>
                <td><strong>{daten.gesamt.angeschrieben ? `${daten.gesamt.quote_reaktion} %` : '—'}</strong></td>
                <td><strong>{daten.gesamt.anfragen}</strong></td>
                <td><strong>{daten.gesamt.profile_vorgelegt}</strong></td>
                <td><strong>{daten.gesamt.mandate_gestartet}</strong></td>
                <td><strong>{geld(daten.gesamt.umsatz_cent)}</strong></td>
              </tr>
            </tbody>
          </table>

          {daten.gesamt.umsatz_cent > 0 && (
            <p style={{ fontSize: 13.5, marginTop: 10 }}>
              Berechnet {geld(daten.gesamt.umsatz_cent)} netto, ausgezahlt {geld(daten.gesamt.auszahlung_cent)},
              Marge {geld(daten.gesamt.marge_cent)}.
            </p>
          )}

          {daten.vergleich && (
            <>
              <h2 className="abschnitt" style={{ marginTop: 26 }}>
                {monatName(daten.vergleich.monat)} gegenüber {monatName(daten.vergleich.vormonat)}
              </h2>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                Verglichen wird der letzte volle Monat. Der laufende ist noch nicht vorbei und
                würde das Bild verzerren.
              </p>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {daten.vergleich.felder.map((f) => {
                  const label = {
                    zugaenge: 'Zugänge', angeschrieben: 'Ansprachen', reaktionen: 'Reaktionen',
                    anfragen: 'Anfragen', mandate_gestartet: 'Mandate', umsatz_cent: 'Umsatz',
                  }[f.feld];
                  const zeige = (w) => (f.feld === 'umsatz_cent' ? geld(w) : w);
                  return (
                    <div key={f.feld} style={{ minWidth: 120 }}>
                      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{zeige(f.jetzt)}</div>
                      <div style={{
                        fontSize: 12,
                        color: f.differenz > 0 ? 'var(--success)' : f.differenz < 0 ? 'var(--danger)' : 'var(--grey-400)',
                      }}>
                        {f.differenz === 0 ? 'unverändert' : `${f.differenz > 0 ? '+' : '−'} ${zeige(Math.abs(f.differenz))}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {daten.gesamt.umsatz_cent === 0 && (
            <div className="notice" style={{ marginTop: 22 }}>
              Im gewählten Zeitraum wurde noch kein Umsatz berechnet. Das ist kein Fehler im Bericht:
              Das Netzwerk ist im Aufbau, und die Zahlen darüber beschreiben genau diesen Aufbau.
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
