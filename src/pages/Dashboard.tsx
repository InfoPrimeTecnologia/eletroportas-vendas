import { useEffect, useState } from "react";
import { Bot, Flame, Snowflake, TrendingUp, Activity } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

interface DashboardMetrics {
  leadsQuentes: number;
  leadsFrios: number;
  conversoes: number;
  funnelData: { name: string; value: number }[];
  recentActivity: { id: number; action: string; client: string; time: string; type: string }[];
}

const FUNNEL_COLORS = [
  "hsl(205, 75%, 55%)",
  "hsl(215, 70%, 45%)",
  "hsl(35, 90%, 55%)",
  "hsl(152, 60%, 42%)",
  "hsl(152, 60%, 35%)",
  "hsl(0, 80%, 58%)",
  "hsl(280, 60%, 50%)",
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins} min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

const Dashboard = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    leadsQuentes: 0,
    leadsFrios: 0,
    conversoes: 0,
    funnelData: [],
    recentActivity: [],
  });
  const [weeklyData, setWeeklyData] = useState<{ name: string; quentes: number; frios: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      // Fetch orcamentos (leads quentes = aceito/enviado, frios = pendente/recusado)
      const { data: orcamentos } = await supabase
        .from("orcamentos")
        .select("id, numero, cliente_nome, status, data_criacao, valor_total");

      const quentes = (orcamentos || []).filter((o) =>
        ["aceito", "enviado"].includes(o.status?.toLowerCase())
      ).length;
      const frios = (orcamentos || []).filter((o) =>
        ["pendente", "recusado"].includes(o.status?.toLowerCase())
      ).length;

      // Fetch pedidos_venda (conversões)
      const { data: pedidos } = await supabase
        .from("pedidos_venda")
        .select("id, numero, cliente_nome, status, data_criacao, valor_total");

      const conversoes = (pedidos || []).length;

      // Build funnel data from orcamento statuses + pedidos
      const statusMap: Record<string, number> = {};
      (orcamentos || []).forEach((o) => {
        const s = o.status || "pendente";
        statusMap[s] = (statusMap[s] || 0) + 1;
      });
      // Add pedidos as "Pedido de Venda"
      if (conversoes > 0) {
        statusMap["Pedido de Venda"] = conversoes;
      }

      const statusLabels: Record<string, string> = {
        pendente: "Pendente",
        enviado: "Orçamento Enviado",
        aceito: "Orçamento Aceito",
        recusado: "Recusado",
        "Pedido de Venda": "Pedido de Venda",
      };

      const funnelData = Object.entries(statusMap).map(([key, value]) => ({
        name: statusLabels[key] || key,
        value,
      }));

      // Recent activity from orcamentos + pedidos
      const allItems = [
        ...(orcamentos || []).map((o) => ({
          id: o.id,
          action: `Orçamento ${o.status}`,
          client: o.cliente_nome,
          time: timeAgo(o.data_criacao),
          date: new Date(o.data_criacao).getTime(),
          type: "orcamento",
        })),
        ...(pedidos || []).map((p) => ({
          id: p.id + 10000,
          action: `Pedido de Venda - ${p.status}`,
          client: p.cliente_nome,
          time: timeAgo(p.data_criacao),
          date: new Date(p.data_criacao).getTime(),
          type: "venda",
        })),
      ]
        .sort((a, b) => b.date - a.date)
        .slice(0, 8);

      // Weekly data - last 7 days
      const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const now = new Date();
      const weekly = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - (6 - i));
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const dayEnd = new Date(dayStart.getTime() + 86400000);

        const dayOrcs = (orcamentos || []).filter((o) => {
          const t = new Date(o.data_criacao).getTime();
          return t >= dayStart.getTime() && t < dayEnd.getTime();
        });

        return {
          name: days[d.getDay()],
          quentes: dayOrcs.filter((o) => ["aceito", "enviado"].includes(o.status?.toLowerCase())).length,
          frios: dayOrcs.filter((o) => ["pendente", "recusado"].includes(o.status?.toLowerCase())).length,
        };
      });

      setWeeklyData(weekly);
      setMetrics({
        leadsQuentes: quentes,
        leadsFrios: frios,
        conversoes,
        funnelData,
        recentActivity: allItems,
      });
    } catch (err) {
      console.error("Erro ao carregar métricas:", err);
    } finally {
      setLoading(false);
    }
  };

  const stats = [
    { label: "Leads Quentes", value: metrics.leadsQuentes.toString(), icon: Flame, colorClass: "text-chart-hot" },
    { label: "Leads Frios", value: metrics.leadsFrios.toString(), icon: Snowflake, colorClass: "text-chart-cold" },
    { label: "Conversões", value: metrics.conversoes.toString(), icon: TrendingUp, colorClass: "text-success" },
    { label: "Robô Ativo", value: "Online", icon: Bot, colorClass: "text-primary" },
  ];

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-description">Visão geral da operação do agente de vendas IA</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{stat.label}</p>
              <p className="text-2xl font-bold mt-1">{loading ? "..." : stat.value}</p>
            </div>
            <div className={`p-2.5 rounded-lg bg-muted ${stat.colorClass}`}>
              <stat.icon className="h-5 w-5" />
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="stat-card lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4">Leads Quentes vs Frios — Semana</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="gradHot" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(0,80%,58%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(0,80%,58%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCold" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(205,75%,55%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(205,75%,55%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,88%)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(220,10%,50%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(220,10%,50%)" />
              <Tooltip contentStyle={{ backgroundColor: "hsl(0,0%,100%)", border: "1px solid hsl(220,15%,88%)", borderRadius: "8px", fontSize: "12px" }} />
              <Area type="monotone" dataKey="quentes" stroke="hsl(0,80%,58%)" fill="url(#gradHot)" strokeWidth={2} />
              <Area type="monotone" dataKey="frios" stroke="hsl(205,75%,55%)" fill="url(#gradCold)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">Funil de Vendas</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={metrics.funnelData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {metrics.funnelData.map((_, i) => (
                  <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {metrics.funnelData.map((item, i) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }} />
                  <span className="text-muted-foreground">{item.name}</span>
                </div>
                <span className="font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity & Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Atividade Recente
          </h3>
          <div className="space-y-3">
            {metrics.recentActivity.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma atividade recente</p>
            )}
            {metrics.recentActivity.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium">{item.action}</p>
                  <p className="text-xs text-muted-foreground">{item.client}</p>
                </div>
                <span className="text-xs text-muted-foreground">{item.time}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">Performance Semanal</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,88%)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(220,10%,50%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(220,10%,50%)" />
              <Tooltip />
              <Bar dataKey="quentes" fill="hsl(0,80%,58%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="frios" fill="hsl(205,75%,55%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
