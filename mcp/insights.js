'use strict';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free';
const CLAUDE_MODEL = 'claude-opus-5';

function buildPrompt({ labels, series, seriesLabels, chartType, question }) {
  const valuesArray = Array.isArray(series[0]) ? series : [series];
  const names = seriesLabels && seriesLabels.length ? seriesLabels : valuesArray.map((_, i) => `Series ${i + 1}`);
  const seriesSummary = valuesArray.map((vals, i) => `- ${names[i]}: ${vals.join(', ')}`).join('\n');
  const header = `Chart type: ${chartType || 'unspecified'}\nLabels: ${labels.join(', ')}\nData:\n${seriesSummary}`;

  if (question) {
    return `You are a data analyst. Given this chart data, answer the question concisely and specifically, citing numbers from the data.\n\n${header}\n\nQuestion: ${question}`;
  }

  return `You are a data analyst. Analyze the following chart data and give 3 concise bullet-point insights about trends, peaks, dips, or comparisons. Be specific with numbers.\n\n${header}\n\nRespond with exactly 3 bullet points starting with -. No intro sentence.`;
}

async function generateInsightsWithClaude(prompt) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: prompt }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to analyze this data.');
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('Claude returned an empty response.');
  return { text, provider: 'claude', model: CLAUDE_MODEL };
}

async function generateInsightsWithOpenRouter(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://datavz.vercel.app',
      'X-Title': 'DataViz Studio Agent',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1500,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`OpenRouter error ${res.status}: ${data?.error?.message || res.statusText}`);
  }

  const msg = data.choices?.[0]?.message || {};
  let text = msg.content?.trim();
  if (!text && msg.reasoning) {
    // Some free reasoning models (e.g. Nemotron) return content: null with the
    // answer inside `reasoning` instead.
    text = String(msg.reasoning).trim();
  }
  if (!text) throw new Error('OpenRouter returned an empty response.');
  return { text, provider: 'openrouter', model: OPENROUTER_MODEL };
}

async function generateInsights({ labels, series, seriesLabels, chartType, question }) {
  if (!Array.isArray(labels) || !labels.length) {
    throw new Error('labels must be a non-empty array');
  }
  if (!Array.isArray(series) || !series.length) {
    throw new Error('series must be a non-empty array');
  }

  const prompt = buildPrompt({ labels, series, seriesLabels, chartType, question });

  if (process.env.ANTHROPIC_API_KEY) {
    return generateInsightsWithClaude(prompt);
  }
  if (process.env.OPENROUTER_API_KEY) {
    return generateInsightsWithOpenRouter(prompt);
  }
  throw new Error(
    'No AI provider configured. Set ANTHROPIC_API_KEY (recommended) or OPENROUTER_API_KEY in your environment.'
  );
}

module.exports = { generateInsights };
