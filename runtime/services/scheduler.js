// The scheduler as a managed SERVICE: a daemon that ticks every minute and runs
// any due tasks (backend/scheduler.js jobs[]). This is the long-running home of
// the scheduler — it replaces calling `node runtime/cli.js start-scheduler` from an
// external cron. Supervise it like any other service:
//   node runtime/cli.js service start scheduler
//   node runtime/cli.js service logs scheduler
export default {
  cmd: 'node',
  args: ['runtime/cli.js', 'scheduler-loop'],
}
