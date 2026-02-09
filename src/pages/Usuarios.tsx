import { useState } from 'react';
import { useUserRole } from '@/hooks/useUserRole';
import { useUsersManagement } from '@/hooks/useUsersManagement';
import { 
  AppRole, 
  AppModule, 
  ROLE_LABELS, 
  MODULE_LABELS, 
  ALL_MODULES,
  UserWithRole 
} from '@/types/roles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  Users, 
  Shield, 
  ShieldCheck, 
  User, 
  Settings, 
  Loader2, 
  AlertTriangle,
  Eye,
  Edit,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const getRoleIcon = (role: AppRole | null) => {
  switch (role) {
    case 'super_admin':
      return <ShieldCheck className="h-4 w-4 text-primary" />;
    case 'admin':
      return <Shield className="h-4 w-4 text-accent" />;
    default:
      return <User className="h-4 w-4 text-muted-foreground" />;
  }
};

const getRoleBadgeVariant = (role: AppRole | null) => {
  switch (role) {
    case 'super_admin':
      return 'default';
    case 'admin':
      return 'secondary';
    default:
      return 'outline';
  }
};

export default function Usuarios() {
  const { isSuperAdmin, isAdmin, isLoading: roleLoading } = useUserRole();
  const { 
    users, 
    isLoading, 
    updateRole, 
    updatePermissions,
    isUpdatingRole,
    isUpdatingPermissions,
  } = useUsersManagement();

  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<AppRole>('user');
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [editedPermissions, setEditedPermissions] = useState<Record<AppModule, {
    can_view: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }>>({} as any);

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) {
      toast.error('Preencha email e senha');
      return;
    }

    setIsCreatingUser(true);
    try {
      // Create user via Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: newUserEmail,
        password: newUserPassword,
      });

      if (error) throw error;

      if (data.user) {
        // Assign role to the new user
        const { error: roleError } = await supabase
          .from('user_roles')
          .insert({
            user_id: data.user.id,
            role: newUserRole,
          });

        if (roleError) throw roleError;

        toast.success('Usuário criado com sucesso!');
        setAddUserDialogOpen(false);
        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserRole('user');
        
        // Refresh users list
        window.location.reload();
      }
    } catch (error: any) {
      toast.error('Erro ao criar usuário: ' + error.message);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleOpenPermissions = (user: UserWithRole) => {
    setSelectedUser(user);
    
    // Initialize permissions state
    const permsMap: Record<AppModule, { can_view: boolean; can_edit: boolean; can_delete: boolean }> = 
      {} as any;
    
    ALL_MODULES.forEach(module => {
      const existing = user.permissions?.find(p => p.module === module);
      permsMap[module] = {
        can_view: existing?.can_view ?? false,
        can_edit: existing?.can_edit ?? false,
        can_delete: existing?.can_delete ?? false,
      };
    });
    
    setEditedPermissions(permsMap);
    setPermissionsDialogOpen(true);
  };

  const handleSavePermissions = () => {
    if (!selectedUser) return;

    const permissionsArray = Object.entries(editedPermissions)
      .filter(([_, perms]) => perms.can_view || perms.can_edit || perms.can_delete)
      .map(([module, perms]) => ({
        module: module as AppModule,
        ...perms,
      }));

    updatePermissions({ 
      userId: selectedUser.id, 
      permissions: permissionsArray 
    });
    
    setPermissionsDialogOpen(false);
  };

  const togglePermission = (
    module: AppModule, 
    type: 'can_view' | 'can_edit' | 'can_delete'
  ) => {
    setEditedPermissions(prev => {
      const current = prev[module] || { can_view: false, can_edit: false, can_delete: false };
      const newValue = !current[type];
      
      // If enabling edit or delete, also enable view
      let updated = { ...current, [type]: newValue };
      if ((type === 'can_edit' || type === 'can_delete') && newValue) {
        updated.can_view = true;
      }
      // If disabling view, also disable edit and delete
      if (type === 'can_view' && !newValue) {
        updated.can_edit = false;
        updated.can_delete = false;
      }
      
      return { ...prev, [module]: updated };
    });
  };

  if (roleLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Você não tem permissão para acessar esta página.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Users className="h-6 w-6" />
            Gerenciamento de Usuários
          </h1>
          <p className="page-description">
            Gerencie os usuários e suas permissões no sistema
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setAddUserDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Adicionar Usuário
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuários do Sistema</CardTitle>
          <CardDescription>
            {isSuperAdmin 
              ? 'Como Super Admin, você pode gerenciar todos os usuários e suas funções.'
              : 'Como Admin, você pode gerenciar permissões de usuários comuns.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users && users.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getRoleIcon(user.role)}
                        <span className="font-medium">
                          {user.email || user.id.slice(0, 8) + '...'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isSuperAdmin && user.role !== 'super_admin' ? (
                        <Select
                          value={user.role || 'user'}
                          onValueChange={(value) => 
                            updateRole({ userId: user.id, role: value as AppRole })
                          }
                          disabled={isUpdatingRole}
                        >
                          <SelectTrigger className="w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">
                              {ROLE_LABELS.admin}
                            </SelectItem>
                            <SelectItem value="user">
                              {ROLE_LABELS.user}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={getRoleBadgeVariant(user.role)}>
                          {user.role ? ROLE_LABELS[user.role] : 'Sem função'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right">
                      {user.role !== 'super_admin' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenPermissions(user)}
                        >
                          <Settings className="h-4 w-4 mr-1" />
                          Permissões
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum usuário encontrado.</p>
              <p className="text-sm mt-2">
                Adicione usuários pelo painel do Supabase Authentication.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permissions Dialog */}
      <Dialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Permissões do Usuário</DialogTitle>
            <DialogDescription>
              Configure quais módulos este usuário pode acessar
            </DialogDescription>
          </DialogHeader>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Módulo</TableHead>
                  <TableHead className="text-center w-24">
                    <div className="flex items-center justify-center gap-1">
                      <Eye className="h-4 w-4" />
                      Ver
                    </div>
                  </TableHead>
                  <TableHead className="text-center w-24">
                    <div className="flex items-center justify-center gap-1">
                      <Edit className="h-4 w-4" />
                      Editar
                    </div>
                  </TableHead>
                  <TableHead className="text-center w-24">
                    <div className="flex items-center justify-center gap-1">
                      <Trash2 className="h-4 w-4" />
                      Excluir
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ALL_MODULES.filter(m => m !== 'usuarios').map((module) => (
                  <TableRow key={module}>
                    <TableCell className="font-medium">
                      {MODULE_LABELS[module]}
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={editedPermissions[module]?.can_view ?? false}
                        onCheckedChange={() => togglePermission(module, 'can_view')}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={editedPermissions[module]?.can_edit ?? false}
                        onCheckedChange={() => togglePermission(module, 'can_edit')}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={editedPermissions[module]?.can_delete ?? false}
                        onCheckedChange={() => togglePermission(module, 'can_delete')}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPermissionsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSavePermissions} disabled={isUpdatingPermissions}>
              {isUpdatingPermissions ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Permissões'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={addUserDialogOpen} onOpenChange={setAddUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Novo Usuário</DialogTitle>
            <DialogDescription>
              Crie um novo usuário e defina sua função no sistema
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@email.com"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Função</Label>
              <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                  <SelectItem value="user">{ROLE_LABELS.user}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateUser} disabled={isCreatingUser}>
              {isCreatingUser ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Criar Usuário
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
