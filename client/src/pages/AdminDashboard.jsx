import { useEffect, useState } from 'react';
import { Users, CalendarClock, Euro, Search, FolderKanban, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../api/client';

/** Admin-Dashboard — KPI-Widgets + Module (aktive verlinkt, kommende mit Sprint). */
export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get('/api/experts/stats').then(setStats).catch(() => {}); }, []);

  const modules = [
    { icon: Users, title: 'Experten', desc: 'Verzeichnis mit Profilen, Skills und Dokumenten-Tresor.', link: '/admin/experten' },
    { icon: CalendarClock, title: 'Verfügbarkeit', desc: '14-Tage-Bestätigungs-Loop mit Ein-Klick-Link läuft automatisch.', link: '/admin/experten' },
    { icon: Euro, title: 'Tagessätze', desc: 'Erfassen im Profil (Tab „Tagessätze") — Historie bleibt lückenlos.', link: '/admin/experten' },
    { icon: Search, title: 'Suche', desc: 'Volltext, Facetten und Boolean-Syntax.', sprint: 'Sprint 5' },
    { icon: FolderKanban, title: 'Projekte', desc: 'Interne Projekte mit erklärbarem Matching-Score.', sprint: 'Sprint 6' },
    { icon: Mail, title: 'Kommunikation', desc: 'Einzel- und Serienmails mit Historie am Profil.', sprint: 'Sprint 7' },
  ];

  return (
    <Layout>
      <h1>Dashboard</h1>
      <p className="sub">Phalanx Expert Network</p>
      {stats && (
        <div className="kpi-row">
          <div className="kpi"><div className="num">{stats.gesamt}</div><div className="lbl">Experten im Pool</div></div>
          <div className="kpi"><div className="num">{stats.verfuegbarJetzt}</div><div className="lbl">Verfügbar jetzt</div></div>
          <div className="kpi"><div className="num">{stats.nichtBestaetigt}</div><div className="lbl">Nicht bestätigt (&gt; 21 Tage)</div></div>
          <div className="kpi"><div className="num">{stats.consentFehlt}</div><div className="lbl">Einwilligung fehlt / abgelaufen</div></div>
        </div>
      )}
      <div className="card-grid">
        {modules.map(({ icon: Icon, title, desc, sprint, link }) => (
          <div className="card" key={title}>
            <h3><Icon size={17} /> {link ? <Link to={link}>{title}</Link> : title}</h3>
            <p>{desc}</p>
            {sprint && <span className="badge">{sprint}</span>}
            {link && <span className="badge badge-active">Aktiv</span>}
          </div>
        ))}
      </div>
    </Layout>
  );
}
