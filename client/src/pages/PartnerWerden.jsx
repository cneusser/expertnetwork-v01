/**
 * v1.11.0 — Öffentliche Seite "Assoziierte Partner": Modell in drei Feldern
 * (Recruiting, Projektakquise, Delivery) plus Interessensformular.
 * Texte bewusst persönlich und klar, ohne Gedankenstriche und Floskeln.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Handshake, Search, Users } from 'lucide-react';
import Logo from '../components/Logo';
import LegalFooter from '../components/LegalFooter';
import { useLang, tr } from '../i18n';
import { api } from '../api/client';

const T = {
  de: {
    titel: 'Assoziierte Partner',
    intro: 'Sie sind Interim Manager oder Berater mit eigenem Netzwerk und wollen mehr, als nur Mandate abzuarbeiten? Dann bauen Sie mit uns aus. Als assoziierter Partner der Phalanx GmbH verdienen Sie an dem mit, was Sie einbringen: Kontakte, Projekte, Umsetzungskraft.',
    karten: [
      { icon: Users, titel: 'Recruiting', text: 'Sie kennen gute Leute. Empfehlen Sie Experten für unser Netzwerk. Kommt über Ihre Empfehlung ein Mandat zustande, sind Sie am Erfolg beteiligt.' },
      { icon: Search, titel: 'Projektakquise', text: 'Sie hören von einem Projekt, das gerade nicht zu Ihnen passt? Bringen Sie es ein. Wir übernehmen Besetzung und Abwicklung, Sie erhalten eine Vermittlungsbeteiligung.' },
      { icon: Handshake, titel: 'Delivery', text: 'Große Mandate stemmt niemand allein. Als Partner arbeiten Sie in Phalanx-Projekten mit, vom Teilprojekt bis zur gemeinsamen Projektleitung.' },
    ],
    verguetung: 'Die Konditionen legen wir gemeinsam fest, offen und pro Fall. Kein Kleingedrucktes.',
    formTitel: 'Interesse? Schreiben Sie uns.',
    vorname: 'Vorname', nachname: 'Nachname', email: 'E-Mail', telefon: 'Telefon (optional)',
    interesse: 'Was interessiert Sie?',
    fokusLabels: { recruiting: 'Recruiting', akquise: 'Projektakquise', delivery: 'Delivery' },
    nachricht: 'Ihre Nachricht (optional)',
    consent: 'Ich bin einverstanden, dass die Phalanx GmbH meine Angaben zur Bearbeitung meiner Anfrage speichert. Details stehen in der Datenschutzerklärung.',
    senden: 'Anfrage senden', sendet: 'Wird gesendet…',
    zurueck: 'Zur Anmeldung',
  },
  en: {
    titel: 'Associated partners',
    intro: 'You are an interim manager or consultant with a network of your own, and you want more than working through mandates? Then build with us. As an associated partner of Phalanx GmbH you earn a share of what you bring in: contacts, projects, delivery power.',
    karten: [
      { icon: Users, titel: 'Recruiting', text: 'You know good people. Recommend experts for our network. If a mandate comes about through your referral, you share in the success.' },
      { icon: Search, titel: 'Project origination', text: 'You hear about a project that does not fit you right now? Bring it in. We handle staffing and execution, you receive a referral share.' },
      { icon: Handshake, titel: 'Delivery', text: 'Nobody handles large mandates alone. As a partner you work in Phalanx projects, from a workstream to joint project leadership.' },
    ],
    verguetung: 'We agree the terms together, openly and case by case. No fine print.',
    formTitel: 'Interested? Get in touch.',
    vorname: 'First name', nachname: 'Last name', email: 'Email', telefon: 'Phone (optional)',
    interesse: 'What are you interested in?',
    fokusLabels: { recruiting: 'Recruiting', akquise: 'Project origination', delivery: 'Delivery' },
    nachricht: 'Your message (optional)',
    consent: 'I agree that Phalanx GmbH stores my details to process my request. See the privacy policy for details.',
    senden: 'Send request', sendet: 'Sending…',
    zurueck: 'To login',
  },
};

export default function PartnerWerden() {
  const { lang, setLang } = useLang();
  const t = T[lang] || T.de;
  const [form, setForm] = useState({ vorname: '', nachname: '', email: '', telefon: '', nachricht: '', consent: false });
  const [fokus, setFokus] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const toggleFokus = (k) => setFokus((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const d = await api.post('/api/public/partner-bewerbung', { ...form, fokus });
      setDone(true);
      setMsg({ ok: true, text: d.message });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Logo />
        <span style={{ fontSize: 12 }}>
          {['de', 'en'].map((L) => (
            <button key={L} type="button" onClick={() => setLang(L)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: lang === L ? 700 : 400, color: lang === L ? 'var(--navy)' : 'var(--grey-400, #8a93a0)' }}>{L.toUpperCase()}</button>
          ))}
        </span>
      </div>

      <h1 style={{ color: 'var(--navy)', margin: '22px 0 10px' }}>{t.titel}</h1>
      <p style={{ fontSize: 16, lineHeight: 1.6, maxWidth: 680 }}>{t.intro}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, margin: '24px 0' }}>
        {t.karten.map(({ icon: Icon, titel, text }) => (
          <div className="card" key={titel}>
            <h3><Icon size={17} /> {titel}</h3>
            <p style={{ fontSize: 14, lineHeight: 1.55 }}>{text}</p>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 14 }}>{t.verguetung}</p>

      <div className="card" style={{ marginTop: 24, maxWidth: 680 }}>
        <h3>{t.formTitel}</h3>
        {msg && <div className={`msg ${msg.ok ? 'msg-success' : 'msg-error'}`} style={{ marginTop: 10 }}>{msg.text}</div>}
        {!done && (
          <form onSubmit={submit} style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: '1 1 180px' }}><label>{t.vorname}</label>
                <input type="text" required value={form.vorname} onChange={(e) => setForm({ ...form, vorname: e.target.value })} /></div>
              <div className="field" style={{ flex: '1 1 180px' }}><label>{t.nachname}</label>
                <input type="text" required value={form.nachname} onChange={(e) => setForm({ ...form, nachname: e.target.value })} /></div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="field" style={{ flex: '1 1 220px' }}><label>{t.email}</label>
                <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="field" style={{ flex: '1 1 180px' }}><label>{t.telefon}</label>
                <input type="text" value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} /></div>
            </div>
            <div className="field">
              <label>{t.interesse}</label>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
                {['recruiting', 'akquise', 'delivery'].map((k) => (
                  <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}>
                    <input type="checkbox" checked={fokus.includes(k)} onChange={() => toggleFokus(k)} />
                    {t.fokusLabels[k]}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <label>{t.nachricht}</label>
              <textarea rows={4} value={form.nachricht} onChange={(e) => setForm({ ...form, nachricht: e.target.value })} />
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, margin: '4px 0 14px', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} style={{ marginTop: 3 }} />
              <span>{t.consent}</span>
            </label>
            <button className="btn" style={{ width: 'auto' }} disabled={busy || !form.consent}>{busy ? t.sendet : t.senden}</button>
          </form>
        )}
      </div>

      <p style={{ marginTop: 22 }}><Link to="/login">← {t.zurueck}</Link></p>
      <LegalFooter />
    </div>
  );
}
