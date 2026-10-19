const extensionApi = globalThis.chrome || globalThis.browser;
const keyCount = document.querySelector('#keyCount');
const lineCount = document.querySelector('#lineCount');
const previewText = document.querySelector('#previewText');
const confirmSend = document.querySelector('#confirmSend');
const cancelSend = document.querySelector('#cancelSend');

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

function closeSoon() {
  window.setTimeout(() => window.close(), 900);
}

async function loadPending() {
  const response = await sendMessage({ type: 'danfe-get-pending' });

  if (!response?.ok || !response.result) {
    keyCount.textContent = '0';
    lineCount.textContent = '0';
    previewText.value = 'Nenhum texto pendente.';
    confirmSend.disabled = true;
    confirmSend.textContent = 'Sem texto';
    return;
  }

  const pending = response.result;
  keyCount.textContent = String(pending.keys || 0);
  lineCount.textContent = String(pending.lines || 0);
  previewText.value = pending.text || '';
}

async function confirmPending() {
  const defaultText = confirmSend.textContent;
  confirmSend.disabled = true;
  cancelSend.disabled = true;
  confirmSend.textContent = 'Enviando...';

  const response = await sendMessage({ type: 'danfe-confirm-pending' });

  if (response?.ok) {
    confirmSend.textContent = 'Enviado';
    closeSoon();
    return;
  }

  confirmSend.disabled = false;
  cancelSend.disabled = false;
  confirmSend.textContent = defaultText;
  window.alert(response?.error?.message || 'Falha ao enviar o texto para o microservico.');
}

async function cancelPending() {
  confirmSend.disabled = true;
  cancelSend.disabled = true;
  cancelSend.textContent = 'Cancelando...';
  await sendMessage({ type: 'danfe-clear-pending' });
  closeSoon();
}

confirmSend.addEventListener('click', confirmPending);
cancelSend.addEventListener('click', cancelPending);

loadPending();
