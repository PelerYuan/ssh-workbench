import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleOff,
  LoaderCircle,
  MonitorUp,
  Plus,
  Server,
  Terminal as TerminalIcon,
  X,
} from 'lucide-react';
import { ApiError, api, getErrorMessage } from './api';
import { Dialog } from './components/Dialog';
import { LoginScreen } from './components/LoginScreen';
import { SessionDialog } from './components/SessionDialog';
import { Sidebar, MobileHeader } from './components/Sidebar';
import { SourceDialog } from './components/SourceDialog';
import { TerminalView } from './components/TerminalView';
import type { SourceInput, SshSource, TerminalSession } from './types';
import { useI18n } from './I18nContext';

type ConfirmState =
  | { type: 'source'; source: SshSource }
  | { type: 'session'; session: TerminalSession }
  | { type: 'fingerprint'; source: SshSource; fingerprint: string };

type Toast = { id: number; kind: 'success' | 'error'; message: string };

export function App() {
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'anonymous' | 'unavailable'>('checking');
  const [initialError, setInitialError] = useState('');
  const [sources, setSources] = useState<SshSource[]>([]);
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sourceDialog, setSourceDialog] = useState<SshSource | 'new' | null>(null);
  const [sourceDialogError, setSourceDialogError] = useState('');
  const [savingSource, setSavingSource] = useState(false);
  const [sessionDialogSource, setSessionDialogSource] = useState<SshSource | 'choose' | null>(null);
  const [sessionDialogError, setSessionDialogError] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  const [busySourceId, setBusySourceId] = useState<string | null>(null);
  const [loadingWorkbench, setLoadingWorkbench] = useState(true);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const workspaceRef = useRef<HTMLElement>(null);

  const pushToast = useCallback((kind: Toast['kind'], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { id, kind, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500);
  }, []);

  const loadWorkbench = useCallback(async () => {
    setLoadingWorkbench(true);
    try {
      const [sourceResponse, sessionResponse] = await Promise.all([api.listSources(), api.listSessions()]);
      setSources(sourceResponse.sources);
      setSessions(sessionResponse.sessions);
      const available = sessionResponse.sessions.filter((session) => session.status !== 'ended');
      setActiveSessionId((current) => available.some((session) => session.id === current) ? current : available[0]?.id ?? null);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) pushToast('error', getErrorMessage(error));
    } finally {
      setLoadingWorkbench(false);
    }
  }, [pushToast]);

  useEffect(() => {
    api.getAuthSession().then(({ authenticated }) => {
      setAuthState(authenticated ? 'authenticated' : 'anonymous');
    }).catch((error) => {
      setInitialError(getErrorMessage(error));
      setAuthState('unavailable');
    });
    const unauthorized = () => setAuthState('anonymous');
    window.addEventListener('workbench:unauthorized', unauthorized);
    return () => window.removeEventListener('workbench:unauthorized', unauthorized);
  }, []);

  useEffect(() => {
    if (authState === 'authenticated') void loadWorkbench();
  }, [authState, loadWorkbench]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    if (drawerOpen) workspace.setAttribute('inert', '');
    else workspace.removeAttribute('inert');
    return () => workspace.removeAttribute('inert');
  }, [drawerOpen]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId && session.status !== 'ended') ?? null,
    [activeSessionId, sessions],
  );
  const activeSessions = useMemo(() => sessions.filter((session) => session.status !== 'ended'), [sessions]);

  const openSessionDialog = useCallback((source: SshSource | 'choose' = 'choose') => {
    setSessionDialogError('');
    setSessionDialogSource(source);
  }, []);

  const openSourceDialog = useCallback((source: SshSource | 'new' = 'new') => {
    setSourceDialogError('');
    setSourceDialog(source);
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const saveSource = async (input: SourceInput) => {
    setSavingSource(true);
    setSourceDialogError('');
    try {
      if (sourceDialog && sourceDialog !== 'new') {
        const { source } = await api.updateSource(sourceDialog.id, input);
        setSources((current) => current.map((item) => item.id === source.id ? source : item));
        pushToast('success', `${source.name} 已更新`);
      } else {
        const { source } = await api.createSource(input);
        setSources((current) => [...current, source]);
        pushToast('success', `${source.name} 已添加`);
      }
      setSourceDialog(null);
    } catch (error) {
      setSourceDialogError(getErrorMessage(error));
    } finally {
      setSavingSource(false);
    }
  };

  const testSource = async (source: SshSource) => {
    setDrawerOpen(false);
    setBusySourceId(source.id);
    try {
      const result = await api.testSource(source.id);
      if (source.hostFingerprint !== result.fingerprint) {
        setConfirmState({ type: 'fingerprint', source, fingerprint: result.fingerprint });
      } else {
        pushToast('success', `${source.name} 连接成功 · 主机指纹匹配`);
      }
    } catch (error) {
      if (error instanceof ApiError && ['HOST_KEY_UNKNOWN', 'HOST_KEY_CHANGED', 'HOST_KEY_MISMATCH', 'FINGERPRINT_REQUIRED', 'HOST_NOT_TRUSTED'].includes(error.code)) {
        const details = error.details as { fingerprint?: string; actualFingerprint?: string; actual?: string } | undefined;
        const fingerprint = details?.fingerprint ?? details?.actualFingerprint ?? details?.actual;
        if (fingerprint) setConfirmState({ type: 'fingerprint', source, fingerprint });
        else pushToast('error', error.message);
      } else {
        pushToast('error', getErrorMessage(error));
      }
    } finally {
      setBusySourceId(null);
    }
  };

  const createSession = async (sourceId: string, title: string) => {
    setCreatingSession(true);
    setSessionDialogError('');
    try {
      const { session } = await api.createSession(sourceId, title);
      setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)]);
      setActiveSessionId(session.id);
      setSessionDialogSource(null);
      setDrawerOpen(false);
    } catch (error) {
      setSessionDialogError(getErrorMessage(error));
    } finally {
      setCreatingSession(false);
    }
  };

  const confirmAction = async () => {
    if (!confirmState) return;
    setConfirming(true);
    try {
      if (confirmState.type === 'source') {
        await api.deleteSource(confirmState.source.id);
        setSources((current) => current.filter((source) => source.id !== confirmState.source.id));
        pushToast('success', `${confirmState.source.name} 已删除`);
      } else if (confirmState.type === 'session') {
        await api.terminateSession(confirmState.session.id);
        setSessions((current) => current.map((session) => session.id === confirmState.session.id ? { ...session, status: 'ended' } : session));
        setActiveSessionId((current) => current === confirmState.session.id ? null : current);
        pushToast('success', `${confirmState.session.title} 已终止`);
      } else {
        const { source } = await api.trustSource(confirmState.source.id, confirmState.fingerprint);
        setSources((current) => current.map((item) => item.id === source.id ? source : item));
        pushToast('success', `${source.name} 的主机指纹已信任`);
      }
      setConfirmState(null);
      await loadWorkbench();
    } catch (error) {
      pushToast('error', getErrorMessage(error));
    } finally {
      setConfirming(false);
    }
  };

  const updateSessionStatus = useCallback((id: string, status: TerminalSession['status'], lastError: string | null = null) => {
    setSessions((current) => current.map((session) => session.id === id && (session.status !== status || session.lastError !== lastError)
      ? { ...session, status, lastError }
      : session));
  }, []);

  const sessionTabsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = sessionTabsRef.current;
    if (!nav) return;

    const updateScrollIndicators = () => {
      const canScrollLeft = nav.scrollLeft > 0;
      const canScrollRight = nav.scrollLeft < nav.scrollWidth - nav.clientWidth - 1;
      nav.classList.toggle('has-scroll-left', canScrollLeft);
      nav.classList.toggle('has-scroll-right', canScrollRight);
    };

    updateScrollIndicators();
    nav.addEventListener('scroll', updateScrollIndicators);
    const observer = new ResizeObserver(updateScrollIndicators);
    observer.observe(nav);

    return () => {
      nav.removeEventListener('scroll', updateScrollIndicators);
      observer.disconnect();
    };
  }, [activeSessions.length]);

  if (authState === 'checking') return <LoadingScreen label="正在连接工作台" />;
  if (authState === 'unavailable') return <UnavailableScreen error={initialError} />;
  if (authState === 'anonymous') return <LoginScreen onAuthenticated={() => setAuthState('authenticated')} />;

  return (
    <div className="app-shell">
      <Sidebar
        open={drawerOpen}
        sources={sources}
        sessions={sessions}
        activeSessionId={activeSessionId}
        busySourceId={busySourceId}
        onClose={closeDrawer}
        onAddSource={() => { setDrawerOpen(false); openSourceDialog(); }}
        onEditSource={(source) => { setDrawerOpen(false); openSourceDialog(source); }}
        onDeleteSource={(source) => { setDrawerOpen(false); setConfirmState({ type: 'source', source }); }}
        onTestSource={testSource}
        onNewSession={(source) => { setDrawerOpen(false); openSessionDialog(source ?? 'choose'); }}
        onSelectSession={(session) => { setActiveSessionId(session.id); setDrawerOpen(false); }}
        onTerminateSession={(session) => { setDrawerOpen(false); setConfirmState({ type: 'session', session }); }}
        onLogout={async () => { try { await api.logout(); } finally { setAuthState('anonymous'); } }}
      />
      <main ref={workspaceRef} className={`workspace ${activeSessions.length > 0 ? 'workspace--with-tabs' : ''}`}>
        <MobileHeader onMenu={() => setDrawerOpen(true)} onNewSession={() => openSessionDialog()} canCreate={sources.length > 0} />
        {activeSessions.length > 0 && (
          <nav ref={sessionTabsRef} className="session-tabs" aria-label="Active sessions">
            {activeSessions.map((session) => (
              <div className={`session-tab ${session.id === activeSessionId ? 'is-active' : ''}`} key={session.id}>
                <button className="session-tab__main" type="button" onClick={() => setActiveSessionId(session.id)}>
                  <span>{session.title}</span>
                </button>
                <button
                  className="session-tab__terminate"
                  type="button"
                  onClick={() => setConfirmState({ type: 'session', session })}
                  aria-label="Terminate session"
                  title="Terminate session"
                >
                  <CircleOff size={15} />
                </button>
              </div>
            ))}
          </nav>
        )}
        <div className="workspace__content">
          {loadingWorkbench ? (
            <LoadingScreen label="正在加载主机与会话" />
          ) : activeSession ? (
            <TerminalView key={activeSession.id} session={activeSession} onStatus={updateSessionStatus} onTerminate={(session) => setConfirmState({ type: 'session', session })} />
          ) : (
            <EmptyWorkspace sources={sources} onAddSource={() => openSourceDialog()} onNewSession={() => openSessionDialog()} />
          )}
        </div>
      </main>

      {sourceDialog && <SourceDialog source={sourceDialog === 'new' ? undefined : sourceDialog} saving={savingSource} error={sourceDialogError} onClose={() => setSourceDialog(null)} onSave={saveSource} />}
      {sessionDialogSource && sources.length > 0 && <SessionDialog sources={sources} initialSourceId={sessionDialogSource === 'choose' ? undefined : sessionDialogSource.id} creating={creatingSession} error={sessionDialogError} onClose={() => setSessionDialogSource(null)} onCreate={createSession} />}
      {confirmState && <ConfirmDialog state={confirmState} confirming={confirming} onClose={() => setConfirmState(null)} onConfirm={confirmAction} />}

      <div className="toast-region" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`toast toast--${toast.kind}`} key={toast.id}>
            {toast.kind === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{toast.message}</span>
            <button type="button" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} aria-label="关闭通知"><X size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyWorkspace({ sources, onAddSource, onNewSession }: { sources: SshSource[]; onAddSource: () => void; onNewSession: () => void }) {
  return (
    <section className="empty-workspace">
      <div className="empty-workspace__icon"><TerminalIcon size={30} /></div>
      <h1>{sources.length ? '选择或创建一个终端会话' : '添加你的第一个 SSH 源'}</h1>
      <p>{sources.length ? '远端命令在 tmux 会话中持续运行，离开网页后也不会中断。' : '配置主机与加密凭据，随后即可从这里打开持久终端。'}</p>
      <button className="button button--primary" type="button" onClick={sources.length ? onNewSession : onAddSource}>
        {sources.length ? <MonitorUp size={17} /> : <Plus size={17} />}
        {sources.length ? '创建新会话' : '添加 SSH 源'}
      </button>
    </section>
  );
}

