// Clientes table - matches public."Clientes"
export interface Cliente {
  id?: number;
  CLI_CNPJ: string; // Primary key
  CLI_NOME: string | null;
  CLI_ENDERECO: string | null;
  CLI_BAIRRO: string | null;
  CLI_CEP: string | null;
  CLI_FONE: string | null;
  CLI_EMAIL: string | null;
}

export interface ClienteInsert {
  CLI_CNPJ: string;
  CLI_NOME?: string | null;
  CLI_ENDERECO?: string | null;
  CLI_BAIRRO?: string | null;
  CLI_CEP?: string | null;
  CLI_FONE?: string | null;
  CLI_EMAIL?: string | null;
}

// Estoque table - matches public.estoque
export interface Estoque {
  id: number;
  produto_nome: string;
  tipo_laminas: string;
  descricao: string | null;
  codigo_sku: string;
  quantidade: number;
  quantidade_minima: number;
  preco_custo: number;
  preco_venda: number;
  unidade_medida: string | null;
  fornecedor: string | null;
  data_cadastro: string | null;
  data_atualizacao: string | null;
}

export interface EstoqueInsert {
  produto_nome: string;
  tipo_laminas: string;
  descricao?: string | null;
  codigo_sku: string;
  quantidade?: number;
  quantidade_minima?: number;
  preco_custo: number;
  preco_venda: number;
  unidade_medida?: string | null;
  fornecedor?: string | null;
}

export interface EstoqueUpdate {
  produto_nome?: string;
  tipo_laminas?: string;
  descricao?: string | null;
  codigo_sku?: string;
  quantidade?: number;
  quantidade_minima?: number;
  preco_custo?: number;
  preco_venda?: number;
  unidade_medida?: string | null;
  fornecedor?: string | null;
}
