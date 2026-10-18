import { useEffect, useState } from 'react';
import {
  Users, CalendarClock, Euro, Search, FolderKanban, Mail, UserPlus, PencilLine, Activity, MailX,
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
  const [wo, setWo] = useState(null);
  const [absagen, setAbsagen] = useState(null);
  const [kunden, setKunden] = useState(null);

  useEffect(() => {
    api.get('/api/experts/stats').then(setStats).catch(() => {});
    api.get('/api/experts/aktivitaet').then(setAkt).catch(() => {});
    api.get('/api/experts/wo-stehen-sie').then(setWo).catch(() => {});
    api.get('/api/vorlagen/absagen/offen').then((d) => setAbsagen(d.absagen)).catch(() => {});
    api.get('/api/kunden?status=wartet').then(setKunden).catch(() => {});
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

      {/* v1.37.0: Ein Kundenkonto entsteht gesperrt. Wer wartet, gehoert
          nach vorn, sonst merkt es niemand. */}
      {kunden && kunden.zahlen.wartet_auf_freigabe > 0 && (
        <div className="notice" style={{ marginBottom: 26 }}>
          <strong>{kunden.zahlen.wartet_auf_freigabe} Kunde(n) warten auf Freigabe.</strong>{' '}
          Bis dahin kommen sie nicht in den Kundenbereich.{' '}
          <Link to="/admin/kunden" style={{ fontWeight: 600 }}>Jetzt freischalten</Link>
        </div>
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

      {/* v1.49.0: Wem noch abzusagen ist. Steht oben, weil es mit jedem Tag
          unangenehmer wird und sonst niemand daran denkt. */}
      <OffeneAbsagen liste={absagen} neuLaden={() => {
        api.get('/api/vorlagen/absagen/offen').then((d) => setAbsagen(d.absagen)).catch(() => {});
      }} />

      {/* v1.45.0: Wer steckt gerade wo. Die Pipeline zeigt ein Projekt mit
          seinen Kandidaten, hier ist es umgekehrt: ein Mensch und seine
          laufenden Projekte. Das ist die Frage, die man sich stellt, wenn
          jemand anruft. */}
      <WoStehenSie daten={wo} />

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

/** Die Stufen, und wie sie heißen, wenn ein Mensch sie liest. */
const STUFE_LABEL = {
  vorgeschlagen: 'vorgeschlagen',
  angefragt: 'angefragt',
  interessiert: 'hat zugesagt',
  vorgelegt: 'beim Kunden',
  im_gespraech: 'im Gespräch',
  angeboten: 'Angebot',
};
const STUFE_FARBE = {
  vorgeschlagen: 'eingeladen',
  angefragt: 'registriert',
  interessiert: 'freigegeben',
  vorgelegt: 'registriert',
  im_gespraech: 'freigegeben',
  angeboten: 'freigegeben',
};

/**
 * v1.45.0 — Wo steht gerade wer.
 *
 * Sortiert nach Handlungsbedarf, nicht nach Namen. Oben steht, wo etwas
 * liegen bleibt: eine überfällige Anfrage, eine Zusage, die seit Tagen auf
 * das Vorlegen wartet. Eine alphabetische Liste liest man einmal und nie
 * wieder.
 */
function WoStehenSie({ daten }) {
  const [alle, setAlle] = useState(false);
  if (!daten) return null;

  const { personen, zahlen } = daten;
  if (!personen.length) {
    return (
      <>
        <h2 className="abschnitt">Wer steckt gerade wo</h2>
        <p className="muted">
          Gerade läuft niemand in einem Projekt. Sobald du Kandidaten in eine Pipeline nimmst,
          stehen sie hier mit ihrem Stand.
        </p>
      </>
    );
  }

  const sichtbar = alle ? personen : personen.slice(0, 8);

  return (
    <>
      <h2 className="abschnitt">
        <Activity size={18} style={{ verticalAlign: '-3px' }} /> Wer steckt gerade wo
      </h2>

      <div className="kpi-row" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="num">{zahlen.wartet_auf_antwort}</div><div className="lbl">warten auf Antwort</div></div>
        <div className="kpi"><div className="num">{zahlen.hat_zugesagt}</div><div className="lbl">haben zugesagt</div></div>
        <div className="kpi"><div className="num">{zahlen.beim_kunden}</div><div className="lbl">beim Kunden</div></div>
        <div className="kpi"><div className="num">{zahlen.im_gespraech}</div><div className="lbl">im Gespräch</div></div>
        <div className="kpi"><div className="num">{zahlen.im_einsatz}</div><div className="lbl">im Einsatz</div></div>
      </div>

      {zahlen.dringend > 0 && (
        <div className="notice" style={{ marginBottom: 14 }}>
          <strong>Bei {zahlen.dringend} {zahlen.dringend === 1 ? 'Person' : 'Personen'} bleibt etwas liegen.</strong>{' '}
          Eine Zusage, die nicht weitergeht, ist der teuerste Zustand: Der Mensch wartet, und
          irgendwann nimmt er etwas anderes.
        </div>
      )}

      <table className="table">
        <thead><tr><th>Wer</th><th>Projekt</th><th>Stand</th><th>Nächster Schritt</th></tr></thead>
        <tbody>
          {sichtbar.map((e) => (
            <PersonZeilen key={e.expert.id} eintrag={e} />
          ))}
        </tbody>
      </table>

      {personen.length > 8 && (
        <p style={{ marginTop: 8 }}>
          <button type="button" className="tab" style={{ padding: 0, color: 'var(--navy)' }}
            onClick={() => setAlle((a) => !a)}>
            {alle ? 'Weniger zeigen' : `Alle ${personen.length} zeigen`}
          </button>
        </p>
      )}
    </>
  );
}

/** Eine Person mit allen ihren laufenden Projekten, als zusammenhängender Block. */
function PersonZeilen({ eintrag }) {
  const { expert, beteiligungen, mandate, dringend } = eintrag;
  const zeilen = [...beteiligungen];
  const anzahl = zeilen.length + mandate.length;

  return (
    <>
      {zeilen.map((b, i) => (
        <tr key={b.application_id} style={i === 0 && dringend ? { background: 'rgba(201,169,110,.08)' } : undefined}>
          {i === 0 && (
            <td rowSpan={anzahl} style={{ verticalAlign: 'top' }}>
              <Link to={`/admin/experten/${expert.id}`}>
                <strong>{expert.vorname} {expert.nachname}</strong>
              </Link>
              <br />
              <span className="muted" style={{ fontSize: 12.5 }}>
                {expert.berufsbezeichnung?.split('—')[0] || expert.firma || ''}
              </span>
            </td>
          )}
          <td style={{ fontSize: 13.5 }}>
            <Link to={`/admin/projekte/${b.projekt_id}`}>{b.projekt_name}</Link>
            {b.verfuegbar_ab && (
              <><br /><span className="muted" style={{ fontSize: 12 }}>sagt: ab {b.verfuegbar_ab}
                {b.auslastung ? `, ${b.auslastung}` : ''}</span></>
            )}
          </td>
          <td><span className={`status status-${STUFE_FARBE[b.status] || 'eingeladen'}`}>
            {STUFE_LABEL[b.status] || b.status}</span></td>
          <td style={{ fontSize: 13 }}>
            <span style={b.schritt.dringend ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
              {b.schritt.text}
            </span>
          </td>
        </tr>
      ))}

      {mandate.map((m, i) => (
        <tr key={`m-${m.engagement_id}`}>
          {zeilen.length === 0 && i === 0 && (
            <td rowSpan={mandate.length} style={{ verticalAlign: 'top' }}>
              <Link to={`/admin/experten/${expert.id}`}>
                <strong>{expert.vorname} {expert.nachname}</strong>
              </Link>
              <br />
              <span className="muted" style={{ fontSize: 12.5 }}>
                {expert.berufsbezeichnung?.split('—')[0] || expert.firma || ''}
              </span>
            </td>
          )}
          <td style={{ fontSize: 13.5 }}>
            <Link to={`/admin/projekte/${m.projekt_id}`}>{m.projekt_name}</Link>
          </td>
          <td><span className="status status-freigegeben">im Einsatz</span></td>
          <td style={{ fontSize: 13 }} className="muted">
            {m.start ? `seit ${fmt(m.start)}` : 'läuft'}{m.ende ? `, bis ${fmt(m.ende)}` : ''}
          </td>
        </tr>
      ))}
    </>
  );
}

/**
 * v1.49.0 — Absagen, die noch hinausgehen müssen.
 *
 * Der Kunde hat abgelehnt, der Kandidat weiß es noch nicht. Diese Lage soll
 * nicht liegen bleiben: Jemand, der zugesagt und gewartet hat, verdient eine
 * Antwort, und mit jedem Tag wird sie unangenehmer.
 *
 * Verschickt wird erst auf deinen Klick. Zwischen der Entscheidung des
 * Kunden und der Nachricht liegt oft ein Gespräch, das du noch führst.
 */
function OffeneAbsagen({ liste, neuLaden }) {
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  if (!liste?.length) return null;

  const tun = async (id, pfad) => {
    setBusy(id);
    try {
      const d = await api.post(`/api/vorlagen/absagen/${id}/${pfad}`, {});
      setMsg({ ok: true, text: d.message });
      neuLaden();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(null); }
  };

  return (
    <div className="notice" style={{ marginBottom: 26 }}>
      <strong>
        <MailX size={16} style={{ verticalAlign: '-3px' }} />{' '}
        {liste.length === 1 ? 'Eine Absage wartet' : `${liste.length} Absagen warten`} auf dich.
      </strong>
      <p style={{ fontSize: 13, margin: '4px 0 8px' }}>
        Der Kunde hat abgelehnt, die Kandidaten wissen es noch nicht.
      </p>
      {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`}>{msg.text}</div>}

      <table className="table" style={{ marginTop: 6 }}>
        <tbody>
          {liste.map((a) => (
            <tr key={a.id}>
              <td>
                <Link to={`/admin/experten/${a.expert_id}`}>
                  <strong>{a.vorname} {a.nachname}</strong>
                </Link><br />
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {a.projekt_name}
                  {a.wartet_tage > 0 && ` · wartet seit ${a.wartet_tage} ${a.wartet_tage === 1 ? 'Tag' : 'Tagen'}`}
                </span>
                {a.absage_grund_kunde && (
                  <><br /><span className="muted" style={{ fontSize: 12 }}>
                    Kunde sagt: {a.absage_grund_kunde} (geht nicht mit hinaus)
                  </span></>
                )}
              </td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                {a.hat_mail ? (
                  <button type="button" className="tab" style={{ padding: 0, color: 'var(--navy)' }}
                    disabled={busy === a.id} onClick={() => tun(a.id, 'verschicken')}>
                    Absage schicken
                  </button>
                ) : (
                  <span className="muted" style={{ fontSize: 12.5 }}>keine Mailadresse</span>
                )}
                <br />
                <button type="button" className="tab" style={{ padding: 0, color: 'var(--grey-600)', fontSize: 12.5 }}
                  disabled={busy === a.id} onClick={() => tun(a.id, 'selbst-erledigt')}>
                  habe ich selbst erledigt
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
