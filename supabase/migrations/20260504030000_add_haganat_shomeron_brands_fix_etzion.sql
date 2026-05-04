-- Fix the etzion logo extension (jpeg → png) — the canonical asset under
-- public/logos/ is now logo_etzion.png; the .jpeg was removed.
update public.brands
   set logo_url = '/logos/logo_etzion.png'
 where slug = 'etzion'
   and logo_url = '/logos/logo_etzion.jpeg';

-- Add the two missing system brands. on conflict keeps the migration
-- idempotent if these slugs were inserted manually in any environment.
insert into public.brands
  (slug, name, tagline, logo_url, primary_color, accent_color, is_system)
values
  ('haganat',  'בשביל הגנת היישוב', 'מורשת בדרך ערך', '/logos/logo_haganat.png',  '#306030', '#A0C040', true),
  ('shomeron', 'בשביל השומרון',     'מורשת בדרך ערך', '/logos/logo_shomeron.png', '#306030', '#A0C040', true)
on conflict (slug) do nothing;
