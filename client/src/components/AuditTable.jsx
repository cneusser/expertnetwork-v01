/** Audit-Tabelle — genutzt vom Verlauf-Tab und der globalen Audit-Seite. */

const fmtTs = (t) => (t ? new Date(t).toLocaleString('de-DE') : '—');

function Diff({ oldV, newV }) {
  const o = typeof oldV === 'string' ? JSON.parse(oldV || 'null') : oldV;
  const n = typeof newV === 'string' ? JSON.parse(newV || 'null') : newV;
  if (!o && !n) return <span className="muted">—</span>;
  const keys = [...new Set([...Object.keys(o || {}), ...Object.keys(n || {})])];
  return (
    <div style={{ fontSize: 12.5 }}>
      {keys.slice(0, 6).map((k) => (
        <div key={k}>
          <strong>{k}:</strong>{' '}
          {o && k in o && <span style={{ color: 'var(--danger)', textDecoration: 'line-through' }}>{JSON.stringify(o[k])}</span>}{' '}
          {n && k in n && <span style={{ color: 'var(--success)' }}>{JSON.stringify(n[k])}</span>}
        </div>
      ))}
      {keys.length > 6 && <span className="muted">… {keys.length - 6} weitere Felder</span>}
    </div>
  );
}

export default function AuditTable({ rows }) {
  if (!rows?.length) return <p className="sub">Keine Einträge.</p>;
  return (
    <table className="table">
      <thead><tr><th>Zeitpunkt</th><th>Aktion</th><th>Ressource</th><th>Änderung (alt → neu)</th><th>Akteur</th><th>IP</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td style={{ whiteSpace: 'nowrap' }}>{fmtTs(r.ts)}</td>
            <td><code style={{ fontSize: 12.5 }}>{r.action}</code></td>
            <td>{r.resource}{r.resource_id ? ` #${r.resource_id}` : ''}</td>
            <td><Diff oldV={r.old_value_json} newV={r.new_value_json} /></td>
            <td>{r.actor_email || 'System'}</td>
            <td className="muted">{r.ip || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
