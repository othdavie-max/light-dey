-- A record of when someone agreed to the Terms and Privacy Policy, and which version of the text they agreed to.
alter table profiles add column if not exists consented_at timestamptz;
alter table profiles add column if not exists consent_version text;
