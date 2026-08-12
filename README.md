# SSH Workbench

A self-hosted web SSH terminal with persistent tmux sessions. Open a terminal in your browser, close the tab, come back later — the remote session is still running.

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-22-green)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)

---

## Features

- **Persistent sessions** — each terminal is attached to a dedicated `tmux` session on the remote host. Closing the browser tab or losing connectivity does not kill the remote process.
- **Multiple SSH sources** — save multiple hosts with password, private key, or private key + passphrase authentication.
- **Encrypted at rest** — SSH credentials are stored with AES-256-GCM encryption; the read API never returns plaintext.
- **Two-step fingerprint verification** — the host fingerprint is shown before any credentials are sent. Connection is blocked if the fingerprint changes unexpectedly.
- **Instant revocation** — logging out closes all open WebSocket terminals immediately (WS close code 4401).
- **Mobile-friendly** — slide-in drawer navigation, two rows of Termux-style virtual keys (ESC, /, -, HOME/END/PG, arrows, TAB, one-shot CTRL/ALT), safe-area support.
- **Accessible** — focus trap in dialogs and sidebar, `inert` background, `prefers-reduced-motion` support, `aria-pressed` on modifier keys.
- **Single Docker command deploy** — multi-stage build, non-root container, named volume for SQLite persistence.

## Scope and Limitations

SSH Workbench is a **personal tool**. It is intentionally limited:

- Single-user only — no per-user access control or permission model.
- No command auditing or session recording.
- No centralized SSH key management.
- Remote SSH hosts must have `tmux` installed.
- `network_mode: host` in Docker Compose — required so the container can reach LAN SSH targets directly. Best suited for Linux hosts; behavior on Docker Desktop differs.

## Quick Start

### Option 1: Interactive Setup Wizard (Recommended)

```bash
git clone https://github.com/PelerYuan/ssh-workbench.git
cd ssh-workbench

python3 scripts/setup.py --start
```

The wizard will:
- Generate secure random credentials
- Write `.env` with chmod 600
- Optionally start the container
- Run a health check

### Option 2: Manual Setup

```bash
git clone https://github.com/PelerYuan/ssh-workbench.git
cd ssh-workbench

cp .env.example .env
chmod 600 .env
```

Edit `.env` — two values are required:

```dotenv
APP_PASSWORD=your-login-password          # min 8 chars
CREDENTIAL_ENCRYPTION_KEY=...             # min 32 chars — generate with: openssl rand -hex 32
```

Build and start:

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:5234/api/health
```

Open `http://your-server-ip:5234` in a browser.

### CI / Non-Interactive Deployment

```bash
SSHWB_APP_PASSWORD=your-password \
SSHWB_CREDENTIAL_ENCRYPTION_KEY=$(openssl rand -hex 32) \
SSHWB_PORT=5234 \
SSHWB_COOKIE_SECURE=false \
python3 scripts/setup.py --non-interactive --start
```

## Configuration Reference

All configuration is via `.env`. Copy `.env.example` as a starting point.

| Variable | Default | Description |
|---|---|---|
| `APP_PASSWORD` | *(required)* | Web login password. Minimum 8 characters. |
| `CREDENTIAL_ENCRYPTION_KEY` | *(required)* | AES-256-GCM master key for SSH credentials. Minimum 32 characters. **Back this up separately — losing it makes saved credentials unrecoverable.** |
| `PORT` | `5234` | TCP port the server listens on. |
| `COOKIE_SECURE` | `false` | Set `true` when the app is accessed over HTTPS. Required for the session cookie to work through an HTTPS reverse proxy. |
| `ALLOWED_ORIGIN` | *(empty)* | Exact browser origin, e.g. `https://ssh.example.com`. Recommended when using a reverse proxy; multiple values comma-separated. |
| `TRUST_PROXY` | *(unset)* | Express `trust proxy` setting. Set to `1` when behind a single reverse proxy. |
| `SESSION_DAYS` | `30` | Login session lifetime in days. |
| `SSH_READY_TIMEOUT_MS` | `12000` | Milliseconds to wait for SSH handshake completion. |
| `SSH_COMMAND_TIMEOUT_MS` | `10000` | Milliseconds to wait for individual SSH commands (tmux attach/new). |

