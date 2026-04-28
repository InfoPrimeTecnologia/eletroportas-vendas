import { createClient } from "npm:@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OWNER_EMAIL = "primesync@primesync.com.br";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Executa uma chamada do supabase-js com retry automático quando o
 * PostgREST está recarregando o schema cache (erro transitório que ocorre
 * após migrations ou em picos de carga).
 */
async function withSchemaRetry<T extends { error: any }>(fn: () => Promise<T>, tentativas = 4): Promise<T> {
  let ultimo: T | undefined;
  for (let i = 0; i < tentativas; i++) {
    const r = await fn();
    const msg = String(r?.error?.message || "");
    if (r?.error && /schema cache|Could not query the database/i.test(msg)) {
      ultimo = r;
      await new Promise((res) => setTimeout(res, 300 * (i + 1)));
      continue;
    }
    return r;
  }
  return ultimo as T;
}

async function assertOwner(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false as const, response: json({ error: "Não autenticado." }, 401) };

  let email: string | undefined;

  // Try validating via Supabase Auth (works with both legacy JWT and signing-keys)
  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data, error } = await userClient.auth.getUser();
    if (!error && data?.user?.email) {
      email = data.user.email.toLowerCase();
    }
  } catch (e) {
    console.warn("getUser falhou, tentando decode manual:", e);
  }

  // Fallback: decode JWT payload manually
  if (!email) {
    try {
      const [, payloadB64] = token.split(".");
      const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
      email = (payload.email as string | undefined)?.toLowerCase();
    } catch {
      return { ok: false as const, response: json({ error: "Token inválido." }, 401) };
    }
  }

  console.log("leo-admin assertOwner email:", email);

  if (email !== OWNER_EMAIL) {
    return { ok: false as const, response: json({ error: `Acesso restrito ao usuário autorizado. (${email ?? "sem email"})` }, 403) };
  }
  return { ok: true as const };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const auth = await assertOwner(req);
  if (!auth.ok) return auth.response;

  let action: string | undefined;
  let conversationId: string | undefined;
  let keyId: string | undefined;
  let keyValue: any;
  try {
    const raw = await req.text();
    const parsed = raw ? JSON.parse(raw) : {};
    action = parsed?.action;
    conversationId = parsed?.conversationId;
    keyId = parsed?.keyId;
    keyValue = parsed?.keyValue;
  } catch (e: any) {
    console.error("leo-admin body parse error:", e?.message || e);
    return json({ error: "Body inválido (JSON esperado)." }, 400);
  }

  try {

    if (action === "list") {
      const [convRes, keysRes] = await Promise.all([
        supabase
          .from("leo_conversations")
          .select("id,telefone,tipo_cliente,nome_cliente,status,ultima_mensagem_at,created_at")
          .order("ultima_mensagem_at", { ascending: false })
          .limit(100),
        supabase
          .from("leo_api_keys")
          .select("id,key_name,key_value,description,updated_at")
          .order("key_name"),
      ]);

      if (convRes.error) throw convRes.error;
      if (keysRes.error) throw keysRes.error;
      return json({ conversations: convRes.data ?? [], apiKeys: keysRes.data ?? [] });
    }

    if (action === "messages") {
      if (!conversationId) return json({ error: "Conversa não informada." }, 400);
      const { data, error } = await supabase
        .from("leo_messages")
        .select("id,role,content,created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return json({ messages: data ?? [] });
    }

    if (action === "reset-memory") {
      if (!conversationId) return json({ error: "Conversa não informada." }, 400);
      const { error: delError } = await supabase.from("leo_messages").delete().eq("conversation_id", conversationId);
      if (delError) throw delError;
      // Zera ultima_mensagem_at para que o webhook trate como nova sessão e re-saúde.
      // Não alteramos tipo_cliente aqui para não conflitar com a constraint UNIQUE(telefone, tipo_cliente).
      const { error: updError } = await supabase
        .from("leo_conversations")
        .update({ ultima_mensagem_at: new Date(0).toISOString() })
        .eq("id", conversationId);
      if (updError) throw updError;
      return json({ ok: true });
    }

    if (action === "delete-conversation") {
      if (!conversationId) return json({ error: "Conversa não informada." }, 400);
      const { error: msgError } = await supabase.from("leo_messages").delete().eq("conversation_id", conversationId);
      if (msgError) throw msgError;
      const { error: convError } = await supabase.from("leo_conversations").delete().eq("id", conversationId);
      if (convError) throw convError;
      return json({ ok: true });
    }

    if (action === "save-key") {
      if (!keyId) return json({ error: "Chave não informada." }, 400);
      const { error } = await supabase
        .from("leo_api_keys")
        .update({ key_value: String(keyValue ?? ""), updated_at: new Date().toISOString() })
        .eq("id", keyId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (error: any) {
    const detalhe =
      error?.message ||
      error?.error_description ||
      error?.details ||
      error?.hint ||
      error?.code ||
      (typeof error === "string" ? error : "") ||
      JSON.stringify(error, Object.getOwnPropertyNames(error || {})) ||
      "Erro interno.";
    console.error("leo-admin erro:", detalhe, "raw:", JSON.stringify(error));
    return json({ error: detalhe, action }, 500);
  }
});