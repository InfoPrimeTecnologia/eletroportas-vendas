import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Cliente, ClienteInsert } from '@/types/database';
import { toast } from 'sonner';

export function useClientes() {
  const queryClient = useQueryClient();

  const { data: clientes = [], isLoading, error } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('Clientes')
        .select('*')
        .order('CLI_NOME');
      
      if (error) throw error;
      return data as Cliente[];
    },
  });

  const createCliente = useMutation({
    mutationFn: async (cliente: ClienteInsert) => {
      const { data, error } = await supabase
        .from('Clientes')
        .insert(cliente)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      toast.success('Cliente cadastrado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao cadastrar cliente: ${error.message}`);
    },
  });

  const updateCliente = useMutation({
    mutationFn: async ({ cnpj, updates }: { cnpj: string; updates: Partial<ClienteInsert> }) => {
      const { data, error } = await supabase
        .from('Clientes')
        .update(updates)
        .eq('CLI_CNPJ', cnpj)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      toast.success('Cliente atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar cliente: ${error.message}`);
    },
  });

  const deleteCliente = useMutation({
    mutationFn: async (cnpj: string) => {
      const { error } = await supabase
        .from('Clientes')
        .delete()
        .eq('CLI_CNPJ', cnpj);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      toast.success('Cliente excluído com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir cliente: ${error.message}`);
    },
  });

  return {
    clientes,
    isLoading,
    error,
    createCliente,
    updateCliente,
    deleteCliente,
  };
}
