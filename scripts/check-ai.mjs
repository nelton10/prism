import assert from 'node:assert/strict';
import { handleAiRequest } from '../lib/ai-handler.mjs';

const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), options });
  const body = JSON.parse(options.body);
  if (String(url).includes('bedrock-runtime')) {
    return new Response(JSON.stringify({
      output: { message: { content: [{ text: 'Resposta Bedrock simulada.' }] } }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (String(url).includes('api.anthropic.com')) {
    return new Response(JSON.stringify({
      content: [{ type: 'text', text: 'Resposta Claude simulada.' }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({
    choices: [{ message: { content: 'Resposta OpenAI compatível simulada.' } }]
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};

function responseRecorder() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = JSON.parse(value); }
  };
}

async function invoke(provider, extra = {}) {
  const res = responseRecorder();
  await handleAiRequest({
    method: 'POST',
    headers: { host: 'localhost' },
    body: {
      provider,
      messages: [{ role: 'user', content: 'Teste de conexão.' }],
      context: 'Documento LaTeX de teste.',
      ...extra
    }
  }, res);
  return res;
}

try {
  const compatible = await invoke({
    type: 'openai-compatible',
    model: 'test-model',
    apiKey: 'test-token',
    baseUrl: 'https://api.openai.com/v1/'
  });
  assert.equal(compatible.statusCode, 200);
  assert.equal(compatible.body.reply, 'Resposta OpenAI compatível simulada.');
  assert.match(calls[0].url, /\/v1\/chat\/completions$/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
  assert.equal(calls[0].options.redirect, 'error');

  const anthropic = await invoke({
    type: 'anthropic',
    model: 'claude-test',
    apiKey: 'claude-token'
  });
  assert.equal(anthropic.statusCode, 200);
  assert.equal(anthropic.body.reply, 'Resposta Claude simulada.');
  assert.equal(calls[1].options.headers['x-api-key'], 'claude-token');
  assert.equal(calls[1].options.redirect, 'error');

  const bedrock = await invoke({
    type: 'bedrock',
    model: 'anthropic.claude-test',
    apiKey: 'bedrock-token',
    region: 'us-east-1'
  });
  assert.equal(bedrock.statusCode, 200);
  assert.equal(bedrock.body.reply, 'Resposta Bedrock simulada.');
  assert.match(calls[2].url, /bedrock-runtime\.us-east-1\.amazonaws\.com\/model\//);
  assert.equal(calls[2].options.headers.Authorization, 'Bearer bedrock-token');
  assert.equal(calls[2].options.redirect, 'error');

  const rejectedRegion = await invoke({
    type: 'bedrock',
    model: 'model',
    apiKey: 'test-token',
    region: 'invalid-region'
  });
  assert.equal(rejectedRegion.statusCode, 502);

  const rejectedPrivateUrl = await invoke({
    type: 'openai-compatible',
    model: 'test-model',
    apiKey: 'test-token',
    baseUrl: 'https://127.0.0.1/v1'
  });
  assert.equal(rejectedPrivateUrl.statusCode, 502);

  const rejectedOrigin = responseRecorder();
  await handleAiRequest({
    method: 'POST',
    headers: { host: 'atelie.example', origin: 'https://attacker.example' },
    body: {}
  }, rejectedOrigin);
  assert.equal(rejectedOrigin.statusCode, 403);

  console.log('Testes do endpoint de IA: OpenAI compatível, Anthropic, Bedrock, região, URL privada e origem concluídos.');
} finally {
  globalThis.fetch = originalFetch;
}
