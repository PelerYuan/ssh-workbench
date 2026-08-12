import { useEffect, useRef } from 'react';
import {
  Cable,
  CircleDot,
  CircleOff,
  Ellipsis,
  LogOut,
  Menu,
  Pencil,
  Play,
  Plus,
  Server,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import type { SshSource, TerminalSession } from '../types';
import { useI18n } from '../I18nContext';

interface SidebarProps {
  open: boolean;
  sources: SshSource[];
  sessions: TerminalSession[];
  activeSessionId: string | null;
  busySourceId: string | null;
  onClose: () => void;
  onAddSource: () => void;
  onEditSource: (source: SshSource) => void;
  onDeleteSource: (source: SshSource) => void;
  onTestSource: (source: SshSource) => void;
  onNewSession: (source?: SshSource) => void;
  onSelectSession: (session: TerminalSession) => void;
  onTerminateSession: (session: TerminalSession) => void;
  onLogout: () => void;
}

export function Sidebar({
  open,
  sources,
  sessions,
  activeSessionId,
  busySourceId,
  onClose,
  onAddSource,
  onEditSource,
  onDeleteSource,
  onTestSource,
  onNewSession,
  onSelectSession,
  onTerminateSession,
  onLogout,
}: SidebarProps) {
  const { t, language, setLanguage } = useI18n();
  const activeSessions = sessions.filter((session) => session.status !== 'ended');
  const sidebarRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => {
      const inside = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? []).filter((element) => !element.hidden);
      const scrim = scrimRef.current;
      if (scrim && !scrim.hidden && !scrim.disabled) inside.push(scrim);
      return inside;
    };
    const frame = window.requestAnimationFrame(() => focusable()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      window.requestAnimationFrame(() => {
        const currentFocus = document.activeElement;
        const focusStillInDrawer = currentFocus === document.body
          || sidebarRef.current?.contains(currentFocus)
          || currentFocus === scrimRef.current;
        if (!openRef.current && previousFocus?.isConnected && focusStillInDrawer) previousFocus.focus();
      });
    };
  }, [onClose, open]);

  return (
    <>
      <button ref={scrimRef} className={`drawer-scrim ${open ? 'is-visible' : ''}`} type="button" aria-label={t('cancel')} onClick={onClose} tabIndex={open ? 0 : -1} />
      <aside ref={sidebarRef} className={`sidebar ${open ? 'is-open' : ''}`} aria-label="SSH Workbench">
        <header className="sidebar__header">
          <div className="brand-mark"><Server size={19} aria-hidden="true" /></div>
          <div className="brand-copy">
            <strong>SSH Workbench</strong>
            <span>PRIVATE CONSOLE</span>
          </div>
          <button className="icon-button sidebar-close" type="button" onClick={onClose} aria-label={t('cancel')}><X size={19} /></button>
        </header>

        <div className="sidebar__scroll">
          <section className="nav-section" aria-labelledby="sources-title">
            <div className="section-heading">
              <h2 id="sources-title">{t('sshSources')}</h2>
              <span>{sources.length}</span>
              <button className="icon-button icon-button--small" type="button" onClick={onAddSource} aria-label={t('addSource')} title={t('addSource')}><Plus size={16} /></button>
            </div>
            <div className="nav-list">
              {sources.length === 0 && (
                <button className="nav-empty" type="button" onClick={onAddSource}>
                  <Plus size={17} /> {t('addSource')}
                </button>
              )}
              {sources.map((source) => (
                <article className="source-row" key={source.id}>
                  <button className="source-row__main" type="button" onClick={() => onNewSession(source)} title={`${t('connecting')} ${source.name}`}>
                    <span className="source-icon"><Server size={16} /></span>
                    <span className="source-copy">
                      <strong>{source.name}</strong>
                      <span>{source.username}@{source.host}:{source.port}</span>
                    </span>
                  </button>
                  <div className="source-actions">
                    <button className="icon-button icon-button--small" type="button" onClick={() => onTestSource(source)} disabled={busySourceId === source.id} aria-label={`${t('test')} ${source.name}`} title={t('test')}>
                      {busySourceId === source.id ? <Ellipsis className="pulse" size={15} /> : <ShieldCheck size={15} />}
                    </button>
                    <button className="icon-button icon-button--small" type="button" onClick={() => onEditSource(source)} aria-label={`${t('edit')} ${source.name}`} title={t('edit')}><Pencil size={15} /></button>
                    <button className="icon-button icon-button--small icon-button--danger" type="button" onClick={() => onDeleteSource(source)} aria-label={`${t('delete')} ${source.name}`} title={t('delete')}><Trash2 size={15} /></button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="nav-section nav-section--sessions" aria-labelledby="sessions-title">
            <div className="section-heading">
              <h2 id="sessions-title">{t('activeSessions')}</h2>
              <span>{activeSessions.length}</span>
              <button className="icon-button icon-button--small" type="button" onClick={() => onNewSession()} disabled={sources.length === 0} aria-label={t('newSession')} title={t('newSession')}><Plus size={16} /></button>
            </div>
            <div className="nav-list">
              {activeSessions.length === 0 && <p className="section-placeholder">{language === 'zh' ? '还没有运行中的会话' : language === 'zh-TW' ? '還沒有運行中的會話' : 'No active sessions'}</p>}
              {activeSessions.map((session) => (
                <button
                  className={`session-row ${activeSessionId === session.id ? 'is-active' : ''}`}
                  type="button"
                  key={session.id}
                  onClick={() => onSelectSession(session)}
                >
                  <CircleDot className={`session-status session-status--${session.status}`} size={15} aria-hidden="true" />
                  <span>
                    <strong>{session.title}</strong>
                    <small>{session.sourceName}</small>
                  </span>
                  <button
                    className="icon-button icon-button--danger session-terminate"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTerminateSession(session);
                    }}
                    aria-label={language === 'zh' ? '终止会话' : language === 'zh-TW' ? '終止會話' : 'Terminate session'}
                    title={language === 'zh' ? '终止会话' : language === 'zh-TW' ? '終止會話' : 'Terminate session'}
                  >
                    <CircleOff size={15} />
                  </button>
                </button>
              ))}
            </div>
          </section>
        </div>

        <footer className="sidebar__footer">
          <div className="service-state"><span /> {language === 'zh' || language === 'zh-TW' ? (language === 'zh' ? '服务已连接' : '服務已連接') : 'Service Online'}</div>
          <select
            className="language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as 'zh' | 'en' | 'zh-TW')}
            aria-label="Select Language"
          >
            <option value="zh">简体中文</option>
            <option value="zh-TW">繁體中文</option>
            <option value="en">English</option>
          </select>
          <button className="icon-button" type="button" onClick={onLogout} aria-label={t('logout')} title={t('logout')}><LogOut size={17} /></button>
        </footer>
      </aside>
    </>
  );
}

export function MobileHeader({ onMenu, onNewSession, canCreate }: { onMenu: () => void; onNewSession: () => void; canCreate: boolean }) {
  const { t, language } = useI18n();
  return (
    <header className="mobile-header">
      <button className="icon-button" type="button" onClick={onMenu} aria-label={language === 'zh' ? '打开侧边栏' : language === 'zh-TW' ? '開啟側邊欄' : 'Open menu'}><Menu size={20} /></button>
      <div><Cable size={18} /><strong>SSH Workbench</strong></div>
      <button className="icon-button" type="button" onClick={onNewSession} disabled={!canCreate} aria-label={t('newSession')}><Plus size={20} /></button>
    </header>
  );
}
