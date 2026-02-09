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
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      if (error) {
        // If no role found, return null
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      
      return data?.role as AppRole | null;
    },
    enabled: !!user?.id,
  });

  const { data: permissions, isLoading: permissionsLoading } = useQuery({
    queryKey: ['user-permissions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('user_permissions')
        .select('*')
        .eq('user_id', user.id);
      
      if (error) throw error;
      return data as UserPermission[];
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
