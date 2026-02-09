import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Estoque, EstoqueInsert, EstoqueUpdate } from '@/types/database';
import { toast } from 'sonner';

export function useEstoque() {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['estoque'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estoque')
        .select('*')
        .order('produto_nome');
      
      if (error) throw error;
      return data as Estoque[];
    },
  });

  const createItem = useMutation({
    mutationFn: async (item: EstoqueInsert) => {
      const { data, error } = await supabase
        .from('estoque')
        .insert(item)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estoque'] });
      toast.success('Item adicionado ao estoque!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao adicionar item: ${error.message}`);
    },
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: EstoqueUpdate }) => {
      const { data, error } = await supabase
        .from('estoque')
        .update({ ...updates, data_atualizacao: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estoque'] });
      toast.success('Item atualizado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar item: ${error.message}`);
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('estoque')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estoque'] });
      toast.success('Item excluído com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir item: ${error.message}`);
    },
  });

  // Stats for reports
  const lowStockItems = items.filter(i => i.quantidade <= i.quantidade_minima);
  const totalValue = items.reduce((acc, i) => acc + (i.quantidade * i.preco_venda), 0);

  return {
    items,
    isLoading,
    error,
    createItem,
    updateItem,
    deleteItem,
    lowStockItems,
    totalValue,
  };
}
