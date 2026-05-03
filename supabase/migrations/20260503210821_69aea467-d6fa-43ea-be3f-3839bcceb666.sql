
-- 1) Seed estoque com todos os itens que podem compor um orçamento
INSERT INTO public.estoque (codigo_sku, produto_nome, descricao, tipo_laminas, unidade_medida, quantidade, quantidade_minima, preco_venda, preco_custo)
VALUES
  ('COMP-001', 'PERFIL BX FECHADO - CHAPA 22 (0,75)', 'Perfil de lâmina fechada', 'fechado', 'M²', 100, 5, 295.00, 0),
  ('COMP-001-T', 'PERFIL BX TRANSVISION - CHAPA 22 (0,75)', 'Perfil de lâmina transvision', 'transvision', 'M²', 100, 5, 315.00, 0),
  ('COMP-001-O', 'PERFIL BX OBLONGO - CHAPA 22 (0,75)', 'Perfil de lâmina oblongo', 'oblongo', 'M²', 100, 5, 340.00, 0),
  ('COMP-002', 'EIXO TUBO 4.5" - AÇO CARBONO', 'Eixo principal', 'N/A', 'MT', 100, 5, 185.00, 0),
  ('COMP-003', 'GUIA LATERAL 50MM - PERFIL ALUMÍNIO', 'Guia lateral', 'N/A', 'MT', 100, 5, 95.00, 0),
  ('COMP-004', 'SOLEIRA EM T - CHAPA 16MM', 'Soleira em T', 'N/A', 'MT', 100, 5, 78.00, 0),
  ('COMP-005', 'REFORÇO DA SOLEIRA EM T - 60x40', 'Reforço soleira', 'N/A', 'MT', 100, 5, 45.00, 0),
  ('COMP-006', 'PONTEIRA PARA SOLEIRA 40X60', 'Ponteira', 'N/A', 'UN', 100, 5, 18.00, 0),
  ('COMP-007', 'PVC AUTO LUBRIFICANTE PARA GUIAS', 'PVC guia', 'N/A', 'MT', 100, 5, 12.00, 0),
  ('COMP-008', 'ACABAMENTO EM BORRACHA P/ SOLEIRA', 'Borracha soleira', 'N/A', 'MT', 100, 5, 8.50, 0),
  ('COMP-009', 'PINTURA BRANCO LISO (ELETROSTÁTICA)', 'Pintura branco liso', 'N/A', 'M²', 100, 5, 45.00, 0),
  ('COMP-009-P', 'PINTURA PRETA FOSCO (ELETROSTÁTICA)', 'Pintura preta fosco', 'N/A', 'M²', 100, 5, 52.00, 0),
  ('COMP-009-C', 'PINTURA CINZA TEXTURIZADO (ELETROSTÁTICA)', 'Pintura cinza texturizado', 'N/A', 'M²', 100, 5, 58.00, 0),
  ('COMP-009-E', 'PINTURA COR ESPECIAL (ELETROSTÁTICA)', 'Pintura cor especial', 'N/A', 'M²', 100, 5, 65.00, 0),
  ('COMP-010-200',  'AUTOMATIZADOR 200KG',  'Motor 200kg',  'N/A', 'UN', 100, 5, 746.75, 0),
  ('COMP-010-300',  'AUTOMATIZADOR 300KG',  'Motor 300kg',  'N/A', 'UN', 100, 5, 762.64, 0),
  ('COMP-010-400',  'AUTOMATIZADOR 400KG',  'Motor 400kg',  'N/A', 'UN', 100, 5, 935.53, 0),
  ('COMP-010-500',  'AUTOMATIZADOR 500KG',  'Motor 500kg',  'N/A', 'UN', 100, 5, 1020.90, 0),
  ('COMP-010-800',  'AUTOMATIZADOR 800KG',  'Motor 800kg',  'N/A', 'UN', 100, 5, 1560.00, 0),
  ('COMP-010-1500', 'AUTOMATIZADOR 1500KG', 'Motor 1500kg', 'N/A', 'UN', 100, 5, 5375.35, 0),
  ('COMP-011', 'CONTROLE REMOTO ANALÓGICO', 'Controle remoto', 'N/A', 'UN', 100, 5, 89.90, 0),
  ('COMP-012', 'CENTRAL DE COMANDO ANALÓGICO', 'Central de comando', 'N/A', 'UN', 100, 5, 180.50, 0),
  ('ADIC-001', 'PORTINHOLA (porta de acesso integrada)', 'Portinhola', 'N/A', 'UN', 100, 5, 883.84, 0),
  ('ADIC-002', 'ALÇAPÃO (acesso na porta)', 'Alçapão', 'N/A', 'UN', 100, 5, 649.94, 0)
ON CONFLICT DO NOTHING;

-- Garante unicidade do SKU para podermos referenciar no trigger
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'estoque_codigo_sku_unique'
  ) THEN
    ALTER TABLE public.estoque ADD CONSTRAINT estoque_codigo_sku_unique UNIQUE (codigo_sku);
  END IF;
END $$;

-- 2) Trigger para abater estoque ao criar pedido de venda
CREATE OR REPLACE FUNCTION public.abater_estoque_pedido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  v_sku text;
  v_qtd numeric;
BEGIN
  IF NEW.itens IS NULL OR jsonb_typeof(NEW.itens) <> 'array' THEN
    RETURN NEW;
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(NEW.itens)
  LOOP
    v_sku := COALESCE(item->>'codigo_sku', item->>'code', item->>'sku');
    v_qtd := COALESCE((item->>'quantidade')::numeric, (item->>'qty')::numeric, 0);

    IF v_sku IS NOT NULL AND v_qtd > 0 THEN
      UPDATE public.estoque
        SET quantidade = GREATEST(quantidade - CEIL(v_qtd)::int, 0),
            data_atualizacao = now()
        WHERE codigo_sku = v_sku;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_abater_estoque_pedido ON public.pedidos_venda;
CREATE TRIGGER trg_abater_estoque_pedido
AFTER INSERT ON public.pedidos_venda
FOR EACH ROW
EXECUTE FUNCTION public.abater_estoque_pedido();
