import { useState, useEffect, useCallback } from "react";
import { Plus, ArrowRight, User, Building2, Phone, Mail, DollarSign, Edit2, Package, Trash2, GripVertical, Settings, RefreshCw, Loader2, Paperclip, FileText, X, Download, Eye } from "lucide-react";
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
import { toast } from "sonner";

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
  origem: string;
  itens: LeadItem[];
  observacoes?: string;
  anexo_pdf?: string;
}

interface Etapa {
  key: string;
  label: string;
  color: string;
  ordem: number;
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

const emptyLead: Omit<LeadFunil, "id"> = {
  nome: "",
  empresa: "",
  telefone: "",
  email: "",
  valor: 0,
  etapa: "",
  origem: "manual",
  itens: [],
  observacoes: "",
  anexo_pdf: "",
};

const Funil = () => {
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [leads, setLeads] = useState<LeadFunil[]>([]);
  const [loading, setLoading] = useState(true);
  const [editLead, setEditLead] = useState<LeadFunil | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newLead, setNewLead] = useState(emptyLead);
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [newItemVal, setNewItemVal] = useState("");

  // PDF viewer state
  const [pdfViewerData, setPdfViewerData] = useState<string | null>(null);
  const [isPdfViewerOpen, setIsPdfViewerOpen] = useState(false);

