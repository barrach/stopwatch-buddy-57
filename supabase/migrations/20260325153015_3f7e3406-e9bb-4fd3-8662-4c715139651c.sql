-- Update the DB function to match BOTH legacy and new description names
CREATE OR REPLACE FUNCTION public.recalculate_dynamic_observations(p_date date, p_obra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN;
  END IF;

  UPDATE public.observacoes o
  SET quantidade_base = CASE
    WHEN o.is_dinamico = true
      AND o.descricao IN (
        'Aguardando Liberação de PT',
        'Fatores Climáticos e Consequências',
        'Interferências Operacionais',
        'Causas Naturais',
        'Causas Naturais / Clima',
        'Causas naturais',
        'Vazamento / Interferência da Planta',
        'Vazamento/Interferência',
        'Vazamento / Interferência'
      )
      THEN COALESCE(o.quantidade_base, o.quantidade, 0.00)
    ELSE COALESCE(o.quantidade, o.quantidade_base, 0.00)
  END
  WHERE o.data = p_date
    AND o.obra_id = p_obra_id
    AND o.deleted_at IS NULL;
END;
$$;

-- Update the trigger function to also match legacy names
CREATE OR REPLACE FUNCTION public.set_dynamic_quantity_base()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_dinamico = true
     AND NEW.descricao IN (
       'Aguardando Liberação de PT',
       'Fatores Climáticos e Consequências',
       'Interferências Operacionais',
       'Causas Naturais',
       'Causas Naturais / Clima',
       'Causas naturais',
       'Vazamento / Interferência da Planta',
       'Vazamento/Interferência',
       'Vazamento / Interferência'
     ) THEN
    NEW.quantidade_base := COALESCE(NEW.quantidade_base, NEW.quantidade, 0.00);
    NEW.quantidade := COALESCE(NEW.quantidade, 0.00);
  ELSE
    NEW.quantidade_base := COALESCE(NEW.quantidade, NEW.quantidade_base, 0.00);
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill: normalize all legacy description names to current official names
UPDATE public.observacoes SET descricao = 'Fatores Climáticos e Consequências'
WHERE descricao IN ('Causas Naturais', 'Causas Naturais / Clima', 'Causas naturais')
  AND deleted_at IS NULL;

UPDATE public.observacoes SET descricao = 'Interferências Operacionais'
WHERE descricao IN ('Vazamento / Interferência da Planta', 'Vazamento/Interferência', 'Vazamento / Interferência')
  AND deleted_at IS NULL;

UPDATE public.observacoes SET descricao = 'Assistindo / Stand By'
WHERE descricao IN ('Aguardando Movimentação de Carga', 'Aguardando movimentação de carga', 'Assistindo')
  AND deleted_at IS NULL;