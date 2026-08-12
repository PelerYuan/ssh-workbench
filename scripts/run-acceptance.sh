#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file=${ENV_FILE:-$project_dir/.env}
runtime_key="$project_dir/tests/.runtime/ssh/id_ed25519"
fixture_started=false

cleanup_fixture() {
  if [ "$fixture_started" = true ]; then
    "$project_dir/scripts/test-ssh-fixture.sh" stop >/dev/null 2>&1 || true
  fi
}
trap cleanup_fixture EXIT INT TERM

if [ ! -f "$env_file" ]; then
  printf '%s\n' "找不到环境文件: $env_file" >&2
  exit 1
fi

docker_cmd=docker
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then
    docker_cmd='sudo docker'
  else
    printf '%s\n' '当前用户无权访问 Docker；请将用户加入 docker 组或配置 sudo。' >&2
    exit 1
  fi
fi

ENV_FILE="$env_file" "$project_dir/scripts/test-ssh-fixture.sh" start
fixture_started=true

# shellcheck disable=SC2086
$docker_cmd run --rm \
  --network host \
  --user "$(id -u):$(id -g)" \
  --env-file "$env_file" \
  --env BASE_URL="${BASE_URL:-http://127.0.0.1:5234}" \
  --env ORIGIN="${ORIGIN:-${BASE_URL:-http://127.0.0.1:5234}}" \
  --volume "$project_dir/tests/acceptance.mjs:/app/acceptance.mjs:ro" \
  --volume "$runtime_key:/fixture/id_ed25519:ro" \
  --entrypoint node \
  ssh-workbench:latest \
  /app/acceptance.mjs
