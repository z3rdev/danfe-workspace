import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Check, CheckCircle2, CircleAlert, CloudUpload, FileArchive, LoaderCircle, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiUrl, requestJson } from './store';

type PublishedRelease = {
  version: string;
  installer: string | null;
  signature: string | null;
  installerUrl?: string;
  publishedAt: string | null;
};

type ReleaseStatus = {
  enabled: boolean;
  endpoint?: string;
  bucket?: string;
  prefix?: string;
  releases?: PublishedRelease[];
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function readReleaseVersion(fileName: string) {
  const normalizedName = fileName.replace(/\.sig$/i, '');
  const match = normalizedName.match(/_(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)_x64-setup\.exe$/i);
  return match?.[1] || '';
}

function suggestNextVersion(releases: PublishedRelease[] = []) {
  const versions = releases
    .map((release) => release.version.match(/^(\d+)\.(\d+)\.(\d+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match): [number, number, number] => [Number(match[1]), Number(match[2]), Number(match[3])])
    .sort((left, right) => right[0] - left[0] || right[1] - left[1] || right[2] - left[2]);

  const latest = versions[0];
  if (!latest) return '';
  const [major, minor, patch] = latest;
  return `${major}.${minor}.${patch + 1}`;
}

export function DevelopmentReleasePage() {
  const [status, setStatus] = useState<ReleaseStatus | null>(null);
  const [version, setVersion] = useState('');
  const [suggestedVersion, setSuggestedVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [installer, setInstaller] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const data = await requestJson<ReleaseStatus>('/api/dev/release/status');
      const nextVersion = suggestNextVersion(data.releases);
      setStatus(data);
      setSuggestedVersion(nextVersion);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel consultar o servidor de releases.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function validateFiles(nextInstaller: File | null, nextSignature: File | null) {
    const installerVersion = nextInstaller ? readReleaseVersion(nextInstaller.name) : '';
    const signatureVersion = nextSignature ? readReleaseVersion(nextSignature.name) : '';

    if (nextInstaller && !installerVersion) {
      setVersion('');
      setFileError('O instalador precisa seguir o nome gerado pelo NSIS: DANFE Workspace_<versao>_x64-setup.exe.');
      return;
    }
    if (nextSignature && !signatureVersion) {
      setFileError('A assinatura precisa ter o mesmo nome do instalador, terminando em .exe.sig.');
      return;
    }
    if (installerVersion && signatureVersion && installerVersion !== signatureVersion) {
      setFileError(`Os arquivos nao correspondem: instalador ${installerVersion} e assinatura ${signatureVersion}.`);
      return;
    }

    setVersion(installerVersion || '');
    setFileError('');
  }

  function handleInstallerChange(event: ChangeEvent<HTMLInputElement>) {
    const nextInstaller = event.target.files?.[0] || null;
    setInstaller(nextInstaller);
    validateFiles(nextInstaller, signature);
  }

  function handleSignatureChange(event: ChangeEvent<HTMLInputElement>) {
    const nextSignature = event.target.files?.[0] || null;
    setSignature(nextSignature);
    validateFiles(installer, nextSignature);
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const installerVersion = installer ? readReleaseVersion(installer.name) : '';
    const signatureVersion = signature ? readReleaseVersion(signature.name) : '';

    if (!installer || !signature || !installerVersion || installerVersion !== signatureVersion || fileError) {
      toast.error('Selecione o instalador NSIS e a assinatura .sig da mesma versao.');
      return;
    }

    setPublishing(true);
    try {
      const form = new FormData();
      form.append('version', installerVersion);
      form.append('notes', notes.trim());
      form.append('installer', installer);
      form.append('signature', signature);

      const response = await fetch(apiUrl('/api/dev/release/publish'), { method: 'POST', body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);

      setStatus((current) => ({
        ...(current || { enabled: true }),
        releases: payload.releases || current?.releases || []
      }));
      setVersion('');
      setNotes('');
      setInstaller(null);
      setSignature(null);
      setFileError('');
      const installerInput = document.getElementById('release-installer') as HTMLInputElement | null;
      const signatureInput = document.getElementById('release-signature') as HTMLInputElement | null;
      if (installerInput) installerInput.value = '';
      if (signatureInput) signatureInput.value = '';
      toast.success(payload.message || 'Versao publicada com sucesso.');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Nao foi possivel publicar a versao.');
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground"><LoaderCircle className="mr-2 animate-spin" size={16} />Carregando controle de releases...</div>;
  }

  if (!status?.enabled) {
    return <section className="fluent-panel max-w-2xl p-6"><div className="flex items-start gap-3"><Server className="mt-0.5 text-muted-foreground" size={20} /><div><h1 className="text-lg font-semibold">Painel de releases indisponível</h1><p className="mt-1 text-sm text-muted-foreground">Ative o modo de desenvolvimento no backend para liberar esta tela.</p></div></div></section>;
  }

  const hasCompatibleFiles = Boolean(installer && signature && version && !fileError);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-primary"><CloudUpload size={14} />Modo de desenvolvimento</div><h1 className="mt-2 text-2xl font-semibold tracking-tight">Publicar versão</h1><p className="mt-1 text-sm text-muted-foreground">Selecione os artefatos gerados pelo NSIS. A versão será identificada automaticamente.</p></div>
      <Button variant="outline" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} />Atualizar lista</Button>
    </div>

    <section className="fluent-panel p-5">
      <div className="flex items-start gap-3 border-b border-border pb-4"><div className="flex size-9 items-center justify-center rounded-md bg-info-soft text-info"><Server size={18} /></div><div className="min-w-0"><h2 className="text-sm font-semibold">Servidor de release</h2><p className="mt-1 truncate text-xs text-muted-foreground">{status.endpoint} · {status.bucket}/{status.prefix}</p></div><span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-success"><span className="size-1.5 rounded-full bg-success" />Conectado</span></div>
      <form className="mt-5 space-y-4" onSubmit={publish}>
        <div className="grid items-start gap-4 border-b border-border pb-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <label className="text-xs font-medium" htmlFor="release-version">Versão detectada</label>
            <input id="release-version" className="fluent-input mt-2 h-10 text-xs" value={version} placeholder={suggestedVersion ? `Selecione o instalador (${suggestedVersion})` : 'Selecione o instalador'} readOnly aria-readonly="true" />
            <p className="mt-1 text-[10px] text-muted-foreground">Lida do nome do instalador NSIS.</p>
          </div>
          <label className="text-xs font-medium" htmlFor="release-notes"><span className="flex items-center justify-between gap-3"><span>Notas da versão</span><span className="text-[10px] font-normal text-muted-foreground">{notes.length}/500</span></span><textarea id="release-notes" className="fluent-input mt-2 min-h-[76px] resize-none py-2 text-xs leading-relaxed" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Correções, melhorias e mudanças desta versão." rows={3} maxLength={500} /></label>
        </div>

        <div className="grid items-stretch gap-3 lg:grid-cols-2">
          <label className={`flex min-h-[82px] cursor-pointer items-center gap-3 rounded-md border border-dashed p-3 text-xs transition-colors ${installer ? 'border-primary/50 bg-accent/30' : 'border-border bg-card hover:border-primary/50 hover:bg-background'}`}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-info-soft text-info"><FileArchive size={18} /></span>
            <span className="min-w-0 flex-1"><span className="block font-medium">Instalador NSIS (.exe)</span><span className="mt-1 block truncate text-[10px] text-muted-foreground" title={installer?.name}>{installer?.name || 'Selecione o instalador assinado'}</span>{installer && <span className="mt-1 flex items-center gap-1 text-[10px] text-success"><Check size={12} />Versão {readReleaseVersion(installer.name)}</span>}</span>
            <input id="release-installer" className="sr-only" type="file" accept=".exe,application/vnd.microsoft.portable-executable" onChange={handleInstallerChange} />
          </label>
          <label className={`flex min-h-[82px] cursor-pointer items-center gap-3 rounded-md border border-dashed p-3 text-xs transition-colors ${signature ? 'border-primary/50 bg-accent/30' : 'border-border bg-card hover:border-primary/50 hover:bg-background'}`}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-success-soft text-success"><ShieldCheck size={18} /></span>
            <span className="min-w-0 flex-1"><span className="block font-medium">Assinatura do updater (.sig)</span><span className="mt-1 block truncate text-[10px] text-muted-foreground" title={signature?.name}>{signature?.name || 'Selecione a assinatura do instalador'}</span>{signature && <span className="mt-1 flex items-center gap-1 text-[10px] text-success"><Check size={12} />Versão {readReleaseVersion(signature.name)}</span>}</span>
            <input id="release-signature" className="sr-only" type="file" accept=".sig,text/plain" onChange={handleSignatureChange} />
          </label>
        </div>

        {fileError && <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive" role="alert"><CircleAlert className="mt-0.5 shrink-0" size={14} /><span>{fileError}</span></div>}
        <div className="flex items-center justify-between gap-3"><span className="text-[10px] text-muted-foreground">A publicação usa a versão detectada nos dois arquivos.</span><Button type="submit" disabled={publishing || !hasCompatibleFiles}>{publishing ? <LoaderCircle className="animate-spin" size={15} /> : <CloudUpload size={15} />}{publishing ? 'Publicando...' : 'Publicar versão'}</Button></div>
      </form>
    </section>

    <section className="fluent-panel overflow-hidden"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-sm font-semibold">Versões publicadas</h2><p className="mt-1 text-xs text-muted-foreground">O manifesto aponta sempre para a última versão enviada.</p></div><span className="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">{status.releases?.length || 0} {status.releases?.length === 1 ? 'versão' : 'versões'}</span></div>{error && <p className="m-5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{error}</p>}{status.releases?.length ? <div className="divide-y divide-border">{status.releases.map((release) => <div key={release.version} className="grid items-center gap-3 px-5 py-3 md:grid-cols-[170px_minmax(0,1fr)_auto]"><div className="flex items-center gap-3"><div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-success-soft text-success"><CheckCircle2 size={16} /></div><div className="min-w-0"><div className="text-xs font-semibold">{release.version}</div><div className="text-[10px] text-muted-foreground">{formatDate(release.publishedAt)}</div></div></div><div className="min-w-0 truncate text-[10px] text-muted-foreground" title={release.installer || undefined}>{release.installer}</div><span className="text-[10px] text-success">Instalador + assinatura</span></div>)}</div> : <div className="px-5 py-10 text-center text-xs text-muted-foreground">Nenhuma versão publicada ainda.</div>}</section>
  </div>;
}
