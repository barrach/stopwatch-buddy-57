
-- 1. Change quantidade from integer to numeric(10,2) to support decimal values
ALTER TABLE public.observacoes ALTER COLUMN quantidade TYPE numeric(10,2);

-- 2. Create the recalculation function
CREATE OR REPLACE FUNCTION public.recalculate_dynamic_observations(p_date date, p_obra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  hh_total numeric;
  qty_total numeric;
  rec RECORD;
  new_qty numeric;
BEGIN
  -- Prevent recursive calls from the trigger
  IF pg_trigger_depth() > 1 THEN
    RETURN;
  END IF;

  -- Calculate HH total for the day/obra
  -- For dynamic records: weight = duracao_horas only (base qty is conceptually 1)
  -- For non-dynamic records: weight = quantidade * duracao_horas
  SELECT
    COALESCE(SUM(
      CASE
        WHEN is_dinamico = true AND descricao IN (
          'Aguardando Liberação de PT',
          'Fatores Climáticos e Consequências',
          'Interferências Operacionais'
        ) THEN COALESCE(duracao_horas, 1.0)
        ELSE quantidade * COALESCE(duracao_horas, 1.0)
      END
    ), 0),
    COALESCE(SUM(
      CASE
        WHEN is_dinamico = true AND descricao IN (
          'Aguardando Liberação de PT',
          'Fatores Climáticos e Consequências',
          'Interferências Operacionais'
        ) THEN 1
        ELSE quantidade
      END
    ), 0)
  INTO hh_total, qty_total
  FROM observacoes
  WHERE data = p_date
    AND obra_id = p_obra_id
    AND deleted_at IS NULL;

  -- Skip if no meaningful data
  IF hh_total <= 0 OR qty_total <= 0 THEN
    RETURN;
  END IF;

  -- Update each dynamic record with proportional quantity
  FOR rec IN
    SELECT id, duracao_horas
    FROM observacoes
    WHERE data = p_date
      AND obra_id = p_obra_id
      AND deleted_at IS NULL
      AND is_dinamico = true
      AND descricao IN (
        'Aguardando Liberação de PT',
        'Fatores Climáticos e Consequências',
        'Interferências Operacionais'
      )
  LOOP
    new_qty := ROUND((COALESCE(rec.duracao_horas, 1.0) / hh_total) * qty_total, 2);
    IF new_qty < 0.01 THEN
      new_qty := 0.01;
    END IF;
    UPDATE observacoes SET quantidade = new_qty WHERE id = rec.id;
  END LOOP;
END;
$$;

-- 3. Create trigger function
CREATE OR REPLACE FUNCTION public.trigger_recalculate_dynamic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Recalculate for the affected date/obra
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    PERFORM recalculate_dynamic_observations(OLD.data, OLD.obra_id);
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Avoid double-processing if same date/obra
    IF TG_OP = 'UPDATE' AND OLD.data = NEW.data AND OLD.obra_id = NEW.obra_id THEN
      -- Already processed above
      NULL;
    ELSE
      PERFORM recalculate_dynamic_observations(NEW.data, NEW.obra_id);
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4. Create the trigger (AFTER to ensure the row is committed first)
CREATE TRIGGER trg_recalculate_dynamic
  AFTER INSERT OR UPDATE OR DELETE ON public.observacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalculate_dynamic();
