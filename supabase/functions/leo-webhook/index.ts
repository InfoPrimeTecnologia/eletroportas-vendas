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

// A dashboard atual lê/grava no backend legado; qualquer dado comercial
// gerado pelo Leo precisa ir para este cliente para aparecer nas telas.
const dashboardDb = legacyDb;

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
  const existingRes = await withSchemaRetry(() =>
    supabase
      .from("leo_conversations")
      .select("*")
      .eq("telefone", telefone)
      .eq("status", "ativa")
      .order("ultima_mensagem_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  );
  if (existingRes.error) console.error("⚠️", descreverErroPg(existingRes.error, "getOuCriarConversa leitura: "));
  const existing = existingRes.data;

  if (existing) {
    const ultima = new Date(existing.ultima_mensagem_at || existing.created_at).getTime();
    const inativaHaMuito = Date.now() - ultima > SESSION_GAP_MS;
    if (!inativaHaMuito) return { conversa: existing, isNova: false };

    // Nova sessão de verdade: encerra a anterior para não reaproveitar estado/histórico antigo.
    const encerrar = await withSchemaRetry(() =>
      supabase
        .from("leo_conversations")
        .update({ status: "encerrada", ultima_mensagem_at: new Date().toISOString() })
        .eq("id", existing.id)
    );
    if (encerrar.error) console.error("⚠️", descreverErroPg(encerrar.error, "getOuCriarConversa encerrar antiga: "));
  }

  const criar = await withSchemaRetry(() =>
    supabase
      .from("leo_conversations")
      .insert({ telefone, tipo_cliente: "indefinido", nome_cliente: nome })
      .select()
      .single()
  );
  if (criar.error) throw criar.error;
  return { conversa: criar.data, isNova: true };
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
  const cepNumero = Number(cep);
  const cepPareceBahia = Number.isFinite(cepNumero) && cepNumero >= 40000000 && cepNumero <= 48999999;
  const freteFallback = 350;
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
  if (!uf && cepPareceBahia) {
    console.warn(`⚠️ ViaCEP indisponível/sem UF para CEP ${cep}; usando fallback BA R$${freteFallback}`);
    return {
      ok: true,
      cep,
      uf: "BA",
      localidade: "Bahia",
      bairro: "",
      logradouro: "",
      distancia_km: null,
      frete: freteFallback,
      observacao: "Frete estimado por faixa de CEP da Bahia.",
    };
  }
  if (!uf) return { ok: false, fora_da_bahia: true, error: "Não consegui confirmar que esse CEP é da Bahia." };
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

/** Tenta novamente quando o PostgREST está recarregando o schema cache (erro vem com tudo vazio). */
async function withSchemaRetry<T extends { error: any }>(fn: () => Promise<T>, tentativas = 4): Promise<T> {
  let ultimo: T | undefined;
  for (let i = 0; i < tentativas; i++) {
    let r: T;
    try {
      r = await fn();
    } catch (e: any) {
      const msg = String(e?.message || e || "");
      if (/schema cache|Could not query the database|JWT|fetch failed|network|timeout/i.test(msg) && i < tentativas - 1) {
        await new Promise((res) => setTimeout(res, 300 * (i + 1)));
        continue;
      }
      throw e;
    }
    const err: any = r?.error;
    if (!err) return r;
    const msg = String(err?.message || "");
    const code = String(err?.code || "");
    const semInfo = !msg && !code && err?.details == null && err?.hint == null;
    const schemaIssue = /schema cache|Could not query the database|JWT|fetch failed/i.test(msg);
    if (semInfo || schemaIssue) {
      ultimo = r;
      await new Promise((res) => setTimeout(res, 250 * (i + 1)));
      continue;
    }
    return r;
  }
  return ultimo as T;
}

function descreverErroPg(err: any, prefixo = ""): string {
  if (!err) return prefixo + "sem erro";
  const partes = [
    err?.message,
    err?.details,
    err?.hint,
    err?.code ? `code=${err.code}` : null,
    err?.status ? `status=${err.status}` : null,
  ].filter(Boolean);
  return prefixo + (partes.join(" | ") || "PostgrestError vazio (provável recarga de schema cache)");
}

async function salvarMensagem(conversation_id: string, role: string, content: string, metadata: any = {}) {
  const r = await withSchemaRetry(() =>
    supabase.from("leo_messages").insert({ conversation_id, role, content, metadata })
  );
  if (r.error) {
    // Não joga para o catch global — não queremos derrubar o turno inteiro só porque
    // o histórico não pôde ser persistido. O envio para o cliente continua.
    console.error("⚠️", descreverErroPg(r.error, "salvarMensagem falhou: "));
  }
}

function inferirTipoClienteTexto(texto: string): "porta_instalada" | "revenda" | null {
  const t = (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(revenda|revender|revendedor|fornecimento|sem instalacao)\b/.test(t)) return "revenda";
  if (/\b(instalada|instalar|instalacao|com instalacao|porta instalada)\b/.test(t)) return "porta_instalada";
  return null;
}

function inferirMedidasTexto(texto: string): { largura: number; altura: number } | null {
  const t = (texto || "").toLowerCase().replace(/,/g, ".");
  const match = t.match(/(\d+(?:\.\d+)?)\s*(?:x|×|por|\/|-)\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const largura = Number(match[1]);
  const altura = Number(match[2]);
  if (!Number.isFinite(largura) || !Number.isFinite(altura) || largura <= 0 || altura <= 0 || largura > 20 || altura > 20) return null;
  return { largura, altura };
}

function inferirLaminaTexto(texto: string): "fechado" | "transvision" | "oblongo" | null {
  const t = (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/\b(1|fechada|fechado|lisa|liso|meia cana)\b/.test(t)) return "fechado";
  if (/\b(2|transvision|transvisao|visor|visores)\b/.test(t)) return "transvision";
  if (/\b(3|oblongo|perfurada|perfurado)\b/.test(t)) return "oblongo";
  return null;
}

function inferirCepTexto(texto: string): string | null {
  const match = (texto || "").match(/\b\d{5}-?\d{3}\b/);
  return match ? match[0].replace(/\D/g, "") : null;
}

function aplicarInferenciasEmEstado(base: any, textos: string[]) {
  const estado = { ...(base || {}) };
  for (const txt of textos) {
    const tipo = inferirTipoClienteTexto(txt);
    if (tipo && (!estado.tipo_cliente || estado.tipo_cliente === "indefinido")) estado.tipo_cliente = tipo;

    const medidas = inferirMedidasTexto(txt);
    if (medidas && (estado.largura == null || estado.altura == null)) {
      estado.largura = medidas.largura;
      estado.altura = medidas.altura;
    }

    const lamina = inferirLaminaTexto(txt);
    if (lamina && !estado.tipo_perfil) estado.tipo_perfil = lamina;

    const cep = inferirCepTexto(txt);
    if (cep && estado.tipo_cliente === "porta_instalada" && !estado.cep) estado.cep = cep;
  }
  return estado;
}

async function aplicarExtracaoDeterministica(conversaId: string, telefone: string, texto: string) {
  const estadoRes = await withSchemaRetry(() =>
    supabase
      .from("leo_conversations")
      .select("tipo_cliente, largura, altura, tipo_perfil, cep, frete, endereco_instalacao")
      .eq("id", conversaId)
      .maybeSingle()
  );
  if (estadoRes.error) console.error("⚠️", descreverErroPg(estadoRes.error, "leitura estado determinístico falhou: "));

  const histRes = await withSchemaRetry(() =>
    supabase
      .from("leo_messages")
      .select("content")
      .eq("conversation_id", conversaId)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(12)
  );
  if (histRes.error) console.error("⚠️", descreverErroPg(histRes.error, "leitura histórico determinístico falhou: "));

  const baseEstado = estadoRes.data || {};
  const textos = [texto, ...((histRes.data || []) as any[]).map((m) => String(m?.content || ""))].filter(Boolean);
  const estado = aplicarInferenciasEmEstado(baseEstado, textos);

  const patch: Record<string, unknown> = {};
  if (estado.tipo_cliente && (!baseEstado?.tipo_cliente || baseEstado.tipo_cliente === "indefinido")) patch.tipo_cliente = estado.tipo_cliente;
  if (estado.largura != null && baseEstado?.largura == null) patch.largura = estado.largura;
  if (estado.altura != null && baseEstado?.altura == null) patch.altura = estado.altura;
  if (estado.tipo_perfil && !baseEstado?.tipo_perfil) patch.tipo_perfil = estado.tipo_perfil;

  const cep = inferirCepTexto(texto);
  if (cep && estado?.tipo_cliente === "porta_instalada" && !baseEstado?.cep) {
    const frete: any = await calcularFretePorCep(cep);
    if (frete.ok) {
      patch.cep = frete.cep;
      patch.frete = frete.frete;
      patch.endereco_instalacao = [frete.logradouro, frete.bairro, frete.localidade, frete.uf]
        .filter((x: any) => x && String(x).trim())
        .join(", ") || null;
    } else if (!frete.fora_da_bahia) {
      console.warn(`⚠️ CEP ${cep} aceito com fallback para evitar loop: ${frete.error || "consulta indisponível"}`);
      patch.cep = cep;
      patch.frete = 350;
      patch.endereco_instalacao = null;
    }
  }

  if (Object.keys(patch).length > 0) {
    patch.ultima_mensagem_at = new Date().toISOString();
    const { error } = await withSchemaRetry(() => supabase.from("leo_conversations").update(patch).eq("id", conversaId));
    if (error) console.error("⚠️", descreverErroPg(error, "Falha na extração determinística: "));
    else console.log("✅ Estado atualizado por extração determinística:", JSON.stringify(patch));
    if (patch.tipo_cliente === "porta_instalada" || patch.tipo_cliente === "revenda") {
      try { await atualizarTipoClienteLegado(telefone, patch.tipo_cliente as any); } catch (_) {}
    }
  }

  return { ...estado, ...patch };
}

async function carregarEstadoConversa(conversaId: string) {
  const { data, error } = await withSchemaRetry(() =>
    supabase
      .from("leo_conversations")
      .select("tipo_cliente, largura, altura, tipo_perfil, cep, frete")
      .eq("id", conversaId)
      .maybeSingle()
  );
  if (error) {
    console.error("⚠️", descreverErroPg(error, "carregarEstadoConversa falhou: "));
    return null;
  }
  return data;
}

function proximaPerguntaDeterministica(estado: any): string | null {
  const tipo = String(estado?.tipo_cliente || "").toLowerCase();
  const tipoValido = tipo === "porta_instalada" || tipo === "revenda";
  const largura = Number(estado?.largura);
  const altura = Number(estado?.altura);

  if (!tipoValido) return "Você tem interesse em *PORTA INSTALADA* ou em *REVENDA*?";
  if (!Number.isFinite(largura) || largura <= 0 || !Number.isFinite(altura) || altura <= 0) {
    return "Qual a *largura e altura* da porta, em metros? (ex: 4x3)";
  }
  if (!estado?.tipo_perfil) {
    return "Qual o tipo da lâmina?\n\n1️⃣ FECHADA (lisa, sem visão)\n\n2️⃣ TRANSVISION (com visores)\n\n3️⃣ OBLONGO (perfurada)";
  }
  if (tipo === "porta_instalada" && !estado?.cep) {
    return "Por último, qual o *CEP do local da instalação*? Assim calculo o frete certinho.";
  }
  return null;
}

function estadoProntoParaOrcamento(estado: any): boolean {
  const tipo = String(estado?.tipo_cliente || "").toLowerCase();
  const tipoValido = tipo === "porta_instalada" || tipo === "revenda";
  const largura = Number(estado?.largura);
  const altura = Number(estado?.altura);
  const perfil = String(estado?.tipo_perfil || "").toLowerCase();
  const perfilValido = ["fechado", "transvision", "oblongo"].includes(perfil);
  return Boolean(
    tipoValido &&
    Number.isFinite(largura) && largura > 0 && largura <= 20 &&
    Number.isFinite(altura) && altura > 0 && altura <= 20 &&
    perfilValido &&
    (tipo !== "porta_instalada" || Boolean(estado?.cep))
  );
}

async function pdfJaEnviadoConversa(conversation_id: string) {
  const { data } = await supabase
    .from("leo_messages")
    .select("metadata")
    .eq("conversation_id", conversation_id)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(20);
  return Boolean((data || []).some((m: any) => m?.metadata?.pdf_enviado === true));
}

async function gerarEEnviarOrcamentoDeterministico(conversaId: string, telefone: string, nome: string) {
  const r = await withSchemaRetry(() =>
    supabase
      .from("leo_conversations")
      .select("tipo_cliente, largura, altura, tipo_perfil, frete, endereco_instalacao")
      .eq("id", conversaId)
      .maybeSingle()
  );
  if (r.error) {
    console.error("⚠️", descreverErroPg(r.error, "gerarEEnviarOrcamento - leitura conversa: "));
    return { ok: false, error: descreverErroPg(r.error) };
  }
  const estado: any = r.data;

  const largura = Number(estado?.largura);
  const altura = Number(estado?.altura);
  const tipoCliente = String(estado?.tipo_cliente || "").toLowerCase();
  const tipoPerfil = String(estado?.tipo_perfil || "").toLowerCase();
  const frete = estado?.frete != null ? Number(estado.frete) : 0;

  const faltando: string[] = [];
  if (tipoCliente !== "porta_instalada" && tipoCliente !== "revenda") faltando.push("tipo_cliente");
  if (!Number.isFinite(largura) || largura <= 0 || largura > 20) faltando.push("largura");
  if (!Number.isFinite(altura) || altura <= 0 || altura > 20) faltando.push("altura");
  if (!["fechado", "transvision", "oblongo"].includes(tipoPerfil)) faltando.push("tipo_perfil");
  if (tipoCliente === "porta_instalada" && (!Number.isFinite(frete) || frete <= 0)) faltando.push("frete");
  if (faltando.length) return { ok: false, faltando };

  const orcamento = calcularOrcamento({
    largura,
    altura,
    tipo_cliente: tipoCliente as any,
    tipo_perfil: tipoPerfil as any,
    frete,
    cliente_nome: nome,
    cliente_endereco: estado?.endereco_instalacao || undefined,
  });
  const filename = `orcamento_${Date.now()}.pdf`;
  const pdfB64 = await gerarPdfDocrya(gerarHtmlOrcamento(orcamento), filename);
  if (!pdfB64) return { ok: false, error: "Falha ao gerar PDF" };

  const caption = "Pronto! Segue seu orçamento em PDF, dá uma olhada por favor. 📄";
  const pdfEnviado = await enviarPdfBase64(telefone, pdfB64, filename, caption);
  return { ok: pdfEnviado, pdf_enviado: pdfEnviado, caption, error: pdfEnviado ? null : "Falha ao enviar PDF", pdfBase64: pdfB64, filename, orcamento };
}

// ===========================
// INTEGRAÇÃO COM DASHBOARD (Funil / Orçamentos / Pedidos de Venda)
// ===========================

/** Cria/atualiza o lead no funil em "contato_inicial" assim que abre uma conversa nova. */
async function registrarLeadContatoInicial(telefone: string, nomeBruto: string) {
  try {
    const nome = (nomeBruto || "").trim() || `Contato ${telefone}`;
    // Tenta enriquecer com o cliente legado (se existir)
    const cli = await buscarClientePorTelefone(telefone).catch(() => null);

    // Evita duplicar leads ativos do mesmo telefone (não inserir se já houver lead aberto)
    const { data: existente } = await dashboardDb
      .from("funil_leads")
      .select("id, etapa_key")
      .eq("telefone", telefone)
      .not("etapa_key", "in", "(fechado,perdido)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existente?.id) {
      console.log("ℹ️ Lead já existe no funil — não duplica:", existente.id, existente.etapa_key);
      return existente.id as string;
    }

    const payload: any = {
      nome: cli?.CLI_NOME || nome,
      telefone,
      email: cli?.CLI_EMAIL || null,
      etapa_key: "contato_inicial",
      origem: "leo_agent",
      valor: 0,
      itens: [],
      observacoes: "Lead criado automaticamente pelo agente Leo via WhatsApp.",
    };
    const { data, error } = await dashboardDb
      .from("funil_leads")
      .insert(payload)
      .select("id")
      .single();
    if (error) {
      console.error("⚠️ Falha ao criar lead no funil:", error.message);
      return null;
    }
    console.log("✅ Lead criado no funil (contato_inicial):", data?.id);
    return data?.id as string;
  } catch (e: any) {
    console.error("⚠️ registrarLeadContatoInicial falhou:", e?.message);
    return null;
  }
}

/** Busca o lead aberto (não fechado/perdido) deste telefone. */
async function buscarLeadAberto(telefone: string) {
  const { data } = await dashboardDb
    .from("funil_leads")
    .select("id, etapa_key, itens, anexo_pdf, valor")
    .eq("telefone", telefone)
    .not("etapa_key", "in", "(fechado,perdido)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

/** Persiste o orçamento gerado pelo agente na tabela `orcamentos` (com PDF base64) e move o lead para "orcamento_enviado". */
async function registrarOrcamentoEAvancarFunil(params: {
  telefone: string;
  nome: string;
  orcamento: ReturnType<typeof calcularOrcamento>;
  pdfBase64: string;
  filename: string;
}) {
  const { telefone, nome, orcamento, pdfBase64, filename } = params;
  try {
    const itensJson = orcamento.itens.map((i: any) => ({
      codigo: i.code,
      descricao: i.description,
      quantidade: i.qty,
      unidade: i.unit,
      preco_unitario: i.unit_price,
      subtotal: i.subtotal,
    }));
    const observacoes = [
      `Origem: Agente Leo (WhatsApp)`,
      `Tipo: ${orcamento.tipo_cliente}`,
      `Medidas: ${orcamento.largura}m x ${orcamento.altura}m`,
      `Lâmina: ${orcamento.tipo_perfil}`,
      orcamento.frete ? `Frete: R$ ${orcamento.frete.toFixed(2)}` : null,
      orcamento.mao_de_obra ? `Mão de obra: R$ ${orcamento.mao_de_obra.toFixed(2)}` : null,
    ].filter(Boolean).join(" | ");

    const { data: orc, error: orcErr } = await supabase
      .from("orcamentos")
      .insert({
        cliente_nome: nome || `Contato ${telefone}`,
        cliente_telefone: telefone,
        valor_total: orcamento.total_geral,
        status: "pendente",
        origem: "leo_agent",
        itens: itensJson,
        observacoes,
      })
      .select("id, numero")
      .single();
    if (orcErr) {
      console.error("⚠️ Falha ao salvar orcamento:", orcErr.message);
    } else {
      console.log("✅ Orçamento registrado:", orc?.numero);
    }

    // Atualiza o lead no funil → orcamento_enviado, anexa PDF e itens
    const lead = await buscarLeadAberto(telefone);
    const anexo = `data:application/pdf;base64,${pdfBase64}`;
    if (lead?.id) {
      await supabase
        .from("funil_leads")
        .update({
          etapa_key: "orcamento_enviado",
          valor: orcamento.total_geral,
          itens: itensJson,
          anexo_pdf: anexo,
          observacoes: `Orçamento ${orc?.numero || ""} gerado pelo agente Leo.`,
        })
        .eq("id", lead.id);
      console.log("✅ Lead movido para orcamento_enviado:", lead.id);
    } else {
      // cria direto na etapa orcamento_enviado caso não exista
      await supabase.from("funil_leads").insert({
        nome: nome || `Contato ${telefone}`,
        telefone,
        valor: orcamento.total_geral,
        etapa_key: "orcamento_enviado",
        origem: "leo_agent",
        itens: itensJson,
        anexo_pdf: anexo,
        observacoes: `Orçamento ${orc?.numero || ""} gerado pelo agente Leo.`,
      });
    }
    return { orcamento_id: orc?.id, numero: orc?.numero };
  } catch (e: any) {
    console.error("⚠️ registrarOrcamentoEAvancarFunil falhou:", e?.message);
    return null;
  }
}

/** Detecta aceite explícito do cliente em texto livre. */
function pareceAceite(texto: string): boolean {
  const t = (texto || "").toLowerCase().trim();
  if (!t) return false;
  if (/^(fechada|fechado|lisa|liso|meia cana|transvision|oblongo|perfurada|perfurado|1|2|3)$/i.test(t)) {
    return false;
  }
  // Frases curtas claras de aceite
  const padroes = [
    /\baceito\b/, /\baceitar\b/, /\baceita?do\b/,
    /\b(fechar|fechado|fechada) (o )?(orcamento|orçamento|pedido|negocio|negócio)\b/, /\bpode (fechar|seguir)\b/,
    /\bpode (gerar|emitir) (o )?pedido\b/, /\bquero (fechar|comprar)\b/,
    /\bconfirmo( o)? (orcamento|orçamento|pedido)\b/, /\bconcordo( com)? (o )?(orcamento|orçamento|pedido)\b/,
    /\baprovad[oa]\b/, /\baprovar( o)? (orcamento|orçamento)\b/,
    /\bok( pode (fechar|seguir))\b/,
  ];
  return padroes.some((re) => re.test(t));
}

/** Converte o último orçamento pendente em pedido de venda e move o lead para "fechado". */
async function aceitarOrcamentoEGerarPedido(telefone: string) {
  try {
    const { data: orc } = await supabase
      .from("orcamentos")
      .select("id, numero, cliente_nome, cliente_telefone, valor_total, itens, observacoes, status")
      .eq("cliente_telefone", telefone)
      .eq("origem", "leo_agent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!orc) {
      console.warn("⚠️ aceitarOrcamento: nenhum orçamento encontrado para", telefone);
      return null;
    }
    if (orc.status === "aceito") {
      console.log("ℹ️ Orçamento já aceito anteriormente:", orc.numero);
      return { orcamento_numero: orc.numero, ja_aceito: true };
    }

    // Cria o pedido de venda com base no orçamento
    const { data: ped, error: pedErr } = await supabase
      .from("pedidos_venda")
      .insert({
        cliente_nome: orc.cliente_nome,
        cliente_telefone: orc.cliente_telefone,
        valor_total: orc.valor_total,
        status: "processando",
        origem: "leo_agent",
        itens: orc.itens,
        observacoes: `Gerado a partir do orçamento ${orc.numero || orc.id}. ${orc.observacoes || ""}`.trim(),
        orcamento_id: orc.id,
      })
      .select("id, numero")
      .single();
    if (pedErr) {
      console.error("⚠️ Falha ao criar pedido_venda:", pedErr.message);
      return null;
    }
    await supabase.from("orcamentos").update({ status: "aceito" }).eq("id", orc.id);

    // Move o lead para "fechado"
    const lead = await buscarLeadAberto(telefone);
    if (lead?.id) {
      await supabase
        .from("funil_leads")
        .update({
          etapa_key: "fechado",
          observacoes: `Orçamento ${orc.numero} aceito. Pedido ${ped?.numero} gerado pelo agente Leo.`,
        })
        .eq("id", lead.id);
    }
    console.log("✅ Pedido de venda criado:", ped?.numero, "a partir de", orc.numero);
    return { orcamento_numero: orc.numero, pedido_numero: ped?.numero };
  } catch (e: any) {
    console.error("⚠️ aceitarOrcamentoEGerarPedido falhou:", e?.message);
    return null;
  }
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

async function mensagemForaDeOrdem(conversation_id: string, rawTimestamp?: string | number | null) {
  const incomingTs = Number(rawTimestamp || 0);
  if (!Number.isFinite(incomingTs) || incomingTs <= 0) return false;

  const { data, error } = await withSchemaRetry(() =>
    supabase
      .from("leo_messages")
      .select("metadata")
      .eq("conversation_id", conversation_id)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(20)
  );

  if (error) {
    console.error("⚠️", descreverErroPg(error, "mensagemForaDeOrdem: "));
    return false;
  }

  const latestTs = (data || [])
    .map((m: any) => Number(m?.metadata?.raw_timestamp || 0))
    .filter((ts: number) => Number.isFinite(ts) && ts > 0)
    .sort((a: number, b: number) => b - a)[0];

  // Ignora reentregas antigas do provedor. Mantém 2s de tolerância para pequenas variações.
  return Boolean(latestTs && incomingTs < latestTs - 2000);
}

async function carregarHistorico(conversation_id: string) {
  const { data } = await supabase
    .from("leo_messages")
    .select("role, content")
    .eq("conversation_id", conversation_id)
    .order("created_at", { ascending: false })
    .limit(40);
  return (data || []).reverse().map((m) => ({ role: m.role, content: m.content }));
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

    if (await mensagemJaProcessada(conversa.id, messageId)) {
      console.log("⏭️ Ignorado: messageId já processado", messageId);
      return new Response(JSON.stringify({ ignored: "duplicate_message_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (await mensagemForaDeOrdem(conversa.id, body?.timestamp || null)) {
      console.warn("⏭️ Ignorado: webhook antigo/fora de ordem", { messageId, timestamp: body?.timestamp });
      return new Response(JSON.stringify({ ignored: "stale_out_of_order" }), {
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
      // ➕ DASHBOARD: cria lead em "Contato Inicial" assim que a conversa começa
      await registrarLeadContatoInicial(telefone, conversa.nome_cliente || nome || "");
    }

    await salvarMensagem(conversa.id, "user", messageBody, { message_id: messageId || null, raw_timestamp: body?.timestamp || null });
    await supabase
      .from("leo_conversations")
      .update({ ultima_mensagem_at: new Date().toISOString(), nome_cliente: conversa.nome_cliente || nome || null })
      .eq("id", conversa.id);

    const estadoAntesAceite = await carregarEstadoConversa(conversa.id);

    // ➕ DASHBOARD: detecta aceite explícito do orçamento → gera pedido_venda e fecha o lead
    // Só aceita depois que o orçamento já foi enviado nesta conversa. Antes disso,
    // respostas como "fechada" são tratadas como tipo de lâmina, nunca como aceite.
    if (estadoProntoParaOrcamento(estadoAntesAceite) && await pdfJaEnviadoConversa(conversa.id) && pareceAceite(messageBody)) {
      const r = await aceitarOrcamentoEGerarPedido(telefone);
      if (r?.pedido_numero) {
        const msg = `Perfeito! ✅ Orçamento ${r.orcamento_numero} aceito e pedido ${r.pedido_numero} aberto. Em breve um atendente confirma os próximos passos.`;
        await salvarMensagem(conversa.id, "assistant", msg, { pedido_gerado: r.pedido_numero });
        await enviarTexto(telefone, msg);
        return new Response(JSON.stringify({ ok: true, pedido_gerado: r.pedido_numero }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const estadoLocalInferido = await aplicarExtracaoDeterministica(conversa.id, telefone, messageBody);

    const estadoAposExtracao = (await carregarEstadoConversa(conversa.id)) || estadoLocalInferido;
    const perguntaDeterministica = proximaPerguntaDeterministica(estadoAposExtracao);
    if (perguntaDeterministica) {
      await salvarMensagem(conversa.id, "assistant", perguntaDeterministica, { deterministic_flow: true });
      await enviarTexto(telefone, perguntaDeterministica);
      return new Response(JSON.stringify({ ok: true, deterministic_flow: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (estadoProntoParaOrcamento(estadoAposExtracao)) {
      const jaEnviouPdf = await pdfJaEnviadoConversa(conversa.id);
      const pareceNovoPedido = /\b(orcamento|orçamento|cotacao|cotação|preco|preço|valor|nova|novo|outra|outro)\b/i.test(messageBody);
      if (jaEnviouPdf && !pareceNovoPedido) {
        console.log("⏭️ PDF já enviado nesta conversa — não gera duplicado");
        return new Response(JSON.stringify({ ok: true, ignored: "pdf_already_sent" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const resultadoPdf = await gerarEEnviarOrcamentoDeterministico(conversa.id, telefone, conversa.nome_cliente || nome || "");
      if (resultadoPdf.pdf_enviado) {
        await salvarMensagem(conversa.id, "assistant", resultadoPdf.caption, { pdf_enviado: true, deterministic_flow: true });
        // ➕ DASHBOARD: salva orçamento + anexo PDF e move lead para "orcamento_enviado"
        if (resultadoPdf.pdfBase64 && resultadoPdf.orcamento) {
          await registrarOrcamentoEAvancarFunil({
            telefone,
            nome: conversa.nome_cliente || nome || "",
            orcamento: resultadoPdf.orcamento,
            pdfBase64: resultadoPdf.pdfBase64,
            filename: resultadoPdf.filename || `orcamento_${Date.now()}.pdf`,
          });
        }
      } else {
        const aviso = "Consegui levantar os dados, mas tive uma falha ao gerar o PDF. Vou deixar um atendente finalizar o envio por aqui.";
        await salvarMensagem(conversa.id, "assistant", aviso, { deterministic_flow: true, pdf_error: resultadoPdf.error || resultadoPdf.faltando || null });
        await enviarTexto(telefone, aviso);
      }
      return new Response(JSON.stringify({ ok: true, deterministic_pdf: true, pdf_enviado: Boolean(resultadoPdf.pdf_enviado) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
                // ➕ DASHBOARD: salva orçamento + anexo PDF e move lead para "orcamento_enviado"
                await registrarOrcamentoEAvancarFunil({
                  telefone,
                  nome: conversa.nome_cliente || nome || "",
                  orcamento: o,
                  pdfBase64: pdfB64,
                  filename,
                });
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
    // Captura defensiva: PostgrestError costuma ter message/details/hint/code,
    // mas em alguns recarregamentos do schema cache vem tudo em branco.
    const partes = [
      e?.message,
      e?.error_description,
      e?.details,
      e?.hint,
      e?.code ? `code=${e.code}` : null,
      e?.status ? `status=${e.status}` : null,
      e?.statusText,
      e?.name,
    ].filter(Boolean);
    const errMsg = partes.join(" | ") || (typeof e === "string" ? e : "") || "erro desconhecido (objeto vazio)";
    let raw = "";
    try { raw = JSON.stringify(e, Object.getOwnPropertyNames(e || {})); } catch { raw = String(e); }
    console.error("leo-webhook erro:", errMsg, "| stack:", e?.stack || "n/a", "| raw:", raw, "| typeof:", typeof e, "| ctor:", e?.constructor?.name);
    // Não retorna 500 nem envia texto genérico: isso fazia o provedor reentregar webhooks antigos
    // e o cliente recebia "instabilidade" duplicada mesmo quando o próximo passo já tinha sido enviado.
    return new Response(JSON.stringify({ ok: false, handled: true, error: errMsg }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
