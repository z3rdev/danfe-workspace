import { config as loadEnv } from 'dotenv';
import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import multer from 'multer';
import os from 'node:os';
import sql from 'mssql';
import { DatabaseSync } from 'node:sqlite';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { additionalLayoutDirs, listOutputPdfs, migrateLayoutPdfs, originalPdfName } from './layout-storage.js';
import { ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv({ path: path.resolve(__dirname, '../.env'), quiet: true });

const app = express();
const port = Number(process.env.PORT || 3000);
const danfeApiBase = process.env.DANFE_API_BASE || 'https://consultadanfe.com/api/v1';
const meudanfeApiBase = String(process.env.MEUDANFE_API_BASE || 'https://api.meudanfe.com.br/v2').replace(/\/+$/, '');
const meudanfeApiKey = String(process.env.MEUDANFE_API_KEY || '').trim();
const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || 90000);
const defaultBatchIntervalMs = Number(process.env.BATCH_INTERVAL_MS || 1500);
const defaultBatchSize = Number(process.env.BATCH_SIZE || 25);
const defaultBatchPauseMs = Number(process.env.BATCH_PAUSE_MS || 15000);
const maxBatchSize = 100;
const maxBatchPauseMs = 120000;
const networkProbeHost = String(process.env.NETWORK_PROBE_HOST || '127.0.0.1').trim();
const networkProbeIntervalMs = Math.max(1000, Number(process.env.NETWORK_PROBE_INTERVAL_MS || 5000));
const networkProbeTimeoutMs = Math.max(500, Number(process.env.NETWORK_PROBE_TIMEOUT_MS || 1500));

function parseSqlServerTarget(value) {
  const raw = String(value || '').trim();
  const [hostAndInstance, portPart] = raw.split(',');
  const server = String(hostAndInstance || '').split('\\')[0].trim();
  const port = Number(portPart);
  return { server, port: Number.isFinite(port) ? port : null };
}

const mssqlTarget = parseSqlServerTarget(process.env.MSSQL_SERVER || '');
const mssqlPort = Number(process.env.MSSQL_PORT || mssqlTarget.port || 1433);
const mssqlDatabase = String(process.env.MSSQL_DATABASE || '').trim();
const mssqlUser = String(process.env.MSSQL_USER || '').trim();
const mssqlPassword = String(process.env.MSSQL_PASSWORD || '');
const mssqlConnectionTimeoutMs = Math.max(1000, Number(process.env.MSSQL_CONNECTION_TIMEOUT_MS || 5000));
const mssqlRequestTimeoutMs = Math.max(1000, Number(process.env.MSSQL_REQUEST_TIMEOUT_MS || 30000));
const mssqlProbeIntervalMs = Math.max(5000, Number(process.env.MSSQL_PROBE_INTERVAL_MS || 30000));
const mssqlConfigured = Boolean(mssqlTarget.server && mssqlUser && mssqlPassword);
const packageRoot = path.resolve(__dirname, '../..');
const frontendCandidates = [
  path.resolve(__dirname, '../../FRONTEND'),
  path.resolve(__dirname, '../FRONTEND'),
  path.resolve(__dirname, '../../../FRONTEND'),
  path.resolve(process.cwd(), 'FRONTEND')
];
const frontendSourceDir = frontendCandidates.find((candidate) => existsSync(path.join(candidate, 'index.html')))
  || frontendCandidates[0];
const frontendBuildDir = path.join(frontendSourceDir, 'dist');
const frontendDir = existsSync(path.join(frontendBuildDir, 'index.html')) ? frontendBuildDir : frontendSourceDir;
const frontendIndexFile = path.join(frontendDir, 'index.html');
const hasFrontend = existsSync(frontendIndexFile);
const configuredDefaultOutputDir = String(process.env.DANFE_DEFAULT_OUTPUT_DIR || process.env.PDF_OUTPUT_DIR || '').trim();
const defaultOutputDir = configuredDefaultOutputDir
  ? path.resolve(process.cwd(), configuredDefaultOutputDir)
  : path.join(process.env.USERPROFILE || os.homedir(), 'Documents', 'DANFE');
const configuredStateDir = String(process.env.DANFE_DATA_DIR || '').trim();
const stateDir = configuredStateDir
  ? path.resolve(process.cwd(), configuredStateDir)
  : path.join(process.env.PROGRAMDATA || os.homedir(), 'DANFE Workspace', 'data');
const legacyStateDir = path.resolve(packageRoot, 'DADOS');
const developmentConfigFile = path.join(__dirname, '..', 'CONFIG.dev');
const developmentMode = existsSync(developmentConfigFile)
  && /^DEVMODE\s*=\s*TRUE\s*$/mi.test(readFileSync(developmentConfigFile, 'utf8'));
const releaseBucket = 'z3-releases';
const releasePrefix = 'danfe-workspace';
const releaseEndpoint = 'https://s3.nexusnerds.com.br';
const configFile = path.join(stateDir, 'config.json');
const processedLogFile = path.join(stateDir, 'processados.json');
const databaseFile = path.join(stateDir, 'danfe.sqlite');
const windowsStartupName = 'DANFE Workspace';
const xmlParser = new XMLParser({ ignoreAttributes: false });
const execFileAsync = promisify(execFile);
let outputDir = defaultOutputDir;
let runtimeSettings = {
  autoStartWindows: false,
  outputDir: defaultOutputDir,
  batchSize: defaultBatchSize,
  batchIntervalMs: defaultBatchIntervalMs,
  batchPauseMs: defaultBatchPauseMs,
  databaseQueryPeriod: 'month_to_today',
  databaseAutoQuery: false,
  databaseAutoDownload: false,
  databaseAutoIntervalMs: 900000,
  databaseScheduleMode: 'interval',
  databaseScheduledTime: '08:00'
};
let database;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 20
  }
});
const releaseUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 300 * 1024 * 1024,
    files: 2
  }
});
const eventClients = new Set();
let serviceEventId = 0;
let automationState = {
  running: false,
  stopRequested: false,
  runId: null,
  startedAt: null,
  total: 0,
  current: 0,
  controller: null
};
let extensionPendingCapture = null;
let networkProbeInFlight = null;
let networkProbeTimer = null;
let databasePoolPromise = null;
let databaseProbeTimer = null;
let databaseAutomationTimer = null;
let databaseAutomationInFlight = null;
let databaseLastScheduledRunKey = null;
let databaseLastAutomationFinishedAt = null;
let databaseAutomationState = {
  running: false,
  stopRequested: false,
  runId: null,
  startedAt: null,
  finishedAt: null,
  phase: 'idle',
  total: 0,
  current: 0,
  result: null,
  controller: null
};
let networkStatus = {
  host: networkProbeHost,
  wifiName: null,
  state: 'checking',
  online: false,
  latencyMs: null,
  lastCheckedAt: null,
  error: null,
  consecutiveFailures: 0
};
let databaseStatus = {
  host: mssqlTarget.server || null,
  port: Number.isFinite(mssqlPort) ? mssqlPort : null,
  database: mssqlDatabase || 'padrao do login',
  state: mssqlConfigured ? 'checking' : 'not_configured',
  online: false,
  lastCheckedAt: null,
  error: mssqlConfigured ? null : 'Banco SQL Server nao configurado.',
  rows: null
};

app.set('etag', false);
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));
if (hasFrontend) app.use(express.static(frontendDir));
app.use('/api', (_req, res, next) => {
  res.setHeader('cache-control', 'no-store');
  next();
});

function normalizeChave(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function isValidChaveShape(chave) {
  return /^[A-Z0-9]{44}$/.test(chave);
}

function safeFilePart(value, fallback) {
  const safe = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);

  return safe || fallback;
}

function makeHttpError(status, payload) {
  const error = new Error(payload?.message || payload?.error || 'erro_http');
  error.status = status;
  error.payload = payload;
  return error;
}

function requireDevelopmentMode() {
  if (!developmentMode) {
    throw makeHttpError(404, {
      error: 'devmode_desativado',
      message: 'Painel de releases disponivel somente no modo de desenvolvimento.'
    });
  }
}

function releaseVersion(value) {
  const normalized = String(value || '').trim().replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalized)) {
    throw makeHttpError(400, {
      error: 'versao_invalida',
      message: 'Informe a versao no formato SemVer, por exemplo 0.1.5.'
    });
  }

  return normalized;
}

function releaseFileVersion(fileName) {
  const normalizedName = String(fileName || '').replace(/\.sig$/i, '');
  const match = normalizedName.match(/_(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)_x64-setup\.exe$/i);
  return match ? releaseVersion(match[1]) : null;
}

async function getReleaseStorage() {
  const credentialsFile = path.join(__dirname, '..', 'credentials.json');

  try {
    const credentials = JSON.parse(await fs.readFile(credentialsFile, 'utf8'));
    const endpoint = String(credentials.url || releaseEndpoint).replace(/\/+$/, '');
    if (!credentials.accessKey || !credentials.secretKey) {
      throw new Error('credenciais S3 incompletas');
    }

    return {
      client: new S3Client({
        endpoint,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: credentials.accessKey,
          secretAccessKey: credentials.secretKey
        }
      }),
      endpoint,
      publicBase: `${endpoint}/${releaseBucket}/${releasePrefix}`
    };
  } catch (error) {
    throw makeHttpError(500, {
      error: 'credenciais_release_invalidas',
      message: 'Nao foi possivel carregar as credenciais do servidor de releases.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

async function listReleaseObjects(client, prefix = `${releasePrefix}/`) {
  const objects = [];
  let continuationToken;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: releaseBucket,
      Prefix: prefix,
      ContinuationToken: continuationToken
    }));
    objects.push(...(response.Contents || []));
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

function releaseUrl(publicBase, version, fileName) {
  return `${publicBase}/${encodeURIComponent(version)}/${encodeURIComponent(fileName)}`;
}

async function listPublishedReleases() {
  const { client, publicBase } = await getReleaseStorage();
  const releases = new Map();

  for (const object of await listReleaseObjects(client)) {
    const key = String(object.Key || '');
    const match = key.match(/^danfe-workspace\/([^/]+)\/([^/]+)$/);
    if (!match || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(match[1])) continue;

    const version = match[1];
    const fileName = match[2];
    const current = releases.get(version) || {
      version,
      installer: null,
      signature: null,
      publishedAt: null
    };

    if (/\.exe$/i.test(fileName)) {
      current.installer = fileName;
      current.installerUrl = releaseUrl(publicBase, version, fileName);
    }
    if (/\.sig$/i.test(fileName)) current.signature = fileName;

    const updatedAt = object.LastModified ? new Date(object.LastModified).toISOString() : null;
    if (updatedAt && (!current.publishedAt || updatedAt > current.publishedAt)) current.publishedAt = updatedAt;
    releases.set(version, current);
  }

  return [...releases.values()]
    .filter((release) => release.installer && release.signature)
    .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
}

async function publishRelease({ version: requestedVersion, notes, installer, signature }) {
  const version = releaseVersion(requestedVersion);
  if (!installer?.buffer?.length || !signature?.buffer?.length) {
    throw makeHttpError(400, {
      error: 'arquivos_release_obrigatorios',
      message: 'Envie o instalador .exe e a assinatura .sig da mesma versao.'
    });
  }
  if (!/\.exe$/i.test(installer.originalname || '') || !/\.sig$/i.test(signature.originalname || '')) {
    throw makeHttpError(400, {
      error: 'arquivos_release_invalidos',
      message: 'O primeiro arquivo precisa ser .exe e o segundo precisa ser .sig.'
    });
  }

  const installerFileVersion = releaseFileVersion(installer.originalname);
  const signatureFileVersion = releaseFileVersion(signature.originalname);
  if (!installerFileVersion || installerFileVersion !== version || !signatureFileVersion || signatureFileVersion !== version) {
    throw makeHttpError(400, {
      error: 'versoes_release_divergentes',
      message: 'A versao informada precisa ser a mesma do instalador NSIS e da assinatura .sig.'
    });
  }

  const signatureText = signature.buffer.toString('utf8').trim();
  if (!signatureText) {
    throw makeHttpError(400, {
      error: 'assinatura_vazia',
      message: 'A assinatura .sig nao pode estar vazia.'
    });
  }

  const { client, publicBase } = await getReleaseStorage();
  const installerName = `DANFE Workspace_${version}_x64-setup.exe`;
  const installerKey = `${releasePrefix}/${version}/${installerName}`;
  const signatureKey = `${installerKey}.sig`;
  const manifest = {
    version,
    notes: String(notes || 'Atualizacao do DANFE Workspace.').trim() || 'Atualizacao do DANFE Workspace.',
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        url: releaseUrl(publicBase, version, installerName),
        signature: signatureText
      }
    }
  };

  await client.send(new PutObjectCommand({
    Bucket: releaseBucket,
    Key: installerKey,
    Body: installer.buffer,
    ContentType: 'application/vnd.microsoft.portable-executable',
    CacheControl: 'public, max-age=31536000, immutable'
  }));
  await client.send(new PutObjectCommand({
    Bucket: releaseBucket,
    Key: signatureKey,
    Body: `${signatureText}\n`,
    ContentType: 'text/plain; charset=utf-8',
    CacheControl: 'public, max-age=31536000, immutable'
  }));
  await client.send(new PutObjectCommand({
    Bucket: releaseBucket,
    Key: `${releasePrefix}/latest.json`,
    Body: `${JSON.stringify(manifest, null, 2)}\n`,
    ContentType: 'application/json; charset=utf-8',
    CacheControl: 'no-cache, no-store, must-revalidate'
  }));

  return { version, installer: installerName, manifest };
}

