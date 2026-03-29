import { useState } from "react";
import { Plus, Search, Edit2, Trash2, Users as UsersIcon, Phone, Mail, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClientes } from "@/hooks/useClientes";
import { Cliente } from "@/types/database";

const Clientes = () => {
  const {
    clientes, isLoading, total, page, totalPages, setPage,
    search, setSearch, createCliente, updateCliente, deleteCliente
  } = useClientes();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form, setForm] = useState({
    CLI_NOME: "", CLI_EMAIL: "", CLI_FONE: "",
    CLI_ENDERECO: "", CLI_BAIRRO: "", CLI_CEP: "", CLI_CNPJ: "",
  });

  const handleSave = async () => {
    if (editing) {
      await updateCliente.mutateAsync({
        cnpj: editing.CLI_CNPJ,
        updates: {
          CLI_NOME: form.CLI_NOME || null, CLI_EMAIL: form.CLI_EMAIL || null,
          CLI_FONE: form.CLI_FONE || null, CLI_ENDERECO: form.CLI_ENDERECO || null,
          CLI_BAIRRO: form.CLI_BAIRRO || null, CLI_CEP: form.CLI_CEP || null,
        },
      });
    } else {
      await createCliente.mutateAsync({
        CLI_CNPJ: form.CLI_CNPJ, CLI_NOME: form.CLI_NOME || null,
        CLI_EMAIL: form.CLI_EMAIL || null, CLI_FONE: form.CLI_FONE || null,
        CLI_ENDERECO: form.CLI_ENDERECO || null, CLI_BAIRRO: form.CLI_BAIRRO || null,
        CLI_CEP: form.CLI_CEP || null,
      });
    }
    setDialogOpen(false);
    setEditing(null);
    resetForm();
  };

  const handleEdit = (c: Cliente) => {
    setEditing(c);
    setForm({
      CLI_NOME: c.CLI_NOME || "", CLI_EMAIL: c.CLI_EMAIL || "",
      CLI_FONE: c.CLI_FONE || "", CLI_ENDERECO: c.CLI_ENDERECO || "",
      CLI_BAIRRO: c.CLI_BAIRRO || "", CLI_CEP: c.CLI_CEP || "", CLI_CNPJ: c.CLI_CNPJ,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (cnpj: string) => {
    await deleteCliente.mutateAsync(cnpj);
  };

  const resetForm = () => {
    setForm({ CLI_NOME: "", CLI_EMAIL: "", CLI_FONE: "", CLI_ENDERECO: "", CLI_BAIRRO: "", CLI_CEP: "", CLI_CNPJ: "" });
  };

  const openNew = () => { setEditing(null); resetForm(); setDialogOpen(true); };

  const isSaving = createCliente.isPending || updateCliente.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-description">Cadastro e gerenciamento de clientes ({total} registros)</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo Cliente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={form.CLI_NOME} onChange={(e) => setForm({ ...form, CLI_NOME: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CPF/CNPJ *</Label>
                  <Input value={form.CLI_CNPJ} onChange={(e) => setForm({ ...form, CLI_CNPJ: e.target.value })} disabled={!!editing} placeholder="Obrigatório" />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={form.CLI_FONE} onChange={(e) => setForm({ ...form, CLI_FONE: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.CLI_EMAIL} onChange={(e) => setForm({ ...form, CLI_EMAIL: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Endereço</Label>
                  <Input value={form.CLI_ENDERECO} onChange={(e) => setForm({ ...form, CLI_ENDERECO: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Bairro</Label>
                  <Input value={form.CLI_BAIRRO} onChange={(e) => setForm({ ...form, CLI_BAIRRO: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>CEP</Label>
                <Input value={form.CLI_CEP} onChange={(e) => setForm({ ...form, CLI_CEP: e.target.value })} />
              </div>
              <Button onClick={handleSave} className="w-full" disabled={isSaving || !form.CLI_CNPJ}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? "Salvar Alterações" : "Cadastrar Cliente"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, email, CNPJ ou telefone..."
          className="pl-10"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      <div className="stat-card p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CPF/CNPJ</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Endereço</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientes.map((c) => (
              <TableRow key={c.CLI_CNPJ}>
                <TableCell className="font-medium">{c.CLI_NOME || "-"}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{c.CLI_CNPJ}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    {c.CLI_EMAIL && <span className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> {c.CLI_EMAIL}</span>}
                    {c.CLI_FONE && <span className="text-xs flex items-center gap-1 text-muted-foreground"><Phone className="h-3 w-3" /> {c.CLI_FONE}</span>}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {[c.CLI_ENDERECO, c.CLI_BAIRRO, c.CLI_CEP].filter(Boolean).join(", ") || "-"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}><Edit2 className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(c.CLI_CNPJ)} className="text-destructive" disabled={deleteCliente.isPending}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {clientes.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  <UsersIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Nenhum cliente encontrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages} ({total} clientes)
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Próxima <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Clientes;
