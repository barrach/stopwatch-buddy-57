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
       'Interferências Operacionais'
     ) THEN
    NEW.quantidade_base := COALESCE(NEW.quantidade_base, NEW.quantidade, 0.00);
    NEW.quantidade := COALESCE(NEW.quantidade, 0.00);
  ELSE
    NEW.quantidade_base := COALESCE(NEW.quantidade, NEW.quantidade_base, 0.00);
  END IF;

  RETURN NEW;
END;
$$;

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
        'Interferências Operacionais'
      )
      THEN COALESCE(o.quantidade_base, o.quantidade, 0.00)
    ELSE COALESCE(o.quantidade, o.quantidade_base, 0.00)
  END
  WHERE o.data = p_date
    AND o.obra_id = p_obra_id
    AND o.deleted_at IS NULL;
END;
$$;