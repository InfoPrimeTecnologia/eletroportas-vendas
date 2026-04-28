import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppRole, AppModule, UserPermission } from '@/types/roles';

export function useUserRole() {
  const { user } = useAuth();

  const { data: userRole, isLoading: roleLoading } = useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const roleChecks = await Promise.all([
        supabase.rpc('has_role', { _user_id: user.id, _role: 'super_admin' }),
        supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' }),
        supabase.rpc('has_role', { _user_id: user.id, _role: 'user' }),
      ]);

      const roles: AppRole[] = [];
      if (roleChecks[0].data === true) roles.push('super_admin');
      if (roleChecks[1].data === true) roles.push('admin');
      if (roleChecks[2].data === true) roles.push('user');

      // Prioridade: super_admin > admin > user
      if (roles.includes('super_admin')) return 'super_admin' as AppRole;
      if (roles.includes('admin')) return 'admin' as AppRole;
      if (roles.includes('user')) return 'user' as AppRole;
      return null;
    },
    enabled: !!user?.id,
  });

  const { data: permissions, isLoading: permissionsLoading } = useQuery({
    queryKey: ['user-permissions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
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
    enabled: !!user?.id,
  });

  const isLoading = roleLoading || permissionsLoading;

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
