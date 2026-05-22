ALTER TABLE public.leo_conversations
  ADD COLUMN IF NOT EXISTS etapa_fluxo text NOT NULL DEFAULT 'entrada',
  ADD COLUMN IF NOT EXISTS carrinho jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pre_cadastro boolean NOT NULL DEFAULT false;