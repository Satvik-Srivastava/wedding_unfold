create table if not exists public.wedding_settings (
  id text primary key check (id = 'main'),
  config jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.wedding_settings enable row level security;

drop policy if exists "Wedding details are visible to guests" on public.wedding_settings;
create policy "Wedding details are visible to guests"
  on public.wedding_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Signed-in admins can create wedding details" on public.wedding_settings;
create policy "Signed-in admins can create wedding details"
  on public.wedding_settings
  for insert
  to authenticated
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'wedding_admin');

drop policy if exists "Signed-in admins can update wedding details" on public.wedding_settings;
create policy "Signed-in admins can update wedding details"
  on public.wedding_settings
  for update
  to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'wedding_admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'wedding_admin');

grant select on public.wedding_settings to anon, authenticated;
grant insert, update on public.wedding_settings to authenticated;
