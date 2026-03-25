-- Alinha o backfill global com a assinatura atual de recálculo por dia + obra
DROP FUNCTION IF EXISTS public.reprocess_all_dynamic_observations();

CREATE OR REPLACE FUNCTION public.reprocess_all_dynamic_observations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT DISTINCT data, obra_id
    FROM public.observacoes
    WHERE deleted_at IS NULL
  LOOP
    PERFORM public.recalculate_dynamic_observations(rec.data, rec.obra_id);
  END LOOP;
END;
$function$;