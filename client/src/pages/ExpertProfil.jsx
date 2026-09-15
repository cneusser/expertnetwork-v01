/** Self-Service: Experte pflegt Profil und Tagessätze selbst. */
import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import Layout from '../components/Layout';
import ProfileForm from '../components/ProfileForm';
import FotoAvatar from '../components/FotoAvatar';
import RateForm from '../components/RateForm';
import KiCvAssistent from '../components/KiCvAssistent';
import { api } from '../api/client';
import { useLang, tr } from '../i18n';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '—');
const KATEGORIE_LABEL = {
  remote: 'Remote', vor_ort: 'Vor Ort', interim: 'Interim',
  projektleitung: 'Projektleitung', beratung: 'Beratung',
};

/**
 * Sätze sind insert-only. Je Kategorie gilt der jüngste Eintrag, dessen
 * Gültigkeit schon begonnen hat. Alles andere ist Historie. Vorher standen
 * beide Gruppen ununterscheidbar in einer Tabelle, und niemand sah, was
 * gerade gilt.
 */
function teileSaetze(rates) {
  const heute = new Date().toLocaleDateString('sv-SE');
  const sortiert = [...(rates || [])].sort((a, b) =>
    String(b.gueltig_ab).localeCompare(String(a.gueltig_ab)) || b.id - a.id);
  const aktuell = [];
  const gesehen = new Set();
  const rest = [];
  for (const r of sortiert) {
    const gilt = String(r.gueltig_ab).slice(0, 10) <= heute;
    if (gilt && !gesehen.has(r.kategorie)) { gesehen.add(r.kategorie); aktuell.push(r); } else rest.push(r);
  }
  return { aktuell, rest };
}

