CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);

CREATE TABLE IF NOT EXISTS public."Clientes" (
  id bigserial UNIQUE,
  "CLI_CNPJ" text PRIMARY KEY,
  "CLI_NOME" text,
  "CLI_ENDERECO" text,
  "CLI_BAIRRO" text,
  "CLI_CEP" text,
  "CLI_FONE" text,
  "CLI_EMAIL" text
);

CREATE TABLE IF NOT EXISTS public.estoque (
  id bigserial PRIMARY KEY,
  produto_nome text NOT NULL,
  tipo_laminas text NOT NULL,
  descricao text,
  codigo_sku text NOT NULL UNIQUE,
  quantidade integer NOT NULL DEFAULT 0,
  quantidade_minima integer NOT NULL DEFAULT 5,
  preco_custo numeric(12,2) NOT NULL DEFAULT 0,
  preco_venda numeric(12,2) NOT NULL DEFAULT 0,
  unidade_medida text DEFAULT 'unidade',
  fornecedor text,
  data_cadastro timestamptz NOT NULL DEFAULT now(),
  data_atualizacao timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.funil_etapas (
  key text PRIMARY KEY,
  label text NOT NULL,
  color text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.funil_leads (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome text NOT NULL,
  empresa text,
  telefone text,
  email text,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  etapa_key text NOT NULL DEFAULT 'contato_inicial',
  origem text NOT NULL DEFAULT 'manual',
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  observacoes text,
  anexo_pdf text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS public.orcamentos_numero_seq;
CREATE SEQUENCE IF NOT EXISTS public.pedidos_venda_numero_seq;

CREATE TABLE IF NOT EXISTS public.orcamentos (
  id bigserial PRIMARY KEY,
  numero text UNIQUE,
  cliente_telefone text,
  cliente_nome text NOT NULL,
  data_criacao timestamptz NOT NULL DEFAULT now(),
  valor_total numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  origem text NOT NULL DEFAULT 'manual',
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pedidos_venda (
  id bigserial PRIMARY KEY,
  numero text UNIQUE,
  cliente_telefone text,
  cliente_nome text NOT NULL,
  data_criacao timestamptz NOT NULL DEFAULT now(),
  valor_total numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processando',
  origem text NOT NULL DEFAULT 'manual',
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  observacoes text,
  orcamento_id bigint REFERENCES public.orcamentos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leo_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name text NOT NULL UNIQUE,
  key_value text NOT NULL DEFAULT '',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
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

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
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

CREATE OR REPLACE FUNCTION private.has_module_permission(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.user_id = _user_id
      AND up.module = _module
      AND CASE _action
        WHEN 'view' THEN up.can_view
        WHEN 'edit' THEN up.can_edit
        WHEN 'delete' THEN up.can_delete
        ELSE false
      END
  )
$$;

CREATE OR REPLACE FUNCTION private.is_admin_or_super(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.has_role(_user_id, 'super_admin'::app_role)
      OR private.has_role(_user_id, 'admin'::app_role)
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_roles_user_id_unique'
      AND conrelid = 'public.user_roles'::regclass
  ) THEN
    ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clientes_nome ON public."Clientes" ("CLI_NOME");
CREATE INDEX IF NOT EXISTS idx_clientes_fone ON public."Clientes" ("CLI_FONE");
CREATE INDEX IF NOT EXISTS idx_clientes_email ON public."Clientes" ("CLI_EMAIL");
CREATE INDEX IF NOT EXISTS idx_estoque_produto_nome ON public.estoque (produto_nome);
CREATE INDEX IF NOT EXISTS idx_estoque_codigo_sku ON public.estoque (codigo_sku);
CREATE INDEX IF NOT EXISTS idx_funil_leads_etapa ON public.funil_leads (etapa_key);
CREATE INDEX IF NOT EXISTS idx_funil_leads_created_at ON public.funil_leads (created_at);
CREATE INDEX IF NOT EXISTS idx_funil_leads_telefone ON public.funil_leads (telefone);
CREATE INDEX IF NOT EXISTS idx_orcamentos_data_criacao ON public.orcamentos (data_criacao DESC);
CREATE INDEX IF NOT EXISTS idx_orcamentos_status ON public.orcamentos (status);
CREATE INDEX IF NOT EXISTS idx_orcamentos_cliente_telefone ON public.orcamentos (cliente_telefone);
CREATE INDEX IF NOT EXISTS idx_pedidos_venda_data_criacao ON public.pedidos_venda (data_criacao DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_venda_status ON public.pedidos_venda (status);
CREATE INDEX IF NOT EXISTS idx_pedidos_venda_cliente_telefone ON public.pedidos_venda (cliente_telefone);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Clientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funil_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funil_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_venda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leo_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own permissions" ON public.user_permissions;
CREATE POLICY "Users can view their own permissions"
ON public.user_permissions FOR SELECT TO authenticated
USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Super admins can manage permissions" ON public.user_permissions;
CREATE POLICY "Super admins can manage permissions"
ON public.user_permissions FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Authenticated users can view clientes" ON public."Clientes";
CREATE POLICY "Authenticated users can view clientes"
ON public."Clientes" FOR SELECT TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'clientes', 'view'));
DROP POLICY IF EXISTS "Authorized users can create clientes" ON public."Clientes";
CREATE POLICY "Authorized users can create clientes"
ON public."Clientes" FOR INSERT TO authenticated
WITH CHECK (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'clientes', 'edit'));
DROP POLICY IF EXISTS "Authorized users can update clientes" ON public."Clientes";
CREATE POLICY "Authorized users can update clientes"
ON public."Clientes" FOR UPDATE TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'clientes', 'edit'))
WITH CHECK (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'clientes', 'edit'));
DROP POLICY IF EXISTS "Authorized users can delete clientes" ON public."Clientes";
CREATE POLICY "Authorized users can delete clientes"
ON public."Clientes" FOR DELETE TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'clientes', 'delete'));

