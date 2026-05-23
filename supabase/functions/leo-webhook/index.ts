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
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const PRIMESYNC_URL = Deno.env.get("PRIMESYNC_URL")!;
const PRIMESYNC_TOKEN = Deno.env.get("PRIMESYNC_TOKEN")!;
const DOCRYA_API_KEY = Deno.env.get("DOCRYA_API_KEY") ?? "";
const PDFSHIFT_API_KEY = Deno.env.get("PDFSHIFT_API_KEY") ?? "";

const DOCRYA_URL = "https://www.docrya.com/api/v1/html-to-pdf";
const PDFSHIFT_URL = "https://api.pdfshift.io/v3/convert/pdf";
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
// Modelo Lovable AI para agente de vendas com tool calling
const AI_MODEL = "google/gemini-3-flash-preview";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Backend legado (onde estão Clientes, estoque, funil)
const LEGACY_SUPABASE_URL = "https://pdwghmxolqiuyxunglon.supabase.co";
const LEGACY_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkd2dobXhvbHFpdXl4dW5nbG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNjM1NTMsImV4cCI6MjA4NDgzOTU1M30.FmYvMO9HLz-AUUH29TwBbRYA2KMPdyczSjorq3vVDcM";
const legacyDb = createClient(LEGACY_SUPABASE_URL, LEGACY_SUPABASE_KEY, {
  auth: { persistSession: false },
});

// A dashboard atual (Lovable Cloud) é a fonte de verdade para estoque,
// orçamentos, pedidos e funil. O Leo precisa ler/gravar AQUI para que
// os dados apareçam nas telas que o usuário gerencia.
const dashboardDb = supabase;

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

