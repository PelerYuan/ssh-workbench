import { useMemo, useState, type FormEvent } from 'react';
import { KeyRound, LoaderCircle, LockKeyhole } from 'lucide-react';
import { Dialog } from './Dialog';
import type { AuthType, SourceInput, SshSource } from '../types';

interface SourceDialogProps {
  source?: SshSource;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (input: SourceInput) => void;
}

export function SourceDialog({ source, saving, error, onClose, onSave }: SourceDialogProps) {
  const [name, setName] = useState(source?.name ?? '');
  const [host, setHost] = useState(source?.host ?? '');
  const [port, setPort] = useState(String(source?.port ?? 22));
  const [username, setUsername] = useState(source?.username ?? '');
  const [authType, setAuthType] = useState<AuthType>(source?.authType ?? 'password');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [clearPassphrase, setClearPassphrase] = useState(false);

  const credentialsReady = useMemo(() => {
    if (source && source.authType === authType) {
      return authType === 'password' ? source.hasPassword || Boolean(password) : source.hasPrivateKey || Boolean(privateKey);
    }
    return authType === 'password' ? Boolean(password) : Boolean(privateKey);
  }, [authType, password, privateKey, source]);

  const valid = name.trim() && host.trim() && username.trim() && Number(port) > 0 && Number(port) <= 65535 && credentialsReady;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || saving) return;
    onSave({
      name: name.trim(),
      host: host.trim(),
      port: Number(port),
      username: username.trim(),
      authType,
      ...(authType === 'password' && password ? { password } : {}),
      ...(authType === 'privateKey' && privateKey ? { privateKey } : {}),
      ...(authType === 'privateKey' && clearPassphrase
        ? { passphrase: '' }
        : authType === 'privateKey' && passphrase
          ? { passphrase }
          : {}),
    });
  };

  const storedHint = source && source.authType === authType
    ? authType === 'password' && source.hasPassword
      ? '密码已加密保存，留空表示不修改'
      : authType === 'privateKey' && source.hasPrivateKey
        ? '私钥已加密保存，留空表示不修改'
        : undefined
    : undefined;

  return (
    <Dialog
      title={source ? '编辑 SSH 源' : '添加 SSH 源'}
      description="凭据会在服务端加密保存，保存后不会再次显示。"
      onClose={onClose}
      locked={saving}
      footer={
        <>
          <button className="button button--secondary" type="button" onClick={onClose} disabled={saving}>取消</button>
          <button className="button button--primary" type="submit" form="source-form" disabled={!valid || saving}>
            {saving && <LoaderCircle className="spin" size={17} />}
            {saving ? '保存中' : '保存 SSH 源'}
          </button>
        </>
      }
    >
      <form id="source-form" className="form-grid" onSubmit={submit}>
        <label className="field field--full">
          <span>显示名称</span>
          <input autoFocus value={name} disabled={saving} onChange={(event) => setName(event.target.value)} placeholder="例如：家庭服务器" maxLength={80} />
        </label>
        <label className="field field--host">
          <span>主机地址</span>
          <input value={host} disabled={saving} onChange={(event) => setHost(event.target.value)} placeholder="192.168.1.101" maxLength={255} spellCheck={false} />
        </label>
        <label className="field field--port">
          <span>端口</span>
          <input type="number" inputMode="numeric" min="1" max="65535" value={port} disabled={saving} onChange={(event) => setPort(event.target.value)} />
        </label>
        <label className="field field--full">
          <span>用户名</span>
          <input value={username} disabled={saving} onChange={(event) => setUsername(event.target.value)} placeholder="peler" maxLength={128} autoComplete="username" />
        </label>

        <fieldset className="field field--full">
          <legend>认证方式</legend>
          <div className="segmented-control">
            <button type="button" className={authType === 'password' ? 'is-active' : ''} disabled={saving} onClick={() => setAuthType('password')} aria-pressed={authType === 'password'}>
              <LockKeyhole size={16} /> 密码
            </button>
            <button type="button" className={authType === 'privateKey' ? 'is-active' : ''} disabled={saving} onClick={() => setAuthType('privateKey')} aria-pressed={authType === 'privateKey'}>
              <KeyRound size={16} /> 私钥
            </button>
          </div>
        </fieldset>

        {authType === 'password' ? (
          <label className="field field--full">
            <span>SSH 密码</span>
            <input type="password" value={password} disabled={saving} onChange={(event) => setPassword(event.target.value)} placeholder={storedHint ?? '输入 SSH 密码'} autoComplete="new-password" />
            {storedHint && <small>{storedHint}</small>}
          </label>
        ) : (
          <>
            <label className="field field--full">
              <span>SSH 私钥</span>
              <textarea rows={6} value={privateKey} disabled={saving} onChange={(event) => setPrivateKey(event.target.value)} placeholder={storedHint ?? '粘贴 OpenSSH 或 PEM 私钥'} spellCheck={false} />
              {storedHint && <small>{storedHint}</small>}
            </label>
            <label className="field field--full">
              <span>私钥口令 <small>可选</small></span>
              <input
                type="password"
                value={passphrase}
                disabled={saving || clearPassphrase}
                onChange={(event) => {
                  setPassphrase(event.target.value);
                  if (event.target.value) setClearPassphrase(false);
                }}
                placeholder={source?.hasPassphrase ? '口令已保存，留空表示不修改' : '私钥没有口令时留空'}
                autoComplete="new-password"
              />
            </label>
            {source?.authType === 'privateKey' && source.hasPassphrase && (
              <label className="checkbox-field field--full">
                <input
                  type="checkbox"
                  checked={clearPassphrase}
                  disabled={saving}
                  onChange={(event) => {
                    setClearPassphrase(event.target.checked);
                    if (event.target.checked) setPassphrase('');
                  }}
                />
                <span>清除已保存的私钥口令</span>
              </label>
            )}
          </>
        )}
        {error && <p className="form-error field--full" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}
