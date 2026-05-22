ALTER TABLE public.leo_conversations
  ADD COLUMN IF NOT EXISTS pedido jsonb NOT NULL DEFAULT '{"itens":[],"total":0,"status":"em_andamento"}'::jsonb;

-- Migra carrinho legado para o novo modelo de pedido quando ainda estiver vazio
UPDATE public.leo_conversations
SET pedido = jsonb_build_object(
  'itens', COALESCE(carrinho, '[]'::jsonb),
  'total', 0,
  'status', 'em_andamento'
)
WHERE (pedido->'itens') = '[]'::jsonb
  AND carrinho IS NOT NULL
  AND jsonb_array_length(COALESCE(carrinho, '[]'::jsonb)) > 0;