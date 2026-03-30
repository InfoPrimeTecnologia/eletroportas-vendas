import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PedidoItem {
  produto_nome: string;
  codigo_sku: string;
  quantidade: number;
  preco_unitario: number;
}

export interface Pedido {
  id: number;
  numero: string;
  cliente_cnpj: string | null;
  cliente_nome: string;
  data_criacao: string;
  valor_total: number;
  status: string;
  origem: string;
  itens: PedidoItem[];
  observacoes: string | null;
  orcamento_id: number | null;
}

export interface PedidoInsert {
  cliente_cnpj?: string | null;
  cliente_nome: string;
  valor_total: number;
  status?: string;
  origem?: string;
  itens: PedidoItem[];
  observacoes?: string | null;
  orcamento_id?: number | null;
}

export function usePedidos() {
  const queryClient = useQueryClient();

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['pedidos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pedidos_venda')
        .select('*')
        .order('data_criacao', { ascending: false });
      if (error) throw error;
      return data as Pedido[];
    },
  });

  const createPedido = useMutation({
    mutationFn: async (ped: PedidoInsert) => {
      const { data, error } = await supabase
        .from('pedidos_venda')
        .insert({
          cliente_cnpj: ped.cliente_cnpj,
          cliente_nome: ped.cliente_nome,
          valor_total: ped.valor_total,
          status: ped.status || 'processando',
          origem: ped.origem || 'manual',
          itens: ped.itens as any,
          observacoes: ped.observacoes,
          orcamento_id: ped.orcamento_id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
      toast.success('Pedido criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar pedido: ${error.message}`);
    },
  });

  const updatePedido = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<PedidoInsert> }) => {
      const { data, error } = await supabase
        .from('pedidos_venda')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
      toast.success('Pedido atualizado!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  const deletePedido = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('pedidos_venda')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
      toast.success('Pedido excluído!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir: ${error.message}`);
    },
  });

  return { pedidos, isLoading, createPedido, updatePedido, deletePedido };
}
