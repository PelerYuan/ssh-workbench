FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssh-server openssh-client tmux \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --shell /bin/bash workbench \
  && echo 'workbench:test-password' | chpasswd \
  && mkdir -p /run/sshd /fixture /home/workbench/.ssh \
  && chmod 700 /home/workbench/.ssh

COPY sshd_config /etc/ssh/sshd_config
COPY entrypoint.sh /usr/local/bin/test-sshd-entrypoint

RUN chmod 755 /usr/local/bin/test-sshd-entrypoint

EXPOSE 22
ENTRYPOINT ["/usr/local/bin/test-sshd-entrypoint"]

