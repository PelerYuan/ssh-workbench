# Contributing to SSH Workbench

Thank you for taking the time to contribute. This document covers how to set up a local development environment, the project conventions, and the pull request process.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Running Tests](#running-tests)
- [Code Conventions](#code-conventions)
- [Submitting Changes](#submitting-changes)
- [Reporting Bugs](#reporting-bugs)

## Development Setup

**Prerequisites:** Node.js 22+, Docker Engine 24+, Docker Compose v2, and a Linux host (host-network mode works best on Linux).

```bash
git clone https://github.com/your-org/ssh-workbench.git
cd ssh-workbench

cp .env.example .env
chmod 600 .env
# Edit .env: set APP_PASSWORD (≥8 chars) and CREDENTIAL_ENCRYPTION_KEY (≥32 chars)

npm install
npm run dev
```

`npm run dev` starts Vite (port 5173) and the Express server (port 5234) concurrently with hot reload.

To test with a real SSH target locally, start the bundled fixture container:

```bash
./scripts/test-ssh-fixture.sh start
./scripts/test-ssh-fixture.sh credentials
```

This spins up an OpenSSH + tmux container bound to `127.0.0.1:2222` with a fixed test user. Stop it with `./scripts/test-ssh-fixture.sh stop`.

## Project Structure

```
server/         Express + WebSocket backend (TypeScript ESM)
  auth.ts         Session management, login, logout
  authenticatedSockets.ts  WebSocket → token map for instant revocation
  config.ts       Validated environment configuration
  crypto.ts       AES-256-GCM credential encryption / decryption
  db.ts           SQLite schema, migrations, queries (better-sqlite3)
  security.ts     requireAuthentication middleware, CSRF origin check
  sessions.ts     SSH session lifecycle REST handlers
  sources.ts      SSH source CRUD + fingerprint discovery REST handlers
  sourceUsage.ts  Concurrency lock preventing races on in-use sources
  ssh.ts          ssh2 connection, tmux attach/create, host key verification
  validation.ts   Shared Zod schemas
  websocket.ts    WebSocket upgrade, terminal I/O, backpressure, heartbeat

src/            React 18 frontend (TypeScript + Vite)
  App.tsx         Root layout, session/source state
  api.ts          Typed fetch wrappers for all REST endpoints
  types.ts        Shared TypeScript types
  terminalInput.ts  One-shot CTRL/ALT modifier logic
  components/
    Dialog.tsx      Accessible modal with focus trap and scroll lock
    Sidebar.tsx     Navigation drawer with focus trap and inert background
    TerminalView.tsx  xterm.js terminal + WebSocket + virtual keys
    VirtualKeys.tsx   Two-row Termux-style touch keyboard

tests/          Backend unit tests (Vitest) and E2E acceptance script
src/components/ frontendLocks.test.tsx  Frontend unit tests (Vitest + jsdom)
src/            terminalInput.test.ts   Input modifier unit tests
```

## Running Tests

```bash
# Unit tests (16 tests, fast)
npm test

# Type checking
npx tsc --noEmit

# End-to-end acceptance (requires a running app on port 5234)
docker compose up -d --build --wait
./scripts/run-acceptance.sh
```

All three must pass before opening a pull request.

## Code Conventions

- **TypeScript strict mode** — no `any`, no suppressed errors.
- **No comments explaining what the code does** — only add a comment when the *why* is non-obvious (hidden constraint, subtle invariant, specific bug workaround).
- **No unnecessary abstractions** — three similar lines is better than a premature helper.
- **Security boundaries** — validate only at system boundaries (user input, external API responses). Trust internal module contracts.
- **No new dependencies** unless genuinely necessary and actively maintained — open an issue to discuss first.
- Formatting is not enforced by a linter yet; match the style of the file you are editing.

## Submitting Changes

1. Fork the repository and create a branch from `main`.
2. Make your changes and ensure `npm test` and `npx tsc --noEmit` both pass.
3. For non-trivial changes, run the E2E acceptance suite.
4. Open a pull request against `main`. Fill in the PR template.
5. Keep pull requests focused — one logical change per PR.

For significant new features or security-sensitive changes, open an issue first to discuss the approach before investing time in an implementation.

## Reporting Bugs

Use the GitHub issue tracker. For security vulnerabilities, follow the process described in [SECURITY.md](SECURITY.md) instead of opening a public issue.
