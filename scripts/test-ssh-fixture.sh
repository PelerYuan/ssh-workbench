#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compose_file="$project_dir/docker-compose.test.yml"
runtime_dir="$project_dir/tests/.runtime/ssh"
export TEST_KEY_UID="$(id -u)"
export TEST_KEY_GID="$(id -g)"

compose() {
  if docker info >/dev/null 2>&1; then
    docker compose -f "$compose_file" "$@"
  elif sudo -n docker info >/dev/null 2>&1; then
    sudo -E docker compose -f "$compose_file" "$@"
  else
    printf '%s\n' '当前用户无权访问 Docker；请将用户加入 docker 组或配置 sudo。' >&2
    exit 1
  fi
}

usage() {
  printf '%s\n' "用法: $0 {start|stop|status|credentials}"
}

case "${1:-}" in
  start)
    mkdir -p "$runtime_dir"
    compose up --detach --build --wait
    printf '%s\n' '测试 SSH 目标已就绪：127.0.0.1:2222'
    printf '%s\n' "运行 '$0 credentials' 查看测试凭据。"
    ;;
  stop)
    compose down
    ;;
  status)
    compose ps
    ;;
  credentials)
    if [ ! -s "$runtime_dir/id_ed25519" ]; then
      printf '%s\n' '测试密钥尚未生成，请先执行 start。' >&2
      exit 1
    fi
    printf '%s\n' \
      '主机: 127.0.0.1' \
      '端口: 2222' \
      '用户: workbench' \
      '密码: test-password' \
      "私钥: $runtime_dir/id_ed25519"
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
