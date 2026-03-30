import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3, TrendingUp, Users, FileSpreadsheet, FileText, Search, Loader2,
  Package, DollarSign, ShoppingCart, AlertTriangle,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface OrcamentoRow { id: number; numero: string; cliente_nome: string; cliente_cnpj: string | null; status: string; valor_total: number; data_criacao: string; origem: string; }
interface PedidoRow { id: number; numero: string; cliente_nome: string; cliente_cnpj: string | null; status: string; valor_total: number; data_criacao: string; origem: string; }
interface ClienteRow { CLI_NOME: string | null; CLI_CNPJ: string; CLI_EMAIL: string | null; CLI_FONE: string | null; CLI_BAIRRO: string | null; CLI_CEP: string | null; }
interface EstoqueRow { id: number; produto_nome: string; codigo_sku: string; tipo_laminas: string; quantidade: number; quantidade_minima: number; preco_custo: number; preco_venda: number; }

const PIE_COLORS = ["hsl(205,75%,55%)", "hsl(35,90%,55%)", "hsl(152,60%,42%)", "hsl(0,80%,58%)", "hsl(280,60%,50%)", "hsl(215,70%,45%)"];

export default function Relatorios() {
  const [orcamentos, setOrcamentos] = useState<OrcamentoRow[]>([]);
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [estoque, setEstoque] = useState<EstoqueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLeads, setSearchLeads] = useState('');
  const [searchConversoes, setSearchConversoes] = useState('');
  const [searchClientes, setSearchClientes] = useState('');
  const [searchEstoque, setSearchEstoque] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterPeriodo, setFilterPeriodo] = useState('todos');
  const [clienteSubTab, setClienteSubTab] = useState<'todos' | 'novos'>('todos');

  useEffect(() => { fetchData(); }, []);

  const fetchAllClientes = async (): Promise<ClienteRow[]> => {
    const PAGE = 1000;
    let all: ClienteRow[] = [];
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from('Clientes')
        .select('CLI_NOME, CLI_CNPJ, CLI_EMAIL, CLI_FONE, CLI_BAIRRO, CLI_CEP')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      all = all.concat(data || []);
      hasMore = (data?.length || 0) === PAGE;
      from += PAGE;
    }
    return all;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [orcRes, pedRes, allClientes, estRes] = await Promise.all([
        supabase.from('orcamentos').select('id, numero, cliente_nome, cliente_cnpj, status, valor_total, data_criacao, origem').order('data_criacao', { ascending: false }),
        supabase.from('pedidos_venda').select('id, numero, cliente_nome, cliente_cnpj, status, valor_total, data_criacao, origem').order('data_criacao', { ascending: false }),
        fetchAllClientes(),
        supabase.from('estoque').select('id, produto_nome, codigo_sku, tipo_laminas, quantidade, quantidade_minima, preco_custo, preco_venda'),
      ]);
      setOrcamentos(orcRes.data || []);
      setPedidos(pedRes.data || []);
      setClientes(allClientes);
      setEstoque(estRes.data || []);
    } catch (err: any) {
      toast.error('Erro ao carregar dados: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filterByPeriodo = <T extends { data_criacao: string }>(items: T[]) => {
    if (filterPeriodo === 'todos') return items;
    const cutoff = new Date();
    if (filterPeriodo === '7d') cutoff.setDate(cutoff.getDate() - 7);
    else if (filterPeriodo === '30d') cutoff.setDate(cutoff.getDate() - 30);
    else if (filterPeriodo === '90d') cutoff.setDate(cutoff.getDate() - 90);
    return items.filter((i) => new Date(i.data_criacao) >= cutoff);
  };

  const filteredLeads = filterByPeriodo(orcamentos).filter((o) => {
    const matchSearch = !searchLeads || o.cliente_nome.toLowerCase().includes(searchLeads.toLowerCase()) || o.numero.toLowerCase().includes(searchLeads.toLowerCase());
    const matchStatus = filterStatus === 'todos' || o.status === filterStatus;
    return matchSearch && matchStatus;
  });
  const filteredConversoes = filterByPeriodo(pedidos).filter((p) => !searchConversoes || p.cliente_nome.toLowerCase().includes(searchConversoes.toLowerCase()) || p.numero.toLowerCase().includes(searchConversoes.toLowerCase()));
  const filteredClientes = clientes.filter((c) => !searchClientes || (c.CLI_NOME || '').toLowerCase().includes(searchClientes.toLowerCase()) || c.CLI_CNPJ.includes(searchClientes));
  const filteredEstoque = estoque.filter((e) => !searchEstoque || e.produto_nome.toLowerCase().includes(searchEstoque.toLowerCase()) || e.codigo_sku.toLowerCase().includes(searchEstoque.toLowerCase()));

  const leadsQuentes = filteredLeads.filter((o) => ['aceito', 'enviado'].includes(o.status?.toLowerCase()));
  const leadsFrios = filteredLeads.filter((o) => ['pendente', 'recusado'].includes(o.status?.toLowerCase()));
  const valorTotalLeads = filteredLeads.reduce((s, o) => s + (o.valor_total || 0), 0);
  const valorTotalConversoes = filteredConversoes.reduce((s, p) => s + (p.valor_total || 0), 0);

  // Estoque analytics
  const estoqueBaixo = estoque.filter((e) => e.quantidade <= e.quantidade_minima);
  const valorEstoque = estoque.reduce((s, e) => s + (e.preco_custo * e.quantidade), 0);
  const valorEstoqueVenda = estoque.reduce((s, e) => s + (e.preco_venda * e.quantidade), 0);

  // Charts data
  const statusDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    orcamentos.forEach((o) => { map[o.status] = (map[o.status] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [orcamentos]);

  const estoqueByTipo = useMemo(() => {
    const map: Record<string, number> = {};
    estoque.forEach((e) => { map[e.tipo_laminas] = (map[e.tipo_laminas] || 0) + e.quantidade; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [estoque]);

  const faturamentoMensal = useMemo(() => {
    const map: Record<string, number> = {};
    pedidos.forEach((p) => {
      const d = new Date(p.data_criacao);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      map[key] = (map[key] || 0) + (p.valor_total || 0);
    });
    return Object.entries(map).sort().slice(-12).map(([mes, valor]) => ({ mes, valor }));
  }, [pedidos]);

  // Ranking de clientes por valor
  const rankingClientes = useMemo(() => {
    const map: Record<string, { nome: string; total: number; qtd: number }> = {};
    pedidos.forEach((p) => {
      const key = p.cliente_nome;
      if (!map[key]) map[key] = { nome: key, total: 0, qtd: 0 };
      map[key].total += p.valor_total || 0;
      map[key].qtd += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [pedidos]);

  const statusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'aceito': case 'concluido': return 'bg-emerald-100 text-emerald-800';
      case 'enviado': case 'processando': return 'bg-blue-100 text-blue-800';
      case 'pendente': return 'bg-yellow-100 text-yellow-800';
      case 'recusado': return 'bg-red-100 text-red-800';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const exportExcel = (type: string) => {
    let rows: Record<string, any>[] = [];
    let sheetName = type;

    if (type === 'leads') {
      rows = filteredLeads.map((i) => ({ Número: i.numero, Cliente: i.cliente_nome, CNPJ: i.cliente_cnpj || '-', Status: i.status, 'Valor Total': i.valor_total, Data: new Date(i.data_criacao).toLocaleDateString('pt-BR'), Origem: i.origem }));
    } else if (type === 'conversoes') {
      rows = filteredConversoes.map((i) => ({ Número: i.numero, Cliente: i.cliente_nome, CNPJ: i.cliente_cnpj || '-', Status: i.status, 'Valor Total': i.valor_total, Data: new Date(i.data_criacao).toLocaleDateString('pt-BR'), Origem: i.origem }));
    } else if (type === 'clientes') {
      rows = filteredClientes.map((c) => ({ Nome: c.CLI_NOME || '-', CNPJ: c.CLI_CNPJ, Email: c.CLI_EMAIL || '-', Telefone: c.CLI_FONE || '-', Bairro: c.CLI_BAIRRO || '-', CEP: c.CLI_CEP || '-' }));
      sheetName = 'Clientes';
    } else if (type === 'estoque') {
      rows = filteredEstoque.map((e) => ({ Produto: e.produto_nome, SKU: e.codigo_sku, Tipo: e.tipo_laminas, Quantidade: e.quantidade, 'Estoque Mín.': e.quantidade_minima, 'Preço Custo': e.preco_custo, 'Preço Venda': e.preco_venda, 'Valor Total Custo': e.preco_custo * e.quantidade }));
      sheetName = 'Estoque';
    } else if (type === 'faturamento') {
      rows = faturamentoMensal.map((f) => ({ Mês: f.mes, 'Faturamento (R$)': f.valor }));
      sheetName = 'Faturamento';
    } else if (type === 'ranking') {
      rows = rankingClientes.map((r, i) => ({ Posição: i + 1, Cliente: r.nome, 'Total Pedidos': r.qtd, 'Valor Total (R$)': r.total }));
      sheetName = 'Ranking';
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `relatorio_${type}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Excel gerado!');
  };

  const exportPDF = (type: string) => {
    const doc = new jsPDF();
    const titles: Record<string, string> = { leads: 'Relatório de Leads', conversoes: 'Relatório de Conversões', clientes: 'Relatório de Clientes', estoque: 'Relatório de Estoque', faturamento: 'Relatório de Faturamento', ranking: 'Ranking de Clientes' };
    doc.setFontSize(16);
    doc.text(titles[type] || 'Relatório', 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, 14, 28);

    let head: string[][] = [];
    let body: string[][] = [];

    if (type === 'leads') {
      doc.text(`Total: ${filteredLeads.length} | Quentes: ${leadsQuentes.length} | Frios: ${leadsFrios.length} | Valor: R$ ${valorTotalLeads.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, 35);
      head = [['Número', 'Cliente', 'CNPJ', 'Status', 'Valor', 'Data']];
      body = filteredLeads.map((i) => [i.numero, i.cliente_nome, i.cliente_cnpj || '-', i.status, `R$ ${i.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, new Date(i.data_criacao).toLocaleDateString('pt-BR')]);
    } else if (type === 'conversoes') {
      doc.text(`Total: ${filteredConversoes.length} | Valor: R$ ${valorTotalConversoes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, 35);
      head = [['Número', 'Cliente', 'CNPJ', 'Status', 'Valor', 'Data']];
      body = filteredConversoes.map((i) => [i.numero, i.cliente_nome, i.cliente_cnpj || '-', i.status, `R$ ${i.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, new Date(i.data_criacao).toLocaleDateString('pt-BR')]);
    } else if (type === 'clientes') {
      doc.text(`Total: ${filteredClientes.length} clientes`, 14, 35);
      head = [['Nome', 'CNPJ', 'Email', 'Telefone', 'Bairro']];
      body = filteredClientes.map((c) => [c.CLI_NOME || '-', c.CLI_CNPJ, c.CLI_EMAIL || '-', c.CLI_FONE || '-', c.CLI_BAIRRO || '-']);
    } else if (type === 'estoque') {
      doc.text(`Total: ${filteredEstoque.length} produtos | Valor Custo: R$ ${valorEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Valor Venda: R$ ${valorEstoqueVenda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, 35);
      head = [['Produto', 'SKU', 'Tipo', 'Qtd', 'Mín', 'P. Custo', 'P. Venda']];
      body = filteredEstoque.map((e) => [e.produto_nome, e.codigo_sku, e.tipo_laminas, String(e.quantidade), String(e.quantidade_minima), `R$ ${e.preco_custo.toFixed(2)}`, `R$ ${e.preco_venda.toFixed(2)}`]);
    } else if (type === 'faturamento') {
      const totalFat = faturamentoMensal.reduce((s, f) => s + f.valor, 0);
      doc.text(`Total: R$ ${totalFat.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, 35);
      head = [['Mês', 'Faturamento']];
      body = faturamentoMensal.map((f) => [f.mes, `R$ ${f.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]);
    } else if (type === 'ranking') {
      head = [['Pos.', 'Cliente', 'Pedidos', 'Valor Total']];
      body = rankingClientes.map((r, i) => [String(i + 1), r.nome, String(r.qtd), `R$ ${r.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]);
    }

    autoTable(doc, { startY: 42, head, body, styles: { fontSize: 8 }, headStyles: { fillColor: [41, 65, 148] } });
    doc.save(`relatorio_${type}_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('PDF gerado!');
  };

  const ExportButtons = ({ type }: { type: string }) => (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => exportExcel(type)}><FileSpreadsheet className="h-4 w-4 mr-1" /> Excel</Button>
      <Button variant="outline" size="sm" onClick={() => exportPDF(type)}><FileText className="h-4 w-4 mr-1" /> PDF</Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><BarChart3 className="h-6 w-6" /> Relatórios</h1>
        <p className="page-description">Relatórios completos com exportação em Excel e PDF</p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Período:</span>
        <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo período</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="90d">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Leads Quentes", value: leadsQuentes.length, icon: TrendingUp, color: "text-chart-hot" },
          { label: "Leads Frios", value: leadsFrios.length, icon: Users, color: "text-chart-cold" },
          { label: "Conversões", value: filteredConversoes.length, icon: ShoppingCart, color: "text-success" },
          { label: "Clientes", value: clientes.length, icon: Users, color: "text-primary" },
          { label: "Produtos", value: estoque.length, icon: Package, color: "text-info" },
          { label: "Estoque Baixo", value: estoqueBaixo.length, icon: AlertTriangle, color: "text-destructive" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2">
                <s.icon className={`h-4 w-4 ${s.color}`} />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">{s.label}</p>
                  <p className="text-lg font-bold">{loading ? '...' : s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="leads" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="conversoes">Conversões</TabsTrigger>
          <TabsTrigger value="faturamento">Faturamento</TabsTrigger>
          <TabsTrigger value="ranking">Ranking Clientes</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
        </TabsList>

        {/* Leads Tab */}
        <TabsContent value="leads">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Leads (Orçamentos)</CardTitle>
                  <CardDescription>{filteredLeads.length} registros · R$ {valorTotalLeads.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</CardDescription>
                </div>
                <ExportButtons type="leads" />
              </div>
              <div className="flex gap-2 mt-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Buscar..." value={searchLeads} onChange={(e) => setSearchLeads(e.target.value)} />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="enviado">Enviado</SelectItem>
                    <SelectItem value="aceito">Aceito</SelectItem>
                    <SelectItem value="recusado">Recusado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 overflow-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Cliente</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Data</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {filteredLeads.slice(0, 50).map((o) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-mono text-xs">{o.numero}</TableCell>
                            <TableCell className="font-medium text-sm">{o.cliente_nome}</TableCell>
                            <TableCell><Badge className={`text-xs ${statusColor(o.status)}`}>{o.status}</Badge></TableCell>
                            <TableCell className="text-right font-mono text-sm">R$ {o.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-xs">{new Date(o.data_criacao).toLocaleDateString('pt-BR')}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {filteredLeads.length > 50 && <p className="text-xs text-muted-foreground mt-2 text-center">Mostrando 50 de {filteredLeads.length}. Exporte para ver todos.</p>}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Distribuição por Status</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                          {statusDistribution.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1">
                      {statusDistribution.map((s, i) => (
                        <div key={s.name} className="flex justify-between text-xs">
                          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} /><span>{s.name}</span></div>
                          <span className="font-medium">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conversões Tab */}
        <TabsContent value="conversoes">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Conversões (Pedidos de Venda)</CardTitle>
                  <CardDescription>{filteredConversoes.length} registros · R$ {valorTotalConversoes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</CardDescription>
                </div>
                <ExportButtons type="conversoes" />
              </div>
              <div className="relative max-w-sm mt-3">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Buscar..." value={searchConversoes} onChange={(e) => setSearchConversoes(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Cliente</TableHead><TableHead>CNPJ</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Data</TableHead><TableHead>Origem</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {filteredConversoes.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-xs">{p.numero}</TableCell>
                          <TableCell className="font-medium">{p.cliente_nome}</TableCell>
                          <TableCell className="text-xs">{p.cliente_cnpj || '-'}</TableCell>
                          <TableCell><Badge className={`text-xs ${statusColor(p.status)}`}>{p.status}</Badge></TableCell>
                          <TableCell className="text-right font-mono">R$ {p.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-xs">{new Date(p.data_criacao).toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell className="text-xs">{p.origem}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Faturamento Tab */}
        <TabsContent value="faturamento">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Faturamento Mensal</CardTitle>
                  <CardDescription>Evolução do faturamento baseado em pedidos de venda</CardDescription>
                </div>
                <ExportButtons type="faturamento" />
              </div>
            </CardHeader>
            <CardContent>
              {faturamentoMensal.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum dado de faturamento</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={faturamentoMensal}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,88%)" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => [`R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Faturamento']} />
                      <Bar dataKey="valor" fill="hsl(152,60%,42%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-4 overflow-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Mês</TableHead><TableHead className="text-right">Faturamento</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {faturamentoMensal.map((f) => (
                          <TableRow key={f.mes}>
                            <TableCell>{f.mes}</TableCell>
                            <TableCell className="text-right font-mono">R$ {f.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-bold border-t-2">
                          <TableCell>Total</TableCell>
                          <TableCell className="text-right font-mono">R$ {faturamentoMensal.reduce((s, f) => s + f.valor, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Ranking Clientes Tab */}
        <TabsContent value="ranking">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Ranking de Clientes</CardTitle>
                  <CardDescription>Top 10 clientes por valor de pedidos</CardDescription>
                </div>
                <ExportButtons type="ranking" />
              </div>
            </CardHeader>
            <CardContent>
              {rankingClientes.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum pedido registrado</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead>Cliente</TableHead><TableHead className="text-center">Pedidos</TableHead><TableHead className="text-right">Valor Total</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {rankingClientes.map((r, i) => (
                          <TableRow key={r.nome}>
                            <TableCell className="font-bold">{i + 1}º</TableCell>
                            <TableCell className="font-medium">{r.nome}</TableCell>
                            <TableCell className="text-center">{r.qtd}</TableCell>
                            <TableCell className="text-right font-mono">R$ {r.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={rankingClientes} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,88%)" />
                        <XAxis type="number" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="nome" width={120} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => [`R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Valor']} />
                        <Bar dataKey="total" fill="hsl(205,75%,55%)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Clientes Tab */}
        <TabsContent value="clientes">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Relatório de Clientes</CardTitle>
                  <CardDescription>{filteredClientes.length} clientes cadastrados</CardDescription>
                </div>
                <ExportButtons type="clientes" />
              </div>
              <div className="relative max-w-sm mt-3">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Buscar por nome ou CNPJ..." value={searchClientes} onChange={(e) => setSearchClientes(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>CNPJ</TableHead><TableHead>Email</TableHead><TableHead>Telefone</TableHead><TableHead>Bairro</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {filteredClientes.slice(0, 100).map((c) => (
                        <TableRow key={c.CLI_CNPJ}>
                          <TableCell className="font-medium">{c.CLI_NOME || '-'}</TableCell>
                          <TableCell className="font-mono text-xs">{c.CLI_CNPJ}</TableCell>
                          <TableCell className="text-xs">{c.CLI_EMAIL || '-'}</TableCell>
                          <TableCell className="text-xs">{c.CLI_FONE || '-'}</TableCell>
                          <TableCell className="text-xs">{c.CLI_BAIRRO || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filteredClientes.length > 100 && <p className="text-xs text-muted-foreground mt-2 text-center">Mostrando 100 de {filteredClientes.length}. Exporte para ver todos.</p>}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Estoque Tab */}
        <TabsContent value="estoque">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">Relatório de Estoque</CardTitle>
                  <CardDescription>
                    {estoque.length} produtos · Valor Custo: R$ {valorEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · Valor Venda: R$ {valorEstoqueVenda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </CardDescription>
                </div>
                <ExportButtons type="estoque" />
              </div>
              <div className="relative max-w-sm mt-3">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Buscar produto ou SKU..." value={searchEstoque} onChange={(e) => setSearchEstoque(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 overflow-auto">
                    {estoqueBaixo.length > 0 && (
                      <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                        <p className="text-sm font-semibold text-destructive flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> {estoqueBaixo.length} produto(s) com estoque baixo</p>
                        <div className="mt-1 text-xs text-destructive/80">{estoqueBaixo.map((e) => e.produto_nome).join(', ')}</div>
                      </div>
                    )}
                    <Table>
                      <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>SKU</TableHead><TableHead>Tipo</TableHead><TableHead className="text-center">Qtd</TableHead><TableHead className="text-center">Mín</TableHead><TableHead className="text-right">P. Venda</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {filteredEstoque.map((e) => (
                          <TableRow key={e.id} className={e.quantidade <= e.quantidade_minima ? 'bg-destructive/5' : ''}>
                            <TableCell className="font-medium text-sm">{e.produto_nome}</TableCell>
                            <TableCell className="font-mono text-xs">{e.codigo_sku}</TableCell>
                            <TableCell className="text-xs">{e.tipo_laminas}</TableCell>
                            <TableCell className="text-center">{e.quantidade <= e.quantidade_minima ? <span className="text-destructive font-bold">{e.quantidade}</span> : e.quantidade}</TableCell>
                            <TableCell className="text-center text-muted-foreground">{e.quantidade_minima}</TableCell>
                            <TableCell className="text-right font-mono text-sm">R$ {e.preco_venda.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Estoque por Tipo</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={estoqueByTipo} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} dataKey="value">
                          {estoqueByTipo.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1 mt-2">
                      {estoqueByTipo.map((s, i) => (
                        <div key={s.name} className="flex justify-between text-xs">
                          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} /><span>{s.name}</span></div>
                          <span className="font-medium">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}