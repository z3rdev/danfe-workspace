import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const version = String(process.argv[2] || '').trim().replace(/^v/i, '');
const notes = String(process.env.RELEASE_NOTES || 'Atualização do DANFE Workspace.');

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('Informe a versão no formato SemVer. Exemplo: node scripts/publish-release.mjs 0.1.1');
}

const credentials = JSON.parse(await fs.readFile(path.join(projectRoot, 'BACKEND', 'credentials.json'), 'utf8'));
const bundleDir = path.join(projectRoot, 'DESKTOP', 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const files = await fs.readdir(bundleDir);
const installer = files.find((file) => file === `DANFE Workspace_${version}_x64-setup.exe`)
  || files.find((file) => new RegExp(`_${version.replaceAll('.', '\\.')}_.*setup\\.exe$`, 'i').test(file));

if (!installer) {
  throw new Error(`Instalador NSIS nao encontrado em ${bundleDir}. Gere o release com o Tauri antes de publicar.`);
}

const signatureFile = `${installer}.sig`;
if (!files.includes(signatureFile)) {
  throw new Error(`Assinatura nao encontrada: ${path.join(bundleDir, signatureFile)}`);
}

const bucket = 'z3-releases';
const prefix = 'danfe-workspace';
const endpoint = 'https://s3.nexusnerds.com.br';
const publicBase = `${endpoint}/${bucket}/${prefix}`;
const releasePrefix = `${prefix}/${version}`;
const installerKey = `${releasePrefix}/${installer}`;
const signature = (await fs.readFile(path.join(bundleDir, signatureFile), 'utf8')).trim();
const installerUrl = `${publicBase}/${version}/${encodeURIComponent(installer)}`;

const client = new S3Client({
  endpoint,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: credentials.accessKey,
    secretAccessKey: credentials.secretKey
  }
});

async function upload(key, body, contentType) {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: key.endsWith('/latest.json') ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000, immutable'
  }));
  console.log(`Publicado: ${key}`);
}

await upload(installerKey, await fs.readFile(path.join(bundleDir, installer)), 'application/vnd.microsoft.portable-executable');
await upload(`${installerKey}.sig`, `${signature}\n`, 'text/plain; charset=utf-8');

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      url: installerUrl,
      signature
    }
  }
};

await upload(`${prefix}/latest.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'application/json; charset=utf-8');
console.log(`Manifesto: ${publicBase}/latest.json`);
