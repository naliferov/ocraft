-- 001_init.sql — initial schema for the multi-user pivot (Postgres, Phase 2).
-- Apply with:  node runtime/cli.js migrate   (idempotent; tracked in schema_migrations).
-- All ids are bigint (bigserial autoincrement) — numeric, simple, consistent.
-- Auth: email+password (users.password_hash) by default; Google OAuth optional (accounts table).
-- See plans/multi-user-postgres-oauth-plan.txt.

create table users (
  id            bigserial primary key,
  email         text unique,                                      -- login id for email+password; also set from OAuth
  name          text,
  password_hash text,                                             -- scrypt hash for email+password; null for OAuth-only
  created_at    timestamptz not null default now()
);

-- One row per linked login. Multi-provider (google, github, …) with NO column-sprawl, and a
-- user can link several. On sign-in, look up by (provider, provider_account_id) → user_id.
create table accounts (
  user_id              bigint not null references users(id) on delete cascade,
  provider             text not null,                                -- 'google', 'github', …
  provider_account_id  text not null,                                -- the provider's user id ("sub")
  created_at           timestamptz not null default now(),
  primary key (provider, provider_account_id)
);
create index accounts_user_idx on accounts (user_id);

create table nodes (
  id          bigserial primary key,                                -- numeric — matches /node/:id + [[id]] links
  user_id     bigint not null references users(id) on delete cascade, -- owner; EVERY node has exactly one
  parent_id   bigint references nodes(id),                          -- adjacency-list tree (null = root)
  type        text not null default 'html',
  name        text not null default 'new node',
  data        jsonb not null default '{}',                          -- open-ended rest of state.json: collapsed,
                                                                     -- runOnOpen, scriptType … and a binary
                                                                     -- node's { mime }
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index nodes_user_idx        on nodes (user_id);
create index nodes_user_parent_idx on nodes (user_id, parent_id);

create table node_bodies (
  node_id      bigint primary key references nodes(id) on delete cascade,
  content      bytea,                                               -- text bodies (html/script) AND binary
                                                                    -- (image/video/audio) — content_type tells which
  content_type text,                                                -- 'text/html', 'text/javascript', 'image/png', …
  updated_at   timestamptz not null default now()
);

create table sessions (
  id          text primary key,                                     -- the random ocraft_session cookie value
  user_id     bigint not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz
);
