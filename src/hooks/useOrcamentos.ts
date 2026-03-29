import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface OrcamentoItem {
  produto_nome: string;
  codigo_sku: string;
  quantidade: number;
  preco_unitario: number;
}

export interface Orcamento {
  id: number;
  numero: string;
  cliente_cnpj: string | null;
  cliente_nome: string;
  data_criacao: string;
  valor_total: number;
  status: string;
  origem: string;
  itens: OrcamentoItem[];
  observacoes: string | null;
}

export interface OrcamentoInsert {
  cliente_cnpj?: string | null;
  cliente_nome: string;
  valor_total: number;
  status?: string;
  origem?: string;
  itens: OrcamentoItem[];
  observacoes?: string | null;
}

export function useOrcamentos() {
  const queryClient = useQueryClient();

  const { data: orcamentos = [], isLoading } = useQuery({
    queryKey: ['orcamentos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orcamentos')
        .select('*')
        .order('data_criacao', { ascending: false });
      if (error) throw error;
      return data as Orcamento[];
    },
  });

  const createOrcamento = useMutation({
    mutationFn: async (orc: OrcamentoInsert) => {
      const { data, error } = await supabase
        .from('orcamentos')
        .insert({
          cliente_cnpj: orc.cliente_cnpj,
          cliente_nome: orc.cliente_nome,
          valor_total: orc.valor_total,
          status: orc.status || 'pendente',
          origem: orc.origem || 'manual',
          itens: orc.itens as any,
          observacoes: orc.observacoes,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orcamentos'] });
      toast.success('Orçamento criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar orçamento: ${error.message}`);
    },
  });

  const updateOrcamento = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<OrcamentoInsert> }) => {
      const { data, error } = await supabase
        .from('orcamentos')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orcamentos'] });
      toast.success('Orçamento atualizado!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  return { orcamentos, isLoading, createOrcamento, updateOrcamento };
}