DROP POLICY IF EXISTS "Authorized users can view estoque" ON public.estoque;
CREATE POLICY "Authorized users can view estoque"
ON public.estoque FOR SELECT TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'estoque', 'view'));
DROP POLICY IF EXISTS "Authorized users can create estoque" ON public.estoque;
CREATE POLICY "Authorized users can create estoque"
ON public.estoque FOR INSERT TO authenticated
WITH CHECK (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'estoque', 'edit'));
DROP POLICY IF EXISTS "Authorized users can update estoque" ON public.estoque;
CREATE POLICY "Authorized users can update estoque"
ON public.estoque FOR UPDATE TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'estoque', 'edit'))
WITH CHECK (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'estoque', 'edit'));
DROP POLICY IF EXISTS "Authorized users can delete estoque" ON public.estoque;
CREATE POLICY "Authorized users can delete estoque"
ON public.estoque FOR DELETE TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'estoque', 'delete'));

DROP POLICY IF EXISTS "Authorized users can view funil etapas" ON public.funil_etapas;
CREATE POLICY "Authorized users can view funil etapas"
ON public.funil_etapas FOR SELECT TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'funil', 'view'));
DROP POLICY IF EXISTS "Authorized users can create funil etapas" ON public.funil_etapas;
CREATE POLICY "Authorized users can create funil etapas"
ON public.funil_etapas FOR INSERT TO authenticated
WITH CHECK (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'funil', 'edit'));
DROP POLICY IF EXISTS "Authorized users can update funil etapas" ON public.funil_etapas;
CREATE POLICY "Authorized users can update funil etapas"
ON public.funil_etapas FOR UPDATE TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'funil', 'edit'))
WITH CHECK (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'funil', 'edit'));
DROP POLICY IF EXISTS "Authorized users can delete funil etapas" ON public.funil_etapas;
CREATE POLICY "Authorized users can delete funil etapas"
ON public.funil_etapas FOR DELETE TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'funil', 'delete'));

DROP POLICY IF EXISTS "Authorized users can view funil leads" ON public.funil_leads;
CREATE POLICY "Authorized users can view funil leads"
ON public.funil_leads FOR SELECT TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'funil', 'view'));
DROP POLICY IF EXISTS "Authorized users can create funil leads" ON public.funil_leads;
CREATE POLICY "Authorized users can create funil leads"
ON public.funil_leads FOR INSERT TO authenticated
WITH CHECK (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'funil', 'edit'));
DROP POLICY IF EXISTS "Authorized users can update funil leads" ON public.funil_leads;
CREATE POLICY "Authorized users can update funil leads"
ON public.funil_leads FOR UPDATE TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'funil', 'edit'))
WITH CHECK (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'funil', 'edit'));
DROP POLICY IF EXISTS "Authorized users can delete funil leads" ON public.funil_leads;
CREATE POLICY "Authorized users can delete funil leads"
ON public.funil_leads FOR DELETE TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'funil', 'delete'));

DROP POLICY IF EXISTS "Authorized users can view orcamentos" ON public.orcamentos;
CREATE POLICY "Authorized users can view orcamentos"
ON public.orcamentos FOR SELECT TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'orcamentos', 'view'));
DROP POLICY IF EXISTS "Authorized users can create orcamentos" ON public.orcamentos;
CREATE POLICY "Authorized users can create orcamentos"
ON public.orcamentos FOR INSERT TO authenticated
WITH CHECK (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'orcamentos', 'edit'));
DROP POLICY IF EXISTS "Authorized users can update orcamentos" ON public.orcamentos;
CREATE POLICY "Authorized users can update orcamentos"
ON public.orcamentos FOR UPDATE TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'orcamentos', 'edit'))
WITH CHECK (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'orcamentos', 'edit'));
DROP POLICY IF EXISTS "Authorized users can delete orcamentos" ON public.orcamentos;
CREATE POLICY "Authorized users can delete orcamentos"
ON public.orcamentos FOR DELETE TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'orcamentos', 'delete'));

