import { Bot, Users, Flame, Snowflake, TrendingUp, ShoppingCart, FileText, Activity } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from "recharts";

const leadsOverTime = [
  { name: "Seg", quentes: 12, frios: 28 },
  { name: "Ter", quentes: 18, frios: 22 },
  { name: "Qua", quentes: 15, frios: 30 },
  { name: "Qui", quentes: 22, frios: 18 },
  { name: "Sex", quentes: 28, frios: 14 },
  { name: "Sáb", quentes: 10, frios: 8 },
  { name: "Dom", quentes: 5, frios: 4 },
];

const funnelData = [
  { name: "Contato Inicial", value: 120 },
  { name: "Orçamento Enviado", value: 85 },
  { name: "Orçamento Aceito", value: 52 },
  { name: "Pedido de Venda", value: 38 },
  { name: "Venda Finalizada", value: 24 },
];

const FUNNEL_COLORS = [
  "hsl(205, 75%, 55%)",
  "hsl(215, 70%, 45%)",
  "hsl(35, 90%, 55%)",
  "hsl(152, 60%, 42%)",
  "hsl(152, 60%, 35%)",
];

const recentActivity = [
  { id: 1, action: "Orçamento enviado", client: "João Silva", time: "2 min atrás", type: "orcamento" },
  { id: 2, action: "Novo lead capturado", client: "Maria Santos", time: "15 min atrás", type: "lead" },
  { id: 3, action: "Venda finalizada", client: "Pedro Costa", time: "1h atrás", type: "venda" },
  { id: 4, action: "Follow-up enviado", client: "Ana Oliveira", time: "2h atrás", type: "followup" },
  { id: 5, action: "Orçamento aceito", client: "Carlos Lima", time: "3h atrás", type: "orcamento" },
];

const stats = [
  { label: "Leads Quentes", value: "47", icon: Flame, change: "+12%", colorClass: "text-chart-hot" },
  { label: "Leads Frios", value: "89", icon: Snowflake, change: "-5%", colorClass: "text-chart-cold" },
  { label: "Conversões", value: "24", icon: TrendingUp, change: "+8%", colorClass: "text-success" },
  { label: "Robô Ativo", value: "Online", icon: Bot, change: "24/7", colorClass: "text-primary" },
];

const Dashboard = () => {
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
              <p className="text-2xl font-bold mt-1">{stat.value}</p>
              <p className={`text-xs mt-1 ${stat.colorClass} font-medium`}>{stat.change}</p>
            </div>
            <div className={`p-2.5 rounded-lg bg-muted ${stat.colorClass}`}>
              <stat.icon className="h-5 w-5" />
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Leads Chart */}
        <div className="stat-card lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4">Leads Quentes vs Frios — Semana</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={leadsOverTime}>
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
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(0,0%,100%)",
                  border: "1px solid hsl(220,15%,88%)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Area type="monotone" dataKey="quentes" stroke="hsl(0,80%,58%)" fill="url(#gradHot)" strokeWidth={2} />
              <Area type="monotone" dataKey="frios" stroke="hsl(205,75%,55%)" fill="url(#gradCold)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Funnel Pie */}
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">Funil de Vendas</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={funnelData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {funnelData.map((_, i) => (
                  <Cell key={i} fill={FUNNEL_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {funnelData.map((item, i) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: FUNNEL_COLORS[i] }} />
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
        {/* Recent Activity */}
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Atividade Recente do Robô
          </h3>
          <div className="space-y-3">
            {recentActivity.map((item) => (
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

        {/* Performance Bar */}
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-4">Performance Semanal</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={leadsOverTime}>
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
