import { useState } from "react";
import { Plus, Search, Receipt, FileDown, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface NotaFiscal {
  id: string;
  numero: string;
  cliente: string;
  cpfCnpj: string;
  data: string;
  valor: number;
  status: "emitida" | "cancelada" | "pendente";
  pedido: string;
  origem: "robo" | "manual";
}

const mockNotas: NotaFiscal[] = [
  { id: "1", numero: "NF-2025-001", cliente: "Luciana Souza", cpfCnpj: "123.456.789-00", data: "2025-02-08", valor: 5500, status: "emitida", pedido: "PV-2025-003", origem: "robo" },
  { id: "2", numero: "NF-2025-002", cliente: "Construtora ABC", cpfCnpj: "12.345.678/0001-90", data: "2025-02-07", valor: 18000, status: "emitida", pedido: "PV-2025-002", origem: "manual" },
  { id: "3", numero: "NF-2025-003", cliente: "Carlos Lima", cpfCnpj: "456.789.123-00", data: "2025-02-06", valor: 6700, status: "pendente", pedido: "PV-2025-001", origem: "robo" },
];

const statusColors: Record<string, string> = {
  emitida: "badge-success",
  cancelada: "bg-destructive/10 text-destructive",
  pendente: "badge-warm",
};

const NotaFiscal = () => {
  const [notas, setNotas] = useState<NotaFiscal[]>(mockNotas);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ cliente: "", cpfCnpj: "", pedido: "", valor: "" });

  const filtered = notas.filter(
    (n) => n.cliente.toLowerCase().includes(search.toLowerCase()) || n.numero.toLowerCase().includes(search.toLowerCase())
  );

  const handleEmit = () => {
    const newNota: NotaFiscal = {
      id: Date.now().toString(),
      numero: `NF-2025-${String(notas.length + 1).padStart(3, "0")}`,
      cliente: form.cliente,
      cpfCnpj: form.cpfCnpj,
      data: new Date().toISOString().split("T")[0],
      valor: Number(form.valor),
      status: "emitida",
      pedido: form.pedido,
      origem: "manual",
    };
    setNotas((prev) => [newNota, ...prev]);
    setDialogOpen(false);
    setForm({ cliente: "", cpfCnpj: "", pedido: "", valor: "" });
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Nota Fiscal</h1>
          <p className="page-description">Emissão e controle de notas fiscais</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Emitir NF
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Emitir Nota Fiscal</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Input value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CPF/CNPJ</Label>
                  <Input value={form.cpfCnpj} onChange={(e) => setForm({ ...form, cpfCnpj: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Pedido de Venda</Label>
                  <Input value={form.pedido} onChange={(e) => setForm({ ...form, pedido: e.target.value })} placeholder="PV-2025-XXX" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </div>
              <Button onClick={handleEmit} className="w-full">Emitir Nota Fiscal</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar notas fiscais..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="stat-card p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>CPF/CNPJ</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((n) => (
              <TableRow key={n.id}>
                <TableCell className="font-mono text-xs">{n.numero}</TableCell>
                <TableCell className="font-medium">{n.cliente}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{n.cpfCnpj}</TableCell>
                <TableCell className="font-mono text-xs text-primary">{n.pedido}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(n.data).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>
                  {n.origem === "robo" ? (
                    <span className="flex items-center gap-1 text-xs text-primary"><Bot className="h-3 w-3" /> Robô</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><User className="h-3 w-3" /> Manual</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${statusColors[n.status]}`}>
                    {n.status.charAt(0).toUpperCase() + n.status.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">R$ {n.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Nenhuma nota fiscal encontrada
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default NotaFiscal;
