/** v1.4.0 — Profilbild: Anzeige + optionaler Upload (JPEG/PNG, max. 3 MB). */
import { useRef, useState } from 'react';

export default function FotoAvatar({ expertId, size = 64, editable = false, uploadUrl }) {
  const [bust, setBust] = useState(0);
  const [err, setErr] = useState('');
  const [failed, setFailed] = useState(false);
  const fileRef = useRef();

  const upload = async (file) => {
    setErr('');
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(uploadUrl || `/api/experts/${expertId}/foto`, { method: 'POST', body: fd, credentials: 'include' });
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || 'Upload fehlgeschlagen'); return; }
    setFailed(false); setBust(Date.now());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div
        onClick={() => editable && fileRef.current?.click()}
        title={editable ? 'Profilbild ändern (JPEG/PNG)' : undefined}
        style={{
          width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
          background: 'var(--grey-200, #e3e6ea)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: editable ? 'pointer' : 'default',
          border: '2px solid var(--navy, #0f2a4a)',
        }}>
        {!failed ? (
          <img src={`/api/experts/${expertId}/foto?b=${bust}`} alt="" width={size} height={size}
            style={{ objectFit: 'cover', width: '100%', height: '100%' }} onError={() => setFailed(true)} />
        ) : (
          <span style={{ fontSize: size / 3, color: 'var(--navy, #0f2a4a)' }}>{editable ? '+' : '👤'}</span>
        )}
      </div>
      {editable && (
        <input ref={fileRef} type="file" accept="image/jpeg,image/png" style={{ display: 'none' }}
          onChange={(e) => e.target.files[0] && upload(e.target.files[0])} />
      )}
      {err && <span style={{ fontSize: 11, color: 'var(--danger, #b3261e)' }}>{err}</span>}
    </div>
  );
}
