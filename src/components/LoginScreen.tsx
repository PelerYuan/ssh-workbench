import { useState, type FormEvent } from 'react';
import { KeyRound, LoaderCircle, LockKeyhole, Server } from 'lucide-react';
import { api, getErrorMessage } from '../api';

interface LoginScreenProps {
  onAuthenticated: () => void;
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await api.login(password);
      onAuthenticated();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand" aria-hidden="true">
          <Server size={23} />
        </div>
        <p className="login-eyebrow">PRIVATE ACCESS</p>
        <h1 id="login-title">SSH Workbench</h1>
        <p className="login-subtitle">登录后管理内网主机与持久终端会话。</p>

        <form onSubmit={submit} className="login-form">
          <label htmlFor="login-password">访问密码</label>
          <div className="input-with-icon">
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>
          {error && <p className="form-error" id="login-error" role="alert">{error}</p>}
          <button className="button button--primary button--wide" type="submit" disabled={!password || submitting}>
            {submitting ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />}
            {submitting ? '正在验证' : '登录工作台'}
          </button>
        </form>
      </section>
      <p className="login-footnote">连接信息仅保存在你的服务端</p>
    </main>
  );
}