  const handleDownloadPdf = (base64Data: string, filename: string) => {
    try {
      const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const byteCharacters = atob(base64Content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Erro ao baixar PDF");
    }
  };

  const handleViewPdf = (base64Data: string) => {
    try {
      const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const byteCharacters = atob(base64Content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfViewerData(url);
      setIsPdfViewerOpen(true);
    } catch {
      toast.error("Erro ao visualizar PDF");
    }
  };

  // Stage management state
  const [isStageManagerOpen, setIsStageManagerOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<Etapa | null>(null);
  const [isStageFormOpen, setIsStageFormOpen] = useState(false);
  const [stageForm, setStageForm] = useState({ label: "", color: defaultColors[0] });

  // ---- Fetch etapas from Supabase ----
  const fetchEtapas = useCallback(async () => {
    const { data, error } = await (supabase as any).from('funil_etapas').select('*').order('ordem', { ascending: true });
    if (error) {
      console.error('Erro ao buscar etapas:', error);
      return;
    }
    setEtapas((data || []).map((e: any) => ({ key: e.key, label: e.label, color: e.color, ordem: e.ordem })));
  }, []);

  // ---- Fetch leads from Supabase (enriched with Clientes data) ----
  const fetchLeads = useCallback(async () => {
    const { data, error } = await (supabase as any).from('funil_leads').select('*').order('created_at', { ascending: true });
    if (error) {
      console.error('Erro ao buscar leads:', error);
      return;
    }
    const rawLeads = (data || []).map((l: any) => ({
      id: l.id,
      nome: l.nome,
      empresa: l.empresa || undefined,
      telefone: l.telefone || undefined,
      email: l.email || undefined,
      valor: Number(l.valor) || 0,
      etapa: l.etapa_key || '',
      origem: l.origem || 'manual',
      itens: Array.isArray(l.itens) ? l.itens : [],
      observacoes: l.observacoes || undefined,
      anexo_pdf: l.anexo_pdf || undefined,
    }));

    // Enrich leads with Clientes data using telefone
    const phones = rawLeads.map((l: LeadFunil) => l.telefone).filter(Boolean) as string[];
    if (phones.length > 0) {
      const uniquePhones = [...new Set(phones)];
      const { data: clientes } = await supabase
        .from('Clientes')
        .select('CLI_FONE, CLI_NOME, CLI_EMAIL, CLI_CNPJ')
        .in('CLI_FONE', uniquePhones);
      
      if (clientes && clientes.length > 0) {
        const clienteMap = new Map(clientes.map((c: any) => [c.CLI_FONE, c]));
        for (const lead of rawLeads) {
          if (lead.telefone && clienteMap.has(lead.telefone)) {
            const cliente = clienteMap.get(lead.telefone)!;
            lead.nome = cliente.CLI_NOME || lead.nome;
            lead.email = cliente.CLI_EMAIL || lead.email;
            lead.empresa = cliente.CLI_CNPJ || lead.empresa;
          }
        }
      }
    }

    setLeads(rawLeads);
  }, []);

  // ---- Initial load ----
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchEtapas(), fetchLeads()]);
      setLoading(false);
    };
    load();
  }, [fetchEtapas, fetchLeads]);

  // ---- Auto-sync pendentes ----
  const syncPendentes = useCallback(async () => {
    try {
      const [orcRes, pedRes] = await Promise.all([
        supabase.from('orcamentos').select('*').ilike('status', '%pendente%'),
        supabase.from('pedidos_venda').select('*').ilike('status', '%pendente%'),
      ]);

      const existingLeads = await (supabase as any).from('funil_leads').select('id');
      const existingIds = new Set((existingLeads.data || []).map((l: any) => l.id));

      const newLeadsToInsert: any[] = [];

      if (orcRes.data) {
        for (const orc of orcRes.data) {
          const leadId = `orc-${orc.id}`;
          if (existingIds.has(leadId)) continue;
          const itens = Array.isArray(orc.itens) ? (orc.itens as any[]).map((i: any) => ({
            descricao: i.produto_nome || i.descricao || 'Item',
            quantidade: i.quantidade || 1,
            valor_unitario: i.preco_unitario || i.valor_unitario || 0,
          })) : [];

          // Fetch client data from Clientes table by phone
          let clienteNome = orc.cliente_nome || 'Cliente';
          let clienteEmail: string | null = null;
          if (orc.cliente_telefone) {
            const { data: cliData } = await supabase
              .from('Clientes')
              .select('CLI_NOME, CLI_EMAIL')
              .eq('CLI_FONE', orc.cliente_telefone)
              .maybeSingle();
            if (cliData) {
              clienteNome = cliData.CLI_NOME || clienteNome;
              clienteEmail = cliData.CLI_EMAIL || null;
            }
          }

          newLeadsToInsert.push({
            id: leadId,
            nome: clienteNome,
            empresa: orc.cliente_telefone || null,
            telefone: orc.cliente_telefone || null,
            email: clienteEmail,
            valor: orc.valor_total || 0,
            etapa_key: "acompanhamento",
            origem: "robo",
            itens,
            observacoes: `Orçamento ${orc.numero} - Status: ${orc.status}`,
          });
        }
      }

      if (pedRes.data) {
        for (const pedido of pedRes.data) {
          const leadId = `pedido-${pedido.id}`;
          if (existingIds.has(leadId)) continue;
          const itens = Array.isArray(pedido.itens) ? (pedido.itens as any[]).map((i: any) => ({
            descricao: i.produto_nome || i.descricao || 'Item',
            quantidade: i.quantidade || 1,
            valor_unitario: i.preco_unitario || i.valor_unitario || 0,
          })) : [];

          let clienteNome = pedido.cliente_nome || 'Cliente';
          let clienteEmail: string | null = null;
          if (pedido.cliente_telefone) {
            const { data: cliData } = await supabase
              .from('Clientes')
              .select('CLI_NOME, CLI_EMAIL')
              .eq('CLI_FONE', pedido.cliente_telefone)
              .maybeSingle();
            if (cliData) {
              clienteNome = cliData.CLI_NOME || clienteNome;
              clienteEmail = cliData.CLI_EMAIL || null;
            }
          }

          newLeadsToInsert.push({
            id: leadId,
            nome: clienteNome,
            empresa: pedido.cliente_telefone || null,
            telefone: pedido.cliente_telefone || null,
            email: clienteEmail,
            valor: pedido.valor_total || 0,
            etapa_key: "acompanhamento",
            origem: "robo",
            itens,
            observacoes: `Pedido ${pedido.numero} - Status: ${pedido.status}`,
          });
        }
      }

      if (newLeadsToInsert.length > 0) {
        await (supabase as any).from('funil_leads').upsert(newLeadsToInsert, { onConflict: 'id' });
        toast.success(`${newLeadsToInsert.length} lead(s) sincronizado(s)`);
      } else {
        toast.info("Nenhum novo pendente encontrado");
      }

      await fetchLeads();
    } catch (err) {
      console.error('Erro ao sincronizar pendentes:', err);
      toast.error("Erro ao sincronizar");
    }
  }, [fetchLeads]);

  // ---- Lead Drag & Drop ----
  const handleLeadDragEnd = async (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;
    setLeads((prev) =>
      prev.map((l) => (l.id === draggableId ? { ...l, etapa: destination.droppableId } : l))
    );
    await (supabase as any).from('funil_leads').update({ etapa_key: destination.droppableId }).eq('id', draggableId);
  };

  // ---- Stage Drag & Drop (reorder) ----
  const handleStageDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const reordered = [...etapas];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    const updated = reordered.map((e, i) => ({ ...e, ordem: i }));
    setEtapas(updated);
    // Update ordem in DB
    for (const e of updated) {
      await (supabase as any).from('funil_etapas').update({ ordem: e.ordem }).eq('key', e.key);
    }
  };

  const moveForward = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;
    const idx = etapas.findIndex((et) => et.key === lead.etapa);
    if (idx < etapas.length - 1) {
      const newEtapa = etapas[idx + 1].key;
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, etapa: newEtapa } : l)));
      await (supabase as any).from('funil_leads').update({ etapa_key: newEtapa }).eq('id', id);
    }
  };

  const openEdit = (lead: LeadFunil) => {
    setEditLead({ ...lead });
    setIsEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editLead) return;
    const totalItens = editLead.itens.reduce((s, i) => s + i.valor_unitario * i.quantidade, 0);
    const updatedLead = { ...editLead, valor: totalItens > 0 ? totalItens : editLead.valor };
    setLeads((prev) => prev.map((l) => (l.id === editLead.id ? updatedLead : l)));
    await (supabase as any).from('funil_leads').update({
      nome: updatedLead.nome,
      empresa: updatedLead.empresa || null,
      telefone: updatedLead.telefone || null,
      email: updatedLead.email || null,
      valor: updatedLead.valor,
      etapa_key: updatedLead.etapa,
      itens: updatedLead.itens,
      observacoes: updatedLead.observacoes || null,
      anexo_pdf: updatedLead.anexo_pdf || null,
      updated_at: new Date().toISOString(),
    }).eq('id', editLead.id);
    setIsEditOpen(false);
    toast.success("Lead atualizado");
  };

  const handleCreate = async () => {
    const totalItens = newLead.itens.reduce((s, i) => s + i.valor_unitario * i.quantidade, 0);
    const leadData = {
      nome: newLead.nome,
      empresa: newLead.empresa || null,
      telefone: newLead.telefone || null,
      email: newLead.email || null,
      valor: totalItens > 0 ? totalItens : newLead.valor,
      etapa_key: newLead.etapa || etapas[0]?.key || 'contato_inicial',
      origem: newLead.origem,
      itens: newLead.itens,
      observacoes: newLead.observacoes || null,
      anexo_pdf: newLead.anexo_pdf || null,
    };
    const { error } = await (supabase as any).from('funil_leads').insert(leadData);
    if (error) {
      toast.error("Erro ao criar lead");
      console.error(error);
      return;
    }
    toast.success("Lead adicionado");
    setNewLead({ ...emptyLead, etapa: etapas[0]?.key || '' });
    setIsCreateOpen(false);
    await fetchLeads();
  };

  const handleDeleteLead = async (id: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    await (supabase as any).from('funil_leads').delete().eq('id', id);
    setIsEditOpen(false);
    toast.success("Lead removido");
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

  // ---- Stage CRUD (Supabase) ----
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

  const handleSaveStage = async () => {
    if (!stageForm.label.trim()) return;
    if (editingStage) {
      await (supabase as any).from('funil_etapas').update({ label: stageForm.label, color: stageForm.color }).eq('key', editingStage.key);
      setEtapas((prev) =>
        prev.map((s) => (s.key === editingStage.key ? { ...s, label: stageForm.label, color: stageForm.color } : s))
      );
      toast.success("Etapa atualizada");
    } else {
      const key = stageForm.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") + "_" + Date.now();
      const ordem = etapas.length;
      const { error } = await (supabase as any).from('funil_etapas').insert({ key, label: stageForm.label, color: stageForm.color, ordem });
      if (error) {
        toast.error("Erro ao criar etapa");
        console.error(error);
        return;
      }
      setEtapas((prev) => [...prev, { key, label: stageForm.label, color: stageForm.color, ordem }]);
      toast.success("Etapa criada");
    }
    setIsStageFormOpen(false);
  };

  const handleDeleteStage = async (key: string) => {
    const hasLeads = leads.some((l) => l.etapa === key);
    if (hasLeads) {
      const firstAvailable = etapas.find((e) => e.key !== key);
      if (firstAvailable) {
        // Move leads to first available stage in DB
        await (supabase as any).from('funil_leads').update({ etapa_key: firstAvailable.key }).eq('etapa_key', key);
        setLeads((prev) => prev.map((l) => (l.etapa === key ? { ...l, etapa: firstAvailable.key } : l)));
      }
    }
    const { error } = await (supabase as any).from('funil_etapas').delete().eq('key', key);
    if (error) {
      toast.error("Erro ao excluir etapa");
      console.error(error);
      return;
    }
    setEtapas((prev) => prev.filter((e) => e.key !== key));
    toast.success("Etapa excluída");
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

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Funil de Vendas</h1>
          <p className="page-description">Acompanhe a jornada dos leads — arraste os cards entre as etapas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={syncPendentes} title="Sincronizar pendentes">
            <RefreshCw className="h-4 w-4 mr-1" /> Sincronizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsStageManagerOpen(true)}>
            <Settings className="h-4 w-4 mr-1" /> Etapas
          </Button>
          <Button onClick={() => { setNewLead({ ...emptyLead, etapa: etapas[0]?.key || '' }); setIsCreateOpen(true); }} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Novo Lead
          </Button>
        </div>
      </div>

      {etapas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Nenhuma etapa encontrada. Crie as tabelas no Supabase e adicione etapas.</p>
          <Button className="mt-4" onClick={() => setIsStageManagerOpen(true)}>
            <Settings className="h-4 w-4 mr-1" /> Gerenciar Etapas
          </Button>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleLeadDragEnd}>
          <div className="grid grid-cols-1 gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(etapas.length, 6)}, minmax(0, 1fr))` }}>
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
      )}

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

              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Paperclip className="h-3 w-3" /> Anexo PDF</Label>
                {editLead.anexo_pdf ? (
                  <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-xs flex-1 truncate">PDF anexado</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                      const link = document.createElement('a');
                      link.href = editLead.anexo_pdf!;
                      link.download = `lead-${editLead.id}.pdf`;
                      link.click();
                    }}>
                      <FileText className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setEditLead({ ...editLead, anexo_pdf: undefined })}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Input
                    type="file"
                    accept=".pdf"
                    className="h-8 text-xs"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 50 * 1024 * 1024) {
                        toast.error("Arquivo muito grande (máx 50MB)");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        setEditLead({ ...editLead, anexo_pdf: reader.result as string });
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex justify-between">
            <Button variant="destructive" size="sm" onClick={() => editLead && handleDeleteLead(editLead.id)}>
              <Trash2 className="h-3 w-3 mr-1" /> Excluir
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveEdit}>Salvar</Button>
            </div>
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

            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Paperclip className="h-3 w-3" /> Anexo PDF</Label>
              {newLead.anexo_pdf ? (
                <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-xs flex-1 truncate">PDF anexado</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setNewLead({ ...newLead, anexo_pdf: "" })}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Input
                  type="file"
                  accept=".pdf"
                  className="h-8 text-xs"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 50 * 1024 * 1024) {
                      toast.error("Arquivo muito grande (máx 50MB)");
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      setNewLead({ ...newLead, anexo_pdf: reader.result as string });
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Funil;
