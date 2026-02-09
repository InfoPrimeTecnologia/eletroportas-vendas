import { useState } from "react";
import { GripVertical, User, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface LeadFunil {
  id: string;
  nome: string;
  empresa?: string;
  valor: number;
  etapa: string;
  origem: "robo" | "manual";
}

const etapas = [
  { key: "contato_inicial", label: "Contato Inicial", color: "bg-chart-cold" },
  { key: "orcamento_enviado", label: "Orçamento Enviado", color: "bg-chart-warm" },
  { key: "orcamento_aceito", label: "Orçamento Aceito", color: "bg-primary" },
  { key: "pedido_venda", label: "Pedido de Venda", color: "bg-info" },
  { key: "venda_finalizada", label: "Venda Finalizada", color: "bg-success" },
];

const mockLeads: LeadFunil[] = [
  { id: "1", nome: "João Silva", valor: 4500, etapa: "contato_inicial", origem: "robo" },
  { id: "2", nome: "Maria Santos", empresa: "Construtora XYZ", valor: 12000, etapa: "contato_inicial", origem: "robo" },
  { id: "3", nome: "Pedro Costa", valor: 3200, etapa: "orcamento_enviado", origem: "robo" },
  { id: "4", nome: "Ana Oliveira", empresa: "Imobiliária ABC", valor: 8900, etapa: "orcamento_enviado", origem: "manual" },
  { id: "5", nome: "Carlos Lima", valor: 6700, etapa: "orcamento_aceito", origem: "robo" },
  { id: "6", nome: "Fernanda Dias", valor: 15000, etapa: "pedido_venda", origem: "robo" },
  { id: "7", nome: "Roberto Alves", empresa: "Engenharia RS", valor: 22000, etapa: "pedido_venda", origem: "manual" },
  { id: "8", nome: "Luciana Souza", valor: 5500, etapa: "venda_finalizada", origem: "robo" },
];

const Funil = () => {
  const [leads, setLeads] = useState<LeadFunil[]>(mockLeads);

  const moveForward = (id: string) => {
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const idx = etapas.findIndex((e) => e.key === l.etapa);
        if (idx < etapas.length - 1) return { ...l, etapa: etapas[idx + 1].key };
        return l;
      })
    );
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="page-header">
        <h1 className="page-title">Funil de Vendas</h1>
        <p className="page-description">Acompanhe a jornada dos leads gerenciados pelo robô</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {etapas.map((etapa) => {
          const etapaLeads = leads.filter((l) => l.etapa === etapa.key);
          const total = etapaLeads.reduce((s, l) => s + l.valor, 0);
          return (
            <div key={etapa.key} className="funnel-stage">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2 h-2 rounded-full ${etapa.color}`} />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{etapa.label}</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {etapaLeads.length} lead{etapaLeads.length !== 1 ? "s" : ""} · R$ {total.toLocaleString("pt-BR")}
              </p>
              <div className="space-y-2">
                {etapaLeads.map((lead) => (
                  <div key={lead.id} className="bg-background rounded-lg p-3 border border-border shadow-sm hover:shadow-md transition-shadow group">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium">{lead.nome}</p>
                        {lead.empresa && <p className="text-xs text-muted-foreground">{lead.empresa}</p>}
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${lead.origem === "robo" ? "badge-cold" : "badge-warm"}`}>
                        {lead.origem === "robo" ? "🤖 Robô" : "✋ Manual"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs font-mono font-medium">R$ {lead.valor.toLocaleString("pt-BR")}</span>
                      {etapa.key !== "venda_finalizada" && (
                        <button
                          onClick={() => moveForward(lead.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                          title="Avançar etapa"
                        >
                          <ArrowRight className="h-3.5 w-3.5 text-primary" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Funil;
