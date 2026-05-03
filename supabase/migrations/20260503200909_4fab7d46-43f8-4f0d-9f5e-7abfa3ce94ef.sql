-- Garantir USAGE no schema private e EXECUTE nas funções usadas pelas RLS
GRANT USAGE ON SCHEMA private TO authenticated;

GRANT EXECUTE ON FUNCTION private.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin_or_super(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_module_permission(uuid, text, text) TO authenticated;

-- Também garantir na has_role do public por compatibilidade
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;