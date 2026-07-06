// devlab — the offline Vue-component playground (projects/devlab). Runs its Vite dev server
// (`npm run dev`) as a managed SERVICE, supervised like the frontend/api/scheduler:
//   npm run cli service start devlab
//   npm run cli service logs devlab
//   npm run cli service stop devlab
// Uses Vite's default port 5173 — the same slot as the `frontend` service, so run one or the other
// as "the front" (stop frontend before starting devlab). Add `--port <n>` to args to run both.
export default {
  cmd: 'npm',
  args: ['run', 'dev'],
  cwd: 'projects/devlab', // relative to repo root
}
