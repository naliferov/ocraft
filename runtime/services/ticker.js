// A service config. One file per service, discovered by serviceManager from this
// folder (like backend/tasks/ for tasks). The service id is the filename — here,
// "ticker".
//
// Export a config object. Fields:
//   cmd          executable to run (argv[0]); spawned without a shell
//   args         array of arguments (default: [])
//   cwd          working directory; relative paths resolve from repo root
//                (default: repo root)
//   env          extra env vars, merged over process.env (default: none)
//   autoRestart  reserved for a future supervisor tick; not acted on yet
//
// Runtime state (pid/status) is kept separately in
// backend/state/services/<id>.json — this file is config only.
//
// Self-contained example for testing start/stop/logs: prints a tick every second
// to its log. To add another service, drop a sibling file here, e.g. frontend.js:
//   export default { cmd: 'npm', args: ['run', 'dev'], cwd: 'frontend' }

export default {
  cmd: 'node',
  args: ['-e', "setInterval(() => console.log(new Date().toISOString(), 'tick'), 1000)"],
}
