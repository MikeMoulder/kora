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

# The request.
#
# Judged on the HTTP status code, never on curl's exit code, and that is not
# fussiness. `--retry` and `--fail-with-body` interact: with `--retry` in play,
# some curl builds return 0 on a 404 while others return 22. Ubuntu's 8.5.0
# returned 22 and the curl in Git Bash returned 0, from the same script against
# the same URL. A runner that decides whether a payment went by reading an exit
# code that varies by build is a runner that will one day log a success for an
# error page.
#
# So `--fail-with-body` is gone. Without it curl exits 0 for any response it
# managed to receive, prints the body whatever the status, and `%{http_code}`
# says what actually happened. curl's exit code then means only what it should:
# the request never completed at all.
#
# `--max-time` is generous, because a tick with several due payments settles
# them one at a time on Stellar.
status=0
raw="$(
  curl --silent --show-error \
    --max-time "${KORA_TIMEOUT:-300}" \
    --retry 2 --retry-delay 5 --retry-connrefused \
    -w $'\n%{http_code}' \
    -X POST "${KORA_URL%/}/api/schedule/run" \
    -H "x-kora-runner: ${KORA_RUNNER_SECRET}" \
    -H 'content-length: 0'
)" || status=$?

http="${raw##*$'\n'}"
response="${raw%$'\n'*}"

# A body that is not JSON is not ours.
#
# This mattered the first time somebody pointed the runner at a deployment that
# predated the route. Next.js served its own 404 page, the body was printed in
# full, and systemd wrote eight kilobytes of markup to the journal once a
# minute. The useful fact, "404", was buried in it, and a host left running
# overnight would have filled its disk with copies of an error page.
#
# So an HTML body is described rather than reproduced, and anything else is
# capped. Whatever the server actually said stays recoverable with curl by hand.
summarise() {
  body="$1"

  case "$body" in
    '<'*|'<!'*)
      printf 'an HTML page, %s bytes, not a JSON response from this API' "${#body}"
      return
      ;;
  esac

  if [ "${#body}" -gt 400 ]; then
    printf '%s... (%s bytes total)' "${body:0:400}" "${#body}"
  else
    printf '%s' "${body:-<no body>}"
  fi
}

# The request never completed. No status, nothing to read.
if [ "$status" -ne 0 ] || [ -z "$http" ] || [ "$http" = "000" ]; then
  echo "$(stamp) UNREACHABLE curl exit ${status}: $(summarise "$response")" >&2
  echo "$(stamp) HINT Check KORA_URL, DNS and that the deployment is up." >&2
  exit "${status:-1}"
fi

# It answered, but not with a success.
case "$http" in
  2??) ;;
  *)
    echo "$(stamp) FAILED http ${http}: $(summarise "$response")" >&2

    # The two worth naming, because the status alone sends people to the wrong
    # place.
    case "$http" in
      404)
        echo "$(stamp) HINT 404 means this deployment has no /api/schedule/run." >&2
        echo "$(stamp) HINT That build predates the scheduling work. Push and redeploy." >&2
        ;;
      401)
        echo "$(stamp) HINT 401 is the secret. Compare KORA_RUNNER_SECRET here against the deployment's." >&2
        ;;
    esac

    exit 22
    ;;
esac

# Quiet unless something happened.
#
# A minute-by-minute log of "due 0" buries the one line that matters. Anything
# that actually moved is printed in full, including failures, which have already
# had their naira returned by the time this sees them.
if printf '%s' "$response" | grep -q '"due":0'; then
  exit 0
fi

echo "$(stamp) ${response}"
