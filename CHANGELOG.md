# Changelog

All notable changes to SSH Workbench are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-08-13

### Added
- Single-user web SSH terminal with persistent tmux sessions on remote hosts
- Password, private key, and private key passphrase authentication for SSH sources
- AES-256-GCM at-rest encryption for all SSH credentials (password, private key, passphrase)
- Two-step host fingerprint verification: fingerprint is shown before any credentials are sent; connection is blocked if the fingerprint changes
- bcrypt (cost 12) application password with opaque `HttpOnly` session cookie
- Rate limiting (10 requests / 15 min) on the login endpoint; CSRF protection via `Origin` header
- Immediate WebSocket revocation (close code 4401) on logout — all open terminals disconnect instantly
- xterm.js terminal with FitAddon, ResizeObserver, and WebSocket backpressure
- Automatic WebSocket reconnection with exponential back-off; fatal errors (4401) stop reconnection
- Persistent tmux sessions: closing the browser tab does not kill the remote session
- Source locking during active sessions to prevent orphaned tmux sessions on the wrong host
- Mobile-responsive layout: slide-in drawer navigation, two rows of Termux-style virtual keys (ESC, /, -, HOME, UP, END, PGUP, TAB, CTRL, ALT, LEFT, DOWN, RIGHT, PGDN), one-shot CTRL/ALT modifiers
- Focus trap in modal dialogs and sidebar drawer; `inert` attribute on background content; `prefers-reduced-motion` support
- Docker multi-stage build (node:22-bookworm-slim), non-root UID/GID 10001, `network_mode: host`
- Named Docker volume `ssh-workbench-data` for SQLite persistence
- Automated end-to-end acceptance test covering login, password/key SSH, fingerprint confirmation, WebSocket I/O, tmux re-attach, and token revocation
- Vitest unit test suite (16 tests): encryption round-trips, input validation, HTTP security headers, WebSocket revocation
