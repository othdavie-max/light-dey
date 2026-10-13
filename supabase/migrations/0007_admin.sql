-- Admin tools: an audit trail, structured details on flags, a safe "merge duplicate spots" function,
-- and the dashboard queries. The functions are callable ONLY by the server (service role), never by a browser.

-- What an admin did, and when. Only the server reads or writes it.
create table admin_audit (
  id          bigint generated always as identity primary key,
  admin_id    uuid references auth.users(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index admin_audit_time_idx on admin_audit (created_at desc);
alter table admin_audit enable row level security;      -- no policies: closed to the browser

-- Flags can carry structured details (for example which DisCo/band was suggested, so it can be undone)
alter table flags add column if not exists details jsonb;

-- ---------- Merge a duplicate spot into the real one ----------
-- Reports, saved spots, follows and referrals move to the kept spot. Blank DisCo/band on the kept spot are filled
-- from the duplicate. The duplicate becomes 'merged' (hidden, and people who saved it are moved), its open supply
-- session is closed, and its past supply history stays with it (sessions from two spots can overlap, so they are
-- not mixed together).
create or replace function public.merge_spots(p_from uuid, p_into uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_from = p_into then raise exception 'Cannot merge a spot into itself'; end if;
  if not exists (select 1 from spots where id = p_into and status_flag in ('approved', 'pending')) then
    raise exception 'The spot to keep was not found (or is itself merged or rejected)';
  end if;
  if not exists (select 1 from spots where id = p_from and status_flag <> 'merged') then
    raise exception 'The duplicate spot was not found (or is already merged)';
  end if;

  update reports set spot_id = p_into where spot_id = p_from;

  update saved_spots s set spot_id = p_into
    where s.spot_id = p_from and not exists (select 1 from saved_spots x where x.user_id = s.user_id and x.spot_id = p_into);
  delete from saved_spots where spot_id = p_from;

  update follows f set spot_id = p_into
    where f.spot_id = p_from and not exists (select 1 from follows x where x.user_id = f.user_id and x.spot_id = p_into);
  delete from follows where spot_id = p_from;

  update referrals set spot_id = p_into where spot_id = p_from;

  update spots t set disco_id = coalesce(t.disco_id, f.disco_id), band = coalesce(t.band, f.band)
    from spots f where t.id = p_into and f.id = p_from;

  update supply_sessions set ended_at = now() where spot_id = p_from and ended_at is null and now() > started_at;
  update spot_status set status = 'unknown', confidence = 0, since = null, updated_at = now() where spot_id = p_from;
  update spots set status_flag = 'merged', merged_into = p_into where id = p_from;
end $$;

-- ---------- Dashboard numbers ----------
create or replace function public.admin_overview(p_include_demo boolean default false) returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (
    select user_id, device_id, spot_id, created_at,
           coalesce(user_id::text, device_id::text) as who,
           (created_at at time zone 'Africa/Lagos')::date as day
    from reports
    where (p_include_demo or not is_demo)
  ),
  today as (select (date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos') as t)
  select jsonb_build_object(
    'reports_today',  (select count(*) from r, today where r.created_at >= today.t),
    'reporters_today',(select count(distinct who) from r, today where r.created_at >= today.t),
    'reports_7d',     (select count(*) from r where created_at >= now() - interval '7 days'),
    'reporters_7d',   (select count(distinct who) from r where created_at >= now() - interval '7 days'),
    'per_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'reports', d.c, 'reporters', d.p) order by d.day), '[]'::jsonb)
      from (select day, count(*) c, count(distinct who) p from r where created_at >= now() - interval '14 days' group by day) d
    ),
    'top_areas', (
      select coalesce(jsonb_agg(jsonb_build_object('area', x.name, 'city', x.city, 'reports', x.c, 'reporters', x.p) order by x.c desc), '[]'::jsonb)
      from (
        select a.name, a.city, count(*) c, count(distinct r.who) p
        from r join spots s on s.id = r.spot_id join areas a on a.id = s.area_id
        where r.created_at >= now() - interval '7 days'
        group by a.id, a.name, a.city order by count(*) desc limit 10
      ) x
    ),
    'totals', jsonb_build_object(
      'people',        (select count(*) from profiles),
      'spots',         (select count(*) from spots where p_include_demo or not is_demo),
      'pending_spots', (select count(*) from spots where status_flag = 'pending' and (p_include_demo or not is_demo)),
      'open_flags',    (select count(*) from flags where status = 'open'),
      'banned',        (select count(*) from profiles where is_banned)
    )
  )
$$;

-- People ranked by how much they reported, with the signals that help spot abuse
create or replace function public.admin_reporters(p_days int default 7, p_include_demo boolean default false)
returns table (
  user_id uuid, nickname text, is_banned boolean, trust real, points int,
  reports bigint, spots bigint, devices bigint, networks bigint, max_per_hour bigint,
  share_off numeric, first_report timestamptz, last_report timestamptz, open_flags bigint
)
language sql stable security definer set search_path = public as $$
  with base as (
    select * from reports
    where user_id is not null and created_at >= now() - make_interval(days => greatest(1, least(p_days, 90))) and (p_include_demo or not is_demo)
  ),
  agg as (
    select user_id, count(*) reports, count(distinct spot_id) spots, count(distinct device_id) devices, count(distinct ip_hash) networks,
           round(avg((status = 'off')::int)::numeric, 2) share_off, min(created_at) first_report, max(created_at) last_report
    from base group by user_id
  ),
  peak as (
    select user_id, max(c) max_per_hour from (select user_id, count(*) c from base group by user_id, date_trunc('hour', created_at)) h group by user_id
  )
  select p.id, p.nickname, p.is_banned, p.trust_score, p.points,
         a.reports, a.spots, a.devices, a.networks, k.max_per_hour, a.share_off, a.first_report, a.last_report,
         (select count(*) from flags f where f.target_type = 'user' and f.target_id = p.id::text and f.status = 'open')
  from agg a join peak k on k.user_id = a.user_id join profiles p on p.id = a.user_id
  order by a.reports desc
  limit 50
$$;

-- Only the server may call these
revoke execute on function public.merge_spots(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.admin_overview(boolean) from public, anon, authenticated;
revoke execute on function public.admin_reporters(int, boolean) from public, anon, authenticated;
grant execute on function public.merge_spots(uuid, uuid) to service_role;
grant execute on function public.admin_overview(boolean) to service_role;
grant execute on function public.admin_reporters(int, boolean) to service_role;
