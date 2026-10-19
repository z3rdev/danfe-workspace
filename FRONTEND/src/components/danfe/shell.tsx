import { Link, useRouterState } from '@tanstack/react-router';
import type { Update } from '@tauri-apps/plugin-updater';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Activity, ArrowUpRight, Boxes, CheckCircle2, ChevronRight, CircleAlert, CircleHelp, Database, Download, FileCheck2, Files, Folder, Layers, LoaderCircle, Minus, Moon, PanelLeftClose, PanelLeftOpen, RefreshCw, Rocket, Search, Settings2, ShieldCheck, Square, Sun, Terminal, Wifi, WifiOff, X, Zap } from 'lucide-react';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { checkNativeUpdate, installNativeUpdate } from '@/lib/native-updater';
import { countPrimaryPdfs } from '@/lib/danfe';
import { useDanfe } from './store';

const navigation = [
  { to: '/', label: 'Processamento em lote', icon: Layers },
  { to: '/consulta', label: 'Consulta rápida', icon: Search },
  { to: '/saidas', label: 'Arquivos gerados', icon: Files },
  { to: '/logs', label: 'Terminal de logs', icon: Terminal },
  { to: '/consulta-automatica', label: 'Consulta automática', icon: Activity },
  { to: '/configuracoes', label: 'Configurações', icon: Settings2 },
  { to: '/desenvolvimento', label: 'Publicar versão', icon: Rocket },
] as const;

type UpdateModalStatus = 'idle' | 'checking' | 'available' | 'installing' | 'upToDate' | 'installed' | 'error';

const WorkspaceModalContext = createContext(false);

