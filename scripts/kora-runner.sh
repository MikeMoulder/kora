#!/usr/bin/env bash
#
# Fires KORA's due scheduled payments. Meant for a cron or a systemd timer on a
# host you control.
#
#   KORA_URL=https://your-app KORA_RUNNER_SECRET=... ./scripts/kora-runner.sh
#
# WHY THIS EXISTS RATHER THAN A VERCEL CRON
#
# The Redis store does a read, a check and a write without a lock, so two
# runners firing at the same moment could in principle both claim the same
# payment and both deliver it. Vercel Cron does not promise exactly-once: a
# retry or an overlapping invocation gives you two callers, which is precisely
# the case that store cannot survive.
#
# One timer on one host, wrapped in flock, gives exactly one caller. The race
# stops being reachable rather than being defended against. That is a better
# fix than the Lua script the store's own comment suggests, and it is this
# file.
#
# INSTALL, CRON
#
#   sudo apt install -y util-linux curl          # flock lives in util-linux
#   sudo install -m 755 kora-runner.sh /usr/local/bin/kora-runner
#   sudo install -m 600 /dev/null /etc/kora-runner.env
#   sudo tee /etc/kora-runner.env >/dev/null <<'EOF'
#   KORA_URL=https://your-app.vercel.app
#   KORA_RUNNER_SECRET=the-value-from-your-vercel-env
#   EOF
#
#   crontab -e, then:
#   * * * * * set -a; . /etc/kora-runner.env; set +a; /usr/local/bin/kora-runner >> /var/log/kora-runner.log 2>&1
#
# INSTALL, SYSTEMD, which is better because it logs properly
#
#   /etc/systemd/system/kora-runner.service
#     [Unit]
#     Description=KORA scheduled payment runner
#     After=network-online.target
#
#     [Service]
#     Type=oneshot
#     EnvironmentFile=/etc/kora-runner.env
#     ExecStart=/usr/local/bin/kora-runner
#
#   /etc/systemd/system/kora-runner.timer
#     [Unit]
#     Description=Run KORA due payments every minute
#
#     [Timer]
#     OnBootSec=1min
#     OnUnitActiveSec=1min
#     AccuracySec=5s
#     # No Persistent=true. A missed minute must not queue up and fire a burst
#     # of runs after a reboot; the next tick collects everything due anyway.
#
#     [Install]
#     WantedBy=timers.target
#
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now kora-runner.timer
#   systemctl list-timers kora-runner.timer
#   journalctl -u kora-runner.service -f
#
# Keep /etc/kora-runner.env at mode 600. It holds the secret that decides when
# payments fire.

set -euo pipefail

: "${KORA_URL:?KORA_URL is not set. Example: https://your-app.vercel.app}"
: "${KORA_RUNNER_SECRET:?KORA_RUNNER_SECRET is not set. It must match the deployment.}"

LOCK_FILE="${KORA_LOCK_FILE:-/tmp/kora-runner.lock}"

# Re-exec under flock unless we already hold it.
#
# -n means give up immediately rather than wait. A run that is still going is a
# run that is still going: queueing behind it would mean a slow settlement
# produces a pile of callers, which is the exact condition this is here to
# prevent. Skipping is free, because the next tick collects whatever is due.
if [ "${KORA_LOCKED:-}" != "1" ]; then
  export KORA_LOCKED=1
  exec flock -n "$LOCK_FILE" "$0" "$@"
fi

stamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# --fail-with-body so a 401 still prints why, rather than curl swallowing the
# body and leaving "exit 22" as the only clue. --max-time is generous: a tick
# with several due payments settles them one at a time on Stellar.
response="$(
  curl --silent --show-error --fail-with-body \
    --max-time "${KORA_TIMEOUT:-300}" \
    --retry 2 --retry-delay 5 --retry-connrefused \
    -X POST "${KORA_URL%/}/api/schedule/run" \
    -H "x-kora-runner: ${KORA_RUNNER_SECRET}" \
    -H 'content-length: 0'
)" || {
  status=$?
  echo "$(stamp) FAILED curl exit ${status}: ${response:-<no body>}" >&2
  exit "$status"
}

# Quiet unless something happened.
#
# A minute-by-minute log of "due 0" buries the one line that matters. Anything
# that actually moved is printed in full, including failures, which have
# already had their naira returned by the time this sees them.
if printf '%s' "$response" | grep -q '"due":0'; then
  exit 0
fi

echo "$(stamp) ${response}"
