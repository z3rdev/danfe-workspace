const accessKey = document.querySelector('#accessKey');
const keyHint = document.querySelector('#keyHint');
const numeroNf = document.querySelector('#numeroNf');
const nomeArquivo = document.querySelector('#nomeArquivo');
const saveButton = document.querySelector('#saveButton');
const refreshButton = document.querySelector('#refreshButton');
const resultOutput = document.querySelector('#resultOutput');
const healthStatus = document.querySelector('#healthStatus');
const outputDir = document.querySelector('#outputDir');
const outputDirInput = document.querySelector('#outputDirInput');
const savedTotal = document.querySelector('#savedTotal');
const processedTotal = document.querySelector('#processedTotal');
const lastStatus = document.querySelector('#lastStatus');
const liveStatus = document.querySelector('#liveStatus');
const filesTable = document.querySelector('#filesTable');
const notasFile = document.querySelector('#notasFile');
const notasText = document.querySelector('#notasText');
const onlyMarked = document.querySelector('#onlyMarked');
const parseButton = document.querySelector('#parseButton');
const batchButton = document.querySelector('#batchButton');
const stopBatchButton = document.querySelector('#stopBatchButton');
const parsedTotal = document.querySelector('#parsedTotal');
const parsedValid = document.querySelector('#parsedValid');
const parsedSelected = document.querySelector('#parsedSelected');
const parsedTable = document.querySelector('#parsedTable');
const commandInput = document.querySelector('#commandInput');
const consultaPanel = document.querySelector('#consultaPanel');
const logPanel = document.querySelector('#logPanel');
const closeConsultaButton = document.querySelector('#closeConsultaButton');
const closeLogButton = document.querySelector('#closeLogButton');
const uploadZone = document.querySelector('#uploadZone');
const selectedFileName = document.querySelector('#selectedFileName');
const saveOutputDirButton = document.querySelector('#saveOutputDirButton');
const clearProcessedButton = document.querySelector('#clearProcessedButton');
let filesRefreshTimer = null;

