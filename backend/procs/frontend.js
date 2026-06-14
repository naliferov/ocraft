// Frontend dev server (Vite, port 5173). Runs `npm run dev` in frontend/ and
// proxies /api to the backend proc on port 3001 (started separately — see
// backend/procs/backend.js). Vite no longer spawns the backend itself.
export default {
  cmd: 'npm',
  args: ['run', 'dev'],
  cwd: 'frontend', // relative to repo root
}