export default function ExpertProfil() {
  const { lang } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [aendere, setAendere] = useState(null);

  const load = () => api.get('/api/experts/me').then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  // Der Router springt nicht von allein zu einem Anker, und beim ersten Rendern
  // steht der Abschnitt noch gar nicht da. Deshalb erst nach den Daten suchen.
  useEffect(() => {
    if (!data || !window.location.hash) return;
    const ziel = document.getElementById(window.location.hash.slice(1));
    if (ziel) setTimeout(() => ziel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }, [data]);

  if (error) return <Layout><div className="msg msg-error">{error}</div></Layout>;
  if (!data) return <Layout><p className="sub">Laden…</p></Layout>;
  const { expert, skills, rates, documents, educations = [], career_steps = [] } = data;
  const { aktuell: aktuelleSaetze, rest: historie } = teileSaetze(rates);

  return (
    <Layout>
      <h1>{tr(lang, 'Mein Profil', 'My profile')}</h1>
      <p className="sub">{expert.berufsbezeichnung}</p>
      {saved && <div className="msg msg-success">{tr(lang, 'Profil gespeichert, vielen Dank.', 'Profile saved, thank you.')}</div>}

      {editing ? (
        <div className="detail-grid">
          <ProfileForm
            expert={expert}
            onSave={async (payload) => {
              await api.put('/api/experts/me', payload);
              setEditing(false);
              setSaved(true);
              await load();
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <>
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <FotoAvatar expertId={expert.id} size={64} editable uploadUrl="/api/experts/me/foto" />
              <div>
                <h3>{expert.vorname} {expert.nachname}</h3>
                <p className="muted">{expert.firma} · {expert.email} · {expert.mobil}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <a href="/api/experts/me/profil-pptx" className="btn" style={{ width: 'auto', padding: '8px 16px', textDecoration: 'none', background: 'transparent', color: 'var(--navy)', border: '1px solid var(--grey-200)' }}>
                {tr(lang, 'Mein Profil als PPTX', 'My profile as PPTX')}
              </a>
              <button className="btn" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => { setSaved(false); setEditing(true); }}>
                <Pencil size={14} /> {tr(lang, 'Bearbeiten', 'Edit')}
              </button>
            </div>
          </div>
          <div className="detail-grid">
            <div className="card">
              <h3 id="kurzprofil">{tr(lang, 'Kurzprofil', 'Summary')}</h3>
              <p>{expert.kurzprofil || '—'}</p>
            </div>
            <div className="card">
              <h3 id="skills">{tr(lang, 'Meine Skills', 'My skills')}</h3>
              <p>{skills.map((s) => (
                <span className="tag" key={s.id} title={s.is_approved === false ? tr(lang, 'Wird von Phalanx geprüft', 'Pending review by Phalanx') : undefined}
                  style={s.is_approved === false ? { opacity: 0.6, fontStyle: 'italic' } : undefined}>
                  {s.name}{' '}
                  <span style={{ cursor: 'pointer', fontWeight: 700 }}
                    onClick={async () => { await api.del(`/api/experts/me/skills/${s.id}`); load(); }}>×</span>
                </span>
              ))}</p>
              <form style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.target);
                  const d = await api.post('/api/experts/me/skills', Object.fromEntries(fd));
                  if (d.hinweis) window.alert(d.hinweis);
                  e.target.reset(); load();
                }}>
                <input type="text" name="name" required placeholder={tr(lang, 'Skill hinzufügen…', 'Add a skill…')} style={{ flex: '1 1 140px', border: '1px solid var(--grey-200)', borderRadius: 6, padding: '7px 10px', fontSize: 14 }} />
                <select name="kategorie" style={{ fontSize: 13 }}>
                  <option value="kompetenz">{tr(lang, 'Kompetenz', 'Competence')}</option>
                  <option value="branche">{tr(lang, 'Branche', 'Industry')}</option>
                  <option value="rolle">{tr(lang, 'Rolle', 'Role')}</option>
                  <option value="technologie">{tr(lang, 'Technologie', 'Technology')}</option>
                  <option value="zertifikat">{tr(lang, 'Zertifikat', 'Certificate')}</option>
                </select>
                <button className="btn" style={{ width: 'auto', padding: '7px 14px' }}>+</button>
              </form>
              <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>{tr(lang, 'Neue Begriffe prüft Phalanx kurz, bevor sie in der Suche erscheinen.', 'New terms are briefly reviewed by Phalanx before they appear in search.')}</p>
            </div>
            <div className="card">
              <h3 id="dokumente">{tr(lang, 'Meine Dokumente', 'My documents')}</h3>
              {documents.map((d) => (
                <p key={d.id} style={{ fontSize: 13, padding: '3px 0' }}>
                  <a href={`/api/experts/${expert.id}/documents/${d.id}/view`} target="_blank" rel="noreferrer">{d.filename}</a>
                  <span className="muted"> · {d.kategorie} · v{d.version}</span>{' '}
                  <button type="button" className="tab" style={{ padding: 0, color: '#b23a48', fontSize: 13 }}
                    onClick={async () => {
                      if (!window.confirm(tr(lang, `${d.filename} wirklich löschen?`, `Really delete ${d.filename}?`))) return;
                      try { await api.del(`/api/experts/me/documents/${d.id}`); load(); }
                      catch (err) { window.alert(err.message); }
                    }}>{tr(lang, 'Löschen', 'Delete')}</button>
                </p>
              ))}
              <form style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.target);
                  if (!fd.get('file') || !fd.get('file').name) return;
                  const res = await fetch('/api/experts/me/documents', { method: 'POST', body: fd, credentials: 'include' });
                  const d = await res.json();
                  if (!res.ok) { window.alert(d.error || 'Upload fehlgeschlagen'); return; }
                  e.target.reset(); load();
                }}>
                <select name="kategorie" style={{ fontSize: 13 }}>
                  <option value="cv">CV</option>
                  <option value="referenz">{tr(lang, 'Referenz', 'Reference')}</option>
                  <option value="zertifikat">{tr(lang, 'Zertifikat', 'Certificate')}</option>
                  <option value="projektliste">{tr(lang, 'Projektliste', 'Project list')}</option>
                  <option value="one_pager">One-Pager</option>
                </select>
                <input type="file" name="file" accept="application/pdf" required style={{ fontSize: 12 }} />
                <button className="btn" style={{ width: 'auto', padding: '7px 14px' }}>{tr(lang, 'Hochladen', 'Upload')}</button>
              </form>
              <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>{tr(lang, 'PDF, max. 10 MB. Jeder Upload erzeugt eine neue Version, nichts wird überschrieben.', 'PDF, max. 10 MB. Every upload creates a new version, nothing is overwritten.')}</p>
            </div>
          </div>
        </>
      )}

      <KiCvAssistent onApplied={load} />

      <h2 id="stationen" style={{ fontSize: 18, color: 'var(--navy)', margin: '28px 0 12px' }}>{tr(lang, 'Karrierestationen & Referenzprojekte', 'Career steps & reference projects')}</h2>
      <div className="card">
        {career_steps.map((c) => (
          <p key={c.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--grey-200)', fontSize: 14 }}>
            <strong>{c.rolle}</strong>{c.firma ? ` — ${c.firma}` : ''}{c.zeitraum ? ` (${c.zeitraum})` : ''}
            {c.ergebnis && <span className="muted"> · {c.ergebnis}</span>}
            <button type="button" className="tab" style={{ padding: '0 0 0 10px', color: 'var(--danger)' }}
              onClick={async () => { await api.del(`/api/experts/me/career-steps/${c.id}`); load(); }}>{tr(lang, 'Entfernen', 'Remove')}</button>
          </p>
        ))}
        <form style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            await api.post('/api/experts/me/career-steps', Object.fromEntries(fd));
            e.target.reset(); load();
          }}>
          <div className="field" style={{ marginBottom: 0, minWidth: 180 }}><label>Rolle *</label><input name="rolle" required /></div>
          <div className="field" style={{ marginBottom: 0, minWidth: 160 }}><label>Firma</label><input name="firma" /></div>
          <div className="field" style={{ marginBottom: 0, width: 130 }}><label>Zeitraum</label><input name="zeitraum" placeholder="2024 – heute" /></div>
          <div className="field" style={{ marginBottom: 0, flex: '1 1 220px' }}><label>Kern-Ergebnis</label><input name="ergebnis" /></div>
          <button className="btn" style={{ width: 'auto' }}>{tr(lang, 'Hinzufügen', 'Add')}</button>
        </form>
      </div>

      <h2 id="ausbildung" style={{ fontSize: 18, color: 'var(--navy)', margin: '28px 0 12px' }}>{tr(lang, 'Ausbildung', 'Education')}</h2>
      <div className="card">
        {educations.map((c) => (
          <p key={c.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--grey-200)', fontSize: 14 }}>
            <strong>{c.abschluss}</strong>{c.institution ? ` — ${c.institution}` : ''}{c.zeitraum ? ` (${c.zeitraum})` : ''}
            <button type="button" className="tab" style={{ padding: '0 0 0 10px', color: 'var(--danger)' }}
              onClick={async () => { await api.del(`/api/experts/me/educations/${c.id}`); load(); }}>{tr(lang, 'Entfernen', 'Remove')}</button>
          </p>
        ))}
        <form style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            await api.post('/api/experts/me/educations', Object.fromEntries(fd));
            e.target.reset(); load();
          }}>
          <div className="field" style={{ marginBottom: 0, minWidth: 200 }}><label>Abschluss *</label><input name="abschluss" required /></div>
          <div className="field" style={{ marginBottom: 0, minWidth: 180 }}><label>Institution</label><input name="institution" /></div>
          <div className="field" style={{ marginBottom: 0, width: 130 }}><label>Zeitraum</label><input name="zeitraum" /></div>
          <button className="btn" style={{ width: 'auto' }}>{tr(lang, 'Hinzufügen', 'Add')}</button>
        </form>
      </div>

      <h2 id="tagessaetze" style={{ fontSize: 18, color: 'var(--navy)', margin: '28px 0 12px' }}>{tr(lang, 'Meine Tagessätze', 'My daily rates')}</h2>
      {aktuelleSaetze.length === 0 ? (
        <div className="notice">
          {tr(lang, 'Du hast noch keinen Tagessatz hinterlegt. Trag unten mindestens einen ein, sonst können wir dich bei Anfragen nicht vorschlagen.',
            'You have not set a daily rate yet. Add at least one below, otherwise we cannot propose you for requests.')}
        </div>
      ) : (
        <table className="table">
          <thead><tr>
            <th>{tr(lang, 'Kategorie', 'Category')}</th><th>{tr(lang, 'Gilt aktuell', 'Currently valid')}</th>
            <th>{tr(lang, 'Seit', 'Since')}</th><th />
          </tr></thead>
          <tbody>
            {aktuelleSaetze.map((r) => (
              <tr key={r.id}>
                <td><strong>{KATEGORIE_LABEL[r.kategorie] || r.kategorie}</strong></td>
                <td>{r.satz_von_eur}{r.satz_bis_eur ? ` bis ${r.satz_bis_eur}` : ''} € / {tr(lang, 'Tag', 'day')}</td>
                <td>{fmtDate(r.gueltig_ab)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="tab" style={{ padding: 0, color: 'var(--navy)' }}
                    onClick={() => {
                      setAendere(r);
                      document.getElementById('satz-formular')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}>{tr(lang, 'ändern', 'change')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {historie.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--grey-600)' }}>
            {tr(lang, `Frühere Sätze anzeigen (${historie.length})`, `Show previous rates (${historie.length})`)}
          </summary>
          <table className="table" style={{ marginTop: 8 }}>
            <thead><tr>
              <th>{tr(lang, 'Kategorie', 'Category')}</th><th>{tr(lang, 'Satz', 'Rate')}</th>
              <th>{tr(lang, 'Galt ab', 'Valid from')}</th><th>{tr(lang, 'Erfasst', 'Recorded')}</th>
            </tr></thead>
            <tbody>
              {historie.map((r) => (
                <tr key={r.id} className="muted">
                  <td>{KATEGORIE_LABEL[r.kategorie] || r.kategorie}</td>
                  <td>{r.satz_von_eur}{r.satz_bis_eur ? ` bis ${r.satz_bis_eur}` : ''} € / {tr(lang, 'Tag', 'day')}</td>
                  <td>{fmtDate(r.gueltig_ab)}</td>
                  <td>{fmtDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <div id="satz-formular">
        <RateForm lang={lang} vorbelegung={aendere} aufAbbruch={() => setAendere(null)}
          onSave={async (payload) => { await api.post('/api/experts/me/rates', payload); await load(); }} />
      </div>

      <h2 style={{ fontSize: 18, color: 'var(--navy)', margin: '28px 0 12px' }}>{tr(lang, 'Datenschutz (DSGVO)', 'Data protection (GDPR)')}</h2>
      <div className="card">
        <p style={{ marginBottom: 14 }}>
          {tr(lang, 'Du kannst jederzeit eine vollständige Kopie deiner gespeicherten Daten herunterladen (Art. 20 DSGVO) oder deine Einwilligung widerrufen (Art. 7 Abs. 3 DSGVO). Nach einem Widerruf wird dein Profil gesperrt und anschließend gelöscht bzw. anonymisiert.', 'You can download a full copy of your stored data at any time (Art. 20 GDPR) or withdraw your consent (Art. 7(3) GDPR). After a withdrawal your profile is locked and then deleted or anonymised.')}
        </p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, margin: '4px 0 14px', cursor: 'pointer' }}>
          <input type="checkbox" checked={Boolean(expert.provider_optin)} style={{ marginTop: 3 }}
            onChange={async (e) => { await api.post('/api/experts/me/provider-optin', { optin: e.target.checked }); load(); }} />
          <span>{tr(lang,
            'Mein Profil darf anonymisiert (ohne Namen und Kontaktdaten) an geprüfte Partnerprovider gezeigt werden, damit mehr passende Anfragen reinkommen. Jederzeit widerrufbar.',
            'My profile may be shown anonymised (no name or contact details) to vetted partner providers so more matching requests come in. Revocable at any time.')}</span>
        </label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href="/api/experts/me/export" className="btn" style={{ width: 'auto', textDecoration: 'none' }}>
            {tr(lang, 'Meine Daten exportieren (ZIP)', 'Export my data (ZIP)')}
          </a>
          <button className="btn" style={{ width: 'auto', background: 'var(--danger)' }}
            onClick={async () => {
              if (!window.confirm(tr(lang, 'Einwilligung wirklich widerrufen? Dein Profil wird gesperrt und deine Daten werden gelöscht bzw. anonymisiert.', 'Really withdraw consent? Your profile will be locked and your data deleted or anonymised.'))) return;
              const d = await api.post('/api/auth/revoke-consent');
              window.alert(d.message);
              window.location.href = '/login';
            }}>
            {tr(lang, 'Einwilligung widerrufen', 'Withdraw consent')}
          </button>
        </div>
      </div>
    </Layout>
  );
}
