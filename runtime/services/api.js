// The node API server (runtime/apiServer.js, port 3001). Runs as its own
// managed SERVICE — detached, so it survives Claude/terminal session exits — with
// output logged to state/services/api.log. Start/stop/inspect via:
//   node runtime/cli.js service start api
//   node runtime/cli.js service logs api
// The frontend (Vite) only proxies /api here; it does not spawn the server itself.
export default {
  cmd: 'node',
  args: ['runtime/apiServer.js'],
  // cwd defaults to the repo root
}
