-- Restaurar quantidade original e desativar regravação de HH em observações dinâmicas

CREATE OR REPLACE FUNCTION public.recalculate_dynamic_observations(
  p_date date,
  p_obra_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN;
  END IF;

  UPDATE public.observacoes o
  SET quantidade_base = COALESCE(o.quantidade_base, o.quantidade, 1.00)
  WHERE o.data = p_date
    AND o.obra_id = p_obra_id
    AND o.deleted_at IS NULL;

  -- Mantém quantidade como valor original informado; HH será derivado apenas em leitura
  UPDATE public.observacoes o
  SET quantidade = COALESCE(o.quantidade_base, o.quantidade, 1.00)
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