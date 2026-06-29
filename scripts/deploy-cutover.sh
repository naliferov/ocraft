#!/usr/bin/env bash
# Tier-1 "blue/green-lite" cutover — run ON THE DEPLOY BOX by .github/workflows/ci.yml, after the new
# code is on disk (git reset) and the new bundle is staged at frontend/dist.new. When this starts the
# live :80 process is STILL serving the OLD code (loaded in memory) + the OLD bundle.
#
# We migrate, then pre-flight the new backend on a spare port (:3002). Only if it boots and serves do
# we swap the bundle + restart :80. A broken deploy never takes :80 down, and we roll the code back.
# NB: migrate runs while the old :80 still serves -> keep migrations additive (backward-compatible).
set -u
cd /root/ocraft || exit 1

OLD_SHA="$(cat /tmp/ocraft_prev_sha 2>/dev/null || git rev-parse HEAD)"
NEW_SHA="$(git rev-parse --short HEAD)"

rollback_code() {
  echo "rolling code back to $OLD_SHA"
  git reset --hard "$OLD_SHA" && npm install
}

# 1. Migrate (forward-only + additive, so the still-running old :80 tolerates the new schema).
if ! node runtime/cli.js migrate; then
  echo "MIGRATE FAILED — :80 untouched"
  rollback_code
  rm -rf frontend/dist.new
  exit 1
fi

# 2. Pre-flight the NEW backend on :3002 — :80 stays on the old code the whole time.
echo "pre-flighting $NEW_SHA on :3002 ..."
PORT=3002 BIND_HOST=127.0.0.1 NODE_ENV=production node runtime/api.js > /tmp/ocraft-preflight.log 2>&1 &
PRE=$!
ok=0
for _ in $(seq 1 12); do
  sleep 1
  if curl -fsS -m 5 http://127.0.0.1:3002/api/session > /dev/null 2>&1; then
    ok=1
    break
  fi
done
kill "$PRE" 2>/dev/null

if [ "$ok" != 1 ]; then
  echo "PRE-FLIGHT FAILED: $NEW_SHA did not boot on :3002 — prod :80 untouched"
  tail -n 25 /tmp/ocraft-preflight.log
  rollback_code
  rm -rf frontend/dist.new
  exit 1
fi

# 3. Green: swap the bundle in + restart :80 (new backend + new bundle together), then verify.
echo "pre-flight green — cutting :80 over to $NEW_SHA"
rm -rf frontend/dist && mv frontend/dist.new frontend/dist
node runtime/cli.js service restart api
sleep 3
if ! curl -fsS -m 10 http://127.0.0.1/api/session > /dev/null 2>&1; then
  echo "CUTOVER CHECK FAILED — rolling back to $OLD_SHA"
  rollback_code
  node runtime/cli.js service restart api
  exit 1
fi

echo "deployed $NEW_SHA  (previous $OLD_SHA — rollback: git reset --hard $OLD_SHA && npm install && node runtime/cli.js service restart api)"
