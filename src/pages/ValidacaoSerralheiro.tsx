import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { legacySupabase } from "@/integrations/supabase/legacyClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2, ShieldCheck, Phone, Mail } from "lucide-react";
import { toast } from "sonner";

type ClientePendente = {
  CLI_CNPJ: string;
  CLI_NOME: string | null;
  CLI_EMAIL: string | null;
  CLI_FONE: string | null;
  CLI_ENDERECO: string | null;
  CLI_BAIRRO: string | null;
  tipo_cliente?: string | null;
};

const PENDENTE = "Pendente Serralheiro";

const ValidacaoSerralheiro = () => {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["validacao-serralheiro"],
    queryFn: async () => {
      const { data, error } = await (legacySupabase as any)
        .from("Clientes")
        .select("*")
        .eq("tipo_cliente", PENDENTE)
        .order("CLI_NOME");
      if (error) throw error;
      return (data ?? []) as ClientePendente[];
    },
  });

  const decidir = useMutation({
    mutationFn: async ({ cnpj, aprovado }: { cnpj: string; aprovado: boolean }) => {
      const novoTipo = aprovado ? "Revenda" : "Porta Instalada";
      const { error } = await (legacySupabase as any)
        .from("Clientes")
        .update({ tipo_cliente: novoTipo })
        .eq("CLI_CNPJ", cnpj);
      if (error) throw error;
      return { aprovado };
    },
    onSuccess: ({ aprovado }) => {
      qc.invalidateQueries({ queryKey: ["validacao-serralheiro"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      toast.success(aprovado ? "Cliente aprovado como Revenda" : "Cliente reprovado — registrado como Porta Instalada");
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao atualizar cliente"),
  });

  const pendentes = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Validação Serralheiro</h1>
          <p className="text-sm text-muted-foreground">
            Aprove ou reprove os cadastros enviados pelo Leo para se tornarem revendedores (serralheiros).
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Cadastros pendentes</span>
            <Badge variant="secondary">{pendentes.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendentes.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              Nenhum cadastro pendente no momento.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF / CNPJ</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Endereço</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendentes.map((c) => {
                  const loadingThis =
                    decidir.isPending && (decidir.variables as any)?.cnpj === c.CLI_CNPJ;
                  return (
                    <TableRow key={c.CLI_CNPJ}>
                      <TableCell className="font-medium">{c.CLI_NOME || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{c.CLI_CNPJ}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-xs">
                          {c.CLI_FONE && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {c.CLI_FONE}
                            </span>
                          )}
                          {c.CLI_EMAIL && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {c.CLI_EMAIL}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[c.CLI_ENDERECO, c.CLI_BAIRRO].filter(Boolean).join(" — ") || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            disabled={loadingThis}
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => decidir.mutate({ cnpj: c.CLI_CNPJ, aprovado: true })}
                          >
                            {loadingThis ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="h-4 w-4 mr-1" /> Aprovar
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={loadingThis}
                            onClick={() => decidir.mutate({ cnpj: c.CLI_CNPJ, aprovado: false })}
                          >
                            <X className="h-4 w-4 mr-1" /> Reprovar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ValidacaoSerralheiro;
