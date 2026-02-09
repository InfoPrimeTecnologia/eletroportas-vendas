import { useState } from "react";
import { Plus, Search, Edit2, Trash2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ItemEstoque {
  id: string;
  nome: string;
  categoria: string;
  quantidade: number;
  preco: number;
  sku: string;
}

const mockEstoque: ItemEstoque[] = [
  { id: "1", nome: "Motor Deslizante 1/3 HP", categoria: "Motores", quantidade: 15, preco: 890.0, sku: "MOT-001" },
  { id: "2", nome: "Controle Remoto 433MHz", categoria: "Acessórios", quantidade: 120, preco: 45.0, sku: "CTR-001" },
  { id: "3", nome: "Cremalheira Nylon 1.5m", categoria: "Peças", quantidade: 80, preco: 32.0, sku: "CRM-001" },
  { id: "4", nome: "Portão Basculante 3x2.5m", categoria: "Portões", quantidade: 5, preco: 2800.0, sku: "PRT-001" },
  { id: "5", nome: "Sensor Anti-Esmagamento", categoria: "Segurança", quantidade: 45, preco: 78.0, sku: "SEN-001" },
  { id: "6", nome: "Central Eletrônica PPA", categoria: "Eletrônica", quantidade: 22, preco: 320.0, sku: "CEN-001" },
];

const Estoque = () => {
  const [items, setItems] = useState<ItemEstoque[]>(mockEstoque);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemEstoque | null>(null);
  const [form, setForm] = useState({ nome: "", categoria: "", quantidade: "", preco: "", sku: "" });

  const filtered = items.filter(
    (i) =>
      i.nome.toLowerCase().includes(search.toLowerCase()) ||
      i.sku.toLowerCase().includes(search.toLowerCase()) ||
      i.categoria.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = () => {
    if (editingItem) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === editingItem.id
            ? { ...i, nome: form.nome, categoria: form.categoria, quantidade: Number(form.quantidade), preco: Number(form.preco), sku: form.sku }
            : i
        )
      );
    } else {
      setItems((prev) => [
        ...prev,
        { id: Date.now().toString(), nome: form.nome, categoria: form.categoria, quantidade: Number(form.quantidade), preco: Number(form.preco), sku: form.sku },
      ]);
    }
    setDialogOpen(false);
    setEditingItem(null);
    setForm({ nome: "", categoria: "", quantidade: "", preco: "", sku: "" });
  };

  const handleEdit = (item: ItemEstoque) => {
    setEditingItem(item);
    setForm({ nome: item.nome, categoria: item.categoria, quantidade: String(item.quantidade), preco: String(item.preco), sku: item.sku });
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const openNew = () => {
    setEditingItem(null);
    setForm({ nome: "", categoria: "", quantidade: "", preco: "", sku: "" });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Estoque</h1>
          <p className="page-description">Gerencie os produtos e materiais disponíveis</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> Novo Item
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? "Editar Item" : "Novo Item"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>SKU</Label>
                  <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quantidade</Label>
                  <Input type="number" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Preço (R$)</Label>
                  <Input type="number" step="0.01" value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} />
                </div>
              </div>
              <Button onClick={handleSave} className="w-full">
                {editingItem ? "Salvar Alterações" : "Adicionar Item"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, SKU ou categoria..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="stat-card p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{item.sku}</TableCell>
                <TableCell className="font-medium">{item.nome}</TableCell>
                <TableCell>
                  <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">{item.categoria}</span>
                </TableCell>
                <TableCell className="text-right">{item.quantidade}</TableCell>
                <TableCell className="text-right font-mono">R$ {item.preco.toFixed(2)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Nenhum item encontrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Estoque;
