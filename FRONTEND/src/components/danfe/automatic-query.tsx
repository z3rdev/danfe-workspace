import { Activity, CheckCircle2, Clock3, Database, FolderOpen, LoaderCircle, Square, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeading } from './shell';
import { useDanfe } from './store';

const phaseLabels = {
  idle: 'Aguardando configuração',
  consultando: 'Consultando o banco',
  baixando: 'Baixando documentos',
  finalizando: 'Finalizando consulta',
  concluida: 'Consulta concluída',
  interrompida: 'Consulta interrompida',
  erro: 'Consulta finalizada com erro'
} as const;

function periodLabel(period?: string) {
  return period === 'previous_day'
    ? 'Somente o dia anterior'
    : 'Do dia atual até o mesmo dia do mês anterior';
}

function formatDate(value: string | null) {
  if (!value) return 'Ainda não executada';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function AutomaticQueryPage() {
  const { databaseAutomation, stopDatabaseAutomation, openOutputFolder } = useDanfe();
  const { result } = databaseAutomation;
  const percentage = databaseAutomation.total > 0
    ? Math.min(100, Math.round((databaseAutomation.current / databaseAutomation.total) * 100))
    : databaseAutomation.phase === 'consultando' ? 8 : databaseAutomation.running ? 100 : 0;

  async function interrupt() {
    try {
      await stopDatabaseAutomation();
      toast.info('Interrupção solicitada. O item atual será encerrado com segurança.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível interromper a consulta.');
    }
  }

  async function openFolder() {
    try {
      await openOutputFolder();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir a pasta.');
    }
  }

  return <div className="page-enter">
    <PageHeading title="Consulta automática" description="Acompanhe as consultas do banco e os downloads realizados pelo serviço local." />

    <section className="fluent-panel overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-info-soft text-info"><Activity size={20} className={databaseAutomation.running ? 'animate-pulse' : ''}/></div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[1.4px] text-muted-foreground">Status da automação</p>
            <h2 className="mt-1 text-lg font-semibold">{phaseLabels[databaseAutomation.phase]}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{databaseAutomation.running ? 'O serviço está trabalhando em segundo plano.' : result?.message || 'A automação usa as regras salvas em Configurações.'}</p>
          </div>
        </div>
        {databaseAutomation.running && <Button variant="outline" className="h-8 text-xs" onClick={() => void interrupt()} disabled={databaseAutomation.stopRequested}><Square size={12}/>{databaseAutomation.stopRequested ? 'Interrompendo...' : 'Interromper'}</Button>}
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-3">
        <div className="rounded-md border border-border bg-card p-4"><div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Database size={14}/>Registros encontrados</div><div className="mt-2 text-2xl font-semibold tabular-nums">{result?.total ?? (databaseAutomation.running ? databaseAutomation.total : 0)}</div></div>
        <div className="rounded-md border border-border bg-card p-4"><div className="flex items-center gap-2 text-[11px] text-muted-foreground"><FolderOpen size={14}/>Downloads realizados</div><div className="mt-2 text-2xl font-semibold tabular-nums">{result?.downloaded ?? 0}</div></div>
        <div className="rounded-md border border-border bg-card p-4"><div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Clock3 size={14}/>Última execução</div><div className="mt-2 text-sm font-semibold">{formatDate(databaseAutomation.finishedAt)}</div></div>
      </div>

      <div className="border-t border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="flex items-center gap-2 font-medium"><span className={`size-2 rounded-full ${databaseAutomation.running ? 'animate-pulse bg-info' : databaseAutomation.phase === 'erro' ? 'bg-destructive' : databaseAutomation.phase === 'interrompida' ? 'bg-warning' : 'bg-success'}`}/>{phaseLabels[databaseAutomation.phase]}</span><span className="text-muted-foreground">{databaseAutomation.current} de {databaseAutomation.total || 0} documentos</span></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-all duration-500 ${databaseAutomation.phase === 'erro' ? 'bg-destructive' : databaseAutomation.phase === 'interrompida' ? 'bg-warning' : 'bg-primary'}`} style={{ width: `${percentage}%` }}/></div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground"><span>Período: <strong className="font-medium text-foreground">{periodLabel(result?.period)}</strong></span><span>{result?.skipped ?? 0} já processada(s) · {result?.failed ?? 0} falha(s)</span></div>
      </div>
    </section>

    <section className="fluent-panel mt-5 flex flex-wrap items-center justify-between gap-4 p-5">
      <div><p className="text-xs font-semibold">Ações da consulta automática</p><p className="mt-1 text-[11px] text-muted-foreground">Ao concluir um download, a pasta configurada é aberta automaticamente.</p></div>
      <div className="flex gap-2"><Button variant="outline" className="h-8 text-xs" onClick={() => void openFolder()}><FolderOpen size={13}/>Abrir pasta</Button>{databaseAutomation.phase === 'concluida' && <span className="flex items-center gap-1.5 text-[11px] text-success"><CheckCircle2 size={14}/>Concluída</span>}{databaseAutomation.phase === 'erro' && <span className="flex items-center gap-1.5 text-[11px] text-destructive"><XCircle size={14}/>Verifique os logs</span>}{databaseAutomation.running && <span className="flex items-center gap-1.5 text-[11px] text-info"><LoaderCircle size={14} className="animate-spin"/>Em andamento</span>}</div>
    </section>
  </div>;
}
