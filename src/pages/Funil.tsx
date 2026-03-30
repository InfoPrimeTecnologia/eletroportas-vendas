import { useState, useEffect, useCallback } from "react";
import { Plus, ArrowRight, User, Building2, Phone, Mail, DollarSign, Edit2, Package, Trash2, GripVertical, Settings, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
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

interface Etapa {
  key: string;
  label: string;
  color: string;
}

const defaultColors = [
  "bg-[hsl(var(--chart-cold))]",
  "bg-[hsl(var(--chart-warm))]",
  "bg-primary",
  "bg-[hsl(var(--info))]",
  "bg-[hsl(var(--success))]",
  "bg-destructive",
  "bg-[hsl(var(--accent))]",
];

const defaultEtapas: Etapa[] = [
  { key: "acompanhamento", label: "Acompanhamento", color: "bg-[hsl(var(--chart-warm))]" },
  { key: "contato_inicial", label: "Contato Inicial", color: "bg-[hsl(var(--chart-cold))]" },
  { key: "orcamento_enviado", label: "Orçamento Enviado", color: "bg-primary" },
  { key: "orcamento_aceito", label: "Orçamento Aceito", color: "bg-[hsl(var(--info))]" },
  { key: "pedido_venda", label: "Pedido de Venda", color: "bg-[hsl(var(--success))]" },
  { key: "venda_finalizada", label: "Venda Finalizada", color: "bg-destructive" },
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
  const [etapas, setEtapas] = useState<Etapa[]>(defaultEtapas);
  const [leads, setLeads] = useState<LeadFunil[]>(initialLeads);
  const [editLead, setEditLead] = useState<LeadFunil | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newLead, setNewLead] = useState(emptyLead);
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [newItemVal, setNewItemVal] = useState("");

  // Auto-sync: fetch pending orcamentos AND pedidos into "acompanhamento"
  const syncPendentes = useCallback(async () => {
    try {
      const [orcRes, pedRes] = await Promise.all([
        supabase.from('orcamentos').select('*').ilike('status', '%pendente%'),
        supabase.from('pedidos_venda').select('*').ilike('status', '%pendente%'),
      ]);

      setLeads((prev) => {
        const newLeads = [...prev];

        // Sync orçamentos pendentes
        if (orcRes.data) {
          for (const orc of orcRes.data) {
            const leadId = `orc-${orc.id}`;
            if (newLeads.some((l) => l.id === leadId)) continue;
            const itens = Array.isArray(orc.itens) ? (orc.itens as any[]).map((i: any) => ({
              descricao: i.produto_nome || i.descricao || 'Item',
              quantidade: i.quantidade || 1,
              valor_unitario: i.preco_unitario || i.valor_unitario || 0,
            })) : [];
            newLeads.push({
              id: leadId,
              nome: orc.cliente_nome || 'Cliente',
              empresa: orc.cliente_cnpj || undefined,
              valor: orc.valor_total || 0,
              etapa: "acompanhamento",
              origem: "robo",
              itens,
              observacoes: `Orçamento ${orc.numero} - Status: ${orc.status}`,
            });
          }
        }

        // Sync pedidos pendentes
        if (pedRes.data) {
          for (const pedido of pedRes.data) {
            const leadId = `pedido-${pedido.id}`;
            if (newLeads.some((l) => l.id === leadId)) continue;
            const itens = Array.isArray(pedido.itens) ? (pedido.itens as any[]).map((i: any) => ({
              descricao: i.produto_nome || i.descricao || 'Item',
              quantidade: i.quantidade || 1,
              valor_unitario: i.preco_unitario || i.valor_unitario || 0,
            })) : [];
            newLeads.push({
              id: leadId,
              nome: pedido.cliente_nome || 'Cliente',
              empresa: pedido.cliente_cnpj || undefined,
              valor: pedido.valor_total || 0,
              etapa: "acompanhamento",
              origem: "robo",
              itens,
              observacoes: `Pedido ${pedido.numero} - Status: ${pedido.status}`,
            });
          }
        }

        return newLeads;
      });
    } catch (err) {
      console.error('Erro ao sincronizar pendentes:', err);
    }
  }, []);

  useEffect(() => {
    syncPendentes();
  }, [syncPendentes]);

  // Stage management state
  const [isStageManagerOpen, setIsStageManagerOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<Etapa | null>(null);
  const [isStageFormOpen, setIsStageFormOpen] = useState(false);
  const [stageForm, setStageForm] = useState({ label: "", color: defaultColors[0] });

  // ---- Drag & Drop for LEADS between stages ----
  const handleLeadDragEnd = (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;
    setLeads((prev) =>
      prev.map((l) => (l.id === draggableId ? { ...l, etapa: destination.droppableId } : l))
    );
  };

  // ---- Drag & Drop for STAGES reorder ----
  const handleStageDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = [...etapas];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setEtapas(reordered);
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

  // ---- Stage CRUD ----
  const openCreateStage = () => {
    setEditingStage(null);
    setStageForm({ label: "", color: defaultColors[etapas.length % defaultColors.length] });
    setIsStageFormOpen(true);
  };

  const openEditStage = (stage: Etapa) => {
    setEditingStage(stage);
    setStageForm({ label: stage.label, color: stage.color });
    setIsStageFormOpen(true);
  };

  const handleSaveStage = () => {
    if (!stageForm.label.trim()) return;
    if (editingStage) {
      setEtapas((prev) =>
        prev.map((s) => (s.key === editingStage.key ? { ...s, label: stageForm.label, color: stageForm.color } : s))
      );
    } else {
      const key = stageForm.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") + "_" + Date.now();
      setEtapas((prev) => [...prev, { key, label: stageForm.label, color: stageForm.color }]);
    }
    setIsStageFormOpen(false);
  };

  const handleDeleteStage = (key: string) => {
    const hasLeads = leads.some((l) => l.etapa === key);
    if (hasLeads) {
      const firstAvailable = etapas.find((e) => e.key !== key);
      if (firstAvailable) {
        setLeads((prev) => prev.map((l) => (l.etapa === key ? { ...l, etapa: firstAvailable.key } : l)));
      }
    }
    setEtapas((prev) => prev.filter((e) => e.key !== key));
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={syncPedidosPendentes} title="Sincronizar pedidos pendentes">
            <RefreshCw className="h-4 w-4 mr-1" /> Sincronizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsStageManagerOpen(true)}>
            <Settings className="h-4 w-4 mr-1" /> Etapas
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Novo Lead
          </Button>
        </div>
      </div>

      <DragDropContext onDragEnd={handleLeadDragEnd}>
        <div className={`grid grid-cols-1 gap-4`} style={{ gridTemplateColumns: `repeat(${Math.min(etapas.length, 6)}, minmax(0, 1fr))` }}>
          {etapas.map((etapa) => {
            const etapaLeads = leads.filter((l) => l.etapa === etapa.key);
            const total = etapaLeads.reduce((s, l) => s + l.valor, 0);
            return (
              <Droppable droppableId={etapa.key} key={etapa.key}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`funnel-stage transition-colors min-h-[200px] ${snapshot.isDraggingOver ? "ring-2 ring-primary/40 bg-primary/5" : ""}`}
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
                                {etapa.key !== etapas[etapas.length - 1]?.key && (
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

      {/* Stage Manager Dialog */}
      <Dialog open={isStageManagerOpen} onOpenChange={setIsStageManagerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Settings className="h-4 w-4" /> Gerenciar Etapas</DialogTitle>
            <DialogDescription>Crie, edite, reordene ou exclua as etapas do funil. Arraste para reordenar.</DialogDescription>
          </DialogHeader>
          <DragDropContext onDragEnd={handleStageDragEnd}>
            <Droppable droppableId="stages-list">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {etapas.map((etapa, index) => (
                    <Draggable draggableId={`stage-${etapa.key}`} index={index} key={etapa.key}>
                      {(prov, snap) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          className={`flex items-center gap-2 p-2 rounded-md border bg-background ${snap.isDragging ? "shadow-lg ring-2 ring-primary/30" : ""}`}
                        >
                          <div {...prov.dragHandleProps} className="cursor-grab p-1">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className={`w-3 h-3 rounded-full shrink-0 ${etapa.color}`} />
                          <span className="text-sm flex-1 truncate">{etapa.label}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditStage(etapa)}>
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDeleteStage(etapa.key)}
                            disabled={etapas.length <= 1}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
          <Button variant="outline" className="w-full" onClick={openCreateStage}>
            <Plus className="h-4 w-4 mr-1" /> Nova Etapa
          </Button>
        </DialogContent>
      </Dialog>

      {/* Stage Create/Edit Form */}
      <Dialog open={isStageFormOpen} onOpenChange={setIsStageFormOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingStage ? "Editar Etapa" : "Nova Etapa"}</DialogTitle>
            <DialogDescription>Defina o nome e a cor da etapa do funil.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Nome da Etapa *</Label>
              <Input value={stageForm.label} onChange={(e) => setStageForm({ ...stageForm, label: e.target.value })} placeholder="Ex: Negociação" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cor</Label>
              <div className="flex gap-2 flex-wrap">
                {defaultColors.map((c) => (
                  <button
                    key={c}
                    onClick={() => setStageForm({ ...stageForm, color: c })}
                    className={`w-7 h-7 rounded-full ${c} border-2 transition-all ${stageForm.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStageFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveStage} disabled={!stageForm.label.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Lead dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Edit2 className="h-4 w-4" /> Editar Lead</DialogTitle>
            <DialogDescription>Edite as informações do lead e os itens negociados.</DialogDescription>
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

      {/* Create Lead dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Lead</DialogTitle>
            <DialogDescription>Adicione um novo lead ao funil de vendas.</DialogDescription>
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
