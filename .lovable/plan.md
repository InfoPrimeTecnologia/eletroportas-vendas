# Leo 2.0 — Configurador técnico de orçamento

Hoje o `leo-webhook` funciona como chatbot sequencial pesado (3.449 linhas, máquina de estados por `etapa_fluxo`). Vou substituir a engine por uma arquitetura **carrinho-first + LLM interpretador + comandos**, mantendo todas as integrações que já funcionam (estoque do dashboard, PDF, funil, PrimeSync, validação serralheiro).

## Princípio central

O LLM **não conduz** a conversa. Ele apenas **interpreta** cada mensagem do cliente e devolve um JSON estruturado de intenções/alterações. O código aplica as mudanças no carrinho, calcula preço, e responde com resumo parcial + pergunta apenas do que falta.

## Novo modelo de dados (carrinho na sessão)

Adicionar coluna `pedido jsonb` em `leo_conversations` (mantém `carrinho` legado por compatibilidade durante migração). Estrutura:

```json
{
  "tipo_atendimento": "serralheiro | consumidor",
  "itens": [
    {
      "id": "uuid",
      "tipo": "kit_porta | motor | guia | lamina | controle | central | acessorio",
      "config": {
        "largura": 3.0, "altura": 4.0, "instalacao": "entre_paredes|sobreposta",
        "motor": {"ac_dc": "AC", "potencia": 300},
        "lamina": {"modelo": "meia_cana", "perfil": "baixo", "cor": "branca"},
        "guia_mm": 50, "portinhola": "VILD", "alcapao": false,
        "pintura": "eletrostatica", "central": true, "controles": 1
      },
      "explosao": [
        {"sku":"...", "descricao":"Lâmina meia cana baixa branca", "und":"un", "qtd": 54, "valor_unit": 18.5, "total": 999}
      ],
      "subtotal": 0
    }
  ],
  "total": 0,
  "status": "em_andamento | aguardando_confirmacao | finalizado"
}
```

## Arquitetura de processamento (a cada mensagem)

```text
mensagem do cliente
   │
   ▼
┌─────────────────────────────────────────────┐
│ 1. INTERPRETADOR (LLM, JSON-only)           │
│    input: mensagem + pedido atual           │
│    output: { intencoes: [...] }             │
│      - add_item {tipo, config_parcial}      │
│      - update_item {id|ultimo, patch}       │
│      - remove_item {id|descricao}           │
│      - set_quantidade {item, qtd}           │
│      - trocar {campo, valor}                │
│      - gerar_orcamento                      │
│      - escolher_menu {1|2|3|4}              │
│      - duvida_livre {texto}                 │
└─────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────┐
│ 2. APLICADOR (código puro, determinístico)  │
│    - aplica intenções no carrinho           │
│    - chama regras industriais (M8 atuais):  │
│      calcRolo, calcLaminas, calcGuiasML,    │
│      validarMotor, validarPortinholaAlcapao │
│    - explode kit em itens (lâmina, guia,    │
│      eixo, soleira, motor, central, etc.)   │
│    - busca preço no estoque do dashboard    │
│    - recalcula subtotais e total            │
└─────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────┐
│ 3. PRÓXIMA PERGUNTA (código)                │
│    olha config de cada item e detecta       │
│    o PRIMEIRO campo obrigatório faltando.   │
│    Se nada falta → "Deseja acrescentar      │
│    mais algum item ou gerar orçamento?"     │
└─────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────┐
│ 4. RESPOSTA (LLM curto, humanizado)         │
│    recebe: resumo parcial estruturado +     │
│    próxima pergunta. Gera texto natural     │
│    com o resumo numerado e a pergunta.      │
└─────────────────────────────────────────────┘
```

## Itens explodidos no orçamento

Quando o cliente confirma um **kit porta**, o aplicador gera automaticamente as linhas:

| Item | Origem |
|---|---|
| Lâmina (modelo + perfil + cor) | `calcLaminas(altura+rolo, perfil)` × largura |
| Guia lateral (par, mm) | `calcGuiasML(2, largura, altura)` |
| Eixo (polegadas) | regra peso → escolhe 4.5"/5"/6" |
| Soleira | largura |
| Motor (AC/DC, potência) | `validarMotor` |
| Central de controle | 1 (default, removível) |
| Controles | qty configurável |
| Portinhola VILD/VILE/Centro | se solicitado |
| Alçapão | mutuamente exclusivo com portinhola |
| Pintura eletrostática | se solicitada, por m² |
| Trava-lâmina | acessório opcional |

