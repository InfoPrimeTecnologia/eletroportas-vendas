// Tipos compartilhados do configurador Leo.
// Extraídos de index.ts (Fase 1 da refatoração modular).

export type TipoInstalacao =
  | "entre_testeiras"
  | "vao_1guia"
  | "vao_guias"
  | "entre_paredes";

export type CfgItemTipo =
  | "kit_porta"
  | "motor"
  | "guia"
  | "lamina"
  | "soleira"
  | "eixo"
  | "controle"
  | "central"
  | "trava_lamina"
  | "portinhola"
  | "alcapao"
  | "pintura"
  | "acessorio";

export interface CfgLinha {
  sku: string;
  descricao: string;
  und: string;
  qtd: number;
  valor_unit: number;
  total: number;
  sob_consulta?: boolean;
}

export interface CfgItem {
  id: string;
  tipo: CfgItemTipo;
  config: Record<string, any>;
  explosao: CfgLinha[];
  subtotal: number;
}

export interface CfgPedido {
  itens: CfgItem[];
  total: number;
  status: "em_andamento" | "aguardando_confirmacao" | "finalizado";
  sob_consulta?: boolean;
  aguardando_retomada?: boolean;
}

export const PEDIDO_VAZIO: CfgPedido = { itens: [], total: 0, status: "em_andamento" };

export function novoId(): string {
  return crypto.randomUUID().slice(0, 8);
}
