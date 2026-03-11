-- Fix existing records: "Aguardando Liberação de PT" should point to NPE parent
UPDATE public.observacoes
SET categoria_id = '92c1d98a-2d55-4ff1-85f0-2f62f97927b2'
WHERE descricao = 'Aguardando Liberação de PT'
  AND categoria_id != '92c1d98a-2d55-4ff1-85f0-2f62f97927b2'
  AND deleted_at IS NULL;
