-- Every report from the app carries a random id made on the phone. If a report is sent twice (for example
-- the reply was lost on a bad network and the phone retries), the second copy is recognised and ignored.
alter table reports add column if not exists client_id uuid;
create unique index if not exists reports_client_id_key on reports (client_id) where client_id is not null;
