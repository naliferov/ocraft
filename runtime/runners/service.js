// SOURCE adapter for the universal run manager (../runManager.js): surfaces
// serviceManager's long-running daemons (api / frontend / scheduler / ticker) as
// runs of kind 'service'. Services are configured + started via the CLI
// (`node runtime/cli.js service ...`) and supervised by serviceManager; this adapter
// only AGGREGATES their live status into the unified GET /api/runs view.
//
// Read-only in v1: start/stop stay on the CLI (the api would otherwise be able to
// stop itself mid-request — see plans/unified-run-interface-plan.txt for the
// HTTP-control phase + self-stop guard).
import { listServices, getService } from '../serviceManager.js'

const toRecord = (service) => ({
  id: service.id,
  kind: 'service',
  label: service.id,
  status: service.running ? 'running' : (service.status ?? 'stopped'),
  startedAt: service.startedAt ?? null,
  finishedAt: service.stoppedAt ?? null,
  meta: {
    pid: service.pid,
    autoRestart: service.autoRestart,
    uptimeMs: service.uptimeMs,
    cmd: `${service.cmd} ${(service.args ?? []).join(' ')}`.trim(),
    error: service.error ?? null,
  },
})

export const list = async () => (await listServices()).map(toRecord)

export const get = async (id) => {
  try {
    return toRecord(await getService(id))
  } catch {
    return null // no such service config
  }
}
