const api = globalThis.chrome || globalThis.browser;
const DEFAULT_SETTINGS = {
  apiBase: 'http://localhost:3000',
  autoSend: true,
  confirmBeforeSend: true,
  onlyMarked: false,
  intervalMs: 1100
};
let confirmWindowId = null;

function normalizeApiBase(value) {
  return String(value || DEFAULT_SETTINGS.apiBase).trim().replace(/\/+$/, '');
}

function storageGet(keys) {
  return new Promise((resolve) => {
    try {
      const result = api.storage.local.get(keys, resolve);
      if (result?.then) result.then(resolve);
    } catch {
      api.storage.local.get(keys).then(resolve);
    }
  });
}

function storageSet(values) {
  return new Promise((resolve) => {
    try {
      const result = api.storage.local.set(values, resolve);
      if (result?.then) result.then(resolve);
    } catch {
      api.storage.local.set(values).then(resolve);
    }
  });
}

function storageRemove(keys) {
  return new Promise((resolve) => {
    try {
      const result = api.storage.local.remove(keys, resolve);
      if (result?.then) result.then(resolve);
    } catch {
      api.storage.local.remove(keys).then(resolve);
    }
  });
}

async function getSettings() {
  const stored = await storageGet(DEFAULT_SETTINGS);

  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    apiBase: normalizeApiBase(stored.apiBase)
  };
}

function countAccessKeys(text) {
  return (String(text || '').match(/\b[A-Z0-9]{44}\b/gi) || []).length;
}

function looksLikeDanfeText(text) {
  return countAccessKeys(text) > 0;
}

function textSignature(text) {
  const keys = String(text || '').match(/\b[A-Z0-9]{44}\b/gi) || [];
  return `${keys.length}:${keys.slice(0, 8).join('|')}:${String(text || '').length}`;
}

async function setBadge(text, color = '#116149') {
  if (!api.action?.setBadgeText) return;

  await api.action.setBadgeBackgroundColor({ color });
  await api.action.setBadgeText({ text });
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `HTTP ${response.status}`);
    error.payload = data;
    error.status = response.status;
    throw error;
  }

  return data;
}

async function sendCaptureToDesktop(text, source, settings) {
  return requestJson(`${settings.apiBase}/api/microservico/extensao/receber`, {
    method: 'POST',
    body: JSON.stringify({
      texto: text,
      source,
      somenteSelecionadas: Boolean(settings.onlyMarked),
      intervaloMs: Number(settings.intervalMs || DEFAULT_SETTINGS.intervalMs)
    })
  });
}

async function shouldSkipDuplicate(signature) {
  const now = Date.now();
  const stored = await storageGet({
    lastSignature: '',
    lastSentAt: 0
  });

  if (stored.lastSignature === signature && now - Number(stored.lastSentAt || 0) < 15000) {
    return true;
  }

  await storageSet({
    lastSignature: signature,
    lastSentAt: now
  });

  return false;
}

async function shouldSkipDuplicatePrompt(signature) {
  const now = Date.now();
  const stored = await storageGet({
    lastPromptSignature: '',
    lastPromptAt: 0
  });

  if (stored.lastPromptSignature === signature && now - Number(stored.lastPromptAt || 0) < 8000) {
    return true;
  }

  await storageSet({
    lastPromptSignature: signature,
    lastPromptAt: now
  });

  return false;
}

function createExtensionWindow(options) {
  return new Promise((resolve) => {
    if (api.windows?.create) {
      try {
        const result = api.windows.create(options, resolve);
        if (result?.then) result.then(resolve);
      } catch {
        api.windows.create(options).then(resolve);
      }
      return;
    }

    try {
      const result = api.tabs.create({ url: options.url }, resolve);
      if (result?.then) result.then(resolve);
    } catch {
      api.tabs.create({ url: options.url }).then(resolve);
    }
  });
}

function updateExtensionWindow(windowId, options) {
  return new Promise((resolve) => {
    if (!api.windows?.update || !windowId) {
      resolve(null);
      return;
    }

    try {
      const result = api.windows.update(windowId, options, resolve);
      if (result?.then) result.then(resolve);
    } catch {
      api.windows.update(windowId, options).then(resolve).catch(() => resolve(null));
    }
  });
}

async function openConfirmWindow() {
  const url = api.runtime.getURL('confirm.html');

  if (confirmWindowId) {
    const focused = await updateExtensionWindow(confirmWindowId, { focused: true });
    if (focused) return focused;
  }

  const created = await createExtensionWindow({
    url,
    type: 'popup',
    width: 520,
    height: 620,
    focused: true
  });

  confirmWindowId = created?.id || null;
  return created;
}

async function createPendingConfirmation(text, source = {}) {
  const settings = await getSettings();
  const cleanText = String(text || '').replace(/^\uFEFF/, '').trim();
  const signature = textSignature(cleanText);

  if (!looksLikeDanfeText(cleanText)) {
    return {
      status: 'ignorado',
      message: 'Texto sem chave NF-e.'
    };
  }

  if (await shouldSkipDuplicatePrompt(signature)) {
    return {
      status: 'confirmacao_existente',
      message: 'Confirmacao ja aberta no aplicativo DANFE.'
    };
  }

  const result = await sendCaptureToDesktop(cleanText, source, settings);
  await setBadge('?', '#8a5a00');
  return result;
}

