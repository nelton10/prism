const $ = id => document.getElementById(id);
const storageKey = 'atelie-tex-ai-providers-v1';
const presets = {
  openai: { name: 'OpenAI', type: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', keyLabel: 'API key' },
  gemini: { name: 'Google Gemini', type: 'openai-compatible', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', keyLabel: 'API key do Google AI Studio' },
  deepseek: { name: 'DeepSeek', type: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', keyLabel: 'API key' },
  openrouter: { name: 'OpenRouter', type: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1-mini', keyLabel: 'API key' },
  groq: { name: 'Groq', type: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', keyLabel: 'API key' },
  mistral: { name: 'Mistral', type: 'openai-compatible', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', keyLabel: 'API key' },
  anthropic: { name: 'Anthropic Claude', type: 'anthropic', baseUrl: '', model: 'claude-sonnet-4-20250514', keyLabel: 'API key' },
  bedrock: { name: 'Amazon Bedrock', type: 'bedrock', baseUrl: '', model: '', region: 'us-east-1', keyLabel: 'Bedrock API key (Bearer token)' },
  custom: { name: 'Outro serviço compatível', type: 'openai-compatible', baseUrl: 'https://', model: '', keyLabel: 'API key' }
};

export function initAiAssistant({ getContext, getCompileLog, insertAtCursor }) {
  const panel = $('ai-panel');
  if (!panel) return;
  let providers = [];
  let selectedId = '';
  let editingId = '';
  let history = [];
  let busy = false;

  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (Array.isArray(stored)) providers = stored.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string');
  } catch {}

  const saveProviders = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(providers));
      return true;
    } catch {
      configStatus('Não foi possível salvar. Verifique o espaço disponível no navegador.');
      return false;
    }
  };
  const activeProvider = () => providers.find(p => p.id === selectedId);
  const configStatus = message => { $('ai-config-status').textContent = message; };

  function renderProviderSelect() {
    const select = $('ai-active-provider');
    select.replaceChildren();
    if (!providers.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Configure uma IA';
      select.append(option);
      selectedId = '';
    } else {
      for (const provider of providers) {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.name + ' · ' + provider.model;
        select.append(option);
      }
      if (!providers.some(p => p.id === selectedId)) selectedId = providers[0].id;
      select.value = selectedId;
    }
  }

  function showPanel(show) {
    panel.classList.toggle('is-open', show);
    panel.setAttribute('aria-hidden', String(!show));
    $('ai-backdrop').hidden = !show;
    $('ai-open').setAttribute('aria-expanded', String(show));
    if (show) $('ai-prompt').focus();
  }

  function showSettings(show) {
    $('ai-settings').hidden = !show;
    if (show) $('ai-settings-toggle').setAttribute('aria-expanded', 'true');
    else $('ai-settings-toggle').setAttribute('aria-expanded', 'false');
  }

  function applyPreset(key) {
    const preset = presets[key] || presets.custom;
    $('ai-name').value = preset.name;
    $('ai-model').value = preset.model;
    $('ai-base-url').value = preset.baseUrl;
    $('ai-region').value = preset.region || '';
    $('ai-region').disabled = key !== 'bedrock';
    $('ai-base-url').disabled = key === 'bedrock' || key === 'anthropic';
    $('ai-key').placeholder = preset.keyLabel;
  }

  function clearConfig() {
    editingId = '';
    $('ai-preset').value = 'openai';
    applyPreset('openai');
    $('ai-key').value = '';
    $('ai-delete').hidden = true;
    configStatus('Adicione uma conexão e informe a chave emitida pelo provedor.');
  }

  function editConfig(provider) {
    editingId = provider.id;
    $('ai-preset').value = provider.preset || 'custom';
    applyPreset($('ai-preset').value);
    $('ai-name').value = provider.name;
    $('ai-model').value = provider.model;
    $('ai-base-url').value = provider.baseUrl || '';
    $('ai-region').value = provider.region || '';
    $('ai-key').value = provider.apiKey;
    $('ai-region').disabled = provider.type !== 'bedrock';
    $('ai-base-url').disabled = provider.type === 'bedrock' || provider.type === 'anthropic';
    $('ai-delete').hidden = false;
    configStatus('Edite os dados e salve para atualizar esta conexão.');
  }

  function addMessage(role, content, options = {}) {
    const welcome = $('ai-messages').querySelector('.ai-welcome');
    if (welcome) welcome.remove();
    const article = document.createElement('article');
    article.className = 'ai-message ai-message-' + role;
    const label = document.createElement('span');
    label.className = 'ai-message-label';
    label.textContent = role === 'user' ? 'Você' : role === 'error' ? 'Erro' : 'Assistente';
    const body = document.createElement('div');
    body.className = 'ai-message-body';
    const codeMatches = [...content.matchAll(/```(?:latex|tex)?\s*([\s\S]*?)```/gi)];
    if (!codeMatches.length) {
      body.textContent = content;
    } else {
      let cursor = 0;
      for (const match of codeMatches) {
        if (match.index > cursor) {
          const paragraph = document.createElement('p');
          paragraph.textContent = content.slice(cursor, match.index).trim();
          body.append(paragraph);
        }
        const pre = document.createElement('pre');
        pre.className = 'ai-code';
        const code = document.createElement('code');
        code.textContent = match[1].trim();
        pre.append(code);
        body.append(pre);
        if (role === 'assistant') {
          const insert = document.createElement('button');
          insert.type = 'button';
          insert.className = 'ai-insert';
          insert.textContent = 'Inserir no editor';
          insert.addEventListener('click', () => {
            insertAtCursor(match[1].trim() + '\n');
            insert.textContent = 'Inserido no editor';
            insert.disabled = true;
          });
          body.append(insert);
        }
        cursor = match.index + match[0].length;
      }
      if (cursor < content.length) {
        const paragraph = document.createElement('p');
        paragraph.textContent = content.slice(cursor).trim();
        body.append(paragraph);
      }
    }
    article.append(label, body);
    $('ai-messages').append(article);
    $('ai-messages').scrollTop = $('ai-messages').scrollHeight;
  }

  async function callAi(messages, isTest = false) {
    const provider = activeProvider();
    if (!provider) throw new Error('Configure e selecione um provedor de IA antes de enviar.');
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        messages,
        context: isTest ? '' : getContext()
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Falha ao consultar o provedor.');
    if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('O provedor não retornou uma resposta de texto válida.');
    return data.reply;
  }

  async function send(text) {
    if (busy || !text.trim()) return;
    if (!activeProvider()) {
      showSettings(true);
      configStatus('Primeiro configure e selecione uma conexão de IA.');
      return;
    }
    busy = true;
    $('ai-send').disabled = $('ai-test').disabled = true;
    $('ai-send').textContent = 'Aguarde…';
    history.push({ role: 'user', content: text.trim() });
    addMessage('user', text.trim());
    const waiting = document.createElement('div');
    waiting.className = 'ai-thinking';
    waiting.textContent = 'A IA está pensando…';
    $('ai-messages').append(waiting);
    try {
      const reply = await callAi(history.slice(-20));
      waiting.remove();
      history.push({ role: 'assistant', content: reply });
      addMessage('assistant', reply);
    } catch (error) {
      waiting.remove();
      addMessage('error', error.message);
    } finally {
      busy = false;
      $('ai-send').disabled = $('ai-test').disabled = false;
      $('ai-send').textContent = 'Enviar ↑';
      $('ai-prompt').focus();
    }
  }

  $('ai-open').addEventListener('click', () => showPanel(true));
  $('ai-close').addEventListener('click', () => showPanel(false));
  $('ai-backdrop').addEventListener('click', () => showPanel(false));
  $('ai-settings-toggle').addEventListener('click', () => showSettings($('ai-settings').hidden));
  $('ai-new-provider').addEventListener('click', clearConfig);
  $('ai-preset').addEventListener('change', event => applyPreset(event.target.value));
  $('ai-active-provider').addEventListener('change', event => {
    selectedId = event.target.value;
    const provider = activeProvider();
    if (provider) editConfig(provider);
  });
  $('ai-save').addEventListener('click', () => {
    const presetKey = $('ai-preset').value;
    const preset = presets[presetKey];
    const provider = {
      id: editingId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      preset: presetKey,
      name: $('ai-name').value.trim() || preset.name,
      type: preset.type,
      model: $('ai-model').value.trim(),
      baseUrl: $('ai-base-url').value.trim(),
      region: $('ai-region').value.trim(),
      apiKey: $('ai-key').value.trim()
    };
    if (!provider.model || !provider.apiKey) return configStatus('Preencha o modelo e a chave de API.');
    if (provider.type === 'openai-compatible' && !provider.baseUrl) return configStatus('Informe a URL base da API.');
    if (provider.type === 'bedrock' && !provider.region) return configStatus('Informe a região AWS.');
    const index = providers.findIndex(p => p.id === provider.id);
    if (index >= 0) providers[index] = provider;
    else providers.push(provider);
    selectedId = provider.id;
    if (!saveProviders()) return;
    renderProviderSelect();
    $('ai-active-provider').value = selectedId;
    editConfig(provider);
    configStatus('Conexão salva neste navegador. Você já pode conversar com o modelo.');
  });
  $('ai-delete').addEventListener('click', () => {
    if (!editingId || !confirm('Excluir esta conexão deste navegador?')) return;
    providers = providers.filter(p => p.id !== editingId);
    if (selectedId === editingId) selectedId = providers[0]?.id || '';
    if (!saveProviders()) return;
    renderProviderSelect();
    clearConfig();
  });
  $('ai-test').addEventListener('click', async () => {
    const saved = activeProvider();
    const draft = {
      preset: $('ai-preset').value,
      type: presets[$('ai-preset').value].type,
      name: $('ai-name').value.trim(),
      model: $('ai-model').value.trim(),
      baseUrl: $('ai-base-url').value.trim(),
      region: $('ai-region').value.trim(),
      apiKey: $('ai-key').value.trim()
    };
    if (!draft.model || !draft.apiKey) return configStatus('Informe modelo e chave antes de testar.');
    const temporaryId = selectedId;
    const temporary = providers;
    if (editingId && saved) providers = providers.map(p => p.id === editingId ? { ...draft, id: editingId } : p);
    else { providers = [...providers, { ...draft, id: '__test__' }]; selectedId = '__test__'; }
    $('ai-test').disabled = true;
    configStatus('Testando conexão…');
    try {
      const reply = await callAi([{ role: 'user', content: 'Responda apenas: conexão funcionando.' }], true);
      configStatus('Conexão bem-sucedida: ' + reply.slice(0, 140));
    } catch (error) {
      configStatus('Falha no teste: ' + error.message);
    } finally {
      providers = temporary;
      selectedId = temporaryId;
      $('ai-test').disabled = false;
    }
  });
  $('ai-form').addEventListener('submit', event => {
    event.preventDefault();
    const prompt = $('ai-prompt').value;
    $('ai-prompt').value = '';
    send(prompt);
  });
  $('ai-prompt').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      $('ai-form').requestSubmit();
    }
  });
  $('ai-error-context').addEventListener('click', () => {
    const log = getCompileLog();
    if (!log) return configStatus('Ainda não há log de compilação. Compile o documento primeiro.');
    send('Analise este log de compilação LaTeX, identifique a causa provável e sugira a correção.\n\n' + log.slice(0, 12_000));
  });

  renderProviderSelect();
  if (activeProvider()) editConfig(activeProvider());
  else clearConfig();
  $('ai-context-file').textContent = document.getElementById('tab')?.textContent || 'documento atual';
  const observer = new MutationObserver(() => {
    $('ai-context-file').textContent = document.getElementById('tab')?.textContent || 'documento atual';
  });
  const tab = document.getElementById('tab');
  if (tab) observer.observe(tab, { childList: true, characterData: true, subtree: true });
}
