import { useEffect, useState, type FormEvent } from 'react';
import { LoaderCircle, MonitorUp } from 'lucide-react';
import { Dialog } from './Dialog';
import type { SshSource } from '../types';

interface SessionDialogProps {
  sources: SshSource[];
  initialSourceId?: string;
  creating: boolean;
  error: string;
  onClose: () => void;
  onCreate: (sourceId: string, title: string) => void;
}

export function SessionDialog({ sources, initialSourceId, creating, error, onClose, onCreate }: SessionDialogProps) {
  const [sourceId, setSourceId] = useState(initialSourceId ?? sources[0]?.id ?? '');
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!sources.some((source) => source.id === sourceId)) setSourceId(sources[0]?.id ?? '');
  }, [sourceId, sources]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (sourceId && !creating) onCreate(sourceId, title.trim());
  };

  return (
    <Dialog
      title="创建新会话"
      description="会话在远端 tmux 中持续运行，关闭网页不会终止它。"
      onClose={onClose}
      size="small"
      locked={creating}
      footer={
        <>
          <button className="button button--secondary" type="button" onClick={onClose} disabled={creating}>取消</button>
          <button className="button button--primary" type="submit" form="session-form" disabled={!sourceId || creating}>
            {creating ? <LoaderCircle className="spin" size={17} /> : <MonitorUp size={17} />}
            {creating ? '正在连接' : '创建会话'}
          </button>
        </>
      }
    >
      <form id="session-form" className="form-stack" onSubmit={submit}>
        <label className="field">
          <span>SSH 源</span>
          <select value={sourceId} disabled={creating} onChange={(event) => setSourceId(event.target.value)} autoFocus>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>{source.name} · {source.username}@{source.host}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>会话名称 <small>可选</small></span>
          <input value={title} disabled={creating} onChange={(event) => setTitle(event.target.value)} placeholder="默认使用 SSH 源名称" maxLength={80} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}
