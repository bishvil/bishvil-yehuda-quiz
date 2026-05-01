insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'brand-logos',
    'brand-logos',
    true,
    524288,
    array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
  ),
  (
    'question-images',
    'question-images',
    true,
    2097152,
    array['image/png', 'image/jpeg', 'image/webp']
  )
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'public reads admin upload buckets'
  ) then
    create policy "public reads admin upload buckets"
      on storage.objects
      for select
      using (bucket_id in ('brand-logos', 'question-images'));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'admins insert upload bucket objects'
  ) then
    create policy "admins insert upload bucket objects"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id in ('brand-logos', 'question-images')
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'admins update upload bucket objects'
  ) then
    create policy "admins update upload bucket objects"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id in ('brand-logos', 'question-images')
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      )
      with check (
        bucket_id in ('brand-logos', 'question-images')
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'admins delete upload bucket objects'
  ) then
    create policy "admins delete upload bucket objects"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id in ('brand-logos', 'question-images')
        and auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
      );
  end if;
end $$;
