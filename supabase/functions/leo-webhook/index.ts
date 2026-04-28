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
    const { data, error } = await legacyDb
      .from("Clientes")
      .select("CLI_CNPJ, CLI_NOME, CLI_EMAIL, CLI_FONE, CLI_CPF, tipo_cliente")
      .ilike("CLI_FONE", `%${v}%`)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("buscarClientePorTelefone erro:", error?.message || error);
      continue;
    }
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
  tipo_cliente?: "porta_instalada" | "revenda";
}) {
  const nome = (input.nome || "").trim();
  const documento = (input.documento || "").replace(/\D/g, "");
  const telefone = normalizarTelefone(input.telefone);
  const isCPF = documento.length === 11;
  const isCNPJ = documento.length === 14;

  const faltando: string[] = [];
  if (!nome) faltando.push("nome completo");
  if (!documento) faltando.push("CNPJ ou CPF");
  if (faltando.length) {
    return { ok: false, error: `Dados faltando: ${faltando.join(", ")}. Peça ao cliente educadamente.` };
  }
  if (!isCPF && !isCNPJ) {
    return { ok: false, error: "Documento inválido (CPF deve ter 11 dígitos, CNPJ 14). Peça novamente." };
  }

  const payload: Record<string, unknown> = {
    CLI_NOME: nome,
    CLI_EMAIL: input.email || null,
    CLI_FONE: telefone,
    CLI_CNPJ: documento, // PK – guarda o documento informado (CPF ou CNPJ)
    CLI_CPF: isCPF ? documento : null,
  };
  if (input.tipo_cliente) {
    payload.tipo_cliente = input.tipo_cliente === "porta_instalada" ? "Porta Instalada" : "Revenda";
  }

  // Verifica se já existe pelo CNPJ (PK) — evita duplicate key
  const { data: existente } = await legacyDb
    .from("Clientes")
    .select("CLI_CNPJ")
    .eq("CLI_CNPJ", documento)
    .maybeSingle();
  if (existente) {
    const { error: updErr } = await legacyDb
      .from("Clientes")
      .update(payload)
      .eq("CLI_CNPJ", documento);
    if (updErr) {
      console.error("Erro ao atualizar cliente:", updErr);
      return { ok: false, error: updErr.message || "Falha ao atualizar cadastro." };
    }
    return { ok: true, cliente: { CLI_CNPJ: documento, CLI_NOME: nome }, atualizado: true };
  }

  const { data, error } = await legacyDb
    .from("Clientes")
    .insert(payload)
    .select()
    .single();
  if (error) {
    console.error("Erro ao cadastrar cliente:", error);
    return { ok: false, error: error.message || "Falha ao cadastrar." };
  }
  return { ok: true, cliente: data };
}

