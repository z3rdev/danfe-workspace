import { useEffect, useRef, useState } from 'react';
import { Check, Database, Download, FolderOpen, HardDrive, Save, Settings2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeading } from './shell';
import { apiUrl, requestJson } from './store';

type AppSettings = {
  autoStartWindows: boolean;
  outputDir: string;
  defaultOutputDir: string;
  batchSize: number;
  batchIntervalMs: number;
  batchPauseMs: number;
  databaseQueryPeriod: 'month_to_today' | 'previous_day';
  databaseAutoQuery: boolean;
  databaseAutoDownload: boolean;
  databaseAutoIntervalMs: number;
  databaseScheduleMode: 'interval' | 'scheduled_time';
  databaseScheduledTime: string;
  databaseFile?: string;
  database?: string;
  startupExecutable?: string;
};

const emptySettings: AppSettings = {
  autoStartWindows: false,
  outputDir: '',
  defaultOutputDir: '',
  batchSize: 25,
  batchIntervalMs: 1500,
  batchPauseMs: 15000,
  databaseQueryPeriod: 'month_to_today',
  databaseAutoQuery: false,
  databaseAutoDownload: false,
  databaseAutoIntervalMs: 900000,
  databaseScheduleMode: 'interval',
  databaseScheduledTime: '08:00',
};

function secondsFromMs(value: number) {
  return String(Math.round(value / 100) / 10);
}

function msFromSeconds(value: string, fallback: number, minimum: number, maximum: number) {
  if (!value.trim()) return fallback;
  const seconds = Number(value.replace(',', '.'));
  if (!Number.isFinite(seconds)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(seconds * 1000)));
}

function minutesFromMs(value: number) {
  return String(Math.max(1, Math.round(value / 60000)));
}

function msFromMinutes(value: string, fallback: number) {
  const minutes = Number(value.replace(',', '.'));
  if (!Number.isFinite(minutes)) return fallback;
  return Math.min(1440, Math.max(1, Math.round(minutes))) * 60000;
}

function batchDraftFromSettings(settings: AppSettings) {
  return {
    size: String(settings.batchSize),
    interval: secondsFromMs(settings.batchIntervalMs),
    pause: secondsFromMs(settings.batchPauseMs),
  };
}

type BatchDraft = ReturnType<typeof batchDraftFromSettings>;

function settingsFromBatchDraft(settings: AppSettings, draft: BatchDraft): AppSettings {
  const size = Number(draft.size);
  return {
    ...settings,
    batchSize: draft.size.trim() && Number.isFinite(size)
      ? Math.min(100, Math.max(5, Math.round(size)))
      : settings.batchSize,
    batchIntervalMs: msFromSeconds(draft.interval, settings.batchIntervalMs, 500, 10000),
    batchPauseMs: msFromSeconds(draft.pause, settings.batchPauseMs, 5000, 120000),
  };
}

