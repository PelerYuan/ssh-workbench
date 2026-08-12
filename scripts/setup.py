#!/usr/bin/env python3
"""
SSH Workbench setup wizard.

Interactively collects configuration, writes .env, and optionally
starts the container via docker compose.
"""
import argparse
import os
import re
import secrets
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path


# ── helpers ──────────────────────────────────────────────────────────────────

def ask(prompt: str, default: str = "", validator=None, secret: bool = False) -> str:
    if default:
        display_default = "****" if secret else default
        full_prompt = f"{prompt} [{display_default}]: "
    else:
        full_prompt = f"{prompt}: "
    while True:
        try:
            if secret:
                import getpass
                value = getpass.getpass(full_prompt)
            else:
                value = input(full_prompt)
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(1)
        value = value.strip() or default
        if validator:
            error = validator(value)
            if error:
                print(f"  ✗ {error}")
                continue
        return value


def ask_bool(prompt: str, default: bool = True) -> bool:
    default_str = "Y/n" if default else "y/N"
    while True:
        try:
            raw = input(f"{prompt} [{default_str}]: ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(1)
        if not raw:
            return default
        if raw in ("y", "yes"):
            return True
        if raw in ("n", "no"):
            return False
        print("  Please enter y or n.")


def validate_port(value: str) -> str | None:
    try:
        port = int(value)
    except ValueError:
        return "Must be a number."
    if not (1 <= port <= 65535):
        return "Must be between 1 and 65535."
    return None


def validate_password(value: str) -> str | None:
    if len(value) < 8:
        return "Must be at least 8 characters."
    return None


def validate_enc_key(value: str) -> str | None:
    if len(value) < 32:
        return "Must be at least 32 characters."
    return None


def validate_origin(value: str) -> str | None:
    if not value:
        return None  # optional
    if not re.match(r'^https?://[^\s/]+$', value):
        return "Must be a full origin without trailing slash, e.g. https://ssh.example.com"
    return None


def check_docker() -> bool:
    return shutil.which("docker") is not None


def docker_compose_cmd() -> list[str]:
    result = subprocess.run(
        ["docker", "compose", "version"],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        return ["docker", "compose"]
    raise RuntimeError("docker compose v2 not found. Install Docker Engine 24+ with Compose plugin.")


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="SSH Workbench setup wizard — generates .env and optionally starts the app."
    )
    parser.add_argument("--non-interactive", action="store_true",
                        help="Read all values from env vars (CI / scripted use).")
    parser.add_argument("--start", action="store_true",
                        help="Run docker compose up after writing .env.")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    project_dir = script_dir.parent          # scripts/ lives one level below project root
    env_path = project_dir / ".env"
    compose_path = project_dir / "docker-compose.yml"

    if not compose_path.exists():
        print(f"Error: docker-compose.yml not found in {project_dir}")
        sys.exit(1)

    print()
    print("=" * 60)
    print("  SSH Workbench — Quick Setup")
    print("=" * 60)
    print()

    if args.non_interactive:
        # CI mode: read from environment variables
        port = os.environ.get("SSHWB_PORT", "5234")
        app_password = os.environ.get("SSHWB_APP_PASSWORD", "")
        enc_key = os.environ.get("SSHWB_CREDENTIAL_ENCRYPTION_KEY", "")
        cookie_secure = os.environ.get("SSHWB_COOKIE_SECURE", "false").lower() == "true"
        allowed_origin = os.environ.get("SSHWB_ALLOWED_ORIGIN", "")
        if not app_password:
            print("Error: SSHWB_APP_PASSWORD is required in non-interactive mode.")
            sys.exit(1)
        if not enc_key:
            print("Error: SSHWB_CREDENTIAL_ENCRYPTION_KEY is required in non-interactive mode.")
            sys.exit(1)
        error = validate_password(app_password) or validate_enc_key(enc_key) or validate_port(port)
        if error:
            print(f"Error: {error}")
            sys.exit(1)
    else:
        print("This wizard writes .env and optionally starts the container.")
        print("Press Ctrl-C at any time to abort without making changes.\n")

        # 1. Port
        port = ask("Port", default="5234", validator=validate_port)

        # 2. App password
        print()
        print("App password — used to log in to the web interface.")
        gen_pw = secrets.token_urlsafe(18)
        use_generated_pw = ask_bool(f"  Generate a random password? ({gen_pw})", default=True)
        if use_generated_pw:
            app_password = gen_pw
            print(f"  Generated: {app_password}")
        else:
            while True:
                app_password = ask("  Password (min 8 chars)", validator=validate_password, secret=True)
                confirm_password = ask("  Confirm password", secret=True)
                if app_password == confirm_password:
                    break
                print("  ✗ Passwords do not match. Please try again.")

        # 3. Encryption key
        print()
        print("Credential encryption key — encrypts saved SSH passwords and private keys at rest.")
        print("IMPORTANT: back this up separately. Losing it makes saved credentials unrecoverable.")
        gen_key = secrets.token_hex(32)
        use_generated_key = ask_bool(f"  Generate a random key? (shown once)", default=True)
        if use_generated_key:
            enc_key = gen_key
            print(f"  Generated: {enc_key}")
        else:
            while True:
                enc_key = ask("  Key (min 32 chars)", validator=validate_enc_key, secret=True)
                confirm_key = ask("  Confirm key", secret=True)
                if enc_key == confirm_key:
                    break
                print("  ✗ Keys do not match. Please try again.")

        # 4. HTTPS / COOKIE_SECURE
        print()
        cookie_secure = ask_bool(
            "Are you deploying behind an HTTPS reverse proxy?",
            default=False
        )

        # 5. ALLOWED_ORIGIN
        allowed_origin = ""
        if cookie_secure:
            print()
            allowed_origin = ask(
                "Allowed origin (e.g. https://ssh.example.com — leave blank to skip)",
                default="",
                validator=validate_origin
            )

    # ── write .env ────────────────────────────────────────────────────────────
    env_lines = [
        f"APP_PASSWORD={app_password}",
        f"CREDENTIAL_ENCRYPTION_KEY={enc_key}",
        f"PORT={port}",
        f"COOKIE_SECURE={'true' if cookie_secure else 'false'}",
    ]
    if allowed_origin:
        env_lines.append(f"ALLOWED_ORIGIN={allowed_origin}")
    env_content = "\n".join(env_lines) + "\n"

    if env_path.exists() and not args.non_interactive:
        print()
        overwrite = ask_bool(f".env already exists at {env_path}. Overwrite?", default=False)
        if not overwrite:
            print("Aborted — .env left unchanged.")
            sys.exit(0)

    env_path.write_text(env_content, encoding="utf-8")
    env_path.chmod(0o600)
    print()
    print(f"✓ .env written to {env_path} (chmod 600)")

    # ── summary ───────────────────────────────────────────────────────────────
    if not args.non_interactive:
        print()
        print("Configuration summary:")
        print(f"  Port             : {port}")
        print(f"  App password     : {'(generated — see above)' if use_generated_pw else '(provided)'}")
        print(f"  Encryption key   : {'(generated — see above)' if use_generated_key else '(provided)'}")
        print(f"  COOKIE_SECURE    : {'true' if cookie_secure else 'false'}")
        if allowed_origin:
            print(f"  ALLOWED_ORIGIN   : {allowed_origin}")
        print()
        print("Next step: docker compose up -d --build")
        print(f"Then open : http://localhost:{port}")

    # ── optional start ─────────────────────────────────────────────────────
    do_start = args.start
    if not args.non_interactive and not do_start:
        print()
        do_start = ask_bool("Start the container now? (docker compose up -d --build)", default=True)

    if do_start:
        if not check_docker():
            print("Error: docker not found. Install Docker Engine first.")
            sys.exit(1)
        compose = docker_compose_cmd()
        cmd = compose + ["-f", str(compose_path), "up", "-d", "--build", "--wait"]
        print()
        print(f"Running: {' '.join(cmd)}")
        print()
        result = subprocess.run(cmd, cwd=str(project_dir))
        if result.returncode != 0:
            print("\nError: docker compose failed. Check the output above.")
            sys.exit(result.returncode)
        print()
        print("✓ Container started.")
        print()

        # quick health check
        import urllib.request, urllib.error, time
        url = f"http://127.0.0.1:{port}/api/health"
        for attempt in range(10):
            try:
                with urllib.request.urlopen(url, timeout=3) as resp:
                    if resp.status == 200:
                        print(f"✓ Health check passed: {url}")
                        break
            except Exception:
                pass
            time.sleep(3)
        else:
            print(f"  Health check did not pass within 30s. Check: docker compose logs ssh-workbench")

        print()
        print(f"Open in browser: http://localhost:{port}")
        if app_password:
            print(f"Password       : {app_password}")


if __name__ == "__main__":
    main()
