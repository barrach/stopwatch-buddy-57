
-- Drop any existing triggers first
DROP TRIGGER IF EXISTS trg_set_dynamic_qty_base ON public.observacoes;
DROP TRIGGER IF EXISTS trg_recalculate_dynamic ON public.observacoes;
DROP TRIGGER IF EXISTS observacoes_reprocess ON public.observacoes;

-- BEFORE trigger: set quantidade_base on insert/update
CREATE TRIGGER trg_set_dynamic_qty_base
  BEFORE INSERT OR UPDATE ON public.observacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_dynamic_quantity_base();

-- AFTER trigger: recalculate all dynamic records for the day
CREATE TRIGGER trg_recalculate_dynamic
  AFTER INSERT OR UPDATE OR DELETE ON public.observacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalculate_dynamic();
