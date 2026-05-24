// Banco central de parâmetros / constantes do Leo.
// Extraídos de index.ts (Fase 1). Mudanças de regra de negócio
// devem ser feitas aqui — não espalhadas pelo código.

// ---------- Endpoints / modelo IA ----------
export const DOCRYA_URL = "https://www.docrya.com/api/v1/html-to-pdf";
export const PDFSHIFT_URL = "https://api.pdfshift.io/v3/convert/pdf";
export const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const AI_MODEL = "google/gemini-3-flash-preview";

// ---------- Sessão ----------
export const SESSION_GAP_MS = 3 * 60 * 60 * 1000;

// ---------- Localização da empresa (frete) ----------
export const COMPANY_LAT = -12.8933071;
export const COMPANY_LNG = -38.3582854;

// ---------- Tabela de preços fallback ----------
export const PRECOS = {
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

// ---------- Motor ----------
export const POTENCIAS_AC = [200, 300, 400, 500, 800, 1000, 1500];
export const POTENCIAS_DC = [200, 300, 400, 500, 800];

// ---------- Guia ----------
export const GUIAS_VALIDAS = [50, 60, 70, 100] as const;

// ---------- Eixo (cálculo estrutural) ----------
export const EIXOS_TABELA = [
  { pol: 4.5, D: 114.3, e: 2.00 },
  { pol: 5.5, D: 139.7, e: 2.65 },
  { pol: 6.0, D: 152.4, e: 3.00 },
  { pol: 6.5, D: 165.1, e: 3.00 },
  { pol: 8.5, D: 215.9, e: 3.75 },
] as const;

// ---------- Prompt técnico do configurador ----------
export const CFG_REGRAS_TECNICAS = `Regras técnicas Eletroportas:
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
