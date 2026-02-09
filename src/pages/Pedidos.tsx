import { useState } from "react";
import { Plus, Search, ShoppingCart, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Pedido {
  id: string;
  numero: string;
  cliente: string;
  data: string;
  valor: number;
  status: "processando" | "aprovado" | "em_producao" | "entregue";
  origem: "robo" | "manual";
  itens: string;
}

const mockPedidos: Pedido[] = [
  { id: "1", numero: "PV-2025-001", cliente: "Carlos Lima", data: "2025-02-08", valor: 6700, status: "aprovado", origem: "robo", itens: "Motor Deslizante x1, Cremalheira x3" },
  { id: "2", numero: "PV-2025-002", cliente: "Construtora ABC", data: "2025-02-07", valor: 18000, status: "em_producao", origem: "robo", itens: "Portão Basculante x2, Motor x2" },
  { id: "3", numero: "PV-2025-003", cliente: "Fernanda Dias", data: "2025-02-06", valor: 15000, status: "entregue", origem: "manual", itens: "Portão Deslizante personalizado" },
];

const statusColors: Record<string, string> = {
  processando: "bg-muted text-muted-foreground",
  aprovado: "badge-cold",
  em_producao: "badge-warm",
  entregue: "badge-success",
};

const statusLabels: Record<string, string> = {
  processando: "Processando",
  aprovado: "Aprovado",
  em_producao: "Em Produção",
  entregue: "Entregue",
};

const Pedidos = () => {
  const [pedidos, setPedidos] = useState<Pedido[]>(mockPedidos);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ cliente: "", itens: "", valor: "" });

  const filtered = pedidos.filter(
    (p) => p.cliente.toLowerCase().includes(search.toLowerCase()) || p.numero.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    const newPedido: Pedido = {
      id: Date.now().toString(),
      numero: `PV-2025-${String(pedidos.length + 1).padStart(3, "0")}`,
      cliente: form.cliente,
      data: new Date().toISOString().split("T")[0],
      valor: Number(form.valor),
      status: "processando",
      origem: "manual",
      itens: form.itens,
    };
    setPedidos((prev) => [newPedido, ...prev]);
    setDialogOpen(false);
    setForm({ cliente: "", itens: "", valor: "" });
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Pedidos de Venda</h1>
          <p className="page-description">Pedidos gerados a partir de orçamentos aceitos</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Novo Pedido
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Pedido de Venda</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Input value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Itens</Label>
                <Textarea value={form.itens} onChange={(e) => setForm({ ...form, itens: e.target.value })} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Valor Total (R$)</Label>
                <Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </div>
              <Button onClick={handleCreate} className="w-full">Criar Pedido</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar pedidos..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
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
            {filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.numero}</TableCell>
                <TableCell className="font-medium">{p.cliente}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(p.data).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>
                  {p.origem === "robo" ? (
                    <span className="flex items-center gap-1 text-xs text-primary"><Bot className="h-3 w-3" /> Robô</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><User className="h-3 w-3" /> Manual</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${statusColors[p.status]}`}>
                    {statusLabels[p.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">R$ {p.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Nenhum pedido encontrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Pedidos;
