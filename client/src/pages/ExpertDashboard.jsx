import { UserRound, CalendarClock, Euro, FileText } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

/** Sprint 0: leeres Experten-Dashboard. */
export default function ExpertDashboard() {
  const { user } = useAuth();
  const modules = [
    { icon: UserRound, title: 'Mein Profil', desc: 'Persönliche Daten, Kompetenzen, Branchen und Sprachen.', sprint: 'Sprint 1' },
    { icon: FileText, title: 'Dokumente', desc: 'Lebenslauf, Zertifikate und Referenzen — versioniert.', sprint: 'Sprint 1' },
    { icon: CalendarClock, title: 'Verfügbarkeit', desc: 'Status und Auslastung — mit Ein-Klick-Bestätigung per E-Mail.', sprint: 'Sprint 2' },
    { icon: Euro, title: 'Tagessätze', desc: 'Sätze für Remote, vor Ort, Interim, Projektleitung, Beratung.', sprint: 'Sprint 3' },
  ];

  return (
    <Layout>
      <h1>Willkommen</h1>
      <p className="sub">Ihr Bereich im Phalanx Expert Network.</p>
      {!user?.isApproved && (
        <div className="notice">
          Ihr Zugang wartet auf die Freigabe durch die Phalanx GmbH. Sie werden
          per E-Mail informiert, sobald Ihr Profil freigeschaltet ist.
        </div>
      )}
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
