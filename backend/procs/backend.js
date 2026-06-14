// Backend API server (port 3001). Runs as its own managed proc — detached, so it
// survives Claude/terminal session exits — with output logged to
// state/procs/backend.log. Start/stop/inspect via:
//   node cli.js proc start backend
//   node cli.js proc logs backend
// The frontend (Vite) only proxies /api here; it no longer spawns the backend
// itself (the vite.config backendPlugin was removed).
export default {
  cmd: 'node',
  args: ['backend/server.js'],
  // cwd defaults to the repo root
}
