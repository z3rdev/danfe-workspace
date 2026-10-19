import { useState } from 'react';
import { ArrowDown, Search, Terminal, Trash2, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useDanfe } from './store';
import { PageHeading } from './shell';

export function LogsPage() {
  const { logs, setLogs, running, clearProcessed, serviceOnline } = useDanfe();
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('all');
  const [frozen, setFrozen] = useState<typeof logs | null>(null);
  const filtered = (frozen ?? logs).filter(log => (level === 'all' || log.level === level) && log.message.toLowerCase().includes(search.toLowerCase()));

  async function clearHistory() {
    try {
      await clearProcessed();
      setLogs([]);
      setFrozen(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível limpar o histórico.');
    }
  }

  return <div className="page-enter"><PageHeading title="Terminal de logs" description="Acompanhe em tempo real os eventos do microsserviço local."><Button variant="outline" className="text-xs" onClick={() => void clearHistory()} disabled={!serviceOnline}><Trash2/>Limpar histórico</Button></PageHeading><section className="fluent-panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><div className="flex items-center gap-2 text-xs"><Terminal size={16} className="text-primary"/><span className="font-medium">api-danfe-local</span><span className={`rounded px-2 py-1 text-[10px] ${serviceOnline ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'}`}>{frozen ? 'Visualização pausada' : serviceOnline ? 'Ao vivo' : 'Offline'}</span></div><div className="flex flex-wrap gap-2"><div className="relative"><Search size={13} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/><input aria-label="Buscar logs" className="fluent-input log-search-input h-8 text-xs" placeholder="Pesquisar nos logs..." value={search} onChange={e => setSearch(e.target.value)}/></div><select aria-label="Nível do log" className="rounded-md border border-border bg-card px-2 text-xs" value={level} onChange={e => setLevel(e.target.value)}><option value="all">Todos os níveis</option><option>INFO</option><option>WARN</option><option>ERROR</option></select><Button variant="outline" size="icon" className="size-8" title={frozen ? 'Retomar visualização' : 'Pausar visualização'} onClick={() => setFrozen(frozen ? null : [...logs])}>{frozen ? <Play/> : <Pause/>}</Button></div></div><div className="min-h-[430px] overflow-auto bg-terminal p-5 font-mono text-[11px] text-terminal-text">{filtered.map(log => <div key={log.id} className="flex items-start gap-4 py-2 max-sm:flex-wrap max-sm:gap-2"><span className="shrink-0 opacity-50">{log.time}</span><span className={`w-10 shrink-0 ${log.level === 'INFO' ? 'text-success' : log.level === 'WARN' ? 'text-warning' : 'text-destructive'}`}>{log.level}</span><span className="break-words leading-relaxed">{log.message}</span></div>)}{!filtered.length && <p className="py-8 text-center opacity-50">Nenhum evento encontrado.</p>}<div className="mt-3 flex gap-2 text-primary"><span>❯</span><span className="opacity-60">{running ? 'Processando consultas…' : serviceOnline ? 'Aguardando novos eventos' : 'Backend offline'}</span><span className="animate-pulse">▍</span></div></div><div className="flex justify-between px-4 py-3 text-[10px] text-muted-foreground"><span>{filtered.length} eventos exibidos</span><span className="flex items-center gap-1"><ArrowDown size={12}/>Eventos recebidos ao vivo</span></div></section></div>;
}
