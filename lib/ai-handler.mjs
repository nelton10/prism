import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

const json = (res, status, data) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
};

async function readBody(req) {
  if (req.body && typeof req.body === 'object') {
    if (Buffer.byteLength(JSON.stringify(req.body)) > 180_000) {
      throw Object.assign(new Error('A solicitação excede o limite de tamanho.'), { status: 413 });
    }
    return req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 180_000) throw Object.assign(new Error('A solicitação excede o limite de tamanho.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('O corpo da solicitação não contém JSON válido.'), { status: 400 }); }
}

function isPrivateAddress(address) {
  const version = isIP(address);
  if (version === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && c === 0))) ||
      (a === 198 && (b === 18 || b === 19));
  }
  if (version === 6) {
    const value = address.toLowerCase();
    return value === '::' || value === '::1' ||
      value.startsWith('fc') || value.startsWith('fd') ||
      /^fe[89ab]/.test(value) || value.startsWith('ff') ||
      value.startsWith('::ffff:');
  }
  return false;
}

async function safeUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Endereço do provedor inválido.'); }
  if (url.username || url.password || url.hash) throw new Error('O endereço do provedor contém dados não permitidos.');

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const ipVersion = isIP(hostname);
  const loopback = hostname === 'localhost' || hostname.endsWith('.localhost') ||
    (ipVersion === 4 && hostname.startsWith('127.')) ||
    (ipVersion === 6 && hostname === '::1');
  const localDevelopment = process.env.NODE_ENV !== 'production' && loopback;

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localDevelopment)) {
    throw new Error('Use um endereço HTTPS para o provedor.');
  }
  if (loopback && !localDevelopment) throw new Error('Endereços locais não são aceitos em produção.');
  if (ipVersion && isPrivateAddress(hostname) && !localDevelopment) {
    throw new Error('Endereços IP privados não são aceitos neste endpoint.');
  }
  if (!ipVersion && !localDevelopment) {
    let addresses;
    try { addresses = await lookup(hostname, { all: true, verbatim: true }); }
    catch { throw new Error('Não foi possível resolver o endereço do provedor.'); }
    if (addresses.some(item => isPrivateAddress(item.address))) {
      throw new Error('O endereço do provedor resolve para uma rede privada.');
    }
  }
  return url;
}
function normalizeMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 24) {
    throw new Error('A conversa precisa conter entre 1 e 24 mensagens.');
  }
  let totalBytes = 0;
  return messages.map(message => {
    if (!['user', 'assistant'].includes(message?.role) || typeof message.content !== 'string') {
      throw new Error('Formato de conversa inválido.');
    }
    totalBytes += Buffer.byteLength(message.content);
    if (totalBytes > 120_000) throw Object.assign(new Error('A conversa excede o limite de tamanho.'), { status: 413 });
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
      context ? 'CONTEXTO DO PROJETO (conteúdo fornecido pelo usuário):\n' + context.slice(0, 48_000) : ''
    ].filter(Boolean).join('\n\n');

    if (profile.type === 'bedrock') {
      if (!profile.region || !/^[a-z]{2}(-gov)?-[a-z]+-\d$/.test(profile.region)) throw new Error('Informe uma região AWS válida, como us-east-1.');
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
        signal: controller.signal,
        redirect: 'error'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error?.message || `Amazon Bedrock respondeu HTTP ${response.status}.`);
      return data.output?.message?.content?.map(part => part.text || '').join('\n') || 'O modelo não retornou texto.';
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
      return data.content?.filter(part => part.type === 'text').map(part => part.text).join('\n') || 'O modelo não retornou texto.';
    }

    const base = await safeUrl(profile.baseUrl || 'https://api.openai.com/v1');
    const endpoint = base.pathname.replace(/\/+$/, '').endsWith('/chat/completions')
      ? base
      : new URL(base.pathname.replace(/\/+$/, '') + '/chat/completions', base.origin);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${profile.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: profile.model,
        messages: [{ role: 'system', content: system }, ...messages],
        temperature: 0.3,
        max_tokens: 2048
      }),
      signal: controller.signal,
      redirect: 'error'
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
    const origin = req.headers?.origin;
    const host = req.headers?.host;
    if (origin) {
      let originHost;
      try { originHost = new URL(origin).host; } catch { return json(res, 403, { error: 'Origem da solicitação inválida.' }); }
      if (!host || originHost !== host) return json(res, 403, { error: 'Solicitação de outra origem não permitida.' });
    }
    const body = await readBody(req);
    const profile = body.provider || {};
    if (!profile.apiKey || typeof profile.apiKey !== 'string') return json(res, 400, { error: 'Configure a chave de API deste provedor.' });
    if (!profile.model || typeof profile.model !== 'string') return json(res, 400, { error: 'Informe o modelo que deseja utilizar.' });
    if (profile.apiKey.length > 4096 || profile.model.length > 200) return json(res, 400, { error: 'A chave ou o ID do modelo excede o limite permitido.' });
    if (profile.type === 'openai-compatible' && typeof profile.baseUrl === 'string' && profile.baseUrl.length > 2048) return json(res, 400, { error: 'A URL do provedor é muito longa.' });
    if (!['openai-compatible', 'anthropic', 'bedrock'].includes(profile.type)) return json(res, 400, { error: 'Tipo de provedor não suportado.' });
    const messages = normalizeMessages(body.messages);
    const context = typeof body.context === 'string' ? body.context : '';
    const reply = await requestProvider(profile, messages, context);
    return json(res, 200, { reply });
  } catch (error) {
    return json(res, error.status || 502, { error: error.message || 'Não foi possível consultar o provedor de IA.' });
  }
}
