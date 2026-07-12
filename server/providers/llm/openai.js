/** OpenAI-Implementierung (HTTP-API — kein SDK nötig). */
const MODEL = () => process.env.LLM_MODEL || 'gpt-4o-mini';

async function call(system, user, maxTokens = 2000) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI-Fehler ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
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
