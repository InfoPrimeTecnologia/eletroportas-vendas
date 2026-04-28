import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppRole, AppModule, UserPermission } from '@/types/roles';

export function useUserRole() {
  const { user, session, loading: authLoading } = useAuth();
  const isPrimeSyncOwner = user?.email?.toLowerCase() === 'primesync@primesync.com.br';

  const { data: userRole, isLoading: roleLoading } = useQuery({
    queryKey: ['user-role', user?.id, user?.email],
    queryFn: async () => {
      if (!user?.id || !session?.access_token) return null;
      if (isPrimeSyncOwner) return 'super_admin' as AppRole;

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (error) throw error;

      const roles = (data ?? []).map((r) => r.role as AppRole);

      // Prioridade: super_admin > admin > user
      if (roles.includes('super_admin')) return 'super_admin' as AppRole;
      if (roles.includes('admin')) return 'admin' as AppRole;
      if (roles.includes('user')) return 'user' as AppRole;
      return null;
    },
    enabled: !authLoading && !!user?.id && !!session?.access_token,
    retry: 1,
    retryDelay: 700,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const { data: permissions, isLoading: permissionsLoading } = useQuery({
    queryKey: ['user-permissions', user?.id],
    queryFn: async () => {
      if (!user?.id || userRole !== 'user') return [];
      
      const { data, error } = await (supabase as any)
        .from('user_permissions')
        .select('*')
        .eq('user_id', user.id);
      
      // Tabela pode não existir no backend novo - retorna lista vazia em vez de quebrar
      if (error) {
        console.warn('user_permissions indisponível:', error.message);
        return [] as UserPermission[];
      }
      return (data || []) as unknown as UserPermission[];
    },
    enabled: !authLoading && !!user?.id && userRole === 'user',
  });

  const isLoading = authLoading || roleLoading || (userRole === 'user' && permissionsLoading);

  const isSuperAdmin = userRole === 'super_admin';
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  const isUser = userRole === 'user';

  const hasModuleAccess = (module: AppModule): boolean => {
    // Super admin and admin have access to everything
    if (isAdmin) return true;
    
    // Check specific permissions for regular users
    return permissions?.some(
      p => p.module === module && p.can_view
    ) ?? false;
  };

  const canEditModule = (module: AppModule): boolean => {
    if (isSuperAdmin) return true;
    if (isAdmin) return module !== 'usuarios'; // Admins can't edit user permissions
    
    return permissions?.some(
      p => p.module === module && p.can_edit
    ) ?? false;
  };

  const canDeleteInModule = (module: AppModule): boolean => {
    if (isSuperAdmin) return true;
    if (isAdmin) return module !== 'usuarios';
    
    return permissions?.some(
      p => p.module === module && p.can_delete
    ) ?? false;
  };

  return {
    role: userRole,
    permissions,
    isLoading,
    isSuperAdmin,
    isAdmin,
    isUser,
    hasModuleAccess,
    canEditModule,
    canDeleteInModule,
  };
}
