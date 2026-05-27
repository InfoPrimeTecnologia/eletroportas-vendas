// Fluxo Consumidor Final — Eletroportas
// Linguagem simples, opções numeradas, uma pergunta por vez.
// O robô NÃO define tipo de instalação, NÃO usa termos técnicos
// (VILD, eixo, guia, rolo, testeiras). Apenas coleta, qualifica e encaminha.

export type CFEtapa =
  | "inicio"
  | "orcamento_rapido"
  | "falar_especialista"
  | "modelo_porta"
  | "pintura"
  | "cor_pintura"
  | "motor"
  | "acesso_secundario"
  | "acesso_auxiliar_opcao"
  | "local_uso"
  | "dados_cliente"
  | "analise_tecnica"
  | "prazo"
  | "prazo_urgencia"
  | "visita_tecnica"
  | "pagamento"
  | "encerrado";

export interface CFDados {
  modelo_porta?: "fechada" | "transvision" | "oblongo";
  quer_pintura?: boolean | "indeciso";
  cor_pintura?: string;
  motor?: "padrao_ac_220v" | "nobreak" | "especialista";
  tem_acesso_secundario?: boolean;
  acesso_auxiliar?: "portinhola" | "alcapao" | "nao";
  local_uso?: "loja" | "garagem" | "galpao" | "condominio" | "outro";
  nome?: string;
  bairro?: string;
  medidas_aprox?: string;
  telefone_contato?: string;
  fotos?: string[];
  largura_m?: number;
  altura_m?: number;
  urgencia?: boolean;
  resposta_rapida?: boolean;
}