Cada linha tem `sku, descricao, und, qtd, valor_unit, total` lida do `estoque` (Lovable Cloud). Itens sem preço entram com `"sob consulta"` e marcam o orçamento como **pendente de aprovação**.

## Comandos suportados (parser via LLM com schema)

- `adicionar X` / `+ X`
- `remover X` / `tirar X` / `retirar X`
- `trocar X por Y` / `mudar X para Y`
- `colocar pintura preta` / `cor branca`
- `quantidade N` / `N controles`
- `gerar orçamento` / `fechar pedido` / `finalizar`
- `resumo` / `ver pedido`
- `zerar` / `recomeçar`

## Fluxo do exemplo do cliente

Cliente: `"3x4 entre paredes AC meia cana branca portinhola VILD"`

1. Interpretador → `[{add_item, tipo:kit_porta, config:{largura:3, altura:4, instalacao:entre_paredes, motor:{ac_dc:AC}, lamina:{modelo:meia_cana, cor:branca}, portinhola:VILD}}]`
2. Aplicador → cria item, falta: `motor.potencia`, `lamina.perfil`, `guia_mm`
3. Próxima pergunta → "Para fechar a potência do motor, a porta é até quantos kg ou quer que eu sugira pela medida?"
4. Resposta com resumo parcial numerado.

Cliente: `"+ 2 controles e trocar guia para 70"` → aplica `add_item(controle, 2)` + `update_item(kit, guia_mm=70)` → recalcula.

Cliente: `"gerar orçamento"` → consolida, gera PDF/Imagem.

## Mudanças no arquivo

```text
supabase/functions/leo-webhook/index.ts (reescrita parcial)
├── manter: integrações (PrimeSync, PDFShift, estoque do dashboard,
│   busca cliente, funil, validação serralheiro, helpers de telefone)
├── manter: regras industriais M8 (calcRolo, calcLaminas, etc.)
├── REMOVER: máquina de estados por etapa_fluxo (motores/guias/kit_porta separados)
├── NOVO: interpretarMensagem(mensagem, pedido) → intenções JSON
├── NOVO: aplicarIntencoes(pedido, intencoes) → pedido atualizado
├── NOVO: explodirKitPorta(config) → linhas de orçamento
├── NOVO: detectarProximaPergunta(pedido) → string|null
├── NOVO: gerarResposta(pedido, proximaPergunta) → texto humanizado
└── SIMPLIFICAR: orquestrador principal vira ~80 linhas
```

Migração:
```sql
ALTER TABLE leo_conversations
  ADD COLUMN pedido jsonb NOT NULL DEFAULT '{"itens":[],"total":0,"status":"em_andamento"}'::jsonb;
```

## Compatibilidade

- Conversas em andamento com `carrinho` legado: migração faz `pedido = jsonb_build_object('itens', carrinho, ...)` quando carrinho não vazio.
- Menu guiado (1/2/3/4) continua funcionando — vira um `escolher_menu` que pré-popula `tipo` do próximo item esperado.
- PDF/imagem do M7 atual permanecem; só muda a fonte de itens (agora vem da explosão estruturada).

## O que **não** entra nesta entrega

- Tabela de descontos parceiro vs padrão (cliente ainda não enviou percentuais)
- Reaproveitar/editar orçamento já gerado em conversas antigas
- Cálculo automático de peso/eixo por modelo de lâmina específico (fica regra simplificada por faixa de altura até cliente enviar a tabela)

## Confirmações antes de implementar

1. Posso adicionar a coluna `pedido jsonb` e migrar `carrinho` existente?
2. Para itens sem preço no estoque, prefere (a) bloquear e perguntar, ou (b) gerar com "sob consulta" + aviso? *(plano assume b)*
3. O fluxo de **consumidor final** (com instalação/CEP/frete) que existe hoje deve continuar igual ou também vira configurador livre? *(plano mantém serralheiro como foco; consumidor final segue fluxo atual até segunda ordem)*
