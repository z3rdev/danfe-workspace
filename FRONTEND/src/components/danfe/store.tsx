import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { downloadOutputFile } from '@/lib/output-download';
import { parseInvoices, type Invoice, type Output, type OutputLayout, type LogEntry } from '@/lib/danfe';

type ApiRow = {
  linha: number;
  selecionado: boolean | null;
  numero: string;
  chave: string;
  nome: string;
  valida: boolean;
};

type ApiFile = {
  arquivo: string;
  caminho?: string | null;
  chave?: string | null;
  numero?: string | null;
  nome?: string | null;
  tipo?: string | null;
  layout?: OutputLayout | null;
  layoutLabel?: string | null;
  bytes: number;
  atualizadoEm: string;
  url: string | null;
  xmlArquivo?: string | null;
  xmlCaminho?: string | null;
  xmlUrl?: string | null;
  temXml?: boolean;
  jsonArquivo?: string | null;
  jsonCaminho?: string | null;
  jsonUrl?: string | null;
  temJson?: boolean;
};

type ApiError = { message?: string; error?: string };

export type ExternalCapture = {
  id: string;
  texto: string;
  origem: string;
  source?: { url?: string; title?: string; copiedAt?: string };
  chaves: number;
  linhas: number;
  chars: number;
  somenteSelecionadas: boolean;
  intervaloMs: number;
  criadoEm: string;
};

export type NetworkStatus = {
  host: string;
  wifiName: string | null;
  state: 'checking' | 'online' | 'offline';
  online: boolean;
  latencyMs: number | null;
  lastCheckedAt: string | null;
  error: string | null;
  consecutiveFailures: number;
};

export type DatabaseStatus = {
  host: string | null;
  port: number | null;
  database: string;
  state: 'checking' | 'online' | 'offline' | 'not_configured';
  online: boolean;
  lastCheckedAt: string | null;
  error: string | null;
  rows: number | null;
};

export type DatabaseAutomationResult = {
  ok?: boolean;
  period?: 'month_to_today' | 'previous_day' | string;
  autoDownload?: boolean;
  total?: number;
  validas?: number;
  downloaded?: number;
  skipped?: number;
  failed?: number;
  interrupted?: boolean;
  message?: string;
  error?: string;
  executedAt?: string;
};

export type DatabaseAutomationState = {
  running: boolean;
  stopRequested: boolean;
  runId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  phase: 'idle' | 'consultando' | 'baixando' | 'finalizando' | 'concluida' | 'interrompida' | 'erro';
  total: number;
  current: number;
  result: DatabaseAutomationResult | null;
};

const desktopApiOrigin =
  window.location.protocol === 'tauri:' || window.location.hostname.endsWith('.localhost')
    ? 'http://127.0.0.1:3000'
    : '';

export function apiUrl(path: string): string;
export function apiUrl(path: string | null | undefined): string | undefined;
export function apiUrl(path: string | null | undefined) {
  if (!path) return path;
  return `${desktopApiOrigin}${path}`;
}

export async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(url), options);
  const payload = await response.json().catch(() => ({} as ApiError));

  if (!response.ok) {
    const error = payload as ApiError;
    throw new Error(error.message || error.error || `HTTP ${response.status}`);
  }

  return payload as T;
}

async function revealDesktopWindow() {
  if (!desktopApiOrigin) return;

  const window = getCurrentWindow();
  await window.unminimize();
  await window.show();
  await window.setFocus();
}

function rowToInvoice(row: ApiRow, index: number): Invoice {
  return {
    id: `${row.linha}-${row.chave || index}`,
    number: row.numero || '—',
    company: row.nome || 'Empresa não informada',
    key: row.chave || '',
    status: row.valida ? 'pending' : 'invalid',
    selected: row.selecionado !== false,
  };
}