// Atualiza o tipo_cliente na tabela legada Clientes (procurando pelo telefone)
async function atualizarTipoClienteLegado(telefone: string, tipo: "porta_instalada" | "revenda") {
  const tel = normalizarTelefone(telefone);
  if (!tel) return;
  const valor = tipo === "porta_instalada" ? "Porta Instalada" : "Revenda";
  const variacoes = Array.from(new Set([
    tel,
    tel.startsWith("55") ? tel.slice(2) : tel,
    tel.slice(-11),
    tel.slice(-10),
  ].filter(Boolean)));
  for (const v of variacoes) {
    const { data: found } = await legacyDb
      .from("Clientes")
      .select("CLI_CNPJ")
      .ilike("CLI_FONE", `%${v}%`)
      .limit(1)
      .maybeSingle();
    if (found?.CLI_CNPJ) {
      const { error } = await legacyDb
        .from("Clientes")
        .update({ tipo_cliente: valor })
        .eq("CLI_CNPJ", found.CLI_CNPJ);
      if (error) console.error("⚠️ Falha ao atualizar tipo_cliente legado:", error.message);
      else console.log(`✅ tipo_cliente legado atualizado para "${valor}" (CNPJ ${found.CLI_CNPJ})`);
      return;
    }
  }
  console.warn(`⚠️ Cliente ${tel} não encontrado no legado para atualizar tipo_cliente`);
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

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
        <td>${escapeHtml(i.code)}</td>
        <td>${escapeHtml(i.description)}</td>
        <td>${qtyStr} ${i.unit}</td>
        <td>${fmt(i.unit_price)}</td>
        <td style="text-align:right">${fmt(i.subtotal)}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-br"><head><meta charset="UTF-8"><title>Orçamento - Eletroportas</title>
<style>
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body { font-family: Helvetica, Arial, sans-serif; color: #233142; font-size: 10px; line-height: 1.35; }
h1 { color: #0f4c81; margin: 0; font-size: 22px; letter-spacing: 0; }
h2 { color: #0f4c81; margin: 0 0 6px; font-size: 12px; text-transform: uppercase; }
p { margin: 0 0 8px; }
.header { display: table; width: 100%; border-bottom: 4px solid #f2a51a; padding-bottom: 12px; margin-bottom: 14px; }
.brand, .doc-meta { display: table-cell; vertical-align: top; }
.doc-meta { width: 170px; text-align: right; color: #526173; font-size: 9px; }
.logo-row { display: table; width: 100%; }
.logo-mark, .logo-copy { display: table-cell; vertical-align: middle; }
.logo-mark { width: 54px; height: 54px; background: #0f4c81; color: #ffffff; border-radius: 8px; text-align: center; font-weight: bold; font-size: 20px; line-height: 54px; border-bottom: 6px solid #f2a51a; }
.logo-copy { padding-left: 10px; }
.tagline { color: #f2a51a; font-weight: bold; font-size: 10px; text-transform: uppercase; margin-top: 2px; }
.muted { color: #526173; font-size: 9px; }
.grid { display: table; width: 100%; margin-bottom: 10px; }
.col { display: table-cell; vertical-align: top; width: 50%; padding-right: 8px; }
.card { border: 1px solid #d7dde5; padding: 9px; background: #fbfcfd; page-break-inside: avoid; }
.section-title { background: #0f4c81; color:#ffffff; padding: 6px 9px; font-weight: bold; text-transform: uppercase; margin: 12px 0 7px; font-size: 9px; page-break-after: avoid; }
table { width: 100%; border-collapse: collapse; margin-bottom: 10px; page-break-inside: auto; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th { background:#233142; color:#fff; padding:5px; text-align:left; font-size:8.5px; }
td { border-bottom: 1px solid #e6eaf0; padding: 5px; font-size: 8.8px; vertical-align: top; }
.totais { width: 285px; margin-left: auto; page-break-inside: avoid; }
.totais td { border: none; padding: 3px 8px; font-size: 10px; }
.total-row td { font-weight: bold; color: #0f4c81; border-top: 2px solid #0f4c81; font-size: 13px; padding-top: 6px; }
.box { background:#fbfcfd; border-left:4px solid #0f4c81; padding:9px; margin:10px 0; page-break-inside: avoid; }
.delivery { background:#fff7e6; padding:8px; border-left:4px solid #f2a51a; margin: 9px 0; font-weight: bold; page-break-inside: avoid; }
.terms { display: table; width: 100%; border-spacing: 0 8px; }
.term { display: table-row; page-break-inside: avoid; }
.term strong, .term span { display: table-cell; padding: 8px; border-top: 1px solid #d7dde5; border-bottom: 1px solid #d7dde5; }
.term strong { width: 120px; color: #0f4c81; border-left: 4px solid #f2a51a; background: #fbfcfd; }
.term span { border-right: 1px solid #d7dde5; }
.footer { margin-top:18px; padding-top:8px; border-top:1px solid #d7dde5; font-size:8.5px; color:#66758a; }
</style></head><body>

<div class="header">
  <div class="brand">
    <div class="logo-row">
      <div class="logo-mark">EP</div>
      <div class="logo-copy">
        <h1>Eletroportas</h1>
        <div class="tagline">Portas de Enrolar Automáticas</div>
        <div class="muted">Salvador-BA · Atendimento para instalação e revenda</div>
      </div>
    </div>
  </div>
  <div class="doc-meta">
    <strong>ORÇAMENTO COMERCIAL</strong><br/>
    Emissão: ${data}<br/>
    Validade: 30 dias<br/>
    Gerado pelo Agente Leo
  </div>
</div>

<div class="grid">
  <div class="col">
    <div class="card">
      <h2>Dados do cliente</h2>
      <strong>Cliente:</strong> ${escapeHtml(o.cliente_nome || "Não informado")}<br/>
      <strong>Endereço:</strong> ${escapeHtml(o.cliente_endereco || "Não informado")}<br/>
      <strong>Tipo:</strong> ${o.tipo_cliente === "porta_instalada" ? "Porta Instalada" : "Revenda"}
    </div>
  </div>
  <div class="col" style="padding-right:0">
    <div class="card">
      <h2>Especificações</h2>
      <strong>Dimensões:</strong> ${o.largura.toFixed(2).replace(".", ",")}m x ${o.altura.toFixed(2).replace(".", ",")}m<br/>
      <strong>Área:</strong> ${o.area.toFixed(2).replace(".", ",")}m²<br/>
      <strong>Perfil:</strong> ${escapeHtml(o.tipo_perfil)} · <strong>Motor:</strong> ${escapeHtml(o.tipo_motor)} · <strong>Pintura:</strong> ${escapeHtml(o.tipo_pintura.replace("_", " "))}
    </div>
  </div>
</div>

<div class="delivery">PREVISÃO DE ENTREGA: até 15 dias após assinatura do pedido, sujeito à confirmação comercial e disponibilidade.</div>

<div class="section-title">Itens do orçamento</div>
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
<strong>CONDIÇÕES DE PAGAMENTO</strong><br/>
À VISTA (PIX/Boleto): ${fmt(desconto5)} (5% de desconto)<br/>
CARTÃO até 3x sem juros: 3x de ${fmt(parc3x)}<br/>
ENTRADA + SALDO: 50% entrada + 50% na entrega
</div>

<div class="section-title">Garantia e observações comerciais</div>
<div class="terms">
  <div class="term"><strong>Garantia</strong><span>Garantia conforme certificado emitido pela Eletroportas, válida para defeitos de fabricação e instalação quando contratada. Não cobre mau uso, danos elétricos externos, impactos ou alterações por terceiros.</span></div>
  <div class="term"><strong>Instalação</strong><span>${o.tipo_cliente === "porta_instalada" ? "Inclui mão de obra quando indicada nos totais. Local deve estar liberado, nivelado e com ponto elétrico adequado." : "Orçamento para revenda/fornecimento, sem mão de obra de instalação e sem frete."}</span></div>
  <div class="term"><strong>Validade</strong><span>Este orçamento tem validade de 30 dias a partir da data de emissão.</span></div>
  <div class="term"><strong>Aprovação</strong><span>Produção iniciada após confirmação do pedido, assinatura/aceite comercial e pagamento conforme condição negociada.</span></div>
</div>

<div class="footer">© Eletroportas — Documento gerado automaticamente pelo Agente Leo. Valores sujeitos à conferência final por atendimento comercial.</div>

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

function base64ToBlob(base64: string, mimeType: string) {
  const clean = base64.includes(",") ? base64.split(",").pop() || "" : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

async function enviarPdfBase64(numero: string, base64: string, filename: string, caption?: string) {
  const captionTxt = caption || "Segue seu orçamento em PDF.";

  // Whaticket/PrimeSync envia mídia como multipart/form-data; JSON com "medias"
  // costuma enfileirar só o texto e descartar o anexo.
  const pdfBlob = base64ToBlob(base64, "application/pdf");
  const formVariants = [
    { fileField: "medias", captionField: "body" },
    { fileField: "medias", captionField: "caption" },
    { fileField: "media", captionField: "body" },
  ];

  for (const [idx, variant] of formVariants.entries()) {
    try {
      const form = new FormData();
      form.append("number", numero);
      form.append(variant.captionField, captionTxt);
      form.append("fileName", filename);
      form.append("mediaType", "document");
      form.append("mimetype", "application/pdf");
      form.append(variant.fileField, pdfBlob, filename);

      const r = await fetch(PRIMESYNC_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PRIMESYNC_TOKEN}`,
        },
        body: form,
      });
      const txt = await r.text();
      const ok = r.ok && !/erro|error|invalid|missing/i.test(txt);
      console.log(`📎 PrimeSync PDF multipart ${idx + 1} (${variant.fileField}/${variant.captionField}): status=${r.status} ok=${ok} bytes=${pdfBlob.size} resp=${txt.substring(0, 300)}`);
      if (ok) return true;
    } catch (e) {
      console.error(`📎 PrimeSync PDF multipart ${idx + 1} exceção:`, e);
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

⚠️ **PRINCÍPIO FUNDAMENTAL**: O sistema mantém um **[ESTADO]** estruturado da conversa (tipo_cliente, largura, altura, tipo_perfil, cep, frete). Esse estado é a ÚNICA fonte de verdade — ignore o que está no histórico de chat para decidir o que falta. Olhe SEMPRE para o [ESTADO] injetado no system prompt. Cada vez que o cliente responder algo, chame a tool correspondente para gravar no banco; só assim o [ESTADO] avança.

**Passo 1 — Cadastro (apenas se [CONTEXTO] disser "NÃO CADASTRADO"):**
   Colete: nome completo, e-mail e CNPJ ou CPF. Quando tiver os 3, chame \`cadastrar_cliente\`. Se [CONTEXTO] já disser "JÁ CADASTRADO", pule este passo.

**Passo 2 — Tipo de atendimento** (pular se [ESTADO] já tiver tipo_cliente):
   "Você tem interesse em **PORTA INSTALADA** ou em **REVENDA**?"
   - PORTA INSTALADA → atendemos só na BAHIA.
   - REVENDA → qualquer estado, sem mão de obra/frete.
   ⚠️ Assim que o cliente responder, chame **IMEDIATAMENTE** \`definir_tipo_cliente\` (silenciosa) e na MESMA rodada já avance para o Passo 3.

**Passo 3 — Medidas** (pular se [ESTADO] já tiver largura E altura):
   "Qual a **largura e altura** da porta, em metros? (ex: 4x3)"
   Quando o cliente responder (ex: "4x5", "4 por 5", "4 metros por 5"), chame **IMEDIATAMENTE** \`definir_medidas\` com largura=4 e altura=5. É silenciosa — na mesma rodada já avance para o Passo 4.

**Passo 4 — Tipo de lâmina** (pular se [ESTADO] já tiver tipo_perfil):
   "Qual o tipo da lâmina?
   1️⃣ FECHADA (lisa, sem visão)
   2️⃣ TRANSVISION (com visores)
   3️⃣ OBLONGO (perfurada)"
   Mapeie: "lisa"/"fechada"/"meia cana"/"1" → fechado; "transvision"/"visor"/"2" → transvision; "oblongo"/"perfurada"/"3" → oblongo.
   Quando o cliente responder, chame **IMEDIATAMENTE** \`definir_lamina\` (silenciosa) e avance.

**Passo 5 — CEP e frete** (APENAS se tipo_cliente=porta_instalada e [ESTADO] não tiver frete):
   "Por último, qual o **CEP do local da instalação**? Assim calculo o frete certinho."
   Quando o cliente informar o CEP, chame **imediatamente** \`calcular_frete_cep\`.
   - Se \`fora_da_bahia: true\`, chame \`transferir_humano\`.
   - Se \`ok: true\`, **NÃO mencione o valor do frete** — siga direto para o Passo 6.
   Para REVENDA, pule este passo.

**Passo 6 — Gerar orçamento** (quando [ESTADO] tiver TODOS os dados necessários):
   Chame \`gerar_orcamento\` (sem argumentos — ele lê do [ESTADO] no banco). Após \`pdf_enviado: true\`, NÃO envie mensagem extra — o sistema já mandou a legenda do PDF.

# ANTI-LOOP / ANTI-ALUCINAÇÃO (CRÍTICO)
- O **[ESTADO]** é a única fonte de verdade do que falta. Se [ESTADO] mostra "largura=PENDENTE", pergunte largura. Se mostra "largura=4, altura=5, tipo_perfil=PENDENTE", pergunte a lâmina. NUNCA pergunte algo que já está preenchido no [ESTADO].
- **NUNCA** chame \`gerar_orcamento\` se o [ESTADO] tiver QUALQUER campo obrigatório como "PENDENTE". Se chamar, vai retornar \`DADOS_INSUFICIENTES\` e o sistema vai te corrigir.
- Se o cliente apenas cumprimenta ("oi", "bom dia"), responda em 1 frase curta e pergunte o próximo dado pendente do [ESTADO].
- Use UMA pergunta por vez. Frases curtas. Sem rodeios. NUNCA invente dados, preços ou prazos.
`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "gerar_orcamento",
      description: "Gera o orçamento PDF e envia ao cliente via WhatsApp. NÃO precisa de argumentos — lê automaticamente do [ESTADO] gravado no banco (largura, altura, tipo_cliente, tipo_perfil, frete). Se faltar algum dado, retorna DADOS_INSUFICIENTES.",
      parameters: {
        type: "object",
        properties: {
          tipo_motor: { type: "string", enum: ["200kg", "300kg", "400kg", "500kg", "800kg", "1500kg"], description: "Opcional, default 300kg" },
          tipo_pintura: { type: "string", enum: ["branco_liso", "preta_fosco", "cinza_texturizado", "cor_especial"], description: "Opcional" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cadastrar_cliente",
      description: "Cadastra um novo cliente no banco de dados. Use APENAS quando tiver coletado nome completo e CNPJ (ou CPF). Email é opcional — pode chamar sem se o cliente não quis informar.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome completo do cliente" },
          email: { type: "string", description: "E-mail do cliente (opcional)" },
          documento: { type: "string", description: "CNPJ ou CPF (apenas números ou formatado)" },
          tipo_cliente: { type: "string", enum: ["porta_instalada", "revenda"], description: "Tipo confirmado pelo cliente, se já souber" },
        },
        required: ["nome", "documento"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calcular_frete_cep",
      description: "Calcula o frete a partir do CEP do cliente (apenas para PORTA INSTALADA na Bahia). Retorna o valor do frete em reais e o endereço resumido. Se o CEP for fora da Bahia, retorna fora_da_bahia=true.",
      parameters: {
        type: "object",
        properties: {
          cep: { type: "string", description: "CEP informado pelo cliente (com ou sem traço)" },
        },
        required: ["cep"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "definir_tipo_cliente",
      description: "Registra IMEDIATAMENTE no banco de dados o tipo de atendimento que o cliente escolheu. Chame ASSIM QUE o cliente responder 'porta instalada', 'instalada', 'quero instalar', 'revenda', 'para revender' ou equivalente. NÃO espere coletar mais dados. Esta tool é silenciosa — não envia mensagem ao cliente, apenas grava no banco.",
      parameters: {
        type: "object",
        properties: {
          tipo_cliente: { type: "string", enum: ["porta_instalada", "revenda"] },
        },
        required: ["tipo_cliente"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "definir_medidas",
      description: "Grava no banco a largura e altura da porta informadas pelo cliente. Chame ASSIM QUE o cliente responder o Passo 3 (ex: '4x5', '4 por 3', '4 metros por 3'). Silenciosa — não envia mensagem. Na MESMA rodada já avance para o Passo 4 (lâmina).",
      parameters: {
        type: "object",
        properties: {
          largura: { type: "number", description: "Largura em metros (ex: 4)" },
          altura: { type: "number", description: "Altura em metros (ex: 3)" },
        },
        required: ["largura", "altura"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "definir_lamina",
      description: "Grava no banco o tipo de lâmina escolhido pelo cliente. Chame ASSIM QUE o cliente responder o Passo 4. Silenciosa. Na MESMA rodada avance para o próximo passo (CEP se porta_instalada, ou direto gerar_orcamento se revenda).",
      parameters: {
        type: "object",
        properties: {
          tipo_perfil: { type: "string", enum: ["fechado", "transvision", "oblongo"] },
        },
        required: ["tipo_perfil"],
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
  // Timeout generoso (30s) para o agente "pensar com calma" sem travar a request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  try {
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
        temperature: 0.2, // resposta mais previsível e fiel ao fluxo
        top_p: 0.9,
      }),
      signal: controller.signal,
    });
    if (!r.ok) {
      const t = await r.text();
      console.error("IA erro:", r.status, t);
      throw new Error(`IA ${r.status}: ${t}`);
    }
    return await r.json();
  } finally {
    clearTimeout(timeoutId);
  }
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
    if (!inativaHaMuito) return { conversa: existing, isNova: false };

    // Nova sessão de verdade: encerra a anterior para não reaproveitar estado/histórico antigo.
    await supabase
      .from("leo_conversations")
      .update({ status: "encerrada", ultima_mensagem_at: new Date().toISOString() })
      .eq("id", existing.id);
  }

  const { data, error } = await supabase
    .from("leo_conversations")
    .insert({ telefone, tipo_cliente: "indefinido", nome_cliente: nome })
    .select()
    .single();
  if (error) throw error;
  return { conversa: data, isNova: true };
}

// ===========================
// FRETE — Cálculo por CEP (Haversine a partir da Eletroportas em Salvador-BA)
// ===========================
const COMPANY_LAT = -12.8933071;
const COMPANY_LNG = -38.3582854;

function getDistanceInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function calcularFretePorCep(cepRaw: string) {
  const cep = (cepRaw || "").replace(/\D/g, "");
  if (cep.length !== 8) {
    return { ok: false, error: "CEP inválido. Peça novamente, com 8 dígitos." };
  }
  // 1) ViaCEP — endereço + UF
  let uf = "", localidade = "", bairro = "", logradouro = "";
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (r.ok) {
      const j = await r.json();
      if (!j.erro) {
        uf = (j.uf || "").toUpperCase();
        localidade = j.localidade || "";
        bairro = j.bairro || "";
        logradouro = j.logradouro || "";
      }
    }
  } catch (e) {
    console.error("viacep erro:", e);
  }
  if (!uf) return { ok: false, error: "Não consegui consultar esse CEP. Pode confirmar o número?" };
  if (uf !== "BA") {
    return { ok: false, fora_da_bahia: true, uf, localidade, error: `CEP é de ${localidade}/${uf}. PORTA INSTALADA atendemos apenas na Bahia.` };
  }

  // 2) AwesomeAPI — lat/lng do CEP
  let lat: number | null = null, lng: number | null = null;
  try {
    const r = await fetch(`https://cep.awesomeapi.com.br/json/${cep}`);
    if (r.ok) {
      const j = await r.json();
      if (j?.lat && j?.lng) {
        lat = parseFloat(j.lat);
        lng = parseFloat(j.lng);
      }
    }
  } catch (e) {
    console.error("awesomeapi cep erro:", e);
  }

  if (lat == null || lng == null) {
    // Fallback conservador: cobra um valor médio quando não temos coordenadas
    const freteFallback = 350;
    console.warn(`⚠️ Sem coordenadas para CEP ${cep}, usando frete fallback R$${freteFallback}`);
    return {
      ok: true,
      cep,
      uf, localidade, bairro, logradouro,
      distancia_km: null,
      frete: freteFallback,
      observacao: "Frete estimado (sem coordenadas precisas).",
    };
  }

  const distanciaKm = getDistanceInKm(COMPANY_LAT, COMPANY_LNG, lat, lng);
  // Fórmula original: distância * 7 * 2 (ida e volta a R$7/km)
  const frete = Math.round(distanciaKm * 7 * 2 * 100) / 100;
  return {
    ok: true,
    cep,
    uf, localidade, bairro, logradouro,
    distancia_km: Math.round(distanciaKm * 100) / 100,
    frete,
  };
}

async function salvarMensagem(conversation_id: string, role: string, content: string, metadata: any = {}) {
  const { error } = await supabase.from("leo_messages").insert({ conversation_id, role, content, metadata });
  if (error) throw error;
}

async function mensagemJaProcessada(conversation_id: string, messageId?: string) {
  if (!messageId) return false;
  const { data } = await supabase
    .from("leo_messages")
    .select("id")
    .eq("conversation_id", conversation_id)
    .eq("role", "user")
    .eq("metadata->>message_id", messageId)
    .maybeSingle();
  return Boolean(data);
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

  let telefoneFallback = "";
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
    const messageId: string | undefined = body?.messageId || body?.id;
    const contact = body?.contact || {};
    const telefone: string = contact?.phoneNumber || body?.from || "";
    telefoneFallback = telefone;
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

    const rawTimestamp = Number(body?.timestamp || 0);
    if (rawTimestamp && conversa.ultima_mensagem_at) {
      const eventTime = rawTimestamp > 9999999999 ? rawTimestamp : rawTimestamp * 1000;
      const lastTime = new Date(conversa.ultima_mensagem_at).getTime();
      if (lastTime - eventTime > 30_000) {
        console.log("⏭️ Ignorado: webhook antigo/reentregue", { messageId, eventTime, lastTime });
        return new Response(JSON.stringify({ ignored: "stale_webhook" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (await mensagemJaProcessada(conversa.id, messageId)) {
      console.log("⏭️ Ignorado: messageId já processado", messageId);
      return new Response(JSON.stringify({ ignored: "duplicate_message_id" }), {
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

    await salvarMensagem(conversa.id, "user", messageBody, { message_id: messageId || null, raw_timestamp: body?.timestamp || null });
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
    let contextoCliente: string;
    if (clienteExistente) {
      const tipoSalvo = (clienteExistente as any).tipo_cliente as string | null;
      const tipoNorm = tipoSalvo ? String(tipoSalvo).trim().toLowerCase() : "";
      const ehRevenda = tipoNorm.includes("revenda");
      const ehInstalada = tipoNorm.includes("instalada") || tipoNorm.includes("porta_instalada");
      let blocoTipo = "";
      if (ehRevenda) {
        blocoTipo = ` Esse cliente já é classificado como **REVENDA** no nosso sistema. NÃO faça a pergunta padrão de "porta instalada ou revenda". Em vez disso, confirme de forma natural: pergunte se ele quer seguir orçando como REVENDA (padrão dele) ou se desta vez prefere PORTA INSTALADA. Se ele só pedir "orçamento" sem especificar, assuma REVENDA.`;
      } else if (ehInstalada) {
        blocoTipo = ` Esse cliente já é classificado como **PORTA INSTALADA** no nosso sistema. NÃO faça a pergunta padrão. Confirme se ele quer seguir como PORTA INSTALADA (padrão dele) ou se desta vez prefere REVENDA. Se ele só pedir "orçamento" sem especificar, assuma PORTA INSTALADA.`;
      } else {
        blocoTipo = ` Tipo do cliente ainda não definido — siga o fluxo normal e pergunte se é PORTA INSTALADA ou REVENDA.`;
      }
      contextoCliente = `[CONTEXTO] Cliente JÁ CADASTRADO: ${clienteExistente.CLI_NOME || "(sem nome)"} | CNPJ/CPF: ${clienteExistente.CLI_CNPJ} | Email: ${clienteExistente.CLI_EMAIL || "(não informado)"}. NÃO peça cadastro novamente. Pode tratá-lo pelo primeiro nome.${blocoTipo}`;
    } else {
      contextoCliente = `[CONTEXTO] Cliente NÃO CADASTRADO (telefone ${telefone}). Inicie pelo Passo 1 (cadastro).`;
    }

    // Função que lê o estado atual do banco e monta o bloco [ESTADO]
    const montarEstado = async (): Promise<string> => {
      const { data: c } = await supabase
        .from("leo_conversations")
        .select("tipo_cliente, largura, altura, tipo_perfil, cep, frete")
        .eq("id", conversa.id)
        .maybeSingle();
      const v = (x: any) => (x === null || x === undefined || x === "" || x === "indefinido") ? "PENDENTE" : String(x);
      const tc = v(c?.tipo_cliente);
      const precisaFrete = c?.tipo_cliente === "porta_instalada";
      const linhas = [
        `tipo_cliente=${tc}`,
        `largura=${v(c?.largura)}`,
        `altura=${v(c?.altura)}`,
        `tipo_perfil=${v(c?.tipo_perfil)}`,
      ];
      if (precisaFrete) {
        linhas.push(`cep=${v(c?.cep)}`);
        linhas.push(`frete=${v(c?.frete)}`);
      }
      const pendentes = linhas.filter((l) => l.endsWith("=PENDENTE")).map((l) => l.split("=")[0]);
      const proximo = pendentes[0] || "TODOS_OK_CHAMAR_GERAR_ORCAMENTO";
      return `[ESTADO ATUAL DA CONVERSA — fonte de verdade]\n${linhas.join("\n")}\nPRÓXIMO_PASSO: ${proximo === "TODOS_OK_CHAMAR_GERAR_ORCAMENTO" ? "TODOS os dados prontos — chame gerar_orcamento agora (sem argumentos)." : `pergunte ao cliente sobre "${proximo}".`}`;
    };

    console.log(`🧭 Histórico: ${historico.length} msgs | Cliente: ${clienteExistente ? "cadastrado" : "novo"}`);

    // Loop do agente: até 5 iterações de tool calling
    let messages: any[] = [
      { role: "system", content: contextoCliente },
      ...historico,
      { role: "system", content: await montarEstado() },
    ];
    let respostaFinal = "";
    let pdfEnviadoNesteTurno = false;
    let pdfCaptionEnviada = "";
    let gerarOrcamentoFalhas = 0; // contador de DADOS_INSUFICIENTES
    const MAX_ITER = 5;
    for (let i = 0; i < MAX_ITER; i++) {
      const ai = await chamarIA(messages);
      const choice = ai.choices?.[0]?.message;
      if (!choice) break;

      const toolCalls = choice.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        respostaFinal = (choice.content || "").trim();
        if (!respostaFinal) {
          // IA retornou vazio — força uma nova chamada pedindo resposta textual
          console.warn("⚠️ IA retornou content vazio sem tool_calls — solicitando retry");
          messages.push({
            role: "system",
            content: "Sua última resposta veio vazia. Responda agora ao cliente em UMA mensagem curta em português, seguindo o fluxo. NÃO use tool_calls nesta resposta.",
          });
          const retry = await chamarIA(messages);
          respostaFinal = (retry.choices?.[0]?.message?.content || "").trim();
        }
        break;
      }

      // Se na última iteração permitida ainda houver tool_calls, abortamos e forçamos resposta textual
      if (i === MAX_ITER - 1) {
        console.warn("⚠️ Loop atingiu MAX_ITER ainda chamando tools — forçando resposta textual");
        messages.push({
          role: "system",
          content: "PARE de chamar ferramentas. Responda ao cliente AGORA em UMA mensagem curta em português, perguntando UMA pergunta sobre o próximo dado que falta no fluxo (medidas → lâmina → CEP). NÃO use tool_calls.",
        });
        const forced = await chamarIA(messages);
        respostaFinal = (forced.choices?.[0]?.message?.content || "").trim();
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
          // ===== LÊ ESTADO DO BANCO (fonte de verdade) =====
          const { data: estado } = await supabase
            .from("leo_conversations")
            .select("tipo_cliente, largura, altura, tipo_perfil, frete, endereco_instalacao")
            .eq("id", conversa.id)
            .maybeSingle();

          const larguraNum = Number(estado?.largura);
          const alturaNum = Number(estado?.altura);
          const tcRawV = String(estado?.tipo_cliente || "").toLowerCase().trim();
          const tcValid = tcRawV === "porta_instalada" || tcRawV === "revenda";
          const perfilRaw = String(estado?.tipo_perfil || "").toLowerCase();
          const perfilValid = ["fechado", "transvision", "oblongo"].includes(perfilRaw);
          const freteNum = estado?.frete != null ? Number(estado.frete) : NaN;

          const faltando: string[] = [];
          if (!tcValid) faltando.push("tipo_cliente");
          if (!Number.isFinite(larguraNum) || larguraNum <= 0 || larguraNum > 20) faltando.push("largura");
          if (!Number.isFinite(alturaNum) || alturaNum <= 0 || alturaNum > 20) faltando.push("altura");
          if (!perfilValid) faltando.push("tipo_perfil");
          if (tcValid && tcRawV === "porta_instalada" && (!Number.isFinite(freteNum) || freteNum <= 0)) {
            faltando.push("frete");
          }

          if (faltando.length > 0) {
            gerarOrcamentoFalhas++;
            console.warn(`🚫 gerar_orcamento BLOQUEADO (tentativa ${gerarOrcamentoFalhas}) — [ESTADO] faltando:`, faltando.join(", "));
            const proximo = faltando[0];
            const proximaPergunta = proximo === "frete"
              ? "Pergunte AGORA: 'Por último, qual o **CEP do local da instalação**? Assim calculo o frete certinho.' NÃO chame nenhuma tool nesta resposta."
              : (proximo === "largura" || proximo === "altura")
                ? "Pergunte AGORA a largura e altura da porta em metros (ex: 4x3). NÃO chame nenhuma tool."
                : proximo === "tipo_perfil"
                  ? "Pergunte AGORA o tipo de lâmina (1 FECHADA / 2 TRANSVISION / 3 OBLONGO). NÃO chame nenhuma tool."
                  : proximo === "tipo_cliente"
                    ? "Pergunte AGORA se o cliente quer PORTA INSTALADA ou REVENDA. NÃO chame nenhuma tool."
                    : "Pergunte ao cliente o próximo dado faltante. NÃO chame nenhuma tool.";
            toolResult = {
              ok: false,
              erro: "DADOS_INSUFICIENTES",
              faltando,
              estado_atual: estado,
              instrucao: `O [ESTADO] no banco mostra que falta: ${faltando.join(", ")}. ${proximaPergunta}`,
            };
            messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(toolResult) });
            messages.push({
              role: "system",
              content: `STOP. Tentativa de gerar_orcamento bloqueada — falta no [ESTADO]: ${faltando.join(", ")}. Sua PRÓXIMA resposta DEVE ser texto puro perguntando "${proximo}". NÃO chame gerar_orcamento de novo.`,
            });
            continue;
          }

          try {
            const o = calcularOrcamento({
              largura: larguraNum,
              altura: alturaNum,
              tipo_cliente: tcRawV as any,
              tipo_perfil: perfilRaw as any,
              tipo_motor: args.tipo_motor,
              tipo_pintura: args.tipo_pintura,
              frete: Number.isFinite(freteNum) ? freteNum : 0,
              cliente_nome: nome,
              cliente_endereco: estado?.endereco_instalacao || undefined,
            });

            const html = gerarHtmlOrcamento(o);
            const filename = `orcamento_${Date.now()}.pdf`;
            const pdfB64 = await gerarPdfDocrya(html, filename);

            if (pdfB64) {
              const captionPdf = "Pronto! Segue seu orçamento em PDF, dá uma olhada por favor. 📄";
              const pdfEnviado = await enviarPdfBase64(telefone, pdfB64, filename, captionPdf);
              if (pdfEnviado) {
                pdfEnviadoNesteTurno = true;
                pdfCaptionEnviada = captionPdf;
              }
              toolResult = {
                ok: pdfEnviado,
                pdf_enviado: pdfEnviado,
                instrucao: pdfEnviado
                  ? "PDF enviado. NÃO envie nova mensagem. NÃO mencione valores."
                  : "Houve instabilidade no envio do arquivo — informe que um atendente vai encaminhar em breve.",
              };
            } else {
              toolResult = { ok: false, error: "Falha ao gerar PDF — informe ao cliente que enviaremos em breve." };
            }
          } catch (e: any) {
            console.error("❌ Erro em gerar_orcamento:", e?.message, e);
            toolResult = { ok: false, error: e?.message || "erro ao gerar orçamento" };
          }
        } else if (fnName === "cadastrar_cliente") {
          const r = await cadastrarCliente({
            nome: String(args.nome || nome || "").trim(),
            email: args.email ? String(args.email).trim() : undefined,
            documento: String(args.documento || "").replace(/\D/g, ""),
            telefone,
            tipo_cliente: args.tipo_cliente,
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
        } else if (fnName === "definir_medidas") {
          const lg = Number(args.largura);
          const al = Number(args.altura);
          if (!Number.isFinite(lg) || lg <= 0 || lg > 20 || !Number.isFinite(al) || al <= 0 || al > 20) {
            toolResult = { ok: false, error: "Medidas inválidas. Pergunte de novo ao cliente em metros (ex: 4x3)." };
          } else {
            await supabase
              .from("leo_conversations")
              .update({ largura: lg, altura: al, ultima_mensagem_at: new Date().toISOString() })
              .eq("id", conversa.id);
            toolResult = {
              ok: true,
              largura: lg,
              altura: al,
              instrucao: "Medidas gravadas no [ESTADO]. NÃO confirme isso ao cliente. Siga DIRETO ao Passo 4 perguntando o tipo da lâmina (1 FECHADA / 2 TRANSVISION / 3 OBLONGO).",
            };
          }
        } else if (fnName === "definir_lamina") {
          const p = String(args.tipo_perfil || "").toLowerCase();
          const pNorm = p === "fechado" || p === "transvision" || p === "oblongo" ? p : null;
          if (!pNorm) {
            toolResult = { ok: false, error: "tipo_perfil inválido. Use fechado, transvision ou oblongo." };
          } else {
            await supabase
              .from("leo_conversations")
              .update({ tipo_perfil: pNorm, ultima_mensagem_at: new Date().toISOString() })
              .eq("id", conversa.id);
            // Lê o tipo_cliente para decidir o próximo passo
            const { data: cv } = await supabase
              .from("leo_conversations")
              .select("tipo_cliente")
              .eq("id", conversa.id)
              .maybeSingle();
            const proxima = cv?.tipo_cliente === "porta_instalada"
              ? "Lâmina gravada. NÃO confirme. Siga DIRETO ao Passo 5: pergunte o CEP do local da instalação."
              : "Lâmina gravada. NÃO confirme. Chame gerar_orcamento agora (sem argumentos).";
            toolResult = { ok: true, tipo_perfil: pNorm, instrucao: proxima };
          }
        } else if (fnName === "calcular_frete_cep") {
          const r: any = await calcularFretePorCep(String(args.cep || ""));
          if (r.ok) {
            // Grava cep, frete e endereço resumido no [ESTADO] da conversa
            const enderecoResumo = [r.logradouro, r.bairro, r.localidade, r.uf]
              .filter((x: any) => x && String(x).trim())
              .join(", ");
            await supabase
              .from("leo_conversations")
              .update({
                cep: r.cep,
                frete: r.frete,
                endereco_instalacao: enderecoResumo || null,
                tipo_cliente: "porta_instalada",
                ultima_mensagem_at: new Date().toISOString(),
              })
              .eq("id", conversa.id);
            try { await atualizarTipoClienteLegado(telefone, "porta_instalada"); } catch (_) {}
            toolResult = {
              ok: true,
              instrucao: "CEP e frete gravados no [ESTADO]. NÃO mencione o valor do frete ao cliente. Chame IMEDIATAMENTE gerar_orcamento (sem argumentos).",
            };
          } else if (r.fora_da_bahia) {
            toolResult = { ...r, instrucao: "Cliente fora da BA para PORTA INSTALADA. Chame transferir_humano." };
          } else {
            toolResult = r;
          }
        } else if (fnName === "definir_tipo_cliente") {
          const tc = String(args.tipo_cliente || "").toLowerCase();
          const tcNorm: "porta_instalada" | "revenda" | null =
            tc === "revenda" ? "revenda" : tc === "porta_instalada" ? "porta_instalada" : null;
          if (!tcNorm) {
            toolResult = { ok: false, error: "tipo_cliente inválido. Use 'porta_instalada' ou 'revenda'." };
          } else {
            await supabase
              .from("leo_conversations")
              .update({ tipo_cliente: tcNorm, ultima_mensagem_at: new Date().toISOString() })
              .eq("id", conversa.id);
            try { await atualizarTipoClienteLegado(telefone, tcNorm); } catch (_) {}
            toolResult = {
              ok: true,
              tipo_cliente: tcNorm,
              instrucao: "Tipo gravado no [ESTADO]. NÃO confirme isso ao cliente. Siga DIRETO ao Passo 3 perguntando largura e altura da porta (ex: 4x3).",
            };
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
      // Após processar todas as tool_calls, re-injeta [ESTADO] atualizado
      // para que a próxima iteração da IA enxergue os dados recém-gravados.
      messages.push({ role: "system", content: await montarEstado() });
    }

    try {
      if (pdfEnviadoNesteTurno) {
        await salvarMensagem(conversa.id, "assistant", pdfCaptionEnviada, { pdf_enviado: true });
      } else {
        const textoFinal = (respostaFinal || "").trim() ||
          "Desculpe, tive uma instabilidade aqui. Pode repetir sua última mensagem, por favor? 🙏";
        await salvarMensagem(conversa.id, "assistant", textoFinal);
        await enviarTexto(telefone, textoFinal);
      }
    } catch (e: any) {
      console.error("⚠️ Falha ao persistir/enviar resposta final (não fatal):", e?.message, JSON.stringify(e));
    }

    try {
      await supabase
        .from("leo_conversations")
        .update({ ultima_mensagem_at: new Date().toISOString() })
        .eq("id", conversa.id);
    } catch (e: any) {
      console.error("⚠️ Falha ao atualizar ultima_mensagem_at (não fatal):", e?.message);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    const errMsg = e?.message || e?.error_description || e?.details || e?.hint || e?.code || JSON.stringify(e) || "erro desconhecido";
    console.error("leo-webhook erro:", errMsg, "stack:", e?.stack, "raw:", JSON.stringify(e, Object.getOwnPropertyNames(e || {})));
    // Tenta avisar o cliente mesmo em erro fatal — agente nunca pode ficar mudo
    try {
      const tel = normalizarTelefone(telefoneFallback);
      if (tel) {
        await enviarTexto(tel, "Tive uma instabilidade momentânea aqui. Pode reenviar sua última mensagem? 🙏");
      }
    } catch (_) { /* silencioso */ }
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
