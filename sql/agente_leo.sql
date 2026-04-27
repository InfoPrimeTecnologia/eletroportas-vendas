-- =====================================================
-- AGENTE LEO - Schema completo (rodar no SQL Editor do Supabase)
-- =====================================================

-- 1) Conversas
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

-- Limpa seeds antigos da Z-API (caso já tenha rodado a versão anterior)
DELETE FROM public.leo_api_keys
 WHERE key_name IN ('ZAPI_TOKEN','ZAPI_INSTANCE_ID','ZAPI_CLIENT_TOKEN');

-- Seeds das chaves (PrimeSync)
INSERT INTO public.leo_api_keys (key_name, description) VALUES
  ('OPENAI_API_KEY',     'Chave da OpenAI (GPT-4o mini) - cérebro do agente Leo'),
  ('PRIMESYNC_BASE_URL', 'URL base da API PrimeSync (ex: https://api.primesync.com.br/...)'),
  ('PRIMESYNC_TOKEN',    'Bearer token da API PrimeSync para envio de mensagens WhatsApp'),
  ('DOCRYA_API_KEY',     'Chave da API Docrya para PDFs de orçamento'),
  ('WEBHOOK_SECRET',     'Secret para validar webhooks recebidos da PrimeSync')
ON CONFLICT (key_name) DO NOTHING;

-- =====================================================
-- RLS  (cast explícito para app_role)
-- =====================================================
ALTER TABLE public.leo_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_api_keys      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins visualizam conversas Leo" ON public.leo_conversations;
CREATE POLICY "Admins visualizam conversas Leo"
ON public.leo_conversations FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Super admin gerencia conversas Leo" ON public.leo_conversations;
CREATE POLICY "Super admin gerencia conversas Leo"
ON public.leo_conversations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Admins visualizam mensagens Leo" ON public.leo_messages;
CREATE POLICY "Admins visualizam mensagens Leo"
ON public.leo_messages FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Super admin gerencia mensagens Leo" ON public.leo_messages;
CREATE POLICY "Super admin gerencia mensagens Leo"
ON public.leo_messages FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Apenas super admin acessa chaves Leo" ON public.leo_api_keys;
CREATE POLICY "Apenas super admin acessa chaves Leo"
ON public.leo_api_keys FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Realtime (ignora se já estiver na publicação)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leo_conversations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leo_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
