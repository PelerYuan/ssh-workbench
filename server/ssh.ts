import { createHash } from 'node:crypto';
import { Client, type ClientChannel, type ConnectConfig } from 'ssh2';
import { config } from './config.js';
import { decrypt } from './crypto.js';
import type { SourceRow } from './db.js';
import { AppError } from './errors.js';

type ShellConnection = {
  client: Client;
  stream: ClientChannel;
};

type TestResult = {
  fingerprint: string;
  tmuxVersion: string;
};

const tmuxNamePattern = /^sshwb_[0-9a-f]{32}$/;

function assertTmuxName(tmuxName: string): void {
  if (!tmuxNamePattern.test(tmuxName)) {
    throw new AppError(500, 'INVALID_TMUX_NAME', '服务器保存的 tmux 会话名称无效');
  }
}

function fingerprintHostKey(key: Buffer): string {
  return `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
}

function friendlySshError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const candidate = error as NodeJS.ErrnoException & { level?: string };
  if (candidate.level === 'client-authentication') {
    return new AppError(502, 'SSH_AUTH_FAILED', 'SSH 认证失败');
  }
  if (candidate.code === 'ETIMEDOUT' || candidate.level === 'client-timeout') {
    return new AppError(504, 'SSH_TIMEOUT', 'SSH 连接超时');
  }
  if (candidate.code === 'ECONNREFUSED') {
    return new AppError(502, 'SSH_REFUSED', 'SSH 连接被目标主机拒绝');
  }
  if (candidate.code === 'EHOSTUNREACH' || candidate.code === 'ENETUNREACH' || candidate.code === 'ENOTFOUND') {
    return new AppError(502, 'SSH_UNREACHABLE', '无法访问 SSH 主机');
  }
  return new AppError(502, 'SSH_CONNECTION_FAILED', 'SSH 连接失败');
}

function credentialConfig(source: SourceRow): Pick<ConnectConfig, 'password' | 'privateKey' | 'passphrase'> {
  let credential: { password: string } | { privateKey: string; passphrase?: string };
  try {
    credential = decrypt<typeof credential>(source.credential);
  } catch (error) {
    console.error(`Could not decrypt credential for source ${source.id}`, error);
    throw new AppError(500, 'CREDENTIAL_DECRYPTION_FAILED', '无法解密已保存的 SSH 凭据');
  }
  if (source.auth_type === 'password') {
    if (!('password' in credential)) throw new AppError(500, 'CREDENTIAL_TYPE_MISMATCH', 'SSH 凭据类型无效');
    return { password: credential.password };
  } else {
    if (!('privateKey' in credential)) throw new AppError(500, 'CREDENTIAL_TYPE_MISMATCH', 'SSH 凭据类型无效');
    return {
      privateKey: credential.privateKey,
      ...(credential.passphrase ? { passphrase: credential.passphrase } : {}),
    };
  }
}

function baseConnectionConfig(source: SourceRow): ConnectConfig {
  return {
    host: source.host,
    port: source.port,
    username: source.username,
    readyTimeout: config.sshReadyTimeoutMs,
    keepaliveInterval: 15_000,
    keepaliveCountMax: 3,
  };
}

function fingerprintFromVerifierKey(key: string | Buffer): string {
  return typeof key === 'string'
    ? `SHA256:${Buffer.from(key, 'hex').toString('base64').replace(/=+$/, '')}`
    : fingerprintHostKey(key);
}

export async function discoverHostFingerprint(source: SourceRow): Promise<string> {
  return await new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;
    const timer = setTimeout(() => {
      fail(new AppError(504, 'SSH_TIMEOUT', 'SSH 连接超时'));
    }, config.sshReadyTimeoutMs);

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.end();
      reject(friendlySshError(error));
    };

    client.once('ready', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.end();
      reject(new AppError(500, 'SSH_DISCOVERY_FAILED', 'SSH 指纹发现意外进入认证阶段'));
    });
    client.once('error', fail);
    client.once('close', () => fail(new AppError(502, 'SSH_CONNECTION_FAILED', 'SSH 连接在获取主机指纹前关闭')));
    client.once('end', () => fail(new AppError(502, 'SSH_CONNECTION_FAILED', 'SSH 连接在获取主机指纹前关闭')));

    try {
      client.connect({
        ...baseConnectionConfig(source),
        hostHash: 'sha256',
        hostVerifier: (key: string | Buffer) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            const fingerprint = fingerprintFromVerifierKey(key);
            setImmediate(() => {
              client.end();
              resolve(fingerprint);
            });
          }
          return false;
        },
      });
    } catch (error) {
      fail(error);
    }
  });
}

async function connect(source: SourceRow, expectedFingerprint = source.host_fingerprint): Promise<Client> {
  if (!expectedFingerprint) {
    throw new AppError(409, 'HOST_NOT_TRUSTED', '请先测试连接并确认主机指纹');
  }
  return await new Promise((resolve, reject) => {
    const client = new Client();
    let fingerprint = '';
    let settled = false;
    const rejectHostKeyMismatch = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const error = new AppError(409, 'HOST_KEY_MISMATCH', 'SSH 主机指纹与已信任指纹不一致', {
        expected: expectedFingerprint,
        actual: fingerprint,
      });
      setImmediate(() => {
        client.end();
        reject(error);
      });
    };
    const timer = setTimeout(() => {
      fail(new AppError(504, 'SSH_TIMEOUT', 'SSH 连接超时'));
    }, config.sshReadyTimeoutMs);

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.end();
      if ((error as { level?: string }).level === 'handshake' && fingerprint && fingerprint !== expectedFingerprint) {
        reject(new AppError(409, 'HOST_KEY_MISMATCH', 'SSH 主机指纹与已信任指纹不一致', {
          expected: expectedFingerprint,
          actual: fingerprint,
        }));
        return;
      }
      reject(friendlySshError(error));
    };

    client.once('ready', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(client);
    });
    client.once('error', fail);
    client.once('close', () => fail(new AppError(502, 'SSH_CONNECTION_FAILED', 'SSH 连接在认证完成前关闭')));
    client.once('end', () => fail(new AppError(502, 'SSH_CONNECTION_FAILED', 'SSH 连接在认证完成前关闭')));

    try {
      client.connect({
        ...baseConnectionConfig(source),
        ...credentialConfig(source),
        hostHash: 'sha256',
        hostVerifier: (key: string | Buffer) => {
          fingerprint = fingerprintFromVerifierKey(key);
          if (fingerprint === expectedFingerprint) return true;
          rejectHostKeyMismatch();
          return false;
        },
      });
    } catch (error) {
      fail(error);
    }
  });
}

function execCollect(client: Client, command: string, timeoutMs = config.sshCommandTimeoutMs): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.end();
      reject(new AppError(504, 'SSH_COMMAND_TIMEOUT', '远程命令执行超时'));
    }, timeoutMs);

    client.exec(command, (error, channel) => {
      if (error) {
        clearTimeout(timer);
        settled = true;
        reject(friendlySshError(error));
        return;
      }

      let stdout = '';
      let stderr = '';
      let exitCode: number | null = null;
      channel.setEncoding('utf8');
      channel.stderr.setEncoding('utf8');
      channel.on('data', (chunk: string) => { if (stdout.length < 65_536) stdout += chunk; });
      channel.stderr.on('data', (chunk: string) => { if (stderr.length < 65_536) stderr += chunk; });
      channel.on('exit', (code: number | null) => { exitCode = code; });
      channel.once('error', (channelError: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(friendlySshError(channelError));
      });
      channel.once('close', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ stdout, stderr, code: exitCode });
      });
    });
  });
}

export async function testSshSource(source: SourceRow, fingerprint?: string): Promise<TestResult> {
  const discoveredFingerprint = await discoverHostFingerprint(source);
  if (!fingerprint) {
    const trustedFingerprintChanged = Boolean(source.host_fingerprint && discoveredFingerprint !== source.host_fingerprint);
    throw new AppError(409, trustedFingerprintChanged ? 'HOST_KEY_MISMATCH' : 'FINGERPRINT_REQUIRED', trustedFingerprintChanged
      ? 'SSH 主机指纹与已信任指纹不一致'
      : '请先确认 SSH 主机指纹', {
      fingerprint: discoveredFingerprint,
      ...(source.host_fingerprint ? { expected: source.host_fingerprint, actual: discoveredFingerprint } : {}),
    });
  }
  if (fingerprint !== discoveredFingerprint) {
    const trustedFingerprintChanged = fingerprint === source.host_fingerprint;
    throw new AppError(409, trustedFingerprintChanged ? 'HOST_KEY_MISMATCH' : 'FINGERPRINT_STALE', trustedFingerprintChanged
      ? 'SSH 主机指纹与已信任指纹不一致'
      : '目标主机当前指纹与待确认指纹不一致', {
      expected: fingerprint,
      actual: discoveredFingerprint,
    });
  }

  const client = await connect(source, fingerprint);
  try {
    const result = await execCollect(client, 'command -v tmux >/dev/null 2>&1 && tmux -V');
    if (result.code !== 0) {
      throw new AppError(422, 'TMUX_MISSING', '目标服务器未安装 tmux');
    }
    return { fingerprint, tmuxVersion: result.stdout.trim().slice(0, 100) };
  } finally {
    client.end();
  }
}

export async function verifyTmuxSession(source: SourceRow, tmuxName: string): Promise<boolean> {
  assertTmuxName(tmuxName);
  const client = await connect(source);
  try {
    const result = await execCollect(client, `tmux has-session -t ${tmuxName}`);
    return result.code === 0;
  } finally {
    client.end();
  }
}

export async function createTmuxSession(source: SourceRow, tmuxName: string): Promise<void> {
  assertTmuxName(tmuxName);
  const client = await connect(source);
  try {
    const result = await execCollect(client, `tmux new-session -d -s ${tmuxName}`);
    if (result.code !== 0) {
      const detail = result.stderr.trim().slice(0, 500);
      throw new AppError(502, 'TMUX_CREATE_FAILED', '无法创建远程 tmux 会话', detail ? { stderr: detail } : undefined);
    }
  } finally {
    client.end();
  }
}

export async function terminateTmuxSession(source: SourceRow, tmuxName: string): Promise<void> {
  assertTmuxName(tmuxName);
  const client = await connect(source);
  try {
    const result = await execCollect(client, `tmux kill-session -t ${tmuxName}`);
    if (result.code !== 0 && !/can't find session|no server running/i.test(`${result.stdout}\n${result.stderr}`)) {
      throw new AppError(502, 'TMUX_TERMINATE_FAILED', '无法终止远程 tmux 会话');
    }
  } finally {
    client.end();
  }
}

export async function attachTmuxSession(
  source: SourceRow,
  tmuxName: string,
  columns: number,
  rows: number,
): Promise<ShellConnection> {
  assertTmuxName(tmuxName);
  const client = await connect(source);
  return await new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      client.off('error', onClientError);
      client.off('close', onClientClose);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      client.end();
      reject(error instanceof AppError ? error : friendlySshError(error));
    };
    const onClientError = (error: Error) => fail(error);
    const onClientClose = () => fail(new AppError(502, 'SSH_CONNECTION_LOST', 'SSH 连接已中断'));
    const timer = setTimeout(() => {
      fail(new AppError(504, 'SSH_ATTACH_TIMEOUT', '附着远程 tmux 会话超时'));
    }, config.sshCommandTimeoutMs);
    client.once('error', onClientError);
    client.once('close', onClientClose);
    client.exec(
      `tmux attach-session -t ${tmuxName}`,
      { pty: { term: 'xterm-256color', cols: columns, rows } },
      (error, stream) => {
        if (error) {
          fail(error);
          return;
        }
        if (settled) {
          stream.close();
          return;
        }
        settled = true;
        cleanup();
        resolve({ client, stream });
      },
    );
  });
}

// Exported for focused unit testing without opening a network connection.
export const sshInternals = { fingerprintHostKey, fingerprintFromVerifierKey, assertTmuxName };
