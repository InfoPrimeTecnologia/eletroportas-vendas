import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3, TrendingUp, Users, Download, FileSpreadsheet, FileText, Search, Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface OrcamentoRow {
  id: number;
  numero: string;
  cliente_nome: string;
  cliente_cnpj: string | null;
  status: string;
  valor_total: number;
  data_criacao: string;
  origem: string;
}

interface PedidoRow {
  id: number;
  numero: string;
  cliente_nome: string;
  cliente_cnpj: string | null;
  status: string;
  valor_total: number;
  data_criacao: string;
  origem: string;
}

export default function Relatorios() {
  const [orcamentos, setOrcamentos] = useState<OrcamentoRow[]>([]);
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLeads, setSearchLeads] = useState('');
  const [searchConversoes, setSearchConversoes] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterPeriodo, setFilterPeriodo] = useState('todos');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [orcRes, pedRes] = await Promise.all([
        supabase.from('orcamentos').select('id, numero, cliente_nome, cliente_cnpj, status, valor_total, data_criacao, origem').order('data_criacao', { ascending: false }),
        supabase.from('pedidos_venda').select('id, numero, cliente_nome, cliente_cnpj, status, valor_total, data_criacao, origem').order('data_criacao', { ascending: false }),
      ]);
      if (orcRes.error) throw orcRes.error;
      if (pedRes.error) throw pedRes.error;
      setOrcamentos(orcRes.data || []);
      setPedidos(pedRes.data || []);
    } catch (err: any) {
      toast.error('Erro ao carregar dados: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filterByPeriodo = <T extends { data_criacao: string }>(items: T[]) => {
    if (filterPeriodo === 'todos') return items;
    const now = new Date();
    const cutoff = new Date();
    if (filterPeriodo === '7d') cutoff.setDate(now.getDate() - 7);
    else if (filterPeriodo === '30d') cutoff.setDate(now.getDate() - 30);
    else if (filterPeriodo === '90d') cutoff.setDate(now.getDate() - 90);
    return items.filter((i) => new Date(i.data_criacao) >= cutoff);
  };

  const filteredLeads = filterByPeriodo(orcamentos).filter((o) => {
    const matchSearch = !searchLeads || o.cliente_nome.toLowerCase().includes(searchLeads.toLowerCase()) || o.numero.toLowerCase().includes(searchLeads.toLowerCase());
    const matchStatus = filterStatus === 'todos' || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const filteredConversoes = filterByPeriodo(pedidos).filter((p) => {
    return !searchConversoes || p.cliente_nome.toLowerCase().includes(searchConversoes.toLowerCase()) || p.numero.toLowerCase().includes(searchConversoes.toLowerCase());
  });

  const leadsQuentes = filteredLeads.filter((o) => ['aceito', 'enviado'].includes(o.status?.toLowerCase()));
  const leadsFrios = filteredLeads.filter((o) => ['pendente', 'recusado'].includes(o.status?.toLowerCase()));

  const totalLeads = filteredLeads.length;
  const totalConversoes = filteredConversoes.length;
  const valorTotalLeads = filteredLeads.reduce((s, o) => s + (o.valor_total || 0), 0);
  const valorTotalConversoes = filteredConversoes.reduce((s, p) => s + (p.valor_total || 0), 0);

  const exportExcel = (type: 'leads' | 'conversoes') => {
    const data = type === 'leads' ? filteredLeads : filteredConversoes;
    const rows = data.map((item) => ({
      Número: item.numero,
      Cliente: item.cliente_nome,
      CNPJ: item.cliente_cnpj || '-',
      Status: item.status,
      'Valor Total': item.valor_total,
      Data: new Date(item.data_criacao).toLocaleDateString('pt-BR'),
      Origem: item.origem,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type === 'leads' ? 'Leads' : 'Conversões');
    XLSX.writeFile(wb, `relatorio_${type}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Arquivo Excel gerado!');
  };

  const exportPDF = (type: 'leads' | 'conversoes') => {
    const data = type === 'leads' ? filteredLeads : filteredConversoes;
    const doc = new jsPDF();
    const title = type === 'leads' ? 'Relatório de Leads' : 'Relatório de Conversões';
    doc.setFontSize(16);
    doc.text(title, 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`, 14, 28);

    if (type === 'leads') {
      doc.text(`Total: ${totalLeads} | Quentes: ${leadsQuentes.length} | Frios: ${leadsFrios.length} | Valor: R$ ${valorTotalLeads.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, 35);
    } else {
      doc.text(`Total: ${totalConversoes} | Valor: R$ ${valorTotalConversoes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, 35);
    }

    const tableData = data.map((item) => [
      item.numero,
      item.cliente_nome,
      item.cliente_cnpj || '-',
      item.status,
      `R$ ${item.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      new Date(item.data_criacao).toLocaleDateString('pt-BR'),
    ]);

    autoTable(doc, {
      startY: 42,
      head: [['Número', 'Cliente', 'CNPJ', 'Status', 'Valor', 'Data']],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 65, 148] },
    });

    doc.save(`relatorio_${type}_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('Arquivo PDF gerado!');
  };

  const statusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'aceito': return 'bg-emerald-100 text-emerald-800';
      case 'enviado': return 'bg-blue-100 text-blue-800';
      case 'pendente': return 'bg-yellow-100 text-yellow-800';
      case 'recusado': return 'bg-red-100 text-red-800';
      case 'processando': return 'bg-blue-100 text-blue-800';
      case 'concluido': return 'bg-emerald-100 text-emerald-800';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Relatórios
        </h1>
        <p className="page-description">Relatórios de leads e conversões com exportação em Excel e PDF</p>
      </div>

      {/* Filtro de Período Global */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Período:</span>
        <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo período</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="90d">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg text-chart-hot"><TrendingUp className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Leads Quentes</p>
                <p className="text-xl font-bold">{loading ? '...' : leadsQuentes.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg text-chart-cold"><Users className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Leads Frios</p>
                <p className="text-xl font-bold">{loading ? '...' : leadsFrios.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg text-success"><TrendingUp className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Conversões</p>
                <p className="text-xl font-bold">{loading ? '...' : totalConversoes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg text-primary"><BarChart3 className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Valor Conversões</p>
                <p className="text-xl font-bold">{loading ? '...' : `R$ ${valorTotalConversoes.toLocaleString('pt-BR')}`}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="leads" className="space-y-4">
        <TabsList>
          <TabsTrigger value="leads">Relatório de Leads</TabsTrigger>
          <TabsTrigger value="conversoes">Relatório de Conversões</TabsTrigger>
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
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => exportExcel('leads')}>
                    <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => exportPDF('leads')}>
                    <FileText className="h-4 w-4 mr-1" /> PDF
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Buscar por cliente ou número..." value={searchLeads} onChange={(e) => setSearchLeads(e.target.value)} />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
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
              {loading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : filteredLeads.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum lead encontrado</p>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>CNPJ</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Origem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLeads.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono text-xs">{o.numero}</TableCell>
                          <TableCell className="font-medium">{o.cliente_nome}</TableCell>
                          <TableCell className="text-xs">{o.cliente_cnpj || '-'}</TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${statusColor(o.status)}`}>{o.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">R$ {o.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-xs">{new Date(o.data_criacao).toLocaleDateString('pt-BR')}</TableCell>
                          <TableCell className="text-xs">{o.origem}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => exportExcel('conversoes')}>
                    <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => exportPDF('conversoes')}>
                    <FileText className="h-4 w-4 mr-1" /> PDF
                  </Button>
                </div>
              </div>
              <div className="relative max-w-sm mt-3">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Buscar por cliente ou número..." value={searchConversoes} onChange={(e) => setSearchConversoes(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : filteredConversoes.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhuma conversão encontrada</p>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>CNPJ</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Origem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredConversoes.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-xs">{p.numero}</TableCell>
                          <TableCell className="font-medium">{p.cliente_nome}</TableCell>
                          <TableCell className="text-xs">{p.cliente_cnpj || '-'}</TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${statusColor(p.status)}`}>{p.status}</Badge>
                          </TableCell>
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
      </Tabs>
    </div>
  );
}