export const CF_TEXTOS = {
  inicio: () =>
    `🤖 Olá! Seja bem-vindo(a) à Eletroportas 👋\n\n` +
    `Como deseja continuar?\n\n` +
    `1️⃣ Receber orçamento rápido\n` +
    `2️⃣ Falar com um especialista\n\n` +
    `📌 Você também pode enviar:\n` +
    `• medidas\n` +
    `• fotos do local\n` +
    `• modelo desejado`,

  orcamento_rapido: () =>
    `Perfeito 👍\n\n` +
    `Para gerar seu orçamento rapidamente, envie:\n\n` +
    `📏 largura x altura\n` +
    `📸 2 fotos do local:\n` +
    `• uma por dentro\n` +
    `• uma por fora\n\n` +
    `Assim conseguimos analisar melhor:\n` +
    `• instalação\n` +
    `• acabamento\n` +
    `• estrutura da porta`,

  falar_especialista: () =>
    `Perfeito 👍\n\n` +
    `Vou coletar algumas informações para agilizar seu atendimento com nosso especialista.\n\n` +
    `Se possível envie:\n` +
    `📸 foto interna do vão\n` +
    `📸 foto externa do vão\n` +
    `📏 medidas aproximadas\n\n` +
    `Isso ajuda nossa equipe a entender melhor seu projeto antes do atendimento.`,

  modelo_porta: () =>
    `Qual modelo você prefere?\n\n` +
    `1️⃣ Fechada — mais privacidade e segurança\n` +
    `2️⃣ Transvision — permite visibilidade\n` +
    `3️⃣ Oblongo — mais ventilação e visual moderno, com menos privacidade`,

  pintura: () =>
    `Sua porta terá pintura?\n\n` +
    `1️⃣ Sim\n` +
    `2️⃣ Não\n` +
    `3️⃣ Ainda não decidi`,

  cor_pintura: () => `Qual cor deseja para sua porta?`,

  motor: () =>
    `O sistema já irá considerar o motor automático padrão 220V para sua porta.\n\n` +
    `👉 Você deseja alguma configuração especial?\n\n` +
    `1️⃣ Motor padrão\n` +
    `2️⃣ Motor com bateria/nobreak\n   (Funciona mesmo sem energia)\n` +
    `3️⃣ Quero falar com um especialista`,

  acesso_secundario: () =>
    `Esse local possui outro acesso além da porta principal?\n\n` +
    `1️⃣ Sim\n` +
    `2️⃣ Não`,

  acesso_auxiliar_opcao: () =>
    `Nesse caso, muitas pessoas optam por incluir um acesso auxiliar para evitar ficar sem entrada em caso de falta de energia ou manutenção da porta.\n\n` +
    `Você deseja conhecer essas opções?\n\n` +
    `1️⃣ Portinhola\n   (Acesso para passagem de pessoas)\n` +
    `2️⃣ Alçapão\n   (Abertura de emergência interna)\n` +
    `3️⃣ Não desejo incluir`,

  local_uso: () =>
    `Onde essa porta será utilizada?\n\n` +
    `1️⃣ Loja\n` +
    `2️⃣ Garagem residencial\n` +
    `3️⃣ Galpão\n` +
    `4️⃣ Condomínio\n` +
    `5️⃣ Outro`,

  dados_cliente: () =>
    `Para agilizar seu atendimento, informe por favor:\n\n` +
    `Nome:\n` +
    `Bairro/cidade:\n` +
    `Medida aproximada da porta:\n` +
    `Telefone para contato:\n\n` +
    `📸 Se possível, envie também:\n` +
    `• 1 foto da parte interna\n` +
    `• 1 foto da parte externa\n\n` +
    `Isso ajuda nossa equipe a analisar:\n` +
    `• acabamento\n` +
    `• instalação\n` +
    `• estrutura do local\n\n` +
    `E agiliza bastante o orçamento 👍`,

  analise_tecnica: () =>
    `Perfeito 👍\n\n` +
    `Recebemos suas informações e fotos.\n\n` +
    `Nossa equipe irá analisar:\n` +
    `• medidas\n` +
    `• estrutura do local\n` +
    `• acabamento\n` +
    `• modelo ideal da porta\n\n` +
    `Em breve retornaremos com seu orçamento detalhado 👍`,

  prazo: () =>
    `📌 Nosso prazo médio atual de fabricação é de aproximadamente 15 dias.\n\n` +
    `Esse prazo atende sua necessidade?\n\n` +
    `1️⃣ Sim\n` +
    `2️⃣ Não\n` +
    `3️⃣ Preciso com urgência`,

  prazo_urgencia: () =>
    `Entendido 👍\n\n` +
    `Vamos verificar a possibilidade de antecipação do seu projeto junto à produção.\n\n` +
    `📌 Projetos com prioridade de fabricação podem possuir taxa adicional de urgência.`,

  visita_tecnica: () =>
    `Após a análise das fotos e informações, nossa equipe irá verificar se existe necessidade de visita técnica 👍\n\n` +
    `📌 Caso o cliente solicite visita antes da análise e fechamento do pedido, a visita poderá ser cobrada.\n\n` +
    `Se o projeto for aprovado posteriormente, o valor da visita será descontado no fechamento 👍`,

  pagamento: () =>
    `Como deseja receber seu orçamento?\n\n` +
    `1️⃣ Valor à vista\n` +
    `2️⃣ Valor parcelado\n` +
    `3️⃣ Ambas as opções`,

  encerramento: (nome?: string) =>
    `${nome ? `Obrigado, ${nome}! ` : "Obrigado! "}` +
    `Seu atendimento foi registrado e nosso vendedor entrará em contato em breve com o orçamento ✅`,

  recuperacao_24h: () =>
    `Olá 👋\n\n` +
    `Ficamos aguardando suas informações para continuar o orçamento da sua porta automática.\n\n` +
    `Se precisar de ajuda, nossa equipe está à disposição 👍`,

  recuperacao_2d: () =>
    `Olá 👋\n\n` +
    `Conseguiu analisar o orçamento da sua porta automática?\n\n` +
    `Se tiver qualquer dúvida sobre:\n` +
    `• instalação\n` +
    `• acabamento\n` +
    `• motor\n` +
    `• prazo\n\n` +
    `Nossa equipe pode te ajudar 👍`,

  recuperacao_7d: () =>
    `Olá 👋\n\n` +
    `Estamos passando para saber se ainda deseja continuar seu projeto da porta automática.\n\n` +
    `Caso queira, podemos atualizar seu orçamento ou tirar dúvidas 👍`,
};

