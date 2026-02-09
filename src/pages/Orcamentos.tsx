import { useState } from "react";
import { Plus, Search, Eye, FileText, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

interface Orcamento {
  id: string;
  numero: string;
  cliente: string;
  data: string;
  valor: number;
  status: "pendente" | "enviado" | "aceito" | "recusado";
  origem: "robo" | "manual";
  itens: string;
}

const mockOrcamentos: Orcamento[] = [
  { id: "1", numero: "ORC-2025-001", cliente: "João Silva", data: "2025-02-08", valor: 4500, status: "enviado", origem: "robo", itens: "Motor Deslizante 1/3 HP x1, Instalação" },
  { id: "2", numero: "ORC-2025-002", cliente: "Construtora ABC", data: "2025-02-07", valor: 18000, status: "aceito", origem: "robo", itens: "Portão Basculante 3x2.5m x2, Motor x2" },
  { id: "3", numero: "ORC-2025-003", cliente: "Maria Santos", data: "2025-02-06", valor: 3200, status: "pendente", origem: "manual", itens: "Controle Remoto x5, Sensor Anti-Esmagamento x2" },
  { id: "4", numero: "ORC-2025-004", cliente: "Pedro Costa", data: "2025-02-05", valor: 6700, status: "recusado", origem: "robo", itens: "Motor Deslizante x1, Cremalheira x3" },
];

const statusColors: Record<string, string> = {
  pendente: "bg-muted text-muted-foreground",
  enviado: "badge-cold",
  aceito: "badge-success",
  recusado: "bg-destructive/10 text-destructive",
};

const statusLabels: Record<string, string> = {
  pendente: "Pendente",
  enviado: "Enviado",
  aceito: "Aceito",
  recusado: "Recusado",
};

const Orcamentos = () => {
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>(mockOrcamentos);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ cliente: "", itens: "", valor: "" });

  const filtered = orcamentos.filter(
    (o) => o.cliente.toLowerCase().includes(search.toLowerCase()) || o.numero.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    const newOrc: Orcamento = {
      id: Date.now().toString(),
      numero: `ORC-2025-${String(orcamentos.length + 1).padStart(3, "0")}`,
      cliente: form.cliente,
      data: new Date().toISOString().split("T")[0],
      valor: Number(form.valor),
      status: "pendente",
      origem: "manual",
      itens: form.itens,
    };
    setOrcamentos((prev) => [newOrc, ...prev]);
    setDialogOpen(false);
    setForm({ cliente: "", itens: "", valor: "" });
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Orçamentos</h1>
          <p className="page-description">Orçamentos gerados pelo robô e manualmente</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Novo Orçamento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Orçamento Manual</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Input value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Itens / Descrição</Label>
                <Textarea value={form.itens} onChange={(e) => setForm({ ...form, itens: e.target.value })} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Valor Total (R$)</Label>
                <Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </div>
              <Button onClick={handleCreate} className="w-full">Criar Orçamento</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar orçamentos..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="stat-card p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.numero}</TableCell>
                <TableCell className="font-medium">{o.cliente}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(o.data).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>
                  {o.origem === "robo" ? (
                    <span className="flex items-center gap-1 text-xs text-primary"><Bot className="h-3 w-3" /> Robô</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><User className="h-3 w-3" /> Manual</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${statusColors[o.status]}`}>
                    {statusLabels[o.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">R$ {o.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Nenhum orçamento encontrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Orcamentos;
