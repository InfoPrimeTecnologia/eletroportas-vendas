ALTER TABLE public.leo_conversations
ADD COLUMN IF NOT EXISTS entrega_perguntado boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS quer_entrega boolean;