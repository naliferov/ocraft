// Frontend dev server (Vite). Runs `npm run dev` in frontend/, which also
// auto-spawns the backend API server on port 3001. Stopping this proc kills the
// whole group (npm + vite + the spawned backend), since procs are killed by
// process group.
export default {
  cmd: 'npm',
  args: ['run', 'dev'],
  cwd: 'frontend', // relative to repo root
}