function ConfirmDialog({ state, confirming, onClose, onConfirm }: { state: ConfirmState; confirming: boolean; onClose: () => void; onConfirm: () => void }) {
  const fingerprint = state.type === 'fingerprint';
  const session = state.type === 'session';
  const title = fingerprint ? '信任主机指纹' : session ? '终止终端会话' : '删除 SSH 源';
  return (
    <Dialog title={title} onClose={onClose} size="small" locked={confirming} footer={
      <>
        <button className="button button--secondary" type="button" onClick={onClose} disabled={confirming}>取消</button>
        <button className={`button ${fingerprint ? 'button--primary' : 'button--danger'}`} type="button" onClick={onConfirm} disabled={confirming}>
          {confirming && <LoaderCircle className="spin" size={17} />}
          {fingerprint ? '信任并保存' : session ? '终止会话' : '确认删除'}
        </button>
      </>
    }>
      {fingerprint ? (
        <div className="confirmation-copy">
          <p>请先与服务器管理员核对 <strong>{state.source.name}</strong> 的主机指纹。信任后，未来指纹改变将阻止连接。</p>
          <code>{state.fingerprint}</code>
        </div>
      ) : session ? (
        <div className="confirmation-copy"><p>这会关闭远端 tmux 会话 <strong>{state.session.title}</strong> 及其中运行的所有进程，无法恢复。</p></div>
      ) : (
        <div className="confirmation-copy"><p>将删除 <strong>{state.source.name}</strong> 及其加密凭据。存在活动会话时服务器会阻止此操作。</p></div>
      )}
    </Dialog>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return <main className="status-screen"><LoaderCircle className="spin" size={25} /><p>{label}</p></main>;
}

function UnavailableScreen({ error }: { error: string }) {
  return <main className="status-screen status-screen--error"><Server size={27} /><h1>无法连接服务</h1><p>{error}</p><button className="button button--secondary" type="button" onClick={() => window.location.reload()}>重新加载</button></main>;
}
