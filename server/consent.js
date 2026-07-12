/**
 * DSGVO-Einwilligungstext als VERSIONIERTE Konstante.
 * Bei jeder Textänderung: Version hochzählen — bestehende consents-Records
 * behalten ihre alte text_version (Nachweisbarkeit).
 * Der Text ist ein Entwurf und muss juristisch geprüft werden.
 */
const CONSENT_VERSION = '2026-07-v1';
const CONSENT_ZWECK = 'talentpool';
const CONSENT_MONTHS = 24; // Befristung gem. Aufsichtsbehörden-Empfehlung (1–2 Jahre)

const CONSENT_TEXT = `Ich willige ein, dass die Phalanx GmbH die von mir angegebenen
personenbezogenen Daten (Kontaktdaten, berufliches Profil, Qualifikationen, Tagessätze,
Verfügbarkeiten sowie hochgeladene Dokumente) zum Zweck der Aufnahme in ihren
Experten-Pool speichert und verarbeitet, um mich bei passenden Projekten zu
kontaktieren. Die Einwilligung gilt für ${CONSENT_MONTHS} Monate und kann jederzeit
mit Wirkung für die Zukunft widerrufen werden (z. B. per E-Mail oder über das
Self-Service-Portal). Nach Widerruf oder Fristablauf ohne Erneuerung werden meine
Daten gelöscht bzw. anonymisiert. Es gelten die Informationen gemäß Art. 13 DSGVO
in der Datenschutzerklärung.`;

function consentExpiry(from = new Date()) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + CONSENT_MONTHS);
  return d;
}

module.exports = { CONSENT_VERSION, CONSENT_ZWECK, CONSENT_TEXT, CONSENT_MONTHS, consentExpiry };
