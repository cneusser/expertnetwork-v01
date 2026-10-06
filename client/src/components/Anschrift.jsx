/**
 * v1.41.0 — Anschrift anzeigen und erfassen.
 *
 * Eine Stelle für beides, damit Expertenakte, Kundenakte und Registrierung
 * nicht dreimal leicht verschieden aussehen.
 *
 * Die Anzeigezeile wird hier gerechnet und nirgends gespeichert. Dieselbe
 * Regel wie auf dem Server, nur eben für den Bildschirm.
 */
const LAENDER = {
  DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz', LI: 'Liechtenstein',
  NL: 'Niederlande', BE: 'Belgien', LU: 'Luxemburg', FR: 'Frankreich',
  IT: 'Italien', ES: 'Spanien', PL: 'Polen', CZ: 'Tschechien',
  DK: 'Dänemark', SE: 'Schweden', GB: 'Vereinigtes Königreich', US: 'USA',
};

export function anschriftZeilen(a = {}, eigenesLand = 'DE') {
  const f = (w) => String(w ?? '').trim();
  const zeilen = [];
  const str = [f(a.strasse), f(a.hausnummer)].filter(Boolean).join(' ');
  if (str) zeilen.push(str);
  if (f(a.adresszusatz)) zeilen.push(f(a.adresszusatz));
  const ort = [f(a.plz), f(a.ort)].filter(Boolean).join(' ');
  if (ort) zeilen.push(ort);
  const land = f(a.land).toUpperCase();
  if (land && land !== eigenesLand) zeilen.push(LAENDER[land] || land);
  return zeilen;
}

/** Nur anzeigen. Fehlt alles, steht das auch da, statt einer leeren Lücke. */
export function Anschrift({ a, leer = '—' }) {
  const zeilen = anschriftZeilen(a || {});
  if (!zeilen.length) return <span className="muted">{leer}</span>;
  return <>{zeilen.map((z, i) => <span key={i}>{z}{i < zeilen.length - 1 && <br />}</span>)}</>;
}

/**
 * Die Eingabefelder.
 *
 * Straße und Hausnummer getrennt, Postleitzahl als Text. Ein Zahlenfeld
 * würde aus 01067 eine 1067 machen, und aus "28a" gar nichts.
 */
export function AnschriftFelder({ werte = {}, setzen, praefix = '' }) {
  const k = (name) => `${praefix}${name}`;
  const v = (name) => werte[k(name)] ?? werte[name] ?? '';
  const auf = (name) => (e) => setzen(k(name), e.target.value);

  return (
    <>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="field" style={{ flex: '1 1 70%' }}>
          <label>Straße</label>
          <input value={v('strasse')} onChange={auf('strasse')} placeholder="ohne Hausnummer" />
        </div>
        <div className="field" style={{ flex: '0 0 110px' }}>
          <label>Hausnummer</label>
          <input value={v('hausnummer')} onChange={auf('hausnummer')} placeholder="28a" />
        </div>
      </div>
      <div className="field">
        <label>Adresszusatz <span className="muted">optional</span></label>
        <input value={v('adresszusatz')} onChange={auf('adresszusatz')} placeholder="c/o, Gebäude, Stockwerk" />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="field" style={{ flex: '0 0 110px' }}>
          <label>PLZ</label>
          {/* Text, nicht Zahl: 01067 wäre als Zahl 1067. */}
          <input value={v('plz')} onChange={auf('plz')} inputMode="numeric" maxLength={10} />
        </div>
        <div className="field" style={{ flex: '1 1 auto' }}>
          <label>Ort</label>
          <input value={v('ort')} onChange={auf('ort')} />
        </div>
        <div className="field" style={{ flex: '0 0 170px' }}>
          <label>Land</label>
          <select value={(v('land') || 'DE').toUpperCase()} onChange={auf('land')}>
            {Object.entries(LAENDER).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </div>
      </div>
    </>
  );
}

export default Anschrift;
