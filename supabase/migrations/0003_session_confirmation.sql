-- Supply sessions remember when someone last agreed with them. Time after
-- (last_confirmed_at + 12h) is counted as "unknown" instead of being guessed.
alter table supply_sessions add column last_confirmed_at timestamptz;
update supply_sessions set last_confirmed_at = coalesce(ended_at, started_at) where last_confirmed_at is null;
alter table supply_sessions alter column last_confirmed_at set not null;
alter table supply_sessions alter column last_confirmed_at set default now();
