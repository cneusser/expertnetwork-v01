/**
 * v1.8.0 — Editierbare Mailvorlagen (DB überschreibt Standard).
 * Platzhalter: {{vorname}}, {{nachname}}, {{link}} — {{link}} wird im HTML
 * zum Phalanx-Button. Vorlagen sind bewusst schlicht und menschlich
 * formuliert (keine Gedankenstriche, keine Floskeln).
 */
const { db } = require('../db/knex');

const DEFAULTS = {
  einladung_neu: {
    name: 'Einladung an neue Experten',
    subject: 'Einladung ins Phalanx Expert Network',
    body_text: `Hallo {{vorname}},

wir bauen bei Phalanx ein eigenes Netzwerk aus Interim Managern und Experten auf. Bei passenden Mandaten greifen wir direkt darauf zu, ohne Umwege über große Vermittlerplattformen. Und dabei haben wir an dich gedacht.

So funktioniert es: Du legst einmal dein Profil an, pflegst Verfügbarkeit und Tagessatz selbst und entscheidest, was drinsteht. Passt ein Projekt zu dir, melden wir uns persönlich. Keine Newsletter, keine Massenmails.

{{link}}

Die Einrichtung dauert ungefähr fünf Minuten. Deine Daten sehen nur wir. Du kannst deine Einwilligung jederzeit widerrufen, dann löschen wir dein Profil wieder.

Kein Interesse? Dann ignoriere diese Mail einfach, der Link läuft nach 14 Tagen aus.

Herzliche Grüße
Christian`,
  },
  einladung_bestand: {
    name: 'Einladung zu bestehendem Profil (Art. 14 DSGVO)',
    subject: 'Dein Profil im Phalanx Expert Network',
    body_text: `Hallo {{vorname}},

aus unserer bisherigen Zusammenarbeit liegen uns Unterlagen von dir vor. Daraus haben wir ein Profil im Phalanx Expert Network angelegt, unserem eigenen Netzwerk für Interim Manager und Experten. Darüber informieren wir dich transparent, wie es Art. 13 und 14 der DSGVO verlangen.

Über den folgenden Link siehst du, was gespeichert ist. Dort erteilst du deine Einwilligung, vergibst ein Passwort und pflegst dein Profil danach selbst:

{{link}}

Der Link ist 14 Tage gültig. Willst du nicht ins Netzwerk? Eine kurze Antwort auf diese Mail genügt, dann löschen wir deine Daten umgehend.

Herzliche Grüße
Christian`,
  },
  einladung_neu_en: {
    name: 'Invitation to new experts (English)',
    subject: 'Invitation to the Phalanx Expert Network',
    body_text: `Hello {{vorname}} {{nachname}},

at Phalanx we are building our own network of interim managers and experts. When a suitable mandate comes up, we work with our network directly, without the detour through large brokering platforms. And you came to mind.

Here is how it works: You set up your profile once, keep your availability and daily rate up to date yourself, and decide what goes in. If a project fits, we contact you personally. No newsletters, no bulk mailings.

{{link}}

Setting things up takes about five minutes. Only we can see your data. You can withdraw your consent at any time, and we will delete your profile.

Not interested? Just ignore this email, the link expires after 14 days.

Best regards
Dr. Christian Neusser
Phalanx GmbH`,
  },
  einladung_bestand_en: {
    name: 'Invitation for existing profile (English, Art. 14 GDPR)',
    subject: 'Your profile in the Phalanx Expert Network',
    body_text: `Hello {{vorname}} {{nachname}},

from our past work together we have documents of yours on file. Based on these we have created a profile in the Phalanx Expert Network, our own network for interim managers and experts. We are informing you about this transparently, as required by Art. 13 and 14 GDPR.

The following link shows you what is stored. There you can give your consent, set a password and then maintain your profile yourself:

{{link}}

The link is valid for 14 days. If you do not wish to be part of the network, a short reply to this email is enough. We will then delete your data right away.

Best regards
Dr. Christian Neusser
Phalanx GmbH`,
  },
  einladung_bestand_nachfass: {
    name: 'Nachfass an Bestandskontakte (freundlich, vor Löschung)',
    subject: 'Kurze Frage zu deinem Profil im Phalanx Expert Network',
    body_text: `Hallo {{vorname}},

vor einiger Zeit haben wir dich in unser Expert Network eingeladen. Bisher kam keine Rückmeldung, und das ist völlig in Ordnung. Vielleicht war der Zeitpunkt schlecht, vielleicht ist die Mail untergegangen.

Deshalb fragen wir einmal freundlich nach: Willst du dabei sein? Die Einrichtung dauert fünf Minuten, du pflegst Profil und Verfügbarkeit selbst, und wir melden uns nur, wenn ein Mandat wirklich zu dir passt.

{{link}}

Wenn wir nichts von dir hören, löschen wir deine Daten in den nächsten Wochen wieder. Ganz ohne Nachteile, versprochen. Du kannst später jederzeit neu einsteigen.

Herzliche Grüße
Christian`,
  },
  einladung_erinnerung: {
    name: 'Erinnerung an offene Einladung',
    subject: 'Deine Einladung ins Phalanx Expert Network wartet noch',
    body_text: `Hallo {{vorname}},

unsere Einladung ins Phalanx Expert Network liegt noch bei dir. Kein Druck, aber wir wollten kurz erinnern: Fünf Minuten reichen, dann steht dein Profil.

{{link}}

Kein Interesse? Dann musst du nichts tun. Wir löschen deine Daten nach Ablauf der Frist automatisch und vollständig.

Herzliche Grüße
Christian`,
  },
  projekt_match: {
    name: 'Projekt-Match: neues passendes Projekt',
    subject: 'Ein Projekt, das zu dir passt: {{projekt}}',
    body_text: `Hallo {{vorname}},

wir haben ein neues Mandat im Netzwerk, und dein Profil passt gut darauf:

{{projekt}}
{{begruendung}}

Schau es dir an und bewirb dich mit einem Klick, wenn es für dich interessant ist:

{{link}}

Kein Interesse oder gerade ausgebucht? Einfach ignorieren, zu diesem Projekt kommt keine weitere Mail.

Herzliche Grüße
Christian`,
  },
  kundenbewertung: {
    name: 'Bitte um Kundenbewertung nach Projektende',
    subject: 'Wie zufrieden waren Sie mit {{experte}}?',
    body_text: `Guten Tag,

{{projekt}} ist abgeschlossen, und uns interessiert Ihre ehrliche Einschätzung: Wie zufrieden waren Sie mit {{experte}}?

Zwei Minuten reichen. Sterne vergeben, wenn Sie mögen ein Satz dazu, fertig:

{{link}}

Ihre Bewertung hilft uns, die Qualität im Netzwerk hoch zu halten. Der Link funktioniert genau einmal.

Herzliche Grüße
Dr. Christian Neusser
Phalanx GmbH`,
  },
  provider_digest: {
    name: 'Provider-Digest: neue und wieder verfuegbare Profile',
    subject: 'Neue Profile im Phalanx Expert Network',
    body_text: `Hallo,

kurzes Update aus dem Netzwerk. Diese Profile sind neu dabei oder wieder verfuegbar:

{{inhalt}}

Interesse an einem Profil? Ein Klick im Portal genuegt, wir melden uns dann persoenlich mit den Details:

{{link}}

Herzliche Gruesse
Christian`,
  },
  stammdaten_pflegen: {
    name: 'Bitte Stammdaten vervollständigen',
    subject: 'Kurz noch dein Profil vervollständigen?',
    body_text: `Hallo {{vorname}},

schön, dass du dich im Phalanx Expert Network angemeldet hast. Dein Profil ist schon angelegt, es fehlen aber noch ein paar Angaben, die wir für die Vermittlung brauchen.

Konkret geht es um:

Kurzprofil und Berufsbezeichnung, damit klar wird, wofür du stehst
Skills, mindestens fünf, danach sucht unsere Matching-Engine
Tagessatz und Verfügbarkeit, sonst können wir dich Kunden nicht anbieten
Lebenslauf als PDF, den brauchen wir für Shortlists

Hier geht es direkt zu deinem Profil:

{{link}}

Fünf Minuten reichen. Erst mit diesen Angaben nehmen wir dich in den Pool auf und melden uns bei passenden Mandaten. Ohne sie bleibt dein Profil leider außen vor, und das wäre schade.

Fragen? Einfach auf diese Mail antworten.

Herzliche Grüße
Christian`,
  },
  wiedervorlage: {
    name: 'Freundliche Wiedervorlage',
    subject: 'Kurze Erinnerung an dein Profil',
    body_text: `Hallo {{vorname}},

vor ein paar Tagen hatten wir dich gebeten, dein Profil zu vervollständigen. Bisher fehlen noch Angaben, deshalb melde ich mich kurz nochmal.

{{link}}

Wenn gerade der falsche Zeitpunkt ist oder du kein Interesse mehr hast, sag einfach kurz Bescheid. Dann löschen wir dein Profil wieder, ganz ohne Umstände.

Herzliche Grüße
Christian`,
  },
  datei_erneut_hochladen: {
    name: 'Bitte Datei erneut hochladen (nach Speicherpanne)',
    subject: 'Kleine Panne bei uns: bitte deinen Upload wiederholen',
    body_text: `Hallo {{vorname}},

kurze offene Info: Bei einem Update unserer Plattform sind hochgeladene Dateien verloren gegangen, darunter deine. Der Fehler lag bei uns, nicht bei dir, und er ist behoben.

Betroffen ist bei dir:

{{dateien}}

Magst du das nochmal hochladen? Es geht direkt in deinem Profil:

{{link}}

Tut mir leid für den Umstand. Ohne die Unterlagen können wir dich Kunden leider nicht vorschlagen, deshalb die Bitte.

Herzliche Grüße
Christian`,
  },
  gutschrift_versand: {
    name: 'Gutschrift an Interim Manager',
    subject: 'Deine Abrechnung für {{periode}}',
    body_text: `Hallo {{vorname}},

danke für deinen Einsatz im Mandat {{mandat}}. Anbei findest du die Gutschrift {{beleg_nr}} über {{betrag}} brutto für {{periode}}.

Das ist eine Gutschrift nach Paragraf 14 Absatz 2 UStG, du musst uns also keine eigene Rechnung schicken. Wir überweisen den Betrag auf die hinterlegte Bankverbindung.

Falls etwas nicht stimmt, schreib mir einfach kurz, dann korrigieren wir das.

Herzliche Grüße
Christian`,
  },
  rechnung_versand: {
    name: 'Rechnung an Kunden',
    subject: 'Rechnung {{beleg_nr}} für {{periode}}',
    body_text: `Sehr geehrte Damen und Herren,

anbei erhalten Sie die Rechnung {{beleg_nr}} über {{betrag}} brutto für den Leistungszeitraum {{periode}} im Mandat {{mandat}}.

Der Betrag ist ohne Abzug innerhalb von 14 Tagen fällig. Die Einzelheiten zu den abgerechneten Tagen finden Sie auf dem Beleg.

Bei Rückfragen melden Sie sich gerne jederzeit bei mir.

Mit freundlichen Grüßen
Christian Neusser
Phalanx GmbH`,
  },
};

