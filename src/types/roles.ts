export type AppRole = 'super_admin' | 'admin' | 'user';

export type AppModule = 
  | 'dashboard'
  | 'funil'
  | 'clientes'
  | 'estoque'
  | 'orcamentos'
  | 'pedidos'
  | 'nota_fiscal'
  | 'usuarios';

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  updated_at: string;
}

export interface UserPermission {
  id: string;
  user_id: string;
  module: AppModule;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
  created_at: string;
}

export interface UserWithRole {
  id: string;
  email: string;
  role: AppRole | null;
  created_at: string;
  last_sign_in_at: string | null;
  permissions: UserPermission[];
}

export const MODULE_LABELS: Record<AppModule, string> = {
  dashboard: 'Dashboard',
  funil: 'Funil de Vendas',
  clientes: 'Clientes',
  estoque: 'Estoque',
  orcamentos: 'Orçamentos',
  pedidos: 'Pedidos de Venda',
  nota_fiscal: 'Nota Fiscal',
  usuarios: 'Usuários',
};

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  user: 'Usuário',
};

export const ALL_MODULES: AppModule[] = [
  'dashboard',
  'funil',
  'clientes',
  'estoque',
  'orcamentos',
  'pedidos',
  'nota_fiscal',
  'usuarios',
];
