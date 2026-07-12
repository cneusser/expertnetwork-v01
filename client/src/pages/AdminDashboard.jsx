import { Users, CalendarClock, Euro, Search, FolderKanban, Mail } from 'lucide-react';
import Layout from '../components/Layout';

/** Sprint 0: leeres Admin-Dashboard — die Karten zeigen die kommenden Module. */
export default function AdminDashboard() {
  const modules = [
    { icon: Users, title: 'Experten', desc: 'Verzeichnis mit Profilen, Skills und Dokumenten.', sprint: 'Sprint 1' },
    { icon: CalendarClock, title: 'Verfügbarkeit', desc: 'Status, Auslastung und 14-Tage-Bestätigungs-Loop.', sprint: 'Sprint 2' },
    { icon: Euro, title: 'Tagessätze', desc: 'Sätze je Kategorie mit lückenloser Historie.', sprint: 'Sprint 3' },
    { icon: Search, title: 'Suche', desc: 'Volltext, Facetten und Boolean-Syntax.', sprint: 'Sprint 5' },
    { icon: FolderKanban, title: 'Projekte', desc: 'Interne Projekte mit erklärbarem Matching-Score.', sprint: 'Sprint 6' },
    { icon: Mail, title: 'Kommunikation', desc: 'Einzel- und Serienmails mit Historie am Profil.', sprint: 'Sprint 7' },
  ];

  return (
    <Layout>
      <h1>Dashboard</h1>
      <p className="sub">Phalanx Expert Network — Fundament (Sprint 0) ist eingerichtet.</p>
      <div className="card-grid">
        {modules.map(({ icon: Icon, title, desc, sprint }) => (
          <div className="card" key={title}>
            <h3><Icon size={17} /> {title}</h3>
            <p>{desc}</p>
            <span className="badge">{sprint}</span>
          </div>
        ))}
      </div>
    </Layout>
  );
}
