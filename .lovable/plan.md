# Reestruturação do Leo conforme spec do cliente

Vou reorganizar o `supabase/functions/leo-webhook/index.ts` para seguir os 8 módulos enviados pelo cliente, preservando integrações já existentes (estoque real do dashboard, PrimeSync, PDF, funil, validação serralheiro).

## Arquitetura

Em vez de deixar tudo solto no system prompt, vou criar uma **máquina de estados de conversa** baseada em `leo_conversations.etapa_fluxo` (nova coluna) + carrinho persistido em `leo_conversations.carrinho` (jsonb). O LLM continua interpretando texto livre, mas o fluxo de etapas é determinístico.

### Nova coluna em `leo_conversations`
- `etapa_fluxo` text — `entrada | menu_tecnico | motores | guias | laminas | kit_porta | finalizar | aguarda_formato`
- `carrinho` jsonb default `'[]'` — itens acumulados antes de virar orçamento
- `pre_cadastro` boolean default false — serralheiro sem cadastro aprovado

## Módulos implementados

### M1 — Entrada e validação do serralheiro
- Primeira mensagem → menu "1. Consumidor final / 2. Serralheiro".
- Se 2 → pedir telefone com DDD → buscar em `Clientes` (CLI_FONE normalizado).
- Cadastrado → libera menu técnico, marca `tipo_cliente=revenda`.
- Não cadastrado → pede Nome/Empresa + Cidade + Telefone, cria pré-cadastro em `Clientes` com `tipo_cliente='pre_cadastro'`, **não bloqueia**, segue para menu técnico marcando `pre_cadastro=true`. Tabela padrão será usada e orçamento sai com "sujeito à aprovação" no rodapé.
- Consumidor final segue fluxo atual (kit porta com instalação).

### M2 — Menu técnico
Após validação envia:
```
1. Kit porta de enrolar
2. Peças avulsas
3. Motores
4. Acessórios
```
Interpretação por texto livre via LLM com classificador de intenção (`quero motor` → motores, `guia` → peças, etc). Carrinho persistente; ao terminar cada item volta ao menu.

### M3 — Motores
- Tipos: avulso / motor+testeiras / kit automatizador.
- AC: 200/300/400/500/800/1000/1500 kg; DC: 200/300/400/500/800 kg.
- LLM extrai `{quantidade, tipo, ac_dc, potencia}`. Se faltar AC/DC ou potência ou tipo → pergunta específica. Busca preço em `estoque` por SKU/nome match (já temos `pontuarEstoqueParaPeca`). Adiciona ao carrinho e mostra resumo.

### M4.1 — Guias (peças avulsas, prioridade)
- Modelos: 50/60/70/80/90/100 mm. Venda por metro linear.
- LLM extrai `{quantidade, par?, mm, comprimento_m}`.
- Cálculo: `total_ml = quantidade * (par ? 2 : 1) * comprimento_m`.
- Busca `GUIA LATERAL {mm}MM` no estoque. Adiciona ao carrinho com qty em metros.
- (Lâminas/eixo/soleira/PVC/borracha ficam stub com comentário "M4.2+ pendente" para próxima iteração — cliente listou ordem mas só detalhou guias.)

### M5 — Kit porta de enrolar
- Pede medida `Largura x (Altura + Rolo)`. Se não vier rolo: eixo 4.5"/5" → 0,60; maior → 0,75.
- Pergunta config livre (automática/manual, pintura, cor, portinhola, alçapão, lâmina, motor).
- Modelos lâmina: meia cana lisa/perfurada, transvision, lisa reta. Perfis baixo/alto.
- Cálculo lâminas: altura_total ÷ (0,075 baixo | 0,085 alto), ceil.
- Portinhola: VILD/VILE/Centro, medida padrão (não perguntar).
- Alçapão: emergencial, **mutuamente exclusivo com portinhola** (validação).
- Motor: reaproveita M3.
- Pintura eletrostática + cor.
- Gera resumo técnico e adiciona ao carrinho.

### M6 — Orçamento automático
- Antes de finalizar **sempre** pergunta: "👉 Deseja acrescentar mais algum item ao pedido?"
- Se sim → volta ao menu técnico mantendo carrinho.
- Se não → consolida itens, busca preços, calcula subtotais e total, mostra resumo em texto e pergunta formato:
  ```
  1. PDF  2. Imagem  3. Ambos
  ```

### M7 — PDF e Imagem
- PDF já existe via PDFShift. Vou manter, adicionando:
  - Cabeçalho com logo+nome+telefone
  - Resumo técnico (medidas, config) quando houver kit porta
  - Rodapé: validade (7 dias), forma de pagamento, entrega, "Orçamento sujeito à aprovação" se `pre_cadastro=true`
- Imagem: gerar PNG via screenshot do mesmo HTML (PDFShift suporta `format=jpg`). Adicionar opção "imagem" e "ambos".

### M8 — Regras industriais (helpers puros)
Funções utilitárias isoladas em um bloco `// === REGRAS INDUSTRIAIS ===`:
- `calcRolo(eixoPolegadas)`
- `calcLaminas(alturaTotal, perfil)`
- `calcGuiasMetrosLineares(qtd, par, comprimento)`
- `validarMotor({tipo, ac_dc, potencia})`
- `validarPortinholaAlcapao(config)`

Essas funções são chamadas pelo orquestrador, não pelo LLM, garantindo cálculo correto.

## Mudanças técnicas resumidas

```text
supabase/functions/leo-webhook/index.ts
├── + REGRAS INDUSTRIAIS (M8)        helpers puros de cálculo
├── + máquina de estados              etapa_fluxo + carrinho
├── ~ system prompt                   reescrito com fluxo dos módulos
├── + handler menu inicial (M1)       consumidor/serralheiro + validação telefone
├── + handler pré-cadastro            cria Cliente sem bloquear
├── + handler menu técnico (M2)       roteamento por intenção
├── + handler motores (M3)            extração estruturada + preço
├── + handler guias (M4.1)            cálculo ml + preço
├── + handler kit porta (M5)          medidas + config + cálculos M8
├── + handler finalização (M6)        "mais algum item?" + formato
└── ~ gerador PDF                     cabeçalho/rodapé novos + imagem JPG

migration:
ALTER TABLE leo_conversations
  ADD COLUMN etapa_fluxo text DEFAULT 'entrada',
  ADD COLUMN carrinho jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN pre_cadastro boolean NOT NULL DEFAULT false;
```

## O que **não** entra nesta entrega
- Lâminas/eixo/soleira/PVC/borracha avulsos (M4.2 em diante) — cliente só detalhou guias; deixo stubs prontos para o próximo módulo que ele mandar.
- Tabela de parceiro vs padrão com desconto — cliente ainda não enviou os percentuais; uso preço único de `estoque` e marco "sujeito à aprovação" no pré-cadastro.
- Reaproveitar/editar orçamento existente (M7 último bullet) — fica para próxima iteração.

## Confirmações antes de implementar
1. Posso adicionar as 3 colunas em `leo_conversations` (migração)?
2. Imagem do orçamento via PDFShift como JPG do mesmo template está OK, ou prefere layout dedicado para WhatsApp (quadrado, destaque do total)?
3. Para pré-cadastro de serralheiro, posso gravar direto em `Clientes` com `tipo_cliente='pre_cadastro'` e disparar notificação ao admin (já existe `validar-serralheiro`)?