DROP POLICY IF EXISTS "Authorized users can view pedidos" ON public.pedidos_venda;
CREATE POLICY "Authorized users can view pedidos"
ON public.pedidos_venda FOR SELECT TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'pedidos', 'view'));
DROP POLICY IF EXISTS "Authorized users can create pedidos" ON public.pedidos_venda;
CREATE POLICY "Authorized users can create pedidos"
ON public.pedidos_venda FOR INSERT TO authenticated
WITH CHECK (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'pedidos', 'edit'));
DROP POLICY IF EXISTS "Authorized users can update pedidos" ON public.pedidos_venda;
CREATE POLICY "Authorized users can update pedidos"
ON public.pedidos_venda FOR UPDATE TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'pedidos', 'edit'))
WITH CHECK (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'pedidos', 'edit'));
DROP POLICY IF EXISTS "Authorized users can delete pedidos" ON public.pedidos_venda;
CREATE POLICY "Authorized users can delete pedidos"
ON public.pedidos_venda FOR DELETE TO authenticated
USING (private.is_admin_or_super(auth.uid()) OR private.has_module_permission(auth.uid(), 'pedidos', 'delete'));

DROP POLICY IF EXISTS "Super admins can manage Leo API keys" ON public.leo_api_keys;
CREATE POLICY "Super admins can manage Leo API keys"
ON public.leo_api_keys FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'super_admin'::app_role));

INSERT INTO public.funil_etapas (key, label, color, ordem) VALUES
  ('contato_inicial', 'Contato Inicial', 'bg-[hsl(var(--chart-cold))]', 0),
  ('qualificacao', 'Qualificação', 'bg-[hsl(var(--chart-warm))]', 1),
  ('orcamento_enviado', 'Orçamento Enviado', 'bg-primary', 2),
  ('acompanhamento', 'Acompanhamento', 'bg-[hsl(var(--info))]', 3),
  ('fechado', 'Fechado', 'bg-[hsl(var(--success))]', 4),
  ('perdido', 'Perdido', 'bg-destructive', 5)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.leo_api_keys (key_name, description) VALUES
  ('PRIMESYNC_BASE_URL', 'URL base da API PrimeSync'),
  ('PRIMESYNC_TOKEN', 'Token da API PrimeSync'),
  ('DOCRYA_API_KEY', 'Chave da API Docrya'),
  ('WEBHOOK_SECRET', 'Segredo para webhooks recebidos')
ON CONFLICT (key_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_data_atualizacao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.data_atualizacao = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_orcamento_numero()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := 'ORC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.orcamentos_numero_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_pedido_numero()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := 'PED-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.pedidos_venda_numero_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_estoque_data_atualizacao ON public.estoque;
CREATE TRIGGER set_estoque_data_atualizacao
BEFORE UPDATE ON public.estoque
FOR EACH ROW
EXECUTE FUNCTION public.set_data_atualizacao();

DROP TRIGGER IF EXISTS set_funil_etapas_updated_at ON public.funil_etapas;
CREATE TRIGGER set_funil_etapas_updated_at
BEFORE UPDATE ON public.funil_etapas
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_funil_leads_updated_at ON public.funil_leads;
CREATE TRIGGER set_funil_leads_updated_at
BEFORE UPDATE ON public.funil_leads
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_orcamento_numero_trigger ON public.orcamentos;
CREATE TRIGGER set_orcamento_numero_trigger
BEFORE INSERT ON public.orcamentos
FOR EACH ROW
EXECUTE FUNCTION public.set_orcamento_numero();

DROP TRIGGER IF EXISTS set_orcamentos_updated_at ON public.orcamentos;
CREATE TRIGGER set_orcamentos_updated_at
BEFORE UPDATE ON public.orcamentos
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pedido_numero_trigger ON public.pedidos_venda;
CREATE TRIGGER set_pedido_numero_trigger
BEFORE INSERT ON public.pedidos_venda
FOR EACH ROW
EXECUTE FUNCTION public.set_pedido_numero();

DROP TRIGGER IF EXISTS set_pedidos_venda_updated_at ON public.pedidos_venda;
CREATE TRIGGER set_pedidos_venda_updated_at
BEFORE UPDATE ON public.pedidos_venda
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.funil_leads;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.funil_etapas;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;