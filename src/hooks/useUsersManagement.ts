import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppRole, AppModule, UserWithRole, UserPermission } from '@/types/roles';
import { toast } from 'sonner';

export function useUsersManagement() {
  const queryClient = useQueryClient();

  // Fetch all users with their roles
  const { data: users, isLoading, error } = useQuery({
    queryKey: ['all-users'],
    queryFn: async () => {
      // Get all user roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');
      
      if (rolesError) throw rolesError;

      // Get all permissions
      const { data: permissions, error: permsError } = await supabase
        .from('user_permissions')
        .select('*');
      
      if (permsError) throw permsError;

      // Get users from auth.users via edge function or RPC
      // For now, we'll work with what we have from user_roles
      const userMap = new Map<string, UserWithRole>();
      
      roles?.forEach(role => {
        userMap.set(role.user_id, {
          id: role.user_id,
          email: '', // Will be filled by edge function
          role: role.role as AppRole,
          created_at: role.created_at,
          last_sign_in_at: null,
          permissions: permissions?.filter(p => p.user_id === role.user_id) as UserPermission[] || [],
        });
      });

      return Array.from(userMap.values());
    },
  });

  // Update user role
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { data, error } = await supabase
        .from('user_roles')
        .upsert({ 
          user_id: userId, 
          role,
          updated_at: new Date().toISOString()
        }, { 
          onConflict: 'user_id' 
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      toast.success('Função do usuário atualizada com sucesso');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar função: ' + error.message);
    },
  });

  // Update user permissions
  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ 
      userId, 
      permissions 
    }: { 
      userId: string; 
      permissions: Array<{
        module: AppModule;
        can_view: boolean;
        can_edit: boolean;
        can_delete: boolean;
      }>;
    }) => {
      // Delete existing permissions
      const { error: deleteError } = await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', userId);
      
      if (deleteError) throw deleteError;

      // Insert new permissions
      if (permissions.length > 0) {
        const { data, error } = await supabase
          .from('user_permissions')
          .insert(permissions.map(p => ({
            user_id: userId,
            module: p.module,
            can_view: p.can_view,
            can_edit: p.can_edit,
            can_delete: p.can_delete,
          })))
          .select();
        
        if (error) throw error;
        return data;
      }
      
      return [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      toast.success('Permissões atualizadas com sucesso');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar permissões: ' + error.message);
    },
  });

  // Delete user role (removes user from system access)
  const deleteUserRoleMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Delete permissions first
      await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', userId);

      // Delete role
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      toast.success('Acesso do usuário removido');
    },
    onError: (error: Error) => {
      toast.error('Erro ao remover acesso: ' + error.message);
    },
  });

  return {
    users,
    isLoading,
    error,
    updateRole: updateRoleMutation.mutate,
    updatePermissions: updatePermissionsMutation.mutate,
    deleteUserRole: deleteUserRoleMutation.mutate,
    isUpdatingRole: updateRoleMutation.isPending,
    isUpdatingPermissions: updatePermissionsMutation.isPending,
  };
}
