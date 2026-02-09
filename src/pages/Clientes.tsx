import { useState } from "react";
import { Plus, Search, Edit2, Trash2, Users as UsersIcon, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Cliente {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  endereco: string;
  tipo: "PF" | "PJ";
  cpfCnpj: string;
}

const mockClientes: Cliente[] = [
  { id: "1", nome: "João Silva", email: "joao@email.com", telefone: "(11) 99999-1234", endereco: "Rua das Flores, 123", tipo: "PF", cpfCnpj: "123.456.789-00" },
  { id: "2", nome: "Construtora ABC Ltda", email: "contato@abc.com", telefone: "(11) 3333-4567", endereco: "Av. Industrial, 500", tipo: "PJ", cpfCnpj: "12.345.678/0001-90" },
  { id: "3", nome: "Maria Santos", email: "maria@email.com", telefone: "(21) 98888-5678", endereco: "Rua do Porto, 45", tipo: "PF", cpfCnpj: "987.654.321-00" },
  { id: "4", nome: "Pedro Costa", email: "pedro@email.com", telefone: "(31) 97777-9012", endereco: "Rua Central, 789", tipo: "PF", cpfCnpj: "456.789.123-00" },
];

const Clientes = () => {
  const [clientes, setClientes] = useState<Cliente[]>(mockClientes);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [form, setForm] = useState({ nome: "", email: "", telefone: "", endereco: "", tipo: "PF" as "PF" | "PJ", cpfCnpj: "" });

  const filtered = clientes.filter(
    (c) => c.nome.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = () => {
    if (editing) {
      setClientes((prev) => prev.map((c) => (c.id === editing.id ? { ...c, ...form } : c)));
    } else {
      setClientes((prev) => [...prev, { id: Date.now().toString(), ...form }]);
    }
    setDialogOpen(false);
    setEditing(null);
    setForm({ nome: "", email: "", telefone: "", endereco: "", tipo: "PF", cpfCnpj: "" });
  };

  const handleEdit = (c: Cliente) => {
    setEditing(c);
    setForm({ nome: c.nome, email: c.email, telefone: c.telefone, endereco: c.endereco, tipo: c.tipo, cpfCnpj: c.cpfCnpj });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ nome: "", email: "", telefone: "", endereco: "", tipo: "PF", cpfCnpj: "" });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-description">Cadastro e gerenciamento de clientes</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value as "PF" | "PJ" })}
                  >
                    <option value="PF">Pessoa Física</option>
                    <option value="PJ">Pessoa Jurídica</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{form.tipo === "PF" ? "CPF" : "CNPJ"}</Label>
                  <Input value={form.cpfCnpj} onChange={(e) => setForm({ ...form, cpfCnpj: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
              </div>
              <Button onClick={handleSave} className="w-full">
                {editing ? "Salvar Alterações" : "Cadastrar Cliente"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar clientes..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="stat-card p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>CPF/CNPJ</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.nome}</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-1 rounded-full ${c.tipo === "PJ" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {c.tipo}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{c.cpfCnpj}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> {c.email}</span>
                    <span className="text-xs flex items-center gap-1 text-muted-foreground"><Phone className="h-3 w-3" /> {c.telefone}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(c)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setClientes((prev) => prev.filter((x) => x.id !== c.id))} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
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
    </div>
  );
};

export default Clientes;