function filesToOutputs(files: ApiFile[]): Output[] {
  return files.flatMap((file) => {
    const number = file.numero || file.arquivo.split(' - ')[0] || '—';
    const company = file.nome || file.arquivo.replace(/^.*? - /, '').replace(/\.pdf$/i, '');
    const key = file.chave || '';
    const outputs: Output[] = [{
      id: `${file.arquivo}-PDF`,
      number,
      company,
      key,
      format: 'PDF',
      layout: file.layout || 'danfe',
      layoutLabel: file.layoutLabel || 'DANFE',
      time: new Date(file.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      size: formatBytes(file.bytes),
      url: apiUrl(file.url) || undefined,
      path: file.caminho || undefined,
    }];

    if ((file.layout || 'danfe') === 'danfe' && file.temXml && file.xmlArquivo) {
      outputs.push({
        id: `${file.xmlArquivo}-XML`,
        number,
        company,
        key,
        format: 'XML',
        time: new Date(file.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        size: '—',
        url: apiUrl(file.xmlUrl) || undefined,
        path: file.xmlCaminho || undefined,
      });
    }

    if ((file.layout || 'danfe') === 'danfe' && file.temJson && file.jsonArquivo) {
      outputs.push({
        id: `${file.jsonArquivo}-JSON`,
        number,
        company,
        key,
        format: 'JSON',
        time: new Date(file.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        size: '—',
        url: apiUrl(file.jsonUrl) || undefined,
        path: file.jsonCaminho || undefined,
      });
    }

    return outputs;
  });
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function nowTime() {
  return new Date().toLocaleTimeString('pt-BR');
}

function useDanfeState() {
  const [dark, setDark] = useState(false);
  const [items, setItems] = useState<Invoice[]>([]);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [running, setRunning] = useState(false);
  const [fileName, setFileName] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [outputFolder, setOutputFolder] = useState('Carregando...');
  const [serviceOnline, setServiceOnline] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    host: '127.0.0.1',
    wifiName: null,
    state: 'checking',
    online: false,
    latencyMs: null,
    lastCheckedAt: null,
    error: null,
    consecutiveFailures: 0
  });
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus>({
    host: null,
    port: null,
    database: 'padrao do login',
    state: 'checking',
    online: false,
    lastCheckedAt: null,
    error: null,
    rows: null
  });
  const [databaseAutomation, setDatabaseAutomation] = useState<DatabaseAutomationState>({
    running: false,
    stopRequested: false,
    runId: null,
    startedAt: null,
    finishedAt: null,
    phase: 'idle',
    total: 0,
    current: 0,
    result: null
  });
  const [developmentMode, setDevelopmentMode] = useState(false);
  const [externalCapture, setExternalCapture] = useState<ExternalCapture | null>(null);
  const [externalCaptureBusy, setExternalCaptureBusy] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const addLog = useCallback((message: string, level: LogEntry['level'] = 'INFO') => {
    setLogs((previous) => [
      ...previous.slice(-499),
      { id: crypto.randomUUID(), time: nowTime(), level, message },
    ]);
  }, []);
  const refreshOutputs = useCallback(async () => {
    try {
      const data = await requestJson<{ arquivos: ApiFile[]; pasta: string }>('/api/microservico/arquivos');
      setOutputs(filesToOutputs(data.arquivos || []));
      setOutputFolder(data.pasta || '');
      setServiceOnline(true);
      return true;
    } catch {
      setServiceOnline(false);
      return false;
    }
  }, []);

  const stopDatabaseAutomation = useCallback(async () => {
    return requestJson<{ ok: boolean; automacao?: DatabaseAutomationState }>('/api/microservico/banco/interromper', { method: 'POST' });
  }, []);

  const openOutputFolder = useCallback(async () => {
    if (!isTauri()) {
      throw new Error('Abra esta ação pelo aplicativo nativo.');
    }
    await invoke('open_output_folder', { path: outputFolder });
  }, [outputFolder]);

  const openOutputFile = useCallback(async (path: string) => {
    if (!isTauri()) {
      throw new Error('Abra esta ação pelo aplicativo nativo.');
    }
    await invoke('reveal_output_file', { path });
  }, []);

  const generateOutputLayout = useCallback(async (chave: string, layout: Exclude<OutputLayout, 'danfe'>) => {
    return requestJson<{
      ok: boolean;
      chave: string;
      layout: Exclude<OutputLayout, 'danfe'>;
      layoutLabel: string;
      arquivo: string;
      caminho: string;
      url: string | null;
    }>('/api/microservico/arquivos/layout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chave, layout }),
    });
  }, []);

  const importText = useCallback(async (text: string, name: string) => {
    const normalized = text.replace(/^\uFEFF/, '').trimEnd();
    if (!normalized.trim()) {
      toast.error('Nenhum texto de nota foi encontrado.');
      return false;
    }

    setSourceText(normalized);
    setFileName(name);

    try {
      const data = await requestJson<{ linhas: ApiRow[]; total: number; validas: number }>('/api/microservico/parse-texto', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texto: normalized }),
      });
      setItems((data.linhas || []).map(rowToInvoice));
      addLog(`${name} carregado. ${data.total} linhas lidas, ${data.validas} válidas.`);
      toast.success(`${data.validas} notas válidas identificadas`);
      return true;
    } catch (error) {
      const fallback = parseInvoices(normalized);
      setItems(fallback);
      addLog(`Backend indisponível durante a leitura de ${name}.`, 'WARN');
      toast.error(error instanceof Error ? error.message : 'Não foi possível ler o texto.');
      return fallback.length > 0;
    }
  }, [addLog]);

  const start = useCallback(async () => {
    if (!sourceText.trim()) {
      toast.info('Importe um arquivo ou cole o texto das notas antes de iniciar.');
      return;
    }

    const validItems = items.filter((item) => item.status !== 'invalid');
    const selectedCount = onlyMarked
      ? validItems.filter((item) => item.selected).length
      : validItems.length;
    if (!selectedCount) {
      toast.info(onlyMarked ? 'Nenhuma nota válida selecionada.' : 'Nenhuma nota válida foi identificada.');
      return;
    }

    setRunning(true);
    addLog(`Lote iniciado com ${selectedCount} nota(s).`);

    try {
      const data = await requestJson<{
        status: string;
        resultados?: Array<{ chave: string; status: string; error?: string; message?: string }>;
        message?: string;
      }>('/api/microservico/processar-texto', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texto: sourceText, somenteSelecionadas: onlyMarked }),
      });

      for (const result of data.resultados || []) {
        const status: Invoice['status'] = result.status === 'falha'
          ? 'error'
          : result.status === 'interrompido'
            ? 'pending'
            : result.status === 'salvo' || result.status === 'pulado'
              ? 'done'
              : 'processing';

        setItems((previous) => previous.map((item) => {
          if (item.key !== result.chave) return item;
          const next = { ...item, status };
          if (status === 'error' && result.error) next.errorCode = result.error;
          if (status === 'error' && result.message) next.errorMessage = result.message;
          return next;
        }));
      }

      setRunning(false);
      addLog(data.message || 'Lote concluído.', data.status === 'interrompido' ? 'WARN' : 'INFO');
      await refreshOutputs();
      if (data.status === 'interrompido') toast.info('Lote interrompido. Os arquivos concluídos foram mantidos.');
      else toast.success(data.message || 'Lote concluído.');
    } catch (error) {
      setRunning(false);
      addLog(error instanceof Error ? error.message : 'Falha ao processar o lote.', 'ERROR');
      toast.error(error instanceof Error ? error.message : 'Falha ao processar o lote.');
    }
  }, [addLog, items, onlyMarked, refreshOutputs, sourceText]);

  const stop = useCallback(async () => {
    try {
      await requestJson('/api/microservico/interromper', { method: 'POST' });
      addLog('Interrupção solicitada pelo usuário.', 'WARN');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível interromper.');
    }
  }, [addLog]);

  const saveInvoice = useCallback(async (item: Invoice) => {
    const data = await requestJson<{ status: string; message?: string }>('/api/microservico/consulta-salvar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chave: item.key, numero: item.number, nome: item.company }),
    });
    setItems((previous) => previous.map((row) => row.id === item.id ? { ...row, status: 'done' } : row));
    addLog(data.message || `NF ${item.number} salva.`);
    await refreshOutputs();
    return data;
  }, [addLog, refreshOutputs]);

  const dismissExternalCapture = useCallback(async () => {
    setExternalCaptureBusy(true);
    try {
      await requestJson('/api/microservico/extensao/pendente', { method: 'DELETE' });
      setExternalCapture(null);
      toast.info('Envio da extensao cancelado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nao foi possivel cancelar o envio.');
    } finally {
      setExternalCaptureBusy(false);
    }
  }, []);

  const confirmExternalCapture = useCallback(async () => {
    const capture = externalCapture;
    if (!capture || externalCaptureBusy) return;

    setExternalCaptureBusy(true);
    try {
      await requestJson('/api/microservico/extensao/pendente', { method: 'DELETE' });
      setExternalCapture(null);
      const data = await requestJson<{ status: string; message?: string }>('/api/microservico/processar-texto', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          texto: capture.texto,
          somenteSelecionadas: capture.somenteSelecionadas,
          intervaloMs: capture.intervaloMs
        })
      });
      addLog(data.message || 'Texto recebido da extensao processado.');
      await refreshOutputs();
      toast.success(data.message || 'Texto enviado para processamento.');
    } catch (error) {
      setExternalCapture(capture);
      toast.error(error instanceof Error ? error.message : 'Nao foi possivel processar o texto da extensao.');
    } finally {
      setExternalCaptureBusy(false);
    }
  }, [addLog, externalCapture, externalCaptureBusy, refreshOutputs]);

  const clearProcessed = useCallback(async () => {
    await requestJson('/api/microservico/processados', { method: 'DELETE' });
    addLog('Histórico de notas processadas limpo.', 'WARN');
    toast.success('Histórico limpo. Os arquivos não foram apagados.');
  }, [addLog]);

  const resetBatch = useCallback(() => {
    setItems([]);
    setSourceText('');
    setFileName('');
    setOnlyMarked(false);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  useEffect(() => {
    if (eventSourceRef.current) return;

    void refreshOutputs();
    void requestJson<NetworkStatus>('/api/microservico/rede/status')
      .then(setNetworkStatus)
      .catch(() => setNetworkStatus((previous) => ({
        ...previous,
        state: 'offline',
        online: false,
        error: 'Backend offline.'
      })));
    void requestJson<DatabaseStatus>('/api/microservico/banco/status')
      .then(setDatabaseStatus)
      .catch(() => setDatabaseStatus((previous) => ({
        ...previous,
        state: 'offline',
        online: false,
        error: 'Backend offline.'
      })));
    void requestJson<{ automacao: DatabaseAutomationState }>('/api/microservico/banco/automacao')
      .then((data) => {
        if (data.automacao) setDatabaseAutomation(data.automacao);
      })
      .catch(() => undefined);
    void requestJson<{ pendente: ExternalCapture | null }>('/api/microservico/extensao/pendente')
      .then((data) => {
        if (!data.pendente?.texto) return;
        setExternalCapture(data.pendente);
        void revealDesktopWindow();
      })
      .catch(() => undefined);
    const events = new EventSource(apiUrl('/api/microservico/eventos'));
    eventSourceRef.current = events;
    const parseEvent = (event: MessageEvent) => {
      try { return JSON.parse(event.data) as Record<string, unknown>; } catch { return {}; }
    };
    const updateItem = (data: Record<string, unknown>, status: Invoice['status']) => {
      const key = String(data['chave'] || '');
      const errorCode = status === 'error' ? String(data['error'] || '') : undefined;
      const errorMessage = status === 'error' ? String(data['message'] || '') : undefined;
      setItems((previous) => previous.map((item) => {
        if (item.key !== key) return item;
        const next = { ...item, status };
        if (errorCode) next.errorCode = errorCode;
        if (errorMessage) next.errorMessage = errorMessage;
        return next;
      }));

      if (status === 'error') {
        const label = String(data['numero'] || key || 'Nota');
        addLog(`${label}: ${errorMessage || 'Falha na consulta.'}`, 'ERROR');
      }
    };

    events.addEventListener('conectado', (event) => {
      setServiceOnline(true);
      const data = parseEvent(event);
      if (data['rede']) setNetworkStatus(data['rede'] as NetworkStatus);
      if (data['banco']) setDatabaseStatus(data['banco'] as DatabaseStatus);
      if (data['bancoAutomacao']) setDatabaseAutomation(data['bancoAutomacao'] as DatabaseAutomationState);
    });
    events.addEventListener('ping', () => setServiceOnline(true));
    events.addEventListener('rede_status', (event) => {
      setNetworkStatus(parseEvent(event) as NetworkStatus);
    });
    events.addEventListener('banco_status', (event) => {
      setDatabaseStatus(parseEvent(event) as DatabaseStatus);
    });
    events.addEventListener('banco_automacao_inicio', (event) => {
      setDatabaseAutomation(parseEvent(event) as unknown as DatabaseAutomationState);
      addLog('Consulta automática iniciada.');
    });
    events.addEventListener('banco_automacao_progresso', (event) => {
      setDatabaseAutomation(parseEvent(event) as unknown as DatabaseAutomationState);
    });
    events.addEventListener('banco_automacao_adiada', (event) => {
      const data = parseEvent(event);
      addLog(String(data['message'] || 'Consulta automática adiada para o próximo ciclo.'), 'WARN');
    });
    events.addEventListener('banco_automacao_interromper_solicitado', (event) => {
      setDatabaseAutomation(parseEvent(event) as unknown as DatabaseAutomationState);
      addLog('Interrupção da consulta automática solicitada.', 'WARN');
    });
    events.addEventListener('banco_automacao_fim', (event) => {
      const data = parseEvent(event) as unknown as DatabaseAutomationState;
      setDatabaseAutomation(data);
      addLog(data.phase === 'concluida' ? 'Consulta automática concluída.' : data.phase === 'interrompida' ? 'Consulta automática interrompida.' : 'Consulta automática finalizada com erro.', data.phase === 'erro' ? 'ERROR' : data.phase === 'interrompida' ? 'WARN' : 'INFO');
      void refreshOutputs();
    });
    events.addEventListener('lote_inicio', (event) => {
      setRunning(true);
      const data = parseEvent(event);
      addLog(String(data['message'] || 'Lote iniciado.'));
    });
    events.addEventListener('lote_item', (event) => {
      const data = parseEvent(event);
      const status = data['status'] === 'falha' ? 'error' : data['status'] === 'interrompido' ? 'pending' : data['status'] === 'salvo' || data['status'] === 'pulado' ? 'done' : 'processing';
      updateItem(data, status);
    });
    events.addEventListener('lote_pausa', (event) => {
      const data = parseEvent(event);
      addLog(String(data['message'] || 'Pausa entre blocos.'), 'WARN');
    });
    events.addEventListener('consulta_retentativa', (event) => {
      const data = parseEvent(event);
      addLog(`Nova tentativa da consulta (${data['tentativa'] || 1}).`, 'WARN');
    });
    events.addEventListener('extensao_texto_detectado', (event) => {
      const data = parseEvent(event) as unknown as ExternalCapture;
      if (!data.texto) return;

      setExternalCapture(data);
      void revealDesktopWindow();
      toast.info('Texto recebido da extensao. Confirme o envio no DANFE.');
    });
    events.addEventListener('lote_fim', (event) => {
      setRunning(false);
      const data = parseEvent(event);
      addLog(String(data['message'] || 'Lote concluído.'));
      void refreshOutputs();
    });
    events.addEventListener('arquivo_salvo', () => void refreshOutputs());
    events.addEventListener('arquivo_pulado', () => void refreshOutputs());
    events.onerror = () => setServiceOnline(false);

    return () => {
      events.close();
      if (eventSourceRef.current === events) eventSourceRef.current = null;
    };
  }, [addLog, refreshOutputs]);

  useEffect(() => {
    let cancelled = false;

    const checkDevelopmentMode = () => {
      void requestJson<{ enabled: boolean }>('/api/dev/release/status')
        .then((data) => {
          if (!cancelled) setDevelopmentMode(data.enabled === true);
        })
        .catch(() => {
          if (!cancelled) setDevelopmentMode(false);
        });
    };

    checkDevelopmentMode();
    const timer = window.setInterval(checkDevelopmentMode, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return {
    dark,
    setDark,
    items,
    setItems,
    outputs,
    running,
    fileName,
    sourceText,
    onlyMarked,
    setOnlyMarked,
    outputFolder,
    serviceOnline,
    networkStatus,
    databaseStatus,
    databaseAutomation,
    developmentMode,
    logs,
    setLogs,
    addLog,
    importText,
    start,
    pause: stop,
    stop,
    saveInvoice,
    externalCapture,
    externalCaptureBusy,
    confirmExternalCapture,
    dismissExternalCapture,
    clearProcessed,
    resetBatch,
    refreshOutputs,
    stopDatabaseAutomation,
    openOutputFolder,
    openOutputFile,
    downloadOutputFile,
    generateOutputLayout,
  };
}

type DanfeState = ReturnType<typeof useDanfeState>;
const DanfeContext = createContext<DanfeState | null>(null);

export function DanfeProvider({ children }: { children: ReactNode }) {
  const state = useDanfeState();
  return <DanfeContext.Provider value={state}>{children}</DanfeContext.Provider>;
}

export function useDanfe() {
  const value = useContext(DanfeContext);
  if (!value) throw new Error('DANFE provider missing');
  return value;
}
