# Refatoração modular do robô Leo

Hoje `supabase/functions/leo-webhook/index.ts` tem ~3.700 linhas com conversa, cálculo, regras e orçamento misturados. Vou quebrar em módulos com responsabilidades claras, **sem perder nenhuma regra já construída** e **sem alterar o comportamento externo** (mesmas mensagens, mesmo PDF, mesmo carrinho).

## Nova estrutura de arquivos

```text
supabase/functions/leo-webhook/
├── index.ts                      # orquestrador fino (~150 linhas)
├── modules/
│   ├── conversa.ts               # gera perguntas + resposta humanizada
│   ├── interpretador.ts          # LLM + fallback regex → intenções
│   ├── semantica.ts              # sinônimos, plural, intenção (cortada/inteira, sim/não, cores, etc.)
│   ├── carrinho.ts               # add/update/remove item, normalização
│   ├── estado.ts                 # etapa atual, campos preenchidos/faltantes, "perguntado"
│   ├── regras/
│   │   ├── instalacao.ts         # entre testeiras / vão+guia / vão+guias / paredes
│   │   ├── trava.ts
│   │   ├── guia.ts
│   │   ├── portinhola.ts
│   │   ├── lamina.ts             # lâmina principal + parcial transvision
│   │   ├── corte.ts              # medidas de corte
│   │   └── rolo.ts
│   ├── estrutural/
│   │   ├── peso.ts
│   │   ├── flecha.ts
│   │   ├── eixo.ts
│   │   └── motor.ts              # padrão +35%, grande +70%, faixas
│   ├── orcamento/
│   │   ├── explosao.ts           # kit → linhas de item
│   │   ├── precos.ts             # busca no estoque do dashboard
│   │   ├── pdf.ts                # PDFShift (já existe)
│   │   └── resumo.ts             # resumo parcial / final
│   └── parametros.ts             # banco central de regras (faixas motor, eixos, guias, lâminas, etc.)
└── shared/
    ├── tipos.ts                  # Pedido, Item, KitPortaConfig
    └── utils.ts                  # telefone, datas, normalizar texto
```

## Engine de estado (`modules/estado.ts`)

Estrutura única que evita perguntar duas vezes:

```ts
type EstadoItem = {
  etapa: 'medida'|'lamina'|'pintura'|'opcionais'|'motor'|'corte'|'instalacao'|'trava'|'final',
  preenchidos: Set<string>,   // ex: {'largura','altura','lamina.modelo','pintura'}
  perguntados: Set<string>,   // o que já foi questionado nesta conversa
  faltantes: string[]         // ordem oficial das próximas perguntas
}
```

Regras:
- Nunca repetir uma pergunta cujo campo já está em `preenchidos`.
- Toda interpretação que identifica um campo (cor, pintura, modelo, qtd, instalação, motor, portinhola, etc.) marca **automaticamente** `preenchidos` + remove de `faltantes`.
- A próxima pergunta vem de `faltantes[0]` — fonte única da verdade.

## Engine semântica (`modules/semantica.ts`)

Centraliza todos os dicionários hoje espalhados:
- sim/não, cortada/inteira, AC/DC, cores, instalação, modelos de lâmina.
- Funções `inferirBool`, `inferirCor`, `inferirModeloLamina`, `inferirInstalacao`, `inferirPortinholaCorte`, etc.
- Cada função retorna `T | undefined`. O interpretador chama essas funções antes de chamar o LLM para qualquer pergunta direta.

## Objeto do pedido (`shared/tipos.ts`)

Pedido vira objeto estruturado (não depende mais do histórico):

```ts
type Pedido = {
  tipo_atendimento: 'serralheiro'|'consumidor',
  itens: Item[],
  total: number,
  status: 'em_andamento'|'aguardando_confirmacao'|'finalizado',
  estado: Record<string /*itemId*/, EstadoItem>
}
```

Persistido em `leo_conversations.pedido` (coluna já existente).

## Banco de parâmetros (`modules/parametros.ts`)

Tudo que hoje é número mágico no código vira tabela:

```ts
export const PARAMETROS = {
  motor: {
    folga_porta_padrao: 0.35,
    folga_porta_grande: 0.70,
    porta_grande: { largura_min: 9, altura_min: 4 },
    faixas: [
      { ate_kg: 200, modelo: 'AC 200' },
      { ate_kg: 300, modelo: 'AC 300' },
      { ate_kg: 400, modelo: 'AC 400' },
      { ate_kg: 500, modelo: 'AC 500' },
      { ate_kg: Infinity, modelo: 'AC 800' },
    ]
  },
  eixo: { /* faixas peso → polegadas */ },
  guia: { /* mm padrão por altura */ },
  instalacao: {
    entre_testeiras:   { desconto_largura: 0.02, desconto_com_trava: 0.03 },
    vao_uma_guia:      { /* ... */ },
    vao_duas_guias:    { /* ... */ },
    entre_paredes:     { /* ... */ },
  },
  lamina: {
    transvision: { altura_lamina: 0.085 },
    fechada:     { /* ... */ },
    oblongo:     { /* ... */ },
  },
  pintura: { m2_min: 0 },
  descontos: { /* placeholder, cliente envia tabela depois */ }
}
```

