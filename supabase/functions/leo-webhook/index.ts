// Webhook público do Agente Leo - v1.0.3
// Recebe mensagens da PrimeSync, processa com IA e responde via WhatsApp

import { createClient } from "npm:@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const PRIMESYNC_URL = Deno.env.get("PRIMESYNC_URL")!;
const PRIMESYNC_TOKEN = Deno.env.get("PRIMESYNC_TOKEN")!;
const DOCRYA_API_KEY = Deno.env.get("DOCRYA_API_KEY")!;

const DOCRYA_URL = "https://www.docrya.com/api/v1/html-to-pdf";
const AI_GATEWAY_URL = "https://api.openai.com/v1/chat/completions";
// Modelo OpenAI para vendas
const AI_MODEL = "gpt-4o-mini";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Backend legado (onde estão Clientes, estoque, funil)
const LEGACY_SUPABASE_URL = "https://pdwghmxolqiuyxunglon.supabase.co";
const LEGACY_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkd2dobXhvbHFpdXl4dW5nbG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNjM1NTMsImV4cCI6MjA4NDgzOTU1M30.FmYvMO9HLz-AUUH29TwBbRYA2KMPdyczSjorq3vVDcM";
const legacyDb = createClient(LEGACY_SUPABASE_URL, LEGACY_SUPABASE_KEY, {
  auth: { persistSession: false },
});

