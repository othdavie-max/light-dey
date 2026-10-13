-- Approximate centre of each area (about 1-2 km accuracy), used only to SUGGEST nearby areas to
-- someone who chooses "Use my location". A person's own position is never stored.
alter table areas add column if not exists lat numeric(8,5);
alter table areas add column if not exists lng numeric(8,5);
