-- Ensure original/base quantity is persisted before recalculation and trigger only recalculates after writes
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
    NEW.quantidade_base := COALESCE(NEW.quantidade_base, NEW.quantidade, 1.00);
  ELSE
    NEW.quantidade_base := COALESCE(NEW.quantidade, NEW.quantidade_base, 1.00);
  END IF;

  RETURN NEW;
END;
$$;

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

  IF TG_OP = 'UPDATE' THEN
    PERFORM public.recalculate_dynamic_observations(OLD.data, OLD.obra_id, OLD.contrato_id);
    IF OLD.data IS DISTINCT FROM NEW.data
       OR OLD.obra_id IS DISTINCT FROM NEW.obra_id
       OR OLD.contrato_id IS DISTINCT FROM NEW.contrato_id THEN
      PERFORM public.recalculate_dynamic_observations(NEW.data, NEW.obra_id, NEW.contrato_id);
    ELSE
      PERFORM public.recalculate_dynamic_observations(NEW.data, NEW.obra_id, NEW.contrato_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.recalculate_dynamic_observations(NEW.data, NEW.obra_id, NEW.contrato_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_dynamic_observations(OLD.data, OLD.obra_id, OLD.contrato_id);
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_set_dynamic_quantity_base ON public.observacoes;
CREATE TRIGGER trg_set_dynamic_quantity_base
BEFORE INSERT OR UPDATE ON public.observacoes
FOR EACH ROW
EXECUTE FUNCTION public.set_dynamic_quantity_base();

DROP TRIGGER IF EXISTS trg_recalculate_dynamic ON public.observacoes;
CREATE TRIGGER trg_recalculate_dynamic
AFTER INSERT OR UPDATE OR DELETE ON public.observacoes
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalculate_dynamic();

-- Re-run idempotent backfill after trigger fix
SELECT public.reprocess_all_dynamic_observations();