// Saudação por horário (timezone Brasil)
function saudacaoHorario(): string {
  const hora = new Date().toLocaleString("en-US", {
    timeZone: "America/Bahia",
    hour: "2-digit",
    hour12: false,
  });
  const h = parseInt(hora, 10);
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

// Normaliza telefone (remove tudo que não for dígito)
function normalizarTelefone(t: string): string {
  return (t || "").replace(/\D/g, "");
}

// Busca cliente no backend legado pelo telefone
async function buscarClientePorTelefone(telefone: string) {
  const tel = normalizarTelefone(telefone);
  if (!tel) return null;
  // tenta variações: completo, sem código país (55), últimos 11 dígitos
  const variacoes = Array.from(new Set([
    tel,
    tel.startsWith("55") ? tel.slice(2) : tel,
    tel.slice(-11),
    tel.slice(-10),
  ].filter(Boolean)));

  for (const v of variacoes) {
    const { data } = await legacyDb
      .from("Clientes")
      .select("CLI_CNPJ, CLI_NOME, CLI_EMAIL, CLI_FONE")
      .ilike("CLI_FONE", `%${v}%`)
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  return null;
}

// Cadastra um novo cliente no backend legado
async function cadastrarCliente(input: {
  nome: string;
  email?: string;
  documento: string; // CNPJ ou CPF
  telefone: string;
}) {
  const { data, error } = await legacyDb
    .from("Clientes")
    .insert({
      CLI_CNPJ: input.documento,
      CLI_NOME: input.nome,
      CLI_EMAIL: input.email || null,
      CLI_FONE: normalizarTelefone(input.telefone),
    })
    .select()
    .single();
  if (error) {
    console.error("Erro ao cadastrar cliente:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true, cliente: data };
}

// ===========================
// CÁLCULO DE ORÇAMENTO
// ===========================
const PRECOS = {
  perfil_fechado: 136.66,
  perfil_transvision: 145.42,
  perfil_oblongo: 162.97,
  eixo_45: 93.05,
  eixo_50: 147.49,
  eixo_65: 264.03,
  guia_50mm: 26.08,
  guia_60mm: 31.69,
  guia_70mm: 36.22,
  guia_100mm: 49.71,
  soleira_t: 59.18,
  reforco_soleira: 37.50,
  ponteira: 11.95,
  pvc_guia: 5.19,
  borracha_soleira: 8.50,
  pintura_branco_liso: 45.00,
  pintura_preta_fosco: 52.00,
  pintura_cinza_texturizado: 58.00,
  pintura_cor_especial: 65.00,
  motor_200kg: 746.75,
  motor_300kg: 762.64,
  motor_400kg: 935.53,
  motor_500kg: 1020.90,
  motor_800kg: 1560.00,
  motor_1500kg: 5375.35,
  controle_remoto: 89.90,
  central_comando: 180.50,
  mao_de_obra_padrao: 800.00,
};

interface OrcamentoInput {
  largura: number;
  altura: number;
  tipo_perfil?: "fechado" | "transvision" | "oblongo";
  tipo_motor?: "200kg" | "300kg" | "400kg" | "500kg" | "800kg" | "1500kg";
  tipo_pintura?: "branco_liso" | "preta_fosco" | "cinza_texturizado" | "cor_especial";
  tipo_cliente: "porta_instalada" | "revenda";
  cidade?: string;
  estado?: string;
  frete?: number;
  cliente_nome?: string;
  cliente_endereco?: string;
}

function calcularOrcamento(input: OrcamentoInput) {
  const { largura, altura, tipo_cliente } = input;
  const tipo_perfil = input.tipo_perfil || "transvision";
  const tipo_motor = input.tipo_motor || "500kg";
  const tipo_pintura = input.tipo_pintura || "branco_liso";

  const area = largura * altura;
  const eixoLen = largura + 0.4;
  const guiaLen = (altura + 0.3) * 2;
  const soleiraLen = largura + 0.2;

  const itens: any[] = [];
  const add = (code: string, desc: string, qty: number, unit: string, preco: number) => {
    itens.push({ code, description: desc, qty, unit, unit_price: preco, subtotal: qty * preco });
  };

  add("COMP-001", `PERFIL BX ${tipo_perfil.toUpperCase()} - CHAPA 22 (0,75)`, area, "M²", (PRECOS as any)[`perfil_${tipo_perfil}`]);
  add("COMP-002", `EIXO TUBO 4.5" - AÇO CARBONO`, eixoLen, "MT", PRECOS.eixo_45);
  add("COMP-003", `GUIA LATERAL 50MM - PERFIL ALUMÍNIO`, guiaLen, "MT", PRECOS.guia_50mm);
  add("COMP-004", `SOLEIRA EM T - CHAPA 16MM`, soleiraLen, "MT", PRECOS.soleira_t);
  add("COMP-005", `REFORÇO DA SOLEIRA EM T - 60x40`, soleiraLen, "MT", PRECOS.reforco_soleira);
  add("COMP-006", `PONTEIRA PARA SOLEIRA 40X60`, 2, "UN", PRECOS.ponteira);
  add("COMP-007", `PVC AUTO LUBRIFICANTE PARA GUIAS`, guiaLen, "MT", PRECOS.pvc_guia);
  add("COMP-008", `ACABAMENTO EM BORRACHA P/ SOLEIRA`, soleiraLen, "MT", PRECOS.borracha_soleira);
  add("COMP-009", `PINTURA ${tipo_pintura.toUpperCase().replace("_", " ")} (ELETROSTÁTICA)`, area, "M²", (PRECOS as any)[`pintura_${tipo_pintura}`]);
  add("COMP-010", `AUTOMATIZADOR ${tipo_motor.toUpperCase()}`, 1, "UN", (PRECOS as any)[`motor_${tipo_motor}`]);
  add("COMP-011", `CONTROLE REMOTO ANALÓGICO`, 2, "UN", PRECOS.controle_remoto);
  add("COMP-012", `CENTRAL DE COMANDO ANALÓGICO`, 1, "UN", PRECOS.central_comando);

  const subtotal_produtos = itens.reduce((s, i) => s + i.subtotal, 0);

  let mao_de_obra = 0;
  let frete = 0;
  if (tipo_cliente === "porta_instalada") {
    mao_de_obra = PRECOS.mao_de_obra_padrao;
    frete = input.frete || 0;
  }

  const total_geral = subtotal_produtos + mao_de_obra + frete;

  return {
    largura, altura, area,
    tipo_cliente, tipo_perfil, tipo_motor, tipo_pintura,
    itens,
    subtotal_produtos: +subtotal_produtos.toFixed(2),
    mao_de_obra: +mao_de_obra.toFixed(2),
    frete: +frete.toFixed(2),
    total_geral: +total_geral.toFixed(2),
    cliente_nome: input.cliente_nome,
    cliente_endereco: input.cliente_endereco,
  };
}

// ===========================
// HTML do orçamento (Docrya/WeasyPrint friendly)
// ===========================
function gerarHtmlOrcamento(o: ReturnType<typeof calcularOrcamento>) {
  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const data = new Date().toLocaleDateString("pt-BR");
  const desconto5 = o.total_geral * 0.95;
  const parc3x = o.total_geral / 3;

  const linhas = o.itens
    .map((i) => {
      const qtyStr = Number.isInteger(i.qty) ? i.qty : i.qty.toFixed(2).replace(".", ",");
      return `<tr>
        <td>${i.code}</td>
        <td>${i.description}</td>
        <td>${qtyStr} ${i.unit}</td>
        <td>${fmt(i.unit_price)}</td>
        <td style="text-align:right">${fmt(i.subtotal)}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-br"><head><meta charset="UTF-8"><title>Orçamento - Eletroportas</title>
<style>
@page { size: A4; margin: 18mm; }
body { font-family: Helvetica, Arial, sans-serif; color: #333; font-size: 11px; }
h1 { color: #004a99; margin: 0 0 4px 0; }
.header { border-bottom: 3px solid #004a99; padding-bottom: 10px; margin-bottom: 18px; }
.muted { color: #666; font-size: 10px; }
.section-title { background: #e9ecef; padding: 6px 10px; font-weight: bold; text-transform: uppercase; margin: 18px 0 8px; font-size: 10px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
th { background:#004a99; color:#fff; padding:6px; text-align:left; font-size:10px; }
td { border-bottom: 1px solid #eee; padding: 6px; font-size: 10px; }
.totais { width: 280px; margin-left: auto; }
.totais td { border: none; padding: 3px 8px; }
.total-row { font-weight: bold; color: #004a99; border-top: 2px solid #004a99; font-size: 13px; }
.box { background:#f8f9fa; border-left:3px solid #004a99; padding:10px; margin:12px 0; }
.delivery { background:#e8f4e8; padding:8px; border-left:3px solid #28a745; margin: 10px 0; }
</style></head><body>

<div class="header">
  <h1>Eletroportas — Portas de Enrolar</h1>
  <div class="muted">CNPJ: 12.345.678/0001-99 · vendas@eletroportas.com.br</div>
</div>

<div class="section-title">Dados do Orçamento</div>
<p><strong>Cliente:</strong> ${o.cliente_nome || "Não informado"}<br/>
<strong>Endereço:</strong> ${o.cliente_endereco || "Não informado"}<br/>
<strong>Tipo:</strong> ${o.tipo_cliente === "porta_instalada" ? "Porta Instalada" : "Revenda"}<br/>
<strong>Data:</strong> ${data}</p>

<div class="delivery">📅 PREVISÃO DE ENTREGA: até 15 dias após assinatura do pedido</div>

<div class="section-title">Especificações</div>
<p>📐 Dimensões: ${o.largura.toFixed(2).replace(".", ",")}m x ${o.altura.toFixed(2).replace(".", ",")}m = ${o.area.toFixed(2).replace(".", ",")}m²<br/>
Perfil: ${o.tipo_perfil} · Motor: ${o.tipo_motor} · Pintura: ${o.tipo_pintura.replace("_", " ")}</p>

<div class="section-title">Itens</div>
<table>
<thead><tr><th>Código</th><th>Descrição</th><th>Qtd</th><th>Preço Unit.</th><th>Subtotal</th></tr></thead>
<tbody>${linhas}</tbody>
</table>

<table class="totais">
<tr><td>Subtotal produtos:</td><td style="text-align:right">${fmt(o.subtotal_produtos)}</td></tr>
${o.mao_de_obra ? `<tr><td>Mão de obra:</td><td style="text-align:right">${fmt(o.mao_de_obra)}</td></tr>` : ""}
${o.frete ? `<tr><td>Frete:</td><td style="text-align:right">${fmt(o.frete)}</td></tr>` : ""}
<tr class="total-row"><td>TOTAL GERAL:</td><td style="text-align:right">${fmt(o.total_geral)}</td></tr>
</table>

<div class="box">
<strong>💳 CONDIÇÕES DE PAGAMENTO</strong><br/>
À VISTA (PIX/Boleto): ${fmt(desconto5)} (5% de desconto)<br/>
CARTÃO até 3x sem juros: 3x de ${fmt(parc3x)}<br/>
ENTRADA + SALDO: 50% entrada + 50% na entrega
</div>

<div class="section-title">Validade</div>
<p>Este orçamento tem validade de 30 dias a partir da data de emissão.</p>

<p style="margin-top:24px; font-size:9px; color:#888">© Eletroportas — Documento gerado automaticamente pelo Agente Leo.</p>

</body></html>`;
}

// ===========================
// PrimeSync — envio
// ===========================
async function enviarTexto(numero: string, texto: string) {
  const r = await fetch(PRIMESYNC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PRIMESYNC_TOKEN}`,
    },
    body: JSON.stringify({ number: numero, body: texto }),
  });
  const txt = await r.text();
  if (!r.ok) console.error("PrimeSync texto erro:", r.status, txt);
  return r.ok;
}

async function enviarPdfBase64(numero: string, base64: string, filename: string, caption?: string) {
  const captionTxt = caption || "Segue seu orçamento em PDF.";
  const dataUrl = `data:application/pdf;base64,${base64}`;

  // Múltiplos formatos conhecidos de APIs estilo Whaticket/PrimeSync/Codechat para envio de documento
  const payloads: Array<Record<string, unknown>> = [
    // 1) Whaticket/PrimeSync — array "medias" com objeto file
    {
      number: numero,
      body: captionTxt,
      medias: [
        {
          name: filename,
          fileName: filename,
          mimetype: "application/pdf",
          mediaType: "document",
          data: base64,
          base64,
        },
      ],
    },
    // 2) PrimeSync — campos planos com data URL
    {
      number: numero,
      body: captionTxt,
      mediaUrl: dataUrl,
      fileName: filename,
      mediaType: "document",
      mimeType: "application/pdf",
    },
    // 3) Codechat/Evolution style
    {
      number: numero,
      caption: captionTxt,
      fileName: filename,
      mediatype: "document",
      mimetype: "application/pdf",
      media: base64,
    },
    // 4) Tentativa antiga (fallback)
    {
      number: numero,
      body: captionTxt,
      media: base64,
      fileName: filename,
      mediaType: "document",
      mimeType: "application/pdf",
    },
  ];

  for (const [idx, payload] of payloads.entries()) {
    try {
      const r = await fetch(PRIMESYNC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PRIMESYNC_TOKEN}`,
        },
        body: JSON.stringify(payload),
      });
      const txt = await r.text();
      const ok = r.ok && !/erro|error|invalid|missing/i.test(txt);
      console.log(`📎 PrimeSync PDF tentativa ${idx + 1}: status=${r.status} ok=${ok} resp=${txt.substring(0, 300)}`);
      if (ok) return true;
    } catch (e) {
      console.error(`📎 PrimeSync PDF tentativa ${idx + 1} exceção:`, e);
    }
  }
  return false;
}

async function transferirParaHumano(ticketId: number) {
  // PrimeSync: transfere o ticket para fila de atendimento humano
  const url = PRIMESYNC_URL.replace(/\/external\/.+$/, `/tickets/${ticketId}/transfer`);
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PRIMESYNC_TOKEN}`,
      },
      body: JSON.stringify({ status: "pending", queueId: null }),
    });
  } catch (e) {
    console.error("Erro ao transferir ticket:", e);
  }
}

// ===========================
// Docrya — gerar PDF
// ===========================
async function gerarPdfDocrya(html: string, filename: string): Promise<string | null> {
  console.log(`📄 Docrya: gerando PDF "${filename}" (html ${html.length} chars)`);
  const r = await fetch(DOCRYA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DOCRYA_API_KEY}`,
    },
    body: JSON.stringify({ html, filename }),
  });
  if (!r.ok) {
    console.error("📄 Docrya erro:", r.status, await r.text());
    return null;
  }
  const buf = new Uint8Array(await r.arrayBuffer());
  console.log(`📄 Docrya OK: ${buf.length} bytes`);
  // base64 em chunks (evita stack overflow)
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ===========================
// IA — Lovable AI Gateway com tools
// ===========================
const SYSTEM_PROMPT = `# IDENTIDADE
Você é o **Leo**, vendedor virtual sênior da **Eletroportas** (portas de enrolar automáticas), em Salvador-BA.
Tom: cordial, consultivo, objetivo e humano. Use português do Brasil. Emojis com MUITA moderação (no máximo 1 por mensagem, só quando agregar).

# OBJETIVO
Conduzir o cliente — passo a passo, sem pressa e sem repetições — até gerar um **orçamento em PDF** adequado ao perfil dele (PORTA INSTALADA na Bahia, ou REVENDA para qualquer estado).

# REGRAS CRÍTICAS (NUNCA VIOLE)
1. **A saudação inicial JÁ FOI ENVIADA pelo sistema** ("Olá, sou o Leo da Eletroportas. Bom dia/Boa tarde/Boa noite!"). NÃO se apresente novamente. NÃO repita "Olá", "Sou o Leo", "Sou seu vendedor virtual" etc. Em qualquer turno seu, comece direto pelo conteúdo.
2. **LEIA O HISTÓRICO COMPLETO antes de cada resposta.** Se uma pergunta já foi feita ou já foi respondida, NUNCA repita. Avance.
3. Se o cliente apenas cumprimenta de volta ("oi", "bom dia", "tudo bem?"), **responda brevemente e já avance** para o próximo passo do fluxo.
4. **NUNCA invente dados, preços ou prazos.** Valores e condições saem APENAS dentro do PDF gerado pela tool.
5. Se algo sair do seu escopo (ex: instalação fora da BA, dúvida técnica complexa, reclamação), chame \`transferir_humano\` com um motivo claro.
6. Use UMA pergunta por vez. Frases curtas. Sem rodeios.

# FLUXO DE VENDAS (siga em ordem, pulando passos já cumpridos)

**Passo 1 — Cadastro (apenas se [CONTEXTO] disser "NÃO CADASTRADO"):**
   Colete, de forma natural e em mensagens curtas: nome completo, e-mail e CNPJ ou CPF. Quando tiver os 3, chame \`cadastrar_cliente\`. Se [CONTEXTO] já disser "JÁ CADASTRADO", pule este passo e cumprimente o cliente pelo nome 1 única vez.

**Passo 2 — Tipo de atendimento:**
   Pergunte UMA vez: "Você tem interesse em **PORTA INSTALADA** ou em **REVENDA**?"
   - PORTA INSTALADA → atendemos só na BAHIA. Se for fora da BA, chame \`transferir_humano\`.
   - REVENDA → atendemos qualquer estado, sem mão de obra/frete.

**Passo 3 — Medidas:**
   "Qual a **largura e altura** da porta, em metros? (ex: 4x3)"

**Passo 4 — Tipo de lâmina:**
   "Qual o tipo da lâmina?
   1️⃣ FECHADA (lisa, sem visão)
   2️⃣ TRANSVISION (com visores)
   3️⃣ OBLONGO (perfurada)"
   Mapeie a resposta para \`tipo_perfil\`: fechado | transvision | oblongo.

**Passo 5 — Gerar orçamento:**
   Com largura, altura, tipo_cliente e tipo_perfil definidos, chame **imediatamente** a tool \`gerar_orcamento\`. Não peça mais nada.
   Após a tool retornar \`pdf_enviado: true\`, responda APENAS algo como:
   "Pronto! Te enviei o orçamento em PDF, dá uma olhada por favor. Qualquer dúvida estou por aqui. 📄"

# ANTI-LOOP
Antes de escrever qualquer resposta, faça mentalmente este check:
- "O cliente já respondeu o que eu ia perguntar?" → se sim, **avance**.
- "Eu já fiz essa pergunta no histórico?" → se sim, **NUNCA repita** — reformule pedindo a informação que falta ou avance.
- "O cliente só me cumprimentou?" → responda em 1 frase curta e **siga para o próximo passo do fluxo**.
`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "gerar_orcamento",
      description: "Gera o orçamento PDF e envia ao cliente via WhatsApp. Use quando tiver largura, altura e tipo_cliente.",
      parameters: {
        type: "object",
        properties: {
          largura: { type: "number", description: "Largura da porta em metros" },
          altura: { type: "number", description: "Altura da porta em metros" },
          tipo_cliente: { type: "string", enum: ["porta_instalada", "revenda"] },
          tipo_perfil: { type: "string", enum: ["fechado", "transvision", "oblongo"] },
          tipo_motor: { type: "string", enum: ["200kg", "300kg", "400kg", "500kg", "800kg", "1500kg"] },
          tipo_pintura: { type: "string", enum: ["branco_liso", "preta_fosco", "cinza_texturizado", "cor_especial"] },
          cidade: { type: "string" },
          estado: { type: "string", description: "UF, ex: BA" },
          frete: { type: "number", description: "Frete em R$ (apenas porta_instalada e BA)" },
          cliente_nome: { type: "string" },
          cliente_endereco: { type: "string" },
        },
        required: ["largura", "altura", "tipo_cliente", "tipo_perfil"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cadastrar_cliente",
      description: "Cadastra um novo cliente no banco de dados. Use APENAS quando tiver coletado nome, e-mail e CNPJ/CPF do cliente novo.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome completo do cliente" },
          email: { type: "string", description: "E-mail do cliente" },
          documento: { type: "string", description: "CNPJ ou CPF (apenas números ou formatado)" },
        },
        required: ["nome", "documento"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transferir_humano",
      description: "Transfere a conversa para um atendente humano. Use quando: cliente porta instalada fora da BA, cliente quer falar com humano, ou situação fora do seu escopo.",
      parameters: {
        type: "object",
        properties: { motivo: { type: "string" } },
        required: ["motivo"],
      },
    },
  },
];