export function useWorkspaceModalOpen() {
  return useContext(WorkspaceModalContext);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { dark, setDark, outputs, running, outputFolder, serviceOnline, networkStatus, databaseStatus, databaseAutomation, developmentMode, stopDatabaseAutomation, openOutputFolder, externalCapture, externalCaptureBusy, confirmExternalCapture, dismissExternalCapture } = useDanfe();
  const [collapsed, setCollapsed] = useState(false);
  const [help, setHelp] = useState(false);
  const [automaticModal, setAutomaticModal] = useState<'running' | 'finished' | null>(null);
  const [updateModal, setUpdateModal] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateModalStatus>('idle');
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updateError, setUpdateError] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [developmentModeModal, setDevelopmentModeModal] = useState(false);
  const workspaceModalOpen = Boolean(externalCapture || automaticModal || updateModal || developmentModeModal || help);
  const automationWasRunning = useRef(false);
  const openedAutomationRun = useRef<string | null>(null);
  const developmentModeWasEnabled = useRef(false);
  const path = useRouterState({ select: state => state.location.pathname });
  const visibleNavigation = developmentMode ? navigation : navigation.filter(item => item.to !== '/desenvolvimento');
  const primaryPdfCount = countPrimaryPdfs(outputs);
  const statusLabel = serviceOnline ? 'API local online' : 'API local offline';
  const NetworkIcon = networkStatus.state === 'checking' ? RefreshCw : networkStatus.online ? Wifi : WifiOff;
  const networkName = networkStatus.wifiName || (networkStatus.online ? 'Rede local conectada' : 'Wi-Fi não identificado');
  const isDesktop = window.location.protocol === 'tauri:' || window.location.hostname.endsWith('.localhost');

  useEffect(() => {
    if (!isDesktop) return;

    let cancelled = false;
    void checkNativeUpdate()
      .then(({ update }) => {
        if (cancelled) {
          void update?.close();
          return;
        }
        if (!update) return;
        setAvailableUpdate(update);
        setUpdateStatus('available');
        setUpdateModal(true);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isDesktop]);

  useEffect(() => {
    if (databaseAutomation.running) {
      automationWasRunning.current = true;
      setAutomaticModal('running');
      return;
    }

    if (automationWasRunning.current && databaseAutomation.finishedAt) {
      automationWasRunning.current = false;
      setAutomaticModal('finished');
    }
  }, [databaseAutomation.running, databaseAutomation.finishedAt]);

  useEffect(() => {
    const downloaded = databaseAutomation.result?.downloaded ?? 0;
    const shouldOpenFolder = databaseAutomation.result?.autoDownload === true && downloaded > 0;
    if (automaticModal !== 'finished' || !shouldOpenFolder || !databaseAutomation.runId || outputFolder === 'Carregando...' || openedAutomationRun.current === databaseAutomation.runId) return;
    openedAutomationRun.current = databaseAutomation.runId;
    void openOutputFolder().catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir a pasta de saída.');
    });
  }, [automaticModal, databaseAutomation.runId, openOutputFolder, outputFolder]);

  useEffect(() => {
    if (!developmentMode) {
      developmentModeWasEnabled.current = false;
      return;
    }

    if (!developmentModeWasEnabled.current) {
      developmentModeWasEnabled.current = true;
      setDevelopmentModeModal(true);
    }
  }, [developmentMode]);

  async function checkForUpdates() {
    setHelp(false);
    setUpdateModal(true);
    setUpdateStatus('checking');
    setUpdateError('');
    setDownloadProgress(0);

    try {
      const result = await checkNativeUpdate();
      if (!result.supported) {
        throw new Error('A atualização nativa está disponível somente no aplicativo instalado.');
      }

      setAvailableUpdate(result.update);
      setUpdateStatus(result.update ? 'available' : 'upToDate');
    } catch (error) {
      setAvailableUpdate(null);
      setUpdateStatus('error');
      const detail = error instanceof Error ? error.message : '';
      setUpdateError(/endpoint|configur/i.test(detail)
        ? 'O servidor de atualização ainda não foi configurado nesta versão.'
        : detail || 'Não foi possível verificar atualizações.');
    }
  }

  async function installUpdate() {
    if (!availableUpdate) return;

    setUpdateStatus('installing');
    setDownloadProgress(0);
    try {
      await installNativeUpdate(availableUpdate, (downloaded, total) => {
        if (total) setDownloadProgress(Math.min(100, Math.round((downloaded / total) * 100)));
      });
      setUpdateStatus('installed');
    } catch (error) {
      setUpdateStatus('error');
      setUpdateError(error instanceof Error ? error.message : 'Não foi possível instalar a atualização.');
    }
  }

  function closeUpdateModal() {
    if (updateStatus === 'installing') return;
    void availableUpdate?.close().catch(() => undefined);
    setAvailableUpdate(null);
    setUpdateModal(false);
  }

  function minimizeWindow() {
    if (!isDesktop) {
      toast.info('O controle da janela fica disponível no aplicativo nativo.');
      return;
    }
    void getCurrentWindow().minimize();
  }

  function toggleWindowSize() {
    if (!isDesktop) {
      toast.info('O controle da janela fica disponível no aplicativo nativo.');
      return;
    }
    void getCurrentWindow().toggleMaximize();
  }

  function closeWindow() {
    if (!isDesktop) {
      toast.info('Para encerrar, feche esta aba do navegador.');
      return;
    }
    void getCurrentWindow().close();
  }

  async function interruptAutomatic() {
    try {
      await stopDatabaseAutomation();
      toast.info('Interrupção solicitada. O item atual será encerrado com segurança.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível interromper a consulta automática.');
    }
  }

  return <WorkspaceModalContext.Provider value={workspaceModalOpen}><div className="desktop-app-root flex h-screen flex-col overflow-hidden bg-background">
    <header data-tauri-drag-region className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 bg-sidebar pl-4">
      <div className="flex items-center gap-2.5"><img src="/assets/Danfe.webp" alt="DANFE" className="size-6 rounded-md object-cover"/><span className="text-xs font-semibold">DANFE <span className="ml-1 font-normal text-muted-foreground">Workspace</span></span><span className="ml-3 rounded border border-border px-1.5 py-0.5 text-[9px] font-medium tracking-wider text-muted-foreground">LOCAL</span></div>
      <div className="flex h-full items-center"><span className={`mr-4 hidden items-center gap-1.5 text-[10px] sm:flex ${serviceOnline ? 'text-success' : 'text-muted-foreground'}`}><span className={`size-1.5 rounded-full ${serviceOnline ? 'bg-success' : 'bg-muted-foreground'}`}/>{statusLabel}</span><Button size="icon" variant="ghost" title="Minimizar janela" aria-label="Minimizar" className="h-full w-11 rounded-none" onClick={minimizeWindow}><Minus size={14}/></Button><Button size="icon" variant="ghost" title="Maximizar ou restaurar janela" aria-label="Maximizar ou restaurar" className="h-full w-11 rounded-none" onClick={toggleWindowSize}><Square size={12}/></Button><Button size="icon" variant="ghost" title="Ocultar na bandeja" aria-label="Ocultar na bandeja" className="h-full w-11 rounded-none hover:bg-destructive hover:text-destructive-foreground" onClick={closeWindow}><X size={16}/></Button></div>
    </header>
    <div className="flex min-h-0 flex-1">
      <aside className={`${collapsed ? 'w-[68px]' : 'w-[238px]'} flex shrink-0 flex-col border-r border-border/70 bg-sidebar transition-[width] max-md:w-[60px]`}>
        <div className="flex h-[70px] items-center justify-between px-5"><span className={`${collapsed ? 'hidden' : 'max-md:hidden'} text-[10px] font-semibold tracking-[1.5px] text-muted-foreground`}>ESPAÇO DE TRABALHO</span><Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" title={collapsed ? 'Expandir navegação' : 'Recolher navegação'} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen/> : <PanelLeftClose/>}</Button></div>
        <nav className="space-y-1 px-2.5">{visibleNavigation.map(({ to, label, icon: Icon }) => <Button key={to} asChild variant="ghost" className={`relative h-11 w-full justify-start gap-3 px-3 text-xs ${path === to ? 'bg-accent font-semibold text-accent-foreground before:absolute before:left-0 before:h-5 before:w-[3px] before:rounded-full before:bg-primary' : 'text-muted-foreground'}`} title={label}><Link to={to}><Icon size={18}/><span className={`${collapsed ? 'hidden' : 'max-md:hidden'}`}>{label}</span>{to === '/saidas' && !collapsed && <span className="ml-auto rounded bg-card/70 px-1.5 py-0.5 text-[10px] max-md:hidden">{primaryPdfCount}</span>}</Link></Button>)}</nav>
        <div className={`mx-5 mt-8 border-t border-border pt-6 ${collapsed ? 'hidden' : 'max-md:hidden'}`}><div className="mb-4 text-[10px] font-semibold tracking-[1.5px] text-muted-foreground">SERVIÇOS CONECTADOS</div><div className="flex items-center gap-2.5"><div className="flex size-8 items-center justify-center rounded-md border border-border bg-card"><Boxes size={16} className="text-muted-foreground"/></div><div className="flex-1"><div className="text-xs font-medium">API DANFE local</div><div className="mt-0.5 text-[10px] text-muted-foreground">127.0.0.1:3000</div></div><span className={`size-1.5 rounded-full ${serviceOnline ? 'bg-success' : 'bg-muted-foreground'}`}/></div><div className="mt-4 flex items-center gap-2.5"><div className="flex size-8 items-center justify-center rounded-md border border-border bg-card"><ShieldCheck size={16} className="text-muted-foreground"/></div><div className="flex-1"><div className="text-xs font-medium">Consulta DANFE</div><div className="mt-0.5 text-[10px] text-muted-foreground">Consultas pelo backend</div></div><span className={`size-1.5 rounded-full ${serviceOnline ? 'bg-success' : 'bg-muted-foreground'}`}/></div><div className="mt-4 flex items-center gap-2.5"><div className="flex size-8 items-center justify-center rounded-md border border-border bg-card"><NetworkIcon size={16} className={networkStatus.state === 'checking' ? 'animate-spin text-warning' : networkStatus.online ? 'text-success' : 'text-destructive'}/></div><div className="min-w-0 flex-1"><div className="text-xs font-medium">Rede de consulta</div><div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={networkName}>{networkName}{networkStatus.online && networkStatus.latencyMs !== null ? ` - ${networkStatus.latencyMs} ms` : networkStatus.state === 'checking' ? ' - Verificando...' : ' - Sem resposta'}</div></div><span className={`size-1.5 rounded-full ${networkStatus.online ? 'bg-success' : networkStatus.state === 'checking' ? 'bg-warning' : 'bg-destructive'}`}/></div><div className="mt-4 flex items-center" title={`Banco NFEIDIST: ${databaseStatus.state === 'checking' ? 'verificando' : databaseStatus.online ? 'online' : 'offline'}`}><div className="flex size-8 items-center justify-center rounded-md border border-border bg-card"><Database size={16} className={databaseStatus.state === 'checking' ? 'animate-pulse text-warning' : databaseStatus.online ? 'text-success' : 'text-destructive'}/></div></div></div>
        <div className="flex-1"/>
        {!collapsed && <div className="mx-4 mb-5 rounded-md border border-border bg-card/60 p-3 max-md:hidden"><div className="flex items-center gap-2 text-xs font-medium"><Zap size={14} className="text-primary"/>{serviceOnline ? 'Serviço pronto' : 'Aguardando backend'}</div><p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">Arquivos e consultas ficam<br/>salvos no computador.</p><div className="mt-3 flex items-center justify-between border-t border-border pt-2.5 text-[10px] text-muted-foreground"><span>API local</span><span className="flex items-center gap-1"><span className={`size-1 rounded-full ${serviceOnline ? 'bg-success' : 'bg-muted-foreground'}`}/>{serviceOnline ? 'Online' : 'Offline'}</span></div></div>}
        <div className="space-y-1 border-t border-border p-2.5"><Button variant="ghost" className="h-10 w-full justify-start gap-3 px-3 text-xs text-muted-foreground" title="Alternar tema" onClick={() => setDark(!dark)}>{dark ? <Sun/> : <Moon/>}<span className={collapsed ? 'hidden' : 'max-md:hidden'}>{dark ? 'Modo claro' : 'Modo escuro'}</span><span className={`ml-auto rounded-full border border-border px-1.5 text-[9px] ${collapsed ? 'hidden' : 'max-md:hidden'}`}>{dark ? 'ON' : 'OFF'}</span></Button><Button variant="ghost" className="h-9 w-full justify-start gap-3 px-3 text-xs text-muted-foreground" title="Sobre o DANFE" onClick={() => setHelp(true)}><CircleHelp/><span className={collapsed ? 'hidden' : 'max-md:hidden'}>Ajuda e informações</span><ArrowUpRight size={12} className={`ml-auto ${collapsed ? 'hidden' : 'max-md:hidden'}`}/></Button></div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-auto scroll-slim"><div className="flex h-[53px] shrink-0 items-center justify-between border-b border-border/70 px-8 max-md:px-4"><div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span>Workspace</span><ChevronRight size={12}/><span className="text-foreground">{visibleNavigation.find(item => item.to === path)?.label}</span></div><div className="flex gap-2"><span className="flex items-center gap-1.5 rounded border border-border bg-card px-2 py-1 text-[10px]"><span className={`size-1.5 rounded-full ${serviceOnline ? 'bg-success' : 'bg-muted-foreground'}`}/>{statusLabel}</span></div></div><main className="w-full p-8 pb-6 max-lg:p-5 max-md:p-4">{children}</main></div>
    </div>
    <footer className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-border bg-sidebar px-4 text-[10px] text-muted-foreground"><div className="flex min-w-0 items-center gap-2"><Folder size={12}/><span className="truncate">{outputFolder}</span></div><div className="flex shrink-0 items-center gap-5"><span className="hidden items-center gap-1.5 sm:flex"><span className={`size-1.5 rounded-full ${running ? 'bg-info animate-pulse' : serviceOnline ? 'bg-success' : 'bg-muted-foreground'}`}/>{running ? 'Processando' : serviceOnline ? 'Pronto' : 'Backend offline'}</span><span>{primaryPdfCount} {primaryPdfCount === 1 ? 'PDF' : 'PDFs'}</span><span className="hidden border-l border-border pl-4 md:block">UTF-8</span></div></footer>
    {externalCapture && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/25 p-5" onClick={() => !externalCaptureBusy && void dismissExternalCapture()}><section role="dialog" aria-modal="true" aria-label="Confirmar texto recebido da extensao" className="fluent-panel w-full max-w-2xl p-5 shadow-xl" onClick={event => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-primary">Texto recebido da extensao</p><h2 className="mt-1 text-xl font-semibold">Confirmar envio para o DANFE</h2><p className="mt-1 text-xs text-muted-foreground">A extensao encontrou informacoes de NF-e copiadas no navegador.</p></div><Button variant="ghost" size="icon" className="shrink-0" title="Cancelar envio" aria-label="Cancelar envio" disabled={externalCaptureBusy} onClick={() => void dismissExternalCapture()}><X size={17}/></Button></div><div className="mt-5 grid grid-cols-3 gap-3"><div className="rounded-md border border-border bg-card p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Chaves</div><div className="mt-1 text-xl font-semibold">{externalCapture.chaves}</div></div><div className="rounded-md border border-border bg-card p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Linhas</div><div className="mt-1 text-xl font-semibold">{externalCapture.linhas}</div></div><div className="rounded-md border border-border bg-card p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Origem</div><div className="mt-1 truncate text-sm font-semibold">Navegador</div></div></div><label className="mt-5 block text-xs font-medium" htmlFor="extensionCapturePreview">Previa do texto copiado</label><textarea id="extensionCapturePreview" className="mt-2 min-h-48 w-full resize-none rounded-md border border-border bg-muted/20 p-3 font-mono text-xs leading-relaxed outline-none" value={externalCapture.texto} readOnly/><div className="mt-5 flex justify-end gap-2"><Button variant="outline" disabled={externalCaptureBusy} onClick={() => void dismissExternalCapture()}>Cancelar</Button><Button disabled={externalCaptureBusy} onClick={() => void confirmExternalCapture()}>{externalCaptureBusy ? 'Processando...' : 'Enviar para o DANFE'}</Button></div></section></div>}
    {automaticModal && <div className="fixed inset-0 z-[55] flex items-center justify-center bg-foreground/25 p-5" onClick={() => automaticModal === 'finished' && setAutomaticModal(null)}><section role="dialog" aria-modal="true" aria-label={automaticModal === 'running' ? 'Consulta automática em andamento' : 'Consulta automática concluída'} className="fluent-panel w-full max-w-lg p-6 shadow-xl" onClick={event => event.stopPropagation()}><div className="flex items-start gap-3"><div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${automaticModal === 'running' ? 'bg-info-soft text-info' : databaseAutomation.phase === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-success-soft text-success'}`}>{automaticModal === 'running' ? <Activity size={20} className="animate-pulse"/> : <CheckCircle2 size={20}/>}</div><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[1.4px] text-primary">Consulta automática</p><h2 className="mt-1 text-lg font-semibold">{automaticModal === 'running' ? 'Consulta em andamento' : databaseAutomation.phase === 'erro' ? 'Consulta finalizada com erro' : databaseAutomation.phase === 'interrompida' ? 'Consulta interrompida' : 'Consulta finalizada'}</h2><p className="mt-1 text-xs text-muted-foreground">{automaticModal === 'running' ? 'O DANFE está consultando o banco e processando as notas configuradas.' : databaseAutomation.result?.message || ((databaseAutomation.result?.autoDownload && (databaseAutomation.result?.downloaded ?? 0) > 0) ? 'A execução foi concluída e a pasta configurada foi aberta.' : 'A execução foi concluída. Nenhum download automático foi realizado.')}</p></div></div>{automaticModal === 'running' ? <div className="mt-6"><div className="flex items-center justify-between text-xs"><span className="font-medium">{databaseAutomation.phase === 'consultando' ? 'Buscando registros no banco...' : databaseAutomation.phase === 'baixando' ? 'Baixando documentos...' : 'Finalizando...'}</span><span className="text-muted-foreground">{databaseAutomation.current} de {databaseAutomation.total || 0}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${databaseAutomation.total ? Math.min(100, (databaseAutomation.current / databaseAutomation.total) * 100) : 10}%` }}/></div><p className="mt-3 text-[11px] text-muted-foreground">Você pode interromper a consulta a qualquer momento.</p></div> : <div className="mt-5 grid grid-cols-3 gap-3"><div className="rounded-md border border-border bg-card p-3"><div className="text-[10px] text-muted-foreground">Encontradas</div><div className="mt-1 text-lg font-semibold">{databaseAutomation.result?.total ?? 0}</div></div><div className="rounded-md border border-border bg-card p-3"><div className="text-[10px] text-muted-foreground">Baixadas</div><div className="mt-1 text-lg font-semibold">{databaseAutomation.result?.downloaded ?? 0}</div></div><div className="rounded-md border border-border bg-card p-3"><div className="text-[10px] text-muted-foreground">Falhas</div><div className="mt-1 text-lg font-semibold">{databaseAutomation.result?.failed ?? 0}</div></div></div>}<div className="mt-6 flex justify-end gap-2">{automaticModal === 'running' ? <Button variant="outline" onClick={() => void interruptAutomatic()} disabled={databaseAutomation.stopRequested}>{databaseAutomation.stopRequested ? 'Interrompendo...' : 'Interromper'}</Button> : <><Button variant="outline" onClick={() => void openOutputFolder()}>Abrir pasta</Button><Button onClick={() => setAutomaticModal(null)}>Entendido</Button></>}</div></section></div>}
    {developmentModeModal && <div className="fixed inset-0 z-[75] flex items-center justify-center bg-foreground/25 p-5" onClick={() => setDevelopmentModeModal(false)}><section role="dialog" aria-modal="true" aria-label="Modo de desenvolvimento habilitado" className="fluent-panel w-full max-w-md p-6 shadow-xl" onClick={event => event.stopPropagation()}><div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning"><Rocket size={20}/></div><div><p className="text-[10px] font-semibold uppercase tracking-[1.4px] text-warning">Modo de desenvolvimento</p><h2 className="mt-1 text-lg font-semibold">Modo dev habilitado</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">O painel de publicação de versões foi liberado para este backend.</p><p className="mt-2 text-xs text-muted-foreground">A opção <span className="font-medium text-foreground">Publicar versão</span> está disponível no menu lateral.</p></div></div><div className="mt-6 flex justify-end"><Button onClick={() => setDevelopmentModeModal(false)}>Entendido</Button></div></section></div>}
    {updateModal && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/25 p-5" onClick={() => updateStatus !== 'installing' && closeUpdateModal()}><section role="dialog" aria-modal="true" aria-label="Atualização do aplicativo" className="fluent-panel w-full max-w-lg p-6 shadow-xl" onClick={event => event.stopPropagation()}><div className="flex items-start gap-3"><div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${updateStatus === 'error' ? 'bg-destructive/10 text-destructive' : updateStatus === 'upToDate' || updateStatus === 'installed' ? 'bg-success-soft text-success' : 'bg-info-soft text-info'}`}>{updateStatus === 'error' ? <CircleAlert size={20}/> : updateStatus === 'upToDate' || updateStatus === 'installed' ? <CheckCircle2 size={20}/> : updateStatus === 'installing' || updateStatus === 'checking' ? <LoaderCircle size={20} className="animate-spin"/> : <Download size={20}/>}</div><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[1.4px] text-primary">Atualização nativa</p><h2 className="mt-1 text-lg font-semibold">{updateStatus === 'checking' ? 'Verificando atualizações' : updateStatus === 'available' ? `Nova versão ${availableUpdate?.version}` : updateStatus === 'installing' ? 'Instalando atualização' : updateStatus === 'installed' ? 'Atualização instalada' : updateStatus === 'upToDate' ? 'Aplicativo atualizado' : 'Não foi possível atualizar'}</h2><p className="mt-1 text-xs text-muted-foreground">{updateStatus === 'checking' ? 'Aguarde um instante.' : updateStatus === 'available' ? 'Existe uma nova versão do DANFE Workspace.' : updateStatus === 'installing' ? 'O aplicativo será reiniciado quando a instalação terminar.' : updateStatus === 'installed' ? 'A atualização foi preparada. Abra o aplicativo novamente para usar a nova versão.' : updateStatus === 'upToDate' ? 'Você já está usando a versão mais recente disponível.' : updateError || 'Não foi possível verificar o servidor de atualização.'}</p></div></div>{availableUpdate?.body && updateStatus === 'available' && <div className="mt-5 max-h-32 overflow-auto rounded-md border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground">{availableUpdate.body}</div>}{updateStatus === 'installing' && <div className="mt-5"><div className="flex items-center justify-between text-xs"><span>Download em andamento</span><span>{downloadProgress ? `${downloadProgress}%` : 'Aguarde...'}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${downloadProgress || 8}%` }}/></div></div>}<div className="mt-6 flex justify-end gap-2">{updateStatus === 'available' ? <><Button variant="outline" onClick={closeUpdateModal}>Depois</Button><Button onClick={() => void installUpdate()}>Atualizar agora</Button></> : updateStatus === 'checking' || updateStatus === 'installing' ? null : <Button onClick={closeUpdateModal}>{updateStatus === 'error' ? 'Fechar' : 'Entendido'}</Button>}</div></section></div>}
    {help && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-5" onClick={() => setHelp(false)}><section role="dialog" aria-modal="true" aria-label="Sobre o DANFE" className="fluent-panel max-w-md p-6" onClick={e => e.stopPropagation()}><FileCheck2 className="mb-4 text-primary" size={32}/><h2 className="text-xl font-semibold">DANFE Workspace</h2><p className="mt-3 leading-relaxed text-muted-foreground">Acompanhe consultas, processe lotes e baixe os documentos fiscais.</p><p className="mt-2 leading-relaxed text-muted-foreground">O backend consulta a API DANFE e salva PDF, XML e JSON nas pastas configuradas.</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => void checkForUpdates()}>Verificar atualizações</Button><Button onClick={() => setHelp(false)}>Entendido</Button></div></section></div>}
  </div></WorkspaceModalContext.Provider>;
}

export function PageHeading({ title, description, children }: { title: string; description: string; children?: ReactNode }) { return <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-[28px] font-semibold leading-tight">{title}</h1><p className="mt-2 text-xs text-muted-foreground">{description}</p></div>{children}</div>; }
