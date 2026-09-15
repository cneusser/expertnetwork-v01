import { useEffect, useState } from 'react';
import {
  Users, CalendarClock, Euro, Search, FolderKanban, Mail, UserPlus, PencilLine,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { api } from '../api/client';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : '—');

/** Wie lange ist das her? Kurz und lesbar, ohne Bibliothek. */
function seit(d) {
  if (!d) return '';
  const tage = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (tage <= 0) return 'heute';
  if (tage === 1) return 'gestern';
  if (tage < 7) return `vor ${tage} Tagen`;
  if (tage < 31) return `vor ${Math.floor(tage / 7)} Wochen`;
  return fmt(d);
}

const VERFUEGBARKEIT = {
  sofort: 'sofort verfügbar',
  teilweise: 'teilweise verfügbar',
  ab_datum: 'verfügbar ab',
  ausgebucht: 'ausgebucht',
};

/** Eine Zeile in den Aktivitätslisten. Der ganze Eintrag führt in die Akte. */
function Zeile({ p, rechts, unten }) {
  return (
    <li>
      <Link to={`/admin/experten/${p.id}`}>
        <span className="wer">{p.vorname} {p.nachname}</span>
        {rechts && <span className="wann">{rechts}</span>}
        <span className="was">{unten}</span>
      </Link>
    </li>
  );
}

/** Admin-Dashboard: Kennzahlen, was zuletzt passiert ist, Module. */
export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [akt, setAkt] = useState(null);

  useEffect(() => {
    api.get('/api/experts/stats').then(setStats).catch(() => {});
    api.get('/api/experts/aktivitaet').then(setAkt).catch(() => {});
  }, []);

  const modules = [
    { icon: Users, title: 'Experten', desc: 'Verzeichnis mit Profilen, Skills und Dokumenten-Tresor.', link: '/admin/experten' },
    { icon: CalendarClock, title: 'Verfügbarkeit', desc: '14-Tage-Bestätigungs-Loop mit Ein-Klick-Link läuft automatisch.', link: '/admin/experten' },
    { icon: Euro, title: 'Tagessätze', desc: 'Erfassen im Profil (Tab „Tagessätze") — Historie bleibt lückenlos.', link: '/admin/experten' },
    { icon: Search, title: 'Suche', desc: 'Volltext, Facetten und Boolean-Syntax wie bei LinkedIn.', link: '/admin/suche' },
    { icon: FolderKanban, title: 'Projekte', desc: 'Interne Projekte mit erklärbarem Matching-Score und Pipeline.', link: '/admin/projekte' },
    { icon: Mail, title: 'Kommunikation', desc: 'Einzel-/Serienmails, Terminanfragen und Historie am Profil.', link: '/admin/kommunikation' },
  ];

  return (
    <Layout>
      <h1>Dashboard</h1>
      <p className="sub">Phalanx Expert Network</p>

      {stats && (
        <>
          <div className="kpi-row">
            <div className="kpi"><div className="num">{stats.gesamt}</div><div className="lbl">Experten im Pool</div></div>
            <div className="kpi"><div className="num">{stats.verfuegbarJetzt}</div><div className="lbl">Verfügbar jetzt</div></div>
            <div className="kpi"><div className="num">{stats.nichtBestaetigt}</div><div className="lbl">Nicht bestätigt (&gt; 21 Tage)</div></div>
            <div className="kpi"><div className="num">{stats.consentFehlt}</div><div className="lbl">Einwilligung fehlt / abgelaufen</div></div>
          </div>
          {(stats.vorregistriert > 0 || stats.eingeladen > 0) && (
            <p className="sub" style={{ marginTop: -14, marginBottom: 26 }}>
              Dazu in der Ansprache: {stats.vorregistriert} vorbereitete und {stats.eingeladen} eingeladene
              Kontakte ohne eigenes Konto. Die zählen oben bewusst nicht mit.
              {' '}<Link to="/admin/ansprache">Zur Ansprache</Link>
            </p>
          )}
        </>
      )}

      {akt && (
        <div className="aktivitaet">
          <div className="card">
            <h3><UserPlus size={17} /> Neu dazugekommen</h3>
            {akt.neu.length === 0 ? <p className="leer">Noch niemand.</p> : (
              <ul className="akt-liste">
                {akt.neu.map((p) => (
                  <Zeile key={p.id} p={p} rechts={seit(p.dabei_seit)}
                    unten={[
                      p.firma || p.berufsbezeichnung || 'ohne Firmenangabe',
                      p.aus_vorregistrierung ? 'aus der Ansprache' : null,
                      p.status === 'freigegeben' ? 'freigegeben' : null,
                    ].filter(Boolean).join(' · ')} />
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3><CalendarClock size={17} /> Verfügbarkeit aktualisiert</h3>
            {akt.verfuegbar.length === 0 ? <p className="leer">Noch keine Meldung.</p> : (
              <ul className="akt-liste">
                {akt.verfuegbar.map((p) => (
                  <Zeile key={p.id} p={p} rechts={seit(p.wann)}
                    unten={[
                      (VERFUEGBARKEIT[p.verfuegbarkeit] || p.verfuegbarkeit)
                        + (p.verfuegbarkeit === 'ab_datum' && p.ab_datum ? ` ${fmt(p.ab_datum)}` : ''),
                      p.auslastung_prozent ? `${p.auslastung_prozent} %` : null,
                      p.source === 'admin' ? 'vom Büro erfasst' : null,
                    ].filter(Boolean).join(' · ')} />
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3><PencilLine size={17} /> Profil angepasst</h3>
            {akt.profil.length === 0 ? <p className="leer">Noch keine Änderung.</p> : (
              <ul className="akt-liste">
                {akt.profil.map((p) => (
                  <Zeile key={p.id} p={p} rechts={seit(p.wann)}
                    unten={`${p.was} · ${p.selbst ? 'selbst' : 'vom Büro'}`} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <h2 className="abschnitt">Module</h2>
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
