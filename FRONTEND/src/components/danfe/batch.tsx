import { useRef, useState } from 'react';
import { CheckCheck, ChevronLeft, ChevronRight, CircleCheck, Clock3, FileCheck2, FileText, FileUp, ListFilter, LoaderCircle, Plus, RotateCw, Search, ShieldCheck, Square, Upload, Wifi, WifiOff, X } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useDanfe } from './store';
import { PageHeading } from './shell';
import type { ItemStatus } from '@/lib/danfe';

function shortErrorLabel(code?: string) {
  if (code === 'data_fora_da_janela') return 'Fora do período público';
  if (code === 'chave_invalida') return 'Chave inválida';
  if (code === 'rate_limit_exceeded') return 'Limite temporário';
  return 'Erro na consulta';
}

export function StatusBadge({ status, errorCode, errorMessage }: { status: ItemStatus; errorCode?: string | undefined; errorMessage?: string | undefined }) {
  const config = {
    done: { text: 'Concluída', cls: 'bg-success-soft text-success', icon: CircleCheck },
    processing: { text: 'Processando', cls: 'bg-info-soft text-info', icon: LoaderCircle },
    pending: { text: 'Na fila', cls: 'bg-muted text-muted-foreground', icon: Clock3 },
    error: { text: shortErrorLabel(errorCode), cls: 'bg-warning-soft text-warning', icon: X },
    invalid: { text: 'Chave inválida', cls: 'bg-warning-soft text-warning', icon: X },
  }[status];
  const Icon = config.icon;
  return <span title={errorMessage || config.text} className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium ${config.cls}`}><Icon size={11} className={status === 'processing' ? 'animate-spin' : ''}/>{config.text}</span>;
}

export function BatchPage() {
  const { items, setItems, running, fileName, importText, start, stop, logs, onlyMarked, setOnlyMarked, resetBatch, networkStatus, databaseAutomation, stopDatabaseAutomation } = useDanfe();
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const [dragging, setDragging] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const fileInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const valid = items.filter(item => item.status !== 'invalid').length;
  const done = items.filter(item => item.status === 'done').length;
  const active = items.filter(item => item.status === 'processing').length;
  const errors = items.filter(item => item.status === 'error').length;
  const progress = valid ? Math.round(done / valid * 100) : 0;
  const filtered = items.filter(item => `${item.number} ${item.company} ${item.key}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || item.status === filter));
  const pages = Math.max(1, Math.ceil(filtered.length / 5));
  const currentPage = Math.min(page, pages);
  const networkReady = networkStatus.online;
  const NetworkIcon = networkReady ? Wifi : WifiOff;
  const networkLabel = networkStatus.state === 'checking'
    ? 'Verificando rede local...'
    : networkReady
      ? `Rede ${networkStatus.host} online${networkStatus.latencyMs === null ? '' : ` - ${networkStatus.latencyMs} ms`}`
      : `Rede ${networkStatus.host} offline`;

  function newBatch() {
    if (running) {
      toast.info('Interrompa o lote antes de criar outro.');
      return;
    }
    resetBatch();
    if (textInput.current) textInput.current.value = '';
    setSearch('');
    setFilter('all');
    setPage(1);
    setInputMode('file');
    toast.success('Novo lote pronto para importar.');
  }

  async function readFile(file?: File) {
    if (!file) return;
    if (!/\.(txt|tsv|csv)$/i.test(file.name)) {
      toast.error('Selecione um arquivo TXT, TSV ou CSV.');
      return;
    }
    const content = await file.text();
    if (textInput.current) textInput.current.value = content;
    await importText(content, file.name);
  }

  async function readPastedText() {
    const content = textInput.current?.value || '';
    await importText(content, 'Conteúdo colado');
  }

  return <div className="page-enter">
    <PageHeading title="Processamento em lote" description="Importe suas notas e acompanhe cada consulta em um só lugar.">
      <Button variant="outline" className="h-9 gap-2 text-xs" onClick={newBatch}><Plus size={15}/>Novo lote</Button>
    </PageHeading>

    {databaseAutomation.running && <section className="fluent-panel mb-5 border-info/30 bg-info-soft/20 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-semibold"><span className="size-2 animate-pulse rounded-full bg-info"/>Consulta automática em andamento</div><Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => void stopDatabaseAutomation()} disabled={databaseAutomation.stopRequested}><Square size={11}/>{databaseAutomation.stopRequested ? 'Interrompendo...' : 'Interromper'}</Button></div><div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>{databaseAutomation.phase === 'consultando' ? 'Consultando registros no banco...' : databaseAutomation.phase === 'baixando' ? 'Baixando documentos...' : 'Finalizando consulta...'}</span><span>{databaseAutomation.current} de {databaseAutomation.total || 0}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/70"><div className="h-full rounded-full bg-info transition-all duration-500" style={{ width: `${databaseAutomation.total ? Math.min(100, (databaseAutomation.current / databaseAutomation.total) * 100) : 10}%` }}/></div></section>}

    <section className="fluent-panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold"><FileUp size={16} className="text-primary"/>Importar notas fiscais</h2>
        <div className="flex rounded-md bg-muted p-0.5">
          <Button size="sm" variant="ghost" className={`h-7 gap-1.5 px-3 text-[11px] ${inputMode === 'file' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`} onClick={() => setInputMode('file')}><Upload size={12}/>Arquivo</Button>
          <Button size="sm" variant="ghost" className={`h-7 gap-1.5 px-3 text-[11px] ${inputMode === 'text' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`} onClick={() => setInputMode('text')}><FileText size={12}/>Colar texto</Button>
        </div>
      </div>
      <div className="p-5">
        <input ref={fileInput} type="file" accept=".txt,.tsv,.csv" className="hidden" aria-label="Importar arquivo TXT ou TSV" onChange={e => { void readFile(e.target.files?.[0]); e.target.value = ''; }}/>
        {inputMode === 'file' ? <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); void readFile(e.dataTransfer.files[0]); }} className={`flex min-h-[124px] flex-col items-center justify-center rounded-md border border-dashed px-4 py-5 ${dragging ? 'border-primary bg-accent' : 'border-border bg-background/60'}`}><div className="mb-2.5 flex size-10 items-center justify-center rounded-lg border border-border bg-card text-primary shadow-sm"><Upload size={20}/></div><p className="text-xs font-medium">Arraste seu arquivo aqui ou <Button variant="link" className="h-auto p-0 text-xs" onClick={() => fileInput.current?.click()}>selecione um arquivo</Button></p><p className="mt-1.5 text-[10px] text-muted-foreground">Arquivos TXT, TSV ou CSV com as informações das notas fiscais</p></div> : <div><textarea ref={textInput} className="fluent-input min-h-[118px] resize-none font-mono text-xs" aria-label="Conteúdo das notas" placeholder="Cole aqui o conteúdo do relatório de notas"/><div className="mt-2 flex justify-end"><Button variant="outline" size="sm" onClick={() => void readPastedText()}><FileCheck2/>Ler conteúdo</Button></div></div>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px]"><div className="flex items-center gap-2 text-muted-foreground"><FileText size={13} className="text-primary"/><span className="font-medium text-foreground">{items.length ? fileName : 'Nenhum arquivo importado'}</span>{items.length > 0 && <><span className="text-border">|</span><span>{items.length} notas identificadas</span><CircleCheck size={12} className="text-success"/></>}</div><label className="flex cursor-pointer items-center gap-2 text-muted-foreground"><input type="checkbox" className="size-3.5 accent-primary" checked={onlyMarked} onChange={e => setOnlyMarked(e.target.checked)}/>Somente linhas marcadas como True</label></div>
      </div>
    </section>

    <div className="my-5 grid grid-cols-2 gap-3 xl:grid-cols-4">{[{label:'Notas lidas',value:items.length,icon:FileText,cls:'text-muted-foreground', bg:'bg-muted'}, {label:'Chaves válidas',value:valid,icon:ShieldCheck,cls:'text-info',bg:'bg-info-soft'}, {label:'Em processamento',value:active,icon:RotateCw,cls:'text-warning',bg:'bg-warning-soft'}, {label:'Concluídas',value:done,icon:CheckCheck,cls:'text-success',bg:'bg-success-soft'}].map(metric => <div key={metric.label} className="fluent-panel flex items-center justify-between gap-2 p-4"><div><div className="mb-1.5 text-[11px] text-muted-foreground">{metric.label}</div><div className="text-[26px] font-semibold leading-none tabular-nums">{metric.value.toString().padStart(2,'0')}</div></div><div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${metric.bg} ${metric.cls}`}><metric.icon size={19}/></div></div>)}</div>

    <section className="fluent-panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-4 px-5 pt-4"><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${running ? 'bg-info animate-pulse' : 'bg-primary'}`}/><h2 className="text-xs font-semibold">{running ? 'Processamento em andamento' : progress === 100 && valid > 0 ? 'Lote concluído' : done > 0 ? 'Lote parcialmente concluído' : 'Pronto para iniciar'}</h2><span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">API LOCAL</span></div><div className="text-[11px] text-muted-foreground"><strong className="font-medium text-foreground">{done}</strong> de {valid} notas processadas <span className="mx-2 text-border">|</span><span className="font-semibold text-primary">{progress}%</span>{errors > 0 && <span className="ml-2 text-warning">• {errors} falha(s)</span>}</div></div>{networkStatus.state === 'checking' && <div className="mx-5 mt-3 flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[10px] text-warning"><NetworkIcon size={13} className="animate-spin"/><span>{networkLabel}</span></div>}<div className="mx-5 mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }}/></div><div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><span className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><CircleCheck size={12} className="text-success"/>PDF + XML + JSON</span><div className="flex gap-2"><Button size="sm" variant="outline" className="h-8 text-[11px]" disabled={!running} onClick={() => void stop()}><Square size={11}/>Interromper</Button><Button size="sm" className="h-8 text-[11px]" onClick={() => void start()} disabled={running || !networkReady || !items.some(item => item.status !== 'invalid')}><RotateCw size={12}/>{done > 0 && progress < 100 ? 'Continuar lote' : !networkReady ? 'Aguardando rede' : 'Iniciar lote'}</Button></div></div></section>

    <section className="fluent-panel mt-5 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"><h2 className="text-xs font-semibold">Notas do lote <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">{items.length}</span></h2><div className="flex items-center gap-2"><div className="relative"><Search size={13} className="absolute left-2.5 top-2.5 text-muted-foreground"/><input type="search" aria-label="Buscar notas" className="h-8 w-48 rounded-md border border-border bg-background pl-8 pr-3 text-[11px] outline-none focus:border-primary max-sm:w-32" placeholder="Buscar nota ou empresa..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}/></div><div className="flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2"><ListFilter size={13} className="text-muted-foreground"/><select aria-label="Filtrar status" className="max-w-28 bg-transparent text-[11px] outline-none" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="all">Todos os status</option><option value="done">Concluídas</option><option value="pending">Na fila</option><option value="processing">Processando</option><option value="error">Com falha</option><option value="invalid">Inválidas</option></select></div></div></div><div className="overflow-auto"><table className="app-table"><thead><tr><th className="w-10"><input aria-label="Selecionar todas as notas" type="checkbox" className="accent-primary" checked={items.length > 0 && items.every(item => item.selected)} onChange={e => setItems(prev => prev.map(item => ({...item,selected:e.target.checked})))} disabled={running}/></th><th>Número da NF</th><th>Razão social</th><th>Chave de acesso</th><th>Status</th></tr></thead><tbody>{filtered.slice((currentPage-1)*5,currentPage*5).map(item => <tr key={item.id}><td><input aria-label={`Selecionar NF ${item.number}`} type="checkbox" className="accent-primary" checked={item.selected} disabled={running || item.status === 'invalid'} onChange={e => setItems(prev => prev.map(row => row.id === item.id ? {...row,selected:e.target.checked}:row))}/></td><td className="font-medium tabular-nums">{item.number}</td><td><span className="block max-w-[240px] truncate text-[11px]" title={item.company}>{item.company}</span></td><td><span className="font-mono text-[10px] text-muted-foreground" title={item.key}>{item.key ? `${item.key.slice(0,12)}…${item.key.slice(-8)}` : '—'}</span></td><td><StatusBadge status={item.status} errorCode={item.errorCode} errorMessage={item.errorMessage}/>{item.status === 'error' && item.errorMessage && <span className="mt-1 block max-w-[220px] text-[9px] leading-tight text-warning" title={item.errorMessage}>{item.errorMessage}</span>}</td></tr>)}{!filtered.length && <tr><td colSpan={5} className="h-24 text-center text-muted-foreground">Nenhuma nota encontrada.</td></tr>}</tbody></table></div><div className="flex items-center justify-between border-t border-border px-5 py-2.5 text-[10px] text-muted-foreground"><span>{filtered.length ? (currentPage-1)*5+1 : 0}–{Math.min(currentPage*5,filtered.length)} de {filtered.length} notas</span><div className="flex items-center gap-3"><span>{currentPage} de {pages}</span><Button variant="outline" size="icon" className="size-6" title="Página anterior" disabled={currentPage<=1} onClick={() => setPage(currentPage-1)}><ChevronLeft size={12}/></Button><Button variant="outline" size="icon" className="size-6" title="Próxima página" disabled={currentPage>=pages} onClick={() => setPage(currentPage+1)}><ChevronRight size={12}/></Button></div></div></section>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-muted-foreground"><div className="flex items-center gap-2"><span className="font-mono">›_</span><span className="font-mono">{logs.at(-1)?.time || '--:--:--'}</span><span className="text-success">INFO</span><span>{logs.at(-1)?.message || 'Aguardando novas atividades'}</span></div><Button asChild variant="link" className="h-auto gap-1 p-0 text-[10px]"><Link to="/logs">Ver atividade<ChevronRight size={11}/></Link></Button></div>
  </div>;
}