async function sendTextToSystem(text, source = {}) {
  const settings = await getSettings();
  const cleanText = String(text || '').replace(/^\uFEFF/, '').trim();
  const signature = textSignature(cleanText);

  if (!looksLikeDanfeText(cleanText)) {
    return {
      status: 'ignorado',
      message: 'Texto sem chave NF-e.'
    };
  }

  if (await shouldSkipDuplicate(signature)) {
    return {
      status: 'duplicado',
      message: 'Texto ja enviado nos ultimos segundos.'
    };
  }

  await setBadge('...', '#8a5a00');

  const parsed = await requestJson(`${settings.apiBase}/api/microservico/parse-texto`, {
    method: 'POST',
    body: JSON.stringify({ texto: cleanText })
  });

  if (!parsed.validas) {
    await setBadge('!', '#b42318');
    return {
      status: 'sem_linhas_validas',
      parsed,
      source
    };
  }

  const result = await requestJson(`${settings.apiBase}/api/microservico/processar-texto`, {
    method: 'POST',
    body: JSON.stringify({
      texto: cleanText,
      somenteSelecionadas: Boolean(settings.onlyMarked),
      intervaloMs: Number(settings.intervalMs || DEFAULT_SETTINGS.intervalMs)
    })
  });

  const compact = {
    status: result.status,
    totalLido: result.totalLido,
    totalProcessado: result.totalProcessado,
    salvos: result.salvos,
    pulados: result.pulados,
    falhas: result.falhas,
    message: result.message,
    source,
    sentAt: new Date().toISOString()
  };

  await storageSet({ lastResult: compact });
  await setBadge(result.falhas ? '!' : 'OK', result.falhas ? '#b42318' : '#116149');

  return compact;
}

async function checkHealth() {
  const settings = await getSettings();

  return requestJson(`${settings.apiBase}/api/health`, {
    method: 'GET',
    headers: {}
  });
}

async function stopAutomation() {
  const settings = await getSettings();

  return requestJson(`${settings.apiBase}/api/microservico/interromper`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

async function getPendingConfirmation() {
  const stored = await storageGet({ pendingCapture: null });
  return stored.pendingCapture;
}

async function clearPendingConfirmation() {
  await storageRemove('pendingCapture');
  await setBadge('');
  return {
    ok: true,
    status: 'cancelado'
  };
}

api.runtime.onInstalled.addListener(async () => {
  const current = await storageGet(DEFAULT_SETTINGS);
  await storageSet({
    ...DEFAULT_SETTINGS,
    ...current,
    apiBase: normalizeApiBase(current.apiBase)
  });
  await setBadge('');
});

api.windows?.onRemoved?.addListener((windowId) => {
  if (windowId === confirmWindowId) confirmWindowId = null;
});

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'danfe-copy-detected') {
      const settings = await getSettings();

      if (!settings.autoSend) {
        return {
          status: 'desativado',
          message: 'Captura automatica desativada.'
        };
      }

      if (settings.confirmBeforeSend) {
        return createPendingConfirmation(message.text, message.source || {
          url: sender?.tab?.url,
          title: sender?.tab?.title
        });
      }

      return sendTextToSystem(message.text, message.source || {
        url: sender?.tab?.url,
        title: sender?.tab?.title
      });
    }

    if (message?.type === 'danfe-send-text') {
      const settings = await getSettings();
      const source = {
        origem: 'popup',
        sentAt: new Date().toISOString()
      };

      return settings.confirmBeforeSend
        ? createPendingConfirmation(message.text, source)
        : sendTextToSystem(message.text, source);
    }

    if (message?.type === 'danfe-get-state') {
      const [settings, state] = await Promise.all([
        getSettings(),
        storageGet({ lastResult: null })
      ]);

      return {
        settings,
        lastResult: state.lastResult
      };
    }

    if (message?.type === 'danfe-save-settings') {
      await storageSet({
        apiBase: normalizeApiBase(message.settings?.apiBase),
        autoSend: Boolean(message.settings?.autoSend),
        confirmBeforeSend: message.settings?.confirmBeforeSend !== false,
        onlyMarked: Boolean(message.settings?.onlyMarked),
        intervalMs: Number(message.settings?.intervalMs || DEFAULT_SETTINGS.intervalMs)
      });

      return {
        ok: true,
        settings: await getSettings()
      };
    }

    if (message?.type === 'danfe-health') return checkHealth();
    if (message?.type === 'danfe-stop') return stopAutomation();
    if (message?.type === 'danfe-get-pending') return getPendingConfirmation();
    if (message?.type === 'danfe-clear-pending') return clearPendingConfirmation();
    if (message?.type === 'danfe-confirm-pending') {
      const pending = await getPendingConfirmation();

      if (!pending?.text) {
        return {
          status: 'sem_pendente',
          message: 'Nao ha texto pendente para enviar.'
        };
      }

      const result = await sendTextToSystem(pending.text, {
        ...pending.source,
        origem: 'confirmacao',
        confirmedAt: new Date().toISOString()
      });
      await storageRemove('pendingCapture');
      return result;
    }

    return {
      status: 'ignorado'
    };
  })()
    .then((result) => sendResponse({ ok: true, result }))
    .catch(async (error) => {
      await setBadge('!', '#b42318');
      sendResponse({
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          status: error.status,
          payload: error.payload
        }
      });
    });

  return true;
});
