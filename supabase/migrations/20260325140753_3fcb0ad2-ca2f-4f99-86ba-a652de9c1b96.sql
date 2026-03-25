-- Corrige o recálculo das observações dinâmicas já salvas
-- Regra: HH_total do dia considera todos os registros; total_amostras usa apenas registros manuais

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
  total_amostras_manuais numeric := 0;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN;
  END IF;

  UPDATE public.observacoes o
  SET quantidade_base = COALESCE(o.quantidade_base, o.quantidade, 1.00)
  WHERE o.data = p_date
    AND o.obra_id = p_obra_id
    AND o.deleted_at IS NULL;

  SELECT COALESCE(SUM(COALESCE(o.quantidade_base, o.quantidade, 1.00) * COALESCE(o.duracao_horas, 1.0)), 0)
  INTO hh_total
  FROM public.observacoes o
  WHERE o.data = p_date
    AND o.obra_id = p_obra_id
    AND o.deleted_at IS NULL;

  SELECT COALESCE(SUM(COALESCE(o.quantidade_base, o.quantidade, 1.00)), 0)
  INTO total_amostras_manuais
  FROM public.observacoes o
  WHERE o.data = p_date
    AND o.obra_id = p_obra_id
    AND o.deleted_at IS NULL
    AND NOT (
      o.is_dinamico = true
      AND o.descricao IN (
        'Aguardando Liberação de PT',
        'Fatores Climáticos e Consequências',
        'Interferências Operacionais'
      )
    );

  IF hh_total <= 0 OR total_amostras_manuais < 0 THEN
    RETURN;
  END IF;

  UPDATE public.observacoes o
  SET quantidade = GREATEST(
    ROUND(
      ((COALESCE(o.quantidade_base, o.quantidade, 1.00) * COALESCE(o.duracao_horas, 1.0)) / NULLIF(hh_total, 0)) * total_amostras_manuais,
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