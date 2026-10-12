-- Light Dey? database schema, part 1: tables, indexes, helper functions.
-- Row Level Security lives in 0002_security.sql. All timestamps are UTC (timestamptz);
-- the app displays them in Africa/Lagos.

create extension if not exists pg_trgm;   -- fuzzy matching for duplicate-spot warnings

-- ---------- Types ----------
create type light_status as enum ('on', 'off', 'weak');                        -- what a person reports
create type spot_state   as enum ('on', 'off', 'weak', 'mixed', 'unknown');    -- what we compute
create type review_state as enum ('approved', 'pending', 'rejected', 'merged');
create type band_code    as enum ('A', 'B', 'C', 'D', 'E');

-- ---------- Location hierarchy: State > LGA > Area > Spot ----------
create table states (
  id   smallint generated always as identity primary key,
  name text not null unique,
  slug text not null unique
);

create table lgas (
  id       int generated always as identity primary key,
  state_id smallint not null references states(id) on delete cascade,
  name     text not null,
  slug     text not null,
  unique (state_id, slug)
);
create index lgas_state_idx on lgas (state_id);

create table areas (
  id     int generated always as identity primary key,
  lga_id int not null references lgas(id) on delete cascade,
  name   text not null,
  slug   text not null,
  city   text,                       -- e.g. 'Abuja', 'Lagos': what people call the city
  unique (lga_id, slug)
);
create index areas_lga_idx on areas (lga_id);
create index areas_city_idx on areas (city);

-- Editable list of distribution companies
create table discos (
  id        smallint generated always as identity primary key,
  name      text not null,
  code      text not null unique,    -- e.g. AEDC
  slug      text not null unique,
  is_active boolean not null default true
);

-- Promised daily supply hours per tariff band. VERIFY against NERC's current order.
create table band_thresholds (
  id               int generated always as identity primary key,
  band             band_code not null,
  min_hours_per_day numeric(4,1) not null,
  effective_date   date not null,
  source_note      text,
  unique (band, effective_date)
);

-- ---------- People ----------
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  nickname       text not null unique,
  language       text not null default 'pcm' check (language in ('en', 'pcm')),
  theme          text not null default 'dark' check (theme in ('dark', 'light')),
  trust_score    real not null default 1.0,      -- never shown publicly
  points         int  not null default 0,
  streak_current int  not null default 0,
  streak_best    int  not null default 0,
  last_report_day date,
  is_admin       boolean not null default false,
  is_banned      boolean not null default false,
  referred_by    uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- Anonymous device identities (linked to a profile when someone signs in)
create table devices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,
  device_hash text not null unique,              -- hash only, never a raw identifier
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);
create index devices_user_idx on devices (user_id);

