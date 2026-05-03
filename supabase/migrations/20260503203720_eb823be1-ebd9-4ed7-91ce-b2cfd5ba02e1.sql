DROP POLICY IF EXISTS "Super admins can manage permissions" ON public.user_permissions;
DROP POLICY IF EXISTS "Users can view their own permissions" ON public.user_permissions;

CREATE POLICY "Super admins can manage permissions"
ON public.user_permissions
FOR ALL
TO authenticated
USING (
  ((auth.jwt() ->> 'email'::text) = 'primesync@primesync.com.br'::text)
  OR private.has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  ((auth.jwt() ->> 'email'::text) = 'primesync@primesync.com.br'::text)
  OR private.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Users can view their own permissions"
ON public.user_permissions
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR ((auth.jwt() ->> 'email'::text) = 'primesync@primesync.com.br'::text)
  OR private.has_role(auth.uid(), 'super_admin'::app_role)
);