-- Corrige o recálculo contínuo das observações dinâmicas por dia + obra
-- Remove sobrecargas antigas e recria funções/triggers de forma determinística

DROP TRIGGER IF EXISTS trg_set_dynamic_qty_base ON public.observacoes;
DROP TRIGGER IF EXISTS trg_recalculate_dynamic ON public.observacoes;
DROP TRIGGER IF EXISTS observacoes_reprocess ON public.observacoes;

DROP FUNCTION IF EXISTS public.trigger_recalculate_dynamic();
DROP FUNCTION IF EXISTS public.recalculate_dynamic_observations(date, uuid);
DROP FUNCTION IF EXISTS public.recalculate_dynamic_observations(date, uuid, uuid);

CREATE OR REPLACE FUNCTION public.recalculate_dynamic_observations(
  p_date date,
  p_obra_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  hh_total numeric := 0;
  qty_total numeric := 0;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN;
  END IF;

  UPDATE public.observacoes o
  SET quantidade_base = COALESCE(o.quantidade_base, o.quantidade, 1.00)
  WHERE o.data = p_date
    AND o.obra_id = p_obra_id
    AND o.deleted_at IS NULL;

  SELECT
    COALESCE(SUM(COALESCE(quantidade_base, quantidade, 1.00) * COALESCE(duracao_horas, 1.0)), 0),
    COALESCE(SUM(COALESCE(quantidade_base, quantidade, 1.00)), 0)
  INTO hh_total, qty_total
  FROM public.observacoes
  WHERE data = p_date
    AND obra_id = p_obra_id
    AND deleted_at IS NULL;

  IF hh_total <= 0 OR qty_total <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.observacoes o
  SET quantidade = GREATEST(
    ROUND(
      ((COALESCE(o.quantidade_base, o.quantidade, 1.00) * COALESCE(o.duracao_horas, 1.0)) / hh_total) * qty_total,
      2
    ),
    0.01
  )
  WHERE o.data = p_date
    AND o.obra_id = p_obra_id
    AND o.deleted_at IS NULL
    AND o.is_dinamico = true
    AND o.descricao IN (
      'Aguardando Liberação de PT',
      'Fatores Climáticos e Consequências',
      'Interferências Operacionais'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_recalculate_dynamic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    PERFORM public.recalculate_dynamic_observations(OLD.data, OLD.obra_id);
    IF OLD.data IS DISTINCT FROM NEW.data OR OLD.obra_id IS DISTINCT FROM NEW.obra_id THEN
      PERFORM public.recalculate_dynamic_observations(NEW.data, NEW.obra_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.recalculate_dynamic_observations(NEW.data, NEW.obra_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_dynamic_observations(OLD.data, OLD.obra_id);
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE TRIGGER trg_set_dynamic_qty_base
  BEFORE INSERT OR UPDATE ON public.observacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_dynamic_quantity_base();

CREATE TRIGGER trg_recalculate_dynamic
  AFTER INSERT OR UPDATE OR DELETE ON public.observacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalculate_dynamic();