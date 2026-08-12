# Security Policy

## Supported Versions

Only the latest release on the `main` branch receives security fixes.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report security issues by emailing the maintainers directly, or by using [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) if enabled on this repository.

Include in your report:
- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Any suggested mitigations you are aware of

You can expect an acknowledgement within 72 hours and a resolution timeline within 7 days for critical issues.

## Known Security Scope

SSH Workbench is designed as a **single-user, self-hosted tool** intended for use on a trusted private network or behind an authenticated HTTPS reverse proxy. The following are known design boundaries, not vulnerabilities:

- **No multi-user isolation** — all SSH sources and sessions belong to a single authenticated user; there is no per-user access control or audit trail.
- **No command auditing** — terminal input and output are not logged.
- **No centralized key management** — SSH private keys are stored encrypted in a local SQLite database; key rotation must be done manually.
- **SSH endpoints lack per-route rate limiting** — the global rate limiter on `/api/` applies, but individual SSH test/trust/connect routes do not have dedicated limits.
- **`COOKIE_SECURE` defaults to `false`** — this is intentional for HTTP-only LAN deployments. You must set `COOKIE_SECURE=true` when the app is reachable over HTTPS.
- **Host networking** — `docker-compose.yml` uses `network_mode: host` so the container can reach LAN SSH targets. This means port `5234` is exposed on all host interfaces; use a host firewall to restrict access.

## Security Best Practices for Deployment

- Always run behind an HTTPS reverse proxy (Caddy or Nginx) when accessible outside a fully trusted LAN.
- Set `COOKIE_SECURE=true` and `ALLOWED_ORIGIN=https://your-domain` in `.env` for HTTPS deployments.
- Restrict port `5234` at the host firewall level — Docker host networking bypasses Compose `ports:` rules.
- Keep `.env` permissions at `0600` and never commit it to version control.
- Back up `CREDENTIAL_ENCRYPTION_KEY` separately from the database; losing it makes saved SSH credentials permanently unrecoverable.
- Rotate `APP_PASSWORD` and `CREDENTIAL_ENCRYPTION_KEY` before deploying to a new environment.
