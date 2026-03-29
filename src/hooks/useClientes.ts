import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Cliente, ClienteInsert } from '@/types/database';
import { toast } from 'sonner';
import { useState } from 'react';

const PAGE_SIZE = 100;

export function useClientes() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['clientes', page, search],
    queryFn: async () => {
      let query = supabase.from('Clientes').select('*', { count: 'exact' });

      if (search.trim()) {
        query = query.or(
          `CLI_NOME.ilike.%${search}%,CLI_EMAIL.ilike.%${search}%,CLI_CNPJ.ilike.%${search}%,CLI_FONE.ilike.%${search}%`
        );
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query
        .order('CLI_NOME')
        .range(from, to);

      if (error) throw error;
      return { clientes: data as Cliente[], total: count ?? 0 };
    },
  });

  const clientes = data?.clientes ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

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
    total,
    page,
    totalPages,
    setPage,
    search,
    setSearch,
    createCliente,
    updateCliente,
    deleteCliente,
  };
}
