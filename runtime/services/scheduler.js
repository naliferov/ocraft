// The scheduler as a managed SERVICE: a daemon that ticks every minute and runs
// any due tasks (backend/scheduler.js jobs[]). This is the long-running home of
// the scheduler — it replaces calling `node bin/cli.js start-scheduler` from an
// external cron. Supervise it like any other service:
//   node bin/cli.js service start scheduler
//   node bin/cli.js service logs scheduler
export default {
  cmd: 'node',
  args: ['bin/cli.js', 'scheduler-loop'],
}
