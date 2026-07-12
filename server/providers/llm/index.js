/**
 * LLMProvider-Interface (Sprint 9):
 *   extract(cvText)  → strukturiertes Profil-JSON (Skills, Rollen, Branchen, …)
 *   matchExplain(ctx) → 2–3 Sätze Klartext-Begründung (deutsch)
 * Auswahl: LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY (empfohlen)
 *          LLM_PROVIDER=openai   + OPENAI_API_KEY
 * Fallback: Stub (deterministisch, für Dev/Tests).
 * Der Matching-SCORE bleibt deterministisch (utils/matching.js) — das LLM
 * liefert ausschließlich Erklärtexte und Extraktionsvorschläge.
 */
const anthropic = require('./anthropic');
const openai = require('./openai');
const stub = require('./stub');

function getLlmProvider() {
  if (process.env.LLM_PROVIDER === 'anthropic' && process.env.ANTHROPIC_API_KEY) return anthropic;
  if (process.env.LLM_PROVIDER === 'openai' && process.env.OPENAI_API_KEY) return openai;
  return stub;
}

const EXTRACT_PROMPT = `Du bist ein präziser CV-Parser für ein deutsches Expertennetzwerk
(Interim Manager, Berater, Projektleiter). Analysiere den folgenden Lebenslauf-Text und
antworte AUSSCHLIESSLICH mit einem JSON-Objekt in exakt diesem Schema (deutsch):
{
  "berufsbezeichnung": string|null,
  "kurzprofil": string|null,          // 3-5 Sätze, sachlich, mit Referenzerfolgen
  "senioritaet": string|null,          // z.B. "C-Level", "Senior", "Executive"
  "jahre_erfahrung": number|null,
  "skills": [{"name": string, "kategorie": "kompetenz"|"technologie"|"rolle"|"branche"|"zertifikat"}],
  "sprachen": [{"sprache": string, "niveau": string}],
  "projektarten": [string]
}
Maximal 30 Skills, prägnante deutsche Bezeichnungen (z.B. "Turnaround-Management", "SAP").
Kein Text vor oder nach dem JSON.`;

const EXPLAIN_PROMPT = `Du bist Staffing-Berater der Phalanx GmbH. Erkläre in 2-3 deutschen
Sätzen, warum der Experte zum Projekt passt (oder wo Risiken liegen). Sachlich, konkret,
ohne Floskeln. Nutze die mitgelieferten deterministischen Teilwerte als Grundlage.`;

module.exports = { getLlmProvider, EXTRACT_PROMPT, EXPLAIN_PROMPT };