function broadcastServiceEvent(type, payload = {}) {
  const event = {
    id: ++serviceEventId,
    type,
    at: new Date().toISOString(),
    ...payload
  };
  const message = `id: ${event.id}\nevent: ${type}\ndata: ${JSON.stringify(event)}\n\n`;

  for (const client of eventClients) {
    try {
      client.write(message);
    } catch {
      eventClients.delete(client);
    }
  }
}

function publicNetworkStatus() {
  return { ...networkStatus };
}

function parsePingLatency(output) {
  const match = String(output || '').match(/(?:time|tempo)[=<]\s*<?\s*(\d+)\s*ms/i);
  return match ? Number(match[1]) : null;
}

async function readConnectedWifiName() {
  try {
    const result = await execFileAsync('netsh.exe', ['wlan', 'show', 'interfaces'], {
      windowsHide: true,
      timeout: 1200,
      maxBuffer: 256 * 1024
    });
    const match = String(result.stdout || '').match(/^\s*SSID\s*:\s*(.+?)\s*$/im);
    const name = match?.[1]?.trim() || '';
    if (name && !/^<.*>$/.test(name)) return name;
  } catch {
    // O netsh pode ser bloqueado pela privacidade de localizacao do Windows.
  }

  try {
    const result = await execFileAsync('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "Get-NetConnectionProfile | Where-Object { $_.InterfaceAlias -match 'Wi-Fi|WiFi|Wireless|WLAN' } | Select-Object -First 1 -ExpandProperty Name"
    ], {
      windowsHide: true,
      timeout: 1500,
      maxBuffer: 64 * 1024
    });
    const name = String(result.stdout || '').trim().split(/\r?\n/)[0]?.trim() || '';
    return name || null;
  } catch {
    return null;
  }
}

async function probeNetwork() {
  if (networkProbeInFlight) return networkProbeInFlight;

  networkProbeInFlight = (async () => {
    const checkedAt = new Date().toISOString();
    const wifiNamePromise = readConnectedWifiName();

    try {
      const [result, wifiName] = await Promise.all([execFileAsync('ping.exe', [
        '-n', '1',
        '-w', String(networkProbeTimeoutMs),
        networkProbeHost
      ], {
        windowsHide: true,
        timeout: networkProbeTimeoutMs + 1000,
        maxBuffer: 256 * 1024
      }), wifiNamePromise]);
      const output = `${result.stdout || ''}\n${result.stderr || ''}`;

      networkStatus = {
        host: networkProbeHost,
        wifiName,
        state: 'online',
        online: true,
        latencyMs: parsePingLatency(output),
        lastCheckedAt: checkedAt,
        error: null,
        consecutiveFailures: 0
      };
    } catch {
      networkStatus = {
        host: networkProbeHost,
        wifiName: await wifiNamePromise,
        state: 'offline',
        online: false,
        latencyMs: null,
        lastCheckedAt: checkedAt,
        error: 'A rede local nao respondeu ao ping.',
        consecutiveFailures: networkStatus.consecutiveFailures + 1
      };
    }

    broadcastServiceEvent('rede_status', publicNetworkStatus());
    return publicNetworkStatus();
  })().finally(() => {
    networkProbeInFlight = null;
  });

  return networkProbeInFlight;
}

async function ensureNetworkAvailable() {
  const lastCheck = networkStatus.lastCheckedAt ? Date.parse(networkStatus.lastCheckedAt) : 0;
  if (!lastCheck || Date.now() - lastCheck >= networkProbeIntervalMs) {
    await probeNetwork();
  }

  return publicNetworkStatus();
}

function networkUnavailablePayload(status = publicNetworkStatus()) {
  return {
    error: 'rede_indisponivel',
    message: `A rede local ${status.host} esta offline. Verifique a conexao antes de consultar.`,
    rede: status
  };
}

function startNetworkMonitor() {
  if (networkProbeTimer) return;
  void probeNetwork();
  networkProbeTimer = setInterval(() => {
    void probeNetwork();
  }, networkProbeIntervalMs);
}

function publicDatabaseStatus() {
  return { ...databaseStatus };
}

function publicDatabaseAutomationState() {
  const { controller, ...state } = databaseAutomationState;
  return state;
}

function broadcastDatabaseAutomation(event, extra = {}) {
  broadcastServiceEvent(event, {
    ...publicDatabaseAutomationState(),
    ...extra
  });
}

function buildNfeIdistQuery(period = runtimeSettings.databaseQueryPeriod) {
  const dateFilter = period === 'previous_day'
    ? `DEMI >= DATEADD(DAY, -1, CAST(GETDATE() AS DATE))
  AND DEMI < CAST(GETDATE() AS DATE)`
    : `DEMI >= DATEADD(MONTH, -1, CAST(GETDATE() AS DATE))
  AND DEMI < DATEADD(DAY, 1, CAST(GETDATE() AS DATE))`;

  return `
SELECT *
FROM NFEIDIST
WHERE SITUAC_VR = 0
  AND CIENCIA = '1'
  AND TPNF = '1'
  AND CONF_OPERACAO = '1'
  AND ${dateFilter}
ORDER BY DEMI DESC;
`;
}

const mssqlConfig = {
  user: mssqlUser,
  password: mssqlPassword,
  server: mssqlTarget.server,
  port: Number.isFinite(mssqlPort) ? mssqlPort : 1433,
  connectionTimeout: mssqlConnectionTimeoutMs,
  requestTimeout: mssqlRequestTimeoutMs,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  ...(mssqlDatabase ? { database: mssqlDatabase } : {})
};

function updateDatabaseStatus(partial) {
  databaseStatus = { ...databaseStatus, ...partial };
  broadcastServiceEvent('banco_status', publicDatabaseStatus());
  return publicDatabaseStatus();
}

async function getDatabasePool() {
  if (!mssqlConfigured) {
    throw makeHttpError(503, {
      error: 'banco_nao_configurado',
      message: 'O banco SQL Server nao esta configurado.'
    });
  }

  if (!databasePoolPromise) {
    const pool = new sql.ConnectionPool(mssqlConfig);
    databasePoolPromise = pool.connect()
      .then((connected) => {
        connected.on('error', () => {
          databasePoolPromise = null;
          updateDatabaseStatus({
            state: 'offline',
            online: false,
            error: 'A conexao com o banco SQL Server foi perdida.'
          });
        });
        return connected;
      })
      .catch((error) => {
        databasePoolPromise = null;
        throw error;
      });
  }

  return databasePoolPromise;
}

async function probeDatabase() {
  if (!mssqlConfigured) {
    return updateDatabaseStatus({
      state: 'not_configured',
      online: false,
      lastCheckedAt: new Date().toISOString(),
      error: 'Banco SQL Server nao configurado.'
    });
  }

  const rede = await ensureNetworkAvailable();
  if (!rede.online) {
    return updateDatabaseStatus({
      state: 'offline',
      online: false,
      lastCheckedAt: new Date().toISOString(),
      error: `Rede local ${rede.host} offline.`
    });
  }

  try {
    const pool = await getDatabasePool();
    await pool.request().query('SELECT 1 AS online');
    return updateDatabaseStatus({
      state: 'online',
      online: true,
      lastCheckedAt: new Date().toISOString(),
      error: null
    });
  } catch {
    databasePoolPromise = null;
    return updateDatabaseStatus({
      state: 'offline',
      online: false,
      lastCheckedAt: new Date().toISOString(),
      error: 'Nao foi possivel conectar ao banco SQL Server.'
    });
  }
}

async function queryNfeIdist() {
  const rede = await ensureNetworkAvailable();
  if (!rede.online) {
    throw makeHttpError(503, networkUnavailablePayload(rede));
  }

  try {
    const pool = await getDatabasePool();
    const result = await pool.request().query(buildNfeIdistQuery());
    updateDatabaseStatus({
      state: 'online',
      online: true,
      lastCheckedAt: new Date().toISOString(),
      error: null,
      rows: result.recordset.length
    });
    return result.recordset;
  } catch {
    databasePoolPromise = null;
    updateDatabaseStatus({
      state: 'offline',
      online: false,
      lastCheckedAt: new Date().toISOString(),
      error: 'Nao foi possivel consultar o banco SQL Server.'
    });
    throw makeHttpError(502, {
      error: 'falha_consulta_banco',
      message: 'Nao foi possivel consultar as notas no banco SQL Server.'
    });
  }
}

function databaseNoteFromRow(row) {
  return {
    chave: normalizeChave(row?.CHNFE || row?.CHAVE || row?.chave),
    numero: String(row?.NOTA || row?.nNF || row?.NUMERO || '').trim(),
    nome: String(row?.XNOME || row?.NOME || row?.RAZAO_SOCIAL || '').trim()
  };
}

function databaseAutomationCooldownMs() {
  // Reserve uma pequena janela depois da finalizacao para nao emendar uma
  // nova consulta quando o proximo ciclo do intervalo estiver muito perto.
  return Math.max(
    30000,
    Math.min(300000, Math.round(runtimeSettings.databaseAutoIntervalMs * 0.1))
  );
}