## HTTPS Reverse Proxy

Do not expose port `5234` directly to the internet over plain HTTP. Use Caddy or Nginx on the same server to terminate TLS, and restrict `5234` at the host firewall — host-network mode bypasses Docker's `ports:` rules.

Set in `.env` before restarting:

```dotenv
COOKIE_SECURE=true
ALLOWED_ORIGIN=https://ssh.example.com
```

### Caddy

```caddyfile
ssh.example.com {
    reverse_proxy 127.0.0.1:5234
}
```

Caddy proxies WebSocket automatically.

### Nginx

Add to the `http {}` block:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

Site config:

```nginx
server {
    listen 443 ssl http2;
    server_name ssh.example.com;

    ssl_certificate     /etc/letsencrypt/live/ssh.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ssh.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5234;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        $connection_upgrade;
        proxy_buffering    off;
        proxy_read_timeout 1d;
    }
}
```

## Development

```bash
npm install
npm run dev        # Vite (port 5173) + Express (port 5234), both with hot reload
npm test           # Vitest unit tests (16 tests)
npx tsc --noEmit   # TypeScript type check
```

### Local SSH Test Fixture

A bundled test container provides an OpenSSH + tmux target at `127.0.0.1:2222`:

```bash
./scripts/test-ssh-fixture.sh start
./scripts/test-ssh-fixture.sh credentials   # print test username, password, key path
./scripts/test-ssh-fixture.sh stop
```

### End-to-End Acceptance

Requires the application running on port 5234:

```bash
docker compose up -d --build --wait
./scripts/run-acceptance.sh
```

The script covers login, password/key SSH, fingerprint confirmation, WebSocket I/O, tmux re-attach, and token revocation. It cleans up all test data on exit.

## Architecture

```
Browser ──WebSocket──► Express/ws server ──ssh2──► Remote SSH host
                            │                           │
                        SQLite (WAL)               tmux session
                       (better-sqlite3)
```

- **Frontend**: React 18 + TypeScript, built with Vite, served as static files by Express
- **Backend**: Node.js 22 ESM, Express, `ws`, `ssh2`, `better-sqlite3`
- **Terminal**: xterm.js + FitAddon; ResizeObserver drives PTY resize
- **Auth**: bcrypt (cost 12) password → opaque token → SHA-256 hash in SQLite; `HttpOnly` cookie
- **Crypto**: AES-256-GCM, format `v1.<iv>.<tag>.<ciphertext>` (base64url), key derived from `CREDENTIAL_ENCRYPTION_KEY` via SHA-256
- **WebSocket revocation**: `authenticatedSockets.ts` maps `tokenHash → Set<WebSocket>`; logout calls `socket.close(4401)` on all sockets before deleting the DB row

## Backup and Restore

Credentials are useless without the encryption key, and the key is useless without the database. Back up both, together, encrypted.

```bash
# Backup
docker compose stop ssh-workbench
mkdir -p backups/$(date +%F)/data
docker cp ssh-workbench:/app/data/. backups/$(date +%F)/data/
install -m 600 .env backups/$(date +%F)/env.backup
docker compose start ssh-workbench

# Restore
docker compose stop ssh-workbench
docker cp backups/TARGET_DATE/data/. ssh-workbench:/app/data/
docker compose run --rm --user root --entrypoint chown ssh-workbench -R 10001:10001 /app/data
docker compose start ssh-workbench
# Must also restore the matching CREDENTIAL_ENCRYPTION_KEY in .env
```

## Upgrading

```bash
docker compose build --pull
docker compose up -d
curl --fail http://127.0.0.1:5234/api/health
```

Never use `docker compose down -v` — it deletes the data volume.

## Security

See [SECURITY.md](SECURITY.md) for the full policy, vulnerability reporting process, and known design boundaries.

Quick checklist:
- Use HTTPS + `COOKIE_SECURE=true` + `ALLOWED_ORIGIN=...` for any non-LAN deployment
- Firewall port `5234` — host networking bypasses Docker port rules
- Keep `.env` at `0600`, never commit it
- Back up `CREDENTIAL_ENCRYPTION_KEY` offline, encrypted

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
