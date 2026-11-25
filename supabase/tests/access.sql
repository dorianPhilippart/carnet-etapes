-- À lancer en tant que postgres, après schema.sql. Toutes les écritures sont annulées.
begin;

select set_config('escale.test_alice', gen_random_uuid()::text, true),
       set_config('escale.test_bob', gen_random_uuid()::text, true),
       set_config('escale.test_trip', gen_random_uuid()::text, true),
       set_config('escale.test_revision', gen_random_uuid()::text, true);
insert into auth.users (id)
values (current_setting('escale.test_alice')::uuid), (current_setting('escale.test_bob')::uuid);

do $$
begin
  if has_any_column_privilege('anon', 'public.trips', 'SELECT,INSERT,UPDATE')
    or has_table_privilege('anon', 'public.trips', 'DELETE,TRUNCATE') then
    raise exception 'Le rôle anonyme dispose de droits inattendus';
  end if;
  if has_column_privilege('authenticated', 'public.trips', 'user_id', 'UPDATE')
    or has_table_privilege('authenticated', 'public.trips', 'TRUNCATE') then
    raise exception 'Les privilèges de modification dépassent ceux requis';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('escale.test_alice'), true);
insert into public.trips (id, payload, revision) values (
  current_setting('escale.test_trip')::uuid,
  jsonb_build_object('id', current_setting('escale.test_trip'), 'title', 'Kyoto',
    'destination', 'Japon', 'startDate', '2026-05-11', 'endDate', '2026-05-12',
    'stops', '[]'::jsonb),
  current_setting('escale.test_revision')::uuid
);

do $$
begin
  update public.trips set revision = gen_random_uuid()
   where id = current_setting('escale.test_trip')::uuid
     and revision = current_setting('escale.test_revision')::uuid;
  if not found then raise exception 'La modification du propriétaire a échoué'; end if;

  update public.trips set revision = gen_random_uuid()
   where id = current_setting('escale.test_trip')::uuid
     and revision = current_setting('escale.test_revision')::uuid;
  if found then raise exception 'La modification avec une révision obsolète a abouti'; end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('escale.test_bob'), true);
do $$
begin
  perform 1 from public.trips where id = current_setting('escale.test_trip')::uuid;
  if found then raise exception 'Un deuxième compte voit le voyage'; end if;
  update public.trips set revision = gen_random_uuid() where id = current_setting('escale.test_trip')::uuid;
  if found then raise exception 'Un deuxième compte a modifié le voyage'; end if;
  delete from public.trips where id = current_setting('escale.test_trip')::uuid;
  if found then raise exception 'Un deuxième compte a supprimé le voyage'; end if;
  -- Une insertion avec le propriétaire d'un autre compte doit être refusée.
  declare
    foreign_trip uuid := gen_random_uuid();
  begin
    insert into public.trips (user_id, id, payload, revision) values (
      current_setting('escale.test_alice')::uuid, foreign_trip,
      jsonb_build_object('id', foreign_trip, 'title', 'Lyon', 'destination', 'France',
        'startDate', '2026-06-08', 'endDate', '2026-06-09', 'stops', '[]'::jsonb),
      gen_random_uuid());
    raise exception 'Une insertion au nom d’un autre compte a abouti';
  exception when insufficient_privilege then
    null;
  end;
end $$;

select set_config('request.jwt.claim.sub', current_setting('escale.test_alice'), true);
do $$
begin
  delete from public.trips where id = current_setting('escale.test_trip')::uuid;
  if not found then raise exception 'La suppression par le propriétaire a échoué'; end if;
end $$;
rollback;
