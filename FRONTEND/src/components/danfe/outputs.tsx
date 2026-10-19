import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCheck, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, FileText, Folder, FolderOpen, Grid2X2, List, LoaderCircle, MoreHorizontal, Receipt, RefreshCw, Search, Tag, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useDanfe } from './store';
import { PageHeading, useWorkspaceModalOpen } from './shell';
import { countPrimaryPdfs, groupOutputPdfs, type Output, type OutputGroup, type OutputLayout } from '@/lib/danfe';

const layoutOptions: Array<{ value: Exclude<OutputLayout, 'danfe'>; label: string; icon: typeof FileText }> = [
  { value: 'simplificado', label: 'DANFE Simplificado', icon: FileText },
  { value: 'etiqueta', label: 'DANFE Etiqueta', icon: Tag },
  { value: 'varejo', label: 'DANFE Cupom Varejo', icon: Receipt },
];

type LayoutMenuState = {
  fileId: string;
  top: number;
  left: number;
};

function formatIcon(format: Output['format']) {
  return <FileText className="text-primary" size={19}/>;
}

function revealFileButton(file: Output, onReveal: (file: Output) => void, compact = false) {
  if (!file.path) {
    return <Button variant="ghost" size={compact ? 'icon' : 'sm'} className={compact ? 'size-7 p-0' : undefined} disabled title="Local do arquivo indisponível"><FolderOpen size={compact ? 14 : 13}/>{!compact && 'Indisponível'}</Button>;
  }

  return <Button variant={compact ? 'ghost' : 'outline'} size={compact ? 'icon' : 'sm'} className={compact ? 'size-7 p-0' : undefined} title={`Abrir local do ${file.layoutLabel || file.format}`} onClick={() => onReveal(file)}><FolderOpen size={compact ? 14 : 13}/>{!compact && 'Abrir local'}</Button>;
}

