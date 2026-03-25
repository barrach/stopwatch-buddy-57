-- Persist base quantity used by dynamic recalculation
ALTER TABLE public.observacoes
ADD COLUMN IF NOT EXISTS quantidade_base numeric(10,2);

-- Seed base quantity for existing records
UPDATE public.observacoes
SET quantidade_base = CASE
  WHEN is_dinamico = true
   AND descricao IN (
     'Aguardando Liberação de PT',
     'Fatores Climáticos e Consequências',
     'Interferências Operacionais'
   )
    THEN COALESCE(quantidade_base, 1.00)
  ELSE COALESCE(quantidade_base, quantidade)
END
WHERE quantidade_base IS NULL;

ALTER TABLE public.observacoes
ALTER COLUMN quantidade_base SET DEFAULT 1.00;

UPDATE public.observacoes
SET quantidade_base = 1.00
WHERE is_dinamico = true
  AND descricao IN (
    'Aguardando Liberação de PT',
    'Fatores Climáticos e Consequências',
    'Interferências Operacionais'
  )
  AND deleted_at IS NULL;

-- Recalculate a single day/group using original base quantity for dynamic rows
CREATE OR REPLACE FUNCTION public.recalculate_dynamic_observations(
  p_date date,
  p_obra_id uuid,
  p_contrato_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  hh_total numeric := 0;
  qty_total numeric := 0;
BEGIN
  SELECT
    COALESCE(SUM(
      CASE
        WHEN is_dinamico = true
         AND descricao IN (
           'Aguardando Liberação de PT',
           'Fatores Climáticos e Consequências',
           'Interferências Operacionais'
         )
          THEN COALESCE(quantidade_base, 1.00) * COALESCE(duracao_horas, 1.0)
        ELSE quantidade * COALESCE(duracao_horas, 1.0)
      END
    ), 0),
    COALESCE(SUM(
      CASE
        WHEN is_dinamico = true
         AND descricao IN (
           'Aguardando Liberação de PT',
           'Fatores Climáticos e Consequências',
           'Interferências Operacionais'
         )
          THEN COALESCE(quantidade_base, 1.00)
        ELSE quantidade
      END
    ), 0)
  INTO hh_total, qty_total
  FROM public.observacoes
  WHERE data = p_date
    AND obra_id = p_obra_id
    AND contrato_id IS NOT DISTINCT FROM p_contrato_id
    AND deleted_at IS NULL;

  IF hh_total <= 0 OR qty_total <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.observacoes o
  SET quantidade = GREATEST(
    ROUND(
      (
        (COALESCE(o.quantidade_base, 1.00) * COALESCE(o.duracao_horas, 1.0))
        / hh_total
      ) * qty_total,
      2
    ),
    0.01
  )
  WHERE o.data = p_date
    AND o.obra_id = p_obra_id
    AND o.contrato_id IS NOT DISTINCT FROM p_contrato_id
    AND o.deleted_at IS NULL
    AND o.is_dinamico = true
    AND o.descricao IN (
      'Aguardando Liberação de PT',
      'Fatores Climáticos e Consequências',
      'Interferências Operacionais'
    );
END;
$$;

-- Global idempotent backfill
CREATE OR REPLACE FUNCTION public.reprocess_all_dynamic_observations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT DISTINCT data, obra_id, contrato_id
    FROM public.observacoes
    WHERE deleted_at IS NULL
  LOOP
    PERFORM public.recalculate_dynamic_observations(rec.data, rec.obra_id, rec.contrato_id);
  END LOOP;
END;
$$;

-- Trigger keeps quantidade_base in sync and recalculates affected groups
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

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    NEW.quantidade_base := CASE
      WHEN NEW.is_dinamico = true
       AND NEW.descricao IN (
         'Aguardando Liberação de PT',
         'Fatores Climáticos e Consequências',
         'Interferências Operacionais'
       )
        THEN COALESCE(NEW.quantidade_base, NEW.quantidade, 1.00)
      ELSE COALESCE(NEW.quantidade, NEW.quantidade_base, 1.00)
    END;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    PERFORM public.recalculate_dynamic_observations(OLD.data, OLD.obra_id, OLD.contrato_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_dynamic_observations(OLD.data, OLD.obra_id, OLD.contrato_id);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.recalculate_dynamic_observations(NEW.data, NEW.obra_id, NEW.contrato_id);
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_dynamic ON public.observacoes;

CREATE TRIGGER trg_recalculate_dynamic
AFTER INSERT OR UPDATE OR DELETE ON public.observacoes
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalculate_dynamic();

-- Run backfill after function update
SELECT public.reprocess_all_dynamic_observations();