export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      Clientes: {
        Row: {
          CLI_BAIRRO: string | null
          CLI_CEP: string | null
          CLI_CNPJ: string
          CLI_EMAIL: string | null
          CLI_ENDERECO: string | null
          CLI_FONE: string | null
          CLI_NOME: string | null
          id: number
        }
        Insert: {
          CLI_BAIRRO?: string | null
          CLI_CEP?: string | null
          CLI_CNPJ: string
          CLI_EMAIL?: string | null
          CLI_ENDERECO?: string | null
          CLI_FONE?: string | null
          CLI_NOME?: string | null
          id?: number
        }
        Update: {
          CLI_BAIRRO?: string | null
          CLI_CEP?: string | null
          CLI_CNPJ?: string
          CLI_EMAIL?: string | null
          CLI_ENDERECO?: string | null
          CLI_FONE?: string | null
          CLI_NOME?: string | null
          id?: number
        }
        Relationships: []
      }
      estoque: {
        Row: {
          codigo_sku: string
          data_atualizacao: string
          data_cadastro: string
          descricao: string | null
          fornecedor: string | null
          id: number
          preco_custo: number
          preco_venda: number
          produto_nome: string
          quantidade: number
          quantidade_minima: number
          tipo_laminas: string
          unidade_medida: string | null
        }
        Insert: {
          codigo_sku: string
          data_atualizacao?: string
          data_cadastro?: string
          descricao?: string | null
          fornecedor?: string | null
          id?: number
          preco_custo?: number
          preco_venda?: number
          produto_nome: string
          quantidade?: number
          quantidade_minima?: number
          tipo_laminas: string
          unidade_medida?: string | null
        }
        Update: {
          codigo_sku?: string
          data_atualizacao?: string
          data_cadastro?: string
          descricao?: string | null
          fornecedor?: string | null
          id?: number
          preco_custo?: number
          preco_venda?: number
          produto_nome?: string
          quantidade?: number
          quantidade_minima?: number
          tipo_laminas?: string
          unidade_medida?: string | null
        }
        Relationships: []
      }
      funil_etapas: {
        Row: {
          color: string
          created_at: string
          key: string
          label: string
          ordem: number
          updated_at: string
        }
        Insert: {
          color: string
          created_at?: string
          key: string
          label: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          key?: string
          label?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      funil_leads: {
        Row: {
          anexo_pdf: string | null
          created_at: string
          email: string | null
          empresa: string | null
          etapa_key: string
          id: string
          itens: Json
          nome: string
          observacoes: string | null
          origem: string
          telefone: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          anexo_pdf?: string | null
          created_at?: string
          email?: string | null
          empresa?: string | null
          etapa_key?: string
          id?: string
          itens?: Json
          nome: string
          observacoes?: string | null
          origem?: string
          telefone?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          anexo_pdf?: string | null
          created_at?: string
          email?: string | null
          empresa?: string | null
          etapa_key?: string
          id?: string
          itens?: Json
          nome?: string
          observacoes?: string | null
          origem?: string
          telefone?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      leo_api_keys: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key_name: string
          key_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key_name: string
          key_value?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key_name?: string
          key_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      leo_conversations: {
        Row: {
          adicionais: Json
          adicionais_perguntado: boolean
          altura: number | null
          carrinho: Json
          cep: string | null
          created_at: string
          endereco_instalacao: string | null
          entrega_perguntado: boolean
          etapa_fluxo: string
          frete: number | null
          id: string
          largura: number | null
          nome_cliente: string | null
          pecas_avulsas: Json
          pedido: Json
          pintura_perguntado: boolean
          pre_cadastro: boolean
          quer_entrega: boolean | null
          quer_pintura: boolean | null
          status: string
          subtipo_revenda: string | null
          telefone: string
          tipo_cliente: string
          tipo_perfil: string | null
          tipo_pintura: string | null
          ultima_mensagem_at: string | null
          updated_at: string
        }
        Insert: {
          adicionais?: Json
          adicionais_perguntado?: boolean
          altura?: number | null
          carrinho?: Json
          cep?: string | null
          created_at?: string
          endereco_instalacao?: string | null
          entrega_perguntado?: boolean
          etapa_fluxo?: string
          frete?: number | null
          id?: string
          largura?: number | null
          nome_cliente?: string | null
          pecas_avulsas?: Json
          pedido?: Json
          pintura_perguntado?: boolean
          pre_cadastro?: boolean
          quer_entrega?: boolean | null
          quer_pintura?: boolean | null
          status?: string
          subtipo_revenda?: string | null
          telefone: string
          tipo_cliente?: string
          tipo_perfil?: string | null
          tipo_pintura?: string | null
          ultima_mensagem_at?: string | null
          updated_at?: string
        }
        Update: {
          adicionais?: Json
          adicionais_perguntado?: boolean
          altura?: number | null
          carrinho?: Json
          cep?: string | null
          created_at?: string
          endereco_instalacao?: string | null
          entrega_perguntado?: boolean
          etapa_fluxo?: string
          frete?: number | null
          id?: string
          largura?: number | null
          nome_cliente?: string | null
          pecas_avulsas?: Json
          pedido?: Json
          pintura_perguntado?: boolean
          pre_cadastro?: boolean
          quer_entrega?: boolean | null
          quer_pintura?: boolean | null
          status?: string
          subtipo_revenda?: string | null
          telefone?: string
          tipo_cliente?: string
          tipo_perfil?: string | null
          tipo_pintura?: string | null
          ultima_mensagem_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      leo_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "leo_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "leo_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamentos: {
        Row: {
          cliente_nome: string
          cliente_telefone: string | null
          created_at: string
          data_criacao: string
          id: number
          itens: Json
          numero: string | null
          observacoes: string | null
          origem: string
          status: string
          updated_at: string
          valor_total: number
        }
        Insert: {
          cliente_nome: string
          cliente_telefone?: string | null
          created_at?: string
          data_criacao?: string
          id?: number
          itens?: Json
          numero?: string | null
          observacoes?: string | null
          origem?: string
          status?: string
          updated_at?: string
          valor_total?: number
        }
        Update: {
          cliente_nome?: string
          cliente_telefone?: string | null
          created_at?: string
          data_criacao?: string
          id?: number
          itens?: Json
          numero?: string | null
          observacoes?: string | null
          origem?: string
          status?: string
          updated_at?: string
          valor_total?: number
        }
        Relationships: []
      }
      pedidos_venda: {
        Row: {
          cliente_nome: string
          cliente_telefone: string | null
          created_at: string
          data_criacao: string
          id: number
          itens: Json
          numero: string | null
          observacoes: string | null
          orcamento_id: number | null
          origem: string
          status: string
          updated_at: string
          valor_total: number
        }
        Insert: {
          cliente_nome: string
          cliente_telefone?: string | null
          created_at?: string
          data_criacao?: string
          id?: number
          itens?: Json
          numero?: string | null
          observacoes?: string | null
          orcamento_id?: number | null
          origem?: string
          status?: string
          updated_at?: string
          valor_total?: number
        }
        Update: {
          cliente_nome?: string
          cliente_telefone?: string | null
          created_at?: string
          data_criacao?: string
          id?: number
          itens?: Json
          numero?: string | null
          observacoes?: string | null
          orcamento_id?: number | null
          origem?: string
          status?: string
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_venda_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          module: string
          user_id: string
        }
        Insert: {
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module: string
          user_id: string
        }
        Update: {
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "user"],
    },
  },
} as const