async function chamarIA(messages: any[]) {
  const r = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      tools: TOOLS,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("IA erro:", r.status, t);
    throw new Error(`IA ${r.status}: ${t}`);
  }
  return await r.json();
}

// ===========================
// Conversa — DB
// ===========================
// Janela de inatividade: após 3h sem mensagem, considera "nova sessão" e re-saúda
const SESSION_GAP_MS = 3 * 60 * 60 * 1000;

async function getOuCriarConversa(telefone: string, nome?: string) {
  const { data: existing } = await supabase
    .from("leo_conversations")
    .select("*")
    .eq("telefone", telefone)
    .eq("status", "ativa")
    .order("ultima_mensagem_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const ultima = new Date(existing.ultima_mensagem_at || existing.created_at).getTime();
    const inativaHaMuito = Date.now() - ultima > SESSION_GAP_MS;
    // Reabre a mesma conversa, mas marca como "nova sessão" para re-saudar
    return { conversa: existing, isNova: inativaHaMuito };
  }

  const { data, error } = await supabase
    .from("leo_conversations")
    .insert({ telefone, tipo_cliente: "indefinido", nome_cliente: nome })
    .select()
    .single();
  if (error) throw error;
  return { conversa: data, isNova: true };
}

async function salvarMensagem(conversation_id: string, role: string, content: string, metadata: any = {}) {
  const { error } = await supabase.from("leo_messages").insert({ conversation_id, role, content, metadata });
  if (error) throw error;
}

