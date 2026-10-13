-- Growth features: a personal invite code for each person.
-- The code is private to its owner (profiles can only be read by their owner); the server looks it up when a friend joins.
alter table profiles add column if not exists referral_code text;
update profiles set referral_code = substr(md5(random()::text || id::text), 1, 8) where referral_code is null;
alter table profiles alter column referral_code set default substr(md5(random()::text || clock_timestamp()::text), 1, 8);
alter table profiles alter column referral_code set not null;
create unique index if not exists profiles_referral_code_key on profiles (referral_code);
