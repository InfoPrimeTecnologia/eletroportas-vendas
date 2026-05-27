# Módulo Consumidor Final — Leo

## Objetivo
Criar um fluxo paralelo ao do Serralheiro, com linguagem simples, sem termos técnicos (VILD, eixo, guia, rolo, testeiras), opções numeradas e uma pergunta por vez. O robô coleta, qualifica e encaminha — o vendedor humano fecha.

## Onde mexer
- `supabase/functions/leo-webhook/index.ts` — roteamento por `tipo_cliente = 'consumidor_final'`
- `supabase/functions/leo-webhook/modules/parametros.ts` — textos oficiais do fluxo CF
- Novo módulo `supabase/functions/leo-webhook/modules/fluxoConsumidorFinal.ts` — máquina de estados do CF
- Migração: adicionar colunas em `leo_conversations`:
  - `cf_etapa` (text) — etapa atual no fluxo CF
  - `cf_dados` (jsonb) — modelo, pintura, cor, motor, acesso_secundario, local_uso, nome, bairro, medidas_aprox, telefone_contato, fotos[]
  - `cf_score` (int) — pontuação lead
  - `cf_classificacao` (text) — frio/morno/quente
  - `cf_ultima_interacao` (timestamptz) — para recuperação automática
  - `cf_recuperacao_estagio` (int) — 0/24h/2d/7d
  - `cf_prazo_resposta` (text), `cf_visita_solicitada` (bool), `cf_pagamento_pref` (text)

## Máquina de estados (CF)
```text
inicio
 → orcamento_rapido | falar_especialista
modelo_porta (Fechada/Transvision/Oblongo)
pintura (Sim/Não/Indeciso) → cor (se sim)
motor (Padrão AC 220V / Nobreak / Especialista)
acesso_secundario (Sim/Não)
  se Não → oferecer Portinhola/Alçapão/Nenhum
local_uso (Loja/Garagem/Galpão/Condomínio/Outro)
dados_cliente (Nome, Bairro, Medida, Telefone, Fotos)
analise_tecnica (mensagem de encerramento — técnico humano define instalação)
prazo (15 dias padrão / urgência)
visita_tecnica (informativa)
pagamento (à vista/parcelado/ambos)
encerramento + classificação lead
```

## Regras chave
- Detecção do perfil "consumidor final" já entra direto neste fluxo, sem perguntar AC/DC, VILD, perfil, eixo, guia.
- Motor padrão é AC 220V (assumido). Só pergunta se quer nobreak.
- Tipo de instalação NÃO é definido pelo robô — só técnico humano via dashboard.
- Sempre opções numeradas (1️⃣ 2️⃣ 3️⃣), uma pergunta por vez.
- Aceita fotos (anexos no WhatsApp) — armazena URLs em `cf_dados.fotos[]`.

## Scoring de lead
Função `calcularScoreCF(cf_dados, comportamento)`:
- medidas: +1
- fotos (≥1): +2
- deseja instalação: +2
- urgência: +2
- resposta rápida (<5min entre msgs): +1

Classificação: 0–2 frio, 3–5 morno, 6+ quente. Salvar em `cf_classificacao` e expor no funil (`funil_leads`).

## Recuperação automática
Cron-like via uma função separada `leo-recuperacao` (nova edge function) chamada por um cron job externo OU via verificação no próprio webhook a cada mensagem (varre conversas paradas). Estágios:
- 24h sem resposta antes do orçamento → msg 1
- 2 dias após orçamento enviado → msg 2
- 7 dias → msg 3

Para esta iteração, criar apenas a edge function `leo-recuperacao-cf` (chamada manual / cron futuro) e os textos. Não agendar cron ainda.

## Não-objetivos (fora desta entrega)
- Integração com gateway WhatsApp para upload real de imagem (assume URLs já entregues pelo webhook)
- Tela admin para o técnico liberar tipo de instalação (próxima entrega)
- Cron job automatizado de recuperação (criar só a função, agendamento depois)

## Detalhes técnicos
- Detecção de perfil consumidor final: se `tipo_cliente = 'consumidor_final'` OU mensagem inicial contém termos típicos ("minha casa", "minha loja", "para mim"), roteia para `rodarFluxoConsumidorFinal()` antes de cair no configurador técnico.
- Cada etapa retorna `{ resposta, proxima_etapa, dados_atualizados }`.
- Parser contextual: igual ao do serralheiro, respeita `cf_etapa` ativa — número "1" só significa "opção 1 da pergunta atual".
- Auditoria: reusar `logAuditoriaOperacional` com `contexto_ativo = 'consumidor_final'`.

## Validação
- Testar via `supabase--curl_edge_functions` com payload simulando WhatsApp para cada etapa.
- Conferir logs `LEO_AUDIT` mostrando etapa correta a cada passo.
- Verificar coluna `cf_classificacao` populada ao fim do fluxo.
