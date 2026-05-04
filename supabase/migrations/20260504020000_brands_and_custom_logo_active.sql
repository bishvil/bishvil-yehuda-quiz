-- Create brands table
create table public.brands (
  id            uuid        primary key default gen_random_uuid(),
  slug          text        unique,
  name          text        not null,
  tagline       text,
  logo_url      text        not null,
  primary_color text        not null default '#306030',
  accent_color  text        not null default '#A0C040',
  is_system     boolean     not null default false,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  archived_at   timestamptz
);

alter table public.brands enable row level security;

-- All authenticated users can read brands
create policy "authenticated users read brands"
  on public.brands
  for select
  to authenticated
  using ((select auth.uid()) is not null);

-- Only admins can insert brands
create policy "admins insert brands"
  on public.brands
  for insert
  to authenticated
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Only admins can update brands
create policy "admins update brands"
  on public.brands
  for update
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Only admins can delete brands
create policy "admins delete brands"
  on public.brands
  for delete
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Seed 4 system brands from PARTICIPANT_BRANDS
insert into public.brands (slug, name, tagline, logo_url, primary_color, accent_color, is_system) values
  ('yehuda', 'בשביל יהודה', 'מורשת בדרך ערך', '/logos/logo_yehuda.png',  '#306030', '#A0C040', true),
  ('haari',  'בשביל הארי',  'מורשת בדרך ערך', '/logos/logo_haari.png',   '#306030', '#A0C040', true),
  ('tzafon', 'בשביל הצפון', 'מורשת בדרך ערך', '/logos/logo_tzafon.png',  '#306030', '#A0C040', true),
  ('etzion', 'בשביל עציון', 'מורשת בדרך ערך', '/logos/logo_etzion.jpeg', '#306030', '#A0C040', true);

-- Drop the legacy hardcoded brand_id check constraint — brands are now data
-- (slugs for system brands, uuids for user-created brands).
alter table public.quizzes drop constraint if exists quizzes_brand_id_check;

-- Add custom_logo_active toggle to quizzes
alter table public.quizzes add column custom_logo_active boolean not null default false;

-- Preserve current behavior: rows that already have a custom logo are treated as active
update public.quizzes set custom_logo_active = true where custom_logo is not null;
