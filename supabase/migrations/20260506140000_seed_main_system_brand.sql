-- Seed the neutral "main" system brand used as the system-wide fallback.
-- Replaces `yehuda` as `SYSTEM_DEFAULT_BRAND_SLUG` (see src/lib/participant/brands.ts).
-- Idempotent: safe to re-run.

insert into public.brands (slug, name, tagline, logo_url, is_system)
values ('main', 'בשביל', 'מסלולים בארץ ישראל', '/logos/logo_main.png', true)
on conflict (slug) do update
set
  is_system = true,
  archived_at = null;
