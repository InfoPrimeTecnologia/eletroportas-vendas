import { useState } from "react";
import { Plus, Search, FileText, Bot, User, Package, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import EstoqueItemPicker, { ItemSelecionado } from "@/components/EstoqueItemPicker";

interface OrcamentoItem {
  produto_nome: string;
  codigo_sku: string;
  quantidade: number;
  preco_unitario: number;
}

interface Orcamento {
  id: string;
  numero: string;
  cliente: string;
  data: string;
  valor: number;
  status: "pendente" | "enviado" | "aceito" | "recusado";
  origem: "robo" | "manual";
  itens: OrcamentoItem[];
  observacoes?: string;
}

const mockOrcamentos: Orcamento[] = [
  { id: "1", numero: "ORC-2025-001", cliente: "João Silva", data: "2025-02-08", valor: 4500, status: "enviado", origem: "robo", itens: [{ produto_nome: "Motor Deslizante 1/3 HP", codigo_sku: "MOT-001", quantidade: 1, preco_unitario: 3200 }, { produto_nome: "Instalação", codigo_sku: "SRV-001", quantidade: 1, preco_unitario: 1300 }] },
  { id: "2", numero: "ORC-2025-002", cliente: "Construtora ABC", data: "2025-02-07", valor: 18000, status: "aceito", origem: "robo", itens: [{ produto_nome: "Portão Basculante 3x2.5m", codigo_sku: "PRT-002", quantidade: 2, preco_unitario: 7000 }, { produto_nome: "Motor Basculante", codigo_sku: "MOT-002", quantidade: 2, preco_unitario: 2000 }] },
  { id: "3", numero: "ORC-2025-003", cliente: "Maria Santos", data: "2025-02-06", valor: 3200, status: "pendente", origem: "manual", itens: [{ produto_nome: "Controle Remoto", codigo_sku: "CTR-001", quantidade: 5, preco_unitario: 120 }, { produto_nome: "Sensor Anti-Esmagamento", codigo_sku: "SEN-001", quantidade: 2, preco_unitario: 1300 }] },
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
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedOrc, setSelectedOrc] = useState<Orcamento | null>(null);
  const [form, setForm] = useState({ cliente: "", observacoes: "" });
  const [selectedItems, setSelectedItems] = useState<ItemSelecionado[]>([]);

  const filtered = orcamentos.filter(
    (o) => o.cliente.toLowerCase().includes(search.toLowerCase()) || o.numero.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    if (!form.cliente.trim() || selectedItems.length === 0) return;
    const total = selectedItems.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0);
    const newOrc: Orcamento = {
      id: Date.now().toString(),
      numero: `ORC-2025-${String(orcamentos.length + 1).padStart(3, "0")}`,
      cliente: form.cliente,
      data: new Date().toISOString().split("T")[0],
      valor: total,
      status: "pendente",
      origem: "manual",
      itens: selectedItems.map((i) => ({
        produto_nome: i.produto_nome,
        codigo_sku: i.codigo_sku,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
      })),
      observacoes: form.observacoes,
    };
    setOrcamentos((prev) => [newOrc, ...prev]);
    setDialogOpen(false);
    setForm({ cliente: "", observacoes: "" });
    setSelectedItems([]);
  };

  const openDetail = (orc: Orcamento) => {
    setSelectedOrc(orc);
    setDetailOpen(true);
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
            <Button><Plus className="h-4 w-4 mr-2" /> Novo Orçamento</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo Orçamento Manual</DialogTitle>
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
                Criar Orçamento
              </Button>
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
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => (
              <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(o)}>
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
                  <Badge variant="outline" className={`text-[10px] ${statusColors[o.status]}`}>{statusLabels[o.status]}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">R$ {o.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                <TableCell><Eye className="h-4 w-4 text-muted-foreground" /></TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Nenhum orçamento encontrado
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
              <FileText className="h-5 w-5" /> {selectedOrc?.numero}
            </DialogTitle>
          </DialogHeader>
          {selectedOrc && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Cliente</p>
                  <p className="font-medium">{selectedOrc.cliente}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Data</p>
                  <p className="font-medium">{new Date(selectedOrc.data).toLocaleDateString("pt-BR")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Origem</p>
                  <p className="font-medium">{selectedOrc.origem === "robo" ? "🤖 Robô" : "✋ Manual"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <Badge variant="outline" className={`text-[10px] ${statusColors[selectedOrc.status]}`}>{statusLabels[selectedOrc.status]}</Badge>
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
                    {selectedOrc.itens.map((item, idx) => (
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
                <span className="font-mono font-bold text-lg">R$ {selectedOrc.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>

              {selectedOrc.observacoes && (
                <div>
                  <p className="text-muted-foreground text-xs">Observações</p>
                  <p className="text-sm">{selectedOrc.observacoes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Orcamentos;
