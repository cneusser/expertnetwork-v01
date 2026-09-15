/**
 * Tagessatz erfassen. Genutzt von der Expertenakte im Admin und von /profil.
 *
 * v1.30.0: Rückmeldung aus der Praxis. Ein Experte hat seinen Satz eintragen
 * wollen, ein "Bearbeiten" gesucht und keins gefunden. Es gibt auch keins:
 * Sätze werden nie überschrieben, sondern fortgeschrieben, damit die Historie
 * lückenlos bleibt. Nur stand das nirgends. Deshalb heißt der Vorgang jetzt
 * "ändern", das Formular übernimmt den bisherigen Wert als Ausgangspunkt, und
 * ein Satz darunter erklärt, warum der alte Eintrag stehen bleibt.
 */
import { useEffect, useState } from 'react';

const KATEGORIEN = { remote: 'Remote', vor_ort: 'Vor Ort', interim: 'Interim', projektleitung: 'Projektleitung', beratung: 'Beratung' };
const HEUTE = () => new Date().toLocaleDateString('sv-SE');

export default function RateForm({ onSave, vorbelegung = null, aufAbbruch = null, lang = 'de' }) {
  const t = (de, en) => (lang === 'en' ? en : de);
  const leer = { kategorie: 'interim', von: '', bis: '', ab: HEUTE() };
  const [f, setF] = useState(leer);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // Beim Ändern eines bestehenden Satzes mit dessen Werten starten. Das Datum
  // bleibt bewusst auf heute, denn der neue Satz gilt ab jetzt.
  useEffect(() => {
    if (!vorbelegung) return;
    setF({
      kategorie: vorbelegung.kategorie,
      von: String(vorbelegung.satz_von_eur ?? ''),
      bis: vorbelegung.satz_bis_eur ? String(vorbelegung.satz_bis_eur) : '',
      ab: HEUTE(),
    });
    setMsg(null);
  }, [vorbelegung?.id]);

  const aendert = Boolean(vorbelegung);

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      await onSave({
        kategorie: f.kategorie,
        satz_von_eur: Number(f.von),
        satz_bis_eur: f.bis ? Number(f.bis) : null,
        gueltig_ab: f.ab,
      });
      setMsg({
        ok: true,
        text: aendert
          ? t('Geändert. Ab sofort gilt der neue Satz, der alte bleibt in der Historie stehen.',
            'Updated. The new rate applies from now on, the previous one stays in the history.')
          : t('Satz erfasst. Die Historie bleibt erhalten.', 'Rate recorded. The history is preserved.'),
      });
      setF({ ...leer, kategorie: f.kategorie });
      if (aufAbbruch) aufAbbruch();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card" style={{ marginTop: 16 }}>
      <h3>
        {aendert
          ? t(`${KATEGORIEN[vorbelegung.kategorie] || vorbelegung.kategorie} ändern`,
            `Change ${KATEGORIEN[vorbelegung.kategorie] || vorbelegung.kategorie}`)
          : t('Tagessatz erfassen', 'Record daily rate')}
      </h3>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
        {t('Ein Tagessatz wird nie überschrieben, sondern fortgeschrieben. Der neue Wert gilt ab dem Datum, das Du angibst, der alte bleibt als Historie stehen. Es gibt deshalb kein Bearbeiten, sondern nur diesen Weg.',
          'A daily rate is never overwritten, it is continued. The new value applies from the date you set, the previous one stays as history. That is why there is no edit, only this way.')}
      </p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`} style={{ marginTop: 10 }}>{msg.text}</div>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
        <div className="field" style={{ marginBottom: 0, minWidth: 160 }}>
          <label>{t('Kategorie', 'Category')}</label>
          <select value={f.kategorie} disabled={aendert}
            onChange={(e) => setF({ ...f, kategorie: e.target.value })}>
            {Object.entries(KATEGORIEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, width: 120 }}>
          <label>{t('Satz von (€)', 'Rate from (€)')}</label>
          <input type="number" min="1" required value={f.von} onChange={(e) => setF({ ...f, von: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 0, width: 120 }}>
          <label>{t('bis (optional)', 'to (optional)')}</label>
          <input type="number" min="1" value={f.bis} onChange={(e) => setF({ ...f, bis: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>{t('Gültig ab', 'Valid from')}</label>
          <input type="date" required value={f.ab} onChange={(e) => setF({ ...f, ab: e.target.value })} />
        </div>
        <button className="btn" style={{ width: 'auto' }} disabled={busy}>
          {aendert ? t('Neuen Satz speichern', 'Save new rate') : t('Erfassen', 'Record')}
        </button>
        {aendert && aufAbbruch && (
          <button type="button" className="tab" style={{ padding: 0, color: 'var(--grey-600)' }}
            onClick={() => { setF(leer); aufAbbruch(); }}>{t('Abbrechen', 'Cancel')}</button>
        )}
      </div>
    </form>
  );
}
