import { useState } from "react";
import { Plus, Search, ShoppingCart, Bot, User, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import EstoqueItemPicker, { ItemSelecionado } from "@/components/EstoqueItemPicker";
import ClientePicker from "@/components/ClientePicker";
import { usePedidos, Pedido } from "@/hooks/usePedidos";

const statusColors: Record<string, string> = {
  processando: "bg-muted text-muted-foreground",
  aprovado: "badge-cold",
  em_producao: "badge-warm",
  entregue: "badge-success",
};
const statusLabels: Record<string, string> = {
  processando: "Processando", aprovado: "Aprovado", em_producao: "Em Produção", entregue: "Entregue",
};
const allStatuses = ["processando", "aprovado", "em_producao", "entregue"];

const Pedidos = () => {
  const { pedidos, isLoading, createPedido, updatePedido } = usePedidos();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPed, setSelectedPed] = useState<Pedido | null>(null);
  const [cliente, setCliente] = useState<{ cnpj: string; nome: string } | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const [selectedItems, setSelectedItems] = useState<ItemSelecionado[]>([]);

  const filtered = pedidos.filter(
    (p) => p.cliente_nome.toLowerCase().includes(search.toLowerCase()) || p.numero.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!cliente || selectedItems.length === 0) return;
    const total = selectedItems.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0);
    await createPedido.mutateAsync({
      cliente_nome: cliente.nome,
      cliente_cnpj: cliente.cnpj,
      valor_total: total,
      itens: selectedItems.map((i) => ({
        produto_nome: i.produto_nome, codigo_sku: i.codigo_sku,
        quantidade: i.quantidade, preco_unitario: i.preco_unitario,
      })),
      observacoes: observacoes || null,
    });
    setDialogOpen(false);
    setCliente(null);
    setObservacoes("");
    setSelectedItems([]);
  };

  const handleStatusChange = async (status: string) => {
    if (!selectedPed) return;
    await updatePedido.mutateAsync({ id: selectedPed.id, updates: { status } });
    setSelectedPed({ ...selectedPed, status });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

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
            <DialogHeader><DialogTitle>Novo Pedido de Venda</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Cliente *</Label>
                <ClientePicker value={cliente} onChange={setCliente} />
              </div>
              <div className="space-y-2">
                <Label>Itens do Estoque *</Label>
                <EstoqueItemPicker selectedItems={selectedItems} onChange={setSelectedItems} />
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Observações adicionais" />
              </div>
              <Button onClick={handleCreate} className="w-full" disabled={!cliente || selectedItems.length === 0 || createPedido.isPending}>
                {createPedido.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
              <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedPed(p); setDetailOpen(true); }}>
                <TableCell className="font-mono text-xs">{p.numero}</TableCell>
                <TableCell className="font-medium">{p.cliente_nome}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(p.data_criacao).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell>
                  {p.origem === "robo" ? (
                    <span className="flex items-center gap-1 text-xs text-primary"><Bot className="h-3 w-3" /> Robô</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><User className="h-3 w-3" /> Manual</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${statusColors[p.status] || ""}`}>{statusLabels[p.status] || p.status}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">R$ {p.valor_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
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
                <div><p className="text-muted-foreground text-xs">Cliente</p><p className="font-medium">{selectedPed.cliente_nome}</p></div>
                <div><p className="text-muted-foreground text-xs">CNPJ</p><p className="font-medium font-mono text-xs">{selectedPed.cliente_cnpj || "—"}</p></div>
                <div><p className="text-muted-foreground text-xs">Data</p><p className="font-medium">{new Date(selectedPed.data_criacao).toLocaleDateString("pt-BR")}</p></div>
                <div><p className="text-muted-foreground text-xs">Origem</p><p className="font-medium">{selectedPed.origem === "robo" ? "🤖 Robô" : "✋ Manual"}</p></div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={selectedPed.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allStatuses.map((s) => (
                      <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedPed.orcamento_id && (
                <div><p className="text-muted-foreground text-xs">Orçamento de origem</p><p className="text-sm font-mono">#{selectedPed.orcamento_id}</p></div>
              )}
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
                    {(selectedPed.itens as any[])?.map((item: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">
                          <p className="font-medium">{item.produto_nome}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{item.codigo_sku}</p>
                        </TableCell>
                        <TableCell className="text-xs text-center">{item.quantidade}</TableCell>
                        <TableCell className="text-xs text-right font-mono">R$ {Number(item.preco_unitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-xs text-right font-mono">R$ {(Number(item.preco_unitario) * Number(item.quantidade)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="font-semibold">Total</span>
                <span className="font-mono font-bold text-lg">R$ {selectedPed.valor_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
              {selectedPed.observacoes && (
                <div><p className="text-muted-foreground text-xs">Observações</p><p className="text-sm">{selectedPed.observacoes}</p></div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Pedidos;
