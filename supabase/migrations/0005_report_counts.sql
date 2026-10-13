-- How many reports and how many different people reported at a spot since a given time.
-- Returns only counts (never who), so the area page can show a "how reliable is this?" indicator
-- even though the reports table itself is closed to the public.
create or replace function public.spot_report_counts(p_spot_id uuid, p_since timestamptz)
returns table (report_count int, reporter_count int)
language sql stable security definer set search_path = public as $$
  select count(*)::int, count(distinct coalesce(user_id::text, device_id::text))::int
  from reports
  where spot_id = p_spot_id and created_at >= p_since
$$;
grant execute on function public.spot_report_counts(uuid, timestamptz) to anon, authenticated;
