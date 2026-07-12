/** Dev-/Test-Stub: deterministische Ergebnisse ohne API-Aufruf. */

async function extract(cvText) {
  const skills = [{ name: 'Lean Management', kategorie: 'kompetenz' }];
  if (/qualit/i.test(cvText)) skills.push({ name: 'Qualitätsmanagement', kategorie: 'kompetenz' });
  if (/sap/i.test(cvText)) skills.push({ name: 'SAP', kategorie: 'technologie' });
  skills.push({ name: 'Stub-Spezialkompetenz', kategorie: 'kompetenz' }); // bewusst neu → Freigabeliste
  return {
    berufsbezeichnung: 'Interim Manager (Stub-Extraktion)',
    kurzprofil: 'Automatisch extrahiertes Kurzprofil (Stub). In Produktion liefert das LLM hier 3–5 präzise Sätze.',
    senioritaet: 'Executive',
    jahre_erfahrung: 20,
    skills,
    sprachen: [{ sprache: 'Deutsch', niveau: 'Muttersprache' }],
    projektarten: ['Turnaround', 'Interim-Führung'],
  };
}

async function matchExplain(ctx) {
  return `Der Experte deckt die Kernanforderungen ab (Skill-Fit ${ctx?.breakdown?.skills ?? '–'} %) und ist zeitlich realistisch verfügbar. (Stub-Erklärung — in Produktion formuliert das LLM hier 2–3 konkrete Sätze.)`;
}

module.exports = { extract, matchExplain };
