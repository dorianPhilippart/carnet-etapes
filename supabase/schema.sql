-- À exécuter une fois dans un projet Supabase dédié à Carnet d’étapes.
begin;

create table public.trips (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id uuid not null,
  payload jsonb not null,
  revision uuid not null,
  primary key (user_id, id),
  constraint trip_document check (
    jsonb_typeof(payload) = 'object'
    and payload ?& array['id', 'title', 'destination', 'startDate', 'endDate', 'stops']
    and payload ->> 'id' = id::text
    and jsonb_typeof(payload -> 'title') = 'string'
    and length(trim(payload ->> 'title')) > 0
    and jsonb_typeof(payload -> 'destination') = 'string'
    and jsonb_typeof(payload -> 'startDate') = 'string'
    and jsonb_typeof(payload -> 'endDate') = 'string'
    and (payload ->> 'startDate') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and (payload ->> 'endDate') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and (payload ->> 'startDate') <= (payload ->> 'endDate')
    and jsonb_typeof(payload -> 'stops') = 'array'
    and octet_length(payload::text) <= 1048576
  ),
  constraint trip_id_is_string check (jsonb_typeof(payload -> 'id') = 'string')
);

alter table public.trips enable row level security;

-- Les privilèges par défaut des projets Supabase varient selon leur date de création.
revoke all privileges on table public.trips from public, anon, authenticated;
grant select, delete on table public.trips to authenticated;
grant insert (user_id, id, revision, payload), update (revision, payload)
  on table public.trips to authenticated;

create policy read_own_trips on public.trips for select to authenticated
  using (user_id = (select auth.uid()));
create policy add_own_trips on public.trips for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy edit_own_trips on public.trips for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy remove_own_trips on public.trips for delete to authenticated
  using (user_id = (select auth.uid()));

commit;
