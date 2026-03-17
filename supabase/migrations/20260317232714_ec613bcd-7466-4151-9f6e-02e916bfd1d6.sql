
-- Drop unique on codigo alone (will use nome+obra_id instead)
ALTER TABLE public.rotas DROP CONSTRAINT rotas_codigo_key;

-- Add obra_id column
ALTER TABLE public.rotas ADD COLUMN obra_id uuid REFERENCES public.obras(id);

-- Insert new ROTA 1 for UNIPAR
INSERT INTO public.rotas (codigo, nome, obra_id, status, criado_por)
VALUES ('ROTA 1', 'ROTA 1', '24cf90a6-3091-43fb-8aa9-7c83879986d7', 'Ativo', NULL);

-- Assign existing ROTA 1 to NORMOM
UPDATE public.rotas 
SET obra_id = 'a632f48e-a51b-4136-85e6-61f3cc93c511'
WHERE id = '59ac9e01-0ccc-48d0-bcf0-ea72b698fb4c';

-- ROTA 2 - assign to UNIPAR
UPDATE public.rotas 
SET obra_id = '24cf90a6-3091-43fb-8aa9-7c83879986d7'
WHERE id = '8d40c3a9-706e-4d03-9d2f-755f612829e5';

-- Update observacoes: ROTA 1 records with UNIPAR obra → new rota
UPDATE public.observacoes 
SET rota_id = (
  SELECT id FROM public.rotas 
  WHERE nome = 'ROTA 1' AND obra_id = '24cf90a6-3091-43fb-8aa9-7c83879986d7'
  LIMIT 1
)
WHERE rota_id = '59ac9e01-0ccc-48d0-bcf0-ea72b698fb4c' 
  AND obra_id = '24cf90a6-3091-43fb-8aa9-7c83879986d7';

-- Fallback for any remaining rotas
UPDATE public.rotas 
SET obra_id = (SELECT id FROM public.obras ORDER BY nome LIMIT 1)
WHERE obra_id IS NULL;

-- Make obra_id NOT NULL
ALTER TABLE public.rotas ALTER COLUMN obra_id SET NOT NULL;

-- Add unique constraint on (nome, obra_id)
ALTER TABLE public.rotas ADD CONSTRAINT rotas_nome_obra_unique UNIQUE (nome, obra_id);