// Detecta número de opção (1/2/3) no início da mensagem
function extrairOpcao(msg: string): number | null {
  const t = msg.trim().toLowerCase();
  const m = t.match(/^([1-9])\b/);
  if (m) return parseInt(m[1], 10);
  // Emojis numéricos
  const emojiMap: Record<string, number> = {
    "1️⃣": 1, "2️⃣": 2, "3️⃣": 3, "4️⃣": 4, "5️⃣": 5,
  };
  for (const [e, n] of Object.entries(emojiMap)) {
    if (t.startsWith(e)) return n;
  }
  return null;
}

function ehSim(msg: string): boolean {
  return /^(sim|s|yes|claro|ok|positivo|isso|👍|✅)/i.test(msg.trim());
}
function ehNao(msg: string): boolean {
  return /^(n[ãa]o|n|nope|negativ|jamais|❌)/i.test(msg.trim());
}
function ehUrgencia(msg: string): boolean {
  return /urg[êe]ncia|urgente|pra ontem|r[áa]pido|j[aá]/i.test(msg);
}

function extrairMedidas(msg: string): { largura?: number; altura?: number; texto?: string } {
  // 3x4, 3 x 4, 3,5 x 4, "3 metros por 4"
  const m = msg.match(/(\d+(?:[.,]\d+)?)\s*(?:x|por|×)\s*(\d+(?:[.,]\d+)?)/i);
  if (m) {
    const l = parseFloat(m[1].replace(",", "."));
    const a = parseFloat(m[2].replace(",", "."));
    return { largura: l, altura: a, texto: `${l}m x ${a}m` };
  }
  return {};
}

function calcularScore(dados: CFDados): { score: number; classificacao: "frio" | "morno" | "quente" } {
  let s = 0;
  if (dados.medidas_aprox || (dados.largura_m && dados.altura_m)) s += 1;
  if ((dados.fotos?.length ?? 0) >= 1) s += 2;
  if (dados.acesso_auxiliar && dados.acesso_auxiliar !== "nao") s += 1;
  if (dados.local_uso) s += 1;
  if (dados.urgencia) s += 2;
  if (dados.resposta_rapida) s += 1;
  const classificacao: "frio" | "morno" | "quente" =
    s <= 2 ? "frio" : s <= 5 ? "morno" : "quente";
  return { score: s, classificacao };
}

export interface ProcessarCFInput {
  conversa: any;
  mensagem: string;
  fotosNovas?: string[]; // URLs de mídia recebida
  agora?: Date;
}

export interface ProcessarCFResultado {
  respostas: string[];
  proxima_etapa: CFEtapa;
  dados: CFDados;
  score: number;
  classificacao: "frio" | "morno" | "quente" | null;
  encerrado: boolean;
}

/**
 * Máquina de estados do consumidor final.
 * Recebe a conversa atual e a mensagem; devolve as próximas respostas
 * (1 ou mais mensagens) e o novo estado (cf_etapa + cf_dados).
 */
