import { isIP } from 'node:net';

const json = (res, status, data) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
};

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 180_000) throw Object.assign(new Error('A solicitação excede o limite de tamanho.'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function safeUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Endereço do provedor inválido.'); }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname))) {
    throw new Error('Use um endereço HTTPS para o provedor.');
  }
  if (url.username || url.password || url.hash) throw new Error('O endereço do provedor contém dados não permitidos.');
  const ip = isIP(url.hostname);
  if (ip === 4 && (url.hostname.startsWith('10.') || url.hostname.startsWith('192.168.') || /^172\\.(1[6-9]|2[0-9]|3[01])\\./.test(url.hostname))) {
    throw new Error('Endereços de rede privada não são aceitos neste endpoint.');
  }
  return url;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 24) {
    throw new Error('A conversa precisa conter entre 1 e 24 mensagens.');
  }
  return messages.map(message => {
    if (!['user', 'assistant'].includes(message?.role) || typeof message.content !== 'string') {
      throw new Error('Formato de conversa inválido.');
    }
    return { role: message.role, content: message.content.slice(0, 24_000) };
  });
}

async function requestProvider(profile, messages, context) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const system = [
      'Você é o assistente de IA do Ateliê TeX, um editor LaTeX em português.',
      'Ajude a escrever, explicar, revisar e depurar documentos LaTeX. Quando fornecer código LaTeX, coloque-o em blocos fenced com a linguagem latex.',
      'Não afirme que alterou o documento: apenas sugira código. O usuário decide quando inserir as alterações.',
      'Responda em português brasileiro, a menos que o usuário peça outro idioma.',
      context ? 'CONTEXTO DO PROJETO (conteúdo fornecido pelo usuário):\\n' + context.slice(0, 48_000) : ''
    ].filter(Boolean).join('\\n\\n');

    if (profile.type === 'bedrock') {
      if (!profile.region || !/^[a-z]{2}(-gov)?-[a-z]+-\\d$/.test(profile.region)) throw new Error('Informe uma região AWS válida, como us-east-1.');
      if (!profile.model) throw new Error('Informe o ID do modelo do Amazon Bedrock.');
      const url = `https://bedrock-runtime.${profile.region}.amazonaws.com/model/${encodeURIComponent(profile.model)}/converse`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${profile.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: [{ text: system }],
          messages: messages.map(m => ({ role: m.role, content: [{ text: m.content }] })),
          inferenceConfig: { maxTokens: 2048, temperature: 0.3 }
        }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.message || data.error?.message || `Amazon Bedrock respondeu HTTP ${response.status}.`);
      return data.output?.message?.content?.map(part => part.text || '').join('\\n') || 'O modelo não retornou texto.';
    }

    if (profile.type === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': profile.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: profile.model,
          max_tokens: 2048,
          temperature: 0.3,
          system,
          messages
        }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || `Anthropic respondeu HTTP ${response.status}.`);
      return data.content?.filter(part => part.type === 'text').map(part => part.text).join('\\n') || 'O modelo não retornou texto.';
    }

    const base = safeUrl(profile.baseUrl || 'https://api.openai.com/v1');
    const endpoint = base.pathname.replace(/\\/$/, '').endsWith('/chat/completions')
      ? base
      : new URL(base.pathname.replace(/\\/$/, '') + '/chat/completions', base.origin);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${profile.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: profile.model,
        messages: [{ role: 'system', content: system }, ...messages],
        temperature: 0.3,
        max_tokens: 2048
      }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || data.message || `O provedor respondeu HTTP ${response.status}.`);
    return data.choices?.[0]?.message?.content || 'O modelo não retornou texto.';
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('O provedor demorou demais para responder. Tente novamente.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function handleAiRequest(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
  try {
    const body = await readBody(req);
    const profile = body.provider || {};
    if (!profile.apiKey || typeof profile.apiKey !== 'string') return json(res, 400, { error: 'Configure a chave de API deste provedor.' });
    if (!profile.model || typeof profile.model !== 'string') return json(res, 400, { error: 'Informe o modelo que deseja utilizar.' });
    if (!['openai-compatible', 'anthropic', 'bedrock'].includes(profile.type)) return json(res, 400, { error: 'Tipo de provedor não suportado.' });
    const messages = normalizeMessages(body.messages);
    const context = typeof body.context === 'string' ? body.context : '';
    const reply = await requestProvider(profile, messages, context);
    return json(res, 200, { reply });
  } catch (error) {
    return json(res, error.status || 502, { error: error.message || 'Não foi possível consultar o provedor de IA.' });
  }
}
