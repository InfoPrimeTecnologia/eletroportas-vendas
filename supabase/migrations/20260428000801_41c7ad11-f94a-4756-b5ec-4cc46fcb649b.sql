DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'user');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Super admins can manage roles" ON public.user_roles;
CREATE POLICY "Super admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.leo_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone TEXT NOT NULL,
  tipo_cliente TEXT NOT NULL DEFAULT 'indefinido' CHECK (tipo_cliente IN ('porta_instalada', 'revenda', 'indefinido')),
  nome_cliente TEXT,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'encerrada')),
  ultima_mensagem_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (telefone, tipo_cliente)
);

CREATE INDEX IF NOT EXISTS idx_leo_conversations_telefone ON public.leo_conversations(telefone);
CREATE INDEX IF NOT EXISTS idx_leo_conversations_ultima ON public.leo_conversations(ultima_mensagem_at DESC);

CREATE TABLE IF NOT EXISTS public.leo_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.leo_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leo_messages_conversation ON public.leo_messages(conversation_id, created_at);

ALTER TABLE public.leo_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view Leo conversations" ON public.leo_conversations;
CREATE POLICY "Admins can view Leo conversations"
ON public.leo_conversations
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Super admins can manage Leo conversations" ON public.leo_conversations;
CREATE POLICY "Super admins can manage Leo conversations"
ON public.leo_conversations
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can view Leo messages" ON public.leo_messages;
CREATE POLICY "Admins can view Leo messages"
ON public.leo_messages
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Super admins can manage Leo messages" ON public.leo_messages;
CREATE POLICY "Super admins can manage Leo messages"
ON public.leo_messages
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leo_conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leo_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;