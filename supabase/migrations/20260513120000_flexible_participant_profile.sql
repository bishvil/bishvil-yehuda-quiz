ALTER TABLE public.session_participants
  ADD COLUMN IF NOT EXISTS identity_provider text NOT NULL DEFAULT 'phone',
  ADD COLUMN IF NOT EXISTS identity_key text,
  ADD COLUMN IF NOT EXISTS profile_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.session_participants
SET
  identity_provider = COALESCE(NULLIF(identity_provider, ''), 'phone'),
  identity_key = COALESCE(NULLIF(identity_key, ''), phone),
  profile_fields = CASE
    WHEN profile_fields = '{}'::jsonb THEN jsonb_strip_nulls(
      jsonb_build_object(
        'firstName', first_name,
        'lastName', last_name,
        'phone', phone,
        'unit', unit,
        'team', team
      )
    )
    ELSE profile_fields
  END
WHERE identity_key IS NULL OR identity_key = '' OR profile_fields = '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS session_participants_session_identity_idx
  ON public.session_participants (session_id, identity_provider, identity_key);

CREATE INDEX IF NOT EXISTS session_participants_profile_fields_gin_idx
  ON public.session_participants USING gin (profile_fields);