export function processarConsumidorFinal(
  input: ProcessarCFInput,
): ProcessarCFResultado {
  const dados: CFDados = { ...(input.conversa?.cf_dados ?? {}) };
  if (input.fotosNovas && input.fotosNovas.length > 0) {
    dados.fotos = [...(dados.fotos ?? []), ...input.fotosNovas];
  }
  let etapa: CFEtapa =
    (input.conversa?.cf_etapa as CFEtapa) || "inicio";
  const msg = (input.mensagem || "").trim();
  const opcao = extrairOpcao(msg);
  const respostas: string[] = [];

  // Sinaliza resposta rápida (delta < 5min entre msgs)
  const ultima = input.conversa?.cf_ultima_interacao
    ? new Date(input.conversa.cf_ultima_interacao).getTime()
    : 0;
  const agora = (input.agora ?? new Date()).getTime();
  if (ultima && agora - ultima < 5 * 60 * 1000) dados.resposta_rapida = true;

  // Extrai medidas se aparecerem em qualquer momento
  const m = extrairMedidas(msg);
  if (m.largura && m.altura) {
    dados.largura_m = m.largura;
    dados.altura_m = m.altura;
    dados.medidas_aprox = m.texto;
  }
  if (ehUrgencia(msg)) dados.urgencia = true;

  switch (etapa) {
    case "inicio": {
      if (opcao === 1) {
        respostas.push(CF_TEXTOS.orcamento_rapido());
        respostas.push(CF_TEXTOS.modelo_porta());
        etapa = "modelo_porta";
      } else if (opcao === 2) {
        respostas.push(CF_TEXTOS.falar_especialista());
        respostas.push(CF_TEXTOS.modelo_porta());
        etapa = "modelo_porta";
      } else {
        respostas.push(CF_TEXTOS.inicio());
        etapa = "inicio";
      }
      break;
    }

    case "modelo_porta": {
      if (opcao === 1 || /fechad/i.test(msg)) dados.modelo_porta = "fechada";
      else if (opcao === 2 || /transvision|transvisao/i.test(msg))
        dados.modelo_porta = "transvision";
      else if (opcao === 3 || /oblongo|oblonga/i.test(msg))
        dados.modelo_porta = "oblongo";
      else {
        respostas.push(CF_TEXTOS.modelo_porta());
        break;
      }
      respostas.push(CF_TEXTOS.pintura());
      etapa = "pintura";
      break;
    }

    case "pintura": {
      if (opcao === 1 || ehSim(msg)) {
        dados.quer_pintura = true;
        respostas.push(CF_TEXTOS.cor_pintura());
        etapa = "cor_pintura";
      } else if (opcao === 2 || ehNao(msg)) {
        dados.quer_pintura = false;
        respostas.push(CF_TEXTOS.motor());
        etapa = "motor";
      } else if (opcao === 3 || /indecid|n[ãa]o sei|talvez/i.test(msg)) {
        dados.quer_pintura = "indeciso";
        respostas.push(CF_TEXTOS.motor());
        etapa = "motor";
      } else {
        respostas.push(CF_TEXTOS.pintura());
      }
      break;
    }

    case "cor_pintura": {
      dados.cor_pintura = msg;
      respostas.push(CF_TEXTOS.motor());
      etapa = "motor";
      break;
    }

    case "motor": {
      if (opcao === 1 || /padr[ãa]o/i.test(msg)) dados.motor = "padrao_ac_220v";
      else if (opcao === 2 || /nobreak|bateria/i.test(msg))
        dados.motor = "nobreak";
      else if (opcao === 3 || /especialista/i.test(msg)) {
        dados.motor = "especialista";
      } else {
        respostas.push(CF_TEXTOS.motor());
        break;
      }
      respostas.push(CF_TEXTOS.acesso_secundario());
      etapa = "acesso_secundario";
      break;
    }

    case "acesso_secundario": {
      if (opcao === 1 || ehSim(msg)) {
        dados.tem_acesso_secundario = true;
        respostas.push(CF_TEXTOS.local_uso());
        etapa = "local_uso";
      } else if (opcao === 2 || ehNao(msg)) {
        dados.tem_acesso_secundario = false;
        respostas.push(CF_TEXTOS.acesso_auxiliar_opcao());
        etapa = "acesso_auxiliar_opcao";
      } else {
        respostas.push(CF_TEXTOS.acesso_secundario());
      }
      break;
    }

    case "acesso_auxiliar_opcao": {
      if (opcao === 1 || /portinhola/i.test(msg))
        dados.acesso_auxiliar = "portinhola";
      else if (opcao === 2 || /al[çc]ap[ãa]o/i.test(msg))
        dados.acesso_auxiliar = "alcapao";
      else if (opcao === 3 || ehNao(msg)) dados.acesso_auxiliar = "nao";
      else {
        respostas.push(CF_TEXTOS.acesso_auxiliar_opcao());
        break;
      }
      respostas.push(CF_TEXTOS.local_uso());
      etapa = "local_uso";
      break;
    }

    case "local_uso": {
      const mapa: Record<number, CFDados["local_uso"]> = {
        1: "loja",
        2: "garagem",
        3: "galpao",
        4: "condominio",
        5: "outro",
      };
      if (opcao && mapa[opcao]) dados.local_uso = mapa[opcao];
      else if (/loja/i.test(msg)) dados.local_uso = "loja";
      else if (/garagem|residen/i.test(msg)) dados.local_uso = "garagem";
      else if (/galp[ãa]o/i.test(msg)) dados.local_uso = "galpao";
      else if (/condom[íi]nio/i.test(msg)) dados.local_uso = "condominio";
      else if (msg.length > 0 && opcao === 5) dados.local_uso = "outro";
      else {
        respostas.push(CF_TEXTOS.local_uso());
        break;
      }
      respostas.push(CF_TEXTOS.dados_cliente());
      etapa = "dados_cliente";
      break;
    }

    case "dados_cliente": {
      // Tenta extrair campos do texto livre (formato chave: valor por linha)
      const linhas = msg.split(/\n+/);
      for (const ln of linhas) {
        const mm = ln.match(/^\s*([^:]+):\s*(.+?)\s*$/);
        if (!mm) continue;
        const k = mm[1].toLowerCase();
        const v = mm[2].trim();
        if (/nome/.test(k)) dados.nome = v;
        else if (/bairro|cidade/.test(k)) dados.bairro = v;
        else if (/medida/.test(k)) dados.medidas_aprox = v;
        else if (/telefone|contato|fone|whats/.test(k))
          dados.telefone_contato = v;
      }
      // Considera completo se tiver pelo menos nome + (telefone ou bairro)
      const completo = !!dados.nome && (!!dados.telefone_contato || !!dados.bairro);
      if (!completo && (input.fotosNovas?.length ?? 0) === 0) {
        respostas.push(
          `Faltou alguma informação. Por favor envie no formato:\n\n` +
            `Nome: ...\nBairro/cidade: ...\nMedida aproximada: ...\nTelefone para contato: ...`,
        );
        break;
      }
      respostas.push(CF_TEXTOS.analise_tecnica());
      respostas.push(CF_TEXTOS.prazo());
      etapa = "prazo";
      break;
    }

    case "prazo": {
      if (opcao === 1 || ehSim(msg)) {
        dados.urgencia = false;
        respostas.push(CF_TEXTOS.visita_tecnica());
        respostas.push(CF_TEXTOS.pagamento());
        etapa = "pagamento";
      } else if (opcao === 3 || ehUrgencia(msg)) {
        dados.urgencia = true;
        respostas.push(CF_TEXTOS.prazo_urgencia());
        respostas.push(CF_TEXTOS.pagamento());
        etapa = "pagamento";
      } else if (opcao === 2 || ehNao(msg)) {
        respostas.push(CF_TEXTOS.prazo_urgencia());
        respostas.push(CF_TEXTOS.pagamento());
        etapa = "pagamento";
      } else {
        respostas.push(CF_TEXTOS.prazo());
      }
      break;
    }

    case "pagamento": {
      if (opcao === 1 || /vista/i.test(msg)) dados.urgencia ??= false;
      const map: Record<number, string> = {
        1: "vista",
        2: "parcelado",
        3: "ambos",
      };
      if (opcao && map[opcao]) {
        // armazena no proprio dados via cf_pagamento_pref na conversa (caller persiste)
        (dados as any).pagamento_pref = map[opcao];
      } else {
        respostas.push(CF_TEXTOS.pagamento());
        break;
      }
      respostas.push(CF_TEXTOS.encerramento(dados.nome));
      etapa = "encerrado";
      break;
    }

    case "encerrado":
    default: {
      // Mensagem extra após encerramento: apenas confirma e mantém estado
      respostas.push(
        `Sua solicitação já está com nossa equipe ✅\n` +
          `Em breve um vendedor entrará em contato. Se precisar, digite *especialista*.`,
      );
      break;
    }
  }

  const { score, classificacao } = calcularScore(dados);
  return {
    respostas,
    proxima_etapa: etapa,
    dados,
    score,
    classificacao: etapa === "inicio" ? null : classificacao,
    encerrado: etapa === "encerrado",
  };
}

/** Mensagem oficial de recuperação automática conforme o estágio. */
export function mensagemRecuperacao(estagio: 1 | 2 | 3): string {
  if (estagio === 1) return CF_TEXTOS.recuperacao_24h();
  if (estagio === 2) return CF_TEXTOS.recuperacao_2d();
  return CF_TEXTOS.recuperacao_7d();
}
