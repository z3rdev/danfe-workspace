import { useState } from 'react';
import { CircleCheck, FileCheck2, LoaderCircle, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatKey, makeKey, validKey, type Invoice } from '@/lib/danfe';
import { PageHeading } from './shell';
import { useDanfe } from './store';

type SavedResult = Invoice & { statusText: string };

export function QuickQueryPage() {
  const { saveInvoice, serviceOnline, networkStatus } = useDanfe();
  const [key, setKey] = useState('');
  const [number, setNumber] = useState('');
  const [company, setCompany] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SavedResult | null>(null);
  const [attempted, setAttempted] = useState(false);
  const networkReady = networkStatus.online;
  const networkLabel = networkStatus.state === 'checking'
    ? 'Verificando rede local...'
    : networkReady
      ? `Rede ${networkStatus.host} online${networkStatus.latencyMs === null ? '' : ` - ${networkStatus.latencyMs} ms`}`
      : `Rede ${networkStatus.host} offline`;

  async function query() {
    setAttempted(true);
    if (!validKey(key)) return;
    setBusy(true);
    setResult(null);
    try {
      const item: Invoice = { id: `quick-${key}`, key, number: number.trim() || key.slice(25, 34), company: company.trim() || 'DANFE', selected: true, status: 'pending' };
      const data = await saveInvoice(item) as { status?: string; numero?: string; nome?: string };
      setResult({ ...item, number: data.numero || item.number, company: data.nome || item.company, status: 'done', statusText: data.status === 'ja_processado' ? 'Já estava salvo no histórico' : 'Consulta concluída e arquivos salvos' });
      toast.success(data.status === 'ja_processado' ? 'Esta nota já havia sido processada.' : 'PDF, XML e JSON salvos com sucesso.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível consultar a nota.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="page-enter"><PageHeading title="Consulta rápida" description="Consulte uma nota pela chave e salve os documentos no computador."/><section className="fluent-panel max-w-4xl"><div className="flex items-center gap-2 border-b border-border px-6 py-4"><Search size={17} className="text-primary"/><h2 className="font-semibold">Consulta unitária</h2><span className={`ml-auto flex items-center gap-1 text-[10px] ${serviceOnline ? 'text-success' : 'text-muted-foreground'}`}><ShieldCheck size={12}/>{serviceOnline ? 'API local online' : 'API local offline'}</span></div>{networkStatus.state === 'checking' && <div className="mx-6 mt-5 flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[11px] text-warning"><ShieldCheck size={14}/><span>{networkLabel}</span></div>}<form className="p-6" onSubmit={e => { e.preventDefault(); void query(); }}><div className="mb-5 flex items-center justify-between"><label htmlFor="access-key" className="text-xs font-medium">Chave de acesso</label><Button variant="link" type="button" className="h-auto p-0 text-[11px]" onClick={() => { setKey(makeKey(20)); setNumber('000000537'); setCompany('AUTO POSTO JATIENSE LTDA'); setResult(null); }}>Usar exemplo</Button></div><input id="access-key" className="fluent-input font-mono text-sm" placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000" value={formatKey(key)} onChange={e => { setKey(e.target.value.replace(/\D/g, '').slice(0, 44)); setResult(null); }} autoComplete="off"/><div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span className={attempted && !validKey(key) ? 'text-destructive' : ''}>{attempted && !validKey(key) ? 'Informe uma chave de acesso com exatamente 44 dígitos.' : 'Chave de acesso da NF-e'}</span><span>{key.length}/44 dígitos</span></div><div className="mt-6 grid grid-cols-[1fr_2fr] gap-4 max-sm:grid-cols-1"><label className="space-y-2 text-xs font-medium"><span>Número da NF <span className="font-normal text-muted-foreground">(opcional)</span></span><input className="fluent-input" placeholder="Ex.: 000000537" value={number} onChange={e => setNumber(e.target.value.replace(/\D/g, '').slice(0, 9))}/></label><label className="space-y-2 text-xs font-medium"><span>Razão social <span className="font-normal text-muted-foreground">(opcional)</span></span><input className="fluent-input" placeholder="Nome da empresa" value={company} onChange={e => setCompany(e.target.value)}/></label></div><div className="mt-6 border-t border-border pt-5"><Button type="submit" disabled={busy || !serviceOnline || !networkReady}>{busy ? <LoaderCircle className="animate-spin"/> : <Search/>}{busy ? 'Consultando e salvando…' : !serviceOnline ? 'API local offline' : !networkReady ? 'Aguardando rede local' : 'Consultar e salvar documentos'}</Button></div></form></section>{result && <section className="fluent-panel mt-5 max-w-4xl p-6"><div className="flex items-center gap-2 text-success"><CircleCheck size={20}/><h2 className="font-semibold">Nota processada</h2><span className="ml-auto rounded bg-success-soft px-2 py-1 text-[10px]">Arquivos salvos</span></div><div className="my-6 grid grid-cols-2 gap-4"><div><p className="text-xs text-muted-foreground">Número da NF</p><p className="mt-1 font-semibold">{result.number}</p></div><div><p className="text-xs text-muted-foreground">Razão social</p><p className="mt-1 font-medium">{result.company}</p></div></div><div className="flex items-center gap-3 border-t border-border pt-5"><FileCheck2 size={17} className="text-primary"/><span className="text-xs text-muted-foreground">{result.statusText}. Consulte a tela “Arquivos gerados” para baixar os três formatos.</span></div></section>}</div>;
}
