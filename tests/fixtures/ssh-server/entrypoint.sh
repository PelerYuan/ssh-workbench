#!/bin/sh
set -eu

umask 077
mkdir -p /fixture /home/workbench/.ssh /run/sshd

if [ ! -s /fixture/id_ed25519 ]; then
  ssh-keygen -q -t ed25519 -N '' -C 'ssh-workbench-test-only' -f /fixture/id_ed25519
fi
chown "${TEST_KEY_UID:-1000}:${TEST_KEY_GID:-1000}" /fixture/id_ed25519 /fixture/id_ed25519.pub

cp /fixture/id_ed25519.pub /home/workbench/.ssh/authorized_keys
chown -R workbench:workbench /home/workbench/.ssh
chmod 700 /home/workbench/.ssh
chmod 600 /home/workbench/.ssh/authorized_keys

ssh-keygen -A
exec /usr/sbin/sshd -D -e
