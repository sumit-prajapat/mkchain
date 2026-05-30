-- MKChain Migration 004: Backfill organizations for existing users without one

do $$
declare
  r record;
  new_org_id uuid;
  org_slug text;
begin
  for r in
    select p.id, p.email, p.full_name
    from public.profiles p
    where p.default_org_id is null
  loop
    org_slug := 'org-' || substr(replace(r.id::text, '-', ''), 1, 12);

    insert into public.organizations (name, slug, plan)
    values (coalesce(r.full_name, 'My Organization'), org_slug, 'free')
    returning id into new_org_id;

    insert into public.memberships (org_id, user_id, role)
    values (new_org_id, r.id, 'owner')
    on conflict do nothing;

    update public.profiles set default_org_id = new_org_id where id = r.id;
  end loop;
end $$;
