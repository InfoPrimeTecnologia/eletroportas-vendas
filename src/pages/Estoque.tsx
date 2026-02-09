import { useState } from "react";
import { Plus, Search, Edit2, Trash2, Package, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEstoque } from "@/hooks/useEstoque";
import { Estoque as EstoqueType } from "@/types/database";

const Estoque = () => {
  const { items, isLoading, createItem, updateItem, deleteItem } = useEstoque();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EstoqueType | null>(null);
  const [form, setForm] = useState({
    produto_nome: "",
    tipo_laminas: "",
    descricao: "",
    codigo_sku: "",
    quantidade: "",
    quantidade_minima: "5",
    preco_custo: "",
    preco_venda: "",
    unidade_medida: "unidade",
    fornecedor: "",
  });

  const filtered = items.filter(
    (i) =>
      i.produto_nome.toLowerCase().includes(search.toLowerCase()) ||
      i.codigo_sku.toLowerCase().includes(search.toLowerCase()) ||
      i.tipo_laminas.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    const payload = {
      produto_nome: form.produto_nome,
      tipo_laminas: form.tipo_laminas,
      descricao: form.descricao || null,
      codigo_sku: form.codigo_sku,
      quantidade: Number(form.quantidade) || 0,
      quantidade_minima: Number(form.quantidade_minima) || 5,
      preco_custo: Number(form.preco_custo) || 0,
      preco_venda: Number(form.preco_venda) || 0,
      unidade_medida: form.unidade_medida || "unidade",
      fornecedor: form.fornecedor || null,
    };

    if (editingItem) {
      await updateItem.mutateAsync({ id: editingItem.id, updates: payload });
    } else {
      await createItem.mutateAsync(payload);
    }
    setDialogOpen(false);
    setEditingItem(null);
    resetForm();
  };

  const handleEdit = (item: EstoqueType) => {
    setEditingItem(item);
    setForm({
      produto_nome: item.produto_nome,
      tipo_laminas: item.tipo_laminas,
      descricao: item.descricao || "",
      codigo_sku: item.codigo_sku,
      quantidade: String(item.quantidade),
      quantidade_minima: String(item.quantidade_minima),
      preco_custo: String(item.preco_custo),
      preco_venda: String(item.preco_venda),
      unidade_medida: item.unidade_medida || "unidade",
      fornecedor: item.fornecedor || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    await deleteItem.mutateAsync(id);
  };

  const resetForm = () => {
    setForm({
      produto_nome: "",
      tipo_laminas: "",
      descricao: "",
      codigo_sku: "",
      quantidade: "",
      quantidade_minima: "5",
      preco_custo: "",
      preco_venda: "",
      unidade_medida: "unidade",
      fornecedor: "",
    });
  };

  const openNew = () => {
    setEditingItem(null);
    resetForm();
    setDialogOpen(true);
  };

  const isSaving = createItem.isPending || updateItem.isPending;
  const isFormValid = form.produto_nome && form.tipo_laminas && form.codigo_sku && form.preco_custo && form.preco_venda;

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
          <h1 className="page-title">Estoque</h1>
          <p className="page-description">Gerencie os produtos e materiais disponíveis</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> Novo Item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Editar Item" : "Novo Item"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2 max-h-[70vh] overflow-y-auto pr-2">
              <div className="space-y-2">
                <Label>Nome do Produto *</Label>
                <Input
                  value={form.produto_nome}
                  onChange={(e) => setForm({ ...form, produto_nome: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>SKU *</Label>
                  <Input
                    value={form.codigo_sku}
                    onChange={(e) => setForm({ ...form, codigo_sku: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo/Categoria *</Label>
                  <Input
                    value={form.tipo_laminas}
                    onChange={(e) => setForm({ ...form, tipo_laminas: e.target.value })}
                    placeholder="Ex: Lâminas, Motores, Peças"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Quantidade</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.quantidade}
                    onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Qtd Mínima</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.quantidade_minima}
                    onChange={(e) => setForm({ ...form, quantidade_minima: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unidade</Label>
                  <Input
                    value={form.unidade_medida}
                    onChange={(e) => setForm({ ...form, unidade_medida: e.target.value })}
                    placeholder="unidade, m, kg..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Preço de Custo (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.preco_custo}
                    onChange={(e) => setForm({ ...form, preco_custo: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Preço de Venda (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.preco_venda}
                    onChange={(e) => setForm({ ...form, preco_venda: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <Input
                  value={form.fornecedor}
                  onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                />
              </div>
              <Button
                onClick={handleSave}
                className="w-full"
                disabled={isSaving || !isFormValid}
              >
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingItem ? "Salvar Alterações" : "Adicionar Item"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, SKU ou tipo..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="stat-card p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Custo</TableHead>
              <TableHead className="text-right">Venda</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => {
              const isLowStock = item.quantidade <= item.quantidade_minima;
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.codigo_sku}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {item.produto_nome}
                      {isLowStock && (
                        <span title="Estoque baixo">
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                      {item.tipo_laminas}
                    </span>
                  </TableCell>
                  <TableCell className={`text-right ${isLowStock ? "text-destructive font-semibold" : ""}`}>
                    {item.quantidade}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    R$ {Number(item.preco_custo).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    R$ {Number(item.preco_venda).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(item.id)}
                        className="text-destructive"
                        disabled={deleteItem.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
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
