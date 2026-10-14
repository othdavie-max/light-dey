-- Our own small error log (no outside service, no personal data).
-- Phones and the server report crashes here; the admin page lists them, grouped, with a count.
-- Closed to the public: only the server (service role) reads or writes it.
create table if not exists client_errors (
  id          bigint generated always as identity primary key,
  fingerprint text not null unique,            -- same crash = same fingerprint, so repeats are counted not listed again
  source      text not null check (source in ('browser', 'server')),
  message     text not null,
  stack       text,
  path        text,                            -- the page, never the query string
  user_agent  text,                            -- short browser/phone description
  count       int  not null default 1,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  resolved    boolean not null default false
);
create index if not exists client_errors_open_idx on client_errors (resolved, last_seen desc);
alter table client_errors enable row level security;
