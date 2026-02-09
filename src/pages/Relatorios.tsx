import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  TrendingUp,
  Users,
  Package,
  DollarSign,
  FileText,
  Download,
  Calendar,
} from 'lucide-react';

const reportTypes = [
  {
    title: 'Vendas por Período',
    description: 'Análise detalhada das vendas por dia, semana ou mês',
    icon: TrendingUp,
    color: 'text-green-500',
  },
  {
    title: 'Desempenho de Vendedores',
    description: 'Ranking e métricas individuais de cada vendedor',
    icon: Users,
    color: 'text-blue-500',
  },
  {
    title: 'Movimentação de Estoque',
    description: 'Entradas, saídas e produtos com baixo estoque',
    icon: Package,
    color: 'text-orange-500',
  },
  {
    title: 'Faturamento',
    description: 'Receitas, margens e análise financeira',
    icon: DollarSign,
    color: 'text-emerald-500',
  },
  {
    title: 'Clientes Ativos',
    description: 'Análise de base de clientes e frequência de compra',
    icon: Users,
    color: 'text-purple-500',
  },
  {
    title: 'Notas Fiscais Emitidas',
    description: 'Histórico e status das notas fiscais',
    icon: FileText,
    color: 'text-cyan-500',
  },
];

export default function Relatorios() {
  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Relatórios
        </h1>
        <p className="page-description">
          Relatórios gerenciais para análise completa da operação
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reportTypes.map((report) => (
          <Card key={report.title} className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center gap-4">
              <div className={`p-2 rounded-lg bg-muted ${report.color}`}>
                <report.icon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base">{report.title}</CardTitle>
                <CardDescription className="text-sm">
                  {report.description}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Calendar className="h-4 w-4 mr-1" />
                  Gerar
                </Button>
                <Button variant="ghost" size="sm">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Relatórios Personalizados</CardTitle>
          <CardDescription>
            Em breve: Crie relatórios customizados com os filtros que você precisa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Funcionalidade em desenvolvimento</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
