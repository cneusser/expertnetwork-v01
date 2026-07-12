/**
 * Gemeinsames Profilformular — genutzt vom Admin (Detailseite) und vom
 * Experten (/profil). onSave erhält das Payload-Objekt für PUT.
 */
import { useState } from 'react';

const ARBEITSMODELL = { remote: 'Remote', hybrid: 'Hybrid', vor_ort: 'Vor Ort' };

export default function ProfileForm({ expert, allowStatus = false, onSave, onCancel }) {
  const adresse = typeof expert.adresse_json === 'string' ? JSON.parse(expert.adresse_json || '{}') : (expert.adresse_json || {});
  const sprachen = typeof expert.sprachen_json === 'string' ? JSON.parse(expert.sprachen_json || '[]') : (expert.sprachen_json || []);
  const [f, setF] = useState({
    anrede: expert.anrede || '',
    titel: expert.titel || '',
    vorname: expert.vorname || '',
    nachname: expert.nachname || '',
    firma: expert.firma || '',
    berufsbezeichnung: expert.berufsbezeichnung || '',
    kurzprofil: expert.kurzprofil || '',
    strasse: adresse.strasse || '',
    plz: adresse.plz || '',
    ort_adresse: adresse.ort || '',
    land_adresse: adresse.land || '',
    telefon: expert.telefon || '',
    mobil: expert.mobil || '',
    email: expert.email || '',
    linkedin: expert.linkedin || '',
    webseite: expert.webseite || '',
    ust_id: expert.ust_id || '',
    steuernummer: expert.steuernummer || '',
    reisebereitschaft: expert.reisebereitschaft || '',
    arbeitsmodell: expert.arbeitsmodell || 'hybrid',
    sprachen: sprachen.map((s) => `${s.sprache} (${s.niveau})`).join(', '),
    status: expert.status,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = {
        anrede: f.anrede || null,
        titel: f.titel || null,
        vorname: f.vorname,
        nachname: f.nachname,
        firma: f.firma || null,
        berufsbezeichnung: f.berufsbezeichnung || null,
        kurzprofil: f.kurzprofil || null,
        adresse_json: { strasse: f.strasse, plz: f.plz, ort: f.ort_adresse, land: f.land_adresse },
        telefon: f.telefon || null,
        mobil: f.mobil || null,
        email: f.email,
        linkedin: f.linkedin || null,
        webseite: f.webseite || null,
        ust_id: f.ust_id || null,
        steuernummer: f.steuernummer || null,
        reisebereitschaft: f.reisebereitschaft || null,
        arbeitsmodell: f.arbeitsmodell,
        sprachen_json: f.sprachen
          ? f.sprachen.split(',').map((s) => {
              const m = s.trim().match(/^(.*?)\s*\((.*)\)$/);
              return m ? { sprache: m[1], niveau: m[2] } : { sprache: s.trim(), niveau: '' };
            })
          : [],
      };
      if (allowStatus) payload.status = f.status;
      await onSave(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // WICHTIG: bewusst eine Render-FUNKTION, keine Komponente — eine innerhalb
  // des Renders definierte Komponente würde bei jedem Tastendruck neu gemountet
  // und das Eingabefeld verlöre den Fokus ("Feld nicht änderbar"-Bug).
  const field = (label, k, type = 'text', span = false) => (
    <div className="field" style={span ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}</label>
      <input type={type} value={f[k]} onChange={set(k)} />
    </div>
  );

  return (
    <form onSubmit={submit} className="card" style={{ gridColumn: '1 / -1' }}>
      {error && <div className="msg msg-error">{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0 16px' }}>
        <div className="field">
          <label>Anrede</label>
          <select value={f.anrede} onChange={set('anrede')}>
            <option value="">—</option>
            <option value="herr">Herr</option>
            <option value="frau">Frau</option>
            <option value="divers">Divers</option>
          </select>
        </div>
        {field('Titel (z. B. Dr., Prof.)', 'titel')}
        {field('Vorname', 'vorname')}
        {field('Nachname', 'nachname')}
        {field('Firma', 'firma')}
        {field('Berufsbezeichnung', 'berufsbezeichnung', 'text', true)}
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Kurzprofil</label>
          <textarea rows={5} value={f.kurzprofil} onChange={set('kurzprofil')}
            style={{ width: '100%', padding: '11px 12px', border: '1px solid var(--grey-200)', borderRadius: 6, fontSize: 15, fontFamily: 'inherit' }} />
        </div>
        {field('Straße', 'strasse')}
        {field('PLZ', 'plz')}
        {field('Ort', 'ort_adresse')}
        {field('Land', 'land_adresse')}
        {field('Telefon', 'telefon')}
        {field('Mobil', 'mobil')}
        {field('E-Mail', 'email', 'email')}
        {field('LinkedIn', 'linkedin')}
        {field('Webseite', 'webseite')}
        {field('USt-ID', 'ust_id')}
        {field('Steuernummer (optional)', 'steuernummer')}
        {field('Reisebereitschaft', 'reisebereitschaft')}
        <div className="field">
          <label>Arbeitsmodell</label>
          <select value={f.arbeitsmodell} onChange={set('arbeitsmodell')}>
            {Object.entries(ARBEITSMODELL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {field('Sprachen — z. B. Deutsch (Muttersprache), Englisch (fließend)', 'sprachen', 'text', true)}
        {allowStatus && (
          <div className="field">
            <label>Status</label>
            <select value={f.status} onChange={set('status')}>
              {['eingeladen', 'registriert', 'freigegeben', 'inaktiv'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button className="btn" style={{ width: 'auto' }} disabled={busy}>{busy ? 'Speichern…' : 'Speichern'}</button>
        <button type="button" className="btn" style={{ width: 'auto', background: 'transparent', color: 'var(--navy)', border: '1px solid var(--grey-200)' }}
          onClick={onCancel}>Abbrechen</button>
      </div>
    </form>
  );
}
