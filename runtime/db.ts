// db.js — the Postgres connection (porsager/postgres.js). Reads DATABASE_URL. Imported by the
// pg store + the migrate runner. `sql` is null when DATABASE_URL is unset, so importing this in
// file-store mode is a harmless no-op — the pg store is statically imported but never called.
// See plans/multi-user-postgres-oauth-plan.txt.
import postgres from 'postgres'

const url = process.env.DATABASE_URL
export const sql = url ? postgres(url) : null
