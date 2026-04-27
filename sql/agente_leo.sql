-- =====================================================
-- AGENTE LEO - Schema (executar manualmente no Supabase)
-- Cole no SQL Editor do Supabase e execute
-- =====================================================

-- 1) Conversas (uma por telefone + tipo de cliente)
CREATE TABLE IF NOT EXISTS public.leo_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone TEXT NOT NULL,
  tipo_cliente TEXT NOT NULL CHECK (tipo_cliente IN ('porta_instalada', 'revenda', 'indefinido')),
  nome_cliente TEXT,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'encerrada')),
  ultima_mensagem_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (telefone, tipo_cliente)
);
CREATE INDEX IF NOT EXISTS idx_leo_conversations_telefone ON public.leo_conversations(telefone);
CREATE INDEX IF NOT EXISTS idx_leo_conversations_ultima ON public.leo_conversations(ultima_mensagem_at DESC);

-- 2) Mensagens
CREATE TABLE IF NOT EXISTS public.leo_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.leo_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leo_messages_conversation ON public.leo_messages(conversation_id, created_at);

-- 3) Chaves de API (apenas super_admin)
CREATE TABLE IF NOT EXISTS public.leo_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name TEXT NOT NULL UNIQUE,
  key_value TEXT NOT NULL DEFAULT '',
  description TEXT,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.leo_api_keys (key_name, description) VALUES
  ('OPENAI_API_KEY', 'Chave da OpenAI (GPT-4o mini) - cérebro do agente Leo'),
  ('ZAPI_TOKEN', 'Token da Z-API para envio WhatsApp'),
  ('ZAPI_INSTANCE_ID', 'Instance ID da Z-API'),
  ('ZAPI_CLIENT_TOKEN', 'Client-Token da Z-API (security)'),
  ('DOCRYA_API_KEY', 'Chave da API Docrya para PDFs de orçamento'),
  ('WEBHOOK_SECRET', 'Secret para validar webhooks recebidos')
ON CONFLICT (key_name) DO NOTHING;

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE public.leo_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins visualizam conversas Leo" ON public.leo_conversations;
CREATE POLICY "Admins visualizam conversas Leo"
ON public.leo_conversations FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Super admin gerencia conversas Leo" ON public.leo_conversations;
CREATE POLICY "Super admin gerencia conversas Leo"
ON public.leo_conversations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Admins visualizam mensagens Leo" ON public.leo_messages;
CREATE POLICY "Admins visualizam mensagens Leo"
ON public.leo_messages FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Super admin gerencia mensagens Leo" ON public.leo_messages;
CREATE POLICY "Super admin gerencia mensagens Leo"
ON public.leo_messages FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Apenas super admin acessa chaves Leo" ON public.leo_api_keys;
CREATE POLICY "Apenas super admin acessa chaves Leo"
ON public.leo_api_keys FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.leo_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leo_messages;
