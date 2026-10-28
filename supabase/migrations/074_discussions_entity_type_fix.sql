-- Fix: "new row for relation "discussions" violates check constraint
-- "discussions_entity_type_check"" when starting a discussion on a Lead or Pitch.
--
-- The original table only allowed client/project/phase/set/requirement.
-- Migration 034 meant to drop that rule (leads and pitches have discussions
-- now), but production still has it. Replace it with the full list the app
-- uses (EntityType in src/types/database.ts). NULL stays allowed for general
-- discussions not tied to a record.

ALTER TABLE public.discussions DROP CONSTRAINT IF EXISTS discussions_entity_type_check;

ALTER TABLE public.discussions
  ADD CONSTRAINT discussions_entity_type_check
  CHECK (
    entity_type IS NULL
    OR entity_type IN ('client', 'project', 'phase', 'set', 'pitch', 'requirement', 'lead')
  );

-- Same list for topic_type, in case 034 never ran there either.
ALTER TABLE public.discussions ADD COLUMN IF NOT EXISTS topic_type TEXT;
ALTER TABLE public.discussions DROP CONSTRAINT IF EXISTS discussions_topic_type_check;
ALTER TABLE public.discussions
  ADD CONSTRAINT discussions_topic_type_check
  CHECK (
    topic_type IS NULL
    OR topic_type IN ('client', 'project', 'phase', 'set', 'pitch', 'requirement', 'lead')
  );

NOTIFY pgrst, 'reload schema';
