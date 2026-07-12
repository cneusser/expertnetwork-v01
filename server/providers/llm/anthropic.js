/** Anthropic-Implementierung (Claude, HTTP-API — kein SDK nötig). */
const MODEL = () => process.env.LLM_MODEL || 'claude-haiku-4-5';

async function call(system, user, maxTokens = 2000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic-Fehler ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data.content || []).map((c) => c.text || '').join('');
}

async function extract(cvText, prompts) {
  const out = await call(prompts.EXTRACT_PROMPT, cvText.slice(0, 30000));
  const json = out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1);
  return JSON.parse(json);
}

async function matchExplain(ctx, prompts) {
  return (await call(prompts.EXPLAIN_PROMPT, JSON.stringify(ctx), 400)).trim();
}

module.exports = { extract, matchExplain };
