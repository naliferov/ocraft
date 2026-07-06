// Client-side API auth — email+password (the default) plus optional Google, over HttpOnly session
// cookies. JS never holds a secret; the browser auto-sends the session cookie on same-origin /api.

// GET /api/session (ungated, always 200) → { authorized, googleConfigured }. The SPA asks once on
// load to choose app-vs-login; Login uses googleConfigured to decide whether to show the Google button.
export const getSession = async () => {
  const res = await fetch('/api/session')
  return res.json()
}

const postJson = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return data
}

// Email+password — sign in to an existing account / create a new one. Both set the session cookie on
// success; the caller then navigates home and the router re-checks the session.
export const login = (email, password) => postJson('/api/auth/login', { email, password })
export const signup = (email, password) => postJson('/api/auth/signup', { email, password })

// Optional Google — a full-page navigation (not fetch): the server 302s to Google, the callback sets
// the cookie and returns to /. Only shown when the server reports googleConfigured.
export const loginWithGoogle = () => {
  window.location.href = '/api/auth/google'
}

export const logout = async () => {
  await fetch('/api/logout', { method: 'POST' })
}