Qualquer mudança de regra de negócio passa a ser **uma linha de dados**, não mexe lógica.

## Performance

- Cálculo estrutural roda apenas quando muda um campo que afeta peso/motor/eixo (largura, altura, lâmina, pintura, opcionais). Cache por `hash(config_estrutural)` no próprio item.
- Explosão do kit só recalcula o item alterado, não o pedido inteiro.
- Busca de preço em lote (`in('sku', skus)`) por pedido, não por linha.

## Orquestrador (`index.ts` novo, ~150 linhas)

```ts
serve(async (req) => {
  const { mensagem, telefone } = await req.json()
  const conversa = await carregarConversa(telefone)
  const pedido = conversa.pedido

  // 1. interpretar
  const intencoes = await interpretador.interpretar(mensagem, pedido)

  // 2. aplicar no carrinho (com regras + semântica)
  carrinho.aplicar(pedido, intencoes)

  // 3. atualizar estado de cada item
  estado.recomputar(pedido)

  // 4. estrutural só onde mudou
  estrutural.recalcularSeNecessario(pedido)

  // 5. próxima pergunta + resposta
  const pergunta = conversa.proximaPergunta(pedido)
  const resposta = await conversa.gerarResposta(pedido, pergunta)

  await salvarConversa(telefone, pedido)
  return new Response(JSON.stringify({ resposta }), { headers: corsHeaders })
})
```

## Estratégia de migração (incremental, sem quebrar nada)

1. **Fase 1 — extrair sem mudar comportamento**
   - Criar `shared/tipos.ts`, `modules/parametros.ts`, `modules/semantica.ts`.
   - Mover dicionários e constantes existentes pra esses arquivos. `index.ts` importa de lá.
   - Deploy + smoke test (mensagens já testadas continuam respondendo igual).

2. **Fase 2 — regras técnicas**
   - Mover `calcRolo`, `calcLaminas`, `calcGuiasML`, regras de instalação/trava/portinhola/corte pra `modules/regras/*`.
   - Mover `validarMotor`, peso, flecha, eixo pra `modules/estrutural/*`.
   - `index.ts` continua chamando, só muda o caminho do import.

3. **Fase 3 — estado + conversa**
   - Criar `modules/estado.ts` com `EstadoItem` e migrar a lógica atual de `cfgItemIncompleto`/`cfgProximaPergunta` pra lá.
   - Criar `modules/conversa.ts` absorvendo geração de pergunta + resposta humanizada.
   - Garantir que `perguntados` persiste no `pedido` (evita loop de re-pergunta).

4. **Fase 4 — carrinho + orçamento**
   - Mover add/update/remove + normalização (`normalizarKitConfig`) pra `modules/carrinho.ts`.
   - Mover explosão de kit, preços, PDF e resumo pra `modules/orcamento/*`.

5. **Fase 5 — orquestrador final**
   - Reescrever `index.ts` no formato fino acima.
   - Apagar código morto da máquina de estados antiga por `etapa_fluxo`.

Cada fase é deploy independente. Em qualquer ponto dá pra parar e o robô continua funcionando.

## Detalhes técnicos importantes

- Deno suporta imports relativos entre arquivos da mesma função — não precisa de import map.
- `supabase/config.toml`: nenhum bloco novo necessário (a função já roda com config padrão).
- Coluna `pedido jsonb` em `leo_conversations` já existe (do plano anterior). Só vou adicionar `estado` dentro dela — sem migration nova.
- Mantém integrações: PrimeSync, PDFShift, estoque, funil, validação serralheiro, busca cliente.
- Mantém todas as regras já validadas (transvision parcial, portinhola cortada/inteira, pintura branca ≠ eletrostática, opcionais, motor +35/+70%, etc.).

## O que **não** entra agora

- Tabela de descontos parceiro vs padrão (aguardando percentuais do cliente).
- Edição de orçamento já gerado em conversas antigas.
- UI no dashboard pra editar `parametros.ts` (fica em código por enquanto; quando estabilizar viramos tabela no Supabase).

## Confirmação

Posso seguir e começar pela **Fase 1** (extração de tipos, parâmetros e semântica sem mudar comportamento)?
