import { useState } from "react";
import { Plus, ArrowRight, User, Building2, Phone, Mail, DollarSign, Edit2, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

interface LeadItem {
  descricao: string;
  quantidade: number;
  valor_unitario: number;
}

interface LeadFunil {
  id: string;
  nome: string;
  empresa?: string;
  telefone?: string;
  email?: string;
  valor: number;
  etapa: string;
  origem: "robo" | "manual";
  itens: LeadItem[];
  observacoes?: string;
}

const etapas = [
  { key: "contato_inicial", label: "Contato Inicial", color: "bg-[hsl(var(--chart-cold))]" },
  { key: "orcamento_enviado", label: "Orçamento Enviado", color: "bg-[hsl(var(--chart-warm))]" },
  { key: "orcamento_aceito", label: "Orçamento Aceito", color: "bg-primary" },
  { key: "pedido_venda", label: "Pedido de Venda", color: "bg-[hsl(var(--info))]" },
  { key: "venda_finalizada", label: "Venda Finalizada", color: "bg-[hsl(var(--success))]" },
];

const initialLeads: LeadFunil[] = [
  { id: "1", nome: "João Silva", valor: 4500, etapa: "contato_inicial", origem: "robo", itens: [{ descricao: "Motor Deslizante 1/3 HP", quantidade: 1, valor_unitario: 3200 }, { descricao: "Instalação", quantidade: 1, valor_unitario: 1300 }] },
  { id: "2", nome: "Maria Santos", empresa: "Construtora XYZ", valor: 12000, etapa: "contato_inicial", origem: "robo", itens: [{ descricao: "Portão Deslizante 4m", quantidade: 2, valor_unitario: 5000 }, { descricao: "Motor", quantidade: 2, valor_unitario: 1000 }] },
  { id: "3", nome: "Pedro Costa", valor: 3200, etapa: "orcamento_enviado", origem: "robo", itens: [{ descricao: "Controle Remoto", quantidade: 5, valor_unitario: 120 }, { descricao: "Sensor Anti-Esmagamento", quantidade: 2, valor_unitario: 1300 }] },
  { id: "4", nome: "Ana Oliveira", empresa: "Imobiliária ABC", valor: 8900, etapa: "orcamento_enviado", origem: "manual", itens: [{ descricao: "Portão Basculante 3x2.5m", quantidade: 1, valor_unitario: 7000 }, { descricao: "Motor Basculante", quantidade: 1, valor_unitario: 1900 }] },
  { id: "5", nome: "Carlos Lima", valor: 6700, etapa: "orcamento_aceito", origem: "robo", itens: [{ descricao: "Motor Deslizante", quantidade: 1, valor_unitario: 3200 }, { descricao: "Cremalheira", quantidade: 3, valor_unitario: 1166.67 }] },
  { id: "6", nome: "Fernanda Dias", valor: 15000, etapa: "pedido_venda", origem: "robo", itens: [{ descricao: "Portão Deslizante personalizado", quantidade: 1, valor_unitario: 15000 }] },
  { id: "7", nome: "Roberto Alves", empresa: "Engenharia RS", valor: 22000, etapa: "pedido_venda", origem: "manual", itens: [{ descricao: "Portão Industrial 6m", quantidade: 1, valor_unitario: 18000 }, { descricao: "Automatização completa", quantidade: 1, valor_unitario: 4000 }] },
  { id: "8", nome: "Luciana Souza", valor: 5500, etapa: "venda_finalizada", origem: "robo", itens: [{ descricao: "Motor Deslizante", quantidade: 1, valor_unitario: 3500 }, { descricao: "Instalação + Acabamento", quantidade: 1, valor_unitario: 2000 }] },
];

const emptyLead: Omit<LeadFunil, "id"> = {
  nome: "",
  empresa: "",
  telefone: "",
  email: "",
  valor: 0,
  etapa: "contato_inicial",
  origem: "manual",
  itens: [],
  observacoes: "",
};

const Funil = () => {
  const [leads, setLeads] = useState<LeadFunil[]>(initialLeads);
  const [editLead, setEditLead] = useState<LeadFunil | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newLead, setNewLead] = useState(emptyLead);
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [newItemVal, setNewItemVal] = useState("");

  const handleDragEnd = (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;
    setLeads((prev) =>
      prev.map((l) => (l.id === draggableId ? { ...l, etapa: destination.droppableId } : l))
    );
  };

  const moveForward = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const idx = etapas.findIndex((et) => et.key === l.etapa);
        if (idx < etapas.length - 1) return { ...l, etapa: etapas[idx + 1].key };
        return l;
      })
    );
  };

  const openEdit = (lead: LeadFunil) => {
    setEditLead({ ...lead });
    setIsEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editLead) return;
    const totalItens = editLead.itens.reduce((s, i) => s + i.valor_unitario * i.quantidade, 0);
    setLeads((prev) =>
      prev.map((l) => (l.id === editLead.id ? { ...editLead, valor: totalItens > 0 ? totalItens : editLead.valor } : l))
    );
    setIsEditOpen(false);
  };

  const handleCreate = () => {
    if (!newLead.nome.trim()) return;
    const totalItens = newLead.itens.reduce((s, i) => s + i.valor_unitario * i.quantidade, 0);
    const id = Date.now().toString();
    setLeads((prev) => [...prev, { ...newLead, id, valor: totalItens > 0 ? totalItens : newLead.valor }]);
    setNewLead(emptyLead);
    setIsCreateOpen(false);
  };

  const addItemToEdit = () => {
    if (!newItemDesc.trim() || !editLead) return;
    setEditLead({
      ...editLead,
      itens: [...editLead.itens, { descricao: newItemDesc, quantidade: Number(newItemQty) || 1, valor_unitario: Number(newItemVal) || 0 }],
    });
    setNewItemDesc("");
    setNewItemQty("1");
    setNewItemVal("");
  };

  const addItemToNew = () => {
    if (!newItemDesc.trim()) return;
    setNewLead({
      ...newLead,
      itens: [...newLead.itens, { descricao: newItemDesc, quantidade: Number(newItemQty) || 1, valor_unitario: Number(newItemVal) || 0 }],
    });
    setNewItemDesc("");
    setNewItemQty("1");
    setNewItemVal("");
  };

  const removeEditItem = (idx: number) => {
    if (!editLead) return;
    setEditLead({ ...editLead, itens: editLead.itens.filter((_, i) => i !== idx) });
  };

  const removeNewItem = (idx: number) => {
    setNewLead({ ...newLead, itens: newLead.itens.filter((_, i) => i !== idx) });
  };

  const ItemAddRow = ({ onAdd }: { onAdd: () => void }) => (
    <div className="flex gap-2 items-end">
      <div className="flex-1 space-y-1">
        <Label className="text-xs">Descrição</Label>
        <Input className="h-8 text-xs" value={newItemDesc} onChange={(e) => setNewItemDesc(e.target.value)} placeholder="Ex: Motor Deslizante" />
      </div>
      <div className="w-16 space-y-1">
        <Label className="text-xs">Qtd</Label>
        <Input className="h-8 text-xs" type="number" value={newItemQty} onChange={(e) => setNewItemQty(e.target.value)} />
      </div>
      <div className="w-24 space-y-1">
        <Label className="text-xs">Valor (R$)</Label>
        <Input className="h-8 text-xs" type="number" value={newItemVal} onChange={(e) => setNewItemVal(e.target.value)} />
      </div>
      <Button type="button" size="sm" className="h-8" onClick={onAdd} disabled={!newItemDesc.trim()}>
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );

  const ItemsTable = ({ items, onRemove }: { items: LeadItem[]; onRemove?: (idx: number) => void }) => (
    items.length > 0 ? (
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Item</TableHead>
              <TableHead className="text-xs text-center">Qtd</TableHead>
              <TableHead className="text-xs text-right">Unit.</TableHead>
              <TableHead className="text-xs text-right">Subtotal</TableHead>
              {onRemove && <TableHead className="w-8"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, idx) => (
              <TableRow key={idx}>
                <TableCell className="text-xs font-medium">{item.descricao}</TableCell>
                <TableCell className="text-xs text-center">{item.quantidade}</TableCell>
                <TableCell className="text-xs text-right font-mono">R$ {item.valor_unitario.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                <TableCell className="text-xs text-right font-mono">R$ {(item.valor_unitario * item.quantidade).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                {onRemove && (
                  <TableCell>
                    <button onClick={() => onRemove(idx)} className="text-destructive hover:text-destructive/80 text-xs">✕</button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-between px-3 py-2 border-t text-sm font-semibold bg-muted/30">
          <span>Total</span>
          <span className="font-mono">R$ {items.reduce((s, i) => s + i.valor_unitario * i.quantidade, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
        </div>
      </div>
    ) : (
      <p className="text-xs text-muted-foreground text-center py-3 border rounded-md">Nenhum item adicionado</p>
    )
  );

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Funil de Vendas</h1>
          <p className="page-description">Acompanhe a jornada dos leads — arraste os cards entre as etapas</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Novo Lead
        </Button>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {etapas.map((etapa) => {
            const etapaLeads = leads.filter((l) => l.etapa === etapa.key);
            const total = etapaLeads.reduce((s, l) => s + l.valor, 0);
            return (
              <Droppable droppableId={etapa.key} key={etapa.key}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`funnel-stage transition-colors ${snapshot.isDraggingOver ? "ring-2 ring-primary/40 bg-primary/5" : ""}`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-2 h-2 rounded-full ${etapa.color}`} />
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{etapa.label}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      {etapaLeads.length} lead{etapaLeads.length !== 1 ? "s" : ""} · R$ {total.toLocaleString("pt-BR")}
                    </p>
                    <div className="space-y-2">
                      {etapaLeads.map((lead, index) => (
                        <Draggable draggableId={lead.id} index={index} key={lead.id}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              onClick={() => openEdit(lead)}
                              className={`bg-background rounded-lg p-3 border border-border shadow-sm hover:shadow-md transition-shadow group cursor-pointer select-none ${snap.isDragging ? "shadow-lg ring-2 ring-primary/30" : ""}`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{lead.nome}</p>
                                  {lead.empresa && <p className="text-xs text-muted-foreground truncate">{lead.empresa}</p>}
                                </div>
                                <Badge variant="outline" className={`text-[10px] shrink-0 ml-1 ${lead.origem === "robo" ? "badge-cold" : "badge-warm"}`}>
                                  {lead.origem === "robo" ? "🤖" : "✋"}
                                </Badge>
                              </div>
                              {/* Show items summary */}
                              {lead.itens.length > 0 && (
                                <div className="mt-1.5 space-y-0.5">
                                  {lead.itens.slice(0, 2).map((item, i) => (
                                    <p key={i} className="text-[10px] text-muted-foreground truncate">
                                      • {item.quantidade}x {item.descricao}
                                    </p>
                                  ))}
                                  {lead.itens.length > 2 && (
                                    <p className="text-[10px] text-muted-foreground">+{lead.itens.length - 2} mais</p>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-xs font-mono font-medium">
                                  R$ {lead.valor.toLocaleString("pt-BR")}
                                </span>
                                {etapa.key !== "venda_finalizada" && (
                                  <button
                                    onClick={(e) => moveForward(e, lead.id)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                                    title="Avançar etapa"
                                  >
                                    <ArrowRight className="h-3.5 w-3.5 text-primary" />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>

      {/* Edit dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Edit2 className="h-4 w-4" /> Editar Lead</DialogTitle>
          </DialogHeader>
          {editLead && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nome *</Label>
                  <Input className="h-8 text-sm" value={editLead.nome} onChange={(e) => setEditLead({ ...editLead, nome: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Empresa</Label>
                  <Input className="h-8 text-sm" value={editLead.empresa || ""} onChange={(e) => setEditLead({ ...editLead, empresa: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Telefone</Label>
                  <Input className="h-8 text-sm" value={editLead.telefone || ""} onChange={(e) => setEditLead({ ...editLead, telefone: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input className="h-8 text-sm" value={editLead.email || ""} onChange={(e) => setEditLead({ ...editLead, email: e.target.value })} />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Etapa</Label>
                <Select value={editLead.etapa} onValueChange={(v) => setEditLead({ ...editLead, etapa: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {etapas.map((e) => <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1"><Package className="h-3 w-3" /> Itens Negociados</Label>
                <ItemsTable items={editLead.itens} onRemove={removeEditItem} />
                <ItemAddRow onAdd={addItemToEdit} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Observações</Label>
                <Textarea className="text-sm" rows={2} value={editLead.observacoes || ""} onChange={(e) => setEditLead({ ...editLead, observacoes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nome *</Label>
                <Input className="h-8 text-sm" value={newLead.nome} onChange={(e) => setNewLead({ ...newLead, nome: e.target.value })} placeholder="Nome do lead" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Empresa</Label>
                <Input className="h-8 text-sm" value={newLead.empresa} onChange={(e) => setNewLead({ ...newLead, empresa: e.target.value })} placeholder="Opcional" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Telefone</Label>
                <Input className="h-8 text-sm" value={newLead.telefone} onChange={(e) => setNewLead({ ...newLead, telefone: e.target.value })} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input className="h-8 text-sm" value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })} placeholder="email@exemplo.com" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Etapa inicial</Label>
              <Select value={newLead.etapa} onValueChange={(v) => setNewLead({ ...newLead, etapa: v })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {etapas.map((e) => <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1"><Package className="h-3 w-3" /> Itens Negociados</Label>
              <ItemsTable items={newLead.itens} onRemove={removeNewItem} />
              <ItemAddRow onAdd={addItemToNew} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Observações</Label>
              <Textarea className="text-sm" rows={2} value={newLead.observacoes || ""} onChange={(e) => setNewLead({ ...newLead, observacoes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!newLead.nome.trim()}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Funil;
