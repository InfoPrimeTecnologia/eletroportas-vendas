// Aprova/Reprova um cadastro pendente de Serralheiro:
// - Atualiza tipo_cliente no backend legado (Clientes)
// - Envia mensagem ao cliente via PrimeSync (WhatsApp)

import { createClient } from "npm:@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRIMESYNC_URL = Deno.env.get("PRIMESYNC_URL")!;
const PRIMESYNC_TOKEN = Deno.env.get("PRIMESYNC_TOKEN")!;

const LEGACY_SUPABASE_URL = "https://pdwghmxolqiuyxunglon.supabase.co";
const LEGACY_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkd2dobXhvbHFpdXl4dW5nbG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNjM1NTMsImV4cCI6MjA4NDgzOTU1M30.FmYvMO9HLz-AUUH29TwBbRYA2KMPdyczSjorq3vVDcM";

const legacyDb = createClient(LEGACY_SUPABASE_URL, LEGACY_SUPABASE_KEY, {
  auth: { persistSession: false },
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function normalizarTelefone(t: string): string {
  return (t || "").replace(/\D/g, "");
}

async function enviarTexto(numero: string, texto: string) {
  const tel = normalizarTelefone(numero);
  if (!tel) return false;
  try {
    const r = await fetch(PRIMESYNC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PRIMESYNC_TOKEN}`,
      },
      body: JSON.stringify({ number: tel, body: texto }),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error("PrimeSync erro:", r.status, txt);
      return false;
    }
    return true;
  } catch (e) {
    console.error("PrimeSync exceção:", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const cnpj = String(body?.cnpj || "").trim();
    const aprovado = Boolean(body?.aprovado);
    if (!cnpj) {
      return new Response(JSON.stringify({ ok: false, error: "cnpj obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Carrega cliente
    const { data: cliente, error: errSel } = await legacyDb
      .from("Clientes")
      .select("CLI_CNPJ, CLI_NOME, CLI_FONE, tipo_cliente")
      .eq("CLI_CNPJ", cnpj)
      .maybeSingle();
    if (errSel) throw errSel;
    if (!cliente) {
      return new Response(JSON.stringify({ ok: false, error: "Cliente não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const novoTipo = aprovado ? "Revenda" : "Porta Instalada";

    const { error: errUpd } = await legacyDb
      .from("Clientes")
      .update({ tipo_cliente: novoTipo })
      .eq("CLI_CNPJ", cnpj);
    if (errUpd) throw errUpd;

    // Atualiza também a conversa ativa do Leo (se houver) para refletir o novo tipo
    const tel = normalizarTelefone(cliente.CLI_FONE || "");
    if (tel) {
      try {
        const tipoConv = aprovado ? "revenda" : "porta_instalada";
        await supabase
          .from("leo_conversations")
          .update({ tipo_cliente: tipoConv })
          .eq("telefone", tel);
      } catch (e) {
        console.warn("Falha ao sincronizar leo_conversations:", e);
      }
    }

    // Mensagens ao cliente
    const primeiroNome = (cliente.CLI_NOME || "").trim().split(/\s+/)[0] || "";
    const ola = primeiroNome ? `Olá, ${primeiroNome}! ` : "Olá! ";
    const mensagem = aprovado
      ? `${ola}✅ Seu cadastro como *Serralheiro/Revenda* foi *APROVADO* aqui na Eletroportas. A partir de agora você terá acesso às nossas condições especiais de revenda. Sempre que precisar de um orçamento, é só chamar por aqui! 🤝`
      : `${ola}Seu cadastro como *Serralheiro/Revenda* não foi aprovado neste momento. Por isso, você foi classificado como *Consumidor Final* e poderá seguir orçando normalmente nossas portas com instalação. Qualquer dúvida, estamos à disposição! 🙏`;

    let enviado = false;
    if (tel) {
      enviado = await enviarTexto(tel, mensagem);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        cliente: cliente.CLI_NOME,
        tipo_cliente: novoTipo,
        mensagem_enviada: enviado,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("validar-serralheiro erro:", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || "erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
