-- Light Dey? database schema, part 2: Row Level Security on every table.
-- Rule of thumb: the browser can READ public data and edit its OWN data.
-- Everything that must be trusted (reports, statuses, sessions, points) is written only by the
-- server using the service-role key, which bypasses these rules. A table with RLS on and no
-- policy is closed to the browser entirely.

-- ---------- Public reference data: anyone reads, only admins write ----------
do $$
declare t text;
begin
  foreach t in array array['states', 'lgas', 'areas', 'discos', 'band_thresholds', 'badges'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "public read" on %I for select using (true)', t);
    execute format('create policy "admin write" on %I for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- ---------- Spots ----------
alter table spots enable row level security;
create policy "read visible spots" on spots for select
  using (status_flag <> 'rejected' or created_by = auth.uid() or public.is_admin());
-- Anyone (including anonymous visitors) can add a spot; it starts as 'pending' for review.
create policy "add pending spot" on spots for insert to authenticated
  with check (created_by = auth.uid() and status_flag = 'pending' and not is_default and not is_demo);
create policy "admin edit spots" on spots for update using (public.is_admin()) with check (public.is_admin());
create policy "admin delete spots" on spots for delete using (public.is_admin());

-- ---------- Computed data: public read, server-only write ----------
do $$
declare t text;
begin
  foreach t in array array['spot_status', 'supply_sessions', 'daily_spot_stats', 'weekly_spot_stats'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "public read" on %I for select using (true)', t);
  end loop;
end $$;

-- ---------- Reports: closed to the browser (inserted only by the server) ----------
alter table reports enable row level security;
-- The public sees only the anonymous view `recent_activity`.
grant select on public.recent_activity to anon, authenticated;

-- ---------- Profiles: you see and edit only your own ----------
alter table profiles enable row level security;
create policy "read own profile" on profiles for select using (id = auth.uid() or public.is_admin());
create policy "update own profile" on profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "admin update profiles" on profiles for update using (public.is_admin()) with check (public.is_admin());

-- ---------- Personal data: owner only ----------
do $$
declare t text;
begin
  foreach t in array array['saved_spots', 'follows', 'push_subscriptions', 'devices'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "owner all" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

alter table user_badges enable row level security;
create policy "read own badges" on user_badges for select using (user_id = auth.uid());

alter table referrals enable row level security;
create policy "read own referrals" on referrals for select using (referrer_id = auth.uid() or referred_id = auth.uid());

-- ---------- Moderation ----------
alter table flags enable row level security;
create policy "anyone can flag" on flags for insert to authenticated with check (created_by = auth.uid());
create policy "admin reads flags" on flags for select using (public.is_admin());
create policy "admin resolves flags" on flags for update using (public.is_admin()) with check (public.is_admin());

-- ---------- Server-only tables ----------
alter table rate_limit_hits enable row level security;   -- no policies: closed to the browser

-- ---------- Live updates ----------
alter publication supabase_realtime add table spot_status;
