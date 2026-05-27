
ALTER TABLE public.leo_conversations
  ADD COLUMN IF NOT EXISTS cf_etapa text,
  ADD COLUMN IF NOT EXISTS cf_dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cf_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cf_classificacao text,
  ADD COLUMN IF NOT EXISTS cf_ultima_interacao timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS cf_recuperacao_estagio integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cf_prazo_resposta text,
  ADD COLUMN IF NOT EXISTS cf_visita_solicitada boolean,
  ADD COLUMN IF NOT EXISTS cf_pagamento_pref text;

CREATE INDEX IF NOT EXISTS idx_leo_conv_cf_etapa ON public.leo_conversations(cf_etapa);
CREATE INDEX IF NOT EXISTS idx_leo_conv_cf_recup ON public.leo_conversations(cf_ultima_interacao, cf_recuperacao_estagio);