function automationDraftFromSettings(settings: AppSettings) {
  return { interval: minutesFromMs(settings.databaseAutoIntervalMs), time: settings.databaseScheduledTime };
}

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [batchDraft, setBatchDraft] = useState(() => batchDraftFromSettings(emptySettings));
  const [automationDraft, setAutomationDraft] = useState(() => automationDraftFromSettings(emptySettings));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    void requestJson<AppSettings & { ok: boolean }>('/api/microservico/config')
      .then((data) => {
        if (active) {
          const loaded = { ...emptySettings, ...data };
          setSettings(loaded);
          setBatchDraft(batchDraftFromSettings(loaded));
          setAutomationDraft(automationDraftFromSettings(loaded));
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Não foi possível carregar as configurações.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function updateBatch(key: keyof BatchDraft, value: string) {
    setBatchDraft((current) => ({ ...current, [key]: value }));
  }

  function commitBatchDraft() {
    const next = settingsFromBatchDraft(settings, batchDraft);
    setSettings(next);
    setBatchDraft(batchDraftFromSettings(next));
    return next;
  }

  function commitAutomationDraft() {
    const next = {
      ...settings,
      databaseAutoIntervalMs: msFromMinutes(automationDraft.interval, settings.databaseAutoIntervalMs),
      databaseScheduledTime: automationDraft.time || settings.databaseScheduledTime
    };
    setSettings(next);
    setAutomationDraft(automationDraftFromSettings(next));
    return next;
  }

  async function save() {
    if (!settings.outputDir.trim()) {
      toast.error('Informe a pasta padrão para salvar os arquivos.');
      return;
    }

    const nextSettings = commitAutomationDraft();
    const withBatchSettings = settingsFromBatchDraft(nextSettings, batchDraft);
    setSettings(withBatchSettings);
    setBatchDraft(batchDraftFromSettings(withBatchSettings));
    setSaving(true);
    try {
      const saved = await requestJson<AppSettings & { startup?: { applied?: boolean } }>('/api/microservico/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(withBatchSettings),
      });
      const updated = { ...withBatchSettings, ...saved };
      setSettings(updated);
      setBatchDraft(batchDraftFromSettings(updated));
      setAutomationDraft(automationDraftFromSettings(updated));
      if (settings.autoStartWindows && saved.startup?.applied === false) {
        toast.warning('A preferência foi salva, mas o início automático não pôde ser aplicado nesta instalação.');
      } else {
        toast.success('Configurações salvas.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar as configurações.');
    } finally {
      setSaving(false);
    }
  }

  async function exportSettings() {
    try {
      const response = await fetch(apiUrl('/api/microservico/config/exportar'));
      if (!response.ok) throw new Error('Não foi possível exportar as configurações.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'danfe-configuracoes.json';
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Configurações exportadas.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível exportar as configurações.');
    }
  }

  async function importSettings(file: File) {
    try {
      const content = JSON.parse(await file.text()) as { configuracoes?: AppSettings };
      const imported = content.configuracoes || content;
      const saved = await requestJson<AppSettings>('/api/microservico/config/importar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ configuracoes: imported }),
      });
      const updated = { ...emptySettings, ...saved };
      setSettings(updated);
      setBatchDraft(batchDraftFromSettings(updated));
      setAutomationDraft(automationDraftFromSettings(updated));
      toast.success('Configurações importadas e aplicadas.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Arquivo de configurações inválido.');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  return <div className="page-enter">
    <PageHeading title="Configurações" description="Defina como o DANFE Workspace deve funcionar no computador.">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="text-xs" onClick={() => void exportSettings()} disabled={loading}><Download size={14}/>Exportar configurações</Button>
        <Button variant="outline" className="text-xs" onClick={() => importInputRef.current?.click()} disabled={loading}><Upload size={14}/>Importar configurações</Button>
        <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importSettings(file); }}/>
      </div>
    </PageHeading>

    {loading ? <div className="fluent-panel p-8 text-sm text-muted-foreground">Carregando configurações...</div> : <>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="fluent-panel p-5">
          <div className="flex items-start gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"><Settings2 size={18}/></div><div><h2 className="text-sm font-semibold">Inicialização</h2><p className="mt-1 text-xs text-muted-foreground">Abra o aplicativo automaticamente quando você entrar no Windows.</p></div></div>
          <label className="mt-6 flex cursor-pointer items-center justify-between gap-4 rounded-md border border-border bg-card px-4 py-3"><span><span className="block text-xs font-medium">Iniciar junto com o Windows</span><span className="mt-1 block text-[11px] text-muted-foreground">O DANFE Workspace será aberto em segundo plano no login.</span></span><input type="checkbox" className="size-4 accent-primary" checked={settings.autoStartWindows} onChange={(event) => update('autoStartWindows', event.target.checked)}/></label>
          <p className="mt-3 text-[10px] text-muted-foreground">Executável configurado: <span className="break-all">{settings.startupExecutable || 'aplicativo nativo'}</span></p>
        </section>

        <section className="fluent-panel p-5">
          <div className="flex items-start gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-success-soft text-success"><FolderOpen size={18}/></div><div><h2 className="text-sm font-semibold">Arquivos salvos</h2><p className="mt-1 text-xs text-muted-foreground">PDFs, XMLs e JSONs serão organizados automaticamente nessa pasta.</p></div></div>
          <label className="mt-6 block text-xs font-medium" htmlFor="output-dir">Pasta padrão para salvar os arquivos</label>
          <input id="output-dir" className="fluent-input mt-2 h-10 w-full text-xs" value={settings.outputDir} onChange={(event) => update('outputDir', event.target.value)} placeholder="C:\\Users\\seu-usuario\\Documents\\DANFE"/>
          <p className="mt-2 text-[10px] text-muted-foreground">A pasta `.XML` e `.JSON` continua oculta para a visualização comum do Windows.</p>
        </section>

        <section className="fluent-panel p-5">
          <div className="flex items-start gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-warning-soft text-warning"><HardDrive size={18}/></div><div><h2 className="text-sm font-semibold">Processamento em lote</h2><p className="mt-1 text-xs text-muted-foreground">Controle o tamanho dos blocos e o intervalo entre consultas.</p></div></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <label className="block text-xs font-medium">Notas por lote<input type="number" min={5} max={100} className="fluent-input mt-2 h-10 w-full text-xs" value={batchDraft.size} onChange={(event) => updateBatch('size', event.target.value)} onBlur={commitBatchDraft}/><span className="mt-1 block text-[10px] font-normal text-muted-foreground">De 5 a 100 notas</span></label>
            <label className="block text-xs font-medium">Intervalo entre consultas<input type="number" min={0.5} max={10} step={0.5} className="fluent-input mt-2 h-10 w-full text-xs" value={batchDraft.interval} onChange={(event) => updateBatch('interval', event.target.value)} onBlur={commitBatchDraft}/><span className="mt-1 block text-[10px] font-normal text-muted-foreground">Em segundos</span></label>
            <label className="block text-xs font-medium">Pausa entre lotes<input type="number" min={5} max={120} step={5} className="fluent-input mt-2 h-10 w-full text-xs" value={batchDraft.pause} onChange={(event) => updateBatch('pause', event.target.value)} onBlur={commitBatchDraft}/><span className="mt-1 block text-[10px] font-normal text-muted-foreground">Em segundos</span></label>
          </div>
          <div className="mt-4 rounded-md border border-info/20 bg-info-soft px-3 py-2 text-[11px] text-muted-foreground">Lotes grandes são divididos automaticamente e recebem uma pausa para reduzir o risco de bloqueio na consulta.</div>
        </section>

        <section className="fluent-panel p-4 lg:col-span-2">
          <div className="flex items-center gap-3"><div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-info-soft text-info"><Database size={16}/></div><div><h2 className="text-sm font-semibold">Consulta no banco</h2><p className="text-[11px] text-muted-foreground">Período, agenda e download das notas novas.</p></div></div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1.45fr_1fr_0.8fr]">
            <label className="block text-[11px] font-medium" htmlFor="database-period">Período<select id="database-period" className="fluent-input mt-1.5 h-9 w-full text-xs" value={settings.databaseQueryPeriod} onChange={(event) => update('databaseQueryPeriod', event.target.value as AppSettings['databaseQueryPeriod'])}><option value="month_to_today">Do dia atual ao mesmo dia do mês anterior</option><option value="previous_day">D-1: somente o dia anterior</option></select></label>
            <label className="block text-[11px] font-medium" htmlFor="database-schedule-mode">Agendamento<select id="database-schedule-mode" className="fluent-input mt-1.5 h-9 w-full text-xs" value={settings.databaseScheduleMode} onChange={(event) => update('databaseScheduleMode', event.target.value as AppSettings['databaseScheduleMode'])}><option value="interval">A cada intervalo</option><option value="scheduled_time">Horário agendado</option></select></label>
            {settings.databaseScheduleMode === 'scheduled_time' ? <label className="block text-[11px] font-medium" htmlFor="database-time">Executar às<input id="database-time" type="time" className="fluent-input mt-1.5 h-9 w-full text-xs" value={automationDraft.time} onChange={(event) => setAutomationDraft((current) => ({ ...current, time: event.target.value }))} onBlur={commitAutomationDraft}/></label> : <label className="block text-[11px] font-medium" htmlFor="database-interval">Intervalo (min)<input id="database-interval" type="number" min={1} max={1440} className="fluent-input mt-1.5 h-9 w-full text-xs" value={automationDraft.interval} disabled={!settings.databaseAutoQuery} onChange={(event) => setAutomationDraft((current) => ({ ...current, interval: event.target.value }))} onBlur={commitAutomationDraft}/></label>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 text-[11px]"><input type="checkbox" className="size-3.5 accent-primary" checked={settings.databaseAutoQuery} onChange={(event) => update('databaseAutoQuery', event.target.checked)}/>Consulta automática</label>
            <label className={`flex min-h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-[11px] ${settings.databaseAutoQuery ? 'cursor-pointer' : 'opacity-60'}`}><input type="checkbox" className="size-3.5 accent-primary" checked={settings.databaseAutoDownload} disabled={!settings.databaseAutoQuery} onChange={(event) => update('databaseAutoDownload', event.target.checked)}/>Download automático</label>
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-success"><Check size={13}/>{settings.database || 'SQLite local'} ativo</span>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">Regras salvas localmente em {settings.databaseFile || 'DADOS\\danfe.sqlite'}.</p>
        </section>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-5 py-4"><p className="text-xs text-muted-foreground">As alterações de lote passam a valer na próxima consulta.</p><Button onClick={() => void save()} disabled={saving}><Save size={15}/>{saving ? 'Salvando...' : 'Salvar configurações'}</Button></div>
    </>}
  </div>;
}