export function OutputsPage() {
  const { outputs, outputFolder, refreshOutputs, serviceOnline, openOutputFolder, openOutputFile, downloadOutputFile, generateOutputLayout } = useDanfe();
  const workspaceModalOpen = useWorkspaceModalOpen();
  const [search, setSearch] = useState('');
  const [grid, setGrid] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [preview, setPreview] = useState<Output | null>(null);
  const [pdfPreview, setPdfPreview] = useState<Output | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingLayout, setGeneratingLayout] = useState<string | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [layoutMenuState, setLayoutMenuState] = useState<LayoutMenuState | null>(null);
  const groupedPdfs = useMemo(() => groupOutputPdfs(outputs), [outputs]);
  const primaryPdfCount = countPrimaryPdfs(outputs);
  const needle = search.trim().toLocaleLowerCase();
  const filtered = groupedPdfs.filter(file => [file, ...file.layouts].some(document => {
    const searchable = `${document.id} ${document.number} ${document.company} ${document.key} ${document.layoutLabel || ''} ${document.format} ${document.url || ''}`.toLocaleLowerCase();
    return searchable.includes(needle);
  }));

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const startIndex = (currentPage - 1) * pageSize;
  const pageFiles = filtered.slice(startIndex, startIndex + pageSize);

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  async function refresh() {
    setRefreshing(true);
    await refreshOutputs();
    setRefreshing(false);
    toast.success('Lista de arquivos atualizada.');
  }

  async function revealFolder() {
    try {
      await openOutputFolder();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir a pasta configurada.');
    }
  }

  async function revealFile(file: Output) {
    if (!file.path) {
      toast.error('O local deste arquivo não está disponível.');
      return;
    }

    try {
      await openOutputFile(file.path);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível localizar o arquivo.');
    }
  }

  async function downloadFile(file: Output) {
    setDownloadingFile(file.id);
    try {
      const savedPath = await downloadOutputFile(file);
      toast.success(savedPath ? 'PDF salvo na pasta Downloads.' : 'Download do PDF iniciado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível baixar o PDF.');
    } finally {
      setDownloadingFile(null);
    }
  }

  function downloadButton(file: Output, compact = false) {
    const busy = downloadingFile === file.id;
    return <Button variant={compact ? 'ghost' : 'outline'} size={compact ? 'icon' : 'sm'} className={compact ? 'size-7 shrink-0 p-0' : undefined} title={`Baixar ${file.layoutLabel || file.format}`} aria-label={`Baixar ${file.layoutLabel || file.format}`} disabled={busy || (!file.path && !file.url)} onClick={() => void downloadFile(file)}>
      {busy ? <LoaderCircle size={14} className="animate-spin"/> : <Download size={14}/>} {!compact && 'Baixar'}
    </Button>;
  }

  async function generateLayout(file: Output, layout: Exclude<OutputLayout, 'danfe'>) {
    if (!file.key) {
      toast.error('A chave de acesso da nota fiscal não foi encontrada nos arquivos locais.');
      return;
    }

    const jobId = `${file.id}-${layout}`;
    setGeneratingLayout(jobId);
    try {
      const result = await generateOutputLayout(file.key, layout);
      await refreshOutputs();
      toast.success(`${result.layoutLabel} gerado e salvo com sucesso.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível gerar este layout.');
    } finally {
      setGeneratingLayout(null);
    }
  }

  useEffect(() => {
    if (workspaceModalOpen) {
      setLayoutMenuState(null);
      return;
    }
    if (!layoutMenuState) return;

    function closeOnOutside(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('[data-layout-menu]')) {
        setLayoutMenuState(null);
      }
    }

    function closeOnKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setLayoutMenuState(null);
    }

    function closeOnViewportChange(event: Event) {
      if (event.type === 'scroll' && event.target instanceof Element && event.target.closest('[data-layout-menu]')) return;
      setLayoutMenuState(null);
    }

    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnKey);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnKey);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [layoutMenuState, workspaceModalOpen]);

  function toggleLayoutMenu(file: OutputGroup, trigger: HTMLButtonElement) {
    if (workspaceModalOpen) return;
    if (layoutMenuState?.fileId === file.id) {
      setLayoutMenuState(null);
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const menuWidth = 288;
    const missingLayouts = layoutOptions.filter(option => !file.layouts.some(saved => saved.layout === option.value));
    const menuHeight = 48 + (file.layouts.length ? 24 + file.layouts.length * 48 : 0)
      + (missingLayouts.length ? 24 + missingLayouts.length * 32 : 0) + (file.key ? 0 : 32);
    const viewportPadding = 8;
    const belowTop = rect.bottom + 6;
    const aboveTop = rect.top - menuHeight - 6;
    const hasRoomBelow = belowTop + menuHeight <= window.innerHeight - viewportPadding;
    const top = hasRoomBelow ? belowTop : Math.max(viewportPadding, aboveTop);
    const left = Math.min(
      Math.max(viewportPadding, rect.right - menuWidth),
      Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding)
    );

    setLayoutMenuState({ fileId: file.id, top, left });
  }

  function layoutMenu(file: OutputGroup) {
    if (file.format !== 'PDF' || (file.layout || 'danfe') !== 'danfe') return null;

    return <button type="button" data-layout-menu aria-haspopup="menu" aria-expanded={layoutMenuState?.fileId === file.id} className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground" aria-label="Layouts do DANFE" title="Layouts do DANFE" onClick={event => { event.stopPropagation(); toggleLayoutMenu(file, event.currentTarget); }}><MoreHorizontal size={15}/></button>;
  }

  function layoutMenuPopup() {
    if (!layoutMenuState || workspaceModalOpen || typeof document === 'undefined') return null;

    const { fileId, top, left } = layoutMenuState;
    const file = groupedPdfs.find(item => item.id === fileId);
    if (!file) return null;
    const savedLayouts = layoutOptions.flatMap(option => {
      const saved = file.layouts.find(item => item.layout === option.value);
      return saved ? [{ ...option, file: saved }] : [];
    });
    const missingLayouts = layoutOptions.filter(option => !file.layouts.some(saved => saved.layout === option.value));
    const popup = <div data-layout-menu role="menu" aria-label="Layouts do DANFE" className="fixed z-40 w-72 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-xl" style={{ top, left, maxHeight: 'calc(100vh - 16px)' }} onClick={event => event.stopPropagation()}>
      <p className="px-2 py-1.5 text-xs font-semibold">Layouts do DANFE</p>
      <div className="my-1 h-px bg-muted"/>
      {savedLayouts.length > 0 && <>
        <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground">Layouts gerados</p>
        {savedLayouts.map(({ value, label, icon: Icon, file: saved }) => <div key={value} className="flex items-center gap-1">
          <button type="button" role="menuitem" aria-label={`Visualizar ${label}`} className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-2 text-left text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground" onClick={() => { setLayoutMenuState(null); openPreview(saved); }}>
            <Icon size={15} className="shrink-0 text-primary"/>
            <span className="min-w-0 flex-1"><span className="block truncate">{label}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{saved.size} • {saved.time}</span></span>
            <Search size={13} className="shrink-0 text-muted-foreground"/>
          </button>
          {downloadButton(saved, true)}
        </div>)}
      </>}
      {missingLayouts.length > 0 && <>
        {savedLayouts.length > 0 && <div className="my-1 h-px bg-muted"/>}
        <p className="px-2 py-1 text-[10px] font-medium text-muted-foreground">Gerar outro layout</p>
        {!file.key && <p className="px-2 py-1 text-[11px] text-muted-foreground">Chave de acesso da nota fiscal não encontrada.</p>}
        {missingLayouts.map(({ value, label, icon: Icon }) => {
        const jobId = `${file.id}-${value}`;
        const isBusy = generatingLayout === jobId;
        return <button key={value} type="button" role="menuitem" aria-label={`Gerar ${label}`} disabled={isBusy || !file.key} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50" onClick={() => { setLayoutMenuState(null); void generateLayout(file, value); }}>
          {isBusy ? <LoaderCircle className="animate-spin" size={15}/> : <Icon size={15}/>}<span>{label}</span>
        </button>;
        })}
      </>}
    </div>;

    return createPortal(popup, document.body);
  }

  function openPreview(file: Output) {
    if (file.format === 'PDF' && file.url) {
      setPdfPreview(file);
      return;
    }
    setPreview(file);
  }

  return <div className="page-enter">
    <PageHeading title="Arquivos gerados" description="Documentos PDF salvos pelo backend local.">
      <Button variant="outline" className="text-xs" onClick={() => void revealFolder()}><FolderOpen/>Ver pasta configurada</Button>
    </PageHeading>

    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-4 py-3 text-xs">
      <Folder size={16} className="text-primary"/>
      <span className="min-w-0 break-all text-muted-foreground">{outputFolder}</span>
      <span className="ml-auto flex items-center gap-1.5 text-success"><CheckCheck size={14}/>{primaryPdfCount} {primaryPdfCount === 1 ? 'PDF salvo' : 'PDFs salvos'}</span>
      <Button variant="outline" size="icon" className="size-7" title="Atualizar lista" onClick={() => void refresh()} disabled={refreshing}><RefreshCw className={refreshing ? 'animate-spin' : ''} size={13}/></Button>
    </div>

    <section className="fluent-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-muted-foreground"/>
            <input type="search" aria-label="Buscar arquivos PDF" className="fluent-input output-search-input h-9 w-64 text-xs" placeholder="Buscar PDF..." value={search} onChange={e => updateSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') updateSearch(''); }}/>
            {search && <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 size-7" title="Limpar pesquisa" onClick={() => updateSearch('')}><X size={13}/></Button>}
          </div>
          <Button variant="outline" size="icon" title={grid ? 'Visualizar lista' : 'Visualizar grade'} onClick={() => setGrid(!grid)}>{grid ? <List/> : <Grid2X2/>}</Button>
        </div>
      </div>

      {grid ? <div className="grid grid-cols-2 gap-4 p-5 lg:grid-cols-4">{pageFiles.map(file => <div key={file.id} className="rounded-md border border-border p-4">
        <div className="flex items-center justify-between">{formatIcon(file.format)}<div className="flex items-center gap-1">{layoutMenu(file)}{revealFileButton(file, revealFile, true)}</div></div>
        <p className="mt-3 truncate text-xs" title={`${file.number} - ${file.company}`}>{file.number} - {file.company}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">{file.layoutLabel || file.format} • {file.size}</p>
        {file.layouts.length > 0 && <p className="mt-1 text-[10px] text-primary">{file.layouts.length} {file.layouts.length === 1 ? 'layout gerado' : 'layouts gerados'}</p>}
        <Button variant="link" className="mt-2 h-auto p-0 text-[10px]" onClick={() => openPreview(file)}>Visualizar</Button>
      </div>)}</div> : <div className="overflow-auto"><table className="app-table">
        <thead><tr><th>Nome do arquivo</th><th>Formato</th><th>Tamanho</th><th>Gerado às</th><th className="text-right">Ação</th></tr></thead>
        <tbody>{pageFiles.map(file => <tr key={file.id}>
          <td><div className="flex items-center gap-3">{formatIcon(file.format)}<div className="min-w-0">
            <p className="max-w-[450px] truncate text-[11px]">{file.number} - {file.company}.{file.format.toLowerCase()}</p>
            {file.layouts.length > 0 && <p className="mt-0.5 text-[10px] text-primary">{file.layouts.length} {file.layouts.length === 1 ? 'layout gerado' : 'layouts gerados'}</p>}
          </div></div></td>
          <td><span className="rounded bg-success-soft px-2 py-1 text-[10px] text-success">{file.layoutLabel || file.format}</span></td>
          <td className="text-muted-foreground">{file.size}</td><td className="text-muted-foreground">{file.time}</td>
          <td><div className="flex items-center justify-end gap-1">{layoutMenu(file)}<Button variant="ghost" size="icon" title={`Visualizar ${file.format}`} aria-label={`Visualizar ${file.format}`} className="size-7 p-0" onClick={() => openPreview(file)}><Search size={14}/></Button>{revealFileButton(file, revealFile, true)}</div></td>
        </tr>)}</tbody>
      </table></div>}
      {!filtered.length && <p className="py-16 text-center text-xs text-muted-foreground">Nenhum PDF encontrado.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
        <div>
          <p aria-live="polite">{filtered.length ? startIndex + 1 : 0}–{startIndex + pageFiles.length} de {filtered.length} {filtered.length === 1 ? 'PDF' : 'PDFs'}</p>
          <p className="mt-1 text-[10px]">{serviceOnline ? 'Atualizado pelo backend local' : 'Backend offline'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2">
            Por página
            <select aria-label="Arquivos por página" className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </label>
          <nav aria-label="Paginação de arquivos" className="flex items-center gap-3">
            <span aria-live="polite">Página {currentPage} de {pages}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="size-8" aria-label="Primeira página" title="Primeira página" disabled={currentPage === 1} onClick={() => setPage(1)}><ChevronsLeft size={14}/></Button>
              <Button variant="outline" size="icon" className="size-8" aria-label="Página anterior" title="Página anterior" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={14}/></Button>
              <Button variant="outline" size="icon" className="size-8" aria-label="Próxima página" title="Próxima página" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={14}/></Button>
              <Button variant="outline" size="icon" className="size-8" aria-label="Última página" title="Última página" disabled={currentPage === pages} onClick={() => setPage(pages)}><ChevronsRight size={14}/></Button>
            </div>
          </nav>
        </div>
      </div>
    </section>

    {pdfPreview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4" onClick={() => setPdfPreview(null)}><section role="dialog" aria-modal="true" aria-label="Visualizador de PDF" className="flex h-[min(90vh,920px)] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}><header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3"><div className="flex min-w-0 items-center gap-2">{formatIcon('PDF')}<div className="min-w-0"><h2 className="text-sm font-semibold">Visualizador PDF</h2><p className="truncate text-[10px] text-muted-foreground">{pdfPreview.layoutLabel || 'DANFE'} • {pdfPreview.number} - {pdfPreview.company}</p></div></div><div className="flex items-center gap-1">{downloadButton(pdfPreview)}{(pdfPreview.layout || 'danfe') === 'danfe' && revealFileButton(pdfPreview, revealFile)}<Button variant="ghost" size="icon" title="Fechar visualizador" onClick={() => setPdfPreview(null)}><X/></Button></div></header><div className="min-h-0 flex-1 bg-muted p-2"><iframe src={pdfPreview.url} title={`PDF ${pdfPreview.number}`} className="h-full min-h-[500px] w-full rounded border border-border bg-white"/></div></section></div>}

    {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-6" onClick={() => setPreview(null)}><section role="dialog" aria-modal="true" aria-label="Detalhes do documento" className="fluent-panel w-full max-w-xl p-6" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between"><div className="flex items-center gap-2">{formatIcon(preview.format)}<h2 className="text-lg font-semibold">{preview.layoutLabel || `Documento ${preview.format}`}</h2></div><Button variant="ghost" size="icon" aria-label="Fechar detalhes" onClick={() => setPreview(null)}><X/></Button></div><div className="mt-6 space-y-4 border-y border-border py-5"><p className="font-medium">{preview.company}</p><p>Nota fiscal nº {preview.number}</p>{preview.key && <p className="break-all font-mono text-xs text-muted-foreground">Chave de acesso: {preview.key}</p>}<p className="text-xs text-muted-foreground">Formato: {preview.format} • Tamanho: {preview.size} • Gerado às {preview.time}</p><p className="break-words font-mono text-xs text-muted-foreground">{preview.path || 'Local do arquivo indisponível no momento.'}</p></div><div className="mt-5 flex gap-2">{revealFileButton(preview, revealFile)}<Button variant="outline" onClick={() => setPreview(null)}>Fechar</Button></div></section></div>}
    {layoutMenuPopup()}
  </div>;
}
