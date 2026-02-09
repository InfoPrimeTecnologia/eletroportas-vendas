import { useState } from "react";
import { Plus, ArrowRight, User, Building2, Phone, Mail, DollarSign, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

interface LeadFunil {
  id: string;
  nome: string;
  empresa?: string;
  telefone?: string;
  email?: string;
  valor: number;
  etapa: string;
  origem: "robo" | "manual";
}

const etapas = [
  { key: "contato_inicial", label: "Contato Inicial", color: "bg-[hsl(var(--chart-cold))]" },
  { key: "orcamento_enviado", label: "Orçamento Enviado", color: "bg-[hsl(var(--chart-warm))]" },
  { key: "orcamento_aceito", label: "Orçamento Aceito", color: "bg-primary" },
  { key: "pedido_venda", label: "Pedido de Venda", color: "bg-[hsl(var(--info))]" },
  { key: "venda_finalizada", label: "Venda Finalizada", color: "bg-[hsl(var(--success))]" },
];

const initialLeads: LeadFunil[] = [
  { id: "1", nome: "João Silva", valor: 4500, etapa: "contato_inicial", origem: "robo" },
  { id: "2", nome: "Maria Santos", empresa: "Construtora XYZ", valor: 12000, etapa: "contato_inicial", origem: "robo" },
  { id: "3", nome: "Pedro Costa", valor: 3200, etapa: "orcamento_enviado", origem: "robo" },
  { id: "4", nome: "Ana Oliveira", empresa: "Imobiliária ABC", valor: 8900, etapa: "orcamento_enviado", origem: "manual" },
  { id: "5", nome: "Carlos Lima", valor: 6700, etapa: "orcamento_aceito", origem: "robo" },
  { id: "6", nome: "Fernanda Dias", valor: 15000, etapa: "pedido_venda", origem: "robo" },
  { id: "7", nome: "Roberto Alves", empresa: "Engenharia RS", valor: 22000, etapa: "pedido_venda", origem: "manual" },
  { id: "8", nome: "Luciana Souza", valor: 5500, etapa: "venda_finalizada", origem: "robo" },
];

const emptyLead: Omit<LeadFunil, "id"> = {
  nome: "",
  empresa: "",
  telefone: "",
  email: "",
  valor: 0,
  etapa: "contato_inicial",
  origem: "manual",
};

const Funil = () => {
  const [leads, setLeads] = useState<LeadFunil[]>(initialLeads);
  const [selectedLead, setSelectedLead] = useState<LeadFunil | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newLead, setNewLead] = useState(emptyLead);

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

  const openDetail = (lead: LeadFunil) => {
    setSelectedLead(lead);
    setIsDetailOpen(true);
  };

  const handleCreate = () => {
    if (!newLead.nome.trim()) return;
    const id = Date.now().toString();
    setLeads((prev) => [...prev, { ...newLead, id }]);
    setNewLead(emptyLead);
    setIsCreateOpen(false);
  };

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
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {etapa.label}
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      {etapaLeads.length} lead{etapaLeads.length !== 1 ? "s" : ""} · R${" "}
                      {total.toLocaleString("pt-BR")}
                    </p>
                    <div className="space-y-2">
                      {etapaLeads.map((lead, index) => (
                        <Draggable draggableId={lead.id} index={index} key={lead.id}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              onClick={() => openDetail(lead)}
                              className={`bg-background rounded-lg p-3 border border-border shadow-sm hover:shadow-md transition-shadow group cursor-pointer select-none ${snap.isDragging ? "shadow-lg ring-2 ring-primary/30" : ""}`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{lead.nome}</p>
                                  {lead.empresa && (
                                    <p className="text-xs text-muted-foreground truncate">{lead.empresa}</p>
                                  )}
                                </div>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] shrink-0 ml-1 ${lead.origem === "robo" ? "badge-cold" : "badge-warm"}`}
                                >
                                  {lead.origem === "robo" ? "🤖 Robô" : "✋ Manual"}
                                </Badge>
                              </div>
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

      {/* Detail dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes do Lead</DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{selectedLead.nome}</p>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${selectedLead.origem === "robo" ? "badge-cold" : "badge-warm"}`}
                  >
                    {selectedLead.origem === "robo" ? "🤖 Robô" : "✋ Manual"}
                  </Badge>
                </div>
              </div>
              <div className="grid gap-3 text-sm">
                {selectedLead.empresa && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    <span>{selectedLead.empresa}</span>
                  </div>
                )}
                {selectedLead.telefone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{selectedLead.telefone}</span>
                  </div>
                )}
                {selectedLead.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span>{selectedLead.email}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono font-semibold">
                    R$ {selectedLead.valor.toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-xs uppercase tracking-wider font-semibold">Etapa:</span>
                  <span>{etapas.find((e) => e.key === selectedLead.etapa)?.label}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Lead</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Nome *</Label>
              <Input value={newLead.nome} onChange={(e) => setNewLead((p) => ({ ...p, nome: e.target.value }))} placeholder="Nome do lead" />
            </div>
            <div className="grid gap-2">
              <Label>Empresa</Label>
              <Input value={newLead.empresa} onChange={(e) => setNewLead((p) => ({ ...p, empresa: e.target.value }))} placeholder="Empresa (opcional)" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Telefone</Label>
                <Input value={newLead.telefone} onChange={(e) => setNewLead((p) => ({ ...p, telefone: e.target.value }))} placeholder="(00) 00000-0000" />
              </div>
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input value={newLead.email} onChange={(e) => setNewLead((p) => ({ ...p, email: e.target.value }))} placeholder="email@exemplo.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Valor (R$)</Label>
                <Input type="number" value={newLead.valor || ""} onChange={(e) => setNewLead((p) => ({ ...p, valor: Number(e.target.value) }))} placeholder="0,00" />
              </div>
              <div className="grid gap-2">
                <Label>Etapa inicial</Label>
                <Select value={newLead.etapa} onValueChange={(v) => setNewLead((p) => ({ ...p, etapa: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {etapas.map((e) => (
                      <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