async function runDatabaseAutomation({ source = 'manual' } = {}) {
  if (!mssqlConfigured || !runtimeSettings.databaseAutoQuery || databaseAutomationInFlight) return null;

  if (source === 'interval' && databaseLastAutomationFinishedAt) {
    const now = Date.now();
    const cooldownMs = databaseAutomationCooldownMs();
    const elapsedSinceFinishMs = now - databaseLastAutomationFinishedAt;

    if (elapsedSinceFinishMs < cooldownMs) {
      const waitMs = cooldownMs - elapsedSinceFinishMs;
      broadcastDatabaseAutomation('banco_automacao_adiada', {
        reason: 'janela_minima_entre_execucoes',
        message: 'Consulta automatica adiada para o proximo ciclo.',
        lastFinishedAt: new Date(databaseLastAutomationFinishedAt).toISOString(),
        waitMs,
        nextAttemptAt: new Date(now + waitMs).toISOString()
      });
      return { skipped: true, reason: 'janela_minima_entre_execucoes', waitMs };
    }
  }

  databaseAutomationInFlight = (async () => {
    if (automationState.running) {
      return { skipped: true, reason: 'lote_manual_em_andamento' };
    }

    const controller = new AbortController();
    databaseAutomationState = {
      running: true,
      stopRequested: false,
      runId: `banco-${Date.now()}`,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      phase: 'consultando',
      total: 0,
      current: 0,
      result: null,
      controller
    };
    broadcastDatabaseAutomation('banco_automacao_inicio');

    try {
      const notas = await queryNfeIdist();
      const candidates = notas.map(databaseNoteFromRow).filter((nota) => isValidChaveShape(nota.chave));
      const progress = {
        ok: true,
        period: runtimeSettings.databaseQueryPeriod,
        autoDownload: runtimeSettings.databaseAutoDownload,
        total: notas.length,
        validas: candidates.length,
        downloaded: 0,
        skipped: 0,
        failed: 0,
        interrupted: false
      };

      databaseAutomationState = {
        ...databaseAutomationState,
        phase: runtimeSettings.databaseAutoDownload ? 'baixando' : 'finalizando',
        total: candidates.length,
        result: progress
      };
      broadcastDatabaseAutomation('banco_automacao_progresso');

      if (runtimeSettings.databaseAutoDownload) {
        for (let index = 0; index < candidates.length; index += 1) {
          if (databaseAutomationState.stopRequested) break;

          const nota = candidates[index];
          databaseAutomationState = { ...databaseAutomationState, current: index + 1 };

          try {
            const result = await consultaSalvarPdf({ ...nota, signal: controller.signal });
            if (result.status === 'ja_processado') progress.skipped += 1;
            else progress.downloaded += 1;
          } catch (error) {
            if (databaseAutomationState.stopRequested || error?.name === 'AbortError') break;
            progress.failed += 1;
          }

          databaseAutomationState = {
            ...databaseAutomationState,
            result: { ...progress },
          };
          broadcastDatabaseAutomation('banco_automacao_progresso');

          if (index + 1 < candidates.length && !databaseAutomationState.stopRequested) {
            try {
              await sleepWithSignal(runtimeSettings.batchIntervalMs, controller.signal);
              if ((index + 1) % runtimeSettings.batchSize === 0) {
                await sleepWithSignal(runtimeSettings.batchPauseMs, controller.signal);
              }
            } catch (error) {
              if (!databaseAutomationState.stopRequested && error?.name !== 'AbortError') throw error;
              break;
            }
          }
        }
      }

      const interrupted = databaseAutomationState.stopRequested;
      const finalResult = {
        ...progress,
        interrupted,
        executedAt: new Date().toISOString()
      };
      const finishedAt = new Date();
      databaseLastAutomationFinishedAt = finishedAt.getTime();
      databaseAutomationState = {
        ...databaseAutomationState,
        running: false,
        phase: interrupted ? 'interrompida' : 'concluida',
        finishedAt: finishedAt.toISOString(),
        result: finalResult,
        controller: null
      };
      broadcastDatabaseAutomation('banco_automacao_fim');
      return finalResult;
    } catch (error) {
      const interrupted = databaseAutomationState.stopRequested || error?.name === 'AbortError';
      const result = interrupted
        ? {
            ok: true,
            period: runtimeSettings.databaseQueryPeriod,
            autoDownload: runtimeSettings.databaseAutoDownload,
            interrupted: true,
            message: 'Consulta automatica interrompida pelo usuario.',
            executedAt: new Date().toISOString()
          }
        : {
            ok: false,
            period: runtimeSettings.databaseQueryPeriod,
            autoDownload: runtimeSettings.databaseAutoDownload,
            error: error?.payload?.error || 'falha_consulta_banco',
            message: 'A consulta automatica do banco falhou.',
            executedAt: new Date().toISOString()
          };

      const finishedAt = new Date();
      databaseLastAutomationFinishedAt = finishedAt.getTime();
      databaseAutomationState = {
        ...databaseAutomationState,
        running: false,
        phase: interrupted ? 'interrompida' : 'erro',
        finishedAt: finishedAt.toISOString(),
        result,
        controller: null
      };
      broadcastDatabaseAutomation('banco_automacao_fim');
      return result;
    }
  })().catch((error) => {
    const result = {
      ok: false,
      period: runtimeSettings.databaseQueryPeriod,
      autoDownload: runtimeSettings.databaseAutoDownload,
      error: error?.payload?.error || 'falha_consulta_banco',
      message: 'A consulta automatica do banco falhou.',
      executedAt: new Date().toISOString()
    };
    const finishedAt = new Date();
    databaseLastAutomationFinishedAt = finishedAt.getTime();
    databaseAutomationState = {
      ...databaseAutomationState,
      running: false,
      phase: 'erro',
      finishedAt: finishedAt.toISOString(),
      result,
      controller: null
    };
    broadcastDatabaseAutomation('banco_automacao_fim');
    return result;
  }).finally(() => {
    databaseAutomationInFlight = null;
  });

  return databaseAutomationInFlight;
}

function requestDatabaseAutomationStop() {
  if (!databaseAutomationState.running) {
    return {
      ok: true,
      interrompido: false,
      message: 'Nenhuma consulta automatica em andamento.',
      automacao: publicDatabaseAutomationState()
    };
  }

  databaseAutomationState = { ...databaseAutomationState, stopRequested: true };
  databaseAutomationState.controller?.abort(makeAbortError());
  const result = {
    ok: true,
    interrompido: true,
    message: 'Interrupcao da consulta automatica solicitada.',
    automacao: publicDatabaseAutomationState()
  };
  broadcastDatabaseAutomation('banco_automacao_interromper_solicitado');
  return result;
}

function stopDatabaseAutomation() {
  if (databaseAutomationTimer) clearInterval(databaseAutomationTimer);
  databaseAutomationTimer = null;
  databaseLastScheduledRunKey = null;
}

