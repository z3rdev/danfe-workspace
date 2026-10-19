const apiBase = document.querySelector('#apiBase');
const autoSend = document.querySelector('#autoSend');
const confirmBeforeSend = document.querySelector('#confirmBeforeSend');
const onlyMarked = document.querySelector('#onlyMarked');
const intervalMs = document.querySelector('#intervalMs');
const apiStatus = document.querySelector('#apiStatus');
const lastSummary = document.querySelector('#lastSummary');
const saveSettings = document.querySelector('#saveSettings');
const sendClipboard = document.querySelector('#sendClipboard');
const sendManual = document.querySelector('#sendManual');
const stopAutomation = document.querySelector('#stopAutomation');
const openPanel = document.querySelector('#openPanel');
const toggleSettings = document.querySelector('#toggleSettings');
const settingsPanel = document.querySelector('#settingsPanel');
const manualText = document.querySelector('#manualText');
const resultOutput = document.querySelector('#resultOutput');
const extensionApi = globalThis.chrome || globalThis.browser;

function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      const result = extensionApi.runtime.sendMessage(message, resolve);
      if (result?.then) result.then(resolve);
    } catch {
      extensionApi.runtime.sendMessage(message).then(resolve);
    }
  });
}

function setResult(data) {
  if (resultOutput) resultOutput.textContent = JSON.stringify(data, null, 2);
  updateSummary(data?.result || data);
}

function setStatus(text, className = '') {
  apiStatus.textContent = text;
  apiStatus.className = className;
}

function updateSummary(data) {
  if (!lastSummary || !data) return;

  const result = data.result || data;

  if (result.status === 'enviando') {
    lastSummary.textContent = 'Enviando...';
    return;
  }

  if (result.totalProcessado !== undefined) {
    lastSummary.textContent = `${result.totalProcessado || 0} proc. | ${result.salvos || 0} novos | ${result.pulados || 0} repetidos`;
    return;
  }

  if (result.message) {
    lastSummary.textContent = result.message;
  }
}

async function loadState() {
  const response = await sendMessage({ type: 'danfe-get-state' });

  if (!response?.ok) {
    setResult(response);
    return;
  }

  const settings = response.result.settings;
  apiBase.value = settings.apiBase;
  autoSend.checked = Boolean(settings.autoSend);
  confirmBeforeSend.checked = settings.confirmBeforeSend !== false;
  onlyMarked.checked = Boolean(settings.onlyMarked);
  intervalMs.value = settings.intervalMs;

  if (response.result.lastResult) updateSummary(response.result.lastResult);
}

async function checkHealth() {
  setStatus('Verificando...');
  const response = await sendMessage({ type: 'danfe-health' });

  if (response?.ok) {
    setStatus('API online', 'ok');
    return;
  }

  setStatus('API offline', 'fail');
  setResult(response);
}

async function persistSettings() {
  const response = await sendMessage({
    type: 'danfe-save-settings',
    settings: {
      apiBase: apiBase.value,
      autoSend: autoSend.checked,
      confirmBeforeSend: confirmBeforeSend.checked,
      onlyMarked: onlyMarked.checked,
      intervalMs: Number(intervalMs.value || 1100)
    }
  });

  setResult(response);
  await checkHealth();
}

async function sendText(text) {
  if (!String(text || '').trim()) {
    setResult({
      ok: false,
      error: {
        message: 'Nenhum texto para enviar.'
      }
    });
    return;
  }

  setResult({ status: 'enviando' });
  setSettingsVisible(false);
  const response = await sendMessage({
    type: 'danfe-send-text',
    text
  });
  setResult(response);
}

async function sendClipboardText() {
  try {
    const text = await navigator.clipboard.readText();
    await sendText(text);
  } catch (error) {
    setResult({
      ok: false,
      error: {
        message: 'O navegador bloqueou a leitura do clipboard. Cole no campo manual.',
        detail: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

async function requestStop() {
  const response = await sendMessage({ type: 'danfe-stop' });
  setResult(response);
}

function setSettingsVisible(show) {
  settingsPanel.hidden = !show;
  toggleSettings.textContent = show ? 'Ocultar' : 'Config';
}

function toggleSettingsPanel() {
  setSettingsVisible(settingsPanel.hidden);
}

async function openLocalPanel() {
  const base = apiBase.value.trim().replace(/\/+$/, '') || 'http://localhost:3000';
  try {
    const result = extensionApi.tabs.create({ url: base });
    if (result?.then) await result;
  } catch {
    await extensionApi.tabs.create({ url: base });
  }
}

saveSettings.addEventListener('click', persistSettings);
sendClipboard.addEventListener('click', sendClipboardText);
sendManual.addEventListener('click', () => sendText(manualText.value));
stopAutomation.addEventListener('click', requestStop);
openPanel.addEventListener('click', openLocalPanel);
toggleSettings.addEventListener('click', toggleSettingsPanel);

loadState().then(checkHealth);
