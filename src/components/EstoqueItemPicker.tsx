import { useState } from "react";
import { Plus, Minus, Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEstoque } from "@/hooks/useEstoque";
import { Estoque } from "@/types/database";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface ItemSelecionado {
  id: number;
  produto_nome: string;
  codigo_sku: string;
  preco_unitario: number;
  quantidade: number;
}

interface EstoqueItemPickerProps {
  selectedItems: ItemSelecionado[];
  onChange: (items: ItemSelecionado[]) => void;
}

const EstoqueItemPicker = ({ selectedItems, onChange }: EstoqueItemPickerProps) => {
  const { items, isLoading } = useEstoque();
  const [search, setSearch] = useState("");

  const filtered = items.filter(
    (i) =>
      i.produto_nome.toLowerCase().includes(search.toLowerCase()) ||
      i.codigo_sku.toLowerCase().includes(search.toLowerCase())
  );

  const addItem = (item: Estoque) => {
    const exists = selectedItems.find((s) => s.id === item.id);
    if (exists) {
      onChange(
        selectedItems.map((s) =>
          s.id === item.id ? { ...s, quantidade: s.quantidade + 1 } : s
        )
      );
    } else {
      onChange([
        ...selectedItems,
        {
          id: item.id,
          produto_nome: item.produto_nome,
          codigo_sku: item.codigo_sku,
          preco_unitario: item.preco_venda,
          quantidade: 1,
        },
      ]);
    }
  };

  const updateQty = (id: number, delta: number) => {
    onChange(
      selectedItems
        .map((s) => (s.id === id ? { ...s, quantidade: s.quantidade + delta } : s))
        .filter((s) => s.quantidade > 0)
    );
  };

  const removeItem = (id: number) => {
    onChange(selectedItems.filter((s) => s.id !== id));
  };

  const total = selectedItems.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0);

  return (
    <div className="space-y-3">
      <Input
        placeholder="Buscar produto no estoque..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8 text-sm"
      />

      {/* Available items */}
      <ScrollArea className="h-36 border rounded-md">
        <div className="p-2 space-y-1">
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">Carregando estoque...</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum item encontrado</p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addItem(item)}
                className="w-full flex items-center justify-between p-2 rounded hover:bg-muted text-left text-sm transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate text-xs">{item.produto_nome}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{item.codigo_sku} · Estoque: {item.quantidade}</p>
                </div>
                <span className="text-xs font-mono shrink-0 ml-2">
                  R$ {item.preco_venda.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </button>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Selected items */}
      {selectedItems.length > 0 && (
        <div className="border rounded-md p-2 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Package className="h-3 w-3" /> Itens selecionados
          </p>
          {selectedItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between text-sm">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{item.produto_nome}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQty(item.id, -1)}>
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="text-xs font-mono w-6 text-center">{item.quantidade}</span>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQty(item.id, 1)}>
                  <Plus className="h-3 w-3" />
                </Button>
                <span className="text-[10px] font-mono text-muted-foreground w-20 text-right">
                  R$ {(item.preco_unitario * item.quantidade).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItem(item.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
          <div className="border-t pt-2 flex justify-between text-sm font-semibold">
            <span>Total</span>
            <span className="font-mono">R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EstoqueItemPicker;
