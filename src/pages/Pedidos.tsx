import { useState } from "react";
import { Plus, Search, ShoppingCart, Bot, User, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import EstoqueItemPicker, { ItemSelecionado } from "@/components/EstoqueItemPicker";

interface PedidoItem {
  produto_nome: string;
  codigo_sku: string;
  quantidade: number;
  preco_unitario: number;
}

interface Pedido {
  id: string;
  numero: string;
  cliente: string;
  data: string;
  valor: number;
  status: "processando" | "aprovado" | "em_producao" | "entregue";
  origem: "robo" | "manual";
  itens: PedidoItem[];
  observacoes?: string;
}

const mockPedidos: Pedido[] = [
  { id: "1", numero: "PV-2025-001", cliente: "Carlos Lima", data: "2025-02-08", valor: 6700, status: "aprovado", origem: "robo", itens: [{ produto_nome: "Motor Deslizante", codigo_sku: "MOT-001", quantidade: 1, preco_unitario: 3200 }, { produto_nome: "Cremalheira", codigo_sku: "CRM-001", quantidade: 3, preco_unitario: 1166.67 }] },
  { id: "2", numero: "PV-2025-002", cliente: "Construtora ABC", data: "2025-02-07", valor: 18000, status: "em_producao", origem: "robo", itens: [{ produto_nome: "Portão Basculante", codigo_sku: "PRT-002", quantidade: 2, preco_unitario: 7000 }, { produto_nome: "Motor Basculante", codigo_sku: "MOT-002", quantidade: 2, preco_unitario: 2000 }] },
  { id: "3", numero: "PV-2025-003", cliente: "Fernanda Dias", data: "2025-02-06", valor: 15000, status: "entregue", origem: "manual", itens: [{ produto_nome: "Portão Deslizante personalizado", codigo_sku: "PRT-CUSTOM", quantidade: 1, preco_unitario: 15000 }] },
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
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPed, setSelectedPed] = useState<Pedido | null>(null);
  const [form, setForm] = useState({ cliente: "", observacoes: "" });
  const [selectedItems, setSelectedItems] = useState<ItemSelecionado[]>([]);

  const filtered = pedidos.filter(
    (p) => p.cliente.toLowerCase().includes(search.toLowerCase()) || p.numero.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    if (!form.cliente.trim() || selectedItems.length === 0) return;
    const total = selectedItems.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0);
    const newPedido: Pedido = {
      id: Date.now().toString(),
      numero: `PV-2025-${String(pedidos.length + 1).padStart(3, "0")}`,
      cliente: form.cliente,
      data: new Date().toISOString().split("T")[0],
      valor: total,
      status: "processando",
      origem: "manual",
      itens: selectedItems.map((i) => ({
        produto_nome: i.produto_nome,
        codigo_sku: i.codigo_sku,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
      })),
      observacoes: form.observacoes,
    };
    setPedidos((prev) => [newPedido, ...prev]);
    setDialogOpen(false);
    setForm({ cliente: "", observacoes: "" });
    setSelectedItems([]);
  };

  const openDetail = (ped: Pedido) => {
    setSelectedPed(ped);
    setDetailOpen(true);
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
            <Button><Plus className="h-4 w-4 mr-2" /> Novo Pedido</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo Pedido de Venda</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Cliente *</Label>
                <Input value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} placeholder="Nome do cliente" />
              </div>
              <div className="space-y-2">
                <Label>Itens do Estoque *</Label>
                <EstoqueItemPicker selectedItems={selectedItems} onChange={setSelectedItems} />
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder="Observações adicionais" />
              </div>
              <Button onClick={handleCreate} className="w-full" disabled={!form.cliente.trim() || selectedItems.length === 0}>
                Criar Pedido
              </Button>
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
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(p)}>
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
                  <Badge variant="outline" className={`text-[10px] ${statusColors[p.status]}`}>{statusLabels[p.status]}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">R$ {p.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                <TableCell><Eye className="h-4 w-4 text-muted-foreground" /></TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Nenhum pedido encontrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" /> {selectedPed?.numero}
            </DialogTitle>
          </DialogHeader>
          {selectedPed && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Cliente</p>
                  <p className="font-medium">{selectedPed.cliente}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Data</p>
                  <p className="font-medium">{new Date(selectedPed.data).toLocaleDateString("pt-BR")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Origem</p>
                  <p className="font-medium">{selectedPed.origem === "robo" ? "🤖 Robô" : "✋ Manual"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <Badge variant="outline" className={`text-[10px] ${statusColors[selectedPed.status]}`}>{statusLabels[selectedPed.status]}</Badge>
                </div>
              </div>

              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Produto</TableHead>
                      <TableHead className="text-xs text-center">Qtd</TableHead>
                      <TableHead className="text-xs text-right">Unit.</TableHead>
                      <TableHead className="text-xs text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPed.itens.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">
                          <p className="font-medium">{item.produto_nome}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{item.codigo_sku}</p>
                        </TableCell>
                        <TableCell className="text-xs text-center">{item.quantidade}</TableCell>
                        <TableCell className="text-xs text-right font-mono">R$ {item.preco_unitario.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-xs text-right font-mono">R$ {(item.preco_unitario * item.quantidade).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between items-center pt-2 border-t">
                <span className="font-semibold">Total</span>
                <span className="font-mono font-bold text-lg">R$ {selectedPed.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>

              {selectedPed.observacoes && (
                <div>
                  <p className="text-muted-foreground text-xs">Observações</p>
                  <p className="text-sm">{selectedPed.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Pedidos;