const EDITABLE_KEYS = Object.keys(DEFAULTS);

/** Liefert die wirksame Vorlage (DB-Override oder Standard). */
async function getTemplate(tenantId, key) {
  if (!DEFAULTS[key]) throw new Error(`Unbekannte Vorlage: ${key}`);
  const row = await db('mail_templates').where({ tenant_id: tenantId, key }).first();
  return {
    key,
    name: DEFAULTS[key].name,
    subject: row?.subject || DEFAULTS[key].subject,
    body_text: row?.body_text || DEFAULTS[key].body_text,
    angepasst: Boolean(row),
    updated_at: row?.updated_at || null,
  };
}

function fill(str, vars) {
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

/** Rendert Vorlage → { subject, html, text } im Phalanx-Mail-Layout. */
function render(tpl, vars) {
  const subject = fill(tpl.subject, vars);
  const text = fill(tpl.body_text, vars);
  const button = vars.link
    ? `<a href="${vars.link}" style="display:inline-block;background:#0f2a4a;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">${vars.link_label || 'Zum Phalanx Expert Network'}</a>`
    : '';
  const htmlBody = fill(tpl.body_text, { ...vars, link: ' LINK ' })
    .split(/\n{2,}/)
    .map((abs) => `<p>${abs.replace(/\n/g, '<br />')}</p>`)
    .join('\n')
    .replace(/<p> LINK <\/p>/g, `<p>${button}</p>`)
    .replace(/ LINK /g, button);
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a2332;">
    <div style="padding:24px 0;border-bottom:2px solid #0f2a4a;">
      <span style="font-size:18px;font-weight:700;color:#0f2a4a;">Phalanx</span>
      <span style="font-size:18px;font-weight:300;color:#5a6472;"> Expert Network</span>
    </div>
    <div style="padding:24px 0;line-height:1.6;">${htmlBody}</div>
    <div style="padding:16px 0;border-top:1px solid #e3e6ea;font-size:12px;color:#8a93a0;">
      Phalanx GmbH · Helene-Lange-Str. 28 · 91056 Erlangen
    </div>
  </div>`;
  // Link nur anhängen, wenn er nicht ohnehin per {{link}} im Text steht (sonst doppelt).
  const textOut = tpl.body_text.includes('{{link}}') || !vars.link ? text : `${text}\n\n${vars.link}`;
  return { subject, html, text: textOut };
}

module.exports = { DEFAULTS, EDITABLE_KEYS, getTemplate, render };
