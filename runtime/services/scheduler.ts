// The scheduler as a managed SERVICE: a daemon that ticks every minute and runs
// any due tasks (runtime/scheduler.ts jobs[]). This is the long-running home of
// the scheduler — it replaces calling `npm run cli start-scheduler` from an
// external cron. Supervise it like any other service:
//   npm run cli service start scheduler
//   npm run cli service logs scheduler
export default {
  cmd: 'node',
  args: [
    '--experimental-strip-types',
    '--disable-warning=ExperimentalWarning',
    'runtime/cli.ts',
    'scheduler-loop',
  ],
}
