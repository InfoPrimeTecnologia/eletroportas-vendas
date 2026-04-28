CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id UUID, _role public.app_role)
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

REVOKE ALL ON FUNCTION private.has_role(UUID, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_role(UUID, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION private.has_role(UUID, public.app_role) FROM authenticated;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM authenticated;

DROP POLICY IF EXISTS "Super admins can manage roles" ON public.user_roles;
CREATE POLICY "Super admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can view Leo conversations" ON public.leo_conversations;
CREATE POLICY "Admins can view Leo conversations"
ON public.leo_conversations
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Super admins can manage Leo conversations" ON public.leo_conversations;
CREATE POLICY "Super admins can manage Leo conversations"
ON public.leo_conversations
FOR ALL
TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can view Leo messages" ON public.leo_messages;
CREATE POLICY "Admins can view Leo messages"
ON public.leo_messages
FOR SELECT
TO authenticated
USING (
  private.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR private.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Super admins can manage Leo messages" ON public.leo_messages;
CREATE POLICY "Super admins can manage Leo messages"
ON public.leo_messages
FOR ALL
TO authenticated
USING (private.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'super_admin'::public.app_role));