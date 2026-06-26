// Client-side API auth. The token is validated by POST /api/login, which sets an
// HttpOnly session cookie — so the browser auto-sends it on every same-origin /api
// request and JS never holds the secret (XSS can't read an HttpOnly cookie). No fetch
// wrapper, no localStorage token: same-origin cookies ride along automatically.

// Ask the server whether the current cookie is a valid session. GET /api/session is
// ungated and always answers { authorized } with 200 — so the SPA learns its auth state
// directly, without firing a data request that would 401 just to find out.
export const checkAuth = async () => {
  const res = await fetch('/api/session')
  const { authorized } = await res.json()
  return authorized
}

export const login = async (token) => {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  return res.ok
}

export const logout = async () => {
  await fetch('/api/logout', { method: 'POST' })
}
