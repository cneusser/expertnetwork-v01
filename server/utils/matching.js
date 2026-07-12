/**
 * Deterministisches, ERKLÄRBARES Matching (Sprint 6) — kein LLM, reproduzierbar.
 * score = 45 % Skill-Überdeckung + 25 % Verfügbarkeits-Fit + 20 % Satz-Fit + 10 % Frische.
 * Liefert Score (0–100), Aufschlüsselung und eine Begründung im Klartext.
 * Sprint 9 ergänzt eine LLM-Erklärung — der Score selbst bleibt deterministisch.
 */
const fmt = (d) => (d ? new Date(d).toLocaleDateString('de-DE') : null);

function computeMatch({ project, projectSkillIds, expertSkillIds, latestAvail, latestRate, freshnessScore, nichtBestaetigt }) {
  // 1) Skills
  const required = projectSkillIds.length;
  const matched = projectSkillIds.filter((id) => expertSkillIds.includes(id)).length;
  const skillFit = required ? matched / required : 1;
  const skillText = required ? `Skills ${matched}/${required}` : 'keine Skill-Anforderungen';

  // 2) Verfügbarkeit
  let availFit = 0.3;
  let availText = 'keine Verfügbarkeit hinterlegt';
  if (latestAvail) {
    const ab = latestAvail.ab_datum ? new Date(latestAvail.ab_datum) : null;
    const start = project.start ? new Date(project.start) : null;
    if (latestAvail.status === 'ausgebucht') {
      availFit = 0;
      availText = 'ausgebucht';
    } else if (latestAvail.status === 'sofort') {
      availFit = 1;
      availText = 'sofort verfügbar';
    } else {
      const pct = latestAvail.auslastung_prozent;
      const base = latestAvail.status === 'teilweise' ? Math.max(0.4, (pct || 50) / 100) : 1;
      if (!ab || !start || ab <= start) {
        availFit = base;
        availText = `verfügbar${ab ? ` ab ${fmt(ab)}` : ''}${pct ? ` (${pct} %)` : ''}`;
      } else {
        const tageZuSpaet = Math.ceil((ab - start) / 86400000);
        availFit = tageZuSpaet <= 60 ? base * 0.5 : 0.2;
        availText = `erst ab ${fmt(ab)} (${tageZuSpaet} Tage nach Projektstart)`;
      }
    }
    if (nichtBestaetigt) {
      availFit *= 0.5;
      availText += ', nicht bestätigt';
    }
  }

  // 3) Tagessatz
  let rateFit = 0.5;
  let rateText = 'kein Tagessatz hinterlegt';
  if (latestRate) {
    const von = latestRate.satz_von_eur;
    const bis = latestRate.satz_bis_eur || von;
    if (!project.tagessatz_bis_eur) {
      rateFit = 1;
      rateText = `Satz ${von}${bis !== von ? `–${bis}` : ''} € (kein Budgetlimit)`;
    } else if (von <= project.tagessatz_bis_eur) {
      rateFit = 1;
      rateText = `Satz ${von}${bis !== von ? `–${bis}` : ''} € passt zum Limit ${project.tagessatz_bis_eur} €`;
    } else if (von <= project.tagessatz_bis_eur * 1.1) {
      rateFit = 0.6;
      rateText = `Satz ${von} € knapp über Limit ${project.tagessatz_bis_eur} €`;
    } else {
      rateFit = 0.2;
      rateText = `Satz ${von} € deutlich über Limit ${project.tagessatz_bis_eur} €`;
    }
  }

  // 4) Frische
  const fresh = (freshnessScore || 0) / 100;

  const score = Math.round(100 * (0.45 * skillFit + 0.25 * availFit + 0.2 * rateFit + 0.1 * fresh));
  return {
    score,
    breakdown: {
      skills: Math.round(skillFit * 100),
      verfuegbarkeit: Math.round(availFit * 100),
      satz: Math.round(rateFit * 100),
      frische: freshnessScore || 0,
    },
    begruendung: `${skillText} · ${availText} · ${rateText} · Profilfrische ${freshnessScore || 0}/100`,
  };
}

module.exports = { computeMatch };
