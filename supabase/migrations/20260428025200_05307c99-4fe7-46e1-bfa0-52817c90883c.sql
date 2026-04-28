
-- Permitir acesso ao owner primesync via email do JWT como fallback
-- (caso auth.uid() falhe por incompatibilidade de signing keys)

-- leo_api_keys
DROP POLICY IF EXISTS "Owner email can manage Leo API keys" ON public.leo_api_keys;
CREATE POLICY "Owner email can manage Leo API keys"
ON public.leo_api_keys FOR ALL TO authenticated
USING ((auth.jwt() ->> 'email') = 'primesync@primesync.com.br')
WITH CHECK ((auth.jwt() ->> 'email') = 'primesync@primesync.com.br');

-- leo_conversations
DROP POLICY IF EXISTS "Owner email can manage Leo conversations" ON public.leo_conversations;
CREATE POLICY "Owner email can manage Leo conversations"
ON public.leo_conversations FOR ALL TO authenticated
USING ((auth.jwt() ->> 'email') = 'primesync@primesync.com.br')
WITH CHECK ((auth.jwt() ->> 'email') = 'primesync@primesync.com.br');

-- leo_messages
DROP POLICY IF EXISTS "Owner email can manage Leo messages" ON public.leo_messages;
CREATE POLICY "Owner email can manage Leo messages"
ON public.leo_messages FOR ALL TO authenticated
USING ((auth.jwt() ->> 'email') = 'primesync@primesync.com.br')
WITH CHECK ((auth.jwt() ->> 'email') = 'primesync@primesync.com.br');

-- user_roles: adicionar fallback por email para o owner conseguir ler seu próprio papel
DROP POLICY IF EXISTS "Owner email can view own roles" ON public.user_roles;
CREATE POLICY "Owner email can view own roles"
ON public.user_roles FOR SELECT TO authenticated
USING ((auth.jwt() ->> 'email') = 'primesync@primesync.com.br');
