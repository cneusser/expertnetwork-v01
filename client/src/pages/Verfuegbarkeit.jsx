/** Öffentliche Ein-Klick-Bestätigungsseite (Token aus der Erinnerungs-Mail, KEIN Login). */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import Logo from '../components/Logo';

const AVAIL_LABEL = { sofort: 'Sofort verfügbar', ab_datum: 'Verfügbar ab Datum', teilweise: 'Teilweise verfügbar', ausgebucht: 'Ausgebucht' };

export default function Verfuegbarkeit() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [ctx, setCtx] = useState(null);
  const [mode, setMode] = useState('ask'); // ask | edit | done | error
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ status: 'sofort', ab_datum: '', auslastung_prozent: '', kommentar: '' });

  useEffect(() => {
    api.get(`/api/availability/context?token=${encodeURIComponent(token || '')}`)
      .then((d) => {
        setCtx(d);
        if (d.latest) {
          setForm({
            status: d.latest.status,
            ab_datum: d.latest.ab_datum ? d.latest.ab_datum.slice(0, 10) : '',
            auslastung_prozent: d.latest.auslastung_prozent || '',
            kommentar: '',
          });
        }
      })
      .catch((e) => { setMode('error'); setMsg(e.message); });
  }, [token]);

  const confirm = async () => {
    try {
      const d = await api.post('/api/availability/confirm', { token });
      setMode('done'); setMsg(d.message);
    } catch (e) { setMode('error'); setMsg(e.message); }
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const d = await api.post('/api/availability/update', {
        token,
        status: form.status,
        ab_datum: form.ab_datum || null,
        auslastung_prozent: form.auslastung_prozent ? Number(form.auslastung_prozent) : null,
        kommentar: form.kommentar || undefined,
      });
      setMode('done'); setMsg(d.message);
    } catch (err) { setMsg(err.message); }
  };

  const latest = ctx?.latest;
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Logo />
        <h1>Verfügbarkeit bestätigen</h1>
        {mode === 'error' && <div className="msg msg-error">{msg || 'Link ungültig oder abgelaufen.'}</div>}
        {mode === 'done' && <div className="msg msg-success">{msg}</div>}
        {ctx && mode === 'ask' && (
          <>
            <p className="sub">Guten Tag {ctx.vorname} — stimmt Ihre hinterlegte Verfügbarkeit noch?</p>
            {latest ? (
              <div className="consent-box" style={{ maxHeight: 'none' }}>
                <strong>{AVAIL_LABEL[latest.status]}</strong>
                {latest.auslastung_prozent ? ` · ${latest.auslastung_prozent} %` : ''}
                {latest.ab_datum ? ` · ab ${new Date(latest.ab_datum).toLocaleDateString('de-DE')}` : ''}
              </div>
            ) : <p className="sub">Noch keine Verfügbarkeit hinterlegt.</p>}
            {latest && <button className="btn" onClick={confirm}>Ja, unverändert — bestätigen</button>}
            <button className="btn" style={{ marginTop: 10, background: 'transparent', color: 'var(--navy)', border: '1px solid var(--grey-200)' }}
              onClick={() => setMode('edit')}>Ändern…</button>
          </>
        )}
        {ctx && mode === 'edit' && (
          <form onSubmit={submit}>
            {msg && <div className="msg msg-error">{msg}</div>}
            <div className="field">
              <label>Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {Object.entries(AVAIL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {['ab_datum', 'teilweise'].includes(form.status) && (
              <div className="field">
                <label>Verfügbar ab</label>
                <input type="date" value={form.ab_datum} onChange={(e) => setForm({ ...form, ab_datum: e.target.value })} />
              </div>
            )}
            {form.status !== 'ausgebucht' && (
              <div className="field">
                <label>Auslastung</label>
                <select value={form.auslastung_prozent} onChange={(e) => setForm({ ...form, auslastung_prozent: e.target.value })}>
                  <option value="">—</option>
                  {[20, 40, 60, 80, 100].map((p) => <option key={p} value={p}>{p} %</option>)}
                </select>
              </div>
            )}
            <div className="field">
              <label>Kommentar (optional)</label>
              <input type="text" maxLength={300} value={form.kommentar} onChange={(e) => setForm({ ...form, kommentar: e.target.value })} />
            </div>
            <button className="btn">Speichern</button>
          </form>
        )}
      </div>
    </div>
  );
}
