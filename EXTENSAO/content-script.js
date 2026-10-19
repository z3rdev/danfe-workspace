const DANFE_MAX_TEXT_SIZE = 1024 * 1024;
const DANFE_EXTENSION_API = globalThis.chrome || globalThis.browser;
let lastCopySignature = '';
let lastCopyAt = 0;

function normalizeClipboardText(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function getSelectedInputText(element) {
  if (!element) return '';

  const tag = element.tagName?.toLowerCase();
  const isTextInput = tag === 'textarea' ||
    (tag === 'input' && !['password', 'hidden', 'file'].includes(String(element.type || '').toLowerCase()));

  if (!isTextInput) return '';

  const start = typeof element.selectionStart === 'number' ? element.selectionStart : 0;
  const end = typeof element.selectionEnd === 'number' ? element.selectionEnd : 0;

  return String(element.value || '').slice(start, end);
}

function getCopiedText() {
  const selectedInputText = getSelectedInputText(document.activeElement);
  const selectedText = selectedInputText || window.getSelection()?.toString() || '';

  return normalizeClipboardText(selectedText);
}

function countAccessKeys(text) {
  return (text.match(/\b[A-Z0-9]{44}\b/gi) || []).length;
}

function looksLikeDanfeText(text) {
  if (!text || text.length < 44 || text.length > DANFE_MAX_TEXT_SIZE) return false;

  const keys = countAccessKeys(text);
  if (!keys) return false;

  return keys > 1 ||
    /\b(?:true|false|sim|nao|não|s|n|1|0|x)\s+\d{1,12}\s+[A-Z0-9]{44}\b/i.test(text) ||
    /\b[A-Z0-9]{44}\b/i.test(text);
}

function textSignature(text) {
  const keys = text.match(/\b[A-Z0-9]{44}\b/gi) || [];
  return `${keys.length}:${keys.slice(0, 5).join('|')}:${text.length}`;
}

function notifyBackground(text) {
  DANFE_EXTENSION_API.runtime.sendMessage({
    type: 'danfe-copy-detected',
    text,
    source: {
      url: location.href,
      title: document.title,
      copiedAt: new Date().toISOString()
    }
  });
}

document.addEventListener('copy', () => {
  const text = getCopiedText();

  if (!looksLikeDanfeText(text)) return;

  const signature = textSignature(text);
  const now = Date.now();

  if (signature === lastCopySignature && now - lastCopyAt < 8000) return;

  lastCopySignature = signature;
  lastCopyAt = now;
  notifyBackground(text);
}, true);
