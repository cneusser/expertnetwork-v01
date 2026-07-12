import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Eye, Lock, Pencil, Upload, X } from 'lucide-react';
import Layout from '../components/Layout';
import ProfileForm from '../components/ProfileForm';
import RateForm from '../components/RateForm';
import AuditTable from '../components/AuditTable';
import { api } from '../api/client';

const KAT_LABEL = {
  cv: 'Lebenslauf', executive_profil: 'Executive Profil', one_pager: 'One-Pager',
  projektliste: 'Projektliste', zertifikat: 'Zertifikat', nda: 'NDA', referenz: 'Referenz',
};
const AVAIL_LABEL = { sofort: 'Sofort verfügbar', ab_datum: 'Verfügbar ab Datum', teilweise: 'Teilweise verfügbar', ausgebucht: 'Ausgebucht' };
const SKILL_KAT = [['rolle', 'Rollen'], ['kompetenz', 'Kompetenzen'], ['branche', 'Branchen'], ['zertifikat', 'Zertifikate & Normen'], ['technologie', 'Technologien']];

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '—');

export default function AdminExpertDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('profil');
  const [uploadKat, setUploadKat] = useState('referenz');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const [editing, setEditing] = useState(false);
  const [newSkill, setNewSkill] = useState({ name: '', kategorie: 'kompetenz' });
  const [auditRows, setAuditRows] = useState(null);

  const load = () => api.get(`/api/experts/${id}`).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  const uploadFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kategorie', uploadKat);
      await api.upload(`/api/experts/${id}/documents`, fd);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <Layout><div className="msg msg-error">{error}</div></Layout>;
  if (!data) return <Layout><p className="sub">Laden…</p></Layout>;
  const { expert, skills, documents, availabilities, rates, consent } = data;
  const adresse = typeof expert.adresse_json === 'string' ? JSON.parse(expert.adresse_json || '{}') : (expert.adresse_json || {});
  const sprachen = typeof expert.sprachen_json === 'string' ? JSON.parse(expert.sprachen_json || '[]') : (expert.sprachen_json || []);

  return (
    <Layout>
      <p><Link to="/admin/experten"><ArrowLeft size={14} style={{ verticalAlign: '-2px' }} /> Zurück zur Liste</Link></p>
      <h1>{{ herr: 'Herr', frau: 'Frau', divers: '' }[expert.anrede] || ''} {expert.titel || ''} {expert.vorname} {expert.nachname}</h1>
      <p className="sub">
        {expert.berufsbezeichnung} · {expert.firma}
        {expert.user_id && (
          <>
            {' · '}
            <a href="#birdview" onClick={async (e) => {
              e.preventDefault();
              await api.post(`/api/auth/impersonate/${expert.user_id}`);
              window.location.href = '/dashboard';
            }}><Eye size={13} style={{ verticalAlign: '-2px' }} /> Birdview: als dieser Experte ansehen</a>
          </>
        )}
      </p>

      {!consent && (
        <div className="notice">
          <strong>Einwilligung ausstehend:</strong> Dieses Profil wurde administrativ aus zugesandten
          Unterlagen angelegt. Informieren Sie den Experten transparent (Art. 14 DSGVO) und laden Sie
          ihn zum Self-Service ein — mit der Einladung erteilt er seine Einwilligung und vergibt ein Passwort.{' '}
          <button className="btn" style={{ width: 'auto', padding: '8px 16px', marginTop: 10, display: 'block' }}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const d = await api.post(`/api/experts/${id}/invite`);
                setInfo(d.message);
              } catch (e) { setError(e.message); } finally { setBusy(false); }
            }}>
            Einladung &amp; Art.-14-Information senden
          </button>
        </div>
      )}
      {info && <div className="msg msg-success">{info}</div>}
      {consent && (
        <p className="muted" style={{ marginBottom: 18 }}>
          Einwilligung erteilt am {fmtDate(consent.granted_at)} (Version {consent.text_version}),
          gültig bis {fmtDate(consent.expires_at)}.
        </p>
      )}

      <div className="tabs">
        {[['profil', 'Profil'], ['tresor', `Dokumenten-Tresor (${documents.length})`], ['verfuegbarkeit', 'Verfügbarkeit'], ['saetze', 'Tagessätze'], ['verlauf', 'Änderungsverlauf']].map(([k, label]) => (
          <button key={k} className={tab === k ? 'tab active' : 'tab'}
            onClick={() => {
              setTab(k);
              if (k === 'verlauf' && !auditRows) {
                api.get(`/api/experts/${id}/audit`).then((d) => setAuditRows(d.rows)).catch((e) => setError(e.message));
              }
            }}>{label}</button>
        ))}
      </div>

      {tab === 'profil' && editing && (
        <div className="detail-grid">
          <ProfileForm
            expert={expert}
            allowStatus
            onSave={async (payload) => {
              await api.put(`/api/experts/${id}`, payload);
              setEditing(false);
              await load();
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}
      {tab === 'profil' && !editing && (
        <div className="detail-grid">
          <div className="card" style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px' }}>
            <span className="muted">Profil zuletzt geändert: {fmtDate(expert.created_at)}</span>
            <button className="btn" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => setEditing(true)}>
              <Pencil size={14} /> Bearbeiten
            </button>
          </div>
          <div className="card">
            <h3>Kurzprofil</h3>
            <p>{expert.kurzprofil}</p>
          </div>
          <div className="card">
            <h3>Kontakt</h3>
            <p>
              {adresse.strasse}, {adresse.plz} {adresse.ort}, {adresse.land}<br />
              Mobil: {expert.mobil || '—'}<br />
              E-Mail: <a href={`mailto:${expert.email}`}>{expert.email}</a><br />
              Web: <a href={expert.webseite} target="_blank" rel="noreferrer">{expert.webseite}</a><br />
              LinkedIn: <a href={expert.linkedin} target="_blank" rel="noreferrer">{expert.linkedin}</a>
            </p>
          </div>
          <div className="card">
            <h3>Rahmendaten</h3>
            <p>
              Arbeitsmodell: {expert.arbeitsmodell || '—'}<br />
              Reisebereitschaft: {expert.reisebereitschaft || '—'}<br />
              Sprachen: {sprachen.map((s) => `${s.sprache} (${s.niveau})`).join(', ') || '—'}
            </p>
          </div>
          {SKILL_KAT.map(([kat, label]) => {
            const items = skills.filter((s) => s.kategorie === kat);
            return items.length ? (
              <div className="card" key={kat}>
                <h3>{label}</h3>
                <p>{items.map((s) => (
                  <span className="tag" key={s.id}>
                    {s.name}{' '}
                    <X size={11} style={{ cursor: 'pointer', verticalAlign: '-1px' }}
                      onClick={async () => { await api.del(`/api/experts/${id}/skills/${s.id}`); await load(); }} />
                  </span>
                ))}</p>
              </div>
            ) : null;
          })}
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <h3>Skill hinzufügen</h3>
            <form
              style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 8 }}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newSkill.name.trim()) return;
                await api.post(`/api/experts/${id}/skills`, newSkill);
                setNewSkill({ ...newSkill, name: '' });
                await load();
              }}>
              <div className="field" style={{ marginBottom: 0, minWidth: 220 }}>
                <label>Bezeichnung</label>
                <input type="text" value={newSkill.name} onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })} />
              </div>
              <div className="field" style={{ marginBottom: 0, minWidth: 160 }}>
                <label>Kategorie</label>
                <select value={newSkill.kategorie} onChange={(e) => setNewSkill({ ...newSkill, kategorie: e.target.value })}>
                  {SKILL_KAT.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <button className="btn" style={{ width: 'auto' }}>Hinzufügen</button>
            </form>
          </div>
        </div>
      )}

      {tab === 'tresor' && (
        <>
          <table className="table">
            <thead><tr><th>Kategorie</th><th>Datei</th><th>Sprache</th><th>Version</th><th>Hochgeladen</th><th></th></tr></thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td><Lock size={13} style={{ verticalAlign: '-2px' }} /> {KAT_LABEL[d.kategorie] || d.kategorie}</td>
                  <td>{d.filename}</td>
                  <td>{d.sprache?.toUpperCase() || '—'}</td>
                  <td>v{d.version}</td>
                  <td>{fmtDate(d.uploaded_at)}</td>
                  <td><a href={`/api/experts/${id}/documents/${d.id}/download`}>
                    <Download size={14} style={{ verticalAlign: '-2px' }} /> Download</a></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="card" style={{ marginTop: 16 }}>
            <h3><Upload size={15} /> Neues Dokument (PDF, max. 10 MB)</h3>
            <p style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={uploadKat} onChange={(e) => setUploadKat(e.target.value)}>
                {Object.entries(KAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input type="file" accept="application/pdf" disabled={busy}
                onChange={(e) => uploadFile(e.target.files[0])} />
            </p>
            <p className="muted">Jeder Upload erzeugt eine neue Version — nichts wird überschrieben (Audit-Prinzip).</p>
          </div>
        </>
      )}

      {tab === 'verfuegbarkeit' && (
        <table className="table">
          <thead><tr><th>Status</th><th>Ab</th><th>Auslastung</th><th>Kommentar</th><th>Bestätigt</th><th>Quelle</th></tr></thead>
          <tbody>
            {availabilities.map((a) => (
              <tr key={a.id}>
                <td>{AVAIL_LABEL[a.status] || a.status}</td>
                <td>{fmtDate(a.ab_datum)}</td>
                <td>{a.auslastung_prozent ? `${a.auslastung_prozent} %` : '—'}</td>
                <td>{a.kommentar}</td>
                <td>{fmtDate(a.confirmed_at)}</td>
                <td>{a.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'saetze' && (
        <>
        <table className="table">
          <thead><tr><th>Kategorie</th><th>Satz</th><th>Gültig ab</th><th>Erfasst</th></tr></thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id}>
                <td>{r.kategorie}</td>
                <td>{r.satz_von_eur}{r.satz_bis_eur ? ` – ${r.satz_bis_eur}` : ''} € / Tag</td>
                <td>{fmtDate(r.gueltig_ab)}</td>
                <td>{fmtDate(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <RateForm onSave={async (payload) => { await api.post(`/api/experts/${id}/rates`, payload); await load(); }} />
        </>
      )}

      {tab === 'verlauf' && (auditRows ? <AuditTable rows={auditRows} /> : <p className="sub">Laden…</p>)}
    </Layout>
  );
}