function ehPendenteSerralheiro(tipo: unknown): boolean {
  const t = String(tipo || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return t.includes("pendente") && t.includes("serralheiro");
}

function montarMensagemPendenteSerralheiro(nome?: string | null): string {
  const primeiroNome = (nome || "").trim().split(/\s+/)[0] || "";
  return `${primeiroNome ? primeiroNome + ", " : ""}seu cadastro como *Serralheiro* ainda está *pendente de aprovação* pela nossa equipe. ⏳\n\nAssim que for liberado, eu sigo com você normalmente para gerar o orçamento. Obrigado pela paciência! 🙏`;
}

function telefoneClienteBate(cliFone: unknown, telefone: string): boolean {
  const alvo = normalizarTelefone(telefone);
  const fone = normalizarTelefone(String(cliFone || ""));
  if (!alvo || !fone) return false;
  const alvoSemPais = alvo.startsWith("55") ? alvo.slice(2) : alvo;
  const foneSemPais = fone.startsWith("55") ? fone.slice(2) : fone;
  return fone === alvo || fone === alvoSemPais || foneSemPais === alvoSemPais || fone.endsWith(alvo.slice(-10)) || alvo.endsWith(fone.slice(-10));
}

function escolherClienteMaisRelevante(clientes: any[], telefone: string) {
  const matches = (clientes || []).filter((c) => telefoneClienteBate(c?.CLI_FONE, telefone));
  const lista = matches.length ? matches : (clientes || []);
  return lista.find((c) => ehPendenteSerralheiro(c?.tipo_cliente))
    || lista.find((c) => /revenda|instalada|porta_instalada/i.test(String(c?.tipo_cliente || "")))
    || lista[0]
    || null;
}

// Busca cliente no backend legado pelo telefone
async function buscarClientePorTelefone(telefone: string) {
  const tel = normalizarTelefone(telefone);
  if (!tel) return null;
  // Variações para casar formatos diferentes salvos no banco, mas SEMPRE com match exato
  // (não usar ilike %v% para evitar falso positivo com telefones que contenham os mesmos dígitos)
  const semPais = tel.startsWith("55") ? tel.slice(2) : tel;
  const variacoes = Array.from(new Set([
    tel,
    semPais,
    tel.slice(-11),
    tel.slice(-10),
    `+${tel}`,
    `+55${semPais}`,
  ].filter(Boolean)));

  // Busca todos os clientes que batem em qualquer uma das variações exatas
  const { data, error } = await legacyDb
    .from("Clientes")
    .select("CLI_CNPJ, CLI_NOME, CLI_EMAIL, CLI_FONE, CLI_CPF, tipo_cliente")
    .in("CLI_FONE", variacoes)
    .limit(20);
  if (error) {
    console.error("buscarClientePorTelefone erro:", error?.message || error);
    return null;
  }
  if (data && data.length > 0) return escolherClienteMaisRelevante(data, tel);

  // Fallback: compara apenas os dígitos (caso o banco tenha guardado com máscara como "(71) 9...")
  const { data: todos } = await legacyDb
    .from("Clientes")
    .select("CLI_CNPJ, CLI_NOME, CLI_EMAIL, CLI_FONE, CLI_CPF, tipo_cliente")
    .ilike("CLI_FONE", `%${tel.slice(-8)}%`)
    .limit(50);
  if (Array.isArray(todos)) {
    const match = escolherClienteMaisRelevante(todos, tel);
    if (match) return match;
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
    // Revenda entra como "Pendente Serralheiro" até aprovação humana na dashboard
    payload.tipo_cliente = input.tipo_cliente === "porta_instalada" ? "Porta Instalada" : "Pendente Serralheiro";
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
  // Revenda entra como "Pendente Serralheiro" até aprovação humana na dashboard
  const valor = tipo === "porta_instalada" ? "Porta Instalada" : "Pendente Serralheiro";
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
  motor_1000kg: 2811.69,
  motor_1500kg: 5375.35,
  controle_remoto: 89.90,
  central_comando: 180.50,
  mao_de_obra_padrao: 800.00,
  portinhola: 883.84,
  alcapao: 649.94,
};

// ===========================
// MÓDULO 8 — REGRAS INDUSTRIAIS (helpers puros)
// ===========================
/** Rolo segundo o eixo: 4.5"/5" → 0,60 m; > 5" → 0,75 m. */
function calcRolo(eixoPolegadas?: number): number {
  if (!eixoPolegadas || eixoPolegadas <= 5) return 0.60;
  return 0.75;
}
/** Qtd de lâminas: perfil baixo ÷ 0,075; perfil alto ÷ 0,085. Arredonda pra cima. */
function calcLaminas(alturaTotal: number, perfil: "baixo" | "alto"): number {
  const divisor = perfil === "alto" ? 0.085 : 0.075;
  if (!alturaTotal || alturaTotal <= 0) return 0;
  return Math.ceil(alturaTotal / divisor);
}
/** Guias por metro linear. 1 par = 2 unidades. total = qtd × (par ? 2 : 1) × comprimento. */
function calcGuiasMetrosLineares(qtd: number, par: boolean, comprimentoM: number): number {
  const unidadesPorItem = par ? 2 : 1;
  return Math.max(0, (qtd || 0) * unidadesPorItem * (comprimentoM || 0));
}

/**
 * Calcula a medida de corte (em metros) para eixo, soleira e lâminas
 * a partir do vão livre, tipo de instalação, guias e se há trava de lâminas.
 *
 * Tipos:
 *  - entre_testeiras: desconto 0,02 (com trava: lâminas -0,03)
 *  - vao_1guia:       vão + profundidade_guia - 0,02 (com trava: -0,03 nas lâminas)
 *  - vao_guias:       vão + guia_esq + guia_dir - 0,02 (com trava: -0,03 nas lâminas)
 *  - entre_paredes:   desconto 0,07 (com trava: lâminas -0,08)
 */
type TipoInstalacao = "entre_testeiras" | "vao_1guia" | "vao_guias" | "entre_paredes";
function calcMedidaCorte(
  vaoLivre: number,
  instalacao: TipoInstalacao,
  opts: { guia_mm?: number; guia_mm_esq?: number; guia_mm_dir?: number; trava?: boolean } = {}
): { eixo: number; soleira: number; laminas: number } {
  const v = Number(vaoLivre) || 0;
  if (!v) return { eixo: 0, soleira: 0, laminas: 0 };
  const trava = !!opts.trava;
  const gM = (mm?: number) => (Number(mm) || 0) / 1000;
  let base = v;
  let descLam = 0;
  switch (instalacao) {
    case "entre_testeiras":
      base = v - 0.02;
      descLam = trava ? -0.01 : 0;
      break;
    case "vao_1guia": {
      const g = gM(opts.guia_mm ?? opts.guia_mm_esq ?? opts.guia_mm_dir);
      base = v + g - 0.02;
      descLam = trava ? -0.01 : 0;
      break;
    }
    case "vao_guias": {
      const ge = gM(opts.guia_mm_esq ?? opts.guia_mm);
      const gd = gM(opts.guia_mm_dir ?? opts.guia_mm);
      base = v + ge + gd - 0.02;
      descLam = trava ? -0.01 : 0;
      break;
    }
    case "entre_paredes":
      base = v - 0.07;
      descLam = trava ? -0.01 : 0;
      break;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    eixo: round(base),
    soleira: round(base),
    laminas: round(base + descLam),
  };
}
const POTENCIAS_AC = [200, 300, 400, 500, 800, 1000, 1500];
const POTENCIAS_DC = [200, 300, 400, 500, 800];
function validarMotor(m: { tipo?: string; ac_dc?: string; potencia?: number }): { ok: boolean; faltando: string[] } {
  const faltando: string[] = [];
  if (!m.tipo || !["avulso", "motor_testeiras", "kit_automatizador"].includes(m.tipo)) faltando.push("tipo (avulso, motor+testeiras ou kit automatizador)");
  if (!m.ac_dc || !["AC", "DC"].includes(m.ac_dc)) faltando.push("AC ou DC");
  const lista = m.ac_dc === "DC" ? POTENCIAS_DC : POTENCIAS_AC;
  if (!m.potencia || !lista.includes(m.potencia)) faltando.push(`potência (${lista.join("/")} kg)`);
  return { ok: faltando.length === 0, faltando };
}
/** Portinhola e alçapão não podem coexistir na mesma porta. */
function validarPortinholaAlcapao(cfg: { portinhola?: boolean; alcapao?: boolean }): { ok: boolean; erro?: string } {
  if (cfg.portinhola && cfg.alcapao) return { ok: false, erro: "Portinhola e alçapão não podem ser usados juntos na mesma porta." };
  return { ok: true };
}



interface OrcamentoInput {
  largura: number;
  altura: number;
  tipo_perfil?: "fechado" | "transvision" | "oblongo";
  tipo_motor?: "200kg" | "300kg" | "400kg" | "500kg" | "800kg" | "1500kg";
  tipo_pintura?: "branco_liso" | "preta_fosco" | "cinza_texturizado" | "cor_especial";
  incluir_pintura?: boolean;
  tipo_cliente: "porta_instalada" | "revenda";
  cidade?: string;
  estado?: string;
  frete?: number;
  cliente_nome?: string;
  cliente_endereco?: string;
  adicionais?: { portinhola?: boolean; alcapao?: boolean };
}

function calcularOrcamento(input: OrcamentoInput) {
  const { largura, altura, tipo_cliente } = input;
  const tipo_perfil = input.tipo_perfil || "transvision";
  const tipo_motor = input.tipo_motor || "500kg";
  const incluir_pintura = input.incluir_pintura !== false && Boolean(input.tipo_pintura);
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
  if (incluir_pintura) {
    add("COMP-009", `PINTURA ${tipo_pintura.toUpperCase().replace("_", " ")} (ELETROSTÁTICA)`, area, "M²", (PRECOS as any)[`pintura_${tipo_pintura}`]);
  }
  add("COMP-010", `AUTOMATIZADOR ${tipo_motor.toUpperCase()}`, 1, "UN", (PRECOS as any)[`motor_${tipo_motor}`]);
  add("COMP-011", `CONTROLE REMOTO ANALÓGICO`, 2, "UN", PRECOS.controle_remoto);
  add("COMP-012", `CENTRAL DE COMANDO ANALÓGICO`, 1, "UN", PRECOS.central_comando);

  if (input.adicionais?.portinhola) {
    add("ADIC-001", `PORTINHOLA (porta de acesso integrada)`, 1, "UN", PRECOS.portinhola);
  }
  if (input.adicionais?.alcapao) {
    add("ADIC-002", `ALÇAPÃO (acesso na porta)`, 1, "UN", PRECOS.alcapao);
  }

  const subtotal_produtos = itens.reduce((s, i) => s + i.subtotal, 0);

  let mao_de_obra = 0;
  let frete = 0;
  if (tipo_cliente === "porta_instalada") {
    mao_de_obra = area <= 30 ? 1500 : 2000;
    frete = input.frete || 0;
  }

  const total_geral = subtotal_produtos + mao_de_obra + frete;

  return {
    largura, altura, area,
    tipo_cliente, tipo_perfil, tipo_motor, tipo_pintura, incluir_pintura,
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
      ${(o as any).is_pecas_avulsas
        ? `<strong>Modalidade:</strong> ${o.tipo_cliente === "porta_instalada" ? "Porta instalada" : "Revenda"} — peças avulsas<br/><strong>Itens:</strong> ${o.itens.length} peça(s) selecionada(s)`
        : `<strong>Dimensões:</strong> ${o.largura.toFixed(2).replace(".", ",")}m x ${o.altura.toFixed(2).replace(".", ",")}m<br/>
      <strong>Área:</strong> ${o.area.toFixed(2).replace(".", ",")}m²<br/>
      <strong>Perfil:</strong> ${escapeHtml(o.tipo_perfil)} · <strong>Motor:</strong> ${escapeHtml(o.tipo_motor)} · <strong>Pintura:</strong> ${escapeHtml(o.incluir_pintura ? o.tipo_pintura.replace("_", " ") : "não inclusa")}`}
    </div>
  </div>
</div>

<div class="delivery">PREVISÃO DE ENTREGA: ${(o as any).is_pecas_avulsas ? "conforme disponibilidade de estoque, confirmada pelo atendimento comercial." : "até 15 dias após assinatura do pedido, sujeito à confirmação comercial e disponibilidade."}</div>

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

async function enviarImagemUrl(numero: string, imageUrl: string, caption?: string) {
  const captionTxt = (caption || "Veja as opções de lâminas disponíveis.").trim();
  // Tenta enviar imagem por URL via PrimeSync (vários formatos suportados)
  const variants = [
    { body: { number: numero, body: captionTxt, mediaUrl: imageUrl, mediaType: "image" } },
    { body: { number: numero, body: captionTxt, url: imageUrl, mediaType: "image" } },
    { body: { number: numero, caption: captionTxt, body: captionTxt, mediaUrl: imageUrl, mediaType: "image" } },
  ];
  for (const [idx, v] of variants.entries()) {
    try {
      const r = await fetch(PRIMESYNC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PRIMESYNC_TOKEN}`,
        },
        body: JSON.stringify(v.body),
      });
      const txt = await r.text();
      const ok = r.ok && !/erro|error|invalid|missing/i.test(txt);
      console.log(`🖼️ PrimeSync img URL ${idx + 1}: status=${r.status} ok=${ok} resp=${txt.substring(0, 200)}`);
      if (ok) return true;
    } catch (e) {
      console.error(`🖼️ PrimeSync img URL ${idx + 1} exceção:`, e);
    }
  }
  // Fallback: baixar e enviar como multipart
  try {
    const imgResp = await fetch(imageUrl);
    const buf = new Uint8Array(await imgResp.arrayBuffer());
    const blob = new Blob([buf], { type: "image/jpeg" });
    const form = new FormData();
    form.append("number", numero);
    form.append("body", captionTxt);
    form.append("caption", captionTxt);
    form.append("mediaType", "image");
    form.append("mimetype", "image/jpeg");
    form.append("medias", blob, "laminas.jpeg");
    const r = await fetch(PRIMESYNC_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${PRIMESYNC_TOKEN}` },
      body: form,
    });
    const txt = await r.text();
    console.log(`🖼️ PrimeSync img multipart: status=${r.status} resp=${txt.substring(0, 200)}`);
    return r.ok;
  } catch (e) {
    console.error("🖼️ PrimeSync img multipart exceção:", e);
    return false;
  }
}

const LAMINAS_IMAGE_URL = "https://qehuellmpdrimtxcqbxc.supabase.co/storage/v1/object/public/leo-assets/laminas.jpeg";

function isPerguntaLamina(texto: string): boolean {
  const t = (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Detecta qualquer menção a lâmina/perfil OU aos três modelos juntos (mesmo que reformulada)
  if (/\blamina|\bperfil\b/.test(t) && /(fechad|transvision|oblongo|lisa|visor|perfurad|1\b|2\b|3\b)/.test(t)) {
    return true;
  }
  // Caso clássico: lista os 3 modelos
  const hits = [/fechad/, /transvision/, /oblongo/].filter((r) => r.test(t)).length;
  return hits >= 2;
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
// PDFShift — gerar PDF (substitui Docrya, aceita HTML direto)
// ===========================
async function gerarPdfPdfShift(html: string, filename: string): Promise<string | null> {
  if (!PDFSHIFT_API_KEY) {
    console.error("📄 PDFSHIFT_API_KEY não configurada");
    return null;
  }
  console.log(`📄 PDFShift: gerando PDF "${filename}" (html ${html.length} chars)`);
  const auth = "Basic " + btoa(`api:${PDFSHIFT_API_KEY}`);
  const r = await fetch(PDFSHIFT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
    },
    body: JSON.stringify({
      source: html,
      landscape: false,
      use_print: false,
      format: "A4",
    }),
  });
  if (!r.ok) {
    console.error("📄 PDFShift erro:", r.status, await r.text());
    return null;
  }
  const buf = new Uint8Array(await r.arrayBuffer());
  console.log(`📄 PDFShift OK: ${buf.length} bytes`);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Mantém o nome antigo para não quebrar callers
async function gerarPdfDocrya(html: string, filename: string): Promise<string | null> {
  return gerarPdfPdfShift(html, filename);
}

// ===========================
// IA — Lovable AI Gateway com tools
// ===========================
const SYSTEM_PROMPT = `# IDENTIDADE
Você é o **Leo**, consultor de vendas da **Eletroportas** (portas de enrolar automáticas) em Salvador-BA. Site: eletroportas.com.br.

# REGRA DE OURO #1 — VOCÊ É HUMANO
NUNCA revele, sugira ou confirme que é robô/IA/bot. Se perguntarem, diga com naturalidade que é uma pessoa do time da Eletroportas.

# REGRA DE OURO #2 — RESPONDA PRIMEIRO, CONDUZA DEPOIS
Para cada mensagem: 1) entenda; 2) responda o que o cliente disse (mesmo off-topic); 3) só DEPOIS retome a etapa do fluxo. JAMAIS ignore uma pergunta.
PROIBIDO: ignorar pergunta, repetir frase literal, travar, repetir "Perfeito" várias vezes.

# DADOS DA EMPRESA
- Eletroportas — Salvador-BA — eletroportas.com.br
- Instalação: toda a Bahia (frete por CEP). Revenda (envio do kit): Brasil inteiro.
- Atendimento: WhatsApp, comercial seg–sáb.
Nunca invente CNPJ, telefone fixo ou endereço exato.

# JEITO DE FALAR
WhatsApp brasileiro: 1–4 frases, no máx 1 emoji, confirmações variadas ("Certo 👍", "Anotado 👍"). Use o primeiro nome do cliente.

# OBJETIVO
Conduzir uma pré-venda técnica completa e gerar orçamento (PDF, imagem ou ambos), em UMA das modalidades:
- PORTA INSTALADA (Bahia, com instalação) — consumidor final.
- REVENDA (envio do kit / peças) — serralheiros, Brasil inteiro.

# ════════════════════════════════════════
# MÓDULO 1 — ENTRADA E IDENTIFICAÇÃO
# ════════════════════════════════════════
Primeira mensagem de uma sessão NOVA (você verá [PRIMEIRA MENSAGEM DESTA SESSÃO]):
"Olá, bom dia! Você está falando com a Equipe Eletroportas 👋
Para agilizar seu atendimento, me diga: você é
1️⃣ Consumidor final (quer instalar uma porta)
2️⃣ Serralheiro / parceiro técnico (compra de kit ou peças)"

→ Se 1: \`definir_tipo_cliente\` (porta_instalada) e segue para MÓDULO 5 (Kit Porta Instalada).
→ Se 2: peça o telefone com DDD para validar cadastro de parceiro: "Certo 👍 Informe seu telefone com DDD (ex: 71999999999) para eu validar seu cadastro de parceiro."

Após receber o telefone do serralheiro:
- CADASTRADO como Revenda/Parceiro → "Tudo certo 👍 Cadastro de parceiro localizado." → MÓDULO 2.
- NÃO encontrado → NÃO bloqueie:
  "Certo 👍 Não localizamos seu cadastro de parceiro. Para continuar o atendimento, me passa:
   • Nome ou empresa
   • Cidade
   • Telefone com DDD"
  Depois chame \`cadastrar_cliente\` (tipo_cliente=revenda) e avise: "Obrigado 👍 Seu pré-cadastro foi realizado. Enquanto a análise é concluída, você já pode solicitar orçamentos normalmente." → MÓDULO 2. O orçamento sai marcado "sujeito à aprovação".

# ════════════════════════════════════════
# MÓDULO 2 — MENU TÉCNICO DO SERRALHEIRO
# ════════════════════════════════════════
"O que deseja orçar?
1️⃣ Kit porta de enrolar
2️⃣ Peças avulsas
3️⃣ Motores
4️⃣ Acessórios"

Regras:
- Carrinho MÚLTIPLO. O cliente pode adicionar quantos itens quiser.
- Interprete texto livre: "quero motor"→Módulo 3; "preciso de guias"→Módulo 4.1; "porta automática"→Módulo 5.
- Após CADA item, resuma e PERGUNTE: "👉 Deseja acrescentar mais algum item ao pedido?"
  SIM → volta ao menu. NÃO → MÓDULO 6.

# ════════════════════════════════════════
# MÓDULO 3 — MOTORES
# ════════════════════════════════════════
Opções: 1) Motor avulso; 2) Motor + testeiras; 3) Kit automatizador (motor+testeiras+central+controles).
Modelos AC: 200, 300, 400, 500, 800, 1000, 1500 kg.
Modelos DC: 200, 300, 400, 500, 800 kg.
Interprete livre ("2 motores AC 500 e 1 kit DC 300"). Se faltar AC/DC, potência ou tipo, pergunte SÓ o que falta.
Resumo:
"Anotando 👍
• 2x Motor AC 500 kg
• 1x Kit automatizador DC 300 kg
Confirma para adicionar ao pedido?"
→ \`definir_pecas_avulsas\` → "Deseja acrescentar mais algum item?"

# ════════════════════════════════════════
# MÓDULO 4 — PEÇAS AVULSAS
# ════════════════════════════════════════
## 4.1 GUIAS (prioridade)
Modelos: 50, 60, 70, 80, 90, 100 mm. Venda por METRO LINEAR.
Aceite: "10 guias 60mm 3m", "1 par de guia 70 com 5m", "4 guias de 80".
Cálculo: 1 par = 2 unidades. total_ml = quantidade × (par ? 2 : 1) × comprimento_m.
Exemplo: 1 par de guia 60mm × 3m = 6 metros lineares.
Resumo: "Anotando 👍 1 par de guia 60 mm × 3 m → 6 metros lineares. Confirma?"
→ \`definir_pecas_avulsas\` com produto_nome="GUIA LATERAL 60MM", unidade="MT", quantidade=6.

## 4.2 LÂMINAS, EIXO, SOLEIRA, PVC, BORRACHA
Pergunte só o que falta (perfil, medida, modelo). Use \`listar_pecas_disponiveis\`. Lâminas: meia cana lisa, meia cana perfurada, transvision, lisa reta — perfil baixo ou alto.

## 4.3 ACESSÓRIOS
Controles, centrais, botoeiras, sensores. Use \`listar_pecas_disponiveis\`.

Sempre que adicionar item, PERGUNTE: "👉 Deseja acrescentar mais algum item?"

# ════════════════════════════════════════
# MÓDULO 5 — KIT PORTA DE ENROLAR
# ════════════════════════════════════════
### E1 — Medidas
"Me informa as medidas do vão? Formato: **Largura x Altura** (ex: 5,50 x 3,00). Se souber o rolo: Largura x (Altura + Rolo)." → \`definir_medidas\`.
Regra do rolo (não pergunte se cliente não informar): eixo 4.5" ou 5" → 0,60 m. Maior que 5" → 0,75 m. Altura total = altura + rolo.

### E2 — Configuração (livre)
"Agora descreva como deseja a porta — automática/manual, cor, modelo de lâmina, portinhola, alçapão, motor."

### E3 — Lâmina
Modelos: meia cana lisa, meia cana perfurada, transvision, lisa reta. Perfis: baixo (0,075 m) ou alto (0,085 m).
Quantidade = teto(altura_total ÷ perfil). Mostre no resumo. → \`definir_lamina\`.

### E4 — Pintura
SIM/NÃO. Se SIM: branco liso, preta fosco, cinza texturizado, ou cor especial (RAL). → \`definir_pintura\`.

### E5 — Tensão (informativa, NÃO pergunte)
"O automatizador usa 220V bifásico. Verifique se o local possui essa tensão 👍"

### E6 — Acesso de emergência
"O local tem outra entrada caso a porta fique fechada por manutenção/falta de energia?"
- SIM → portinhola/alçapão opcionais.
- NÃO → recomende UM (NUNCA portinhola + alçapão juntos).
Portinhola: VILD / VILE / Centro (medida padrão — NÃO pergunte medida). Sentido (separado): dentro ou fora.
Alçapão: emergencial. → \`definir_adicionais\`.

### E7 — Motor (segue MÓDULO 3)

### E8 — Entrega
Porta instalada: "Prefere entrega ou retirar?" → \`definir_entrega\`. Se entrega + BA, peça CEP → \`calcular_frete_cep\`. CEP fora da BA → ofereça revenda (envio do kit), NUNCA transfira para humano.

### E9 — "Mais algum item?"
Resumo (medidas, lâmina, cor, motor, acessórios) + "👉 Deseja acrescentar mais algum item ao pedido?"
SIM → volta ao MÓDULO 2 mantendo carrinho. NÃO → MÓDULO 6.

# ════════════════════════════════════════
# MÓDULO 6 — FINALIZAÇÃO
# ════════════════════════════════════════
"Como deseja receber seu orçamento?
1️⃣ PDF
2️⃣ Imagem
3️⃣ Ambos"
Após resposta, chame \`gerar_orcamento\` com \`formato\` (pdf/imagem/ambos) e \`observacoes_tecnicas\`. O sistema busca o preço no estoque, calcula subtotais/total e envia.

# ════════════════════════════════════════
# MÓDULO 8 — REGRAS INDUSTRIAIS
# ════════════════════════════════════════
- ROLO: eixo 4.5"/5" → 0,60 m. >5" → 0,75 m.
- LÂMINAS: perfil baixo altura_total ÷ 0,075; perfil alto ÷ 0,085. Arredondar para cima.
- GUIAS: por metro linear. 1 par = 2 unidades.
- SOLEIRA: por metro linear. Simples ou com reforço.
- PORTINHOLA: VILD/VILE/Centro, medida padrão.
- ALÇAPÃO: emergencial, NUNCA com portinhola.
- MOTORES: ver MÓDULO 3.

# REGRAS CRÍTICAS
1. Em [PRIMEIRA MENSAGEM DESTA SESSÃO], cumprimente + menu do Módulo 1 em UMA mensagem.
2. LEIA [ESTADO] e [CONTEXTO]. NUNCA repita pergunta já feita.
3. NUNCA invente preços. Valores só no PDF/imagem.
4. NUNCA diga que DC é "superior". NUNCA pergunte 127V/220V. NUNCA diga que a porta "não pode ir em indústria".
5. ANTI-LOOP: grave via tool assim que entender.

# QUANDO TRANSFERIR (apenas 3 casos)
1. Cliente pediu explicitamente.
2. 5 interações sem avançar.
3. Cliente enviou arquivo não-foto.
Mensagem fixa: "Combinado! Vou passar você para um de nossos vendedores agora mesmo. 👍" → \`transferir_humano\`.

# ESTADO
[ESTADO] é a fonte de verdade. UMA pergunta por vez. Conduza naturalmente.
`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "gerar_orcamento",
      description: "Gera o orçamento (PDF, imagem ou ambos) e envia ao cliente via WhatsApp. Lê automaticamente do [ESTADO] e do carrinho. Use 'formato' para escolher pdf | imagem | ambos. Se faltar dado, retorna DADOS_INSUFICIENTES.",
      parameters: {
        type: "object",
        properties: {
          tipo_motor: { type: "string", enum: ["200kg", "300kg", "400kg", "500kg", "800kg", "1500kg"], description: "Opcional, default 300kg" },
          tipo_pintura: { type: "string", enum: ["branco_liso", "preta_fosco", "cinza_texturizado", "cor_especial"], description: "Opcional" },
          formato: { type: "string", enum: ["pdf", "imagem", "ambos"], description: "Formato de saída escolhido pelo cliente no MÓDULO 6. Default: pdf." },
          observacoes_tecnicas: { type: "string", description: "Resumo técnico completo para o vendedor." },
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
      description: "Grava no banco o tipo de lâmina escolhido pelo cliente. Chame ASSIM QUE o cliente responder o Passo 4. Silenciosa. Na MESMA rodada avance para o próximo passo (Passo 5 — adicionais).",
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
      name: "definir_pintura",
      description: "Grava no banco se o cliente quer pintura eletrostática e qual a cor. Chame ASSIM QUE o cliente responder o Passo 5. Se o cliente NÃO quer pintura, chame com quer_pintura=false (sem tipo_pintura). Se quer, chame com quer_pintura=true e o tipo_pintura escolhido. Marca pintura_perguntado=true. Silenciosa.",
      parameters: {
        type: "object",
        properties: {
          quer_pintura: { type: "boolean", description: "true se o cliente quer incluir pintura, false se dispensou" },
          tipo_pintura: { type: "string", enum: ["branco_liso", "preta_fosco", "cinza_texturizado", "cor_especial"], description: "Cor escolhida (apenas se quer_pintura=true)" },
        },
        required: ["quer_pintura"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "definir_adicionais",
      description: "Grava no banco se o cliente quer Portinhola e/ou Alçapão. Chame ASSIM QUE o cliente responder o Passo 6 — mesmo que ele diga 'nenhum', 'não quero', 'só portinhola', 'os dois' etc. Marca adicionais_perguntado=true. Silenciosa — siga adiante na mesma rodada (CEP se porta_instalada, ou gerar_orcamento se revenda).",
      parameters: {
        type: "object",
        properties: {
          portinhola: { type: "boolean", description: "true se o cliente quer adicionar Portinhola" },
          alcapao: { type: "boolean", description: "true se o cliente quer adicionar Alçapão" },
        },
        required: ["portinhola", "alcapao"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "transferir_humano",
      description: "Use APENAS em 3 casos: (1) cliente pediu explicitamente falar com vendedor/humano; (2) 5 interações consecutivas sem avançar nenhuma etapa do fluxo (loop infinito real); (3) cliente enviou arquivo não-foto (documento, planilha, áudio longo, vídeo). Em qualquer outra situação, continue conduzindo sozinho.",
      parameters: {
        type: "object",
        properties: { motivo: { type: "string" } },
        required: ["motivo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "definir_subtipo_revenda",
      description: "Para clientes REVENDA ou PORTA INSTALADA. Grava no banco se o cliente quer um KIT completo de porta de enrolar ('kit') ou apenas PEÇAS AVULSAS ('pecas'). Chame ASSIM QUE o cliente responder. Silenciosa.",
      parameters: {
        type: "object",
        properties: {
          subtipo: { type: "string", enum: ["kit", "pecas"] },
        },
        required: ["subtipo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "definir_entrega",
      description: "Para clientes PORTA INSTALADA. Grava no banco se o cliente quer ENTREGA no local (true) ou se prefere BUSCAR/RETIRAR ele mesmo (false). Quando false, o frete fica zerado e NÃO é necessário CEP. Quando true, em seguida pergunte o CEP e chame calcular_frete_cep. Silenciosa.",
      parameters: {
        type: "object",
        properties: {
          quer_entrega: { type: "boolean", description: "true = quer entrega, false = vai buscar/retirar" },
        },
        required: ["quer_entrega"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_pecas_disponiveis",
      description: "Consulta o catálogo de peças disponíveis no estoque (códigos SKU, nome, preço de venda). Use quando o cliente revendedor de PEÇAS AVULSAS pedir para ver o que tem disponível, ou quando você precisar identificar uma peça que ele citou. Pode passar um termo de busca opcional.",
      parameters: {
        type: "object",
        properties: {
          busca: { type: "string", description: "Termo opcional para filtrar por nome/sku (ex: 'motor', 'guia', 'controle')" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "definir_pecas_avulsas",
      description: "Para REVENDA ou PORTA INSTALADA com subtipo=pecas. Grava a lista de peças que o cliente quer comprar. Chame ASSIM QUE o cliente listar peças com quantidade (ex: '5 motores 200kg', '2 controles e 10m de guia') — NÃO peça confirmação adicional antes. Cada item deve ter produto_nome e quantidade; informe codigo_sku quando souber.",
      parameters: {
        type: "object",
        properties: {
          itens: {
            type: "array",
            items: {
              type: "object",
              properties: {
                codigo_sku: { type: "string", description: "SKU do estoque (opcional, mas recomendado)" },
                produto_nome: { type: "string" },
                quantidade: { type: "number" },
                unidade: { type: "string", description: "ex: UN, MT, M²" },
                preco_unitario: { type: "number", description: "Preço unitário (opcional, será buscado do estoque se omitido)" },
              },
              required: ["produto_nome", "quantidade"],
            },
          },
        },
        required: ["itens"],
      },
    },
  },
];

async function chamarIA(messages: any[], options: { tools?: any[] | null; temperature?: number } = {}) {
  // Timeout generoso (30s) para o agente "pensar com calma" sem travar a request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  try {
    const r = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY || OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        ...(options.tools === null ? {} : { tools: options.tools || TOOLS }),
        temperature: options.temperature ?? 0.2, // resposta mais previsível e fiel ao fluxo
        top_p: 0.9,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });
    if (!r.ok) {
      const t = await r.text();
      if (r.status === 429) throw new Error("Lovable AI: limite de requisições atingido. Tente novamente em instantes.");
      if (r.status === 402) throw new Error("Lovable AI: créditos insuficientes no workspace.");
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

function estadoInicialConversa(telefone: string, nome?: string) {
  return {
    telefone,
    tipo_cliente: "indefinido",
    nome_cliente: nome || null,
    status: "ativa",
    etapa_fluxo: "entrada",
    subtipo_revenda: null,
    largura: null,
    altura: null,
    tipo_perfil: null,
    cep: null,
    frete: null,
    endereco_instalacao: null,
    quer_entrega: null,
    entrega_perguntado: false,
    quer_pintura: null,
    tipo_pintura: null,
    pintura_perguntado: false,
    pecas_avulsas: [],
    carrinho: [],
    pedido: { itens: [], total: 0, status: "em_andamento" },
    adicionais: { portinhola: false, alcapao: false },
    adicionais_perguntado: false,
    ultima_mensagem_at: new Date().toISOString(),
  };
}

async function reutilizarConversaComoNovaSessao(conversa: any, telefone: string, nome?: string) {
  // A constraint UNIQUE(telefone, tipo_cliente) impede criar/atualizar outra conversa
  // para o mesmo telefone/tipo. Por isso consolidamos em uma única conversa ativa
  // quando começa uma nova sessão, evitando loop em "PORTA INSTALADA ou REVENDA?".
  const limparOutras = await withSchemaRetry(() =>
    supabase.from("leo_conversations").delete().eq("telefone", telefone).neq("id", conversa.id)
  );
  if (limparOutras.error) console.error("⚠️", descreverErroPg(limparOutras.error, "getOuCriarConversa limpar duplicadas: "));

  const limparMensagens = await withSchemaRetry(() =>
    supabase.from("leo_messages").delete().eq("conversation_id", conversa.id)
  );
  if (limparMensagens.error) console.error("⚠️", descreverErroPg(limparMensagens.error, "getOuCriarConversa limpar mensagens: "));

  const reset = await withSchemaRetry(() =>
    supabase
      .from("leo_conversations")
      .update(estadoInicialConversa(telefone, nome))
      .eq("id", conversa.id)
      .select()
      .single()
  );
  if (reset.error) throw reset.error;
  return { conversa: reset.data, isNova: true };
}

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

    // Nova sessão de verdade: reutiliza a mesma linha e limpa estado/histórico antigo.
    return await reutilizarConversaComoNovaSessao(existing, telefone, nome);
  }

  const qualquerRes = await withSchemaRetry(() =>
    supabase
      .from("leo_conversations")
      .select("*")
      .eq("telefone", telefone)
      .order("ultima_mensagem_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  );
  if (qualquerRes.error) console.error("⚠️", descreverErroPg(qualquerRes.error, "getOuCriarConversa leitura qualquer: "));
  if (qualquerRes.data) return await reutilizarConversaComoNovaSessao(qualquerRes.data, telefone, nome);

  const criar = await withSchemaRetry(() =>
    supabase
      .from("leo_conversations")
      .insert(estadoInicialConversa(telefone, nome))
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
  if (/\b(serralheiro|serralheria|revenda|revender|revendedor|fornecimento|sem instalacao)\b/.test(t)) return "revenda";
  if (/\b(cliente\s*final|consumidor\s*final|consumidor|instalada|instalar|instalacao|com instalacao|porta instalada)\b/.test(t)) return "porta_instalada";
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
  const t = (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (!t) return null;
  // Match prefixes/typos comuns: "oblong", "oblong.", "transv", "fech", etc.
  if (/(^|\s)(1|fechad\w*|lis[ao]|meia\s*cana)(\s|$|[.,!?])/.test(t)) return "fechado";
  if (/(^|\s)(2|transv\w*|visor\w*|visao|visores)(\s|$|[.,!?])/.test(t)) return "transvision";
  if (/(^|\s)(3|oblong\w*|oblog\w*|perfurad\w*|perfurac\w*)(\s|$|[.,!?])/.test(t)) return "oblongo";
  return null;
}

function inferirAdicionaisTexto(texto: string, permitirNegacaoGenerica = false): { portinhola: boolean; alcapao: boolean } | null {
  const t = (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!t.trim()) return null;

  const negacaoExplicita = /\b(nenhum|nenhuma)\b/.test(t)
    || /\b(sem|nao quero|não quero|dispenso|dispensar)\b.*\b(portinhola|alcapao|alcapão|alcapa|adicionais?)\b/.test(t);
  const negacaoGenerica = permitirNegacaoGenerica && /\b(nao|não|sem|dispenso|dispensa|obrigado|obrigada)\b/.test(t);
  const querNenhum = (negacaoExplicita || negacaoGenerica)
    && !/\b(portinhola|alcapao|alcapão|alcapa|os dois|ambos|duas|dois)\b/.test(t);
  if (querNenhum) return { portinhola: false, alcapao: false };

  const ambos = /\b(os dois|ambos|duas|dois|todos|todas)\b/.test(t);
  const negaPortinhola = /\b(sem|nao|dispenso|recuso)\s+(a\s+)?portinhola\b/.test(t);
  const negaAlcapao = /\b(sem|nao|dispenso|recuso)\s+(o\s+)?(alcapao|alcapa)\b/.test(t);
  const portinhola = (ambos || /\b(portinhola|porta de acesso)\b/.test(t)) && !negaPortinhola;
  const alcapao = (ambos || /\b(alcapao|alcapa)\b/.test(t)) && !negaAlcapao;

  if (portinhola || alcapao) return { portinhola, alcapao };
  return null;
}

function inferirPinturaTexto(texto: string): { quer_pintura: boolean; tipo_pintura?: string } | null {
  const t = (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!t.trim()) return null;
  // cores explícitas → quer pintura
  if (/\bbranc(o|a)\b/.test(t)) return { quer_pintura: true, tipo_pintura: "branco_liso" };
  if (/\bpret(o|a)\b/.test(t)) return { quer_pintura: true, tipo_pintura: "preta_fosco" };
  if (/\bcinza\b/.test(t)) return { quer_pintura: true, tipo_pintura: "cinza_texturizado" };
  if (/\b(especial|ral)\b/.test(t)) return { quer_pintura: true, tipo_pintura: "cor_especial" };
  // negação clara
  if (/\b(nao|não|nao precisa|nao quero|sem pintura|dispens|nao precis|sem pint|negativo|nada)\b/.test(t)
      && !/\b(sim|quero|pode|incluir|coloca)\b/.test(t)) {
    return { quer_pintura: false };
  }
  // afirmação sem cor
  if (/\b(sim|quero|pode|incluir|coloca|pinta)\b/.test(t) && !/\bnao\b/.test(t)) {
    return { quer_pintura: true };
  }
  return null;
}

function inferirCepTexto(texto: string): string | null {
  const match = (texto || "").match(/\b\d{5}-?\d{3}\b/);
  return match ? match[0].replace(/\D/g, "") : null;
}

function inferirEntregaTexto(texto: string): { quer_entrega: boolean } | null {
  const t = (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!t.trim()) return null;
  // Cliente quer BUSCAR/RETIRAR (sem entrega)
  if (/\b(retirar|retiro|retirada|busc(o|ar|amos)|pego|pegar|vou\s+ai|vou\s+pegar|passo\s+(ai|la|para)\s+(pegar|buscar)|na\s+loja|no\s+local\s+de\s+voces|prefiro\s+(retirar|buscar|pegar)|sem\s+entrega|nao\s+precisa\s+entreg)\b/.test(t)) {
    return { quer_entrega: false };
  }
  // Cliente quer ENTREGA
  if (/\b(entreg(a|ar|am|uem|ue|uar)|pode\s+entregar|quero\s+entrega|me\s+entreguem|enviem|envio|mandem|manda(r)?|frete|deliver(y)?)\b/.test(t)) {
    return { quer_entrega: true };
  }
  return null;
}

function inferirSubtipoRevendaTexto(texto: string): "kit" | "pecas" | null {
  const t = (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!t.trim()) return null;
  // "porta de 4x5 com lâmina oblongo" é intenção clara de KIT, mesmo se a conversa anterior era peças avulsas.
  if (inferirMedidasTexto(texto) && /\b(porta|kit|lamina|lâmina)\b/.test(t)) return "kit";
  if (/\b(kit|porta\s*completa|porta\s*inteira|kit\s*completo|completo|porta\s*toda)\b/.test(t)) return "kit";
  if (/\b(pec[aá]s?\s*avuls(a|as)|avuls(a|as|o)|somente\s*pec|so\s*pec|apenas\s*pec|peca|pecas|pe[cç]a)\b/.test(t)) return "pecas";
  // Se o cliente já informou item + quantidade (ex: "queria orçar 5 motores de 200"),
  // isso é intenção clara de PEÇAS AVULSAS. Não repetir a pergunta KIT/PEÇAS.
  if (inferirPecasAvulsasTexto(texto).length > 0 && !/\b(kit|porta\s*completa|porta\s*inteira|kit\s*completo|completo|porta\s*toda)\b/.test(t)) return "pecas";
  return null;
}

function inferirPecasAvulsasTexto(texto: string): any[] {
  let entrada = (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!entrada.trim()) return [];
  // Se a mensagem é claramente identificação (CPF/CNPJ/RG), nunca extrair peças dela
  if (/\b(cpf|cnpj|rg|inscricao|inscrição)\b/.test(entrada)) return [];
  // Remove sequências de 11+ dígitos (CPF/CNPJ/telefone) para não virarem "quantidade"
  entrada = entrada.replace(/\b\d{11,}\b/g, " ");
  const numerosExtenso: Record<string, string> = {
    "uma": "1", "um": "1", "duas": "2", "dois": "2", "tres": "3", "quatro": "4",
    "cinco": "5", "seis": "6", "sete": "7", "oito": "8", "nove": "9", "dez": "10"
  };
  entrada = entrada.replace(/\b(uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)\b/g, (m) => numerosExtenso[m] || m);
  const partes = entrada.split(/(?:,|;|\s+e\s+|\s*\+\s*|\n)/).map((p) => p.trim()).filter(Boolean);
  const itens: any[] = [];
  // Whitelist de produtos conhecidos — evita capturar lixo como "cpf"
  const PRODUTOS_VALIDOS = /\b(motor|automatizador|controle|central|guia|lamina|lâmina|portinhola|alcapao|alçapão|fechadura|trava|eixo|mola|cabo|kit|porta)\b/;
  for (const parte of partes) {
    const inicio = parte.match(/(?:^|\b)(\d{1,4}(?:[,.]\d+)?)\s*(?:x\s*|un\s*|unidades?\s*|pcs?\s*)?(.+?)\s*$/i);
    const fim = inicio ? null : parte.match(/(.+?)\s+(\d{1,4}(?:[,.]\d+)?)\s*(?:un|unidades?|pcs?)?\s*$/i);
    if (!inicio && !fim) continue;
    const quantidade = Number(String(inicio ? inicio[1] : fim?.[2]).replace(",", "."));
    let nome = String(inicio ? inicio[2] : fim?.[1] || "").replace(/\b(de|da|do|para|com|tipo|modelo)\b/g, " ").replace(/\s+/g, " ").trim();
    nome = nome.replace(/^(m|mt|metro|metros)\s+/g, "").trim();
    nome = nome.replace(/\bmotores\b/g, "motor").replace(/\bcontroles\b/g, "controle").replace(/\bcentrais\b/g, "central").replace(/\bguias\b/g, "guia");
    nome = nome.replace(/\b(motor|automatizador)\s+(\d{2,4})(?!\s*kg)\b/g, "$1 $2kg");
    if (!Number.isFinite(quantidade) || quantidade <= 0 || quantidade > 9999) continue;
    if (nome.length < 3) continue;
    if (!PRODUTOS_VALIDOS.test(nome)) continue;
    itens.push({ produto_nome: nome, quantidade });
  }
  return itens;
}

function aplicarInferenciasEmEstado(base: any, textos: string[]) {
  const estado = { ...(base || {}) };
  let subtipoTravadoPorTexto = false;
  for (const txt of textos) {
    const tipo = inferirTipoClienteTexto(txt);
    if (tipo && (!estado.tipo_cliente || estado.tipo_cliente === "indefinido")) estado.tipo_cliente = tipo;

    const tipoDef = estado.tipo_cliente === "revenda" || estado.tipo_cliente === "porta_instalada";
    if (tipoDef) {
      const sub = inferirSubtipoRevendaTexto(txt);
      if (sub && !subtipoTravadoPorTexto && sub !== estado.subtipo_revenda) {
        estado.subtipo_revenda = sub;
        subtipoTravadoPorTexto = true;
        if (sub === "kit") {
          // Nova cotação de KIT no meio de uma conversa de peças: limpa dados incompatíveis
          // para forçar um PDF novo e não reutilizar o orçamento antigo.
          estado.pecas_avulsas = [];
          estado.pintura_perguntado = false;
          estado.quer_pintura = null;
          estado.tipo_pintura = null;
          estado.adicionais = { portinhola: false, alcapao: false };
          estado.adicionais_perguntado = false;
        } else if (sub === "pecas") {
          estado.largura = null;
          estado.altura = null;
          estado.tipo_perfil = null;
          estado.pintura_perguntado = false;
          estado.quer_pintura = null;
          estado.tipo_pintura = null;
          estado.adicionais = { portinhola: false, alcapao: false };
          estado.adicionais_perguntado = false;
        }
      } else if (sub) {
        subtipoTravadoPorTexto = true;
      }
    }

    // Se for revenda + peças, NÃO inferir medidas/lâmina/etc
    const ehPecas = estado.subtipo_revenda === "pecas";

    if (ehPecas) {
      const pecas = inferirPecasAvulsasTexto(txt);
      const atuais = Array.isArray(estado.pecas_avulsas) ? estado.pecas_avulsas : [];
      if (pecas.length > 0) {
        // Se ainda não há peças, ou as atuais são inválidas (qty absurda / preço 0 / sem produto conhecido),
        // substitui pelas peças recém-extraídas. Caso contrário, mescla (adiciona novas).
        const PRODUTOS_VALIDOS_RE = /\b(motor|automatizador|controle|central|guia|lamina|lâmina|portinhola|alcapao|alçapão|fechadura|trava|eixo|mola|cabo|kit|porta)\b/i;
        const atuaisInvalidas = atuais.length === 0 || atuais.some((p: any) => {
          const q = Number(p?.quantidade);
          const nome = String(p?.produto_nome || p?.descricao || "").toLowerCase();
          return !Number.isFinite(q) || q <= 0 || q > 9999 || !PRODUTOS_VALIDOS_RE.test(nome);
        });
        if (atuaisInvalidas) {
          estado.pecas_avulsas = pecas;
        } else {
          // mescla — soma quantidades por produto_nome
          const mapa = new Map<string, any>();
          for (const it of [...atuais, ...pecas]) {
            const k = String(it.produto_nome || "").toLowerCase().trim();
            if (!k) continue;
            if (mapa.has(k)) mapa.get(k).quantidade = Number(mapa.get(k).quantidade) + Number(it.quantidade);
            else mapa.set(k, { ...it });
          }
          estado.pecas_avulsas = Array.from(mapa.values());
        }
      }
    }

    if (!ehPecas) {
      const medidas = inferirMedidasTexto(txt);
      if (medidas && (estado.largura == null || estado.altura == null)) {
        estado.largura = medidas.largura;
        estado.altura = medidas.altura;
      }

      const lamina = inferirLaminaTexto(txt);
      if (lamina && !estado.tipo_perfil) estado.tipo_perfil = lamina;

      const adicionais = inferirAdicionaisTexto(txt, false);
      if (adicionais && estado.tipo_perfil && !estado.adicionais_perguntado) {
        estado.adicionais = adicionais;
        estado.adicionais_perguntado = true;
      }

    }

    const cep = inferirCepTexto(txt);
    if (cep && !estado.cep) estado.cep = cep;

    // Entrega/retirada pode aparecer em mensagem separada do CEP; capture pelo histórico inteiro.
    if (!estado.entrega_perguntado) {
      const ent = inferirEntregaTexto(txt);
      if (ent) {
        estado.entrega_perguntado = true;
        estado.quer_entrega = ent.quer_entrega;
      }
    }
  }
  return estado;
}

async function aplicarExtracaoDeterministica(conversaId: string, telefone: string, texto: string) {
  const estadoRes = await withSchemaRetry(() =>
    supabase
      .from("leo_conversations")
      .select("tipo_cliente, subtipo_revenda, pecas_avulsas, largura, altura, tipo_perfil, cep, frete, endereco_instalacao, adicionais, adicionais_perguntado, pintura_perguntado, quer_pintura, tipo_pintura, entrega_perguntado, quer_entrega")
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

  const ehPecas = estado.subtipo_revenda === "pecas";
  if (!ehPecas && estado.tipo_perfil && baseEstado?.pintura_perguntado && !baseEstado?.adicionais_perguntado) {
    const adicionaisDaRespostaAtual = inferirAdicionaisTexto(texto, true);
    if (adicionaisDaRespostaAtual) {
      estado.adicionais = adicionaisDaRespostaAtual;
      estado.adicionais_perguntado = true;
    }
  }

  const patch: Record<string, unknown> = {};
  if (estado.tipo_cliente && (!baseEstado?.tipo_cliente || baseEstado.tipo_cliente === "indefinido")) patch.tipo_cliente = estado.tipo_cliente;
  const subtipoAtual = baseEstado?.subtipo_revenda || null;
  const mudouSubtipo = Boolean(estado.subtipo_revenda && estado.subtipo_revenda !== subtipoAtual);
  if (estado.subtipo_revenda && (!subtipoAtual || mudouSubtipo)) {
    patch.subtipo_revenda = estado.subtipo_revenda;
    if (estado.subtipo_revenda === "kit") {
      patch.pecas_avulsas = [];
      patch.pintura_perguntado = false;
      patch.quer_pintura = null;
      patch.tipo_pintura = null;
      patch.adicionais = { portinhola: false, alcapao: false };
      patch.adicionais_perguntado = false;
    } else if (estado.subtipo_revenda === "pecas") {
      patch.largura = null;
      patch.altura = null;
      patch.tipo_perfil = null;
      patch.pintura_perguntado = false;
      patch.quer_pintura = null;
      patch.tipo_pintura = null;
      patch.adicionais = { portinhola: false, alcapao: false };
      patch.adicionais_perguntado = false;
    }
  }

  if (ehPecas && (!Array.isArray(baseEstado?.pecas_avulsas) || baseEstado.pecas_avulsas.length === 0)) {
    const pecas = Array.isArray(estado.pecas_avulsas) ? estado.pecas_avulsas : [];
    if (pecas.length > 0) patch.pecas_avulsas = await enriquecerPecasComEstoque(pecas);
  }

  if (!ehPecas) {
    if (estado.largura != null && (mudouSubtipo || baseEstado?.largura == null || Number(baseEstado?.largura) !== Number(estado.largura))) patch.largura = estado.largura;
    if (estado.altura != null && (mudouSubtipo || baseEstado?.altura == null || Number(baseEstado?.altura) !== Number(estado.altura))) patch.altura = estado.altura;
    if (estado.tipo_perfil && (mudouSubtipo || !baseEstado?.tipo_perfil || String(baseEstado?.tipo_perfil).toLowerCase() !== String(estado.tipo_perfil).toLowerCase())) patch.tipo_perfil = estado.tipo_perfil;

    // Pintura: só infere após o perfil estar definido
    if (estado.tipo_perfil && !baseEstado?.pintura_perguntado) {
      const pint = inferirPinturaTexto(texto);
      if (pint) {
        patch.pintura_perguntado = true;
        patch.quer_pintura = pint.quer_pintura;
        patch.tipo_pintura = pint.quer_pintura ? (pint.tipo_pintura || null) : null;
        if (pint.quer_pintura && !pint.tipo_pintura) {
          patch.pintura_perguntado = false;
        }
      }
    }

    if (estado.adicionais_perguntado && (mudouSubtipo || !baseEstado?.adicionais_perguntado)) {
      patch.adicionais = estado.adicionais || { portinhola: false, alcapao: false };
      patch.adicionais_perguntado = true;
    }

  }

  const cep = textos.map(inferirCepTexto).find(Boolean) as string | null;
  const querEntregaInferido = estado?.quer_entrega === true || patch.quer_entrega === true || Boolean(cep && !estado?.entrega_perguntado);
  if (cep && !baseEstado?.cep && querEntregaInferido) {
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

  // Entrega/retirada — captura por histórico (ex: "me entregue" + CEP em mensagens separadas)
  if (!baseEstado?.entrega_perguntado) {
    const ent = estado?.entrega_perguntado
      ? { quer_entrega: Boolean(estado.quer_entrega) }
      : inferirEntregaTexto(texto);
    if (ent || patch.cep) {
      patch.entrega_perguntado = true;
      patch.quer_entrega = ent ? ent.quer_entrega : true;
      if (ent && !ent.quer_entrega) patch.frete = 0;
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
      .select("tipo_cliente, subtipo_revenda, pecas_avulsas, largura, altura, tipo_perfil, cep, frete, adicionais, adicionais_perguntado, pintura_perguntado, quer_pintura, tipo_pintura, entrega_perguntado, quer_entrega")
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

  if (!tipoValido) return "Antes de seguirmos, me diga: qual delas melhor representa você?\n\n🔹 Sou cliente final – desejo instalar a porta no meu estabelecimento\n\n🔹 Sou serralheiro – vou revender para meus clientes";

  // Subtipo (kit/pecas) vale tanto para revenda quanto para porta_instalada
  if (!estado?.subtipo_revenda) {
    return "Você quer um *KIT* completo de porta de enrolar, ou apenas *PEÇAS AVULSAS*?";
  }

  const ehPecas = estado?.subtipo_revenda === "pecas";

  if (ehPecas) {
    const pecas = Array.isArray(estado?.pecas_avulsas) ? estado.pecas_avulsas : [];
    if (pecas.length === 0) {
      return "Perfeito. Quais *peças* você precisa e em qual *quantidade*? Pode me mandar a lista (ex: 2 motores 500kg, 10m de guia lateral, 1 controle remoto).";
    }
  } else {
    // Fluxo padrão (kit)
    const largura = Number(estado?.largura);
    const altura = Number(estado?.altura);
    if (!Number.isFinite(largura) || largura <= 0 || !Number.isFinite(altura) || altura <= 0) {
      return "Qual a *largura e altura* da porta, em metros? (ex: 4x3)";
    }
    if (!estado?.tipo_perfil) {
      return "Qual lâmina prefere?\n\n1️⃣ FECHADA (lisa)\n\n2️⃣ TRANSVISION (com visores)\n\n3️⃣ OBLONGO (perfurada)";
    }
    if (!estado?.pintura_perguntado) {
      return "Quer incluir pintura eletrostática na porta?";
    }
    if (estado?.quer_pintura && !estado?.tipo_pintura) {
      return "Show. As cores disponíveis são: *branco liso*, *preta fosco*, *cinza texturizado* ou *cor especial* (RAL). Qual prefere?";
    }
    if (!estado?.adicionais_perguntado) {
      return "Quer adicionar *Portinhola* (porta de acesso integrada) ou *Alçapão* (acesso na própria porta)? Pode ser os dois, um, ou nenhum.";
    }
  }

  // Entrega/CEP só vale para porta_instalada
  if (tipo === "porta_instalada") {
    if (!estado?.entrega_perguntado) {
      return "Você prefere que a gente *entregue* no local, ou prefere *buscar/retirar* com a gente?";
    }
    if (estado?.quer_entrega && !estado?.cep) {
      return "Por último, qual o *CEP do local da entrega*?";
    }
  }
  return null;
}

function estadoProntoParaOrcamento(estado: any): boolean {
  const tipo = String(estado?.tipo_cliente || "").toLowerCase();
  const tipoValido = tipo === "porta_instalada" || tipo === "revenda";
  if (!tipoValido) return false;
  if (!estado?.subtipo_revenda) return false;

  const ehPecas = estado?.subtipo_revenda === "pecas";

  if (ehPecas) {
    const pecas = Array.isArray(estado?.pecas_avulsas) ? estado.pecas_avulsas : [];
    if (pecas.length === 0) return false;
  } else {
    const largura = Number(estado?.largura);
    const altura = Number(estado?.altura);
    const perfil = String(estado?.tipo_perfil || "").toLowerCase();
    const perfilValido = ["fechado", "transvision", "oblongo"].includes(perfil);
    const pinturaOk = Boolean(estado?.pintura_perguntado) && (!estado?.quer_pintura || Boolean(estado?.tipo_pintura));
    if (!(Number.isFinite(largura) && largura > 0 && largura <= 20 &&
        Number.isFinite(altura) && altura > 0 && altura <= 20 &&
        perfilValido && pinturaOk && Boolean(estado?.adicionais_perguntado))) {
      return false;
    }
  }

  if (tipo === "porta_instalada") {
    if (!estado?.entrega_perguntado) return false;
    if (estado?.quer_entrega && !estado?.cep) return false;
  }
  return true;
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

/** Retorna o snapshot (largura/altura/perfil/cliente/cep) do ÚLTIMO PDF enviado, ou null. */
async function ultimoPdfSnapshot(conversation_id: string): Promise<any | null> {
  const { data } = await supabase
    .from("leo_messages")
    .select("metadata, created_at")
    .eq("conversation_id", conversation_id)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(20);
  for (const m of (data || [])) {
    if (m?.metadata?.pdf_enviado === true) return m?.metadata?.snapshot || null;
  }
  return null;
}

/** Compara estado atual da conversa com o snapshot do último PDF — se algo mudou, é OUTRO orçamento. */
function normalizarPecasParaComparacao(pecas: any): string {
  if (!Array.isArray(pecas)) return "[]";
  const arr = pecas.map((p: any) => ({
    nome: String(p?.produto_nome || p?.descricao || "").trim().toLowerCase(),
    qtd: Number(p?.quantidade || p?.qty || 0),
    sku: String(p?.codigo_sku || "").trim().toLowerCase(),
  })).filter((p) => p.nome || p.sku);
  arr.sort((a, b) => (a.sku + a.nome).localeCompare(b.sku + b.nome));
  return JSON.stringify(arr);
}

async function medidasMudaramDesdeUltimoPdf(conversation_id: string): Promise<boolean> {
  const snap = await ultimoPdfSnapshot(conversation_id);
  if (!snap) return true; // nenhum PDF salvo com snapshot → tratar como mudança/permitir
  const { data: c } = await supabase
    .from("leo_conversations")
    .select("tipo_cliente, largura, altura, tipo_perfil, cep, adicionais, pecas_avulsas, subtipo_revenda")
    .eq("id", conversation_id)
    .maybeSingle();
  if (!c) return false;
  const eq = (a: any, b: any) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
  const num = (a: any, b: any) => Number(a) === Number(b);
  const bool = (v: any) => Boolean(v);
  const adAtual = (c.adicionais as any) || {};
  const adSnap = (snap.adicionais as any) || {};
  const pecasAtual = normalizarPecasParaComparacao((c as any).pecas_avulsas);
  const pecasSnap = normalizarPecasParaComparacao((snap as any).pecas_avulsas);
  return !(
    eq(c.tipo_cliente, snap.tipo_cliente) &&
    eq((c as any).subtipo_revenda, (snap as any).subtipo_revenda) &&
    num(c.largura, snap.largura) &&
    num(c.altura, snap.altura) &&
    eq(c.tipo_perfil, snap.tipo_perfil) &&
    eq(c.cep, snap.cep) &&
    bool(adAtual.portinhola) === bool(adSnap.portinhola) &&
    bool(adAtual.alcapao) === bool(adSnap.alcapao) &&
    pecasAtual === pecasSnap
  );
}

/** Conta quantas mensagens user chegaram após `since` — usado para debounce de buffer. */
async function contarMensagensUserApos(conversation_id: string, sinceIso: string): Promise<number> {
  const { count } = await supabase
    .from("leo_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation_id)
    .eq("role", "user")
    .gt("created_at", sinceIso);
  return count || 0;
}

function normalizarBuscaEstoque(valor: unknown): string {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bmotores\b/g, "motor")
    .replace(/\bautomatizadores\b/g, "automatizador")
    .replace(/\bcontroles\b/g, "controle")
    .replace(/\bcentrais\b/g, "central")
    .replace(/\s+/g, " ")
    .trim();
}

function pontuarEstoqueParaPeca(row: any, item: any): number {
  const alvo = normalizarBuscaEstoque(`${item?.produto_nome || ""} ${item?.descricao || ""}`);
  const texto = normalizarBuscaEstoque(`${row?.produto_nome || ""} ${row?.descricao || ""}`);
  let score = 0;
  const kgAlvo = alvo.match(/\b(\d{2,4})\s*kg?\b/)?.[1];
  if (alvo && texto.includes(alvo)) score += 50;
  if (kgAlvo && new RegExp(`\\b${kgAlvo}\\s*kg?\\b`).test(texto)) score += 40;
  if (/\bmotor\b/.test(alvo) && /\b(motor|automatizador)\b/.test(texto)) score += 25;
  if (/\bcontrole\b/.test(alvo) && /\bcontrole\b/.test(texto)) score += 20;
  if (/\bcentral\b/.test(alvo) && /\bcentral\b/.test(texto)) score += 20;
  if (/\bguia\b/.test(alvo) && /\bguia\b/.test(texto)) score += 30;
  if (/\b(lamina|perfil)\b/.test(alvo) && /\b(lamina|perfil)\b/.test(texto)) score += 25;
  if (/\b(eixo|tubo)\b/.test(alvo) && /\b(eixo|tubo)\b/.test(texto)) score += 20;
  if (/\bsoleira\b/.test(alvo) && /\bsoleira\b/.test(texto)) score += 20;
  if (/\bportinhola\b/.test(alvo) && /\bportinhola\b/.test(texto)) score += 30;
  if (/\b(alcapao|alcapa)\b/.test(alvo) && /\b(alcapao|alcapa)\b/.test(texto)) score += 30;
  // Discriminação de variantes de lâmina (fechado/transvision/oblongo) quando informado
  if (/\bfechad/.test(alvo) && /\bfechad/.test(texto)) score += 15;
  if (/\btransvision\b/.test(alvo) && /\btransvision\b/.test(texto)) score += 15;
  if (/\boblong/.test(alvo) && /\boblong/.test(texto)) score += 15;
  // Discriminação por DIMENSÃO (mm) — crucial pra distinguir variantes (ex.: guia 50mm vs 60mm)
  const mmAlvo = Array.from(alvo.matchAll(/\b(\d{2,4})\s*mm\b/g)).map((m) => m[1]);
  const mmTexto = Array.from(texto.matchAll(/\b(\d{2,4})\s*mm\b/g)).map((m) => m[1]);
  // Também aceita número solto perto da palavra-chave (ex.: "guia de 60") quando no alvo não veio "mm"
  if (mmAlvo.length === 0) {
    const numSolto = alvo.match(/\b(?:guia|perfil|lamina|tubo|eixo)[^\d]*?(\d{2,4})\b/)?.[1];
    if (numSolto) mmAlvo.push(numSolto);
  }
  if (mmAlvo.length && mmTexto.length) {
    const bate = mmAlvo.some((n) => mmTexto.includes(n));
    if (bate) score += 35; else score -= 25; // penaliza variante de dimensão diferente
  }
  // Token overlap genérico (palavras com 4+ chars)
  const tokensAlvo = Array.from(new Set(alvo.split(/\s+/).filter((t) => t.length >= 4)));
  const tokensTexto = new Set(texto.split(/\s+/));
  const overlap = tokensAlvo.filter((t) => tokensTexto.has(t)).length;
  score += overlap * 6;
  if (Number(row?.preco_venda) > 0) score += 5;
  return score;
}

function precoFallbackPeca(item: any): { preco: number; codigo: string; nome: string } | null {
  const alvo = normalizarBuscaEstoque(`${item?.produto_nome || ""} ${item?.descricao || ""}`);
  const kg = alvo.match(/\b(\d{2,4})\s*kg?\b/)?.[1];
  if (/\b(motor|automatizador)\b/.test(alvo) && kg) {
    const chave = `motor_${kg}kg`;
    const preco = Number((PRECOS as any)[chave] || 0);
    if (preco > 0) return { preco, codigo: `MOTOR-${kg}KG`, nome: `Motor ${kg}kg` };
  }
  if (/\bcontrole\b/.test(alvo)) return { preco: PRECOS.controle_remoto, codigo: "CONTROLE-REMOTO", nome: "Controle remoto" };
  if (/\bcentral\b/.test(alvo)) return { preco: PRECOS.central_comando, codigo: "CENTRAL-COMANDO", nome: "Central de comando" };
  if (/\bportinhola\b/.test(alvo)) return { preco: PRECOS.portinhola, codigo: "ADIC-001", nome: "Portinhola" };
  if (/\b(alcapao|alcapa)\b/.test(alvo)) return { preco: PRECOS.alcapao, codigo: "ADIC-002", nome: "Alçapão" };
  return null;
}

async function buscarEstoqueParaPeca(item: any) {
  if (item.codigo_sku && item.codigo_sku !== "AVULSA") {
    const { data } = await dashboardDb
      .from("estoque")
      .select("codigo_sku, produto_nome, descricao, preco_venda, unidade_medida")
      .eq("codigo_sku", item.codigo_sku)
      .maybeSingle();
    if (data) return data;
  }

  const nome = normalizarBuscaEstoque(item.produto_nome || item.descricao || "");
  if (!nome) return null;
  const kg = nome.match(/\b(\d{2,4})\s*kg?\b/)?.[1];
  // Tokens significativos da peça pedida (motor, guia, lamina, eixo, soleira, etc.)
  const tokensSignificativos = nome
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !/^\d/.test(t));
  const termos = Array.from(new Set([
    nome,
    kg && nome.includes("motor") ? `motor ${kg}` : null,
    kg && nome.includes("motor") ? `motor ${kg}kg` : null,
    kg && nome.includes("motor") ? `automatizador ${kg}` : null,
    kg && nome.includes("motor") ? `automatizador ${kg}kg` : null,
    kg ? `${kg}kg` : null,
    ...tokensSignificativos,
  ].filter(Boolean) as string[]));

  const candidatos: any[] = [];
  for (const termo of termos) {
    const { data } = await dashboardDb
      .from("estoque")
      .select("codigo_sku, produto_nome, descricao, preco_venda, unidade_medida")
      .or(`produto_nome.ilike.%${termo}%,descricao.ilike.%${termo}%`)
      .limit(10);
    if (data?.length) candidatos.push(...data);
  }

  const unicos = Array.from(new Map(candidatos.map((c) => [c.codigo_sku || `${c.produto_nome}-${c.descricao}`, c])).values());
  const ranqueado = unicos
    .map((row) => ({ row, score: pontuarEstoqueParaPeca(row, item) }))
    .sort((a, b) => b.score - a.score);
  // Exige score mínimo para evitar match aleatório
  const melhor = ranqueado[0];
  if (!melhor || melhor.score < 15) return null;
  return melhor.row;
}

/** Resolve preço/SKU/unidade no estoque para uma lista de peças (busca por sku, nome e descrição). */
async function enriquecerPecasComEstoque(itens: any[]): Promise<any[]> {
  const out: any[] = [];
  for (const raw of (itens || [])) {
    const item = { ...raw };
    const row: any = await buscarEstoqueParaPeca(item);
    const fallback = Number(row?.preco_venda) > 0 ? null : precoFallbackPeca(item);
    const precoInformado = Number(item.preco_unitario);
    const precoEstoque = Number(row?.preco_venda);
    const precoFallback = Number(fallback?.preco);
    const skuInformado = String(item.codigo_sku || "").trim();
    const skuValido = skuInformado && skuInformado !== "AVULSA" ? skuInformado : null;
    out.push({
      codigo_sku: skuValido || row?.codigo_sku || fallback?.codigo || "AVULSA",
      produto_nome: row?.produto_nome || fallback?.nome || item.produto_nome,
      descricao: row?.descricao || row?.produto_nome || fallback?.nome || item.produto_nome,
      quantidade: Number(item.quantidade) || 0,
      unidade: item.unidade || row?.unidade_medida || "UN",
      preco_unitario: precoInformado > 0 ? precoInformado : precoEstoque > 0 ? precoEstoque : precoFallback > 0 ? precoFallback : 0,
    });
  }
  return out;
}

/** Monta um "orçamento" no mesmo formato de calcularOrcamento, mas só com peças avulsas. */
function montarOrcamentoPecas(itensRaw: any[], cliente_nome?: string, opts: { tipo_cliente?: "revenda" | "porta_instalada"; frete?: number; cliente_endereco?: string } = {}) {
  const itens = (itensRaw || []).map((i) => {
    const qty = Number(i.quantidade) || 0;
    const preco = Number(i.preco_unitario) || 0;
    return {
      code: i.codigo_sku || "AVULSA",
      description: i.descricao || i.produto_nome || "Peça avulsa",
      qty,
      unit: i.unidade || "UN",
      unit_price: preco,
      subtotal: qty * preco,
    };
  });
  const subtotal = itens.reduce((s, i) => s + i.subtotal, 0);
  const frete = Number(opts.frete) > 0 ? +Number(opts.frete).toFixed(2) : 0;
  return {
    largura: 0,
    altura: 0,
    area: 0,
    tipo_cliente: (opts.tipo_cliente || "revenda") as any,
    tipo_perfil: "—" as any,
    tipo_motor: "—" as any,
    tipo_pintura: "—" as any,
    incluir_pintura: false,
    itens,
    subtotal_produtos: +subtotal.toFixed(2),
    mao_de_obra: 0,
    frete,
    total_geral: +(subtotal + frete).toFixed(2),
    cliente_nome,
    cliente_endereco: opts.cliente_endereco,
    is_pecas_avulsas: true,
  } as any;
}

async function gerarEEnviarOrcamentoDeterministico(conversaId: string, telefone: string, nome: string) {
  const r = await withSchemaRetry(() =>
    supabase
      .from("leo_conversations")
      .select("tipo_cliente, subtipo_revenda, pecas_avulsas, largura, altura, tipo_perfil, cep, frete, endereco_instalacao, adicionais, adicionais_perguntado, pintura_perguntado, quer_pintura, tipo_pintura, entrega_perguntado, quer_entrega")
      .eq("id", conversaId)
      .maybeSingle()
  );
  if (r.error) {
    console.error("⚠️", descreverErroPg(r.error, "gerarEEnviarOrcamento - leitura conversa: "));
    return { ok: false, error: descreverErroPg(r.error) };
  }
  const estado: any = r.data;

  const tipoCliente = String(estado?.tipo_cliente || "").toLowerCase();
  const ehPorta = tipoCliente === "porta_instalada";
  const freteEstado = estado?.frete != null ? Number(estado.frete) : 0;
  // Frete só conta se for porta instalada E cliente quer entrega
  const freteFinal = (ehPorta && estado?.quer_entrega === true && Number.isFinite(freteEstado) && freteEstado > 0) ? freteEstado : 0;

  let orcamento: any;

  // Branch peças avulsas (revenda OU porta instalada)
  if (estado?.subtipo_revenda === "pecas") {
    const pecas = Array.isArray(estado?.pecas_avulsas) ? estado.pecas_avulsas : [];
    if (pecas.length === 0) return { ok: false, faltando: ["pecas_avulsas"] };
    if (ehPorta && !estado?.entrega_perguntado) return { ok: false, faltando: ["entrega"] };
    if (ehPorta && estado?.quer_entrega === true && !estado?.cep) return { ok: false, faltando: ["cep"] };
    const enriquecidas = await enriquecerPecasComEstoque(pecas);
    orcamento = montarOrcamentoPecas(enriquecidas, nome, {
      tipo_cliente: ehPorta ? "porta_instalada" : "revenda",
      frete: freteFinal,
      cliente_endereco: estado?.endereco_instalacao || undefined,
    });
  } else {
    const largura = Number(estado?.largura);
    const altura = Number(estado?.altura);
    const tipoPerfil = String(estado?.tipo_perfil || "").toLowerCase();

    const faltando: string[] = [];
    if (tipoCliente !== "porta_instalada" && tipoCliente !== "revenda") faltando.push("tipo_cliente");
    if (!estado?.subtipo_revenda) faltando.push("subtipo_revenda");
    if (!Number.isFinite(largura) || largura <= 0 || largura > 20) faltando.push("largura");
    if (!Number.isFinite(altura) || altura <= 0 || altura > 20) faltando.push("altura");
    if (!["fechado", "transvision", "oblongo"].includes(tipoPerfil)) faltando.push("tipo_perfil");
    if (!estado?.pintura_perguntado) faltando.push("pintura");
    if (estado?.quer_pintura && !estado?.tipo_pintura) faltando.push("tipo_pintura");
    if (!estado?.adicionais_perguntado) faltando.push("adicionais");
    if (ehPorta && !estado?.entrega_perguntado) faltando.push("entrega");
    if (ehPorta && estado?.quer_entrega === true && !estado?.cep) faltando.push("cep");
    if (faltando.length) return { ok: false, faltando };

    orcamento = calcularOrcamento({
      largura,
      altura,
      tipo_cliente: tipoCliente as any,
      tipo_perfil: tipoPerfil as any,
      tipo_pintura: estado?.quer_pintura ? estado?.tipo_pintura : undefined,
      incluir_pintura: Boolean(estado?.quer_pintura),
      frete: freteFinal,
      cliente_nome: nome,
      cliente_endereco: estado?.endereco_instalacao || undefined,
      adicionais: {
        portinhola: Boolean(estado?.adicionais?.portinhola),
        alcapao: Boolean(estado?.adicionais?.alcapao),
      },
    });
  }

  const itensSemPreco = (orcamento?.itens || []).filter((i: any) => Number(i?.qty) > 0 && !(Number(i?.unit_price) > 0));
  if (itensSemPreco.length > 0 || !(Number(orcamento?.total_geral) > 0)) {
    console.warn("🚫 Orçamento bloqueado: item sem preço no estoque", JSON.stringify(itensSemPreco));
    return {
      ok: false,
      error: `Não encontrei preço no estoque para: ${itensSemPreco.map((i: any) => i.description).join(", ") || "itens solicitados"}`,
      faltando: ["preco_estoque"],
    };
  }

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
      .not("etapa_key", "in", "(venda_finalizada)")
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

/** Busca o lead aberto (ainda não finalizado) deste telefone. */
async function buscarLeadAberto(telefone: string) {
  const { data } = await dashboardDb
    .from("funil_leads")
    .select("id, etapa_key, itens, anexo_pdf, valor")
    .eq("telefone", telefone)
    .not("etapa_key", "in", "(venda_finalizada)")
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
  observacoes_tecnicas?: string;
}) {
  const { telefone, nome, orcamento, pdfBase64, filename, observacoes_tecnicas } = params;
  try {
    const itensJson = orcamento.itens.map((i: any) => ({
      codigo_sku: i.code,
      produto_nome: i.description,
      descricao: i.description,
      quantidade: i.qty,
      preco_unitario: i.unit_price,
      unidade: i.unit,
      subtotal: i.subtotal,
    }));
    const linhasBase = [
      `Origem: Agente Leo (WhatsApp)`,
      `Telefone: ${telefone}`,
      `Tipo: ${orcamento.tipo_cliente}`,
      `Medidas: ${orcamento.largura}m x ${orcamento.altura}m`,
      `Lâmina: ${orcamento.tipo_perfil}`,
      orcamento.frete ? `Frete: R$ ${orcamento.frete.toFixed(2)}` : null,
      orcamento.mao_de_obra ? `Mão de obra: R$ ${orcamento.mao_de_obra.toFixed(2)}` : null,
    ].filter(Boolean).join(" | ");
    const resumoTecnico = (observacoes_tecnicas || "").trim();
    const observacoes = resumoTecnico
      ? `${linhasBase}\n\n=== RESUMO TÉCNICO PARA O VENDEDOR ===\n${resumoTecnico}`
      : linhasBase;

    const { data: orc, error: orcErr } = await dashboardDb
      .from("orcamentos")
      .insert({
        cliente_nome: nome || `Contato ${telefone}`,
        cliente_cnpj: null,
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
    const nomeFinal = (nome || "").trim() || `Contato ${telefone}`;
    const obsLead = resumoTecnico
      ? `Orçamento ${orc?.numero || ""} gerado pelo agente Leo.\n\n=== RESUMO TÉCNICO ===\n${resumoTecnico}`
      : `Orçamento ${orc?.numero || ""} gerado pelo agente Leo.`;
    if (lead?.id) {
      await dashboardDb
        .from("funil_leads")
        .update({
          nome: nomeFinal,
          etapa_key: "orcamento_enviado",
          valor: orcamento.total_geral,
          itens: itensJson,
          anexo_pdf: anexo,
          observacoes: obsLead,
        })
        .eq("id", lead.id);
      console.log("✅ Lead movido para orcamento_enviado:", lead.id, "nome:", nomeFinal);
    } else {
      // cria direto na etapa orcamento_enviado caso não exista
      await dashboardDb.from("funil_leads").insert({
        nome: nome || `Contato ${telefone}`,
        telefone,
        valor: orcamento.total_geral,
        etapa_key: "orcamento_enviado",
        origem: "leo_agent",
        itens: itensJson,
        anexo_pdf: anexo,
        observacoes: obsLead,
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

async function interpretarAceiteContextual(params: { texto: string; historico: any[]; estado: any }) {
  const respostaLamina = inferirLaminaTexto(params.texto);
  if (respostaLamina && !params.estado?.cep) return false;

  try {
    const ai = await chamarIA([
      {
        role: "system",
        content:
          "Classifique se a ÚLTIMA mensagem do cliente é um aceite comercial inequívoco de um orçamento JÁ ENVIADO. " +
          "Responda somente JSON válido no formato {\"aceitou\":boolean,\"confianca\":0..1}. " +
          "Não marque aceite para escolha de produto/lâmina/medida/CEP, mesmo que use palavras como fechado/fechada.",
      },
      {
        role: "user",
        content: JSON.stringify({
          estado: params.estado,
          historico_recente: params.historico.slice(-12),
          ultima_mensagem: params.texto,
        }),
      },
    ], { tools: null, temperature: 0 });
    const raw = (ai.choices?.[0]?.message?.content || "").trim();
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/```$/i, ""));
    return parsed?.aceitou === true && Number(parsed?.confianca || 0) >= 0.75;
  } catch (e: any) {
    console.error("⚠️ interpretarAceiteContextual falhou, fallback seguro:", e?.message || e);
    return pareceAceite(params.texto);
  }
}

/** Converte o último orçamento pendente em pedido de venda e move o lead para "fechado". */
async function aceitarOrcamentoEGerarPedido(telefone: string) {
  try {
    const { data: orc } = await dashboardDb
      .from("orcamentos")
      .select("id, numero, cliente_nome, valor_total, itens, observacoes, status")
      .eq("origem", "leo_agent")
      .ilike("observacoes", `%Telefone: ${telefone}%`)
      .order("data_criacao", { ascending: false })
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
    const { data: ped, error: pedErr } = await dashboardDb
      .from("pedidos_venda")
      .insert({
        cliente_nome: orc.cliente_nome,
        cliente_cnpj: null,
        valor_total: orc.valor_total,
        status: "pendente",
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
    await dashboardDb.from("orcamentos").update({ status: "aceito" }).eq("id", orc.id);

    // Move o lead para "Pedido de Venda" (cliente aceitou e o pedido foi gerado)
    const lead = await buscarLeadAberto(telefone);
    if (lead?.id) {
      await dashboardDb
        .from("funil_leads")
        .update({
          etapa_key: "pedido_venda",
          valor: orc.valor_total,
          itens: orc.itens,
          observacoes: `Pedido ${ped?.numero} gerado a partir do orçamento ${orc.numero} (aceito pelo cliente via Leo).`,
        })
        .eq("id", lead.id);
      console.log("✅ Lead movido para pedido_venda:", lead.id);
    } else {
      // Se não houver lead aberto, cria um novo já em pedido_venda
      const { data: cliRow } = await dashboardDb
        .from("Clientes")
        .select("CLI_NOME, CLI_EMAIL")
        .eq("CLI_FONE", telefone)
        .maybeSingle();
      await dashboardDb.from("funil_leads").insert({
        nome: cliRow?.CLI_NOME || orc.cliente_nome || `Contato ${telefone}`,
        telefone,
        email: cliRow?.CLI_EMAIL || null,
        valor: orc.valor_total,
        etapa_key: "pedido_venda",
        origem: "leo_agent",
        itens: orc.itens,
        observacoes: `Pedido ${ped?.numero} gerado a partir do orçamento ${orc.numero} (aceito pelo cliente via Leo).`,
      });
      console.log("✅ Lead criado em pedido_venda para pedido", ped?.numero);
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

// ============================================================
// LEO 2.0 — CONFIGURADOR (carrinho-first + interpretador LLM)
// ============================================================
// Princípio: o LLM SÓ interpreta a mensagem em JSON de intenções.
// O código aplica no carrinho, calcula explosão de itens, busca
// preço no estoque do dashboard, recalcula totais e decide qual
// é a próxima pergunta. A resposta sai como UMA mensagem com
// resumo parcial + pergunta única.

type CfgItemTipo = "kit_porta" | "motor" | "guia" | "lamina" | "soleira" | "eixo" | "controle" | "central" | "trava_lamina" | "portinhola" | "alcapao" | "pintura" | "acessorio";
interface CfgLinha { sku: string; descricao: string; und: string; qtd: number; valor_unit: number; total: number; sob_consulta?: boolean }
interface CfgItem {
  id: string;
  tipo: CfgItemTipo;
  config: Record<string, any>;
  explosao: CfgLinha[];
  subtotal: number;
}
interface CfgPedido {
  itens: CfgItem[];
  total: number;
  status: "em_andamento" | "aguardando_confirmacao" | "finalizado";
  sob_consulta?: boolean;
}

const PEDIDO_VAZIO: CfgPedido = { itens: [], total: 0, status: "em_andamento" };

function novoId() { return crypto.randomUUID().slice(0, 8); }

const CFG_REGRAS_TECNICAS = `Regras técnicas Eletroportas:
- Configurador técnico + carrinho comercial. Pedido livre OU guiado. NUNCA reinicie o fluxo ao adicionar/alterar itens.
- Modelos de lâmina: Fechada, Transvision, Oblongo. Padrão = perfil baixo. Perfil alto somente se solicitado.
- Lâmina parcial (combinação): cliente pode pedir "1m de transvision" misturado no kit. Quantidade da faixa = altura ÷ 0,085. Restante fica no modelo principal. Cada modelo vira linha separada no orçamento.
- Tipos de instalação (sempre 1 dos 4):
  • entre_testeiras: desconto 0,02 no eixo/soleira/lâminas (com trava: lâminas -0,03).
  • vao_1guia: vão + profundidade da guia (mm/1000) - 0,02 (com trava: lâminas -0,03).
  • vao_guias: vão + guia_esq + guia_dir - 0,02 (com trava: lâminas -0,03).
  • entre_paredes: desconto 0,07 (com trava: lâminas -0,08).
- Guias válidas: 50, 60, 70, 100 mm (80 e 90 não existem mais). Auto: largura ≤4m→50, ≤7m→70, >7m→100.
- Eixo: até 6m → 4.5"; motor 500 → 5.5"; motor ≥700 → 6.5" mínimo.
- Rolo: eixo 4.5/5.5" → 0,60m; eixos maiores → 0,75m.
- Motor (auto): peso = m² × 12kg × (1 + margem). Margem 35% padrão; 70% se largura≥9 OU altura≥4. Escolha: ≤200→200, ≤300→300, ≤400→400, ≤500→500, >500→800. Motores AC 200/300/400/500/800/1000/1500. DC 200/300/400/500/800.
- Kit automatizador = motor + testeiras + central + 2 controles. Motor+testeiras = sem central. Avulso = só motor.
- Portinhola VILD/VILE: perguntar se *cortada* (com lâminas cortadas) ou *inteira* p/ ajuste local. CENTRO sempre cortada.
- Portinhola cortada: largura final = largura porta - (0,64 + profundidade da guia em m). 18 lâminas perfil baixo / 19 perfil alto. Separa soleira e lâminas no orçamento.
- Portinhola e alçapão NUNCA juntos na mesma porta.
- O CLIENTE NÃO VÊ: fórmulas, peso, regras, cálculos internos. Mostre apenas resultado final em metros e produtos finais.
- Não invente preço. Faltou no estoque → marca como sob consulta e segue.`;

function cfgPedidoLeve(pedido: CfgPedido) {
  return {
    itens: (pedido.itens || []).map((it) => ({ id: it.id, tipo: it.tipo, config: it.config || {} })),
    total: pedido.total || 0,
    status: pedido.status || "em_andamento",
  };
}

function cfgFallbackInterpretar(mensagem: string): any[] {
  const original = mensagem || "";
  const t = original.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const intencoes: any[] = [];
  if (/\b(zerar|limpar|recomecar|recomeçar|novo pedido|comecar de novo)\b/.test(t)) return [{ acao: "zerar" }];
  if (/\b(gerar|fechar|emitir|mandar|enviar)\b.*\b(orcamento|orçamento|pdf)\b|\borcamento\b$|\bfechar pedido\b/.test(t)) return [{ acao: "gerar_orcamento" }];
  if (/\b(resumo|revisar|conferir)\b/.test(t)) intencoes.push({ acao: "resumo" });

  // Remoções/alterações no kit
  const removeFlagMap: Array<[RegExp, string]> = [
    [/\b(retirar|remover|tirar|sem)\s+central\b/, "central"],
    [/\b(retirar|remover|tirar|sem)\s+pintura\b/, "pintura"],
    [/\b(retirar|remover|tirar|sem)\s+portinhola\b/, "portinhola"],
    [/\b(retirar|remover|tirar|sem)\s+alcapao\b/, "alcapao"],
    [/\b(retirar|remover|tirar|sem)\s+trava\b/, "trava_lamina"],
  ];
  for (const [rx, alvo] of removeFlagMap) {
    if (rx.test(t)) intencoes.push({ acao: "update_item", ref: "kit_porta", patch: { [alvo]: false } });
  }
  if (/\b(retirar|remover|tirar)\s+motor\b/.test(t)) intencoes.push({ acao: "remove_item", ref: "motor" });
  if (/\b(retirar|remover|tirar)\s+controles?\b/.test(t)) intencoes.push({ acao: "remove_item", ref: "controle" });

  const patch: any = {};
  const medida = t.match(/(\d+(?:[\.,]\d+)?)\s*(?:m)?\s*[x×]\s*(\d+(?:[\.,]\d+)?)/);
  if (medida) {
    patch.largura = Number(medida[1].replace(",", "."));
    patch.altura = Number(medida[2].replace(",", "."));
  }
  if (/\bentre\s+paredes\b/.test(t)) patch.instalacao = "entre_paredes";
  else if (/\bentre\s+testeiras\b/.test(t)) patch.instalacao = "entre_testeiras";
  else if (/\bv[ãa]o\s*\+\s*1\s*guia\b|\bvao\s*\+\s*1\s*guia\b|\b1\s*guia\b/.test(t)) patch.instalacao = "vao_1guia";
  else if (/\bv[ãa]o\s*\+\s*guias?\b|\bvao\s*\+\s*guias?\b|\b2\s*guias?\b|\bduas\s*guias?\b/.test(t)) patch.instalacao = "vao_guias";
  if (/\btrava\s*(de\s*)?l[âa]minas?\b|\btrava[- ]?l[âa]mina\b/.test(t)) patch.trava_lamina = true;

  // Trocar guia para X
  const trocaGuia = t.match(/\b(trocar|alterar|mudar)\s+guia\s+(?:para|pra|p\/)\s*(50|60|70|100)\b/);
  if (trocaGuia) patch.guia_mm = Number(trocaGuia[2]);
  else if (!/\bpares?\b/.test(t)) {
    const guia = t.match(/\bguia\s*(?:de|para)?\s*(50|60|70|100)\b/);
    if (guia) patch.guia_mm = Number(guia[1]);
  }
  // Trocar motor para AC/DC
  const trocaMotor = t.match(/\b(trocar|alterar|mudar)\s+motor\s+(?:para|pra|p\/)\s*(AC|DC)\b/i);
  if (trocaMotor) patch.motor = { ...(patch.motor || {}), ac_dc: trocaMotor[2].toUpperCase() };

  const pot = t.match(/\b(200|300|400|500|800|1000|1500)\s*kg\b/);
  const acdc = t.match(/\b(AC|DC)\b/i)?.[1]?.toUpperCase();
  if ((pot || acdc) && !/\bavulso\b/.test(t)) patch.motor = { ...(patch.motor || {}), ...(pot ? { potencia: Number(pot[1]) } : {}), ...(acdc ? { ac_dc: acdc } : {}) };

  // Kit do motor
  if (/\bkit\s*automatizador\b/.test(t)) patch.kit_motor = "kit_automatizador";
  else if (/\bmotor\s*\+?\s*testeiras?\b/.test(t)) patch.kit_motor = "motor_testeiras";
  else if (/\b(automatizador|motor)\s+avulso\b/.test(t)) patch.kit_motor = "avulso";

  // Modelo de lâmina (Fechada/Transvision/Oblongo + legado meia cana)
  if (/\btransvision\b/.test(t)) patch.lamina = { ...(patch.lamina || {}), modelo: "transvision" };
  else if (/\boblongo\b/.test(t)) patch.lamina = { ...(patch.lamina || {}), modelo: "oblongo" };
  else if (/\bfechad[ao]\b/.test(t)) patch.lamina = { ...(patch.lamina || {}), modelo: "fechado" };
  else if (/\bmeia\s*cana\b/.test(t)) patch.lamina = { ...(patch.lamina || {}), modelo: "meia_cana" };
  if (/\bperfil\s+alto\b/.test(t)) patch.lamina = { ...(patch.lamina || {}), perfil: "alto" };
  else if (/\bperfil\s+baixo\b/.test(t)) patch.lamina = { ...(patch.lamina || {}), perfil: "baixo" };

  // Combinação de lâmina parcial: "1m de transvision" / "0,8m de oblongo"
  const parcial = t.match(/(\d+(?:[\.,]\d+)?)\s*m\s+(?:de\s+)?(transvision|oblongo|fechad[ao])/);
  if (parcial) {
    const modeloP = parcial[2].startsWith("fechad") ? "fechado" : parcial[2];
    const altP = Number(parcial[1].replace(",", "."));
    const lamCur = patch.lamina || {};
    const combAtual = Array.isArray(lamCur.combinacao) ? lamCur.combinacao : [];
    patch.lamina = { ...lamCur, combinacao: [...combAtual, { modelo: modeloP, altura_m: altP }] };
  }

  const cor = t.match(/\b(branca?|preta?|cinza|bege|azul|verde|vermelha?|amarela?)\b/);
  if (cor) patch.lamina = { ...(patch.lamina || {}), cor: cor[1].replace(/a$/, "o") };
  const port = t.match(/\bportinhola\s*(vild|vile|centro)?\b/i);
  if (port) patch.portinhola = (port[1] || "CENTRO").toUpperCase();
  // Portinhola cortada vs inteira
  if (/\bportinhola\b.*\b(inteira|ajuste\s+(?:no\s+)?local)\b|\b(inteira|ajuste\s+(?:no\s+)?local)\b.*\bportinhola\b/.test(t)) patch.portinhola_cortada = false;
  else if (/\bportinhola\b.*\bcortad[ao]s?\b|\bl[âa]minas?\s+cortad[ao]s?\b/.test(t)) patch.portinhola_cortada = true;

  if (/\balcapao\b/.test(t) && !port) patch.alcapao = true;
  if (/\bpintura\s+eletrostatica\b|\bcom\s+pintura\b/.test(t) && !/sem\s+pintura/.test(t)) patch.pintura = "eletrostatica";

  // Avulsos
  const ctrl = t.match(/(?:\+\s*)?(\d+)\s*controles?\b/);
  if (ctrl) intencoes.push({ acao: "add_item", tipo: "controle", config: { qtd: Number(ctrl[1]) } });

  const cent = t.match(/(?:\+\s*)?(\d+)\s*centrais?\b|(?:\+\s*)?(\d+)\s*central\b/);
  if (cent) intencoes.push({ acao: "add_item", tipo: "central", config: { qtd: Number(cent[1] || cent[2]) } });

  const paresGuia = t.match(/(?:\+\s*)?(\d+)\s*pares?\s*(?:de\s*)?guias?\s*(?:de\s*)?(50|60|70|80|90|100)?\b/);
  if (paresGuia) {
    const compr = t.match(/(\d+(?:[\.,]\d+)?)\s*m\b/);
    intencoes.push({ acao: "add_item", tipo: "guia", config: { mm: Number(paresGuia[2]) || 50, qtd_pares: Number(paresGuia[1]), comprimento_m: compr ? Number(compr[1].replace(",", ".")) : 0 } });
  }

  if (/\bmotor\s+avulso\b|\bavulso\b.*\bmotor\b/.test(t)) {
    const q = t.match(/(\d+)\s*motores?/);
    intencoes.push({ acao: "add_item", tipo: "motor", config: { qtd: q ? Number(q[1]) : 1, ac_dc: acdc || "AC", potencia: pot ? Number(pot[1]) : undefined } });
  }
  if (/\bsoleiras?\s*avulsa?|avulsa?\s*soleira/.test(t)) {
    const q = t.match(/(\d+)\s*soleiras?/);
    intencoes.push({ acao: "add_item", tipo: "soleira", config: { qtd: q ? Number(q[1]) : 1 } });
  }
  if (/\bl[âa]minas?\s*avulsa?|avulsa?\s*l[âa]mina/.test(t)) {
    const q = t.match(/(\d+)\s*l[âa]minas?/);
    intencoes.push({ acao: "add_item", tipo: "lamina", config: { qtd: q ? Number(q[1]) : 1 } });
  }
  if (/\beixos?\s*avulso?|avulso?\s*eixo/.test(t)) {
    const q = t.match(/(\d+)\s*eixos?/);
    intencoes.push({ acao: "add_item", tipo: "eixo", config: { qtd: q ? Number(q[1]) : 1 } });
  }

  if (Object.keys(patch).length) intencoes.unshift({ acao: medida ? "add_item" : "update_item", tipo: "kit_porta", ref: "kit_porta", config: patch, patch });
  const parecePergunta = /\?|\b(qual|quais|como|onde|quando|porque|por que|pra que|para que|voc[eê]s|trabalha|serve|pode|tem|faz)\b/.test(t);
  if (!intencoes.length && parecePergunta) intencoes.push({ acao: "duvida", texto: original });
  return intencoes;
}

function carregarPedido(raw: any): CfgPedido {
  if (!raw || typeof raw !== "object") return JSON.parse(JSON.stringify(PEDIDO_VAZIO));
  const itens = Array.isArray(raw.itens) ? raw.itens : [];
  return {
    itens: itens.map((it: any) => ({
      id: String(it.id || novoId()),
      tipo: (it.tipo || "acessorio") as CfgItemTipo,
      config: it.config && typeof it.config === "object" ? it.config : {},
      explosao: Array.isArray(it.explosao) ? it.explosao : [],
      subtotal: Number(it.subtotal) || 0,
    })),
    total: Number(raw.total) || 0,
    status: (raw.status || "em_andamento") as CfgPedido["status"],
    sob_consulta: Boolean(raw.sob_consulta),
  };
}

// --- Interpretador (LLM JSON-only) ---
async function cfgInterpretar(mensagem: string, pedido: CfgPedido): Promise<any[]> {
  const sys = `Você é um interpretador de pedidos para uma fábrica de portas de enrolar.
Receba a MENSAGEM do cliente serralheiro + o PEDIDO_ATUAL e devolva SOMENTE JSON:
{ "intencoes": [...] }

${CFG_REGRAS_TECNICAS}

Intenções possíveis:
- {"acao":"add_item","tipo":"kit_porta|motor|guia|lamina|soleira|eixo|controle|central|trava_lamina|portinhola|alcapao|pintura|acessorio","config":{...},"qtd":1}
- {"acao":"update_item","ref":"<id ou 'ultimo' ou tipo>","patch":{...}}
- {"acao":"remove_item","ref":"<id ou 'ultimo' ou tipo ou descricao>"}
- {"acao":"set_qtd","ref":"...","qtd":N}
- {"acao":"gerar_orcamento"}
- {"acao":"resumo"}
- {"acao":"zerar"}
- {"acao":"escolher_menu","opcao":1|2|3|4}  // 1 kit / 2 peças / 3 motores / 4 acessórios
- {"acao":"duvida","texto":"<o que ele perguntou>"}

CARRINHO MULTI-ITEM: o pedido é um CARRINHO. NUNCA reinicie o fluxo quando o cliente acrescentar avulsos.
Se já existe um kit_porta no carrinho e o cliente diz "+20 controles" / "5 pares de guia 50" / "2 centrais" / "trocar guia para 70" → gere as intenções correspondentes SEM apagar nada.
"trocar guia para X" = update_item kit_porta patch guia_mm:X. "+ N controles" = add_item controle qtd N. "remover central / sem pintura" = update_item kit_porta patch central:false / pintura:false.
Só zerar quando o cliente disser explicitamente "zerar/novo pedido/recomeçar".

Para kit_porta a config pode conter qualquer subconjunto de:
{"largura":metros, "altura":metros,
 "instalacao":"entre_testeiras|vao_1guia|vao_guias|entre_paredes",
 "trava_lamina":true|false,
 "motor":{"ac_dc":"AC|DC","potencia":200|300|400|500|800|1000|1500},
 "lamina":{"modelo":"meia_cana|fechado|transvision|oblongo","perfil":"baixo|alto","cor":"branca|preta|..."},
 "guia_mm":50|60|70|80|90|100, "guia_mm_esq":N, "guia_mm_dir":N,
 "portinhola":"VILD|VILE|CENTRO"|false,
 "alcapao":true|false, "pintura":"eletrostatica"|false, "central":true|false, "controles":N}

Avulsos (cada um vira um item separado no carrinho):
- motor: {"ac_dc":"AC|DC","potencia":N,"qtd":N}
- guia: {"mm":N,"comprimento_m":N,"qtd_pares":N} ou qtd_unidades
- lamina: {"modelo":"meia_cana|...","perfil":"baixo|alto","cor":"...","comprimento_m":N,"qtd":N}
- soleira: {"comprimento_m":N,"qtd":N}
- eixo: {"polegadas":N,"comprimento_m":N,"qtd":N}
- controle: {"qtd":N}
- central: {"qtd":N}
- trava_lamina: {"qtd":N}
- portinhola: {"modelo":"VILD|VILE|CENTRO","qtd":N}
- alcapao: {"qtd":N}
- pintura: {"cor":"...","area_m2":N}
- acessorio: {"descricao":"...","qtd":N}


REGRAS:
- Extraia TUDO que estiver na mensagem (medida "3x4", "AC", "meia cana", "branca", "portinhola VILD", "guia 70", "+2 controles").
- "3x4 entre paredes AC meia cana branca portinhola VILD" → 1 add_item kit_porta com TODA a config.
- "+ 2 controles e trocar guia para 70" → [add_item controle qtd 2, update_item kit_porta patch guia_mm 70].
- "remover central" / "tirar pintura" → update_item kit_porta com central:false / pintura:false.
- "gerar orçamento" / "fechar pedido" / "pode fechar" → gerar_orcamento.
- Perguntas/dúvidas técnicas, comerciais ou de uso que não mudam o pedido → duvida.
- Mensagens vagas tipo "oi" → []. NUNCA invente dados.
- Devolva APENAS JSON válido, sem explicação.

PEDIDO_ATUAL: ${JSON.stringify(cfgPedidoLeve(pedido))}`;

  try {
    const resp = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "system", content: sys }, { role: "user", content: mensagem }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 2048,
      }),
    });
    if (!resp.ok) {
      console.error("cfgInterpretar falhou:", resp.status, await resp.text());
      return cfgFallbackInterpretar(mensagem);
    }
    const j = await resp.json();
    if (j?.choices?.[0]?.finish_reason === "length" || j?.choices?.[0]?.finish_reason === "MAX_TOKENS") {
      console.warn("cfgInterpretar truncado por limite de tokens — usando fallback determinístico");
      return cfgFallbackInterpretar(mensagem);
    }
    const content = j?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return Array.isArray(parsed?.intencoes) ? parsed.intencoes : cfgFallbackInterpretar(mensagem);
  } catch (e) {
    console.error("cfgInterpretar erro:", (e as Error)?.message);
    return cfgFallbackInterpretar(mensagem);
  }
}

// --- Aplicador (puro) ---
function mergeDeep(a: any, b: any): any {
  if (Array.isArray(b)) return b;
  if (b && typeof b === "object") {
    const out: any = { ...(a || {}) };
    for (const k of Object.keys(b)) out[k] = mergeDeep(a?.[k], b[k]);
    return out;
  }
  return b === undefined ? a : b;
}

function acharItem(pedido: CfgPedido, ref: string): CfgItem | undefined {
  if (!ref) return pedido.itens[pedido.itens.length - 1];
  const r = String(ref).toLowerCase();
  if (r === "ultimo" || r === "último") return pedido.itens[pedido.itens.length - 1];
  let found = pedido.itens.find((i) => i.id === ref);
  if (found) return found;
  found = pedido.itens.find((i) => i.tipo === r);
  if (found) return found;
  return pedido.itens.find((i) =>
    (i.explosao || []).some((e) => (e.descricao || "").toLowerCase().includes(r))
  );
}

function cfgAplicar(pedido: CfgPedido, intencoes: any[]): { pedido: CfgPedido; quer_gerar: boolean; quer_resumo: boolean; duvidas: string[] } {
  let p: CfgPedido = JSON.parse(JSON.stringify(pedido));
  let quer_gerar = false;
  let quer_resumo = false;
  const duvidas: string[] = [];

  for (const ix of intencoes) {
    const acao = String(ix?.acao || "");
    if (acao === "add_item") {
      const tipo = (ix.tipo || "acessorio") as CfgItemTipo;
      // Se for kit_porta e já existe um → faz merge ao invés de criar outro
      if (tipo === "kit_porta") {
        const existente = p.itens.find((i) => i.tipo === "kit_porta");
        if (existente) {
          existente.config = mergeDeep(existente.config, ix.config || {});
          continue;
        }
      }
      p.itens.push({
        id: novoId(),
        tipo,
        config: { ...(ix.config || {}), qtd: Number(ix.qtd) || Number(ix.config?.qtd) || 1 },
        explosao: [],
        subtotal: 0,
      });
    } else if (acao === "update_item") {
      const it = acharItem(p, ix.ref);
      if (it) it.config = mergeDeep(it.config, ix.patch || {});
    } else if (acao === "remove_item") {
      const it = acharItem(p, ix.ref);
      if (it) p.itens = p.itens.filter((x) => x.id !== it.id);
    } else if (acao === "set_qtd") {
      const it = acharItem(p, ix.ref);
      if (it) it.config.qtd = Number(ix.qtd) || 1;
    } else if (acao === "zerar") {
      p = JSON.parse(JSON.stringify(PEDIDO_VAZIO));
    } else if (acao === "gerar_orcamento") {
      quer_gerar = true;
    } else if (acao === "resumo") {
      quer_resumo = true;
    } else if (acao === "duvida") {
      duvidas.push(String(ix.texto || ""));
    } else if (acao === "escolher_menu") {
      const op = Number(ix.opcao);
      // Pré-popula um item placeholder do tipo correspondente para indicar foco
      const tipoMap: Record<number, CfgItemTipo> = { 1: "kit_porta", 2: "acessorio", 3: "motor", 4: "acessorio" };
      const t = tipoMap[op];
      if (t && !p.itens.find((i) => i.tipo === t)) {
        p.itens.push({ id: novoId(), tipo: t, config: {}, explosao: [], subtotal: 0 });
      }
    }
  }
  return { pedido: p, quer_gerar, quer_resumo, duvidas };
}

// --- Explosão + preço ---
async function precoEstoque(termo: string, item: any = {}): Promise<{ sku: string; nome: string; preco: number; und: string } | null> {
  const r = await buscarEstoqueParaPeca({ produto_nome: termo, descricao: termo, ...item });
  if (r) return { sku: r.codigo_sku, nome: r.produto_nome, preco: Number(r.preco_venda) || 0, und: r.unidade_medida || "UN" };
  return null;
}

// ===========================================================
// REGRAS AUTOMÁTICAS — motor / eixo / guia / portinhola
// ===========================================================

/** Peso estimado da porta: m² × 12 kg, com margem (35% padrão, 70% se porta grande L≥9 ou A≥4). */
function estimarPesoPorta(largura: number, altura: number): { peso_kg: number; margem: number; grande: boolean } {
  const base = (Number(largura) || 0) * (Number(altura) || 0) * 12;
  const grande = (Number(largura) || 0) >= 9 || (Number(altura) || 0) >= 4;
  const margem = grande ? 0.7 : 0.35;
  return { peso_kg: +(base * (1 + margem)).toFixed(1), margem, grande };
}

/** Escolha automática do motor a partir do peso. */
function escolherMotorPorPeso(pesoKg: number): number {
  if (pesoKg <= 200) return 200;
  if (pesoKg <= 300) return 300;
  if (pesoKg <= 400) return 400;
  if (pesoKg <= 500) return 500;
  return 800;
}

/** Escolha do eixo conforme largura e motor escolhido. */
function escolherEixoAuto(largura: number, motorKg: number): number {
  if (motorKg >= 700) return 6.5;
  if (motorKg >= 500) return 5.5;
  if ((Number(largura) || 0) <= 6) return 4.5;
  return 5.5;
}

/** Guia automática pela largura: ≤4m → 50mm, ≤7m → 70mm, >7m → 100mm. */
function escolherGuiaAuto(largura: number): 50 | 70 | 100 {
  const L = Number(largura) || 0;
  if (L <= 4) return 50;
  if (L <= 7) return 70;
  return 100;
}

const GUIAS_VALIDAS = [50, 60, 70, 100] as const;

/** Rolo conforme polegadas do eixo. */
function eixoPorAltura(alturaTotal: number): number {
  if (alturaTotal <= 3.5) return 4.5;
  if (alturaTotal <= 4.5) return 5.5;
  return 6.5;
}

/** Portinhola cortada: largura final = largura porta - (0,64 + profundidade da guia em m).
 *  18 lâminas perfil baixo, 19 lâminas perfil alto. */
function calcPortinholaCortada(largura: number, guia_mm: number, perfil: "baixo" | "alto") {
  const gM = (Number(guia_mm) || 0) / 1000;
  const larguraFinal = Math.max(0, +(Number(largura) - (0.64 + gM)).toFixed(2));
  const qtdLaminas = perfil === "alto" ? 19 : 18;
  return { largura_final: larguraFinal, qtd_laminas: qtdLaminas, soleira_m: larguraFinal };
}

/** Lâmina parcial: qtd de lâminas para uma faixa de altura (sempre ÷ 0,085). */
function calcLaminasParcial(alturaM: number): number {
  return Math.ceil((Number(alturaM) || 0) / 0.085);
}

async function explodirKitPorta(cfg: any): Promise<CfgLinha[]> {
  const linhas: CfgLinha[] = [];
  const largura = Number(cfg?.largura) || 0;
  const altura = Number(cfg?.altura) || 0;
  if (!largura || !altura) return linhas;

  const modeloLam: string = String(cfg?.lamina?.modelo || "fechado");
  const perfil: "baixo" | "alto" = (cfg?.lamina?.perfil === "alto" ? "alto" : "baixo");

  // Auto: motor, eixo, guia
  const acdc = cfg?.motor?.ac_dc || "AC";
  const pesoInfo = estimarPesoPorta(largura, altura);
  const potencia = Number(cfg?.motor?.potencia) || escolherMotorPorPeso(pesoInfo.peso_kg);
  const eixoPol = Number(cfg?.eixo_polegadas) || escolherEixoAuto(largura, potencia);
  const rolo = calcRolo(eixoPol);
  const alturaTotal = altura + rolo;
  let guia_mm_eff = Number(cfg?.guia_mm) || escolherGuiaAuto(largura);
  if (!GUIAS_VALIDAS.includes(guia_mm_eff as any)) guia_mm_eff = escolherGuiaAuto(largura);

  const instalacao = (cfg?.instalacao || "entre_paredes") as TipoInstalacao;
  const corte = calcMedidaCorte(largura, instalacao, {
    guia_mm: guia_mm_eff,
    guia_mm_esq: Number(cfg?.guia_mm_esq) || undefined,
    guia_mm_dir: Number(cfg?.guia_mm_dir) || undefined,
    trava: !!cfg?.trava_lamina,
  });
  const cortarEixo = corte.eixo || largura;
  const cortarSoleira = corte.soleira || largura;
  const cortarLamina = corte.laminas || largura;

  // Lâmina principal + faixas parciais (combinação)
  const combinacao: Array<{ modelo: string; altura_m: number }> = Array.isArray(cfg?.lamina?.combinacao)
    ? cfg.lamina.combinacao : [];
  const alturaParcial = combinacao.reduce((s, c) => s + (Number(c.altura_m) || 0), 0);
  const alturaPrincipal = Math.max(0, alturaTotal - alturaParcial);
  const qtdLamPrincipal = calcLaminas(alturaPrincipal, perfil);

  const cor = cfg?.lamina?.cor ? ` ${cfg.lamina.cor}` : "";
  const pLam = await precoEstoque(`lamina ${modeloLam.replace("_", " ")} ${perfil}${cor}`);
  if (qtdLamPrincipal > 0) {
    linhas.push({
      sku: pLam?.sku || "LAMINA",
      descricao: pLam?.nome || `Lâmina ${modeloLam.replace("_", " ")}${cor} — corte ${cortarLamina.toFixed(2)}m`,
      und: pLam?.und || "UN",
      qtd: qtdLamPrincipal * cortarLamina,
      valor_unit: pLam?.preco || 0,
      total: (pLam?.preco || 0) * qtdLamPrincipal * cortarLamina,
      sob_consulta: !pLam,
    });
  }
  for (const faixa of combinacao) {
    const qtdF = calcLaminasParcial(faixa.altura_m);
    if (qtdF <= 0) continue;
    const pF = await precoEstoque(`lamina ${String(faixa.modelo).replace("_", " ")} ${perfil}${cor}`);
    linhas.push({
      sku: pF?.sku || "LAMINA",
      descricao: pF?.nome || `Lâmina ${String(faixa.modelo).replace("_", " ")}${cor} — faixa ${faixa.altura_m}m — corte ${cortarLamina.toFixed(2)}m`,
      und: pF?.und || "UN",
      qtd: qtdF * cortarLamina,
      valor_unit: pF?.preco || 0,
      total: (pF?.preco || 0) * qtdF * cortarLamina,
      sob_consulta: !pF,
    });
  }

  // Guia lateral
  const pGuia = await precoEstoque(`guia lateral ${guia_mm_eff}mm`);
  const guiasNec = instalacao === "entre_testeiras" ? 0 : instalacao === "vao_1guia" ? 1 : 2;
  const mlGuia = guiasNec > 0 ? guiasNec * altura : 0;
  if (mlGuia > 0) {
    linhas.push({
      sku: pGuia?.sku || "GUIA",
      descricao: pGuia?.nome || `Guia lateral ${guia_mm_eff}mm (${guiasNec === 1 ? "1 un" : "par"})`,
      und: pGuia?.und || "M",
      qtd: mlGuia,
      valor_unit: pGuia?.preco || 0,
      total: (pGuia?.preco || 0) * mlGuia,
      sob_consulta: !pGuia,
    });
  }

  // Eixo
  const pEixo = await precoEstoque(`eixo ${eixoPol}`);
  linhas.push({
    sku: pEixo?.sku || "EIXO",
    descricao: pEixo?.nome || `Eixo ${eixoPol}" — corte ${cortarEixo.toFixed(2)}m`,
    und: pEixo?.und || "M", qtd: cortarEixo,
    valor_unit: pEixo?.preco || 0,
    total: (pEixo?.preco || 0) * cortarEixo,
    sob_consulta: !pEixo,
  });

  // Soleira
  const pSol = await precoEstoque("soleira");
  linhas.push({
    sku: pSol?.sku || "SOLEIRA",
    descricao: pSol?.nome || `Soleira em T — corte ${cortarSoleira.toFixed(2)}m`,
    und: pSol?.und || "M", qtd: cortarSoleira,
    valor_unit: pSol?.preco || 0,
    total: (pSol?.preco || 0) * cortarSoleira,
    sob_consulta: !pSol,
  });

  // Motor + (kit automatizador | motor+testeiras | avulso)
  const kitMotor = cfg?.kit_motor || "kit_automatizador";
  if (cfg?.motor !== false) {
    const pMot = await precoEstoque(`motor ${potencia}kg ${acdc}`);
    linhas.push({
      sku: pMot?.sku || `MOTOR-${potencia}KG`,
      descricao: pMot?.nome || `Motor ${acdc} ${potencia}kg`,
      und: "UN", qtd: 1,
      valor_unit: pMot?.preco || 0,
      total: pMot?.preco || 0,
      sob_consulta: !pMot,
    });
    if (kitMotor === "kit_automatizador" || kitMotor === "motor_testeiras") {
      const pTest = await precoEstoque("testeira");
      linhas.push({
        sku: pTest?.sku || "TESTEIRA",
        descricao: pTest?.nome || "Testeiras (par)",
        und: "PAR", qtd: 1,
        valor_unit: pTest?.preco || 0,
        total: pTest?.preco || 0,
        sob_consulta: !pTest,
      });
    }
    if (kitMotor === "kit_automatizador" && cfg?.central !== false) {
      const pCen = await precoEstoque("central de comando");
      linhas.push({
        sku: pCen?.sku || "CENTRAL",
        descricao: pCen?.nome || "Central de comando",
        und: "UN", qtd: 1,
        valor_unit: pCen?.preco || 0,
        total: pCen?.preco || 0,
        sob_consulta: !pCen,
      });
      const qtdCtrl = Number(cfg?.controles) || 2;
      const pCtrl = await precoEstoque("controle remoto");
      linhas.push({
        sku: pCtrl?.sku || "CONTROLE",
        descricao: pCtrl?.nome || "Controle remoto",
        und: "UN", qtd: qtdCtrl,
        valor_unit: pCtrl?.preco || 0,
        total: (pCtrl?.preco || 0) * qtdCtrl,
        sob_consulta: !pCtrl,
      });
    }
  }

  // Portinhola
  if (cfg?.portinhola) {
    const modelo = String(typeof cfg.portinhola === "string" ? cfg.portinhola : "CENTRO").toUpperCase();
    const cortada = modelo === "CENTRO" ? true : (cfg?.portinhola_cortada !== false);
    const pPort = await precoEstoque(`portinhola ${modelo}`);
    linhas.push({
      sku: pPort?.sku || "PORTINHOLA",
      descricao: pPort?.nome || `Portinhola ${modelo}${cortada ? " (cortada)" : " (inteira p/ ajuste local)"}`,
      und: "UN", qtd: 1,
      valor_unit: pPort?.preco || 0,
      total: pPort?.preco || 0,
      sob_consulta: !pPort,
    });
    if (cortada) {
      const calc = calcPortinholaCortada(largura, guia_mm_eff, perfil);
      const pSolP = await precoEstoque("soleira");
      linhas.push({
        sku: (pSolP?.sku || "SOLEIRA") + "-P",
        descricao: `Soleira portinhola — corte ${calc.largura_final.toFixed(2)}m`,
        und: pSolP?.und || "M", qtd: calc.soleira_m,
        valor_unit: pSolP?.preco || 0,
        total: (pSolP?.preco || 0) * calc.soleira_m,
        sob_consulta: !pSolP,
      });
      const pLamP = await precoEstoque(`lamina ${modeloLam.replace("_", " ")} ${perfil}${cor}`);
      linhas.push({
        sku: (pLamP?.sku || "LAMINA") + "-P",
        descricao: `Lâminas portinhola (${calc.qtd_laminas} un) — corte ${calc.largura_final.toFixed(2)}m`,
        und: pLamP?.und || "UN",
        qtd: calc.qtd_laminas * calc.largura_final,
        valor_unit: pLamP?.preco || 0,
        total: (pLamP?.preco || 0) * calc.qtd_laminas * calc.largura_final,
        sob_consulta: !pLamP,
      });
    }
  }
  // Alçapão
  if (cfg?.alcapao && !cfg?.portinhola) {
    const pAlc = await precoEstoque("alcapao");
    linhas.push({
      sku: pAlc?.sku || "ALCAPAO",
      descricao: pAlc?.nome || "Alçapão emergencial",
      und: "UN", qtd: 1,
      valor_unit: pAlc?.preco || 0,
      total: pAlc?.preco || 0,
      sob_consulta: !pAlc,
    });
  }
  // Pintura eletrostática
  if (cfg?.pintura) {
    const corP = cfg?.lamina?.cor || "branca";
    const pPint = await precoEstoque(`pintura eletrostatica ${corP}`);
    const area = +(largura * alturaTotal).toFixed(2);
    linhas.push({
      sku: pPint?.sku || "PINTURA",
      descricao: pPint?.nome || `Pintura eletrostática ${corP}`,
      und: pPint?.und || "M2", qtd: area,
      valor_unit: pPint?.preco || 0,
      total: (pPint?.preco || 0) * area,
      sob_consulta: !pPint,
    });
  }
  // Trava-lâmina (opcional)
  if (cfg?.trava_lamina) {
    const pTr = await precoEstoque("trava lamina");
    linhas.push({
      sku: pTr?.sku || "TRAVA",
      descricao: pTr?.nome || "Trava-lâmina",
      und: "UN", qtd: 1,
      valor_unit: pTr?.preco || 0,
      total: pTr?.preco || 0,
      sob_consulta: !pTr,
    });
  }

  return linhas;
}

async function explodirItem(item: CfgItem): Promise<CfgLinha[]> {
  const cfg = item.config || {};
  if (item.tipo === "kit_porta") return explodirKitPorta(cfg);
  if (item.tipo === "motor") {
    const pot = Number(cfg.potencia);
    if (!pot) return [];
    const p = await precoEstoque(`motor ${pot}kg ${cfg.ac_dc || "AC"}`);
    const qtd = Number(cfg.qtd) || 1;
    return [{ sku: p?.sku || `MOTOR-${pot}KG`, descricao: p?.nome || `Motor ${cfg.ac_dc || "AC"} ${pot}kg`, und: "UN", qtd, valor_unit: p?.preco || 0, total: (p?.preco || 0) * qtd, sob_consulta: !p }];
  }
  if (item.tipo === "guia") {
    const mm = Number(cfg.mm);
    if (!mm) return [];
    const compr = Number(cfg.comprimento_m) || 0;
    const pares = Number(cfg.qtd_pares) || 0;
    const unidades = Number(cfg.qtd_unidades) || 0;
    const totalMl = calcGuiasMetrosLineares(pares || unidades, !!pares, compr);
    if (!totalMl) return [];
    const p = await precoEstoque(`guia lateral ${mm}mm`);
    return [{ sku: p?.sku || "GUIA", descricao: p?.nome || `Guia lateral ${mm}mm${pares ? " (par)" : ""}`, und: p?.und || "M", qtd: totalMl, valor_unit: p?.preco || 0, total: (p?.preco || 0) * totalMl, sob_consulta: !p }];
  }
  if (item.tipo === "controle") {
    const qtd = Number(cfg.qtd) || 1;
    const p = await precoEstoque("controle remoto");
    return [{ sku: p?.sku || "CONTROLE", descricao: p?.nome || "Controle remoto", und: "UN", qtd, valor_unit: p?.preco || 0, total: (p?.preco || 0) * qtd, sob_consulta: !p }];
  }
  if (item.tipo === "central") {
    const qtd = Number(cfg.qtd) || 1;
    const p = await precoEstoque("central de comando");
    return [{ sku: p?.sku || "CENTRAL", descricao: p?.nome || "Central de comando", und: "UN", qtd, valor_unit: p?.preco || 0, total: (p?.preco || 0) * qtd, sob_consulta: !p }];
  }
  if (item.tipo === "trava_lamina") {
    const qtd = Number(cfg.qtd) || 1;
    const p = await precoEstoque("trava lamina");
    return [{ sku: p?.sku || "TRAVA", descricao: p?.nome || "Trava-lâmina", und: "UN", qtd, valor_unit: p?.preco || 0, total: (p?.preco || 0) * qtd, sob_consulta: !p }];
  }
  if (item.tipo === "lamina") {
    const qtd = Number(cfg.qtd) || 1;
    const compr = Number(cfg.comprimento_m) || 0;
    const modelo = String(cfg.modelo || "meia_cana").replace("_", " ");
    const cor = cfg.cor ? ` ${cfg.cor}` : "";
    const perfil = cfg.perfil || "baixo";
    const p = await precoEstoque(`lamina ${modelo} ${perfil}${cor}`);
    const total = (p?.preco || 0) * qtd * (compr || 1);
    return [{ sku: p?.sku || "LAMINA", descricao: p?.nome || `Lâmina ${modelo} perfil ${perfil}${cor}${compr ? ` ${compr}m` : ""}`, und: p?.und || "UN", qtd: compr ? qtd * compr : qtd, valor_unit: p?.preco || 0, total, sob_consulta: !p }];
  }
  if (item.tipo === "soleira") {
    const qtd = Number(cfg.qtd) || 1;
    const compr = Number(cfg.comprimento_m) || 0;
    const p = await precoEstoque("soleira");
    const total = (p?.preco || 0) * qtd * (compr || 1);
    return [{ sku: p?.sku || "SOLEIRA", descricao: p?.nome || `Soleira em T${compr ? ` ${compr}m` : ""}`, und: p?.und || "M", qtd: compr ? qtd * compr : qtd, valor_unit: p?.preco || 0, total, sob_consulta: !p }];
  }
  if (item.tipo === "eixo") {
    const qtd = Number(cfg.qtd) || 1;
    const compr = Number(cfg.comprimento_m) || 0;
    const pol = Number(cfg.polegadas) || 4.5;
    const p = await precoEstoque(`eixo ${pol}`);
    const total = (p?.preco || 0) * qtd * (compr || 1);
    return [{ sku: p?.sku || "EIXO", descricao: p?.nome || `Eixo ${pol}"${compr ? ` ${compr}m` : ""}`, und: p?.und || "M", qtd: compr ? qtd * compr : qtd, valor_unit: p?.preco || 0, total, sob_consulta: !p }];
  }
  if (item.tipo === "portinhola") {
    const qtd = Number(cfg.qtd) || 1;
    const modelo = String(cfg.modelo || "CENTRO").toUpperCase();
    const p = await precoEstoque(`portinhola ${modelo}`);
    return [{ sku: p?.sku || "PORTINHOLA", descricao: p?.nome || `Portinhola ${modelo}`, und: "UN", qtd, valor_unit: p?.preco || 0, total: (p?.preco || 0) * qtd, sob_consulta: !p }];
  }
  if (item.tipo === "alcapao") {
    const qtd = Number(cfg.qtd) || 1;
    const p = await precoEstoque("alcapao");
    return [{ sku: p?.sku || "ALCAPAO", descricao: p?.nome || "Alçapão emergencial", und: "UN", qtd, valor_unit: p?.preco || 0, total: (p?.preco || 0) * qtd, sob_consulta: !p }];
  }
  if (item.tipo === "pintura") {
    const area = Number(cfg.area_m2) || 0;
    const cor = cfg.cor || "branca";
    const p = await precoEstoque(`pintura eletrostatica ${cor}`);
    const qtd = area || 1;
    return [{ sku: p?.sku || "PINTURA", descricao: p?.nome || `Pintura eletrostática ${cor}${area ? ` ${area}m²` : ""}`, und: p?.und || "M2", qtd, valor_unit: p?.preco || 0, total: (p?.preco || 0) * qtd, sob_consulta: !p }];
  }
  if (item.tipo === "acessorio") {
    const qtd = Number(cfg.qtd) || 1;
    const desc = String(cfg.descricao || "acessorio");
    const p = await precoEstoque(desc);
    return [{ sku: p?.sku || "ACESS", descricao: p?.nome || desc, und: p?.und || "UN", qtd, valor_unit: p?.preco || 0, total: (p?.preco || 0) * qtd, sob_consulta: !p }];
  }
  return [];
}

async function cfgRecalcular(pedido: CfgPedido, opts: { explodir?: boolean } = {}): Promise<CfgPedido> {
  let total = 0;
  let sob = false;
  for (const it of pedido.itens) {
    if (opts.explodir) {
      it.explosao = await explodirItem(it);
    } else {
      // Mantém a explosão anterior se houver, mas não recalcula a cada turno
      it.explosao = it.explosao || [];
    }
    it.subtotal = +(it.explosao.reduce((s, l) => s + l.total, 0)).toFixed(2);
    total += it.subtotal;
    if (it.explosao.some((l) => l.sob_consulta)) sob = true;
  }
  pedido.total = +total.toFixed(2);
  pedido.sob_consulta = sob;
  return pedido;
}

// --- Próxima pergunta (código puro) ---
function cfgProximaPergunta(pedido: CfgPedido): string | null {
  for (const it of pedido.itens) {
    if (it.tipo === "kit_porta") {
      const c = it.config || {};
      // Apenas o essencial — motor potência/eixo/guia são automáticos pelas regras.
      if (!c.largura || !c.altura) return "Qual a *largura x altura* da porta (em metros)? Ex: `3x4`.";
      if (!c.instalacao) return "Qual o tipo de instalação?\n• *entre testeiras*\n• *vão + 1 guia*\n• *vão + guias*\n• *entre paredes*";
      if ((c.instalacao === "vao_1guia" || c.instalacao === "vao_guias") && !c.guia_mm && !c.guia_mm_esq && !c.guia_mm_dir) {
        return "Qual a profundidade da *guia* em mm? (50 / 60 / 70 / 100)";
      }
      if (!c?.motor?.ac_dc) return "O motor é *AC* ou *DC*?";
      if (!c?.lamina?.modelo) return "Qual o *modelo da lâmina*?\n• *Fechada*\n• *Transvision*\n• *Oblongo*";
      if (!c?.lamina?.cor) return "Qual a *cor da lâmina/pintura*?";
      // VILD/VILE precisa saber se é cortada ou inteira
      const port = typeof c.portinhola === "string" ? c.portinhola.toUpperCase() : "";
      if ((port === "VILD" || port === "VILE") && c.portinhola_cortada === undefined) {
        return "A portinhola é *cortada* (com lâminas já cortadas) ou *inteira para ajuste no local*?";
      }
    } else if (it.tipo === "motor") {
      if (!it.config?.potencia) return "Motor de quantos *kg*? (200/300/400/500/800)";
      if (!it.config?.ac_dc) return "*AC* ou *DC*?";
    } else if (it.tipo === "guia") {
      if (!it.config?.mm) return "Guia de quantos *mm*? (50 / 60 / 70 / 100)";
      if (!it.config?.comprimento_m) return "Qual o *comprimento em metros* da guia?";
      if (!it.config?.qtd_pares && !it.config?.qtd_unidades) return "Quantos *pares* (ou unidades) de guia?";
    }
  }
  return null;
}

// --- Resumo em texto ---
function cfgResumo(pedido: CfgPedido, opts: { mostrarTotal?: boolean } = {}): string {
  if (!pedido.itens.length) return "_(carrinho vazio)_";
  const linhas: string[] = ["*Itens anotados até agora:*"];
  let n = 1;
  for (const it of pedido.itens) {
    const c = it.config || {};
    if (it.tipo === "kit_porta") {
      const rolo = calcRolo(Number(c.eixo_polegadas) || eixoPorAltura(Number(c.altura) || 0));
      linhas.push(`${n++}. Porta de enrolar${c?.motor?.ac_dc ? " automática" : ""}`);
      if (c.largura && c.altura) linhas.push(`   Medida: ${c.largura}m × ${c.altura}m  _(+ rolo ${rolo.toFixed(2)}m)_`);
      if (c.instalacao) {
        const labelInst: Record<string, string> = {
          entre_testeiras: "entre testeiras",
          vao_1guia: "vão + 1 guia",
          vao_guias: "vão + guias",
          entre_paredes: "entre paredes",
        };
        linhas.push(`   Instalação: ${labelInst[String(c.instalacao)] || String(c.instalacao).replace(/_/g, " ")}${c.trava_lamina ? " (com trava de lâminas)" : ""}`);
      }
      if (c?.motor?.ac_dc) linhas.push(`   Motor: ${c.motor.ac_dc}${c.motor.potencia ? " " + c.motor.potencia + "kg" : ""}`);
      if (c?.lamina?.modelo) linhas.push(`   Lâmina: ${String(c.lamina.modelo).replace("_", " ")}${c.lamina.perfil ? " perfil " + c.lamina.perfil : ""}`);
      if (c?.lamina?.cor) linhas.push(`   Cor: ${c.lamina.cor}`);
      if (c.guia_mm) linhas.push(`   Guia: ${c.guia_mm}mm`);
      if (c.portinhola) linhas.push(`   Portinhola: ${typeof c.portinhola === "string" ? c.portinhola : "sim"}`);
      if (c.alcapao) linhas.push(`   Alçapão: sim`);
      if (c.pintura) linhas.push(`   Pintura eletrostática`);
      if (c.central !== false && c?.motor?.potencia) linhas.push(`   Central de controle inclusa`);
      if ((Number(c.controles) || 0) > 0) linhas.push(`   Controles: ${c.controles}`);
    } else if (it.tipo === "motor") {
      linhas.push(`${n++}. Motor ${c.ac_dc || "?"} ${c.potencia || "?"}kg x ${c.qtd || 1}`);
    } else if (it.tipo === "guia") {
      linhas.push(`${n++}. Guia ${c.mm || "?"}mm — ${c.qtd_pares ? c.qtd_pares + " par(es)" : (c.qtd_unidades || "?") + " un"} de ${c.comprimento_m || "?"}m`);
    } else if (it.tipo === "controle") {
      linhas.push(`${n++}. Controle remoto x ${c.qtd || 1}`);
    } else if (it.tipo === "central") {
      linhas.push(`${n++}. Central de comando x ${c.qtd || 1}`);
    } else if (it.tipo === "trava_lamina") {
      linhas.push(`${n++}. Trava-lâmina x ${c.qtd || 1}`);
    } else if (it.tipo === "lamina") {
      linhas.push(`${n++}. Lâmina${c.modelo ? " " + String(c.modelo).replace("_", " ") : ""}${c.cor ? " " + c.cor : ""}${c.comprimento_m ? ` ${c.comprimento_m}m` : ""} x ${c.qtd || 1}`);
    } else if (it.tipo === "soleira") {
      linhas.push(`${n++}. Soleira${c.comprimento_m ? ` ${c.comprimento_m}m` : ""} x ${c.qtd || 1}`);
    } else if (it.tipo === "eixo") {
      linhas.push(`${n++}. Eixo${c.polegadas ? ` ${c.polegadas}"` : ""}${c.comprimento_m ? ` ${c.comprimento_m}m` : ""} x ${c.qtd || 1}`);
    } else if (it.tipo === "portinhola") {
      linhas.push(`${n++}. Portinhola ${c.modelo || "CENTRO"} x ${c.qtd || 1}`);
    } else if (it.tipo === "alcapao") {
      linhas.push(`${n++}. Alçapão x ${c.qtd || 1}`);
    } else if (it.tipo === "pintura") {
      linhas.push(`${n++}. Pintura eletrostática${c.cor ? " " + c.cor : ""}${c.area_m2 ? ` ${c.area_m2}m²` : ""}`);
    } else if (it.tipo === "acessorio") {
      linhas.push(`${n++}. ${c.descricao || "Acessório"} x ${c.qtd || 1}`);
    } else {
      linhas.push(`${n++}. ${it.tipo}`);
    }
  }
  // Só mostra total quando o pedido está pronto (sem campos faltando)
  if (opts.mostrarTotal && pedido.total > 0) {
    linhas.push(`\n*Total:* R$ ${pedido.total.toFixed(2).replace(".", ",")}${pedido.sob_consulta ? " _(alguns itens sob consulta)_" : ""}`);
  }
  return linhas.join("\n");
}

function cfgParecePerguntaOuConversaLivre(mensagem: string): boolean {
  const t = String(mensagem || "").toLowerCase();
  return /\?|\b(qual|quais|como|onde|quando|porque|por que|pra que|para que|voc[eê]s|trabalha|serve|pode|tem|faz|boa tarde|bom dia|boa noite|ok|obrigado|valeu)\b/.test(t);
}

async function cfgResponderComLLM(args: { mensagemCliente: string; pedido: CfgPedido; proxima: string | null }): Promise<string> {
  const resumo = args.pedido.itens.length ? cfgResumo(args.pedido, { mostrarTotal: !args.proxima }) : "Sem item técnico fechado ainda.";
  const system = `Você é o Leo, consultor técnico humano da Eletroportas no WhatsApp.
Responda em português brasileiro, curto e natural (1 a 4 frases), sem dizer que é IA/robô.
OBRIGATÓRIO: responda primeiro exatamente a dúvida/comentário do cliente. Depois, se houver campo pendente, conduza com uma única pergunta.
Não invente preço, endereço, prazo exato ou dado técnico fora das regras.

${CFG_REGRAS_TECNICAS}`;
  const user = `MENSAGEM DO CLIENTE: ${args.mensagemCliente}

PEDIDO ATUAL:
${resumo}

PRÓXIMA PERGUNTA TÉCNICA, se fizer sentido continuar o orçamento: ${args.proxima || "nenhuma; pergunte se deseja acrescentar item ou gerar orçamento"}`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12_000);
    const resp = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY || OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.25,
        max_tokens: 900,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!resp.ok) throw new Error(`IA ${resp.status}`);
    const j = await resp.json();
    const txt = String(j?.choices?.[0]?.message?.content || "").trim();
    if (txt) return txt;
  } catch (e) {
    console.error("cfgResponderComLLM erro:", (e as Error)?.message);
  }
  return args.proxima
    ? `Certo 👍 ${args.proxima}`
    : `Certo 👍 Quer acrescentar mais algum item ou posso gerar o orçamento?`;
}

// --- Gerador de PDF (itens explodidos) ---
function cfgGerarHtml(pedido: CfgPedido, cliente: { nome?: string; telefone?: string }) {
  const linhasHtml = pedido.itens.flatMap((it, idx) =>
    it.explosao.map((l, j) => `
      <tr>
        <td>${idx + 1}.${j + 1}</td>
        <td>${escapeHtml(l.sku)}</td>
        <td>${escapeHtml(l.descricao)}</td>
        <td style="text-align:center">${escapeHtml(l.und)}</td>
        <td style="text-align:right">${Number(l.qtd).toFixed(2)}</td>
        <td style="text-align:right">${l.sob_consulta ? "—" : "R$ " + Number(l.valor_unit).toFixed(2)}</td>
        <td style="text-align:right">${l.sob_consulta ? "<i>sob consulta</i>" : "R$ " + Number(l.total).toFixed(2)}</td>
      </tr>`)
  ).join("");
  const dataStr = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Bahia" });
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;font-size:11pt;color:#222;margin:30px}
    h1{color:#0f3a6e;margin:0 0 4px}
    .header{border-bottom:3px solid #f6a500;padding-bottom:8px;margin-bottom:16px}
    .meta{color:#555;font-size:9pt}
    table{width:100%;border-collapse:collapse;margin-top:12px;font-size:10pt}
    th{background:#0f3a6e;color:#fff;padding:6px;text-align:left}
    td{border-bottom:1px solid #eee;padding:6px}
    .total{margin-top:14px;font-size:13pt;text-align:right}
    .total strong{color:#0f3a6e}
    .footer{margin-top:24px;font-size:9pt;color:#666;border-top:1px solid #ddd;padding-top:8px}
  </style></head><body>
    <div class="header">
      <h1>Eletroportas — Orçamento</h1>
      <div class="meta">Cliente: ${escapeHtml(cliente.nome || "—")} | Tel: ${escapeHtml(cliente.telefone || "—")} | Data: ${dataStr}</div>
    </div>
    <table>
      <thead><tr><th>Item</th><th>Código</th><th>Descrição da mercadoria</th><th>Und.</th><th>Qtd</th><th>Vlr unit.</th><th>Total</th></tr></thead>
      <tbody>${linhasHtml || `<tr><td colspan="7" style="text-align:center;color:#999">Pedido vazio</td></tr>`}</tbody>
    </table>
    <div class="total">Total: <strong>R$ ${pedido.total.toFixed(2).replace(".", ",")}</strong></div>
    <div class="footer">
      Validade: 7 dias · Pagamento: a combinar · Entrega: a combinar.
      ${pedido.sob_consulta ? "<br><b>Itens marcados como \"sob consulta\" serão confirmados pela equipe.</b>" : ""}
    </div>
  </body></html>`;
}

// --- Gerador de resposta humanizada ---
async function cfgGerarResposta(args: { mensagemCliente: string; pedido: CfgPedido; proxima: string | null; duvidas: string[]; primeiraMsg: boolean }): Promise<string> {
  const { mensagemCliente, pedido, proxima, duvidas, primeiraMsg } = args;
  const completo = !proxima && pedido.itens.length > 0;
  const resumo = pedido.itens.length ? cfgResumo(pedido, { mostrarTotal: completo }) : "";
  const partes: string[] = [];
  if (primeiraMsg && !pedido.itens.length) {
    partes.push(
      `Olá! 👋 Você está falando com a Equipe Eletroportas — atendimento *Serralheiro / Parceiro*.\n\n` +
      `Posso te ajudar com:\n*1.* Kit porta de enrolar\n*2.* Peças avulsas\n*3.* Motores\n*4.* Acessórios\n\n` +
      `Pode mandar o pedido em texto livre — ex: _"3x4 entre paredes AC meia cana branca portinhola VILD"_ — ou escolher uma opção acima.`
    );
    return partes.join("\n\n");
  }
  if (duvidas.length || cfgParecePerguntaOuConversaLivre(mensagemCliente)) {
    return await cfgResponderComLLM({ mensagemCliente, pedido, proxima });
  }
  if (resumo) partes.push(resumo);
  if (proxima) partes.push(`👉 ${proxima}`);
  else if (pedido.itens.length) partes.push(`👉 Deseja *acrescentar mais algum item* ou posso *gerar o orçamento*?`);
  return partes.join("\n\n") || "Pode me dizer o que precisa? Ex: _\"3x4 entre paredes AC meia cana branca portinhola VILD\"_";
}

// --- Orquestrador ---
async function rodarConfigurador(args: {
  conversa: any;
  telefone: string;
  mensagem: string;
  nomeCliente: string;
  isNova: boolean;
}): Promise<{ pdfEnviado: boolean; texto?: string }> {
  const { conversa, telefone, mensagem, nomeCliente, isNova } = args;

  // Carrega pedido atual
  const { data: row } = await supabase
    .from("leo_conversations")
    .select("pedido")
    .eq("id", conversa.id)
    .maybeSingle();
  let pedido = carregarPedido((row as any)?.pedido);

  // 1) Interpreta
  const intencoes = await cfgInterpretar(mensagem, pedido);
  console.log("🧠 cfg intencoes:", JSON.stringify(intencoes));

  // 2) Aplica (sem explodir BOM ainda — apenas atualiza config)
  const r = cfgAplicar(pedido, intencoes);
  // Só explode/consulta estoque quando: cliente pediu orçamento OU pedido está completo
  const proximaCheck = cfgProximaPergunta(r.pedido);
  const deveExplodir = r.quer_gerar || (!proximaCheck && r.pedido.itens.length > 0);
  pedido = await cfgRecalcular(r.pedido, { explodir: deveExplodir });

  // 3) Persiste
  await supabase
    .from("leo_conversations")
    .update({ pedido: pedido as any, ultima_mensagem_at: new Date().toISOString() })
    .eq("id", conversa.id);

  // 4) Geração de orçamento?
  if (r.quer_gerar && pedido.itens.length) {
    const html = cfgGerarHtml(pedido, { nome: nomeCliente, telefone });
    const filename = `orcamento_${Date.now()}.pdf`;
    const pdfBase64 = await gerarPdfPdfShift(html, filename);
    if (pdfBase64) {
      const caption = `Segue seu orçamento em PDF 📄${pedido.sob_consulta ? "\n_Alguns itens entraram como \"sob consulta\" e serão confirmados pela equipe._" : ""}`;
      await enviarPdfBase64(telefone, pdfBase64, filename, caption);
      await salvarMensagem(conversa.id, "assistant", caption, { pdf_enviado: true, configurador: true });
      // funnel
      try {
        await registrarOrcamentoEAvancarFunil({
          telefone, nome: nomeCliente,
          orcamento: {
            total_geral: pedido.total,
            itens: pedido.itens.flatMap((it) => it.explosao.map((l) => ({
              code: l.sku, description: l.descricao, qty: l.qtd, unit: l.und, unit_price: l.valor_unit, subtotal: l.total,
            }))),
            cliente_nome: nomeCliente,
          } as any,
          pdfBase64, filename,
        });
      } catch (e) { console.error("funil cfg erro:", (e as Error).message); }
      return { pdfEnviado: true };
    }
  }

  // 5) Resposta textual
  const proxima = cfgProximaPergunta(pedido);
  const texto = await cfgGerarResposta({
    mensagemCliente: mensagem, pedido, proxima, duvidas: r.duvidas, primeiraMsg: isNova,
  });
  await salvarMensagem(conversa.id, "assistant", texto, { configurador: true });
  await enviarTexto(telefone, texto);
  return { pdfEnviado: false, texto };
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
    const isAudio = mediaType === "audio" || mediaType === "ptt" || mediaType === "voice";
    if (mediaType !== "chat" && mediaType !== "text" && !isAudio) {
      console.log("⏭️ Ignorado: mediaType=", mediaType);
      return new Response(JSON.stringify({ ignored: "media" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let messageBody: string = body?.messageBody || "";
    const messageId: string | undefined = body?.messageId || body?.id;
    const contact = body?.contact || {};
    const telefone: string = contact?.phoneNumber || body?.from || "";
    telefoneFallback = telefone;
    const nome: string = contact?.name || contact?.pushname || "";
    const ticketId: number | undefined = body?.ticket?.id;

    // Se for áudio, baixa e transcreve via Whisper antes de seguir
    if (isAudio) {
      const audioUrl: string = body?.mediaUrl || body?.media?.url || body?.url || "";
      if (!audioUrl) {
        console.warn("🎙️ Áudio recebido sem mediaUrl — pedindo texto ao cliente");
        if (telefone) {
          await enviarTexto(telefone, "Desculpa, não consegui ouvir esse áudio agora. Pode me mandar por texto, por favor?");
        }
        return new Response(JSON.stringify({ ignored: "audio_no_url" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        console.log("🎙️ Baixando áudio:", audioUrl);
        const audioResp = await fetch(audioUrl);
        if (!audioResp.ok) throw new Error(`download ${audioResp.status}`);
        const audioBuf = await audioResp.arrayBuffer();
        const ct = audioResp.headers.get("content-type") || "audio/ogg";
        const ext = /mp3/.test(ct) ? "mp3" : /mp4|m4a/.test(ct) ? "m4a" : /wav/.test(ct) ? "wav" : "ogg";
        const audioBlob = new Blob([audioBuf], { type: ct });
        const formAudio = new FormData();
        formAudio.append("file", audioBlob, `audio.${ext}`);
        formAudio.append("model", "whisper-1");
        formAudio.append("language", "pt");
        const trResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
          body: formAudio,
        });
        const trJson = await trResp.json();
        if (!trResp.ok) {
          console.error("🎙️ Whisper erro:", trResp.status, JSON.stringify(trJson).substring(0, 300));
          if (telefone) await enviarTexto(telefone, "Desculpa, não consegui ouvir esse áudio agora. Pode me mandar por texto?");
          return new Response(JSON.stringify({ ignored: "audio_transcription_failed" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const transcricao = String(trJson?.text || "").trim();
        console.log("🎙️ Transcrição:", transcricao);
        if (!transcricao) {
          if (telefone) await enviarTexto(telefone, "Não consegui entender o áudio. Pode repetir por texto?");
          return new Response(JSON.stringify({ ignored: "audio_empty" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        messageBody = transcricao;
      } catch (e) {
        console.error("🎙️ Falha ao processar áudio:", e);
        if (telefone) await enviarTexto(telefone, "Tive um probleminha pra ouvir o áudio aqui. Pode mandar por texto?");
        return new Response(JSON.stringify({ ignored: "audio_error" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

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

    // Se o cliente legado já tem tipo_cliente definido (Revenda ou Porta Instalada),
    // pré-popula o estado da conversa para PULAR a pergunta "porta instalada ou revenda".
    // "Pendente Serralheiro" NÃO conta como definido — ainda aguarda aprovação humana.
    {
      const tipoSalvoLegado = String((clienteExistente as any)?.tipo_cliente || "").trim().toLowerCase();
      const ehRevendaLegado = tipoSalvoLegado === "revenda" || (tipoSalvoLegado.includes("revenda") && !tipoSalvoLegado.includes("pendente"));
      const ehInstaladaLegado = tipoSalvoLegado.includes("instalada") || tipoSalvoLegado === "porta_instalada";
      const tipoNormalizado: "revenda" | "porta_instalada" | null = ehRevendaLegado ? "revenda" : ehInstaladaLegado ? "porta_instalada" : null;
      if (tipoNormalizado && (!conversa.tipo_cliente || conversa.tipo_cliente === "indefinido")) {
        await supabase
          .from("leo_conversations")
          .update({ tipo_cliente: tipoNormalizado, ultima_mensagem_at: new Date().toISOString() })
          .eq("id", conversa.id);
        (conversa as any).tipo_cliente = tipoNormalizado;
        console.log(`🎯 tipo_cliente pré-definido a partir do legado: ${tipoNormalizado}`);
      }
    }

    // Em conversa nova, NÃO envia mais saudação fixa antes da IA — isso gerava 2 mensagens
    // robóticas em sequência (saudação + pergunta) e ignorava o que o cliente acabou de dizer.
    // A IA agora cumprimenta E responde ao cliente em UMA mensagem coesa.
    if (isNova) {
      // ➕ DASHBOARD: cria lead em "Contato Inicial" assim que a conversa começa
      await registrarLeadContatoInicial(telefone, conversa.nome_cliente || nome || "");
    }

    await salvarMensagem(conversa.id, "user", messageBody, { message_id: messageId || null, raw_timestamp: body?.timestamp || null });
    // Captura o timestamp APÓS salvar a própria mensagem, para não contá-la no buffer
    const userMsgSavedAt = new Date().toISOString();
    await supabase
      .from("leo_conversations")
      .update({ ultima_mensagem_at: new Date().toISOString(), nome_cliente: conversa.nome_cliente || nome || null })
      .eq("id", conversa.id);

    // ===== BUFFER DE 10s =====
    // Aguarda 10s. Se nesse intervalo chegou OUTRA mensagem do mesmo cliente,
    // este turno aborta e deixa o webhook MAIS RECENTE responder com o contexto completo.
    // Isso evita respostas fragmentadas quando o cliente envia mensagens em sequência.
    const BUFFER_MS = 10000;
    await new Promise((r) => setTimeout(r, BUFFER_MS));
    const novasMsgs = await contarMensagensUserApos(conversa.id, userMsgSavedAt);
    if (novasMsgs > 0) {
      console.log(`⏸️ Buffer: chegaram ${novasMsgs} mensagem(ns) novas em ${BUFFER_MS}ms — abortando este turno (último webhook responde).`);
      return new Response(JSON.stringify({ ok: true, buffered: true, novas_mensagens: novasMsgs }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Recarrega a conversa após o buffer (pode ter sido atualizada pelas mensagens em sequência)
    const conversaAtual = await supabase
      .from("leo_conversations")
      .select("id, nome_cliente, status, tipo_cliente, largura, altura, tipo_perfil, cep, frete")
      .eq("id", conversa.id)
      .maybeSingle();
    if (conversaAtual.data?.status === "encerrada") {
      return new Response(JSON.stringify({ ignored: "encerrada_apos_buffer" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 🛑 Cliente com cadastro PENDENTE de aprovação como serralheiro: NÃO segue o fluxo de orçamento.
    {
      if (ehPendenteSerralheiro((clienteExistente as any)?.tipo_cliente)) {
        const msgPend = montarMensagemPendenteSerralheiro(clienteExistente?.CLI_NOME || conversa.nome_cliente || nome || "");
        await enviarTexto(telefone, msgPend);
        await salvarMensagem(conversa.id, "assistant", msgPend, { pendente_serralheiro: true });
        return new Response(JSON.stringify({ ok: true, pendente_serralheiro: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ============================================================
    // 🚀 ROTEAMENTO: SERRALHEIRO (revenda) → CONFIGURADOR Leo 2.0
    // Consumidor final / porta_instalada continua no fluxo legado
    // ============================================================
    const tipoClienteAtual = String(conversaAtual.data?.tipo_cliente || conversa.tipo_cliente || "").toLowerCase();
    if (tipoClienteAtual === "revenda") {
      try {
        await rodarConfigurador({
          conversa: conversaAtual.data || conversa,
          telefone,
          mensagem: messageBody,
          nomeCliente: conversa.nome_cliente || nome || clienteExistente?.CLI_NOME || "",
          isNova,
        });
        return new Response(JSON.stringify({ ok: true, configurador: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        console.error("❌ Configurador falhou — caindo para fluxo legado:", e?.message);
      }
    }

    const estadoAntesAceite = await carregarEstadoConversa(conversa.id);


    // ➕ DASHBOARD: detecta aceite explícito do orçamento → gera pedido_venda e fecha o lead
    // Só aceita depois que o orçamento já foi enviado nesta conversa. Antes disso,
    // respostas como "fechada" são tratadas como tipo de lâmina, nunca como aceite.
    const historicoParaAceite = await carregarHistorico(conversa.id);
    const aceiteContextual = estadoProntoParaOrcamento(estadoAntesAceite) &&
      await pdfJaEnviadoConversa(conversa.id) &&
      await interpretarAceiteContextual({ texto: messageBody, historico: historicoParaAceite, estado: estadoAntesAceite });
    if (aceiteContextual) {
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

    // Se esta própria mensagem classificou como REVENDA, o legado acabou de virar
    // "Pendente Serralheiro". Bloqueia imediatamente, antes de perguntar KIT/PEÇAS.
    if (clienteExistente && estadoLocalInferido?.tipo_cliente === "revenda") {
      const clienteAtual = await buscarClientePorTelefone(telefone);
      if (ehPendenteSerralheiro((clienteAtual as any)?.tipo_cliente)) {
        const msgPend = montarMensagemPendenteSerralheiro((clienteAtual as any)?.CLI_NOME || conversa.nome_cliente || nome || "");
        await enviarTexto(telefone, msgPend);
        await salvarMensagem(conversa.id, "assistant", msgPend, { pendente_serralheiro: true, bloqueio_pos_inferencia: true });
        return new Response(JSON.stringify({ ok: true, pendente_serralheiro: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const estadoAposExtracao = (await carregarEstadoConversa(conversa.id)) || estadoLocalInferido;
    // Se o cliente NÃO está cadastrado no banco legado, NÃO dispara o fluxo determinístico
    // (tipo/medidas/perfil/etc) — deixa a IA conduzir o Passo 1 (cadastro: nome, e-mail, CNPJ/CPF) primeiro.
    // ⚠️ BYPASS DETERMINÍSTICO REMOVIDO: enviar uma pergunta hardcoded ignora COMPLETAMENTE
    // o que o cliente disse (ex: "oi", "onde vocês ficam?") e quebra a conversação.
    // A IA agora SEMPRE conduz a resposta, recebendo o DADO_PENDENTE como dica via [ESTADO].
    // A função proximaPerguntaDeterministica() segue disponível apenas como referência interna.

    // Contexto extra a injetar no LLM caso o PDF determinístico tenha falhado
    let avisoFalhaPdf: string | null = null;

    if (clienteExistente && estadoProntoParaOrcamento(estadoAposExtracao)) {
      const jaEnviouPdf = await pdfJaEnviadoConversa(conversa.id);
      // CONTEXTO (não palavras-chave): se as medidas/perfil/cep mudaram desde o último PDF, é OUTRO orçamento.
      const medidasMudaram = jaEnviouPdf ? await medidasMudaramDesdeUltimoPdf(conversa.id) : true;

      if (jaEnviouPdf && !medidasMudaram) {
        console.log("💬 PDF já enviado e medidas IGUAIS — IA responde sem gerar duplicado");
      } else {
        const resultadoPdf = await gerarEEnviarOrcamentoDeterministico(conversa.id, telefone, conversa.nome_cliente || nome || "");
        if (resultadoPdf.pdf_enviado) {
          const snapDet = await supabase.from("leo_conversations").select("tipo_cliente, subtipo_revenda, largura, altura, tipo_perfil, cep, adicionais, pecas_avulsas").eq("id", conversa.id).maybeSingle();
          await salvarMensagem(conversa.id, "assistant", resultadoPdf.caption, { pdf_enviado: true, deterministic_flow: true, snapshot: snapDet.data || null });
          if (resultadoPdf.pdfBase64 && resultadoPdf.orcamento) {
            await registrarOrcamentoEAvancarFunil({
              telefone,
              nome: conversa.nome_cliente || nome || "",
              orcamento: resultadoPdf.orcamento,
              pdfBase64: resultadoPdf.pdfBase64,
              filename: resultadoPdf.filename || `orcamento_${Date.now()}.pdf`,
            });
          }
          return new Response(JSON.stringify({ ok: true, deterministic_pdf: true, pdf_enviado: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } else {
          // ❌ NÃO devolve mensagem hardcoded e NÃO faz return.
          // Em vez disso injeta o erro como contexto pro LLM responder de forma natural,
          // levando em conta o que o cliente acabou de dizer (pergunta, saudação, ajuste de peça, etc.)
          const faltando = Array.isArray(resultadoPdf.faltando) ? resultadoPdf.faltando : [];
          if (faltando.includes("preco_estoque") && resultadoPdf.error) {
            avisoFalhaPdf = `[FALHA INTERNA AO GERAR PDF — não repita literalmente este texto] ${resultadoPdf.error}. Antes de qualquer coisa, RESPONDA o que o cliente acabou de dizer na última mensagem (saudação, pergunta, etc.). Em seguida, de forma natural e em UMA mensagem só, peça que ele confirme o nome exato/referência/medida da peça que ficou sem preço para você buscar de novo. NÃO chame gerar_orcamento agora.`;
          } else {
            avisoFalhaPdf = `[FALHA INTERNA AO GERAR PDF — não repita literalmente este texto] ${resultadoPdf.error || "erro técnico"}. Antes de qualquer coisa, RESPONDA o que o cliente acabou de dizer. Depois, peça desculpas brevemente e diga que vai verificar e retornar. NÃO chame gerar_orcamento agora.`;
          }
          console.log("⚠️ PDF determinístico falhou — delegando para o LLM responder. Motivo:", resultadoPdf.error);
        }
      }
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
      const ehPendente = tipoNorm.includes("pendente");
      const ehRevenda = !ehPendente && tipoNorm.includes("revenda");
      const ehInstalada = tipoNorm.includes("instalada") || tipoNorm === "porta_instalada";
      let blocoTipo = "";
      if (ehRevenda) {
        blocoTipo = ` Esse cliente já é classificado como **REVENDA** no nosso sistema. NÃO pergunte se é cliente final ou serralheiro — siga DIRETO o fluxo de REVENDA (Passo 2.1: KIT ou PEÇAS AVULSAS).`;
      } else if (ehInstalada) {
        blocoTipo = ` Esse cliente já é classificado como **PORTA INSTALADA** no nosso sistema. NÃO pergunte se é cliente final ou serralheiro — siga DIRETO o fluxo de PORTA INSTALADA (Passo 2.1: KIT completo ou PEÇAS AVULSAS).`;
      } else {
        blocoTipo = ` Tipo do cliente ainda não definido — siga o fluxo normal e pergunte se é cliente final ou serralheiro.`;
      }
      contextoCliente = `[CONTEXTO] Cliente JÁ CADASTRADO: ${clienteExistente.CLI_NOME || "(sem nome)"} | CNPJ/CPF: ${clienteExistente.CLI_CNPJ} | Email: ${clienteExistente.CLI_EMAIL || "(não informado)"}. NÃO peça cadastro novamente. Pode tratá-lo pelo primeiro nome.${blocoTipo}`;
    } else {
      contextoCliente = `[CONTEXTO] Cliente NÃO CADASTRADO (telefone ${telefone}). Inicie pelo Passo 1 (cadastro).`;
    }

    // Função que lê o estado atual do banco e monta o bloco [ESTADO]
    const montarEstado = async (): Promise<string> => {
      const { data: c } = await supabase
        .from("leo_conversations")
        .select("tipo_cliente, subtipo_revenda, pecas_avulsas, largura, altura, tipo_perfil, cep, frete, adicionais, adicionais_perguntado, pintura_perguntado, quer_pintura, tipo_pintura, entrega_perguntado, quer_entrega")
        .eq("id", conversa.id)
        .maybeSingle();
      const v = (x: any) => (x === null || x === undefined || x === "" || x === "indefinido") ? "PENDENTE" : String(x);
      const tc = v(c?.tipo_cliente);
      const tipoValido = c?.tipo_cliente === "revenda" || c?.tipo_cliente === "porta_instalada";
      const ehPecas = c?.subtipo_revenda === "pecas";
      const ehPorta = c?.tipo_cliente === "porta_instalada";

      const linhas: string[] = [`tipo_cliente=${tc}`];

      if (tipoValido) {
        linhas.push(`subtipo_revenda=${v(c?.subtipo_revenda)}`);
      }

      if (ehPecas) {
        const pecas = Array.isArray((c as any)?.pecas_avulsas) ? (c as any).pecas_avulsas : [];
        linhas.push(`pecas_avulsas=${pecas.length === 0 ? "PENDENTE" : `${pecas.length} item(ns)`}`);
      } else if (c?.subtipo_revenda === "kit") {
        const pinturaStr = c?.pintura_perguntado
          ? (c?.quer_pintura ? `cor=${c?.tipo_pintura || "PENDENTE_COR"}` : "dispensou")
          : "PENDENTE";
        const adicionaisStr = c?.adicionais_perguntado
          ? `portinhola=${Boolean((c?.adicionais as any)?.portinhola)}, alcapao=${Boolean((c?.adicionais as any)?.alcapao)}`
          : "PENDENTE";
        linhas.push(
          `largura=${v(c?.largura)}`,
          `altura=${v(c?.altura)}`,
          `tipo_perfil=${v(c?.tipo_perfil)}`,
          `pintura_perguntado=${pinturaStr}`,
          `adicionais_perguntado=${adicionaisStr}`,
        );
      }

      if (ehPorta) {
        const entregaStr = c?.entrega_perguntado
          ? (c?.quer_entrega ? `quer_entrega=true (CEP=${v(c?.cep)})` : "quer_entrega=false (cliente vai BUSCAR — sem frete)")
          : "PENDENTE";
        linhas.push(`entrega=${entregaStr}`);
      }

      const pendentes = linhas.filter((l) => l.endsWith("=PENDENTE")).map((l) => l.split("=")[0]);
      const proximo = pendentes[0] || "TODOS_OK_CHAMAR_GERAR_ORCAMENTO";
      const proximoTxt = proximo === "TODOS_OK_CHAMAR_GERAR_ORCAMENTO"
        ? "TODOS os dados prontos — quando fizer sentido na conversa, chame gerar_orcamento (sem argumentos)."
        : `próximo dado pendente para coletar (quando a conversa permitir): "${proximo}".`;
      return `[ESTADO ATUAL DA CONVERSA — fonte de verdade, USO INTERNO]\n${linhas.join("\n")}\nDADO_PENDENTE: ${proximoTxt}\n\n⚠️ LEMBRETE OBRIGATÓRIO: Antes de pedir o próximo dado, RESPONDA primeiro o que o cliente disse na última mensagem. Se ele fez uma pergunta (ex: "onde vocês ficam?", "vocês trabalham com madeira?", "qual o site?"), RESPONDA a pergunta com a informação real (use o bloco DADOS DA EMPRESA do prompt) e SÓ DEPOIS retome o pedido do dado pendente. NUNCA repita uma pergunta do fluxo ignorando o que o cliente acabou de dizer.`;
    };

    console.log(`🧭 Histórico: ${historico.length} msgs | Cliente: ${clienteExistente ? "cadastrado" : "novo"}`);

    // Catálogo do estoque (fonte de verdade pra responder "vocês têm X?")
    const { data: estoqueRows } = await dashboardDb
      .from("estoque")
      .select("produto_nome, codigo_sku, preco_venda, unidade_medida, quantidade")
      .gt("quantidade", 0)
      .order("produto_nome");
    const catalogoTxt = (estoqueRows || [])
      .map((r: any) => `- ${r.produto_nome} | R$ ${Number(r.preco_venda).toFixed(2)}/${r.unidade_medida || "UN"} | SKU ${r.codigo_sku}`)
      .join("\n");
    const catalogoMsg = catalogoTxt
      ? `[CATÁLOGO DE ESTOQUE — fonte de verdade]\nResponda perguntas do tipo "vocês têm X?" / "qual o preço de Y?" SEMPRE consultando esta lista. Se o item solicitado pelo cliente NÃO estiver aqui (mesmo que parecido), diga claramente que não temos no estoque atual e ofereça a alternativa mais próxima da lista. NUNCA invente um produto que não esteja listado abaixo.\n\n${catalogoTxt}`
      : "[CATÁLOGO DE ESTOQUE] Vazio no momento — informe que precisará verificar disponibilidade.";

    // Loop do agente: LLM + tools, com histórico completo e limite de segurança
    let messages: any[] = [
      { role: "system", content: contextoCliente },
      { role: "system", content: catalogoMsg },
      ...historico,
      { role: "system", content: await montarEstado() },
    ];
    if (avisoFalhaPdf) {
      messages.push({ role: "system", content: avisoFalhaPdf });
    }
    if (isNova) {
      const primeiroNome = (clienteExistente?.CLI_NOME || "").trim().split(/\s+/)[0] || "";
      messages.push({
        role: "system",
        content: `[PRIMEIRA MENSAGEM DESTA SESSÃO] Esta é a primeira mensagem de uma nova sessão${primeiroNome ? ` com ${primeiroNome}` : ""}. Em UMA ÚNICA mensagem coesa: (1) cumprimente naturalmente ("Oi${primeiroNome ? ` ${primeiroNome}` : ""}! ${saudacaoHorario()} 😊" ou similar — varie), (2) RESPONDA/RECONHEÇA o que o cliente acabou de dizer (mesmo que seja "oi", "maravilha então", uma pergunta, qualquer coisa — NUNCA ignore), e (3) só DEPOIS, se fizer sentido, conduza pro próximo passo. NÃO mande 2 mensagens separadas (saudação + pergunta). NÃO use "Olá, sou o Leo da Eletroportas" formal — fale como humano no WhatsApp.`,
      });
    }
    if (await pdfJaEnviadoConversa(conversa.id)) {
      messages.push({
        role: "system",
        content: "O orçamento em PDF já foi enviado nesta conversa. Responda normalmente qualquer dúvida do cliente e oriente próximos passos. NÃO chame gerar_orcamento, a menos que o cliente peça explicitamente um novo orçamento, alteração de medida, troca de lâmina ou atualização de dados.",
      });
    }
    let respostaFinal = "";
    let pdfEnviadoNesteTurno = false;
    let pdfCaptionEnviada = "";
    let gerarOrcamentoFalhas = 0; // contador de DADOS_INSUFICIENTES
    const MAX_ITER = 8;
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
          const jaExistePdf = await pdfJaEnviadoConversa(conversa.id);
          // Bloqueio CONTEXTUAL: só bloqueia se PDF já existe E as medidas/perfil/cep continuam IGUAIS.
          const medidasMudaramTool = jaExistePdf ? await medidasMudaramDesdeUltimoPdf(conversa.id) : true;
          if (jaExistePdf && !medidasMudaramTool) {
            console.warn("🚫 gerar_orcamento bloqueado — PDF já enviado e medidas inalteradas");
            toolResult = {
              ok: false,
              erro: "PDF_JA_ENVIADO_DUVIDA_GERAL",
              instrucao: "O PDF já foi enviado com estes mesmos dados. Responda em texto, de forma útil e consultiva. NÃO chame gerar_orcamento e NÃO reenvie PDF.",
            };
            messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(toolResult) });
            messages.push({
              role: "system",
              content: "STOP. Responda a dúvida do cliente em texto agora. Se a dúvida for prazo de entrega/instalação, explique que depende da confirmação do pedido, agenda de produção/instalação e disponibilidade, e que um atendente confirma o prazo exato após aprovação. NÃO gere PDF.",
            });
            continue;
          }

          // ===== LÊ ESTADO DO BANCO (fonte de verdade) =====
          const { data: estado } = await supabase
            .from("leo_conversations")
            .select("tipo_cliente, subtipo_revenda, pecas_avulsas, largura, altura, tipo_perfil, cep, frete, endereco_instalacao, adicionais, adicionais_perguntado, pintura_perguntado, quer_pintura, tipo_pintura, entrega_perguntado, quer_entrega")
            .eq("id", conversa.id)
            .maybeSingle();

          const tcRawV = String(estado?.tipo_cliente || "").toLowerCase().trim();
          const tcValid = tcRawV === "porta_instalada" || tcRawV === "revenda";
          const ehPecasAvulsas = estado?.subtipo_revenda === "pecas";

          const faltando: string[] = [];
          if (!tcValid) faltando.push("tipo_cliente");
          if (tcValid && !estado?.subtipo_revenda) faltando.push("subtipo_revenda");

          if (ehPecasAvulsas) {
            const pecas = Array.isArray((estado as any)?.pecas_avulsas) ? (estado as any).pecas_avulsas : [];
            if (pecas.length === 0) faltando.push("pecas_avulsas");
          } else if (estado?.subtipo_revenda === "kit") {
            const larguraNum = Number(estado?.largura);
            const alturaNum = Number(estado?.altura);
            const perfilRaw = String(estado?.tipo_perfil || "").toLowerCase();
            const perfilValid = ["fechado", "transvision", "oblongo"].includes(perfilRaw);

            if (!Number.isFinite(larguraNum) || larguraNum <= 0 || larguraNum > 20) faltando.push("largura");
            if (!Number.isFinite(alturaNum) || alturaNum <= 0 || alturaNum > 20) faltando.push("altura");
            if (!perfilValid) faltando.push("tipo_perfil");
            if (!estado?.pintura_perguntado) faltando.push("pintura");
            if (estado?.quer_pintura && !estado?.tipo_pintura) faltando.push("tipo_pintura");
            if (!estado?.adicionais_perguntado) faltando.push("adicionais");
          }

          if (tcValid && tcRawV === "porta_instalada") {
            if (!estado?.entrega_perguntado) faltando.push("entrega");
            else if (estado?.quer_entrega && !estado?.cep) faltando.push("cep");
          }

          if (faltando.length > 0) {
            gerarOrcamentoFalhas++;
            console.warn(`🚫 gerar_orcamento BLOQUEADO (tentativa ${gerarOrcamentoFalhas}) — [ESTADO] faltando:`, faltando.join(", "));
            const proximo = faltando[0];
            const proximaPergunta = proximo === "entrega"
              ? "Pergunte AGORA: 'Você prefere que a gente **entregue** no local, ou prefere **buscar/retirar** com a gente?' Quando responder, chame definir_entrega. NÃO chame nenhuma outra tool."
              : proximo === "cep"
                ? "Pergunte AGORA: 'Qual o **CEP do local da entrega**?' Quando responder, chame calcular_frete_cep. NÃO chame nenhuma outra tool."
                : proximo === "adicionais"
                  ? "Pergunte AGORA, de forma natural, se o cliente quer adicionar Portinhola, Alçapão, os dois, ou nenhum. Quando ele responder, chame definir_adicionais. NÃO chame gerar_orcamento agora."
                  : (proximo === "largura" || proximo === "altura")
                    ? "Pergunte AGORA a largura e altura da porta em metros (ex: 4x3). NÃO chame nenhuma tool."
                    : proximo === "tipo_perfil"
                      ? "Pergunte AGORA o tipo de lâmina (1 FECHADA / 2 TRANSVISION / 3 OBLONGO). NÃO chame nenhuma tool."
                      : proximo === "tipo_cliente"
                        ? "Pergunte AGORA, de forma natural: 'Antes de seguirmos, me diga: qual delas melhor representa você? 🔹 Sou cliente final – desejo instalar a porta no meu estabelecimento 🔹 Sou serralheiro – vou revender para meus clientes'. NÃO chame nenhuma tool."
                        : proximo === "subtipo_revenda"
                          ? "Pergunte AGORA se o cliente quer um KIT completo de porta de enrolar ou apenas PEÇAS AVULSAS. Quando responder, chame definir_subtipo_revenda."
                        : proximo === "pecas_avulsas"
                          ? "Se o cliente AINDA NÃO listou peças, pergunte AGORA quais peças e quantidades. Se ELE JÁ listou (ex: '5 motores 200kg'), chame definir_pecas_avulsas IMEDIATAMENTE com o array de itens — sem pedir confirmação extra. NÃO chame gerar_orcamento agora."
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
            const resultadoPdf = await gerarEEnviarOrcamentoDeterministico(conversa.id, telefone, conversa.nome_cliente || nome || "");
            if (resultadoPdf.pdf_enviado && resultadoPdf.orcamento) {
              pdfEnviadoNesteTurno = true;
              pdfCaptionEnviada = resultadoPdf.caption || "Pronto! Segue seu orçamento em PDF, dá uma olhada por favor. 📄";
              await registrarOrcamentoEAvancarFunil({
                telefone,
                nome: conversa.nome_cliente || nome || "",
                orcamento: resultadoPdf.orcamento,
                pdfBase64: resultadoPdf.pdfBase64!,
                filename: resultadoPdf.filename || `orcamento_${Date.now()}.pdf`,
                observacoes_tecnicas: typeof args?.observacoes_tecnicas === "string" ? args.observacoes_tecnicas : undefined,
              });
              toolResult = {
                ok: true,
                pdf_enviado: true,
                instrucao: "PDF enviado. NÃO envie nova mensagem. NÃO mencione valores.",
              };
            } else {
              toolResult = { ok: false, error: resultadoPdf.error || "Falha ao gerar PDF — informe ao cliente que enviaremos em breve." };
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
            const cliNovo = await buscarClientePorTelefone(telefone);
            if (ehPendenteSerralheiro((cliNovo as any)?.tipo_cliente)) {
              const msgPend = montarMensagemPendenteSerralheiro((cliNovo as any)?.CLI_NOME || args.nome || nome || "");
              await enviarTexto(telefone, msgPend);
              await salvarMensagem(conversa.id, "assistant", msgPend, { pendente_serralheiro: true, cadastro_novo: true });
              return new Response(JSON.stringify({ ok: true, pendente_serralheiro: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
            toolResult = {
              ok: true,
              instrucao: "Cliente cadastrado. Agora pergunte, de forma natural: 'Antes de seguirmos, me diga: qual delas melhor representa você? 🔹 Sou cliente final – desejo instalar a porta no meu estabelecimento 🔹 Sou serralheiro – vou revender para meus clientes'.",
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
            const proxima = "Lâmina gravada. NÃO confirme. Siga DIRETO ao Passo 5: pergunte de forma natural se o cliente quer adicionar Portinhola, Alçapão, os dois, ou nenhum. Quando responder, chame definir_adicionais.";
            toolResult = { ok: true, tipo_perfil: pNorm, instrucao: proxima };
          }
        } else if (fnName === "definir_pintura") {
          const querPintura = Boolean(args.quer_pintura);
          const tipoPint = String(args.tipo_pintura || "").toLowerCase();
          const tipoValido = ["branco_liso", "preta_fosco", "cinza_texturizado", "cor_especial"].includes(tipoPint) ? tipoPint : null;
          if (querPintura && !tipoValido) {
            toolResult = {
              ok: false,
              error: "Cliente quer pintura, mas a cor não foi informada. Pergunte qual cor: branco liso, preta fosco, cinza texturizado ou cor especial. Só chame definir_pintura quando souber a cor.",
            };
          } else {
            await supabase
              .from("leo_conversations")
              .update({
                pintura_perguntado: true,
                quer_pintura: querPintura,
                tipo_pintura: querPintura ? tipoValido : null,
                ultima_mensagem_at: new Date().toISOString(),
              })
              .eq("id", conversa.id);
            const proxima = "Pintura gravada. NÃO confirme. Siga DIRETO ao Passo 6: pergunte de forma natural sobre Portinhola/Alçapão (os dois, um ou nenhum).";
            toolResult = { ok: true, quer_pintura: querPintura, tipo_pintura: querPintura ? tipoValido : null, instrucao: proxima };
          }
        } else if (fnName === "definir_adicionais") {
          const portinhola = Boolean(args.portinhola);
          const alcapao = Boolean(args.alcapao);

          // GUARD: só aceita se o assistant já fez a pergunta sobre adicionais nas últimas mensagens
          const { data: ultimasMsgs } = await supabase
            .from("leo_messages")
            .select("role, content")
            .eq("conversation_id", conversa.id)
            .order("created_at", { ascending: false })
            .limit(6);
          const perguntouAdicionais = (ultimasMsgs || []).some((m: any) => {
            if (m.role !== "assistant") return false;
            const c = String(m.content || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return /portinhola/.test(c) && /alcapao/.test(c);
          });

          if (!perguntouAdicionais) {
            toolResult = {
              ok: false,
              error: "Você ainda NÃO perguntou ao cliente sobre os adicionais. Pergunte AGORA, de forma natural, se ele quer Portinhola, Alçapão, os dois, ou nenhum. Só chame esta tool DEPOIS que o cliente responder.",
            };
          } else {
            await supabase
              .from("leo_conversations")
              .update({
                adicionais: { portinhola, alcapao },
                adicionais_perguntado: true,
                ultima_mensagem_at: new Date().toISOString(),
              })
              .eq("id", conversa.id);
            const { data: cv2 } = await supabase
              .from("leo_conversations")
              .select("tipo_cliente, entrega_perguntado")
              .eq("id", conversa.id)
              .maybeSingle();
            const proxima = cv2?.tipo_cliente === "porta_instalada" && !cv2?.entrega_perguntado
              ? "Adicionais gravados. NÃO confirme. Siga DIRETO ao Passo 7: pergunte se o cliente quer ENTREGA no local ou prefere BUSCAR/RETIRAR. Quando responder, chame definir_entrega."
              : "Adicionais gravados. NÃO confirme. Chame gerar_orcamento agora (sem argumentos).";
            toolResult = { ok: true, portinhola, alcapao, instrucao: proxima };
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
                entrega_perguntado: true,
                quer_entrega: true,
                ultima_mensagem_at: new Date().toISOString(),
              })
              .eq("id", conversa.id);
            try { await atualizarTipoClienteLegado(telefone, "porta_instalada"); } catch (_) {}
            toolResult = {
              ok: true,
              instrucao: "CEP e frete gravados no [ESTADO]. NÃO mencione o valor do frete ao cliente. Chame IMEDIATAMENTE gerar_orcamento (sem argumentos).",
            };
          } else if (r.fora_da_bahia) {
            toolResult = { ...r, instrucao: "Cliente fora da BA para PORTA INSTALADA. NÃO transfira para humano. Informe educadamente que a instalação é só na BA, ofereça a modalidade REVENDA (envio do kit + instalação por serralheiro local) e siga conduzindo o orçamento nesse formato." };
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

            // 🛑 Se virou REVENDA e o cadastro legado ficou "Pendente Serralheiro",
            // interrompe AQUI antes de seguir ao Passo 2.1 (KIT/PEÇAS).
            if (tcNorm === "revenda") {
              const cliLeg = await buscarClientePorTelefone(telefone);
              const tipoLeg = String((cliLeg as any)?.tipo_cliente || "").trim().toLowerCase();
              if (tipoLeg.includes("pendente") && tipoLeg.includes("serralheiro")) {
                const primeiroNome = (cliLeg?.CLI_NOME || conversa.nome_cliente || nome || "").trim().split(/\s+/)[0] || "";
                const msgPend = `${primeiroNome ? primeiroNome + ", " : ""}seu cadastro como *Serralheiro* ainda está *pendente de aprovação* pela nossa equipe. ⏳\n\nAssim que for liberado, eu sigo com você normalmente para gerar o orçamento. Obrigado pela paciência! 🙏`;
                await enviarTexto(telefone, msgPend);
                await salvarMensagem(conversa.id, "assistant", msgPend, { pendente_serralheiro: true });
                return new Response(JSON.stringify({ ok: true, pendente_serralheiro: true }), {
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              }
            }

            toolResult = {
              ok: true,
              tipo_cliente: tcNorm,
              instrucao: "Tipo gravado no [ESTADO]. NÃO confirme isso ao cliente. Siga DIRETO ao Passo 2.1: pergunte se ele quer um KIT completo de porta de enrolar ou apenas PEÇAS AVULSAS.",
            };
          }
        } else if (fnName === "definir_subtipo_revenda") {
          const sub = String(args.subtipo || "").toLowerCase();
          const subNorm: "kit" | "pecas" | null = sub === "kit" ? "kit" : sub === "pecas" ? "pecas" : null;
          if (!subNorm) {
            toolResult = { ok: false, error: "subtipo inválido. Use 'kit' ou 'pecas'." };
          } else {
            await supabase
              .from("leo_conversations")
              .update({ subtipo_revenda: subNorm, ultima_mensagem_at: new Date().toISOString() })
              .eq("id", conversa.id);
            // Lê tipo_cliente para decidir próxima orientação
            const { data: cv } = await supabase
              .from("leo_conversations")
              .select("tipo_cliente")
              .eq("id", conversa.id)
              .maybeSingle();
            const ehPorta = cv?.tipo_cliente === "porta_instalada";
            let instrucao: string;
            if (subNorm === "pecas") {
              instrucao = "Subtipo PEÇAS AVULSAS gravado. NÃO confirme. Siga DIRETO ao Passo 2.2: pergunte quais peças e quantidades o cliente precisa. Use listar_pecas_disponiveis se precisar consultar o catálogo.";
            } else {
              instrucao = "Subtipo KIT gravado. NÃO confirme. Siga DIRETO ao Passo 3 perguntando largura e altura da porta.";
            }
            toolResult = { ok: true, subtipo: subNorm, tipo_cliente: cv?.tipo_cliente, instrucao };
          }
        } else if (fnName === "definir_entrega") {
          const querEntrega = Boolean(args.quer_entrega);
          const update: Record<string, unknown> = {
            entrega_perguntado: true,
            quer_entrega: querEntrega,
            ultima_mensagem_at: new Date().toISOString(),
          };
          if (!querEntrega) {
            // Cliente vai buscar — zera frete e CEP
            update.frete = 0;
            update.cep = null;
            update.endereco_instalacao = null;
          }
          await supabase.from("leo_conversations").update(update).eq("id", conversa.id);
          toolResult = {
            ok: true,
            quer_entrega: querEntrega,
            instrucao: querEntrega
              ? "Cliente quer ENTREGA. NÃO confirme. Pergunte AGORA o CEP do local da entrega (depois chame calcular_frete_cep)."
              : "Cliente vai BUSCAR/RETIRAR. Frete zerado. NÃO confirme. Chame gerar_orcamento agora (sem argumentos).",
          };
        } else if (fnName === "listar_pecas_disponiveis") {
          const busca = String(args.busca || "").trim();
          let q = dashboardDb.from("estoque").select("codigo_sku, produto_nome, descricao, preco_venda, unidade_medida, quantidade").limit(50);
          if (busca) q = q.ilike("produto_nome", `%${busca}%`);
          const { data, error } = await q;
          if (error) {
            toolResult = { ok: false, error: error.message };
          } else {
            toolResult = {
              ok: true,
              total: data?.length || 0,
              itens: data || [],
              instrucao: "Catálogo retornado. Use estes códigos/preços para confirmar com o cliente. NÃO invente itens fora desta lista.",
            };
          }
        } else if (fnName === "definir_pecas_avulsas") {
          const itensRaw = Array.isArray(args.itens) ? args.itens : [];
          if (itensRaw.length === 0) {
            toolResult = { ok: false, error: "Lista de peças vazia. Pergunte ao cliente quais peças e quantidades." };
          } else {
            const enriquecidas = await enriquecerPecasComEstoque(itensRaw);
            await supabase
              .from("leo_conversations")
              .update({ pecas_avulsas: enriquecidas, ultima_mensagem_at: new Date().toISOString() })
              .eq("id", conversa.id);
            const { data: cv3 } = await supabase
              .from("leo_conversations")
              .select("tipo_cliente, entrega_perguntado")
              .eq("id", conversa.id)
              .maybeSingle();
            const proxima = cv3?.tipo_cliente === "porta_instalada" && !cv3?.entrega_perguntado
              ? "Peças gravadas. NÃO confirme nem liste valores. Pergunte AGORA se o cliente quer ENTREGA no local ou prefere BUSCAR/RETIRAR. Quando responder, chame definir_entrega."
              : "Peças gravadas. NÃO liste valores ao cliente. Chame gerar_orcamento agora (sem argumentos).";
            toolResult = { ok: true, total: enriquecidas.length, itens: enriquecidas, instrucao: proxima };
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
        const snapAg = await supabase.from("leo_conversations").select("tipo_cliente, subtipo_revenda, largura, altura, tipo_perfil, cep, adicionais, pecas_avulsas").eq("id", conversa.id).maybeSingle();
        await salvarMensagem(conversa.id, "assistant", pdfCaptionEnviada, { pdf_enviado: true, snapshot: snapAg.data || null });
      } else {
        const textoFinal = (respostaFinal || "").trim() ||
          "Desculpe, tive uma instabilidade aqui. Pode repetir sua última mensagem, por favor? 🙏";
        await salvarMensagem(conversa.id, "assistant", textoFinal);
        await enviarTexto(telefone, textoFinal);
        if (isPerguntaLamina(textoFinal)) {
          try {
            await enviarImagemUrl(telefone, LAMINAS_IMAGE_URL);
          } catch (e) {
            console.error("⚠️ Falha ao enviar imagem de lâminas (não fatal):", e);
          }
        }
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
