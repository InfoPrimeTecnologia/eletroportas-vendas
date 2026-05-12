ALTER TABLE public.leo_conversations
  ADD COLUMN IF NOT EXISTS subtipo_revenda text,
  ADD COLUMN IF NOT EXISTS pecas_avulsas jsonb NOT NULL DEFAULT '[]'::jsonb;