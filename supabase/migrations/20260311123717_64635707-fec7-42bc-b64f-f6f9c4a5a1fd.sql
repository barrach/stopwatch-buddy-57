
-- Move "Aguardando Liberação de PT" from Suplementar to Não Produtivo Externo
UPDATE public.categorias_observacao
SET categoria_pai_id = '92c1d98a-2d55-4ff1-85f0-2f62f97927b2',
    impacta_produtividade = false,
    codigo = 'NPE-03'
WHERE id = 'a5ddf94c-7500-47e2-bf18-3c1a81fe5f3c';

-- Delete "Cliente" (replaced by Aguardando Liberação de PT)
DELETE FROM public.categorias_observacao
WHERE id = 'b6c1bf4b-1d98-49f7-a8b5-9490d57e44ad';