-- ---------- Spots ----------
create table spots (
  id          uuid primary key default gen_random_uuid(),
  area_id     int  not null references areas(id) on delete cascade,
  name        text not null,
  disco_id    smallint references discos(id) on delete set null,
  band        band_code,
  status_flag review_state not null default 'pending',
  is_default  boolean not null default false,    -- the automatic "whole area" spot
  is_demo     boolean not null default false,    -- fake data, safe to delete before launch
  created_by  uuid references auth.users(id) on delete set null,
  merged_into uuid references spots(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (area_id, name)
);
create index spots_area_idx on spots (area_id);
create index spots_name_trgm_idx on spots using gin (name gin_trgm_ops);

-- Current computed status per spot (broadcast via Realtime)
create table spot_status (
  spot_id        uuid primary key references spots(id) on delete cascade,
  status         spot_state not null default 'unknown',
  confidence     real not null default 0,
  since          timestamptz,                    -- when the current status began
  last_report_at timestamptz,
  last_change_at timestamptz,
  recent_reports int not null default 0,
  updated_at     timestamptz not null default now()
);

-- ---------- Reports and supply history ----------
create table reports (
  id              bigint generated always as identity primary key,
  spot_id         uuid not null references spots(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,   -- anonymised if account deleted
  device_id       uuid references devices(id) on delete set null,
  status          light_status not null,
  is_confirmation boolean not null default false,  -- same as the status already current
  weight          real,                            -- recency/trust weight used when it was counted
  ip_hash         text,                            -- salted hash, for abuse checks only
  coarse_geo      text,                            -- rounded location, abuse checks only
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now()
);
create index reports_spot_time_idx  on reports (spot_id, created_at desc);
create index reports_user_spot_idx  on reports (user_id, spot_id, created_at desc);
create index reports_device_time_idx on reports (device_id, created_at desc);

-- Source of truth for "hours of light" calculations
create table supply_sessions (
  id         bigint generated always as identity primary key,
  spot_id    uuid not null references spots(id) on delete cascade,
  status     light_status not null,
  started_at timestamptz not null,
  ended_at   timestamptz,
  is_demo    boolean not null default false,
  check (ended_at is null or ended_at > started_at)
);
create index sessions_spot_start_idx on supply_sessions (spot_id, started_at desc);
create unique index sessions_one_open_per_spot on supply_sessions (spot_id) where ended_at is null;

-- Precomputed by a scheduled job so pages load fast
create table daily_spot_stats (
  spot_id          uuid not null references spots(id) on delete cascade,
  day              date not null,                  -- Africa/Lagos calendar day
  minutes_on       int not null default 0,
  minutes_weak     int not null default 0,
  minutes_off      int not null default 0,
  minutes_unknown  int not null default 0,
  report_count     int not null default 0,
  reporter_count   int not null default 0,
  primary key (spot_id, day)
);
create table weekly_spot_stats (
  spot_id          uuid not null references spots(id) on delete cascade,
  week_start       date not null,                  -- Monday, Africa/Lagos
  minutes_on       int not null default 0,
  minutes_weak     int not null default 0,
  minutes_off      int not null default 0,
  minutes_unknown  int not null default 0,
  report_count     int not null default 0,
  reporter_count   int not null default 0,
  primary key (spot_id, week_start)
);

-- ---------- Saved spots, follows, notifications ----------
create table saved_spots (
  user_id  uuid not null references auth.users(id) on delete cascade,
  spot_id  uuid not null references spots(id) on delete cascade,
  label    text,                                   -- Home, Office, Mum's house
  position smallint not null default 0,
  primary key (user_id, spot_id)
);

create table follows (
  user_id          uuid not null references auth.users(id) on delete cascade,
  spot_id          uuid not null references spots(id) on delete cascade,
  alert_on_come    boolean not null default true,  -- "Light don come"
  alert_on_go      boolean not null default false, -- "Light don go"
  quiet_enabled    boolean not null default true,
  quiet_start      time not null default '23:00',
  quiet_end        time not null default '06:00',
  last_notified_at timestamptz,                    -- cooldown
  primary key (user_id, spot_id)
);
create index follows_spot_idx on follows (spot_id);

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index push_user_idx on push_subscriptions (user_id);

-- ---------- Rewards, referrals, moderation ----------
create table badges (
  code           text primary key,
  name_en        text not null,
  name_pcm       text not null,
  description_en text not null,
  description_pcm text not null
);
create table user_badges (
  user_id    uuid not null references auth.users(id) on delete cascade,
  badge_code text not null references badges(code) on delete cascade,
  earned_at  timestamptz not null default now(),
  primary key (user_id, badge_code)
);

create table referrals (
  id          bigint generated always as identity primary key,
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_id uuid not null references auth.users(id) on delete cascade,
  spot_id     uuid references spots(id) on delete set null,
  rewarded    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (referred_id)
);

create table flags (
  id          bigint generated always as identity primary key,
  kind        text not null,                       -- 'new_spot', 'duplicate', 'suspicious_reporter', 'other'
  target_type text not null,                       -- 'spot', 'user', 'report'
  target_id   text not null,
  reason      text,
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_by  uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index flags_open_idx on flags (status, created_at desc);

-- Server-side rate limiting (user, device and IP keys). Only the server touches this.
create table rate_limit_hits (
  key    text not null,
  hit_at timestamptz not null default now()
);
create index rate_limit_key_idx on rate_limit_hits (key, hit_at desc);

-- ---------- Functions and triggers ----------

-- Every new auth user (including anonymous ones) gets a profile with a friendly nickname.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nickname)
  values (new.id, 'Neighbour-' || substr(md5(random()::text || new.id::text), 1, 6));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Every new spot starts with an "unknown" status row.
create function public.handle_new_spot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into spot_status (spot_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_spot_created after insert on spots
  for each row execute function public.handle_new_spot();

-- Is the current user an admin?
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

-- People can edit their own profile, but never their trust, points, streaks, or admin/ban flags.
create function public.protect_profile_columns() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.trust_score    is distinct from old.trust_score
    or new.points         is distinct from old.points
    or new.streak_current is distinct from old.streak_current
    or new.streak_best    is distinct from old.streak_best
    or new.last_report_day is distinct from old.last_report_day
    or new.is_admin       is distinct from old.is_admin
    or new.is_banned      is distinct from old.is_banned
    or new.referred_by    is distinct from old.referred_by then
      raise exception 'These profile fields can only be changed by the server';
    end if;
  end if;
  return new;
end $$;
create trigger protect_profile before update on profiles
  for each row execute function public.protect_profile_columns();

-- Limits come from config/app.config.ts; the database enforces them as a safety net (max 3).
create function public.enforce_max_three() returns trigger
language plpgsql as $$
declare n int;
begin
  execute format('select count(*) from %I where user_id = $1', tg_table_name) into n using new.user_id;
  if n >= 3 then
    raise exception 'You can have at most 3 % entries', tg_table_name;
  end if;
  return new;
end $$;
create trigger saved_spots_max before insert on saved_spots for each row execute function public.enforce_max_three();
create trigger follows_max     before insert on follows     for each row execute function public.enforce_max_three();

-- "Did you mean...?" warning when someone adds a spot with a similar name in the same area.
create function public.similar_spots(p_area_id int, p_name text)
returns table (id uuid, name text, similarity real)
language sql stable as $$
  select s.id, s.name, similarity(s.name, p_name)
  from spots s
  where s.area_id = p_area_id
    and s.status_flag <> 'rejected'
    and similarity(s.name, p_name) > 0.35
  order by 3 desc
  limit 5
$$;

-- Public "recent activity" feed: no user ids, no device ids, just status and time.
create view public.recent_activity as
  select spot_id, status, created_at
  from reports
  where created_at > now() - interval '24 hours';
