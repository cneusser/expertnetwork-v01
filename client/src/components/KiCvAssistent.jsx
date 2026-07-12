/**
 * Sprint 9 — KI-CV-Assistent: PDF hochladen → Vorschlags-Diff → selektiv übernehmen.
 * Genutzt vom Experten (/profil) und vom Admin (Detailseite, expertId gesetzt).
 */
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api } from '../api/client';

const SKILL_STATUS = {
  vorhanden: { label: 'bereits im Profil', color: 'var(--grey-400)' },
  neu_verknuepfen: { label: 'neu (aus Taxonomie)', color: 'var(--success)' },
  neu_in_taxonomie: { label: 'neuer Begriff', color: '#d99b1f' },
};

export default function KiCvAssistent({ expertId = null, onApplied }) {
  const [busy, setBusy] = useState(false);
  const [sug, setSug] = useState(null);
  const [sel, setSel] = useState({ berufsbezeichnung: false, kurzprofil: false, skills: [] });
  const [msg, setMsg] = useState(null);

  const extract = async (file) => {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (expertId) fd.append('expert_id', expertId);
      const d = await api.upload('/api/ai/extract', fd);
      setSug(d.suggestion);
      setSel({
        berufsbezeichnung: false,
        kurzprofil: false,
        skills: d.suggestion.skills.filter((s) => s.status !== 'vorhanden').map((s) => s.name),
      });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const d = await api.post('/api/ai/apply', {
        ...(expertId ? { expert_id: Number(expertId) } : {}),
        berufsbezeichnung: sel.berufsbezeichnung ? sug.berufsbezeichnung.neu : null,
        kurzprofil: sel.kurzprofil ? sug.kurzprofil.neu : null,
        skills: sug.skills.filter((s) => sel.skills.includes(s.name) && s.status !== 'vorhanden')
          .map((s) => ({ name: s.name, kategorie: s.kategorie })),
      });
      setMsg({ ok: true, text: d.message });
      setSug(null);
      onApplied?.();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3><Sparkles size={16} /> KI-Assistent: Profil aus CV aktualisieren</h3>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`} style={{ marginTop: 10 }}>{msg.text}</div>}
      {!sug && (
        <>
          <p style={{ margin: '8px 0' }}>
            Aktuellen Lebenslauf (PDF) hochladen — die KI erkennt Skills, Rollen und Kurzprofil
            und erstellt einen Vorschlag. <strong>Nichts wird ohne Ihre Bestätigung geändert.</strong>
          </p>
          <input type="file" accept="application/pdf" disabled={busy} onChange={(e) => extract(e.target.files[0])} />
          {busy && <p className="muted" style={{ marginTop: 8 }}>KI analysiert den Lebenslauf…</p>}
        </>
      )}
      {sug && (
        <div style={{ marginTop: 10 }}>
          {sug.berufsbezeichnung.neu && sug.berufsbezeichnung.neu !== sug.berufsbezeichnung.alt && (
            <label className="consent-check" style={{ alignItems: 'flex-start' }}>
              <input type="checkbox" checked={sel.berufsbezeichnung} onChange={(e) => setSel({ ...sel, berufsbezeichnung: e.target.checked })} />
              <span><strong>Berufsbezeichnung:</strong>{' '}
                <span style={{ color: 'var(--danger)', textDecoration: 'line-through' }}>{sug.berufsbezeichnung.alt || '—'}</span>{' → '}
                <span style={{ color: 'var(--success)' }}>{sug.berufsbezeichnung.neu}</span></span>
            </label>
          )}
          {sug.kurzprofil.neu && (
            <label className="consent-check" style={{ alignItems: 'flex-start' }}>
              <input type="checkbox" checked={sel.kurzprofil} onChange={(e) => setSel({ ...sel, kurzprofil: e.target.checked })} />
              <span><strong>Kurzprofil (neu):</strong> {sug.kurzprofil.neu}</span>
            </label>
          )}
          <p style={{ margin: '10px 0 4px' }}><strong>Erkannte Skills</strong> — Auswahl wird übernommen:</p>
          <p>
            {sug.skills.map((s) => {
              const st = SKILL_STATUS[s.status];
              const checked = sel.skills.includes(s.name);
              return (
                <label key={s.name} className="tag" style={{ cursor: s.status === 'vorhanden' ? 'default' : 'pointer', opacity: s.status === 'vorhanden' ? 0.55 : 1 }}>
                  <input type="checkbox" disabled={s.status === 'vorhanden'} checked={s.status === 'vorhanden' ? true : checked}
                    onChange={() => setSel({ ...sel, skills: checked ? sel.skills.filter((x) => x !== s.name) : [...sel.skills, s.name] })}
                    style={{ marginRight: 4 }} />
                  {s.name} <span style={{ color: st.color, fontSize: 11 }}>({st.label})</span>
                </label>
              );
            })}
          </p>
          {(sug.senioritaet || sug.jahre_erfahrung) && (
            <p className="muted">Einschätzung: {sug.senioritaet || ''}{sug.jahre_erfahrung ? ` · ${sug.jahre_erfahrung} Jahre Erfahrung` : ''}
              {sug.projektarten?.length ? ` · ${sug.projektarten.join(', ')}` : ''}</p>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn" style={{ width: 'auto' }} disabled={busy} onClick={apply}>Ausgewähltes übernehmen</button>
            <button className="btn" style={{ width: 'auto', background: 'transparent', color: 'var(--navy)', border: '1px solid var(--grey-200)' }}
              onClick={() => setSug(null)}>Verwerfen</button>
          </div>
        </div>
      )}
    </div>
  );
}
