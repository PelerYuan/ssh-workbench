import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { CircleAlert, CircleOff, LoaderCircle, RefreshCw, TerminalSquare } from 'lucide-react';
import type { TerminalSession } from '../types';
import { applyOneShotModifiers, updateOneShotModifiers, type OneShotModifierAction, type OneShotModifiers } from '../terminalInput';
import { VirtualKeys } from './VirtualKeys';
import { SystemMonitor } from './SystemMonitor';

interface TerminalViewProps {
  session: TerminalSession;
  onStatus: (id: string, status: TerminalSession['status'], lastError?: string | null) => void;
  onTerminate: (session: TerminalSession) => void;
}

export function TerminalView({ session, onStatus, onTerminate }: TerminalViewProps) {
  const terminalElement = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
  const modifiersRef = useRef<OneShotModifiers>({ ctrl: false, alt: false });
  const fatalErrorRef = useRef(false);
  const connectedRef = useRef(false);
  const connectRef = useRef<(() => void) | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [error, setError] = useState(session.lastError ?? '');
  const [modifiers, setModifiers] = useState<OneShotModifiers>(modifiersRef.current);

  const updateModifiers = useCallback((action: OneShotModifierAction) => {
    const next = updateOneShotModifiers(modifiersRef.current, action);
    modifiersRef.current = next;
    setModifiers(next);
  }, []);

  const sendData = useCallback((data: string) => {
    if (!connectedRef.current) {
      updateModifiers('clear');
      return;
    }
    const payload = applyOneShotModifiers(data, modifiersRef.current.ctrl, modifiersRef.current.alt);
    updateModifiers('clear');
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', data: payload }));
    terminalRef.current?.focus();
  }, [updateModifiers]);

  const toggleModifier = (modifier: 'ctrl' | 'alt') => {
    if (!connectedRef.current) {
      updateModifiers('clear');
      return;
    }
    updateModifiers(modifier === 'ctrl' ? 'toggleCtrl' : 'toggleAlt');
    terminalRef.current?.focus();
  };

  const fitAndResize = useCallback(() => {
    const terminal = terminalRef.current;
    const fit = fitRef.current;
    const socket = socketRef.current;
    if (!terminal || !fit || !terminalElement.current) return;
    try { fit.fit(); } catch { return; }
    if (socket?.readyState === WebSocket.OPEN && terminal.cols > 0 && terminal.rows > 0) {
      socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
    }
  }, []);

  useLayoutEffect(() => {
    if (!terminalElement.current) return;
    const terminal = new Terminal({
      allowProposedApi: true,
      convertEol: false,
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      scrollback: 5000,
      scrollOnUserInput: true,
      theme: {
        background: '#101417', foreground: '#d6e0df', cursor: '#8dd9c1', cursorAccent: '#101417',
        selectionBackground: '#2f5e5c', black: '#17201f', red: '#f28b82', green: '#9ed7a4', yellow: '#e7ca89',
        blue: '#8eb8e7', magenta: '#cba5d9', cyan: '#8fd1d1', white: '#e9f0ee', brightBlack: '#6c7b78',
        brightRed: '#ffaaa1', brightGreen: '#b5ebba', brightYellow: '#f5dc9a', brightBlue: '#a8ccf3',
        brightMagenta: '#debce9', brightCyan: '#a7e9e2', brightWhite: '#ffffff',
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(terminalElement.current);
    terminalRef.current = terminal;
    fitRef.current = fit;

    const observer = new ResizeObserver(() => fitAndResize());
    observer.observe(terminalElement.current);
    const onData = terminal.onData(sendData);
    const onBinary = terminal.onBinary((data) => sendData(data));
    fitAndResize();
    terminal.focus();
    return () => {
      observer.disconnect();
      onData.dispose();
      onBinary.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [fitAndResize, sendData]);

  useEffect(() => {
    mounted.current = true;
    let retryCount = 0;
    let heartbeat: number | undefined;
    const connect = () => {
      if (!mounted.current || socketRef.current) return;
      if (reconnectTimer.current) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = undefined;
      }
      fatalErrorRef.current = false;
      connectedRef.current = false;
      setConnection('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws/sessions/${encodeURIComponent(session.id)}`);
      socketRef.current = socket;
      socket.addEventListener('open', () => {
        fitAndResize();
        heartbeat = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
        }, 25000);
      });
      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type: string; data?: string; status?: TerminalSession['status']; code?: string; message?: string; error?: { message?: string } };
          if (message.type === 'output' && message.data) terminalRef.current?.write(message.data);
          if ((message.type === 'ready' || message.type === 'connected')) {
            connectedRef.current = true;
            retryCount = 0;
            setConnection('connected');
            setError('');
            onStatus(session.id, 'active', null);
            fitAndResize();
          }
          if (message.type === 'status' && message.status) {
            const active = message.status === 'active';
            connectedRef.current = active;
            setConnection(active ? 'connected' : 'error');
            onStatus(session.id, message.status, null);
          }
          if (message.type === 'error') {
            const messageText = message.message ?? message.error?.message ?? '终端连接失败';
            setError(messageText);
            const transient = [
              'SSH_CONNECTION_LOST',
              'SSH_STREAM_ERROR',
              'SSH_TIMEOUT',
              'SSH_UNREACHABLE',
              'SSH_REFUSED',
              'SSH_CONNECTION_FAILED',
              'SSH_ATTACH_TIMEOUT',
            ].includes(message.code ?? '');
            if (transient) {
              connectedRef.current = false;
              setConnection('disconnected');
            } else {
              connectedRef.current = false;
              setConnection('error');
              fatalErrorRef.current = true;
              onStatus(session.id, 'error', messageText);
            }
          }
          if (message.type === 'ended') {
            connectedRef.current = false;
            setConnection('error');
            setError('远端 tmux 会话已结束');
            fatalErrorRef.current = true;
            onStatus(session.id, 'ended', null);
          }
        } catch {
          setError('收到无法识别的终端数据');
        }
      });
      socket.addEventListener('close', (event: CloseEvent) => {
        if (!mounted.current) return;
        if (socketRef.current !== socket) return;
        if (heartbeat) window.clearInterval(heartbeat);
        if (event.code === 4401) {
          fatalErrorRef.current = true;
          connectedRef.current = false;
          socketRef.current = null;
          setConnection('error');
          setError('认证已失效，请重新登录');
          onStatus(session.id, 'error', '认证已失效');
          return;
        }
        const shouldReconnect = !fatalErrorRef.current;
        connectedRef.current = false;
        socketRef.current = null;
        if (!shouldReconnect) return;
        setConnection('disconnected');
        const delay = Math.min(1000 * 2 ** Math.min(retryCount, 5), 30000);
        retryCount += 1;
        reconnectTimer.current = window.setTimeout(() => {
          reconnectTimer.current = undefined;
          connect();
        }, delay);
      });
      socket.addEventListener('error', () => {
        connectedRef.current = false;
        setError('无法建立终端 WebSocket 连接');
        setConnection('error');
      });
    };
    connectRef.current = connect;
    connect();
    return () => {
      mounted.current = false;
      connectedRef.current = false;
      if (heartbeat) window.clearInterval(heartbeat);
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      socketRef.current?.close();
      socketRef.current = null;
      connectRef.current = null;
    };
  }, [fitAndResize, onStatus, session.id]);

  useEffect(() => {
    if (connection !== 'connected') updateModifiers('clear');
  }, [connection, updateModifiers]);

  const retry = () => {
    if (reconnectTimer.current) {
      window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = undefined;
    }
    if (socketRef.current) return;
    fatalErrorRef.current = false;
    connectRef.current?.();
  };

  const connected = connection === 'connected';
  const statusText = connection === 'connected' ? '已连接' : connection === 'connecting' ? '正在连接' : connection === 'disconnected' ? '连接已断开' : '连接异常';

  return (
    <section className="terminal-view" aria-label={`${session.title} 终端`}>
      <SystemMonitor sessionId={session.id} />
      <div className="terminal-toolbar">
        <div className="terminal-title">
          <span className={`status-dot status-dot--${connection}`} aria-hidden="true" />
          <div>
            <strong>{session.title}</strong>
            <span>{session.sourceName} · {statusText}</span>
          </div>
        </div>
        <div className="terminal-actions">
          <span className="session-tmux" title={session.tmuxName}><TerminalSquare size={15} /> {session.tmuxName}</span>
          {!connected && <button className="icon-button" type="button" onClick={retry} aria-label="重新连接" title="重新连接"><RefreshCw size={17} /></button>}
        </div>
      </div>
      <div className="terminal-surface">
        <div className="terminal-container" ref={terminalElement} />
        {!connected && (
          <div className="terminal-overlay">
            {connection === 'connecting' ? <LoaderCircle className="spin" size={21} /> : <CircleAlert size={21} />}
            <strong>{connection === 'connecting' ? '正在建立 SSH 连接' : '终端暂时不可用'}</strong>
            {error && <p>{error}</p>}
            {connection !== 'connecting' && <button className="button button--secondary" type="button" onClick={retry}><RefreshCw size={16} /> 重新连接</button>}
          </div>
        )}
      </div>
      <VirtualKeys
        ctrl={modifiers.ctrl}
        alt={modifiers.alt}
        disabled={!connected}
        onModifier={toggleModifier}
        onData={sendData}
      />
    </section>
  );
}