function normalizeKey(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function getNotasPayload() {
  return notasText.value.replace(/^\uFEFF/, '').trimEnd();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function setResult(data) {
  resultOutput.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

function setUtilityPanel(panelName) {
  const panels = [
    { name: 'consulta', element: consultaPanel, focus: accessKey },
    { name: 'log', element: logPanel, focus: resultOutput }
  ];

  for (const panel of panels) {
    const show = panel.name === panelName;

    if (!panel.element) continue;

    panel.element.hidden = !show;
    panel.element.setAttribute('aria-hidden', String(!show));
    panel.element.classList.toggle('is-visible', show);

    if (show) {
      window.requestAnimationFrame(() => {
        panel.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        panel.focus?.focus?.({ preventScroll: true });
      });
    }
  }
}

function runCommand(command) {
  const normalized = String(command || '').trim().toLowerCase();

  if (!normalized) return;

  if (normalized === '/log') {
    setUtilityPanel('log');
  } else if (normalized === '/consulta') {
    setUtilityPanel('consulta');
  } else if (['/inicio', '/home', '/fechar', '/clear'].includes(normalized)) {
    setUtilityPanel(null);
  } else {
    lastStatus.textContent = 'Comando nao reconhecido';
  }

  commandInput.value = '';
}

function setLoading(isLoading) {
  saveButton.disabled = isLoading;
  refreshButton.disabled = isLoading;
  parseButton.disabled = isLoading;
  batchButton.disabled = isLoading;
  if (stopBatchButton) stopBatchButton.disabled = !isLoading;
  if (saveOutputDirButton) saveOutputDirButton.disabled = isLoading;
  if (clearProcessedButton) clearProcessedButton.disabled = isLoading;
  saveButton.textContent = isLoading ? 'Processando...' : 'Consultar e salvar PDF';
  batchButton.textContent = isLoading ? 'Processando...' : 'Processar lote';
}

function setAutomationRunning(isRunning) {
  if (stopBatchButton) stopBatchButton.disabled = !isRunning;
  batchButton.disabled = isRunning;
  parseButton.disabled = isRunning;
}

function setLiveStatus(text, state = 'ok') {
  if (!liveStatus) return;

  liveStatus.textContent = text;
  liveStatus.className = state;
}

function parseServerEvent(event) {
  try {
    return JSON.parse(event.data);
  } catch {
    return {};
  }
}

function queueFilesRefresh(delay = 250) {
  window.clearTimeout(filesRefreshTimer);
  filesRefreshTimer = window.setTimeout(() => {
    refreshFiles({ silent: true });
  }, delay);
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function renderFileLink(url, label) {
  return url
    ? `<a class="file-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
    : `<span class="file-link muted-link">${label}</span>`;
}

function renderDataBadge(enabled, label) {
  return enabled
    ? `<span class="data-badge">${label}</span>`
    : `<span class="data-badge muted-badge">${label}</span>`;
}

function updateKeyHint() {
  const chave = normalizeKey(accessKey.value);
  accessKey.value = chave;
  keyHint.textContent = `${chave.length}/44 caracteres`;
  keyHint.classList.toggle('invalid', chave.length > 0 && chave.length !== 44);
}

function renderFiles(files) {
  savedTotal.textContent = String(files.length);

  if (!files.length) {
    filesTable.innerHTML = '<tr><td colspan="5">Nenhum PDF salvo ainda.</td></tr>';
    return;
  }

  filesTable.innerHTML = files.map((file) => `
    <tr>
      <td class="file-name">${escapeHtml(file.arquivo)}</td>
      <td class="data-links">
        ${renderDataBadge(file.temXml || file.xmlArquivo, 'XML')}
        ${renderDataBadge(file.temJson || file.jsonArquivo, 'JSON')}
      </td>
      <td>${formatBytes(file.bytes)}</td>
      <td>${formatDate(file.atualizadoEm)}</td>
      <td>${renderFileLink(file.url, 'PDF')}</td>
    </tr>
  `).join('');
}

function renderParsedRows(rows) {
  const visibleRows = rows.slice(0, 80);

  if (!visibleRows.length) {
    parsedTable.innerHTML = '<tr><td colspan="5">Nenhum texto lido ainda.</td></tr>';
    return;
  }

  parsedTable.innerHTML = visibleRows.map((row) => {
    const status = row.valida
      ? row.selecionado === true
        ? 'True'
        : 'Valida'
      : row.erros.join(' ');

    return `
      <tr>
        <td>${escapeHtml(row.linha)}</td>
        <td>${escapeHtml(row.numero || '-')}</td>
        <td class="file-name">${escapeHtml(row.nome || '-')}</td>
        <td class="mono small">${escapeHtml(row.chave || '-')}</td>
        <td>${escapeHtml(status)}</td>
      </tr>
    `;
  }).join('');
}

function decodeBytes(bytes, encoding) {
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return null;
  }
}

async function readTextFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return decodeBytes(bytes, 'utf-16le') || '';
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeBytes(bytes, 'utf-16be') || decodeBytes(bytes, 'utf-16le') || '';
  }

  const sample = bytes.slice(0, 400);
  let evenNulls = 0;
  let oddNulls = 0;

  sample.forEach((byte, index) => {
    if (byte !== 0) return;
    if (index % 2 === 0) evenNulls += 1;
    else oddNulls += 1;
  });

  if (oddNulls > 10) return decodeBytes(bytes, 'utf-16le') || '';
  if (evenNulls > 10) return decodeBytes(bytes, 'utf-16be') || decodeBytes(bytes, 'utf-16le') || '';

  const utf8Text = decodeBytes(bytes, 'utf-8') || '';
  const replacementCount = (utf8Text.match(/\uFFFD/g) || []).length;

  if (replacementCount > 2) {
    return decodeBytes(bytes, 'windows-1252') || utf8Text;
  }

  return utf8Text;
}

function setSelectedFile(file) {
  if (!selectedFileName) return;

  selectedFileName.textContent = file
    ? `${file.name} - ${formatBytes(file.size)}`
    : 'Nenhum arquivo selecionado';
}

async function loadNotasFile(file) {
  if (!file) return;

  try {
    setSelectedFile(file);
    notasText.value = await readTextFile(file);
    await parseNotasText();
  } catch (error) {
    setResult({
      error: 'falha_arquivo',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

function renderParsedSummary(data) {
  parsedTotal.textContent = String(data.total || 0);
  parsedValid.textContent = String(data.validas || 0);
  parsedSelected.textContent = String(data.selecionadas || 0);
  renderParsedRows(data.linhas || []);
}

async function checkHealth() {
  try {
    const resp = await fetch('/api/health');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    healthStatus.textContent = 'API online';
    healthStatus.className = 'status ok';
    outputDir.textContent = data.outputDir || 'Nao informado';
    if (outputDirInput && !outputDirInput.value) {
      outputDirInput.value = data.outputDir || '';
    }
  } catch {
    healthStatus.textContent = 'API offline';
    healthStatus.className = 'status fail';
    outputDir.textContent = 'API offline';
  }
}

async function refreshProcessedLog(options = {}) {
  const { silent = false } = options;

  try {
    const resp = await fetch('/api/microservico/processados');
    const data = await resp.json();

    if (!resp.ok) throw new Error(data.message || `HTTP ${resp.status}`);

    if (processedTotal) processedTotal.textContent = String(data.total || 0);
    return data;
  } catch (error) {
    if (!silent) {
      setResult({
        error: 'falha_log_processados',
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return null;
  }
}

async function refreshAutomationStatus(options = {}) {
  const { silent = false } = options;

  try {
    const resp = await fetch('/api/microservico/automacao');
    const data = await resp.json();

    if (!resp.ok) throw new Error(data.message || `HTTP ${resp.status}`);

    setAutomationRunning(Boolean(data.automacao?.running));
    if (data.automacao?.running) {
      lastStatus.textContent = `Processando ${data.automacao.current || 0}/${data.automacao.total || 0}`;
    }
    return data;
  } catch (error) {
    if (!silent) {
      setResult({
        error: 'falha_status_automacao',
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return null;
  }
}

async function saveOutputDir() {
  const pasta = outputDirInput?.value.trim();

  if (!pasta) {
    lastStatus.textContent = 'Pasta obrigatoria';
    setResult({
      error: 'pasta_obrigatoria',
      message: 'Informe a pasta padrao de saida.'
    });
    return;
  }

  setLoading(true);

  try {
    const resp = await fetch('/api/microservico/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outputDir: pasta })
    });
    const data = await resp.json();

    if (!resp.ok) throw new Error(data.message || `HTTP ${resp.status}`);

    outputDir.textContent = data.outputDir;
    outputDirInput.value = data.outputDir;
    lastStatus.textContent = 'Pasta atualizada';
    setResult(data);
    await refreshFiles({ silent: true });
  } catch (error) {
    lastStatus.textContent = 'Falha na pasta';
    setResult({
      error: 'falha_config',
      message: error instanceof Error ? error.message : String(error)
    });
  } finally {
    setLoading(false);
  }
}

async function clearProcessedLog() {
  const confirmed = window.confirm('Limpar o log de processados? Os PDFs, XMLs e JSONs salvos nao serao apagados.');

  if (!confirmed) return;

  setLoading(true);

  try {
    const resp = await fetch('/api/microservico/processados', {
      method: 'DELETE'
    });
    const data = await resp.json();

    if (!resp.ok) throw new Error(data.message || `HTTP ${resp.status}`);

    if (processedTotal) processedTotal.textContent = '0';
    lastStatus.textContent = 'Log limpo';
    setResult(data);
  } catch (error) {
    lastStatus.textContent = 'Falha ao limpar';
    setResult({
      error: 'falha_limpar_log',
      message: error instanceof Error ? error.message : String(error)
    });
  } finally {
    setLoading(false);
  }
}

async function stopAutomation() {
  if (stopBatchButton) stopBatchButton.disabled = true;
  lastStatus.textContent = 'Interrompendo';

  try {
    const resp = await fetch('/api/microservico/interromper', {
      method: 'POST'
    });
    const data = await resp.json();

    if (!resp.ok) throw new Error(data.message || `HTTP ${resp.status}`);

    lastStatus.textContent = data.interrompido ? 'Interrupcao solicitada' : 'Nada em andamento';
    setResult(data);
  } catch (error) {
    lastStatus.textContent = 'Falha ao interromper';
    setResult({
      error: 'falha_interromper',
      message: error instanceof Error ? error.message : String(error)
    });
    await refreshAutomationStatus({ silent: true });
  }
}

async function refreshFiles(options = {}) {
  const { silent = false } = options;

  try {
    const resp = await fetch('/api/microservico/arquivos');
    const data = await resp.json();

    if (!resp.ok) throw new Error(data.message || `HTTP ${resp.status}`);

    outputDir.textContent = data.pasta;
    if (outputDirInput && !outputDirInput.matches(':focus')) {
      outputDirInput.value = data.pasta || '';
    }
    if (processedTotal) processedTotal.textContent = String(data.processados || 0);
    renderFiles(data.arquivos || []);
    return data;
  } catch (error) {
    if (!silent) {
      setResult({
        error: 'falha_listagem',
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return null;
  }
}

function connectLiveUpdates() {
  if (!('EventSource' in window)) {
    setLiveStatus('Polling', 'warn');
    window.setInterval(() => refreshFiles({ silent: true }), 5000);
    return;
  }

  const events = new EventSource('/api/microservico/eventos');

  events.addEventListener('conectado', () => {
    setLiveStatus('Online', 'ok');
    queueFilesRefresh(100);
  });

  events.addEventListener('ping', () => {
    setLiveStatus('Online', 'ok');
  });

  events.addEventListener('arquivo_salvo', (event) => {
    const data = parseServerEvent(event);
    lastStatus.textContent = data.numero ? `${data.numero} salvo` : 'Arquivo salvo';
    setResult({
      status: 'arquivo_salvo',
      arquivo: data.arquivo,
      xmlArquivo: data.xmlArquivo,
      jsonArquivo: data.jsonArquivo,
      numero: data.numero,
      nome: data.nome,
      bytes: data.bytes,
      jsonBytes: data.jsonBytes,
      salvoEm: data.salvoEm
    });
    queueFilesRefresh(100);
  });

  events.addEventListener('arquivo_pulado', (event) => {
    const data = parseServerEvent(event);
    lastStatus.textContent = data.numero ? `${data.numero} ja processado` : 'Ja processado';
    setResult({
      status: 'ja_processado',
      arquivo: data.arquivo,
      jsonArquivo: data.jsonArquivo,
      chave: data.chave
    });
    queueFilesRefresh(100);
  });

  events.addEventListener('config_atualizada', (event) => {
    const data = parseServerEvent(event);
    outputDir.textContent = data.outputDir || outputDir.textContent;
    if (outputDirInput && data.outputDir) outputDirInput.value = data.outputDir;
    queueFilesRefresh(100);
  });

  events.addEventListener('arquivos_organizados', (event) => {
    const data = parseServerEvent(event);
    lastStatus.textContent = `${data.movidos || 0} arquivo(s) organizado(s)`;
    queueFilesRefresh(100);
  });

  events.addEventListener('log_processados_limpo', () => {
    if (processedTotal) processedTotal.textContent = '0';
    lastStatus.textContent = 'Log limpo';
  });

  events.addEventListener('lote_inicio', (event) => {
    const data = parseServerEvent(event);
    lastStatus.textContent = data.message || `Lote iniciado: ${data.totalProcessar || 0}`;
    setAutomationRunning(true);
  });

  events.addEventListener('lote_interromper_solicitado', () => {
    lastStatus.textContent = 'Interrupcao solicitada';
    setAutomationRunning(true);
  });

  events.addEventListener('lote_pausa', (event) => {
    const data = parseServerEvent(event);
    const segundos = Math.ceil(Number(data.aguardarMs || 0) / 1000);
    lastStatus.textContent = segundos > 0
      ? `Pausa de seguranca: bloco ${data.blocoConcluido || 0}/${data.totalBlocos || 0} (${segundos}s)`
      : 'Preparando proximo bloco';
    setAutomationRunning(true);
  });

  events.addEventListener('consulta_retentativa', (event) => {
    const data = parseServerEvent(event);
    const segundos = Math.ceil(Number(data.aguardarMs || 0) / 1000);
    lastStatus.textContent = segundos > 0
      ? `Aguardando API: nova tentativa em ${segundos}s`
      : 'Tentando consulta novamente';
  });

  events.addEventListener('lote_item', (event) => {
    const data = parseServerEvent(event);
    lastStatus.textContent = data.status === 'salvo'
      ? `Baixado ${data.atual}/${data.total}`
      : data.status === 'pulado'
        ? `Pulou ${data.atual}/${data.total}`
        : data.status === 'interrompido'
          ? `Interrompido ${data.atual}/${data.total}`
          : `Falha ${data.atual}/${data.total}`;

    if (data.status === 'salvo' || data.status === 'pulado') queueFilesRefresh(100);
  });

  events.addEventListener('lote_fim', (event) => {
    const data = parseServerEvent(event);
    lastStatus.textContent = data.message || `${data.salvos || 0} salvo(s), ${data.pulados || 0} ja processado(s)`;
    setAutomationRunning(false);
    queueFilesRefresh(100);
  });

  events.onerror = () => {
    setLiveStatus('Reconectando', 'warn');
    queueFilesRefresh(1500);
  };

  window.setInterval(() => refreshFiles({ silent: true }), 15000);
}

async function parseNotasText() {
  const texto = getNotasPayload();

  if (!texto.trim()) {
    setResult({ error: 'texto_vazio', message: 'Cole o texto ou selecione um arquivo TXT.' });
    renderParsedSummary({ total: 0, validas: 0, selecionadas: 0, linhas: [] });
    return null;
  }

  try {
    const resp = await fetch('/api/microservico/parse-texto', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texto })
    });
    const data = await resp.json();

    if (!resp.ok) throw new Error(data.message || `HTTP ${resp.status}`);

    renderParsedSummary(data);
    setResult({
      status: 'texto_lido',
      total: data.total,
      validas: data.validas,
      selecionadas: data.selecionadas
    });
    return data;
  } catch (error) {
    setResult({
      error: 'falha_leitura_texto',
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function processarLote() {
  const texto = getNotasPayload();

  if (!texto.trim()) {
    setResult({ error: 'texto_vazio', message: 'Cole o texto ou selecione um arquivo TXT.' });
    return;
  }

  setLoading(true);
  lastStatus.textContent = 'Lote em andamento';

  try {
    const resp = await fetch('/api/microservico/processar-texto', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        texto,
        somenteSelecionadas: onlyMarked.checked
      })
    });
    const data = await resp.json();

    if (!resp.ok) {
      lastStatus.textContent = 'Falha no lote';
      setResult(data);
      return;
    }

    lastStatus.textContent = data.message || `${data.salvos} salvo(s)`;
    setResult(data);
    await refreshFiles();
  } catch (error) {
    lastStatus.textContent = 'Falha no lote';
    setResult({
      error: 'frontend_error',
      message: error instanceof Error ? error.message : String(error)
    });
  } finally {
    setLoading(false);
  }
}

async function consultarESalvar() {
  const chave = normalizeKey(accessKey.value);
  updateKeyHint();

  if (chave.length !== 44) {
    lastStatus.textContent = 'Chave invalida';
    setResult({ error: 'chave_invalida', message: 'A chave precisa ter 44 caracteres.' });
    return;
  }

  setLoading(true);
  lastStatus.textContent = 'Processando';

  try {
    const resp = await fetch('/api/microservico/consulta-salvar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chave,
        numero: numeroNf.value,
        nome: nomeArquivo.value
      })
    });
    const data = await resp.json();

    if (!resp.ok) {
      lastStatus.textContent = 'Falha';
      setResult(data);
      return;
    }

    lastStatus.textContent = data.status === 'ja_processado' ? 'Ja processado' : 'Salvo';
    setResult(data);
    await refreshFiles();
  } catch (error) {
    lastStatus.textContent = 'Falha';
    setResult({
      error: 'frontend_error',
      message: error instanceof Error ? error.message : String(error)
    });
  } finally {
    setLoading(false);
  }
}

accessKey.addEventListener('input', updateKeyHint);
saveButton.addEventListener('click', consultarESalvar);
refreshButton.addEventListener('click', refreshFiles);
parseButton.addEventListener('click', parseNotasText);
batchButton.addEventListener('click', processarLote);
stopBatchButton.addEventListener('click', stopAutomation);
commandInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;

  event.preventDefault();
  runCommand(commandInput.value);
});
closeConsultaButton.addEventListener('click', () => setUtilityPanel(null));
closeLogButton.addEventListener('click', () => setUtilityPanel(null));
saveOutputDirButton.addEventListener('click', saveOutputDir);
clearProcessedButton.addEventListener('click', clearProcessedLog);

let parseTimer = null;
notasText.addEventListener('input', () => {
  window.clearTimeout(parseTimer);

  if (!/[A-Z0-9]{44}/i.test(notasText.value)) return;

  parseTimer = window.setTimeout(() => {
    parseNotasText();
  }, 650);
});

notasFile.addEventListener('change', async () => {
  const file = notasFile.files?.[0];
  await loadNotasFile(file);
});

uploadZone.addEventListener('dragenter', (event) => {
  event.preventDefault();
  uploadZone.classList.add('is-dragging');
});

uploadZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  uploadZone.classList.add('is-dragging');
});

uploadZone.addEventListener('dragleave', () => {
  uploadZone.classList.remove('is-dragging');
});

uploadZone.addEventListener('drop', async (event) => {
  event.preventDefault();
  uploadZone.classList.remove('is-dragging');

  const file = event.dataTransfer?.files?.[0];
  await loadNotasFile(file);
});

updateKeyHint();
checkHealth();
refreshFiles();
refreshProcessedLog({ silent: true });
refreshAutomationStatus({ silent: true });
connectLiveUpdates();