function startDatabaseAutomation({ triggerNow = false } = {}) {
  stopDatabaseAutomation();
  if (!mssqlConfigured || !runtimeSettings.databaseAutoQuery) {
    requestDatabaseAutomationStop();
    return;
  }

  if (runtimeSettings.databaseScheduleMode === 'scheduled_time') {
    const checkScheduledRun = () => {
      const now = new Date();
      const [hour, minute] = runtimeSettings.databaseScheduledTime.split(':').map(Number);
      const scheduledMinutes = hour * 60 + minute;
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const localDate = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
      const runKey = `${localDate}-${runtimeSettings.databaseScheduledTime}`;

      if (currentMinutes >= scheduledMinutes && databaseLastScheduledRunKey !== runKey) {
        databaseLastScheduledRunKey = runKey;
        void runDatabaseAutomation({ source: 'scheduled' });
      }
    };

    if (triggerNow) {
      checkScheduledRun();
    } else {
      const now = new Date();
      const [hour, minute] = runtimeSettings.databaseScheduledTime.split(':').map(Number);
      const scheduledMinutes = hour * 60 + minute;
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      if (currentMinutes >= scheduledMinutes) {
        databaseLastScheduledRunKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${runtimeSettings.databaseScheduledTime}`;
      }
    }
    databaseAutomationTimer = setInterval(checkScheduledRun, 30000);
    return;
  }

  if (triggerNow) void runDatabaseAutomation({ source: 'interval' });
  databaseAutomationTimer = setInterval(() => {
    void runDatabaseAutomation({ source: 'interval' });
  }, runtimeSettings.databaseAutoIntervalMs);
}

function startDatabaseMonitor() {
  if (databaseProbeTimer || !mssqlConfigured) return;
  void probeDatabase();
  databaseProbeTimer = setInterval(() => {
    void probeDatabase();
  }, mssqlProbeIntervalMs);
}

function makeExtensionCapture(text, source = {}, options = {}) {
  const cleanText = String(text || '').replace(/^\uFEFF/, '').trim();
  const parsed = parseNotasText(cleanText);

  return {
    id: `${Date.now()}`,
    texto: cleanText,
    origem: 'extensao',
    source,
    chaves: parsed.validas,
    linhas: parsed.total,
    chars: cleanText.length,
    somenteSelecionadas: options.somenteSelecionadas === true,
    intervaloMs: Number(options.intervaloMs || runtimeSettings.batchIntervalMs),
    criadoEm: new Date().toISOString()
  };
}

function publicAutomationState() {
  return {
    running: automationState.running,
    stopRequested: automationState.stopRequested,
    runId: automationState.runId,
    startedAt: automationState.startedAt,
    total: automationState.total,
    current: automationState.current
  };
}

function startAutomation(total) {
  automationState = {
    running: true,
    stopRequested: false,
    runId: `${Date.now()}`,
    startedAt: new Date().toISOString(),
    total,
    current: 0,
    controller: new AbortController()
  };

  return automationState;
}

function finishAutomation() {
  const snapshot = publicAutomationState();
  automationState = {
    running: false,
    stopRequested: false,
    runId: null,
    startedAt: null,
    total: 0,
    current: 0,
    controller: null
  };

  return snapshot;
}

function requestAutomationStop() {
  if (!automationState.running) {
    return {
      ok: true,
      interrompido: false,
      message: 'Nenhuma automacao em andamento.',
      automacao: publicAutomationState()
    };
  }

  automationState.stopRequested = true;
  automationState.controller?.abort('interrompido_pelo_usuario');
  const result = {
    ok: true,
    interrompido: true,
    message: 'Interrupcao solicitada.',
    automacao: publicAutomationState()
  };

  broadcastServiceEvent('lote_interromper_solicitado', result);
  return result;
}

async function sleepWithStop(ms) {
  const end = Date.now() + ms;

  while (Date.now() < end) {
    if (automationState.stopRequested) return false;
    await sleep(Math.min(250, end - Date.now()));
  }

  return !automationState.stopRequested;
}

function sendServiceError(error, res, fallbackMessage) {
  if (error?.status && error?.payload) {
    return res.status(error.status).json(error.payload);
  }

  const aborted = error?.name === 'AbortError';
  return res.status(aborted ? 504 : 502).json({
    error: aborted ? 'upstream_timeout' : 'consulta_salvar_falhou',
    message: aborted
      ? 'A consulta demorou demais para responder.'
      : fallbackMessage,
    detail: error instanceof Error ? error.message : String(error)
  });
}

function numeroFromChave(chave) {
  return chave.slice(25, 34);
}

function getNestedValue(object, pathParts) {
  return pathParts.reduce((current, part) => current?.[part], object);
}

function extractNfeInfoFromXml(xmlText) {
  try {
    const parsed = xmlParser.parse(xmlText);
    const infNFe =
      getNestedValue(parsed, ['nfeProc', 'NFe', 'infNFe']) ||
      getNestedValue(parsed, ['NFe', 'infNFe']) ||
      getNestedValue(parsed, ['procNFe', 'NFe', 'infNFe']);

    return {
      numero: infNFe?.ide?.nNF ? String(infNFe.ide.nNF).padStart(9, '0') : '',
      nome: infNFe?.emit?.xNome || infNFe?.dest?.xNome || ''
    };
  } catch {
    return { numero: '', nome: '' };
  }
}

function buildBaseFileName({ numero, nome, chave }) {
  const cleanNumero = safeFilePart(numero || numeroFromChave(chave), 'sem-numero');
  const cleanNome = safeFilePart(nome, 'sem-nome');
  return `${cleanNumero} - ${cleanNome}`;
}

function buildPdfFileName({ numero, nome, chave }) {
  return `${buildBaseFileName({ numero, nome, chave })}.pdf`;
}

function normalizeColumnName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function splitTextRow(line) {
  if (line.includes('\t')) return line.split('\t');
  if (line.includes(';')) return line.split(';');
  return line.trim().split(/\s{2,}/);
}

function parseLooseNotaLine(line, lineNumber) {
  const text = String(line || '').trim();
  const match = text.match(
    /^(?:(true|false|sim|nao|não|s|n|1|0|x)\s+)?(\d{1,12})\s+([A-Z0-9]{44})\s+\S+\s+\d{14}\s+\d{14}\s+(.+?)\s+\S+\s+([A-Z]{2})\s+(\d+(?:[.,]\d{2})?)\b/i
  );

  if (match) {
    const [, selected, numero, chave, nome, uf, valor] = match;
    return {
      linha: lineNumber,
      selecionado: selected === undefined ? null : parseTruthy(selected),
      numero: numero.padStart(9, '0'),
      chave: normalizeChave(chave),
      nome: nome.trim(),
      uf: uf.toUpperCase(),
      valor,
      emissao: '',
      situacao: '',
      valida: true,
      erros: []
    };
  }

  const chaveMatch = text.match(/[A-Z0-9]{44}/i);
  if (!chaveMatch) return null;

  const before = text.slice(0, chaveMatch.index).trim().split(/\s+/);
  const after = text.slice(chaveMatch.index + chaveMatch[0].length).trim();
  const selected = before.length ? parseTruthy(before[0]) : null;
  const numeroCandidate = [...before].reverse().find((part) => /^\d{1,12}$/.test(part));
  const afterParts = after.split(/\s+/);
  const nameStart = afterParts.findIndex((part, index) =>
    index >= 3 && !/^\d{14}$/.test(part) && !/^\S+$/.test(part.replace(/[A-Z0-9&./-]/gi, ''))
  );
  const ufIndex = afterParts.findIndex((part, index) => index > 3 && /^[A-Z]{2}$/i.test(part));
  const roughName = ufIndex > 4
    ? afterParts.slice(3, ufIndex - 1).join(' ')
    : afterParts.slice(3, 9).join(' ');

  return {
    linha: lineNumber,
    selecionado: selected,
    numero: numeroCandidate ? numeroCandidate.padStart(9, '0') : '',
    chave: normalizeChave(chaveMatch[0]),
    nome: roughName.trim(),
    uf: ufIndex >= 0 ? afterParts[ufIndex].toUpperCase() : '',
    valor: '',
    emissao: '',
    situacao: '',
    valida: true,
    erros: roughName.trim() ? [] : ['Nome nao identificado automaticamente.']
  };
}

function parseTruthy(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['true', 'sim', 's', '1', 'x', 'ok'].includes(normalized)) return true;
  if (['false', 'nao', 'n', '0', ''].includes(normalized)) return false;
  return null;
}

function findHeaderIndex(headers, candidates) {
  return headers.findIndex((header) =>
    candidates.some((candidate) => header === candidate || header.includes(candidate))
  );
}

function parseNotasText(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim());

  if (!lines.length) {
    return {
      total: 0,
      validas: 0,
      selecionadas: 0,
      linhas: []
    };
  }

  const firstRow = splitTextRow(lines[0]);
  const firstHeaders = firstRow.map((cell, index) =>
    normalizeColumnName(cell) || (index === 0 ? 'selecionado' : `col${index}`)
  );
  const hasHeader = firstHeaders.some((header) => header.includes('chave')) &&
    firstHeaders.some((header) => header === 'nota' || header.includes('numero'));
  let headerCells = hasHeader
    ? firstRow
    : ['', 'Nota', 'Chave Nfe', 'Sit. Manifestacao', 'CNPJ', 'CNPJ Filial', 'Nome'];
  const firstDataColumns = splitTextRow(lines[hasHeader ? 1 : 0] || '');

  if (
    hasHeader &&
    firstDataColumns.length === headerCells.length + 1 &&
    parseTruthy(firstDataColumns[0]) !== null
  ) {
    headerCells = ['', ...headerCells];
  }

  const headers = headerCells.map((cell, index) =>
    normalizeColumnName(cell) || (index === 0 ? 'selecionado' : `col${index}`)
  );
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const selectedIndex = findHeaderIndex(headers, ['selecionado', 'marcado', 'processar', 'baixar']);
  const numeroIndex = findHeaderIndex(headers, ['nota', 'numeronf', 'numnf']);
  const chaveIndex = findHeaderIndex(headers, ['chavenfe', 'chaveacesso', 'chave']);
  const nomeIndex = findHeaderIndex(headers, ['nome', 'emitente', 'razaosocial']);
  const ufIndex = findHeaderIndex(headers, ['uf']);
  const valorIndex = findHeaderIndex(headers, ['valornfe', 'valor']);
  const emissaoIndex = findHeaderIndex(headers, ['dataemissao', 'emissao']);
  const situacaoIndex = findHeaderIndex(headers, ['sitnfe', 'situacao']);

  const linhas = dataLines.map((line, index) => {
    const lineNumber = index + (hasHeader ? 2 : 1);
    const columns = splitTextRow(line);
    const chave = normalizeChave(columns[chaveIndex] || '');
    const selecionado = selectedIndex >= 0 ? parseTruthy(columns[selectedIndex]) : null;
    const erros = [];

    if (!isValidChaveShape(chave)) erros.push('Chave invalida ou ausente.');

    const row = {
      linha: lineNumber,
      selecionado,
      numero: String(columns[numeroIndex] || '').trim(),
      chave,
      nome: String(columns[nomeIndex] || '').trim(),
      uf: String(columns[ufIndex] || '').trim(),
      valor: String(columns[valorIndex] || '').trim(),
      emissao: String(columns[emissaoIndex] || '').trim(),
      situacao: String(columns[situacaoIndex] || '').trim(),
      valida: erros.length === 0,
      erros
    };

    if (!row.valida || !row.nome || !row.numero) {
      const looseRow = parseLooseNotaLine(line, lineNumber);
      if (looseRow?.chave && isValidChaveShape(looseRow.chave)) {
        return {
          ...row,
          ...looseRow,
          selecionado: looseRow.selecionado ?? row.selecionado,
          numero: looseRow.numero || row.numero,
          nome: looseRow.nome || row.nome,
          uf: looseRow.uf || row.uf,
          valor: looseRow.valor || row.valor,
          valida: true,
          erros: looseRow.erros || []
        };
      }
    }

    return row;
  });

  return {
    total: linhas.length,
    validas: linhas.filter((linha) => linha.valida).length,
    selecionadas: linhas.filter((linha) => linha.valida && linha.selecionado === true).length,
    linhas
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedNumber(value, fallback, minimum, maximum) {
  const fallbackNumber = Number(fallback);
  const safeFallback = Number.isFinite(fallbackNumber)
    ? Math.min(maximum, Math.max(minimum, Math.floor(fallbackNumber)))
    : minimum;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return safeFallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

function parseRetryAfterMs(headers) {
  const retryAfter = headers.get('retry-after');
  if (!retryAfter) return 0;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    return Math.min(maxBatchPauseMs, Math.max(1000, Math.ceil(seconds * 1000)));
  }

  const retryAt = Date.parse(retryAfter);
  if (!Number.isNaN(retryAt)) {
    return Math.min(maxBatchPauseMs, Math.max(1000, retryAt - Date.now()));
  }

  return 0;
}

function makeAbortError(message = 'Automacao interrompida pelo usuario.') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

async function sleepWithSignal(ms, signal) {
  const end = Date.now() + ms;

  while (Date.now() < end) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : makeAbortError();
    }

    await sleep(Math.min(250, end - Date.now()));
  }
}

async function ensureStateDir() {
  await fs.mkdir(stateDir, { recursive: true });
}

function isStaleOutputPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return true;

  const absolute = path.resolve(raw);
  const driveRoot = path.parse(absolute).root;
  if (driveRoot && !existsSync(driveRoot)) return true;

  // O caminho do projeto nunca deve virar armazenamento permanente da instalacao.
  if (isPathInside(packageRoot, absolute)) return true;

  // Compatibilidade com configuracoes antigas que foram copiadas do pacote de desenvolvimento.
  const normalized = absolute.replaceAll('\\', '/').toLowerCase();
  return normalized.includes('/api-danfe/saidas') || normalized.includes('/api-danfe/dados');
}

async function migrateLegacyState() {
  if (path.resolve(legacyStateDir) === path.resolve(stateDir)) return;
  if (!existsSync(legacyStateDir)) return;

  await fs.mkdir(stateDir, { recursive: true });

  for (const fileName of ['config.json', 'processados.json', 'danfe.sqlite', 'danfe.sqlite-wal', 'danfe.sqlite-shm']) {
    const source = path.join(legacyStateDir, fileName);
    const target = path.join(stateDir, fileName);

    if (!existsSync(source) || existsSync(target)) continue;

    try {
      await fs.copyFile(source, target);
    } catch {
      // Um arquivo em uso nao impede o aplicativo de iniciar com o armazenamento novo.
    }
  }
}

function defaultRuntimeSettings() {
  return {
    autoStartWindows: false,
    outputDir: defaultOutputDir,
    batchSize: defaultBatchSize,
    batchIntervalMs: defaultBatchIntervalMs,
    batchPauseMs: defaultBatchPauseMs,
    databaseQueryPeriod: 'month_to_today',
    databaseAutoQuery: false,
    databaseAutoDownload: false,
    databaseAutoIntervalMs: 900000,
    databaseScheduleMode: 'interval',
    databaseScheduledTime: '08:00'
  };
}

function normalizeRuntimeSettings(value = {}) {
  const defaults = defaultRuntimeSettings();
  const requestedOutputDir = String(value.outputDir || '').trim();
  const effectiveOutputDir = !isStaleOutputPath(requestedOutputDir)
    ? requestedOutputDir
    : defaults.outputDir;

  return {
    autoStartWindows: value.autoStartWindows === true,
    outputDir: path.resolve(effectiveOutputDir),
    batchSize: boundedNumber(value.batchSize, defaults.batchSize, 5, maxBatchSize),
    batchIntervalMs: boundedNumber(value.batchIntervalMs, defaults.batchIntervalMs, 500, 10000),
    batchPauseMs: boundedNumber(value.batchPauseMs, defaults.batchPauseMs, 5000, maxBatchPauseMs),
    databaseQueryPeriod: value.databaseQueryPeriod === 'previous_day' ? 'previous_day' : 'month_to_today',
    databaseAutoQuery: value.databaseAutoQuery === true,
    databaseAutoDownload: value.databaseAutoDownload === true && value.databaseAutoQuery === true,
    databaseAutoIntervalMs: boundedNumber(value.databaseAutoIntervalMs, defaults.databaseAutoIntervalMs, 60000, 86400000),
    databaseScheduleMode: value.databaseScheduleMode === 'scheduled_time' ? 'scheduled_time' : 'interval',
    databaseScheduledTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value.databaseScheduledTime || ''))
      ? String(value.databaseScheduledTime)
      : defaults.databaseScheduledTime
  };
}

function openDatabase() {
  if (database) return database;

  database = new DatabaseSync(databaseFile);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS processed_notes (
      chave TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  return database;
}

function readStoredSettings() {
  const row = openDatabase()
    .prepare('SELECT data FROM app_settings WHERE id = 1')
    .get();

  if (!row?.data) return null;

  try {
    return JSON.parse(String(row.data));
  } catch {
    return null;
  }
}

function writeStoredSettings(settings) {
  const normalized = normalizeRuntimeSettings(settings);
  openDatabase()
    .prepare(`
      INSERT INTO app_settings (id, data, updated_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `)
    .run(JSON.stringify(normalized), new Date().toISOString());

  return normalized;
}

function getStartupExecutable() {
  const configured = String(process.env.DANFE_DESKTOP_EXECUTABLE || '').trim();
  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.ProgramFiles || '';
  const candidates = [
    configured,
    programFiles ? path.join(programFiles, 'DANFE Workspace', 'api-danfe-desktop.exe') : '',
    programFiles ? path.join(programFiles, 'DANFE Workspace', 'DANFE Workspace.exe') : '',
    localAppData ? path.join(localAppData, 'DANFE Workspace', 'api-danfe-desktop.exe') : '',
    localAppData ? path.join(localAppData, 'DANFE Workspace', 'DANFE Workspace.exe') : '',
    localAppData ? path.join(localAppData, 'Programs', 'DANFE Workspace', 'DANFE Workspace.exe') : '',
    path.join(packageRoot, 'DESKTOP', 'DANFE-Workspace.exe')
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) || '';
}

async function applyWindowsStartup(enabled) {
  if (process.platform !== 'win32') {
    return { supported: false, applied: false };
  }

  try {
    let registryRoot = 'HKCU';
    let targetUser = '';

    // O backend normalmente roda como LocalSystem. Nesse caso, HKCU seria a
    // conta do servico e nao o usuario que entra no Windows.
    try {
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$user=(Get-CimInstance Win32_ComputerSystem).UserName; if ($user) { $sid=([System.Security.Principal.NTAccount]$user).Translate([System.Security.Principal.SecurityIdentifier]).Value; Write-Output "$sid|$user" }'
      ], { windowsHide: true });
      const [sid, user] = String(stdout || '').trim().split('|');
      if (sid) {
        registryRoot = `HKU\\${sid}`;
        targetUser = user || '';
      }
    } catch {
      // Se nao houver usuario interativo, o fallback HKCU ainda serve para
      // execucoes manuais do backend fora do servico do Windows.
    }

    const registryKey = `${registryRoot}\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`;

    if (enabled) {
      const executable = getStartupExecutable();
      if (!(await fileExists(executable))) {
        return { supported: true, applied: false, reason: 'executavel_nao_encontrado' };
      }

      await execFileAsync('reg.exe', [
        'ADD',
        registryKey,
        '/v',
        windowsStartupName,
        '/t',
        'REG_SZ',
        '/d',
        executable,
        '/f'
      ], { windowsHide: true });
    } else {
      await execFileAsync('reg.exe', [
        'DELETE',
        registryKey,
        '/v',
        windowsStartupName,
        '/f'
      ], { windowsHide: true });
    }

    return { supported: true, applied: true, targetUser };
  } catch (error) {
    return {
      supported: true,
      applied: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

function getPublicRuntimeConfig() {
  return {
    ...runtimeSettings,
    defaultOutputDir,
    configFile,
    processedLogFile,
    databaseFile,
    database: 'SQLite local',
    startupExecutable: getStartupExecutable(),
    pastas: getOutputLayout()
  };
}

function getOutputLayout(baseDir = outputDir) {
  return {
    root: baseDir,
    pdfDir: path.join(baseDir, 'PDF'),
    layoutsDir: path.join(baseDir, '.LAYOUTS'),
    layoutDirs: additionalLayoutDirs(baseDir),
    xmlDir: path.join(baseDir, '.XML'),
    jsonDir: path.join(baseDir, '.JSON')
  };
}

function outputFolderForFile(fileName, baseDir = outputDir) {
  const layout = getOutputLayout(baseDir);
  const ext = path.extname(String(fileName || '')).toLowerCase();

  if (ext === '.pdf') return layout.pdfDir;
  if (ext === '.xml') return layout.xmlDir;
  if (ext === '.json') return layout.jsonDir;

  return layout.root;
}

function outputPathForFile(fileName, baseDir = outputDir) {
  return path.join(outputFolderForFile(fileName, baseDir), path.basename(fileName));
}

function isPathInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function setHiddenDirectory(dirPath) {
  if (process.platform !== 'win32') return;

  try {
    await execFileAsync('attrib', ['+h', dirPath]);
  } catch {
    // A pasta com ponto ja fica discreta em alguns ambientes; no Windows tentamos o atributo Hidden.
  }
}

async function ensureOutputDir() {
  await fs.mkdir(outputDir, { recursive: true });
  const layout = getOutputLayout();
  await Promise.all([
    fs.mkdir(layout.pdfDir, { recursive: true }),
    fs.mkdir(layout.xmlDir, { recursive: true }),
    fs.mkdir(layout.jsonDir, { recursive: true }),
    ...Object.values(layout.layoutDirs).map(directory => fs.mkdir(directory, { recursive: true }))
  ]);
  await Promise.all([
    setHiddenDirectory(layout.xmlDir),
    setHiddenDirectory(layout.jsonDir),
    setHiddenDirectory(layout.layoutsDir)
  ]);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, data) {
  await ensureStateDir();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function organizeOutputFiles() {
  await ensureOutputDir();

  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  let moved = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!['.pdf', '.xml', '.json'].includes(ext)) continue;

    const source = path.join(outputDir, entry.name);
    const target = outputPathForFile(entry.name);

    if (source === target || await fileExists(target)) continue;

    await fs.rename(source, target);
    moved += 1;
  }

  const log = await readProcessedLog();
  const layoutMoves = await migrateLayoutPdfs(outputDir, Object.values(log.itens));
  for (const move of layoutMoves) {
    for (const entry of Object.values(log.itens)) {
      const saved = entry.layoutFiles?.[move.layout];
      if (saved && (saved.arquivo === move.oldName || saved.caminho === move.source)) {
        saved.arquivo = move.name;
        saved.caminho = move.target;
        saved.url = fileUrl(move.name, move.target);
      }
    }
  }
  if (layoutMoves.length) await writeProcessedLog(log);
  moved += layoutMoves.length;

  if (moved > 0) {
    broadcastServiceEvent('arquivos_organizados', {
      movidos: moved,
      pastas: getOutputLayout()
    });
  }

  await refreshProcessedLogPaths();
}

async function loadRuntimeConfig() {
  await ensureStateDir();
  await migrateLegacyState();
  openDatabase();

  const legacyConfig = await readJsonFile(configFile, {});
  const storedSettings = readStoredSettings();
  runtimeSettings = normalizeRuntimeSettings({
    ...defaultRuntimeSettings(),
    ...legacyConfig,
    ...(storedSettings || {})
  });
  writeStoredSettings(runtimeSettings);
  outputDir = runtimeSettings.outputDir;
  await migrateLegacyProcessedLog();
  await organizeOutputFiles();
  await applyWindowsStartup(runtimeSettings.autoStartWindows);

  return getPublicRuntimeConfig();
}

async function saveRuntimeConfig(nextSettings = {}) {
  const requestedOutputDir = String(nextSettings.outputDir || '').trim();

  if (!requestedOutputDir) {
    throw makeHttpError(400, {
      error: 'pasta_invalida',
      message: 'Informe uma pasta de saida valida.'
    });
  }

  const next = normalizeRuntimeSettings({
    ...runtimeSettings,
    ...nextSettings,
    outputDir: requestedOutputDir
  });
  const startup = await applyWindowsStartup(next.autoStartWindows);

  runtimeSettings = next;
  outputDir = next.outputDir;
  await organizeOutputFiles();
  writeStoredSettings(runtimeSettings);
  await writeJsonFile(configFile, {
    ...runtimeSettings,
    defaultOutputDir,
    atualizadoEm: new Date().toISOString()
  });
  startDatabaseAutomation();

  return {
    ...getPublicRuntimeConfig(),
    startup
  };
}

function fileUrl(fileName, filePath = '') {
  if (!fileName) return null;

  const resolvedFile = path.resolve(filePath || outputPathForFile(fileName));

  if (!isPathInside(outputDir, resolvedFile)) return null;

  const relative = path.relative(outputDir, resolvedFile)
    .split(path.sep)
    .map((part) => encodeURIComponent(part))
    .join('/');

  return `/arquivos/${relative}`;
}

function sanitizeUpstreamBody(upstreamBody) {
  if (!upstreamBody || typeof upstreamBody !== 'object' || Array.isArray(upstreamBody)) {
    return upstreamBody;
  }

  const sanitized = { ...upstreamBody };

  if (typeof sanitized.pdf_base64 === 'string') {
    sanitized.pdf_base64 = `[removido: ${sanitized.pdf_base64.length} caracteres]`;
  }

  if (typeof sanitized.xml_base64 === 'string') {
    sanitized.xml_base64 = `[removido: ${sanitized.xml_base64.length} caracteres]`;
  }

  return sanitized;
}

async function readProcessedLog() {
  const rows = openDatabase()
    .prepare('SELECT chave, data, updated_at FROM processed_notes ORDER BY updated_at DESC')
    .all();
  const itens = {};

  for (const row of rows) {
    try {
      const entry = JSON.parse(String(row.data));
      itens[String(row.chave)] = entry;
    } catch {
      // Ignora uma linha corrompida para preservar as demais notas.
    }
  }

  return {
    atualizadoEm: rows[0]?.updated_at || null,
    itens
  };
}

async function writeProcessedLog(log) {
  const itens = log?.itens || {};
  const db = openDatabase();
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM processed_notes');
    const statement = db.prepare(`
      INSERT INTO processed_notes (chave, data, updated_at)
      VALUES (?, ?, ?)
    `);

    for (const [chave, entry] of Object.entries(itens)) {
      statement.run(chave, JSON.stringify(entry), entry?.atualizadoEm || now);
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  // Mantem uma copia legivel para compatibilidade com instalacoes antigas.
  await writeJsonFile(processedLogFile, {
    atualizadoEm: now,
    itens
  });
}

async function migrateLegacyProcessedLog() {
  const row = openDatabase()
    .prepare('SELECT COUNT(*) AS total FROM processed_notes')
    .get();

  if (Number(row?.total || 0) > 0) return;

  const legacy = await readJsonFile(processedLogFile, {});
  const itens = legacy?.itens && typeof legacy.itens === 'object' ? legacy.itens : {};
  if (Object.keys(itens).length) await writeProcessedLog({ itens });
}

async function registerProcessed(entry) {
  const chave = normalizeChave(entry?.chave);

  if (!chave) return null;

  const log = await readProcessedLog();
  const current = log.itens[chave] || {};
  const next = {
    ...current,
    ...entry,
    chave,
    atualizadoEm: new Date().toISOString()
  };

  log.itens[chave] = next;
  await writeProcessedLog(log);

  return next;
}

async function clearProcessedLog() {
  await writeProcessedLog({ itens: {} });

  return {
    ok: true,
    total: 0,
    arquivoLog: processedLogFile
  };
}

async function getProcessedEntry(chave) {
  const log = await readProcessedLog();

  return log.itens[normalizeChave(chave)] || null;
}

async function findExistingLoggedFile(entry, pathKey, fileKey) {
  const candidates = [];

  if (entry?.[pathKey]) candidates.push(path.resolve(entry[pathKey]));
  if (entry?.[fileKey]) {
    candidates.push(outputPathForFile(entry[fileKey]));
    if (entry.pasta) candidates.push(path.resolve(entry.pasta, entry[fileKey]));
    if (entry.pasta) candidates.push(outputPathForFile(entry[fileKey], entry.pasta));
    candidates.push(path.resolve(outputDir, entry[fileKey]));
  }

  for (const candidate of [...new Set(candidates)]) {
    if (await fileExists(candidate)) return candidate;
  }

  return '';
}

async function getProcessedFiles(entry) {
  const [pdfPath, jsonPath, xmlPath] = await Promise.all([
    findExistingLoggedFile(entry, 'caminho', 'arquivo'),
    findExistingLoggedFile(entry, 'jsonCaminho', 'jsonArquivo'),
    findExistingLoggedFile(entry, 'xmlCaminho', 'xmlArquivo')
  ]);

  return {
    pdfPath,
    jsonPath,
    xmlPath
  };
}

async function refreshProcessedLogPaths() {
  const log = await readProcessedLog();
  let changed = false;

  for (const entry of Object.values(log.itens)) {
    const files = await getProcessedFiles(entry);

    if (files.pdfPath && entry.caminho !== files.pdfPath) {
      entry.caminho = files.pdfPath;
      entry.url = fileUrl(entry.arquivo, files.pdfPath);
      changed = true;
    }

    if (files.jsonPath && entry.jsonCaminho !== files.jsonPath) {
      entry.jsonCaminho = files.jsonPath;
      entry.jsonUrl = fileUrl(entry.jsonArquivo, files.jsonPath);
      changed = true;
    }

    if (files.xmlPath && entry.xmlCaminho !== files.xmlPath) {
      entry.xmlCaminho = files.xmlPath;
      entry.xmlUrl = fileUrl(entry.xmlArquivo, files.xmlPath);
      changed = true;
    }
    for (const [type, saved] of Object.entries(entry.layoutFiles || {})) {
      const folder = getOutputLayout().layoutDirs[type];
      if (!folder || !saved.arquivo) continue;
      const candidate = path.join(folder, path.basename(saved.arquivo));
      if (candidate !== saved.caminho && await fileExists(candidate)) {
        saved.caminho = candidate;
        saved.url = fileUrl(saved.arquivo, candidate);
        changed = true;
      }
    }
  }

  if (changed) await writeProcessedLog(log);
}

const savedLayoutLabels = {
  danfe: 'DANFE',
  simplificado: 'DANFE Simplificado',
  etiqueta: 'DANFE Etiqueta',
  varejo: 'DANFE Cupom Varejo'
};

function getSavedLayoutInfo(entry, filePath) {
  const resolvedPath = path.resolve(filePath);
  if (entry?.caminho && path.resolve(entry.caminho) === resolvedPath) {
    return { layout: 'danfe', label: savedLayoutLabels.danfe };
  }

  for (const [layout, savedFile] of Object.entries(entry?.layoutFiles || {})) {
    if (savedFile?.caminho && path.resolve(savedFile.caminho) === resolvedPath) {
      return {
        layout,
        label: savedFile.label || savedLayoutLabels[layout] || layout
      };
    }
  }

  return null;
}

async function listSavedPdfs() {
  await ensureOutputDir();
  const layout = getOutputLayout();
  const processedLog = await readProcessedLog();
  const processedEntries = Object.values(processedLog.itens || {});
  const entries = await listOutputPdfs(outputDir);
  const files = await Promise.all(
    entries
      .map(async (entry) => {
        const filePath = entry.filePath;
        const parentName = originalPdfName(entry.name, entry.layout);
        const baseName = parentName.replace(/\.pdf$/i, '');
        const metadata = processedEntries.find((item) => {
          if (item?.caminho && path.resolve(item.caminho) === path.resolve(filePath)) return true;
          if (Object.values(item?.layoutFiles || {}).some((savedFile) => savedFile?.caminho && path.resolve(savedFile.caminho) === path.resolve(filePath))) return true;
          return item?.arquivo === entry.name;
        }) || processedEntries.find(item => item.arquivo === parentName);
        const layoutInfo = getSavedLayoutInfo(metadata, filePath) || { layout: entry.layout, label: savedLayoutLabels[entry.layout] };
        const isOriginalLayout = layoutInfo.layout === 'danfe';
        const xmlArquivo = isOriginalLayout ? (metadata?.xmlArquivo || `${baseName}.xml`) : null;
        const jsonArquivo = isOriginalLayout ? (metadata?.jsonArquivo || `${baseName}.json`) : null;
        const defaultXmlPath = isOriginalLayout ? path.join(layout.xmlDir, xmlArquivo) : null;
        const defaultJsonPath = isOriginalLayout ? path.join(layout.jsonDir, jsonArquivo) : null;
        const xmlPath = isOriginalLayout
          ? (metadata?.xmlCaminho && await fileExists(metadata.xmlCaminho) ? metadata.xmlCaminho : defaultXmlPath)
          : null;
        const jsonPath = isOriginalLayout
          ? (metadata?.jsonCaminho && await fileExists(metadata.jsonCaminho) ? metadata.jsonCaminho : defaultJsonPath)
          : null;
        const jsonMetadata = await readJsonFile(jsonPath || path.join(layout.jsonDir, `${baseName}.json`), null);
        const [stat, temXml, temJson] = await Promise.all([
          fs.stat(filePath),
          xmlPath ? fileExists(xmlPath) : false,
          jsonPath ? fileExists(jsonPath) : false
        ]);

        return {
          arquivo: entry.name,
          caminho: filePath,
          chave: metadata?.chave || jsonMetadata?.chave || null,
          numero: metadata?.numero || jsonMetadata?.numero || null,
          nome: metadata?.nome || jsonMetadata?.nome || null,
          tipo: metadata?.tipo || jsonMetadata?.tipo || null,
          layout: layoutInfo.layout,
          layoutLabel: layoutInfo.label,
          bytes: stat.size,
          criadoEm: stat.birthtime.toISOString(),
          atualizadoEm: stat.mtime.toISOString(),
          url: fileUrl(entry.name, filePath),
          xmlArquivo: temXml ? xmlArquivo : null,
          xmlCaminho: temXml ? xmlPath : null,
          xmlUrl: temXml ? fileUrl(xmlArquivo, xmlPath) : null,
          temXml,
          jsonArquivo: temJson ? jsonArquivo : null,
          jsonCaminho: temJson ? jsonPath : null,
          jsonUrl: temJson ? fileUrl(jsonArquivo, jsonPath) : null,
          temJson
        };
      })
  );

  return files.sort((a, b) => new Date(b.atualizadoEm) - new Date(a.atualizadoEm));
}

async function findSavedEntryByChave(chave) {
  const files = await listSavedPdfs();
  const file = files.find((item) => item.layout === 'danfe' && item.chave === chave);

  if (!file) return null;

  return {
    status: 'salvo',
    chave: file.chave,
    numero: file.numero,
    nome: file.nome,
    tipo: file.tipo,
    arquivo: file.arquivo,
    caminho: file.caminho,
    xmlArquivo: file.xmlArquivo,
    xmlCaminho: file.xmlCaminho,
    jsonArquivo: file.jsonArquivo,
    jsonCaminho: file.jsonCaminho,
    pasta: outputDir,
    url: file.url,
    xmlUrl: file.xmlUrl,
    jsonUrl: file.jsonUrl
  };
}

async function consultaSalvarPdf({ chave, numero, nome, emitente, razaoSocial, forcar = false, signal }) {
  const normalizedChave = normalizeChave(chave);
  const numeroInformado = safeFilePart(numero, '');
  const nomeInformado = safeFilePart(nome || emitente || razaoSocial, '');

  if (!isValidChaveShape(normalizedChave)) {
    throw makeHttpError(400, {
      error: 'chave_invalida',
      message: 'Informe uma chave de acesso com 44 caracteres alfanumericos.'
    });
  }

  const previous = await getProcessedEntry(normalizedChave) || await findSavedEntryByChave(normalizedChave);

  if (previous && !forcar) {
    const processedFiles = await getProcessedFiles(previous);

    if (processedFiles.pdfPath && processedFiles.jsonPath) {
      const result = {
        ...previous,
        status: 'ja_processado',
        baixado: false,
        pulado: true,
        pasta: previous.pasta || path.dirname(processedFiles.pdfPath),
        caminho: processedFiles.pdfPath,
        jsonCaminho: processedFiles.jsonPath,
        xmlCaminho: processedFiles.xmlPath || previous.xmlCaminho || null,
        url: fileUrl(previous.arquivo, processedFiles.pdfPath),
        jsonUrl: fileUrl(previous.jsonArquivo, processedFiles.jsonPath),
        xmlUrl: processedFiles.xmlPath ? fileUrl(previous.xmlArquivo, processedFiles.xmlPath) : null
      };

      broadcastServiceEvent('arquivo_pulado', result);
      return result;
    }
  }

  const rede = await ensureNetworkAvailable();
  if (!rede.online) {
    throw makeHttpError(503, networkUnavailablePayload(rede));
  }

  const upstream = await fetchConsultaWithRetry(normalizedChave, signal);

  const contentType = upstream.headers.get('content-type') || '';
  const upstreamBody = contentType.includes('application/json')
    ? await upstream.json()
    : await upstream.text();

  if (!upstream.ok) {
    throw makeHttpError(upstream.status, {
      error: upstream.headers.get('x-error-code') || upstreamBody?.error || 'consulta_falhou',
      message: upstreamBody?.message || `Consulta DANFE retornou HTTP ${upstream.status}`,
      upstream: upstreamBody
    });
  }

  if (!upstreamBody?.pdf_base64) {
    throw makeHttpError(502, {
      error: 'pdf_ausente',
      message: 'A consulta retornou sucesso, mas nao trouxe pdf_base64.'
    });
  }

  const xmlText = upstreamBody.xml_base64
    ? Buffer.from(upstreamBody.xml_base64, 'base64').toString('utf8')
    : '';
  const xmlInfo = xmlText ? extractNfeInfoFromXml(xmlText) : { numero: '', nome: '' };
  const resolvedNumero = numeroInformado || xmlInfo.numero || numeroFromChave(normalizedChave);
  const resolvedNome = nomeInformado || xmlInfo.nome || 'DANFE';
  const baseArquivo = buildBaseFileName({
    numero: resolvedNumero,
    nome: resolvedNome,
    chave: normalizedChave
  });
  const arquivo = `${baseArquivo}.pdf`;
  const xmlArquivo = xmlText ? `${baseArquivo}.xml` : null;
  const jsonArquivo = `${baseArquivo}.json`;
  const caminho = outputPathForFile(arquivo);
  const xmlCaminho = xmlArquivo ? outputPathForFile(xmlArquivo) : null;
  const jsonCaminho = outputPathForFile(jsonArquivo);
  const pdfBuffer = Buffer.from(upstreamBody.pdf_base64, 'base64');

  if (!pdfBuffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw makeHttpError(502, {
      error: 'pdf_invalido',
      message: 'O arquivo retornado nao parece ser um PDF valido.'
    });
  }

  await ensureOutputDir();
  await fs.writeFile(caminho, pdfBuffer);
  if (xmlText && xmlCaminho) await fs.writeFile(xmlCaminho, xmlText, 'utf8');

  const jsonPayload = {
    status: 'salvo',
    chave: normalizedChave,
    numero: resolvedNumero,
    nome: resolvedNome,
    tipo: upstreamBody.tipo,
    consultaEm: new Date().toISOString(),
    arquivos: {
      pdf: path.relative(outputDir, caminho),
      xml: xmlCaminho ? path.relative(outputDir, xmlCaminho) : null,
      json: path.relative(outputDir, jsonCaminho)
    },
    upstream: sanitizeUpstreamBody(upstreamBody)
  };
  const jsonBuffer = Buffer.from(JSON.stringify(jsonPayload, null, 2), 'utf8');
  await fs.writeFile(jsonCaminho, jsonBuffer);

  const result = {
    status: 'salvo',
    chave: normalizedChave,
    numero: resolvedNumero,
    nome: resolvedNome,
    tipo: upstreamBody.tipo,
    arquivo,
    caminho,
    xmlArquivo,
    xmlCaminho,
    jsonArquivo,
    jsonCaminho,
    pasta: outputDir,
    pastas: getOutputLayout(),
    bytes: pdfBuffer.length,
    xmlBytes: xmlText ? Buffer.byteLength(xmlText, 'utf8') : 0,
    jsonBytes: jsonBuffer.length,
    url: fileUrl(arquivo, caminho),
    xmlUrl: xmlArquivo ? fileUrl(xmlArquivo, xmlCaminho) : null,
    jsonUrl: fileUrl(jsonArquivo, jsonCaminho),
    sobrescrito: true,
    salvoEm: new Date().toISOString()
  };

  await registerProcessed(result);
  broadcastServiceEvent('arquivo_salvo', result);

  return result;
}

const savedLayoutDefinitions = {
  simplificado: {
    endpoint: 'xml-to-simplified',
    suffix: 'DANFE Simplificado',
    label: savedLayoutLabels.simplificado
  },
  etiqueta: {
    endpoint: 'xml-to-label',
    suffix: 'DANFE Etiqueta',
    label: savedLayoutLabels.etiqueta
  },
  varejo: {
    endpoint: 'xml-to-retail',
    suffix: 'DANFE Cupom Varejo',
    label: savedLayoutLabels.varejo
  }
};

async function generateSavedLayout({ chave, layout }) {
  const normalizedChave = normalizeChave(chave);
  const definition = savedLayoutDefinitions[layout];

  if (!definition) {
    throw makeHttpError(400, {
      error: 'layout_invalido',
      message: 'Escolha um layout valido: simplificado, etiqueta ou varejo.'
    });
  }

  if (!isValidChaveShape(normalizedChave)) {
    throw makeHttpError(400, {
      error: 'chave_invalida',
      message: 'Informe uma chave de acesso com 44 caracteres alfanumericos.'
    });
  }

  if (!meudanfeApiKey) {
    throw makeHttpError(503, {
      error: 'meudanfe_nao_configurado',
      message: 'Configure MEUDANFE_API_KEY no .env do backend para gerar layouts adicionais.'
    });
  }

  const previous = await getProcessedEntry(normalizedChave) || await findSavedEntryByChave(normalizedChave);
  const xmlPath = previous?.xmlCaminho || (previous?.xmlArquivo ? outputPathForFile(previous.xmlArquivo) : null);

  if (!previous || !xmlPath || !isPathInside(outputDir, path.resolve(xmlPath)) || !(await fileExists(xmlPath))) {
    throw makeHttpError(409, {
      error: 'xml_nao_encontrado',
      message: 'O XML desta nota nao esta salvo localmente para gerar outro layout.'
    });
  }

  const xmlText = await fs.readFile(xmlPath, 'utf8');
  // Conversao gratuita por envio do XML. A chave acima so localiza o arquivo local;
  // nao consultar /fd/add/{chave} nem buscar a nota quando o XML estiver ausente.
  const upstream = await fetchWithTimeout(`${meudanfeApiBase}/fd/convert/${definition.endpoint}`, {
    method: 'POST',
    headers: {
      'Api-Key': meudanfeApiKey,
      'content-type': 'text/plain; charset=utf-8',
      accept: 'application/json'
    },
    body: xmlText
  });
  const upstreamBody = await upstream.json().catch(() => ({}));

  if (!upstream.ok) {
    throw makeHttpError(upstream.status, {
      error: 'falha_geracao_layout',
      message: upstreamBody?.message || `O MeuDanfe retornou HTTP ${upstream.status}.`
    });
  }

  if (typeof upstreamBody?.data !== 'string' || !upstreamBody.data.trim()) {
    throw makeHttpError(502, {
      error: 'pdf_layout_invalido',
      message: 'O servidor de layout nao retornou um PDF valido.'
    });
  }

  const pdfBuffer = Buffer.from(upstreamBody.data, 'base64');
  if (!pdfBuffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw makeHttpError(502, {
      error: 'pdf_layout_invalido',
      message: 'O arquivo retornado para este layout nao parece ser um PDF valido.'
    });
  }

  const originalBaseName = path.basename(previous.arquivo || path.basename(previous.caminho || normalizedChave), '.pdf');
  const arquivo = `${originalBaseName} - ${definition.suffix}.pdf`;
  const caminho = path.join(getOutputLayout().layoutDirs[layout], arquivo);
  await ensureOutputDir();
  await fs.writeFile(caminho, pdfBuffer);

  const layoutFiles = {
    ...(previous.layoutFiles || {}),
    [layout]: {
      layout,
      label: definition.label,
      arquivo,
      caminho,
      bytes: pdfBuffer.length,
      url: fileUrl(arquivo, caminho),
      salvoEm: new Date().toISOString()
    }
  };
  await registerProcessed({ ...previous, chave: normalizedChave, layoutFiles });

  const result = {
    ok: true,
    chave: normalizedChave,
    numero: previous.numero || null,
    nome: previous.nome || null,
    layout,
    layoutLabel: definition.label,
    arquivo,
    caminho,
    bytes: pdfBuffer.length,
    url: fileUrl(arquivo, caminho),
    salvoEm: new Date().toISOString()
  };

  broadcastServiceEvent('layout_salvo', result);
  return result;
}

function copyUsefulHeaders(source, target) {
  const headers = [
    'content-disposition',
    'x-error-code',
    'x-xml-recovery',
    'x-chave-recuperada',
    'x-envelope-origem',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'retry-after'
  ];

  for (const header of headers) {
    const value = source.headers.get(header);
    if (value) target.setHeader(header, value);
  }
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const externalSignal = options?.signal;
  const abortFromExternal = () => controller.abort(externalSignal.reason);

  if (externalSignal?.aborted) {
    controller.abort(externalSignal.reason);
  } else if (externalSignal) {
    externalSignal.addEventListener('abort', abortFromExternal, { once: true });
  }

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
    if (externalSignal) externalSignal.removeEventListener('abort', abortFromExternal);
  }
}

async function fetchConsultaWithRetry(chave, signal) {
  const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const upstream = await fetchWithTimeout(`${danfeApiBase}/consulta`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json'
      },
      signal,
      body: JSON.stringify({ chave, format: 'json' })
    });

    if (!retryableStatuses.has(upstream.status) || attempt >= maxRetries) {
      return upstream;
    }

    const retryAfterMs = parseRetryAfterMs(upstream.headers)
      || Math.min(maxBatchPauseMs, 5000 * (attempt + 1));

    broadcastServiceEvent('consulta_retentativa', {
      chave,
      tentativa: attempt + 1,
      maxTentativas: maxRetries + 1,
      statusHttp: upstream.status,
      aguardarMs: retryAfterMs
    });

    await sleepWithSignal(retryAfterMs, signal);
  }

  throw new Error('Nao foi possivel repetir a consulta.');
}

async function sendUpstreamResponse(upstream, res) {
  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  const body = Buffer.from(await upstream.arrayBuffer());

  copyUsefulHeaders(upstream, res);
  res.status(upstream.status);
  res.setHeader('content-type', contentType);

  if (!upstream.ok) {
    if (contentType.includes('application/json')) {
      return res.send(body);
    }

    return res.json({
      error: upstream.headers.get('x-error-code') || 'upstream_error',
      message: body.toString('utf8') || `Consulta DANFE retornou HTTP ${upstream.status}`
    });
  }

  return res.send(body);
}

function endpointForVariant(variant) {
  switch (variant) {
    case 'etiqueta':
      return `${danfeApiBase}/danfe/etiqueta`;
    case 'simplificado':
      return `${danfeApiBase}/danfe/simplificado`;
    case 'etiqueta-html':
      return `${danfeApiBase}/danfe/etiqueta-html`;
    default:
      return `${danfeApiBase}/danfe`;
  }
}

app.get(/^\/arquivos\/(.+)$/, (req, res, next) => {
  const relativePath = String(req.params[0] || '')
    .split('/')
    .map((part) => decodeURIComponent(part))
    .join(path.sep);

  if (!relativePath) return res.status(404).end();

  const filePath = path.resolve(outputDir, relativePath);

  if (!isPathInside(outputDir, filePath)) {
    return res.status(400).json({
      error: 'arquivo_invalido',
      message: 'Nome de arquivo invalido.'
    });
  }

  return fs.readFile(filePath)
    .then((content) => {
      if (req.query.download === '1') res.attachment(path.basename(filePath));
      res.type(path.extname(filePath));
      res.send(content);
    })
    .catch(next);
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'api-danfe-local',
    upstream: danfeApiBase,
    outputDir,
    defaultOutputDir,
    pastas: getOutputLayout(),
    rede: publicNetworkStatus(),
    banco: publicDatabaseStatus(),
    bancoAutomacao: publicDatabaseAutomationState(),
    time: new Date().toISOString()
  });
});

app.get('/api/microservico/rede/status', async (_req, res) => {
  const rede = await probeNetwork();
  return res.json({ ok: true, ...rede });
});

app.get('/api/microservico/banco/status', async (_req, res) => {
  const banco = await probeDatabase();
  return res.json({ ok: true, ...banco });
});

app.get('/api/microservico/banco/automacao', (_req, res) => {
  return res.json({
    ok: true,
    automacao: publicDatabaseAutomationState()
  });
});

app.post('/api/microservico/banco/interromper', (_req, res) => {
  return res.json(requestDatabaseAutomationStop());
});

app.get('/api/microservico/banco/notas', async (_req, res) => {
  try {
    const notas = await queryNfeIdist();
    return res.json({
      ok: true,
      total: notas.length,
      banco: publicDatabaseStatus(),
      notas
    });
  } catch (error) {
    if (error?.status && error?.payload) return res.status(error.status).json(error.payload);

    return res.status(502).json({
      error: 'falha_consulta_banco',
      message: 'Nao foi possivel consultar as notas no banco SQL Server.'
    });
  }
});

app.get('/api/dev/release/status', async (_req, res) => {
  if (!developmentMode) {
    return res.json({ enabled: false });
  }

  try {
    const releases = await listPublishedReleases();
    const { endpoint } = await getReleaseStorage();
    return res.json({
      enabled: true,
      bucket: releaseBucket,
      prefix: releasePrefix,
      endpoint,
      releases
    });
  } catch (error) {
    if (error?.status && error?.payload) return res.status(error.status).json(error.payload);
    return res.status(502).json({
      error: 'falha_status_release',
      message: 'Nao foi possivel consultar o servidor de releases.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post('/api/dev/release/publish', releaseUpload.fields([
  { name: 'installer', maxCount: 1 },
  { name: 'signature', maxCount: 1 }
]), async (req, res) => {
  try {
    requireDevelopmentMode();
    const files = req.files || {};
    const installer = files.installer?.[0];
    const signature = files.signature?.[0];
    const result = await publishRelease({
      version: req.body?.version,
      notes: req.body?.notes,
      installer,
      signature
    });

    return res.json({
      ok: true,
      message: `Versao ${result.version} publicada com sucesso.`,
      ...result,
      releases: await listPublishedReleases()
    });
  } catch (error) {
    if (error?.status && error?.payload) return res.status(error.status).json(error.payload);
    return res.status(502).json({
      error: 'falha_publicar_release',
      message: 'Nao foi possivel publicar a versao no servidor de releases.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/microservico/config', (_req, res) => {
  res.json({
    ok: true,
    ...getPublicRuntimeConfig()
  });
});

app.post('/api/microservico/config', async (req, res) => {
  try {
    const pasta = String(req.body?.outputDir || '').trim();

    if (!pasta) {
      return res.status(400).json({
        error: 'pasta_obrigatoria',
        message: 'Informe a pasta de saida padrao.'
      });
    }

    const config = await saveRuntimeConfig({
      outputDir: pasta,
      autoStartWindows: typeof req.body?.autoStartWindows === 'boolean'
        ? req.body.autoStartWindows
        : runtimeSettings.autoStartWindows,
      batchSize: req.body?.batchSize,
      batchIntervalMs: req.body?.batchIntervalMs,
      batchPauseMs: req.body?.batchPauseMs,
      databaseQueryPeriod: req.body?.databaseQueryPeriod,
      databaseAutoQuery: req.body?.databaseAutoQuery,
      databaseAutoDownload: req.body?.databaseAutoDownload,
      databaseAutoIntervalMs: req.body?.databaseAutoIntervalMs,
      databaseScheduleMode: req.body?.databaseScheduleMode,
      databaseScheduledTime: req.body?.databaseScheduledTime
    });
    broadcastServiceEvent('config_atualizada', {
      ...config
    });

    return res.json({
      ok: true,
      ...config
    });
  } catch (error) {
    if (error?.status && error?.payload) return res.status(error.status).json(error.payload);

    return res.status(500).json({
      error: 'falha_config',
      message: 'Nao foi possivel salvar as configuracoes.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/microservico/config/exportar', (_req, res) => {
  res.setHeader('content-disposition', 'attachment; filename="danfe-configuracoes.json"');
  res.json({
    formato: 'danfe-configuracoes',
    versao: 1,
    exportadoEm: new Date().toISOString(),
    configuracoes: getPublicRuntimeConfig()
  });
});

app.post('/api/microservico/config/importar', async (req, res) => {
  try {
    const imported = req.body?.configuracoes || req.body || {};
    const config = await saveRuntimeConfig({
      outputDir: imported.outputDir,
      autoStartWindows: imported.autoStartWindows === true,
      batchSize: imported.batchSize,
      batchIntervalMs: imported.batchIntervalMs,
      batchPauseMs: imported.batchPauseMs,
      databaseQueryPeriod: imported.databaseQueryPeriod,
      databaseAutoQuery: imported.databaseAutoQuery,
      databaseAutoDownload: imported.databaseAutoDownload,
      databaseAutoIntervalMs: imported.databaseAutoIntervalMs,
      databaseScheduleMode: imported.databaseScheduleMode,
      databaseScheduledTime: imported.databaseScheduledTime
    });

    broadcastServiceEvent('config_atualizada', { ...config, importada: true });
    return res.json({ ok: true, importada: true, ...config });
  } catch (error) {
    if (error?.status && error?.payload) return res.status(error.status).json(error.payload);

    return res.status(400).json({
      error: 'falha_importar_config',
      message: 'O arquivo de configuracoes nao e valido.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/microservico/processados', async (_req, res) => {
  try {
    const log = await readProcessedLog();
    const itens = Object.values(log.itens)
      .sort((a, b) => new Date(b.atualizadoEm || b.salvoEm || 0) - new Date(a.atualizadoEm || a.salvoEm || 0));

    return res.json({
      ok: true,
      total: itens.length,
      atualizadoEm: log.atualizadoEm,
      arquivoLog: processedLogFile,
      itens
    });
  } catch (error) {
    return res.status(500).json({
      error: 'falha_log_processados',
      message: 'Nao foi possivel ler o log de processados.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.delete('/api/microservico/processados', async (_req, res) => {
  try {
    const result = await clearProcessedLog();
    broadcastServiceEvent('log_processados_limpo', result);

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: 'falha_limpar_log',
      message: 'Nao foi possivel limpar o log de processados.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post('/api/consulta', async (req, res) => {
  const chave = normalizeChave(req.body?.chave);
  const format = req.body?.format === 'pdf' ? 'pdf' : 'json';

  if (!isValidChaveShape(chave)) {
    return res.status(400).json({
      error: 'chave_invalida',
      message: 'Informe uma chave de acesso com 44 caracteres alfanumericos.'
    });
  }

  try {
    const upstream = await fetchWithTimeout(`${danfeApiBase}/consulta`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: format === 'pdf' ? 'application/pdf' : 'application/json'
      },
      body: JSON.stringify({ chave, format })
    });

    return sendUpstreamResponse(upstream, res);
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    return res.status(aborted ? 504 : 502).json({
      error: aborted ? 'upstream_timeout' : 'upstream_network_error',
      message: aborted
        ? 'A consulta demorou demais para responder.'
        : 'Nao foi possivel conectar na API do Consulta DANFE.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/microservico/arquivos', async (_req, res) => {
  try {
    const [arquivos, log] = await Promise.all([
      listSavedPdfs(),
      readProcessedLog()
    ]);
    return res.json({
      ok: true,
      pasta: outputDir,
      pastas: getOutputLayout(),
      total: arquivos.length,
      processados: Object.keys(log.itens).length,
      logAtualizadoEm: log.atualizadoEm,
      arquivos
    });
  } catch (error) {
    return res.status(500).json({
      error: 'falha_listagem',
      message: 'Nao foi possivel listar os arquivos salvos.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get('/api/microservico/eventos', (req, res) => {
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true);
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'transfer-encoding': 'chunked',
    'x-accel-buffering': 'no'
  });

  eventClients.add(res);
  res.write(': conectado\n\n');
  res.write(`event: conectado\ndata: ${JSON.stringify({
    status: 'conectado',
    rede: publicNetworkStatus(),
    banco: publicDatabaseStatus(),
    bancoAutomacao: publicDatabaseAutomationState(),
    at: new Date().toISOString()
  })}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: ${JSON.stringify({
      status: 'online',
      at: new Date().toISOString()
    })}\n\n`);
  }, 25000);

  res.on('close', () => {
    clearInterval(heartbeat);
    eventClients.delete(res);
  });
});

app.post('/api/microservico/consulta-salvar', async (req, res) => {
  try {
    const result = await consultaSalvarPdf(req.body || {});
    return res.json(result);
  } catch (error) {
    return sendServiceError(error, res, 'Nao foi possivel consultar e salvar o PDF.');
  }
});

app.post('/api/microservico/arquivos/layout', async (req, res) => {
  try {
    const result = await generateSavedLayout({
      chave: req.body?.chave,
      layout: req.body?.layout
    });
    return res.json(result);
  } catch (error) {
    return sendServiceError(error, res, 'Nao foi possivel gerar o layout solicitado.');
  }
});

app.post('/api/microservico/parse-texto', (req, res) => {
  const parsed = parseNotasText(req.body?.texto);

  return res.json({
    ok: true,
    ...parsed
  });
});

app.get('/api/microservico/extensao/pendente', (_req, res) => {
  return res.json({
    ok: true,
    pendente: extensionPendingCapture
  });
});

app.post('/api/microservico/extensao/receber', (req, res) => {
  const text = String(req.body?.texto || '').replace(/^\uFEFF/, '').trim();
  const parsed = parseNotasText(text);

  if (!text || !parsed.validas) {
    return res.status(400).json({
      error: 'texto_sem_notas_validas',
      message: 'O texto recebido da extensao nao contem uma chave NF-e valida.'
    });
  }

  extensionPendingCapture = makeExtensionCapture(text, req.body?.source || {}, {
    somenteSelecionadas: req.body?.somenteSelecionadas,
    intervaloMs: req.body?.intervaloMs
  });

  broadcastServiceEvent('extensao_texto_detectado', extensionPendingCapture);

  return res.json({
    ok: true,
    status: 'aguardando_confirmacao_no_app',
    pendente: extensionPendingCapture
  });
});

app.delete('/api/microservico/extensao/pendente', (_req, res) => {
  const previous = extensionPendingCapture;
  extensionPendingCapture = null;
  return res.json({
    ok: true,
    removido: Boolean(previous)
  });
});

app.get('/api/microservico/automacao', (_req, res) => {
  res.json({
    ok: true,
    automacao: publicAutomationState()
  });
});

app.post('/api/microservico/interromper', (_req, res) => {
  res.json(requestAutomationStop());
});

app.post('/api/microservico/processar-texto', async (req, res) => {
  if (automationState.running) {
    return res.status(409).json({
      error: 'automacao_em_andamento',
      message: 'Ja existe uma automacao em andamento.',
      automacao: publicAutomationState()
    });
  }

  const rede = await ensureNetworkAvailable();
  if (!rede.online) {
    return res.status(503).json(networkUnavailablePayload(rede));
  }

  const parsed = parseNotasText(req.body?.texto);
  const somenteSelecionadas = req.body?.somenteSelecionadas !== false;
  const filasDisponiveis = parsed.linhas
    .filter((linha) => linha.valida)
    .filter((linha) => !somenteSelecionadas || linha.selecionado === true);
  const intervaloMs = boundedNumber(
    req.body?.intervaloMs,
    runtimeSettings.batchIntervalMs,
    500,
    10000
  );
  const automaticBatchSize = filasDisponiveis.length >= 200
    ? Math.min(runtimeSettings.batchSize, 20)
    : runtimeSettings.batchSize;
  const automaticBatchPauseMs = filasDisponiveis.length >= 200
    ? Math.max(runtimeSettings.batchPauseMs, 20000)
    : runtimeSettings.batchPauseMs;
  const tamanhoBloco = boundedNumber(
    req.body?.tamanhoBloco ?? req.body?.bloco,
    automaticBatchSize,
    5,
    maxBatchSize
  );
  const pausaBlocoMs = boundedNumber(
    req.body?.pausaBlocoMs,
    automaticBatchPauseMs,
    5000,
    maxBatchPauseMs
  );
  const limiteInformado = Number(req.body?.limite);
  const limite = Number.isFinite(limiteInformado) && limiteInformado > 0
    ? Math.min(Math.floor(limiteInformado), 5000)
    : filasDisponiveis.length;
  const filas = filasDisponiveis.slice(0, limite);
  const limitado = filas.length < filasDisponiveis.length;
  const totalBlocos = filas.length ? Math.ceil(filas.length / tamanhoBloco) : 0;
  const resultados = [];
  const message = !filas.length && somenteSelecionadas
    ? 'Texto lido, mas nenhuma linha esta marcada como True para processamento.'
    : !filas.length
      ? 'Texto lido, mas nenhuma linha valida foi encontrada para processamento.'
      : limitado
        ? `Processando ${filas.length} de ${filasDisponiveis.length} linhas por limite informado.`
      : totalBlocos > 1
        ? `Processando em ${totalBlocos} blocos de ate ${tamanhoBloco} notas, com pausas automaticas.`
        : null;

  startAutomation(filas.length);

  broadcastServiceEvent('lote_inicio', {
    runId: automationState.runId,
    totalLido: parsed.total,
    totalValido: parsed.validas,
    totalSelecionado: parsed.selecionadas,
    totalDisponivel: filasDisponiveis.length,
    totalProcessar: filas.length,
    limite,
    limitado,
    tamanhoBloco,
    totalBlocos,
    intervaloMs,
    pausaBlocoMs,
    somenteSelecionadas,
    message
  });

  try {
    for (let index = 0; index < filas.length; index += 1) {
      if (automationState.stopRequested) break;

      const linha = filas[index];
      automationState.current = index + 1;

      try {
        const salvo = await consultaSalvarPdf({
          chave: linha.chave,
          numero: linha.numero,
          nome: linha.nome,
          signal: automationState.controller.signal
        });
        const statusLinha = salvo.status === 'ja_processado' ? 'pulado' : 'salvo';
        resultados.push({
          linha: linha.linha,
          status: statusLinha,
          arquivo: salvo.arquivo,
          caminho: salvo.caminho,
          xmlArquivo: salvo.xmlArquivo,
          jsonArquivo: salvo.jsonArquivo,
          bytes: salvo.bytes,
          chave: linha.chave,
          numero: linha.numero,
          nome: linha.nome
        });
        broadcastServiceEvent('lote_item', {
          atual: index + 1,
          total: filas.length,
          linha: linha.linha,
          status: statusLinha,
          arquivo: salvo.arquivo,
          chave: linha.chave,
          numero: linha.numero,
          nome: linha.nome
        });
      } catch (error) {
        if (automationState.stopRequested) {
          resultados.push({
            linha: linha.linha,
            status: 'interrompido',
            chave: linha.chave,
            numero: linha.numero,
            nome: linha.nome,
            message: 'Automacao interrompida pelo usuario.'
          });
          broadcastServiceEvent('lote_item', {
            atual: index + 1,
            total: filas.length,
            linha: linha.linha,
            status: 'interrompido',
            chave: linha.chave,
            numero: linha.numero,
            nome: linha.nome,
            message: 'Automacao interrompida pelo usuario.'
          });
          break;
        }

        resultados.push({
          linha: linha.linha,
          status: 'falha',
          chave: linha.chave,
          numero: linha.numero,
          nome: linha.nome,
          error: error?.payload?.error || error?.message || 'erro',
          message: error?.payload?.message || (error instanceof Error ? error.message : String(error))
        });
        broadcastServiceEvent('lote_item', {
          atual: index + 1,
          total: filas.length,
          linha: linha.linha,
          status: 'falha',
          chave: linha.chave,
          numero: linha.numero,
          nome: linha.nome,
          error: error?.payload?.error || error?.message || 'erro',
          message: error?.payload?.message || (error instanceof Error ? error.message : String(error))
        });
      }

      if (index < filas.length - 1) {
        const terminouBloco = (index + 1) % tamanhoBloco === 0;
        const esperaMs = terminouBloco ? pausaBlocoMs : intervaloMs;

        if (terminouBloco) {
          broadcastServiceEvent('lote_pausa', {
            runId: automationState.runId,
            atual: index + 1,
            total: filas.length,
            blocoConcluido: Math.ceil((index + 1) / tamanhoBloco),
            totalBlocos,
            aguardarMs: esperaMs,
            message: `Bloco concluido. Aguardando ${Math.ceil(esperaMs / 1000)}s antes do proximo.`
          });
        }

        const keepGoing = await sleepWithStop(esperaMs);
        if (!keepGoing) break;
      }
    }
  } finally {
    // O snapshot abaixo e usado para montar a resposta antes de limpar o estado global.
  }

  const interrompido = automationState.stopRequested;
  const salvos = resultados.filter((resultado) => resultado.status === 'salvo').length;
  const pulados = resultados.filter((resultado) => resultado.status === 'pulado').length;
  const falhas = resultados.filter((resultado) => resultado.status === 'falha').length;
  const interrompidos = resultados.filter((resultado) => resultado.status === 'interrompido').length;
  const response = {
    status: interrompido ? 'interrompido' : 'concluido',
    pasta: outputDir,
    pastas: getOutputLayout(),
    totalLido: parsed.total,
    totalValido: parsed.validas,
    totalSelecionado: parsed.selecionadas,
    totalDisponivel: filasDisponiveis.length,
    totalProcessado: resultados.length,
    salvos,
    pulados,
    falhas,
    interrompidos,
    limite,
    limitado,
    tamanhoBloco,
    totalBlocos,
    intervaloMs,
    pausaBlocoMs,
    somenteSelecionadas,
    message: interrompido
      ? `Automacao interrompida: ${salvos} salvo(s), ${pulados} ja processado(s), ${falhas} falha(s).`
      : message || `${salvos} salvo(s), ${pulados} ja processado(s), ${falhas} falha(s)`,
    resultados
  };

  broadcastServiceEvent('lote_fim', response);
  finishAutomation();

  return res.json(response);
});

async function handleXmlProxy(req, res, variant = 'danfe') {
  const files = req.files || (req.file ? [req.file] : []);

  if (!files.length) {
    return res.status(400).json({
      error: 'xml_obrigatorio',
      message: 'Envie pelo menos um arquivo XML no campo xml.'
    });
  }

  const rede = await ensureNetworkAvailable();
  if (!rede.online) {
    return res.status(503).json(networkUnavailablePayload(rede));
  }

  try {
    const formData = new FormData();

    for (const file of files) {
      const blob = new Blob([file.buffer], {
        type: file.mimetype || 'application/xml'
      });
      formData.append('xml', blob, file.originalname || 'nota.xml');
    }

    if (req.body?.tipo) formData.append('tipo', req.body.tipo);
    if (req.body?.format) formData.append('format', req.body.format);
    if (req.body?.opcoes) formData.append('opcoes', req.body.opcoes);

    const accept = variant === 'etiqueta-html'
      ? 'text/html'
      : req.body?.format === 'pdf' || variant !== 'danfe'
        ? 'application/pdf'
        : 'application/json';

    const upstream = await fetchWithTimeout(endpointForVariant(variant), {
      method: 'POST',
      headers: { accept },
      body: formData
    });

    return sendUpstreamResponse(upstream, res);
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    return res.status(aborted ? 504 : 502).json({
      error: aborted ? 'upstream_timeout' : 'upstream_network_error',
      message: aborted
        ? 'A geracao demorou demais para responder.'
        : 'Nao foi possivel conectar na API do Consulta DANFE.',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

app.post('/api/danfe', upload.single('xml'), (req, res) => handleXmlProxy(req, res, 'danfe'));
app.post('/api/danfe/etiqueta', upload.single('xml'), (req, res) => handleXmlProxy(req, res, 'etiqueta'));
app.post('/api/danfe/simplificado', upload.single('xml'), (req, res) => handleXmlProxy(req, res, 'simplificado'));
app.post('/api/danfe/etiqueta-html', upload.array('xml', 20), (req, res) => handleXmlProxy(req, res, 'etiqueta-html'));

app.get(/.*/, (_req, res) => {
  if (!hasFrontend) {
    return res.status(404).json({
      error: 'frontend_embutido',
      message: 'A interface esta sendo servida pelo aplicativo nativo; use as rotas /api do backend local.'
    });
  }

  return res.sendFile(frontendIndexFile);
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      error: error.code,
      message: error.message
    });
  }

  return res.status(500).json({
    error: 'erro_interno',
    message: 'Erro interno no backend local.',
    detail: error instanceof Error ? error.message : String(error)
  });
});

loadRuntimeConfig()
  .then(() => {
    app.listen(port, () => {
      console.log(`API DANFE local em http://localhost:${port}`);
      console.log(`Pasta de saida: ${outputDir}`);
      startNetworkMonitor();
      startDatabaseMonitor();
      startDatabaseAutomation();
    });
  })
  .catch((error) => {
    console.error('Falha ao iniciar API DANFE local:', error);
    process.exit(1);
  });
