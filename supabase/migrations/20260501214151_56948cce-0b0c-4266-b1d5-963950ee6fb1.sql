ALTER TABLE public.leo_conversations
  ADD COLUMN IF NOT EXISTS adicionais jsonb NOT NULL DEFAULT '{"portinhola": false, "alcapao": false}'::jsonb,
  ADD COLUMN IF NOT EXISTS adicionais_perguntado boolean NOT NULL DEFAULT false;