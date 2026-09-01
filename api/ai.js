// Generic chat-completion proxy for the web demo (docs/script.js). Prefers
// Claude when ANTHROPIC_API_KEY is set (same priority as mcp/insights.js's
// generate_insights tool); otherwise falls back to the original OpenRouter
// proxy behavior unchanged. Always responds in OpenRouter's
// {choices:[{message:{content}}]} shape so the existing client-side parsing
// in docs/script.js needs no changes either way.

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: { message: 'Method not allowed' } });
    }

    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (err) {
        return res.status(400).json({ error: { message: 'Invalid JSON body.' } });
    }

    if (process.env.ANTHROPIC_API_KEY) {
        return handleClaude(body, res);
    }
    return handleOpenRouter(body, res);
};

async function handleClaude(body, res) {
    const Anthropic = require('@anthropic-ai/sdk');

    const messages = (body.messages || [])
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));

    if (!messages.length) {
        return res.status(400).json({ error: { message: 'messages must include at least one user message.' } });
    }

    try {
        const client = new Anthropic();
        // Opus 5 thinks by default, and max_tokens caps thinking + the
        // actual reply combined — floor it well above what a short reply
        // alone would need so thinking doesn't crowd out the answer.
        const maxTokens = Math.max(Number(body.max_tokens) || 2048, 1024);
        const response = await client.messages.create({
            model: 'claude-opus-5',
            max_tokens: maxTokens,
            thinking: { type: 'adaptive' },
            output_config: { effort: 'low' },
            messages,
            // Note: temperature/top_p/top_k are intentionally not forwarded —
            // Claude Opus 5 rejects them with a 400.
        });

        if (response.stop_reason === 'refusal') {
            return res.status(502).json({ error: { message: 'Claude declined to answer this request.' } });
        }

        const text = response.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('\n')
            .trim();

        if (!text) {
            return res.status(502).json({ error: { message: 'Claude returned an empty response.' } });
        }

        return res.status(200).json({
            choices: [{ message: { role: 'assistant', content: text } }],
            model: 'claude-opus-5',
            provider: 'claude',
        });
    } catch (err) {
        return res.status(500).json({ error: { message: err.message } });
    }
}

async function handleOpenRouter(body, res) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return res.status(500).json({
            error: { message: 'Neither ANTHROPIC_API_KEY nor OPENROUTER_API_KEY is set in Vercel environment variables.' },
        });
    }

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://datavz.vercel.app',
                'X-Title': 'DataViz Studio',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (err) {
        return res.status(500).json({ error: { message: err.message } });
    }
}
