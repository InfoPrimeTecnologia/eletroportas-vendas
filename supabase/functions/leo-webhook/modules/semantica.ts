// Engine semântica do Leo: interpretação de sinônimos, plural,
// intenção. Funções determinísticas (sem LLM) que retornam o valor
// inferido ou `null`/`undefined` quando não há match confiável.
//
// Extraídas de index.ts (Fase 1 da refatoração modular).

function norm(t: string): string {
  return (t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function inferirTipoClienteTexto(
  texto: string,
): "porta_instalada" | "revenda" | null {
  const t = norm(texto);
  if (
    /\b(serralheiro|serralheria|revenda|revender|revendedor|fornecimento|sem instalacao)\b/.test(
      t,
    )
  )
    return "revenda";
  if (
    /\b(cliente\s*final|consumidor\s*final|consumidor|instalada|instalar|instalacao|com instalacao|porta instalada)\b/.test(
      t,
    )
  )
    return "porta_instalada";
  return null;
}

export function inferirMedidasTexto(
  texto: string,
): { largura: number; altura: number } | null {
  const t = (texto || "").toLowerCase().replace(/,/g, ".");
  const match = t.match(
    /(\d+(?:\.\d+)?)\s*(?:x|×|por|\/|-)\s*(\d+(?:\.\d+)?)/i,
  );
  if (!match) return null;
  const largura = Number(match[1]);
  const altura = Number(match[2]);
  if (
    !Number.isFinite(largura) ||
    !Number.isFinite(altura) ||
    largura <= 0 ||
    altura <= 0 ||
    largura > 20 ||
    altura > 20
  )
    return null;
  return { largura, altura };
}

export function inferirLaminaTexto(
  texto: string,
): "fechado" | "transvision" | "oblongo" | null {
  const t = norm(texto).trim();
  if (!t) return null;
  if (/\b(tradicional|convencional|padrao|padr[aã]o)\b/.test(t)) return null;
  if (/(^|\s)(1|fechad\w*|lis[ao]|meia\s*cana)(\s|$|[.,!?])/.test(t))
    return "fechado";
  if (/(^|\s)(2|transv\w*|visor\w*|visao|visores)(\s|$|[.,!?])/.test(t))
    return "transvision";
  if (
    /(^|\s)(3|oblong\w*|oblog\w*|perfurad\w*|perfurac\w*)(\s|$|[.,!?])/.test(t)
  )
    return "oblongo";
  return null;
}

export function inferirAdicionaisTexto(
  texto: string,
  permitirNegacaoGenerica = false,
): { portinhola: boolean; alcapao: boolean } | null {
  const t = norm(texto);
  if (!t.trim()) return null;

  const negacaoExplicita =
    /\b(nenhum|nenhuma)\b/.test(t) ||
    /\b(sem|nao quero|não quero|dispenso|dispensar)\b.*\b(portinhola|alcapao|alcapão|alcapa|adicionais?)\b/.test(
      t,
    );
  const negacaoGenerica =
    permitirNegacaoGenerica &&
    /\b(nao|não|sem|dispenso|dispensa|obrigado|obrigada)\b/.test(t);
  const querNenhum =
    (negacaoExplicita || negacaoGenerica) &&
    !/\b(portinhola|alcapao|alcapão|alcapa|os dois|ambos|duas|dois)\b/.test(t);
  if (querNenhum) return { portinhola: false, alcapao: false };

  const ambos = /\b(os dois|ambos|duas|dois|todos|todas)\b/.test(t);
  const negaPortinhola =
    /\b(sem|nao|dispenso|recuso)\s+(a\s+)?portinhola\b/.test(t);
  const negaAlcapao =
    /\b(sem|nao|dispenso|recuso)\s+(o\s+)?(alcapao|alcapa)\b/.test(t);
  const portinhola =
    (ambos || /\b(portinhola|porta de acesso)\b/.test(t)) && !negaPortinhola;
  const alcapao = (ambos || /\b(alcapao|alcapa)\b/.test(t)) && !negaAlcapao;

  if (portinhola || alcapao) return { portinhola, alcapao };
  return null;
}

export function inferirPinturaTexto(
  texto: string,
): { quer_pintura: boolean; tipo_pintura?: string } | null {
  const t = norm(texto);
  if (!t.trim()) return null;
  if (
    /\b(ainda\s+nao\s+sei|ainda\s+não\s+sei|nao\s+sei\s+a\s+cor|não\s+sei\s+a\s+cor|depois\s+vejo\s+a\s+cor|cor\s+depois|deixo\s+a\s+cor\s+pra\s+depois)\b/.test(
      t,
    )
  ) {
    return { quer_pintura: true };
  }
  const negacaoPintura =
    /\b(nao|sem pintura|sem pint|sem cor|sem tinta|nao quero|nao precisa|nao precis|dispens|negativo|nada|natural|galvanizad[ao]|cru|sem acabamento|nenhuma|nenhum)\b/;
  const afirmacaoPintura =
    /\b(sim|quero|pode|incluir|coloca|pinta|pintad[ao])\b/;
  if (negacaoPintura.test(t) && !afirmacaoPintura.test(t)) {
    return { quer_pintura: false };
  }
  if (/\bbranc(o|a)\b/.test(t))
    return { quer_pintura: true, tipo_pintura: "branco_liso" };
  if (/\bpret(o|a)\b/.test(t))
    return { quer_pintura: true, tipo_pintura: "preta_fosco" };
  if (/\bcinza\b/.test(t))
    return { quer_pintura: true, tipo_pintura: "cinza_texturizado" };
  if (/\b(especial|ral)\b/.test(t))
    return { quer_pintura: true, tipo_pintura: "cor_especial" };
  if (afirmacaoPintura.test(t) && !/\bnao\b/.test(t)) {
    return { quer_pintura: true };
  }
  return null;
}

export function inferirCepTexto(texto: string): string | null {
  const match = (texto || "").match(/\b\d{5}-?\d{3}\b/);
  return match ? match[0].replace(/\D/g, "") : null;
}

export function inferirEntregaTexto(
  texto: string,
): { quer_entrega: boolean } | null {
  const t = norm(texto);
  if (!t.trim()) return null;
  if (
    /\b(retirar|retiro|retirada|busc(o|ar|amos)|pego|pegar|vou\s+ai|vou\s+pegar|passo\s+(ai|la|para)\s+(pegar|buscar)|na\s+loja|no\s+local\s+de\s+voces|prefiro\s+(retirar|buscar|pegar)|sem\s+entrega|nao\s+precisa\s+entreg)\b/.test(
      t,
    )
  ) {
    return { quer_entrega: false };
  }
  if (
    /\b(entreg(a|ar|am|uem|ue|uar)|pode\s+entregar|quero\s+entrega|me\s+entreguem|enviem|envio|mandem|manda(r)?|frete|deliver(y)?)\b/.test(
      t,
    )
  ) {
    return { quer_entrega: true };
  }
  return null;
}

export function inferirPecasAvulsasTexto(texto: string): any[] {
  let entrada = norm(texto);
  if (!entrada.trim()) return [];
  if (/\b(cpf|cnpj|rg|inscricao|inscrição)\b/.test(entrada)) return [];
  entrada = entrada.replace(/\b\d{11,}\b/g, " ");
  const numerosExtenso: Record<string, string> = {
    uma: "1",
    um: "1",
    duas: "2",
    dois: "2",
    tres: "3",
    quatro: "4",
    cinco: "5",
    seis: "6",
    sete: "7",
    oito: "8",
    nove: "9",
    dez: "10",
  };
  entrada = entrada.replace(
    /\b(uma|um|duas|dois|tres|quatro|cinco|seis|sete|oito|nove|dez)\b/g,
    (m) => numerosExtenso[m] || m,
  );
  const partes = entrada
    .split(/(?:,|;|\s+e\s+|\s*\+\s*|\n)/)
    .map((p) => p.trim())
    .filter(Boolean);
  const itens: any[] = [];
  const PRODUTOS_VALIDOS =
    /\b(motor|automatizador|controle|central|guia|lamina|lâmina|portinhola|alcapao|alçapão|fechadura|trava|eixo|mola|cabo|kit|porta)\b/;
  for (const parte of partes) {
    const inicio = parte.match(
      /(?:^|\b)(\d{1,4}(?:[,.]\d+)?)\s*(?:x\s*|un\s*|unidades?\s*|pcs?\s*)?(.+?)\s*$/i,
    );
    const fim = inicio
      ? null
      : parte.match(
          /(.+?)\s+(\d{1,4}(?:[,.]\d+)?)\s*(?:un|unidades?|pcs?)?\s*$/i,
        );
    if (!inicio && !fim) continue;
    const quantidade = Number(
      String(inicio ? inicio[1] : fim?.[2]).replace(",", "."),
    );
    let nome = String(inicio ? inicio[2] : fim?.[1] || "")
      .replace(/\b(de|da|do|para|com|tipo|modelo)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    nome = nome.replace(/^(m|mt|metro|metros)\s+/g, "").trim();
    nome = nome
      .replace(/\bmotores\b/g, "motor")
      .replace(/\bcontroles\b/g, "controle")
      .replace(/\bcentrais\b/g, "central")
      .replace(/\bguias\b/g, "guia");
    nome = nome.replace(
      /\b(motor|automatizador)\s+(\d{2,4})(?!\s*kg)\b/g,
      "$1 $2kg",
    );
    if (!Number.isFinite(quantidade) || quantidade <= 0 || quantidade > 9999)
      continue;
    if (nome.length < 3) continue;
    if (!PRODUTOS_VALIDOS.test(nome)) continue;
    itens.push({ produto_nome: nome, quantidade });
  }
  return itens;
}

export function inferirSubtipoRevendaTexto(
  texto: string,
): "kit" | "pecas" | null {
  const t = norm(texto);
  if (!t.trim()) return null;
  if (inferirMedidasTexto(texto) && /\b(porta|kit|lamina|lâmina)\b/.test(t))
    return "kit";
  if (
    /\b(kit|porta\s*completa|porta\s*inteira|kit\s*completo|completo|porta\s*toda)\b/.test(
      t,
    )
  )
    return "kit";
  if (
    /\b(pec[aá]s?\s*avuls(a|as)|avuls(a|as|o)|somente\s*pec|so\s*pec|apenas\s*pec|peca|pecas|pe[cç]a)\b/.test(
      t,
    )
  )
    return "pecas";
  if (
    inferirPecasAvulsasTexto(texto).length > 0 &&
    !/\b(kit|porta\s*completa|porta\s*inteira|kit\s*completo|completo|porta\s*toda)\b/.test(
      t,
    )
  )
    return "pecas";
  return null;
}

export function inferirRespostaPortinholaCorte(
  textoNormalizado: string,
): boolean | undefined {
  const t = String(textoNormalizado || "").trim();
  if (!t) return undefined;
  if (
    /\b(sem\s+cortar|inteiras?|ajuste\s+local|ajustar\s+no\s+local)\b/.test(t)
  )
    return false;
  if (/\b(cortadas?|ja\s+cortadas?|prontas?|cortar|corta)\b/.test(t))
    return true;
  return undefined;
}
