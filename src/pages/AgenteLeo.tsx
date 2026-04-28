import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Bot, Trash2, Eye, EyeOff, Save, MessageSquare, Users, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Conversation {
  id: string;
  telefone: string;
  tipo_cliente: "porta_instalada" | "revenda" | "indefinido";
  nome_cliente: string | null;
  status: string;
  ultima_mensagem_at: string;
  created_at: string;
}

interface Message {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

interface ApiKey {
  id: string;
  key_name: string;
  key_value: string;
  description: string | null;
  updated_at: string;
}

const TIPO_LABEL: Record<string, string> = {
  porta_instalada: "Porta Instalada",
  revenda: "Revenda",
  indefinido: "Indefinido",
};

const TIPO_COLOR: Record<string, string> = {
  porta_instalada: "bg-primary/10 text-primary",
  revenda: "bg-accent/10 text-accent-foreground",
  indefinido: "bg-muted text-muted-foreground",
};

export default function AgenteLeo() {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, isLoading: roleLoading } = useUserRole();
  const isPrimeSyncOwner = user?.email?.toLowerCase() === "primesync@primesync.com.br";
  const canManageAgent = isSuperAdmin || isPrimeSyncOwner;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [editKeys, setEditKeys] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loading, setLoading] = useState(true);

  const callLeoAdmin = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("leo-admin", { body });
    if (error) throw error;
    return data as any;
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callLeoAdmin({ action: "list" });
      const convs = (data.conversations || []) as Conversation[];
      const keys = (data.apiKeys || []) as ApiKey[];
      setConversations(convs);
      setApiKeys(keys);
      const map: Record<string, string> = {};
      keys.forEach((k: ApiKey) => (map[k.key_name] = k.key_value || ""));
      setEditKeys(map);
      setSelectedConv((current) => current ?? convs.find((c) => c.status === "ativa") ?? convs[0] ?? null);
    } catch (error) {
      toast({ title: "Erro ao carregar Agente Leo", description: error instanceof Error ? error.message : "Falha ao buscar conversas.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [callLeoAdmin]);

  useEffect(() => {
    if (canManageAgent) {
      fetchAll();
      return;
    }
    if (!authLoading && (!roleLoading || isPrimeSyncOwner)) setLoading(false);
  }, [authLoading, canManageAgent, fetchAll, isPrimeSyncOwner, roleLoading]);

  // Realtime
  useEffect(() => {
    if (!canManageAgent) return;
    const channel = supabase
      .channel("leo-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leo_conversations" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "leo_messages" }, () => {
        if (selectedConv) loadMessages(selectedConv.id);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [canManageAgent, fetchAll, selectedConv]);

  const loadMessages = async (convId: string) => {
    setLoadingMsgs(true);
    try {
      const data = await callLeoAdmin({ action: "messages", conversationId: convId });
      setMessages((data.messages as Message[]) || []);
    } catch (error) {
      toast({ title: "Erro ao abrir conversa", description: error instanceof Error ? error.message : "Falha ao buscar mensagens.", variant: "destructive" });
    } finally {
      setLoadingMsgs(false);
    }
  };

  const openConversation = (conv: Conversation) => {
    setSelectedConv(conv);
  };

  useEffect(() => {
    if (selectedConv) loadMessages(selectedConv.id);
  }, [selectedConv?.id]);

  const handleResetMemory = async (convId: string) => {
    try {
      await callLeoAdmin({ action: "reset-memory", conversationId: convId });
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Falha ao zerar memória.", variant: "destructive" });
      return;
    }
    toast({ title: "Memória zerada", description: "Histórico da conversa foi apagado." });
    setMessages([]);
  };

  const handleDeleteConversation = async (convId: string) => {
    try {
      await callLeoAdmin({ action: "delete-conversation", conversationId: convId });
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Falha ao excluir conversa.", variant: "destructive" });
      return;
    }
    toast({ title: "Conversa excluída" });
    setSelectedConv(null);
    setMessages([]);
    fetchAll();
  };

  const handleSaveKey = async (key: ApiKey) => {
    setSavingKey(key.key_name);
    try {
      await callLeoAdmin({ action: "save-key", keyId: key.id, keyValue: editKeys[key.key_name] || "" });
    } catch (error) {
      setSavingKey(null);
      toast({ title: "Erro ao salvar", description: error instanceof Error ? error.message : "Falha ao salvar chave.", variant: "destructive" });
      return;
    }
    setSavingKey(null);
    toast({ title: "Chave salva", description: `${key.key_name} atualizada.` });
    fetchAll();
  };

  // Métricas
  const now = Date.now();
  const last24h = conversations.filter(
    (c) => now - new Date(c.ultima_mensagem_at).getTime() < 24 * 3600 * 1000
  );
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const startWeek = new Date(today); startWeek.setDate(today.getDate() - 7);
  const startMonth = new Date(today); startMonth.setDate(today.getDate() - 30);

  const countSince = (d: Date) =>
    conversations.filter((c) => new Date(c.created_at) >= d).length;

  const countByTipo = (tipo: string) =>
    conversations.filter((c) => c.tipo_cliente === tipo).length;

  if (authLoading || (roleLoading && !isPrimeSyncOwner)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!canManageAgent) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Bot className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Agente Leo</h1>
          <p className="text-muted-foreground">Painel de controle do agente de IA</p>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversas ativas (24h)</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{last24h.length}</div>
            <p className="text-xs text-muted-foreground">Última atividade nas últimas 24 horas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Atendimentos / período</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{countSince(today)}</div>
            <p className="text-xs text-muted-foreground">
              Hoje · {countSince(startWeek)} semana · {countSince(startMonth)} mês
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Porta Instalada</CardTitle>
            <Badge className={TIPO_COLOR.porta_instalada}>Tipo 1</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{countByTipo("porta_instalada")}</div>
            <p className="text-xs text-muted-foreground">Clientes com porta já instalada</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenda</CardTitle>
            <Badge className={TIPO_COLOR.revenda}>Tipo 2</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{countByTipo("revenda")}</div>
            <p className="text-xs text-muted-foreground">Clientes revendedores</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="conversas" className="w-full">
        <TabsList>
          <TabsTrigger value="conversas">Conversas</TabsTrigger>
          <TabsTrigger value="chaves">Chaves de API</TabsTrigger>
        </TabsList>

        <TabsContent value="conversas" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Atendimentos em andamento</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : conversations.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Nenhuma conversa registrada ainda.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Última msg</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {conversations.map((c) => (
                        <TableRow
                          key={c.id}
                          className="cursor-pointer"
                          onClick={() => openConversation(c)}
                        >
                          <TableCell>
                            <div className="font-medium">{c.nome_cliente || "—"}</div>
                            <div className="text-xs text-muted-foreground">{c.telefone}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={TIPO_COLOR[c.tipo_cliente]}>
                              {TIPO_LABEL[c.tipo_cliente]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {format(new Date(c.ultima_mensagem_at), "dd/MM HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost">Ver</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>
                  {selectedConv
                    ? `${selectedConv.nome_cliente || selectedConv.telefone}`
                    : "Selecione uma conversa"}
                </CardTitle>
                {selectedConv && (
                  <div className="flex gap-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          <Trash2 className="h-4 w-4 mr-1" /> Zerar memória
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Zerar memória da conversa?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Todas as mensagens desta conversa serão apagadas permanentemente.
                            O agente esquecerá todo o contexto desse atendimento.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleResetMemory(selectedConv.id)}>
                            Zerar memória
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="destructive">
                          <Trash2 className="h-4 w-4 mr-1" /> Excluir
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
                          <AlertDialogDescription>
                            A conversa e todas as mensagens serão removidas permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteConversation(selectedConv.id)}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {!selectedConv ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Clique em uma conversa para ver as mensagens.
                  </p>
                ) : loadingMsgs ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Sem mensagens nessa conversa.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                            m.role === "user"
                              ? "bg-muted"
                              : m.role === "assistant"
                              ? "bg-primary text-primary-foreground"
                              : "bg-accent text-accent-foreground text-xs italic"
                          }`}
                        >
                          <div className="whitespace-pre-wrap">{m.content}</div>
                          <div className="text-[10px] opacity-70 mt-1">
                            {format(new Date(m.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="chaves" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Chaves de API do Agente Leo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {apiKeys.length === 0 && !loading && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma chave cadastrada. Execute o script SQL primeiro.
                </p>
              )}
              {apiKeys.map((key) => (
                <div key={key.id} className="space-y-2 pb-4 border-b last:border-b-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <Label className="text-sm font-mono">{key.key_name}</Label>
                      {key.description && (
                        <p className="text-xs text-muted-foreground">{key.description}</p>
                      )}
                    </div>
                    <Badge variant={key.key_value ? "default" : "outline"}>
                      {key.key_value ? "Configurada" : "Vazia"}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showKey[key.key_name] ? "text" : "password"}
                        value={editKeys[key.key_name] || ""}
                        onChange={(e) =>
                          setEditKeys({ ...editKeys, [key.key_name]: e.target.value })
                        }
                        placeholder="Cole o valor aqui"
                        className="pr-10 font-mono text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() =>
                          setShowKey({ ...showKey, [key.key_name]: !showKey[key.key_name] })
                        }
                      >
                        {showKey[key.key_name] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <Button
                      onClick={() => handleSaveKey(key)}
                      disabled={savingKey === key.key_name}
                    >
                      {savingKey === key.key_name ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-1" /> Salvar
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
