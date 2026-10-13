-- Leaderboards. Both functions return only public, combined information:
--   * top reporters this week: the automatic nickname and counts, never an id, email or location
--   * areas with the most light over the last 7 days: combined from everyone's reports
-- The reports table itself stays closed to the public (these functions run with extra rights, on purpose).

create or replace function public.leaderboard_reporters(p_limit int default 20)
returns table (nickname text, week_reports int, streak int, points int)
language sql stable security definer set search_path = public as $$
  select p.nickname, count(*)::int as week_reports, p.streak_current, p.points
  from reports r
  join profiles p on p.id = r.user_id
  where r.created_at >= (date_trunc('week', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos')
    and r.is_demo = false
    and p.is_banned = false
  group by p.id, p.nickname, p.streak_current, p.points
  order by week_reports desc, p.points desc, p.nickname
  limit least(greatest(p_limit, 1), 50)
$$;

-- Average hours of light per day over the last 7 days, for areas with enough evidence
-- (at least p_min_reporters different people and p_min_known_hours of known supply time).
create or replace function public.leaderboard_areas(p_limit int default 20, p_min_reporters int default 3, p_min_known_hours int default 6)
returns table (area_id int, area_name text, city text, light_hours_per_day numeric, reporters int)
language sql stable security definer set search_path = public as $$
  with seg as (
    select sp.area_id, ss.status,
      greatest(0, extract(epoch from (
        least(coalesce(ss.ended_at, least(now(), ss.last_confirmed_at + interval '12 hours')), now())
        - greatest(ss.started_at, now() - interval '7 days')
      ))) / 60.0 as mins
    from supply_sessions ss
    join spots sp on sp.id = ss.spot_id
    where sp.is_demo = false and sp.status_flag <> 'rejected'
      and ss.is_demo = false
      and ss.started_at < now()
      and coalesce(ss.ended_at, now()) > now() - interval '7 days'
  ),
  per_area as (
    select area_id,
      sum(mins) filter (where status in ('on', 'weak')) as light_min,
      sum(mins) as known_min
    from seg group by area_id
  ),
  who as (
    select sp.area_id, count(distinct coalesce(r.user_id::text, r.device_id::text))::int as reporters
    from reports r join spots sp on sp.id = r.spot_id
    where r.created_at >= now() - interval '7 days' and r.is_demo = false and sp.is_demo = false
    group by sp.area_id
  )
  select a.id, a.name, a.city,
    round((coalesce(pa.light_min, 0) / nullif(pa.known_min, 0)) * 24, 1) as light_hours_per_day,
    w.reporters
  from per_area pa
  join who w on w.area_id = pa.area_id
  join areas a on a.id = pa.area_id
  where w.reporters >= p_min_reporters and pa.known_min >= p_min_known_hours * 60
  order by light_hours_per_day desc nulls last, w.reporters desc
  limit least(greatest(p_limit, 1), 50)
$$;

grant execute on function public.leaderboard_reporters(int) to anon, authenticated;
grant execute on function public.leaderboard_areas(int, int, int) to anon, authenticated;
