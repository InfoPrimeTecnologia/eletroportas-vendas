
ALTER TABLE public.leo_conversations
  ADD COLUMN IF NOT EXISTS pintura_perguntado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quer_pintura boolean,
  ADD COLUMN IF NOT EXISTS tipo_pintura text;
