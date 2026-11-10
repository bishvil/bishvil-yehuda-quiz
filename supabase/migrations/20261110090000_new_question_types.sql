-- Separate transaction: new enum values must commit before use.
alter type public.question_type add value if not exists 'open';
alter type public.question_type add value if not exists 'content';
