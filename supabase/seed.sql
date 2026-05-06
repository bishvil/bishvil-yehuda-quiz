create extension if not exists pgcrypto;

insert into public.brands (slug, name, tagline, logo_url, is_system)
values ('main', 'בשביל', 'מסלולים בארץ ישראל', '/logos/logo_main.png', true)
on conflict (slug) do update
set
  is_system = true,
  archived_at = null;

with local_users(id, email, user_role) as (
  values
    (
      '11111111-1111-4111-8111-111111111111'::uuid,
      'host@bishvil.test',
      'host'
    ),
    (
      '22222222-2222-4222-8222-222222222222'::uuid,
      'admin@bishvil.test',
      'admin'
    )
)
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  local_users.id,
  'authenticated',
  'authenticated',
  local_users.email,
  crypt('Password123!', gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', local_users.user_role),
  '{}'::jsonb,
  now(),
  now()
from local_users
on conflict (id) do update
set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  confirmation_token = excluded.confirmation_token,
  recovery_token = excluded.recovery_token,
  email_change_token_new = excluded.email_change_token_new,
  email_change = excluded.email_change,
  email_change_token_current = excluded.email_change_token_current,
  reauthentication_token = excluded.reauthentication_token,
  raw_app_meta_data = excluded.raw_app_meta_data,
  updated_at = now();

with local_users(id, email) as (
  values
    ('11111111-1111-4111-8111-111111111111'::uuid, 'host@bishvil.test'),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'admin@bishvil.test')
)
insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  local_users.id::text,
  local_users.id,
  jsonb_build_object('sub', local_users.id::text, 'email', local_users.email),
  'email',
  now(),
  now(),
  now()
from local_users
on conflict (provider_id, provider) do update
set
  identity_data = excluded.identity_data,
  updated_at = now();

insert into public.quizzes (
  id,
  owner_id,
  brand_id,
  title,
  default_game_mode
)
values (
  '33333333-3333-4333-8333-333333333333'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  'yehuda',
  'Local Auth Smoke Quiz',
  'sync'
)
on conflict (id) do update
set
  owner_id = excluded.owner_id,
  brand_id = excluded.brand_id,
  title = excluded.title,
  default_game_mode = excluded.default_game_mode;

insert into public.sessions (
  id,
  quiz_id,
  host_id,
  pin,
  status,
  game_mode
)
values (
  '44444444-4444-4444-8444-444444444444'::uuid,
  '33333333-3333-4333-8333-333333333333'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  '123456',
  'scheduled',
  'sync'
)
on conflict (id) do update
set
  quiz_id = excluded.quiz_id,
  host_id = excluded.host_id,
  pin = excluded.pin,
  status = excluded.status,
  game_mode = excluded.game_mode;