async function carregarHistorico(conversation_id: string) {
  const { data } = await supabase
    .from("leo_messages")
    .select("role, content")
    .eq("conversation_id", conversation_id)
    .order("created_at", { ascending: true })
    .limit(40);
  return (data || []).map((m) => ({ role: m.role, content: m.content }));
}

// ===========================
// Handler principal
// ===========================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Permite GET para health check
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, service: "leo-webhook" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const raw = await req.json();
    console.log("📨 Webhook recebido:", JSON.stringify(raw).substring(0, 800));

    const payload = Array.isArray(raw) ? raw[0] : raw;
    const body = payload?.body || payload;

    // Ignora mensagens enviadas por nós mesmos
    if (body?.fromMe === true) {
      console.log("⏭️ Ignorado: fromMe=true");
      return new Response(JSON.stringify({ ignored: "fromMe" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Só processa texto por enquanto
    const mediaType = body?.mediaType || "chat";
    if (mediaType !== "chat" && mediaType !== "text") {
      console.log("⏭️ Ignorado: mediaType=", mediaType);
      return new Response(JSON.stringify({ ignored: "media" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messageBody: string = body?.messageBody || "";
    const contact = body?.contact || {};
    const telefone: string = contact?.phoneNumber || body?.from || "";
    const nome: string = contact?.name || contact?.pushname || "";
    const ticketId: number | undefined = body?.ticket?.id;

    console.log(`📞 De: ${telefone} (${nome}) | Msg: "${messageBody}"`);

    if (!telefone || !messageBody) {
      console.log("⏭️ Ignorado: campos faltando");
      return new Response(JSON.stringify({ ignored: "missing_fields" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { conversa, isNova } = await getOuCriarConversa(telefone, nome);

    // Conversa encerrada (já foi transferida) → não responde
    if (conversa.status === "encerrada") {
      return new Response(JSON.stringify({ ignored: "encerrada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lookup do cliente no backend legado
    const clienteExistente = await buscarClientePorTelefone(telefone);

    // Em conversa nova, envia saudação fixa antes da IA
    if (isNova) {
      const saudacao = `Olá, sou o Leo da Eletroportas. ${saudacaoHorario()}!`;
      await enviarTexto(telefone, saudacao);
      await salvarMensagem(conversa.id, "assistant", saudacao);
    }

    await salvarMensagem(conversa.id, "user", messageBody);
    await supabase
      .from("leo_conversations")
      .update({ ultima_mensagem_at: new Date().toISOString(), nome_cliente: conversa.nome_cliente || nome || null })
      .eq("id", conversa.id);

    const historicoDb = await carregarHistorico(conversa.id);
    const historicoTemMensagemAtual = historicoDb.some(
      (m) => m.role === "user" && m.content.trim().toLowerCase() === messageBody.trim().toLowerCase()
    );
    const historico = historicoTemMensagemAtual
      ? historicoDb
      : [...historicoDb, { role: "user", content: messageBody }];

    // Contexto do cliente (única instrução determinística — o resto é decisão do agente)
    const contextoCliente = clienteExistente
      ? `[CONTEXTO] Cliente JÁ CADASTRADO: ${clienteExistente.CLI_NOME || "(sem nome)"} | CNPJ/CPF: ${clienteExistente.CLI_CNPJ} | Email: ${clienteExistente.CLI_EMAIL || "(não informado)"}. NÃO peça cadastro novamente. Pode tratá-lo pelo primeiro nome.`
      : `[CONTEXTO] Cliente NÃO CADASTRADO (telefone ${telefone}). Inicie pelo Passo 1 (cadastro).`;

    console.log(`🧭 Histórico: ${historico.length} msgs | Cliente: ${clienteExistente ? "cadastrado" : "novo"}`);

    // Loop do agente: até 5 iterações de tool calling
    let messages: any[] = [
      { role: "system", content: contextoCliente },
      ...historico,
    ];
    let respostaFinal = "";
    for (let i = 0; i < 5; i++) {
      const ai = await chamarIA(messages);
      const choice = ai.choices?.[0]?.message;
      if (!choice) break;

      const toolCalls = choice.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        respostaFinal = choice.content || "";
        break;
      }

      // Adiciona mensagem do assistant com tool_calls
      messages.push(choice);

      for (const tc of toolCalls) {
        const fnName = tc.function?.name;
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}

        let toolResult: any = {};

        if (fnName === "gerar_orcamento") {
          try {
            const o = calcularOrcamento({
              largura: Number(args.largura),
              altura: Number(args.altura),
              tipo_cliente: args.tipo_cliente,
              tipo_perfil: args.tipo_perfil,
              tipo_motor: args.tipo_motor,
              tipo_pintura: args.tipo_pintura,
              frete: args.frete ? Number(args.frete) : 0,
              cliente_nome: args.cliente_nome || nome,
              cliente_endereco: args.cliente_endereco,
            });

            const html = gerarHtmlOrcamento(o);
            const filename = `orcamento_${Date.now()}.pdf`;
            const pdfB64 = await gerarPdfDocrya(html, filename);

            if (pdfB64) {
              await enviarPdfBase64(telefone, pdfB64, filename, "Pronto! Segue seu orçamento em PDF, dá uma olhada por favor. 📄");
              toolResult = {
                ok: true,
                total_geral: o.total_geral,
                subtotal_produtos: o.subtotal_produtos,
                mao_de_obra: o.mao_de_obra,
                frete: o.frete,
                pdf_enviado: true,
                instrucao: "Apenas confirme ao cliente que o PDF foi enviado. NÃO mencione valores no chat.",
              };
            } else {
              toolResult = { ok: false, error: "Falha ao gerar PDF — informe ao cliente que enviaremos em breve." };
            }

            // atualiza tipo_cliente na conversa
            await supabase
              .from("leo_conversations")
              .update({ tipo_cliente: args.tipo_cliente, ultima_mensagem_at: new Date().toISOString() })
              .eq("id", conversa.id);
          } catch (e: any) {
            toolResult = { ok: false, error: e.message };
          }
        } else if (fnName === "cadastrar_cliente") {
          const r = await cadastrarCliente({
            nome: String(args.nome || nome || "").trim(),
            email: args.email ? String(args.email).trim() : undefined,
            documento: String(args.documento || "").replace(/\D/g, ""),
            telefone,
          });
          if (r.ok) {
            await supabase
              .from("leo_conversations")
              .update({ nome_cliente: args.nome })
              .eq("id", conversa.id);
            toolResult = {
              ok: true,
              instrucao: "Cliente cadastrado. Agora pergunte se ele tem interesse na PORTA INSTALADA ou em REVENDA.",
            };
          } else {
            toolResult = { ok: false, error: r.error };
          }
        } else if (fnName === "transferir_humano") {
          if (ticketId) await transferirParaHumano(ticketId);
          await supabase.from("leo_conversations").update({ status: "encerrada" }).eq("id", conversa.id);
          toolResult = { ok: true, transferido: true };
        }

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult),
        });
      }
    }

    if (respostaFinal) {
      await salvarMensagem(conversa.id, "assistant", respostaFinal);
      await enviarTexto(telefone, respostaFinal);
    }

    await supabase
      .from("leo_conversations")
      .update({ ultima_mensagem_at: new Date().toISOString() })
      .eq("id", conversa.id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("leo-webhook erro:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
